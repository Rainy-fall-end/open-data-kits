import {
  formatUsdMicros,
  MAX_RESPONSE_BYTES,
  parseUsdMicros,
} from './config.js';
import { OpenGovError } from './errors.js';

export const APIFY_BASE_URL = 'https://api.apify.com';
export const USER_AGENT = 'mcp-server-open-gov-data/0.1.0 (Node.js)';

function requireCredential(value, provider) {
  if (value === undefined) {
    throw new OpenGovError(
      'CREDENTIAL_MISSING',
      `${provider === 'apify' ? 'APIFY_TOKEN' : 'RAPIDAPI_KEY'} is not configured`,
    );
  }
  return value;
}

async function cancelBody(response) {
  try {
    await response.body?.cancel();
  } catch {
    // Cleanup errors are deliberately discarded and never reach MCP output.
  }
}

async function readLimitedBody(response) {
  const length = response.headers.get('content-length');
  if (/^\d+$/.test(length || '') && BigInt(length) > BigInt(MAX_RESPONSE_BYTES)) {
    await cancelBody(response);
    throw new OpenGovError('RESPONSE_TOO_LARGE', 'Upstream response exceeded the size limit');
  }
  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        try {
          await reader.cancel();
        } catch {
          // Cleanup errors are deliberately discarded.
        }
        throw new OpenGovError('RESPONSE_TOO_LARGE', 'Upstream response exceeded the size limit');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

async function fetchJson(url, requestOptions, config, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== 'function') {
    throw new OpenGovError('NETWORK_ERROR', 'Fetch implementation is unavailable');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  timer.unref?.();
  try {
    const response = await fetchImpl(url, {
      ...requestOptions,
      redirect: 'manual',
      signal: controller.signal,
    });
    if (response.status >= 300 && response.status < 400) {
      await cancelBody(response);
      throw new OpenGovError(
        'REDIRECT_BLOCKED',
        'Upstream redirect was blocked',
        { statusCode: response.status },
      );
    }
    if (!response.ok) {
      await cancelBody(response);
      throw new OpenGovError(
        `HTTP_${response.status}`,
        `Upstream request failed with HTTP ${response.status}`,
        { statusCode: response.status },
      );
    }
    if (response.status === 204) return null;

    const bytes = await readLimitedBody(response);
    if (bytes.byteLength === 0) return null;
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      return JSON.parse(text);
    } catch (error) {
      if (error instanceof OpenGovError) throw error;
      throw new OpenGovError('RESPONSE_INVALID', 'Upstream returned invalid JSON');
    }
  } catch (error) {
    if (error instanceof OpenGovError) throw error;
    if (controller.signal.aborted || error?.name === 'AbortError' || error?.name === 'TimeoutError') {
      throw new OpenGovError('TIMEOUT', 'Upstream request timed out');
    }
    throw new OpenGovError('NETWORK_ERROR', 'Upstream network request failed');
  } finally {
    clearTimeout(timer);
  }
}

function resultEnvelope(definition, data, extras = {}) {
  return {
    provider: definition.provider,
    source: definition.source,
    ...extras,
    data,
  };
}

async function runApifyActor(definition, args, config, fetchImpl) {
  const token = requireCredential(config.apifyToken, 'apify');
  const chargeMicros = args.maxTotalChargeUsd === undefined
    ? config.defaultChargeMicros
    : parseUsdMicros(args.maxTotalChargeUsd, 'maxTotalChargeUsd');
  if (chargeMicros > config.hardChargeMicros) {
    throw new OpenGovError(
      'COST_LIMIT_EXCEEDED',
      'Requested Apify charge cap exceeds the environment hard limit',
    );
  }

  const actorInput = { ...args };
  delete actorInput.maxTotalChargeUsd;
  actorInput.maxItems = args.maxItems ?? 10;

  const baseUrl = config.apifyBaseUrl || APIFY_BASE_URL;
  const url = new URL(
    `/v2/acts/${encodeURIComponent(definition.actorId)}/run-sync-get-dataset-items`,
    baseUrl,
  );
  const charge = formatUsdMicros(chargeMicros);
  url.searchParams.set('maxTotalChargeUsd', charge);
  url.searchParams.set('clean', 'true');

  const data = await fetchJson(url, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'accept-encoding': 'identity',
      authorization: `Bearer ${token}`,
      'content-type': 'application/json; charset=utf-8',
      'user-agent': USER_AGENT,
    },
    body: JSON.stringify(actorInput),
  }, config, fetchImpl);

  return resultEnvelope(definition, data, {
    actorId: definition.actorId,
    maxTotalChargeUsd: charge,
  });
}

async function queryRapidApi(definition, args, config, fetchImpl) {
  const key = requireCredential(config.rapidApiKey, 'rapidapi');
  const baseUrl = config.rapidApiBaseUrl || `https://${definition.host}`;
  const url = new URL(definition.path, baseUrl);
  const query = { ...args, limit: args.limit ?? 5 };
  for (const [name, value] of Object.entries(query)) {
    url.searchParams.set(name, String(value));
  }

  const data = await fetchJson(url, {
    method: 'GET',
    headers: {
      accept: 'application/json',
      'accept-encoding': 'identity',
      'user-agent': USER_AGENT,
      'x-rapidapi-host': definition.host,
      'x-rapidapi-key': key,
    },
  }, config, fetchImpl);

  return resultEnvelope(definition, data, { apiSlug: definition.apiSlug });
}

export async function executeTool(definition, args, config, options = {}) {
  if (definition.provider === 'apify') {
    return runApifyActor(definition, args, config, options.fetch);
  }
  if (definition.provider === 'rapidapi') {
    return queryRapidApi(definition, args, config, options.fetch);
  }
  throw new OpenGovError('INTERNAL_ERROR', 'Tool provider is invalid');
}

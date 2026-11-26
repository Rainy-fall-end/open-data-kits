import { APIFY_ACTOR_IDS, RAPIDAPI_HOSTS, RAPIDAPI_SLUGS } from './catalog.js';
import { formatUsdMicros, MAX_RESPONSE_BYTES, parseUsdMicros } from './config.js';
import { OpenGovError } from './errors.js';

export const APIFY_BASE_URL = 'https://api.apify.com';
export const USER_AGENT = 'mcp-server-open-gov-data/0.2.0 (Node.js)';

const RAPIDAPI_ROUTES = new Map([
  [RAPIDAPI_HOSTS[0], { slug: RAPIDAPI_SLUGS[0], path: '/v1/sec-edgar/filings' }],
  [RAPIDAPI_HOSTS[1], { slug: RAPIDAPI_SLUGS[1], path: '/v1/clinical-trials/studies' }],
  [RAPIDAPI_HOSTS[2], { slug: RAPIDAPI_SLUGS[2], path: '/v1/openfda/records' }],
  [RAPIDAPI_HOSTS[3], { slug: RAPIDAPI_SLUGS[3], path: '/v1/sg-green-mark/certificates' }],
]);

function requireCredential(value, provider) {
  if (value === undefined) {
    throw new OpenGovError(
      'CREDENTIAL_MISSING',
      `${provider === 'apify' ? 'APIFY_TOKEN' : 'RAPIDAPI_KEY'} is not configured`,
    );
  }
  return value;
}

function redactData(data, config) {
  if (data === undefined) return undefined;
  let serialized = JSON.stringify(data);
  for (const secret of [config.apifyToken, config.rapidApiKey]) {
    if (!secret) continue;
    const encodedSecret = JSON.stringify(secret).slice(1, -1);
    serialized = serialized.split(encodedSecret).join('[REDACTED]');
  }
  return JSON.parse(serialized);
}

async function cancelBody(response) {
  try {
    await response.body?.cancel();
  } catch {
    // Cleanup failures never reach protocol output.
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
          // Cleanup failures are discarded.
        }
        throw new OpenGovError('RESPONSE_TOO_LARGE', 'Upstream response exceeded the size limit');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
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
    } catch {
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

function resultEnvelope(definition, data, config, extras = {}) {
  return redactData({
    provider: definition.provider,
    source: definition.source,
    ...extras,
    data,
  }, config);
}

async function runApifyActor(definition, args, config, fetchImpl) {
  if (!APIFY_ACTOR_IDS.includes(definition.actorId)) {
    throw new OpenGovError('DESTINATION_BLOCKED', 'Actor destination is not allowlisted');
  }
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

  const actorInput = { ...args, maxItems: args.maxItems ?? 10 };
  delete actorInput.maxTotalChargeUsd;
  const url = new URL(
    `/v2/acts/${encodeURIComponent(definition.actorId)}/run-sync-get-dataset-items`,
    config.apifyBaseUrl || APIFY_BASE_URL,
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
  return resultEnvelope(definition, data, config, {
    actorId: definition.actorId,
    maxTotalChargeUsd: charge,
  });
}

async function queryRapidApi(definition, args, config, fetchImpl) {
  const route = RAPIDAPI_ROUTES.get(definition.host);
  if (
    !route
    || route.slug !== definition.apiSlug
    || route.path !== definition.path
  ) {
    throw new OpenGovError('DESTINATION_BLOCKED', 'RapidAPI destination is not allowlisted');
  }
  const key = requireCredential(config.rapidApiKey, 'rapidapi');
  const url = new URL(
    definition.path,
    config.rapidApiBaseUrl || `https://${definition.host}`,
  );
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
  return resultEnvelope(definition, data, config, { apiSlug: definition.apiSlug });
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

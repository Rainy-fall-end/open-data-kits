import { inspect } from 'node:util';

import { APIFY_SOURCES, RAPIDAPI_SOURCES } from './catalog.js';
import { OpenGovDataError } from './errors.js';
import { APIFY_INPUT_SCHEMAS, RAPIDAPI_QUERY_SCHEMAS } from './schemas.js';
import {
  MAX_RESPONSE_BYTES,
  compareMaxTotalChargeUsd,
  parseInput,
  rapidApiQueryValue,
  validateAgainstSchema,
  validateCredential,
  validateMaxItems,
  validateMaxTotalChargeUsd,
  validateTimeoutMs,
} from './validation.js';

export const APIFY_BASE_URL = 'https://api.apify.com';
export const USER_AGENT = 'open-gov-data/0.2.0 (Node.js)';

const CUSTOM_INSPECT = inspect.custom;
const LOOPBACK_HOSTS = new Set(['127.0.0.1', '[::1]', 'localhost']);

const TYPED_ACTOR_SOURCES = Object.freeze({
  atsJobsHiringSignals: 'atsJobsHiringSignals',
  secEdgarIntelligence: 'secEdgar',
  globalPublicTenders: 'globalPublicTenders',
  pharmaPipelineIntelligence: 'pharmaPipelineIntelligence',
  usaspendingContracts: 'usaspendingContracts',
  clinicalTrials: 'clinicalTrials',
  ukGovTenders: 'ukGovTenders',
  sgGreenMark: 'singaporeGreenMark',
});

const TYPED_RAPIDAPI_SOURCES = Object.freeze({
  secEdgarCorporateFilings: 'secEdgar',
  clinicaltrialsStudies: 'clinicalTrials',
  openfdaRecalls: 'openFda',
  sgGreenMarkBuildings: 'singaporeGreenMark',
});

function endpointError() {
  return new OpenGovDataError(
    'ENDPOINT_INVALID',
    'Endpoint overrides are restricted to local loopback testing',
  );
}

function validateLoopbackBaseUrl(value, { allowApifyProduction = false } = {}) {
  if (typeof value !== 'string') throw endpointError();
  let url;
  try {
    url = new URL(value);
  } catch {
    throw endpointError();
  }
  const rootOnly = url.pathname === '/' && !url.search && !url.hash;
  const noUserInfo = !url.username && !url.password;
  const isProduction = allowApifyProduction && url.origin === APIFY_BASE_URL;
  const isLoopback = (
    (url.protocol === 'http:' || url.protocol === 'https:')
    && LOOPBACK_HOSTS.has(url.hostname)
    && url.port.length > 0
  );
  if (!rootOnly || !noUserInfo || (!isProduction && !isLoopback)) throw endpointError();
  return url.origin;
}

function validateSource(catalog, source) {
  if (typeof source !== 'string' || !Object.hasOwn(catalog, source)) {
    throw new OpenGovDataError('SOURCE_NOT_ALLOWED', 'Source is not allowed');
  }
  return catalog[source];
}

function validateOptionsObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new OpenGovDataError('CONFIG_INVALID', 'Client options must be an object');
  }
  return value;
}

function appendRapidApiQuery(url, input) {
  for (const [key, value] of Object.entries(input)) {
    const serialized = rapidApiQueryValue(value);
    if (serialized !== null) url.searchParams.set(key, serialized);
  }
}

async function cancelBody(response) {
  try {
    await response.body?.cancel();
  } catch {
    // Transport cleanup failures never replace the stable public error.
  }
}

async function readLimitedBody(response) {
  const lengthHeader = response.headers.get('content-length');
  if (/^\d+$/.test(lengthHeader || '') && BigInt(lengthHeader) > BigInt(MAX_RESPONSE_BYTES)) {
    await cancelBody(response);
    throw new OpenGovDataError(
      'RESPONSE_TOO_LARGE',
      'Upstream response exceeded the size limit',
    );
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
          // Transport cleanup failures never replace the stable public error.
        }
        throw new OpenGovDataError(
          'RESPONSE_TOO_LARGE',
          'Upstream response exceeded the size limit',
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const payload = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    payload.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return payload;
}

export function extractRecords(payload) {
  if (Array.isArray(payload)) return [...payload];
  if (payload && typeof payload === 'object') {
    for (const key of ['items', 'results', 'records', 'data']) {
      if (Array.isArray(payload[key])) return [...payload[key]];
    }
    return [payload];
  }
  if (payload === null || payload === undefined) return [];
  return [{ value: payload }];
}

export class OpenGovDataClient {
  #apifyToken;
  #rapidApiKey;
  #maxTotalChargeUsd;
  #timeoutMs;
  #apifyBaseUrl;
  #rapidApiBaseUrl;

  constructor(options = {}) {
    const config = validateOptionsObject(options);
    const {
      apifyToken,
      rapidApiKey,
      maxTotalChargeUsd = '0.25',
      timeoutMs = 30_000,
      testing,
    } = config;

    this.#apifyToken = apifyToken === undefined
      ? undefined
      : validateCredential('apify', apifyToken);
    this.#rapidApiKey = rapidApiKey === undefined
      ? undefined
      : validateCredential('rapidapi', rapidApiKey);
    this.#maxTotalChargeUsd = validateMaxTotalChargeUsd(maxTotalChargeUsd);
    this.#timeoutMs = validateTimeoutMs(timeoutMs);
    this.#apifyBaseUrl = APIFY_BASE_URL;
    this.#rapidApiBaseUrl = undefined;

    if (testing !== undefined) {
      const testConfig = validateOptionsObject(testing);
      if (testConfig.apifyBaseUrl !== undefined) {
        this.#apifyBaseUrl = validateLoopbackBaseUrl(testConfig.apifyBaseUrl, {
          allowApifyProduction: true,
        });
      }
      if (testConfig.rapidApiBaseUrl !== undefined) {
        this.#rapidApiBaseUrl = validateLoopbackBaseUrl(testConfig.rapidApiBaseUrl);
      }
    }
    Object.freeze(this);
  }

  static fromEnv(options = {}) {
    const config = validateOptionsObject(options);
    const { env = process.env, ...clientOptions } = config;
    if (env === null || typeof env !== 'object' || Array.isArray(env)) {
      throw new OpenGovDataError('CONFIG_INVALID', 'Environment must be an object');
    }
    return new OpenGovDataClient({
      ...clientOptions,
      apifyToken: env.APIFY_TOKEN,
      rapidApiKey: env.RAPIDAPI_KEY || env.X_RAPIDAPI_KEY || env['X-RapidAPI-Key'],
    });
  }

  get maxTotalChargeUsd() {
    return this.#maxTotalChargeUsd;
  }

  get timeoutMs() {
    return this.#timeoutMs;
  }

  get apifyConfigured() {
    return this.#apifyToken !== undefined;
  }

  get rapidApiConfigured() {
    return this.#rapidApiKey !== undefined;
  }

  toJSON() {
    return {
      name: 'OpenGovDataClient',
      apifyConfigured: this.apifyConfigured,
      rapidApiConfigured: this.rapidApiConfigured,
      maxTotalChargeUsd: this.#maxTotalChargeUsd,
      timeoutMs: this.#timeoutMs,
    };
  }

  [CUSTOM_INSPECT]() {
    return `OpenGovDataClient ${inspect(this.toJSON(), { colors: false, compact: true })}`;
  }

  async request(provider, source, requestInput = {}, options = {}) {
    if (provider === 'apify') {
      return this.runActor(source, requestInput, options);
    }
    if (provider === 'rapidapi') {
      if (options?.maxTotalChargeUsd !== undefined) {
        throw new OpenGovDataError(
          'COST_LIMIT_UNSUPPORTED',
          'RapidAPI does not expose a per-request dollar cap; use maxItems',
        );
      }
      return this.queryRapidApi(source, requestInput, options);
    }
    throw new OpenGovDataError('PROVIDER_NOT_ALLOWED', 'Provider is not allowed');
  }

  async records(provider, source, requestInput = {}, options = {}) {
    return extractRecords(await this.request(provider, source, requestInput, options));
  }

  async runActor(source, actorInput = {}, options = {}) {
    const definition = validateSource(APIFY_SOURCES, source);
    const input = parseInput(actorInput);
    const maxItems = validateMaxItems(options?.maxItems ?? 10);
    return this.#runActorRequest(definition, input, maxItems, options?.maxTotalChargeUsd);
  }

  async queryRapidApi(source, query = {}, options = {}) {
    if (options?.maxTotalChargeUsd !== undefined) {
      throw new OpenGovDataError(
        'COST_LIMIT_UNSUPPORTED',
        'RapidAPI does not expose a per-request dollar cap; use maxItems',
      );
    }
    const definition = validateSource(RAPIDAPI_SOURCES, source);
    const input = parseInput(query);
    const maxItems = validateMaxItems(options?.maxItems ?? 10);
    const credential = validateCredential('rapidapi', this.#rapidApiKey);
    delete input.limit;
    delete input.maxItems;

    const baseUrl = this.#rapidApiBaseUrl || `https://${definition.host}`;
    const url = new URL(definition.path, baseUrl);
    appendRapidApiQuery(url, input);
    url.searchParams.set('limit', String(maxItems));

    return this.#fetchJson(url, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        'user-agent': USER_AGENT,
        'x-rapidapi-host': definition.host,
        'x-rapidapi-key': credential,
      },
    });
  }

  async atsJobsHiringSignals(input = {}, options = {}) {
    return this.#runTypedActor('atsJobsHiringSignals', input, options);
  }

  async secEdgarIntelligence(input = {}, options = {}) {
    return this.#runTypedActor('secEdgarIntelligence', input, options);
  }

  async globalPublicTenders(input = {}, options = {}) {
    return this.#runTypedActor('globalPublicTenders', input, options);
  }

  async pharmaPipelineIntelligence(input = {}, options = {}) {
    return this.#runTypedActor('pharmaPipelineIntelligence', input, options);
  }

  async usaspendingContracts(input = {}, options = {}) {
    return this.#runTypedActor('usaspendingContracts', input, options);
  }

  async clinicalTrials(input = {}, options = {}) {
    return this.#runTypedActor('clinicalTrials', input, options);
  }

  async ukGovTenders(input = {}, options = {}) {
    return this.#runTypedActor('ukGovTenders', input, options);
  }

  async sgGreenMark(input = {}, options = {}) {
    return this.#runTypedActor('sgGreenMark', input, options);
  }

  async secEdgarCorporateFilings(query = {}, options = {}) {
    return this.#runTypedRapidApi('secEdgarCorporateFilings', query, options);
  }

  async clinicaltrialsStudies(query = {}, options = {}) {
    return this.#runTypedRapidApi('clinicaltrialsStudies', query, options);
  }

  async openfdaRecalls(query = {}, options = {}) {
    return this.#runTypedRapidApi('openfdaRecalls', query, options);
  }

  async sgGreenMarkBuildings(query = {}, options = {}) {
    return this.#runTypedRapidApi('sgGreenMarkBuildings', query, options);
  }

  async #runTypedActor(method, actorInput, options) {
    const source = TYPED_ACTOR_SOURCES[method];
    const definition = validateSource(APIFY_SOURCES, source);
    const schema = APIFY_INPUT_SCHEMAS[method];
    const input = parseInput(actorInput);
    validateAgainstSchema(input, schema, { rejectUnknown: true });
    const maxItems = options?.maxItems ?? input.maxItems ?? schema.properties.maxItems.default;
    const completeInput = { ...input, maxItems };
    validateAgainstSchema(completeInput, schema, { rejectUnknown: true });
    return this.#runActorRequest(
      definition,
      completeInput,
      maxItems,
      options?.maxTotalChargeUsd,
    );
  }

  async #runTypedRapidApi(method, query, options) {
    const source = TYPED_RAPIDAPI_SOURCES[method];
    const schema = RAPIDAPI_QUERY_SCHEMAS[method];
    const input = parseInput(query);
    validateAgainstSchema(input, schema, { rejectUnknown: true });
    const maxItems = options?.maxItems ?? input.limit ?? schema.properties.limit.default;
    validateAgainstSchema({ ...input, limit: maxItems }, schema, { rejectUnknown: true });
    delete input.limit;
    return this.queryRapidApi(source, input, { ...options, maxItems });
  }

  async #runActorRequest(definition, actorInput, maxItems, requestedChargeCap) {
    const credential = validateCredential('apify', this.#apifyToken);
    const chargeCap = validateMaxTotalChargeUsd(
      requestedChargeCap ?? this.#maxTotalChargeUsd,
    );
    if (compareMaxTotalChargeUsd(chargeCap, this.#maxTotalChargeUsd) > 0) {
      throw new OpenGovDataError(
        'COST_LIMIT_EXCEEDED',
        'Per-request charge cap cannot exceed the client hard limit',
      );
    }

    const input = { ...actorInput };
    delete input.maxItems;
    delete input.maxTotalChargeUsd;
    input.maxItems = maxItems;

    const url = new URL(
      `/v2/acts/${encodeURIComponent(definition.actorId)}/run-sync-get-dataset-items`,
      this.#apifyBaseUrl,
    );
    url.searchParams.set('maxTotalChargeUsd', chargeCap);
    url.searchParams.set('clean', 'true');

    return this.#fetchJson(url, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${credential}`,
        'content-type': 'application/json; charset=utf-8',
        'user-agent': USER_AGENT,
      },
      body: JSON.stringify(input),
    });
  }

  async #fetchJson(url, requestOptions) {
    if (typeof globalThis.fetch !== 'function') {
      throw new OpenGovDataError('NETWORK_ERROR', 'Fetch implementation is unavailable');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#timeoutMs);
    timer.unref?.();
    try {
      const response = await globalThis.fetch(url, {
        ...requestOptions,
        redirect: 'manual',
        signal: controller.signal,
      });
      if (response.status >= 300 && response.status < 400) {
        await cancelBody(response);
        throw new OpenGovDataError(
          'REDIRECT_BLOCKED',
          'Upstream redirect was blocked',
          { statusCode: response.status },
        );
      }
      if (!response.ok) {
        await cancelBody(response);
        throw new OpenGovDataError(
          `HTTP_${response.status}`,
          `Upstream request failed with HTTP ${response.status}`,
          { statusCode: response.status },
        );
      }
      if (response.status === 204) return null;

      const payload = await readLimitedBody(response);
      if (payload.byteLength === 0) return null;
      try {
        const text = new TextDecoder('utf-8', { fatal: true }).decode(payload);
        return JSON.parse(text);
      } catch {
        throw new OpenGovDataError(
          'RESPONSE_INVALID',
          'Upstream returned invalid JSON',
        );
      }
    } catch (error) {
      if (error instanceof OpenGovDataError) throw error;
      if (controller.signal.aborted || error?.name === 'AbortError' || error?.name === 'TimeoutError') {
        throw new OpenGovDataError('TIMEOUT', 'Upstream request timed out');
      }
      throw new OpenGovDataError('NETWORK_ERROR', 'Upstream network request failed');
    } finally {
      clearTimeout(timer);
    }
  }
}

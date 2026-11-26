import { randomBytes } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import {
  appendFile,
  lstat,
  mkdir,
  open,
  realpath,
} from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const MAX_BUDGET_USD = 5;
const DEFAULT_BUDGET_USD = 0.25;
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
const MAX_INPUT_JSON_BYTES = 64 * 1024;

export const TARGETS = Object.freeze({
  'apify-sec-edgar': Object.freeze({
    provider: 'apify',
    actorId: '8LFIbRbidiHPknMz5',
    label: 'SEC EDGAR',
  }),
  'apify-clinicaltrials': Object.freeze({
    provider: 'apify',
    actorId: 'KchE3qKKrwU0rCe9f',
    label: 'ClinicalTrials.gov',
  }),
  'apify-uk-gov-tenders': Object.freeze({
    provider: 'apify',
    actorId: 'txnvyTckeQx4hVBc6',
    label: 'UK Government Tenders',
  }),
  'apify-sg-green-mark': Object.freeze({
    provider: 'apify',
    actorId: 'Z3ioK0wOAeczj6nCx',
    label: 'Singapore BCA Green Mark',
  }),
  'rapidapi-sec-edgar-corporate-filings': Object.freeze({
    provider: 'rapidapi',
    apiSlug: 'sec-edgar-corporate-filings',
    host: 'sec-edgar-corporate-filings.p.rapidapi.com',
    label: 'SEC EDGAR Corporate Filings',
  }),
  'rapidapi-clinicaltrials-gov-studies-trials': Object.freeze({
    provider: 'rapidapi',
    apiSlug: 'clinicaltrials-gov-studies-trials',
    host: 'clinicaltrials-gov-studies-trials.p.rapidapi.com',
    label: 'ClinicalTrials.gov Studies & Trials',
  }),
  'rapidapi-openfda-recalls-enforcement-approvals': Object.freeze({
    provider: 'rapidapi',
    apiSlug: 'openfda-recalls-enforcement-approvals',
    host: 'openfda-recalls-enforcement-approvals.p.rapidapi.com',
    label: 'openFDA Recalls, Enforcement & Approvals',
  }),
  'rapidapi-singapore-bca-green-mark-buildings': Object.freeze({
    provider: 'rapidapi',
    apiSlug: 'singapore-bca-green-mark-buildings',
    host: 'singapore-bca-green-mark-buildings.p.rapidapi.com',
    label: 'Singapore BCA Green Mark Buildings',
  }),
});

export class ActionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ActionError';
  }
}

function input(env, name, fallback = '') {
  const value = env[`INPUT_${name.toUpperCase()}`];
  return value === undefined ? fallback : String(value).trim();
}

function parseInteger(name, raw, minimum, maximum) {
  if (!/^\d+$/u.test(raw)) {
    throw new ActionError(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new ActionError(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

function parseBudget(raw) {
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/u.test(raw)) {
    throw new ActionError('max_total_charge_usd must be a positive decimal no greater than 5.00');
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0 || value > MAX_BUDGET_USD) {
    throw new ActionError('max_total_charge_usd must be greater than 0 and no greater than 5.00');
  }
  return value;
}

function formatBudget(value) {
  return value.toFixed(4).replace(/0+$/u, '').replace(/\.$/u, '');
}

function parseBoolean(name, raw) {
  const normalized = raw.toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  throw new ActionError(`${name} must be true or false`);
}

function parseInputJson(raw) {
  if (Buffer.byteLength(raw, 'utf8') > MAX_INPUT_JSON_BYTES) {
    throw new ActionError(`input_json exceeds ${MAX_INPUT_JSON_BYTES} bytes`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ActionError('input_json must be valid JSON');
  }
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new ActionError('input_json must contain a JSON object');
  }
  return parsed;
}

export function readActionInputs(env = process.env) {
  const target = input(env, 'target');
  if (!Object.hasOwn(TARGETS, target)) {
    throw new ActionError(`target must be one of: ${Object.keys(TARGETS).join(', ')}`);
  }

  const outputFormat = input(env, 'output_format', 'json').toLowerCase();
  if (outputFormat !== 'json' && outputFormat !== 'csv') {
    throw new ActionError('output_format must be json or csv');
  }

  return {
    target,
    apifyToken: input(env, 'apify_token'),
    rapidapiKey: input(env, 'rapidapi_key'),
    inputObject: parseInputJson(input(env, 'input_json', '{}')),
    rapidapiPath: input(env, 'rapidapi_path', '/'),
    maxTotalChargeUsd: parseBudget(input(env, 'max_total_charge_usd', String(DEFAULT_BUDGET_USD))),
    maxItems: parseInteger('max_items', input(env, 'max_items', '10'), 1, 1000),
    outputFormat,
    outputPath: input(env, 'output_path'),
    timeoutMs: parseInteger('timeout_seconds', input(env, 'timeout_seconds', '120'), 1, 300) * 1000,
    maxResponseBytes: parseInteger(
      'max_response_bytes',
      input(env, 'max_response_bytes', String(5 * 1024 * 1024)),
      1024,
      MAX_RESPONSE_BYTES,
    ),
    failOnEmpty: parseBoolean('fail_on_empty', input(env, 'fail_on_empty', 'false')),
  };
}

function assertSecret(name, secret) {
  if (!secret) throw new ActionError(`${name} is required for the selected target`);
  if (secret.length > 4096 || /[\u0000-\u001f\u007f]/u.test(secret)) {
    throw new ActionError(`${name} contains invalid control characters or is too long`);
  }
}

function validateRapidapiPath(rawPath) {
  if (!rawPath.startsWith('/') || rawPath.startsWith('//')) {
    throw new ActionError('rapidapi_path must start with exactly one slash');
  }
  if (/[\\?#\u0000-\u001f\u007f]/u.test(rawPath)) {
    throw new ActionError('rapidapi_path cannot contain a backslash, query string, fragment, or control character');
  }
  let decoded;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    throw new ActionError('rapidapi_path contains invalid percent encoding');
  }
  if (decoded.includes('\\') || decoded.split('/').some((part) => part === '..' || part === '.')) {
    throw new ActionError('rapidapi_path cannot contain traversal segments');
  }
  return rawPath;
}

function appendQueryValue(searchParams, key, value) {
  if (Array.isArray(value)) {
    for (const item of value) appendQueryValue(searchParams, key, item);
    return;
  }
  if (value === null) {
    searchParams.append(key, '');
    return;
  }
  if (typeof value === 'object') {
    searchParams.append(key, JSON.stringify(value));
    return;
  }
  searchParams.append(key, String(value));
}

function assertEndpoint(url, allowLoopback) {
  if (url.protocol === 'https:') return;
  const loopback = url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === '::1');
  if (!allowLoopback || !loopback) {
    throw new ActionError('Only fixed HTTPS service endpoints are allowed');
  }
}

export function buildRequest(config, catalog = TARGETS, { allowLoopback = false } = {}) {
  const target = catalog[config.target];
  if (!target) throw new ActionError('Selected target is not present in the endpoint allowlist');

  if (target.provider === 'apify') {
    assertSecret('apify_token', config.apifyToken);
    const defaultUrl = `https://api.apify.com/v2/acts/${encodeURIComponent(target.actorId)}/run-sync-get-dataset-items`;
    const url = new URL(target.baseUrl ?? defaultUrl);
    assertEndpoint(url, allowLoopback);
    url.searchParams.set('clean', 'true');
    url.searchParams.set('format', 'json');
    url.searchParams.set('maxTotalChargeUsd', formatBudget(config.maxTotalChargeUsd));
    const actorInput = { ...config.inputObject };
    if (!Object.hasOwn(actorInput, 'maxItems')) actorInput.maxItems = config.maxItems;
    return {
      provider: 'apify',
      label: target.label,
      url,
      method: 'POST',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${config.apifyToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(actorInput),
    };
  }

  if (target.provider === 'rapidapi') {
    assertSecret('rapidapi_key', config.rapidapiKey);
    const defaultBase = `https://${target.host}/`;
    const baseUrl = new URL(target.baseUrl ?? defaultBase);
    assertEndpoint(baseUrl, allowLoopback);
    const requestPath = validateRapidapiPath(config.rapidapiPath);
    const url = new URL(requestPath, baseUrl);
    if (url.origin !== baseUrl.origin) throw new ActionError('rapidapi_path cannot change the allowlisted origin');
    const query = { ...config.inputObject };
    if (!Object.hasOwn(query, 'limit') && !Object.hasOwn(query, 'maxItems')) query.limit = config.maxItems;
    for (const key of Object.keys(query).sort()) appendQueryValue(url.searchParams, key, query[key]);
    return {
      provider: 'rapidapi',
      label: target.label,
      url,
      method: 'GET',
      headers: {
        accept: 'application/json',
        'x-rapidapi-host': target.host,
        'x-rapidapi-key': config.rapidapiKey,
      },
      body: undefined,
    };
  }

  throw new ActionError('Endpoint allowlist contains an unsupported provider');
}

export function escapeWorkflowCommandData(value) {
  return String(value).replace(/%/gu, '%25').replace(/\r/gu, '%0D').replace(/\n/gu, '%0A');
}

export function maskCommand(secret) {
  return `::add-mask::${escapeWorkflowCommandData(secret)}`;
}

function registerSecret(secret, stdout) {
  if (secret) stdout.write(`${maskCommand(secret)}\n`);
}

export async function fetchJsonLimited(request, {
  fetchImpl = globalThis.fetch,
  timeoutMs,
  maxResponseBytes,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new ActionError('Node 20 global fetch is unavailable');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    try {
      response = await fetchImpl(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        redirect: 'error',
        signal: controller.signal,
      });
    } catch {
      if (controller.signal.aborted) throw new ActionError(`Request exceeded the ${timeoutMs} ms deadline`);
      throw new ActionError('HTTP request failed; redirects are disabled and no retry was attempted');
    }

    if (!response.ok) {
      try {
        await response.body?.cancel();
      } catch {
        // The status code remains the authoritative error if stream cleanup fails.
      }
      throw new ActionError(`Remote service returned HTTP ${response.status}; no retry was attempted`);
    }

    const contentLength = response.headers.get('content-length');
    if (contentLength && /^\d+$/u.test(contentLength) && Number(contentLength) > maxResponseBytes) {
      try {
        await response.body?.cancel();
      } catch {
        // The declared-size failure remains authoritative if stream cleanup fails.
      }
      throw new ActionError(`Response exceeds the ${maxResponseBytes}-byte limit`);
    }
    if (!response.body) throw new ActionError('Remote service returned an empty response body');

    const chunks = [];
    let size = 0;
    const reader = response.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxResponseBytes) {
          controller.abort();
          try {
            await reader.cancel();
          } catch {
            // Aborting can make Node's stream cancellation reject; the size error below is authoritative.
          }
          throw new ActionError(`Response exceeds the ${maxResponseBytes}-byte limit`);
        }
        chunks.push(Buffer.from(value));
      }
    } catch (error) {
      if (error instanceof ActionError) throw error;
      if (controller.signal.aborted) throw new ActionError(`Request exceeded the ${timeoutMs} ms deadline`);
      throw new ActionError('HTTP response stream failed; no retry was attempted');
    }

    const text = Buffer.concat(chunks, size).toString('utf8');
    try {
      return JSON.parse(text);
    } catch {
      throw new ActionError('Remote service returned invalid JSON');
    }
  } finally {
    clearTimeout(timer);
  }
}

export function normalizeItems(payload, maxItems) {
  let items;
  if (Array.isArray(payload)) {
    items = payload;
  } else if (payload !== null && typeof payload === 'object') {
    const arrayKeys = ['items', 'data', 'results', 'studies', 'filings', 'recalls', 'buildings'];
    const key = arrayKeys.find((candidate) => Array.isArray(payload[candidate]));
    items = key ? payload[key] : [payload];
  } else {
    items = [payload];
  }
  return items.slice(0, maxItems);
}

function csvScalar(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function protectCsvFormula(value) {
  const text = csvScalar(value);
  return /^[\s\uFEFF]*[=+\-@]/u.test(text) ? `'${text}` : text;
}

function quoteCsv(value) {
  return `"${protectCsvFormula(value).replace(/"/gu, '""')}"`;
}

export function serializeCsv(items) {
  const rows = items.map((item) => (
    item !== null && typeof item === 'object' && !Array.isArray(item) ? item : { value: item }
  ));
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))].sort();
  if (headers.length === 0) return '';
  const lines = [headers.map(quoteCsv).join(',')];
  for (const row of rows) lines.push(headers.map((header) => quoteCsv(row[header])).join(','));
  return `${lines.join('\r\n')}\r\n`;
}

function isWithin(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

export function resolveSafeOutputPath(workspace, requestedPath, format) {
  const fallback = `open-gov-data.${format}`;
  const raw = requestedPath || fallback;
  if (/[\u0000-\u001f\u007f]/u.test(raw) || path.isAbsolute(raw) || /^[A-Za-z]:[\\/]/u.test(raw) || /^[/\\]{2}/u.test(raw)) {
    throw new ActionError('output_path must be a relative path below GITHUB_WORKSPACE');
  }
  const segments = raw.split(/[\\/]/u);
  if (segments.some((segment) => segment === '..' || segment === '')) {
    throw new ActionError('output_path cannot contain traversal or empty path segments');
  }
  const normalized = segments.join(path.sep);
  const resolved = path.resolve(workspace, normalized);
  const workspaceResolved = path.resolve(workspace);
  if (!isWithin(workspaceResolved, resolved) || resolved === workspaceResolved) {
    throw new ActionError('output_path escapes GITHUB_WORKSPACE');
  }
  if (path.extname(resolved).toLowerCase() !== `.${format}`) {
    throw new ActionError(`output_path must end in .${format}`);
  }
  return resolved;
}

export async function writeArtifact(workspace, requestedPath, format, items) {
  const outputPath = resolveSafeOutputPath(workspace, requestedPath, format);
  const workspaceReal = await realpath(workspace);
  const parent = path.dirname(outputPath);
  await mkdir(parent, { recursive: true });
  const parentReal = await realpath(parent);
  if (!isWithin(workspaceReal, parentReal)) {
    throw new ActionError('output_path parent resolves outside GITHUB_WORKSPACE');
  }
  try {
    const existing = await lstat(outputPath);
    if (existing.isSymbolicLink() || !existing.isFile()) {
      throw new ActionError('output_path must not be a symlink or non-file entry');
    }
  } catch (error) {
    if (error instanceof ActionError) throw error;
    if (error?.code !== 'ENOENT') throw error;
  }

  const content = format === 'json' ? `${JSON.stringify(items, null, 2)}\n` : serializeCsv(items);
  const noFollow = fsConstants.O_NOFOLLOW ?? 0;
  const handle = await open(
    outputPath,
    fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_TRUNC | noFollow,
    0o600,
  );
  try {
    await handle.writeFile(content, 'utf8');
  } finally {
    await handle.close();
  }
  return outputPath;
}

export async function appendGithubOutputs(file, outputs, randomBytesFn = randomBytes) {
  if (!file) return;
  let block = '';
  for (const [name, rawValue] of Object.entries(outputs)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(name)) throw new ActionError('Invalid GitHub output name');
    const value = String(rawValue);
    let delimiter;
    do {
      delimiter = `ghadelim_${randomBytesFn(16).toString('hex')}`;
    } while (value.includes(delimiter));
    block += `${name}<<${delimiter}\n${value}\n${delimiter}\n`;
  }
  await appendFile(file, block, { encoding: 'utf8', mode: 0o600 });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;')
    .replace(/`/gu, '&#96;')
    .replace(/\|/gu, '&#124;');
}

export async function appendStepSummary(file, result) {
  if (!file) return;
  const rows = [
    ['Target', result.target],
    ['Provider', result.provider],
    ['Records written', result.itemCount],
    ['Format', result.format],
    ['Budget ceiling (USD)', result.maxTotalChargeUsd],
    ['Artifact', result.outputPath],
  ];
  const markdown = [
    '## Open Government Data CI',
    '',
    '| Field | Value |',
    '| --- | --- |',
    ...rows.map(([key, value]) => `| ${escapeHtml(key)} | <code>${escapeHtml(value)}</code> |`),
    '',
  ].join('\n');
  await appendFile(file, markdown, { encoding: 'utf8', mode: 0o600 });
}

export async function runAction({
  env = process.env,
  fetchImpl = globalThis.fetch,
  catalog = TARGETS,
  allowLoopback = false,
  stdout = process.stdout,
} = {}) {
  registerSecret(input(env, 'apify_token'), stdout);
  registerSecret(input(env, 'rapidapi_key'), stdout);
  const config = readActionInputs(env);
  const request = buildRequest(config, catalog, { allowLoopback });
  const payload = await fetchJsonLimited(request, {
    fetchImpl,
    timeoutMs: config.timeoutMs,
    maxResponseBytes: config.maxResponseBytes,
  });
  const items = normalizeItems(payload, config.maxItems);
  if (config.failOnEmpty && items.length === 0) throw new ActionError('Remote response contained no records');
  const workspace = env.GITHUB_WORKSPACE || process.cwd();
  const outputPath = await writeArtifact(workspace, config.outputPath, config.outputFormat, items);
  const result = {
    outputPath,
    itemCount: items.length,
    format: config.outputFormat,
    target: config.target,
    provider: request.provider,
    maxTotalChargeUsd: formatBudget(config.maxTotalChargeUsd),
  };
  await appendGithubOutputs(env.GITHUB_OUTPUT, {
    output_path: result.outputPath,
    item_count: result.itemCount,
    format: result.format,
    target: result.target,
    provider: result.provider,
    max_total_charge_usd: result.maxTotalChargeUsd,
  });
  await appendStepSummary(env.GITHUB_STEP_SUMMARY, result);
  return result;
}

function safeErrorMessage(error) {
  return error instanceof ActionError ? error.message : 'Unexpected internal failure';
}

const invokedUrl = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedUrl) {
  runAction().catch((error) => {
    process.stdout.write(`::error::${escapeWorkflowCommandData(safeErrorMessage(error))}\n`);
    process.exitCode = 1;
  });
}

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  COLLECTION_NAME,
  MAX_TOTAL_CHARGE_USD,
  allRequests,
  apifyRequests,
  buildUrl,
  expectedHeaders,
  rapidApiRequests,
} from './catalog.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(root, '..', '..');
const checks = [];
const sourceContracts = [];

const POSTMAN_COLLECTION = 'postman/Open-Gov-Paid-APIs.postman_collection.json';
const POSTMAN_ENVIRONMENT = 'postman/Open-Gov-Paid-APIs.postman_environment.json';
const INSOMNIA_EXPORT = 'insomnia/Open-Gov-Paid-APIs.insomnia.json';

function record(name, details) {
  checks.push({ name, status: 'passed', details });
  console.log(`[PASS] ${name}: ${details}`);
}

function readJson(relativeOrAbsolutePath) {
  const target = path.isAbsolute(relativeOrAbsolutePath)
    ? relativeOrAbsolutePath
    : path.join(root, relativeOrAbsolutePath);
  return JSON.parse(fs.readFileSync(target, 'utf8'));
}

function sha256(target) {
  return crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex');
}

function relativeToRepository(target) {
  return path.relative(repositoryRoot, target).replaceAll(path.sep, '/');
}

function sorted(values) {
  return [...values].sort();
}

function objectFromHeaders(headers) {
  return Object.fromEntries(headers.map(({ key, name, value }) => [key ?? name, value]));
}

function validateSchemaValue(value, schema, location) {
  if (schema.type === 'string') {
    assert.equal(typeof value, 'string', `${location} must be a string`);
    if (schema.maxLength !== undefined) {
      assert.ok(value.length <= schema.maxLength, `${location} exceeds maxLength`);
    }
  } else if (schema.type === 'integer') {
    assert.ok(Number.isInteger(value), `${location} must be an integer`);
  } else if (schema.type === 'number') {
    assert.equal(typeof value, 'number', `${location} must be a number`);
    assert.ok(Number.isFinite(value), `${location} must be finite`);
  } else if (schema.type === 'boolean') {
    assert.equal(typeof value, 'boolean', `${location} must be a boolean`);
  } else if (schema.type === 'array') {
    assert.ok(Array.isArray(value), `${location} must be an array`);
  } else if (schema.type === 'object') {
    assert.ok(value !== null && typeof value === 'object' && !Array.isArray(value), `${location} must be an object`);
  } else if (schema.type !== undefined) {
    assert.fail(`${location} uses unsupported schema type ${schema.type}`);
  }
  if (schema.enum) assert.ok(schema.enum.includes(value), `${location} is not in its enum`);
  if (schema.minimum !== undefined) assert.ok(value >= schema.minimum, `${location} is below minimum`);
  if (schema.maximum !== undefined) assert.ok(value <= schema.maximum, `${location} is above maximum`);
}

function validateActorInput(input, schema, actorId) {
  validateSchemaValue(input, schema, `${actorId} input`);
  const properties = schema.properties ?? {};
  for (const key of Object.keys(input)) {
    assert.ok(Object.hasOwn(properties, key), `${actorId} input has unknown property ${key}`);
    validateSchemaValue(input[key], properties[key], `${actorId}.${key}`);
  }
  for (const required of schema.required ?? []) {
    assert.ok(Object.hasOwn(input, required), `${actorId} input is missing ${required}`);
  }
}

function coerceQueryValue(raw, schema) {
  if (schema.type === 'integer' || schema.type === 'number') return Number(raw);
  if (schema.type === 'boolean') return raw === 'true';
  return raw;
}

function expectedBrunoPath(request) {
  if ('slug' in request) {
    const index = rapidApiRequests.indexOf(request) + 1;
    return `bruno/01-rapidapi/${String(index).padStart(2, '0')}-${request.slug}.bru`;
  }
  const index = apifyRequests.indexOf(request) + 1;
  return `bruno/02-apify/${String(index).padStart(2, '0')}-${request.id.slice('apify-'.length)}.bru`;
}

function extractBlock(text, blockName) {
  const marker = `${blockName} {\n`;
  const start = text.indexOf(marker);
  assert.ok(start >= 0, `missing Bruno block ${blockName}`);
  const contentStart = start + marker.length;
  const end = text.indexOf('\n}', contentStart);
  assert.ok(end >= 0, `unterminated Bruno block ${blockName}`);
  return text.slice(contentStart, end);
}

function parseBrunoKeyValues(text, blockName) {
  const block = extractBlock(text, blockName);
  return Object.fromEntries(
    block
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => {
        const delimiter = line.indexOf(':');
        assert.ok(delimiter > 0, `invalid line in Bruno ${blockName} block`);
        return [line.slice(0, delimiter).trim(), line.slice(delimiter + 1).trim()];
      }),
  );
}

function listFiles(directory) {
  const results = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) results.push(...listFiles(target));
    else results.push(target);
  }
  return results;
}

function resolvePlaceholder(value) {
  return value
    .replaceAll('{{APIFY_TOKEN}}', 'local-apify-placeholder')
    .replaceAll('{{RAPIDAPI_KEY}}', 'local-rapidapi-placeholder');
}

function postmanItems(collection) {
  return collection.item.flatMap((folder) => folder.item ?? []);
}

async function readRequestBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
    assert.ok(chunks.reduce((total, item) => total + item.length, 0) <= 64 * 1024, 'mock request body too large');
  }
  return Buffer.concat(chunks).toString('utf8');
}

function requestLoopback({ port, item }) {
  return new Promise((resolve, reject) => {
    const target = new URL(item.request.url.raw);
    const body = item.request.body?.raw ?? '';
    const headers = Object.fromEntries(
      item.request.header.map(({ key, value }) => [key, resolvePlaceholder(value)]),
    );
    headers['X-Local-Target-Host'] = target.host;
    if (body) headers['Content-Length'] = String(Buffer.byteLength(body));
    const request = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: `${target.pathname}${target.search}`,
        method: item.request.method,
        headers,
      },
      (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => {
          try {
            resolve({
              status: response.statusCode,
              headers: response.headers,
              payload: JSON.parse(Buffer.concat(chunks).toString('utf8')),
            });
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    request.on('error', reject);
    if (body) request.write(body);
    request.end();
  });
}

async function replayAllPostmanRequests(items) {
  const byTarget = new Map(
    allRequests.map((request) => [
      `${'slug' in request ? 'GET' : 'POST'} ${buildUrl(request)}`,
      request,
    ]),
  );
  const serverErrors = [];
  const server = http.createServer(async (incoming, response) => {
    try {
      const targetHost = incoming.headers['x-local-target-host'];
      assert.equal(typeof targetHost, 'string', 'loopback target host is missing');
      const targetUrl = `https://${targetHost}${incoming.url}`;
      const catalogRequest = byTarget.get(`${incoming.method} ${targetUrl}`);
      assert.ok(catalogRequest, `unexpected loopback target ${incoming.method} ${targetUrl}`);
      const expected = Object.fromEntries(
        Object.entries(expectedHeaders(catalogRequest)).map(([key, value]) => [
          key.toLowerCase(),
          resolvePlaceholder(value),
        ]),
      );
      for (const [key, value] of Object.entries(expected)) {
        assert.equal(incoming.headers[key], value, `${catalogRequest.id} header ${key}`);
      }
      const rawBody = await readRequestBody(incoming);
      if ('slug' in catalogRequest) {
        assert.equal(rawBody, '', `${catalogRequest.id} GET must not have a body`);
      } else {
        assert.deepEqual(JSON.parse(rawBody), catalogRequest.body, `${catalogRequest.id} body`);
        const target = new URL(targetUrl);
        assert.equal(target.searchParams.get('maxTotalChargeUsd'), MAX_TOTAL_CHARGE_USD);
      }
      const isRapid = 'slug' in catalogRequest;
      response.writeHead(isRapid ? 200 : 201, {
        'Content-Type': 'application/json; charset=utf-8',
        ...(isRapid ? { 'X-RapidAPI-Billing': 'Rows=1' } : {}),
      });
      response.end(
        JSON.stringify(isRapid ? { items: [{ mock: true, id: catalogRequest.id }] } : [{ mock: true, id: catalogRequest.id }]),
      );
    } catch (error) {
      serverErrors.push(error);
      response.writeHead(500, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'loopback contract rejection' }));
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const replay = [];
  try {
    for (const item of items) {
      const catalogRequest = allRequests.find((candidate) => candidate.name === item.name);
      assert.ok(catalogRequest, `no catalog request for ${item.name}`);
      const result = await requestLoopback({ port: address.port, item });
      if ('slug' in catalogRequest) {
        assert.equal(result.status, 200);
        assert.ok(Array.isArray(result.payload.items));
        assert.match(result.headers['x-rapidapi-billing'], /^Rows=\d+$/);
      } else {
        assert.ok([200, 201].includes(result.status));
        assert.ok(Array.isArray(result.payload));
      }
      replay.push({
        id: catalogRequest.id,
        method: item.request.method,
        target: buildUrl(catalogRequest),
        mockStatus: result.status,
      });
    }
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
  if (serverErrors.length) throw serverErrors[0];
  assert.equal(replay.length, 8);
  assert.equal(new Set(replay.map(({ id }) => id)).size, 8);
  return replay;
}

const nodeMajor = Number(process.versions.node.split('.')[0]);
assert.ok(nodeMajor >= 20, `Node.js 20+ required; found ${process.versions.node}`);
record('node-runtime', `Node.js ${process.versions.node}; no third-party packages loaded`);

assert.equal(allRequests.length, 8);
assert.equal(new Set(allRequests.map(({ id }) => id)).size, 8);
assert.deepEqual(
  sorted(apifyRequests.map(({ actorId }) => actorId)),
  sorted(['8LFIbRbidiHPknMz5', 'KchE3qKKrwU0rCe9f', 'txnvyTckeQx4hVBc6', 'Z3ioK0wOAeczj6nCx']),
);
assert.deepEqual(
  sorted(rapidApiRequests.map(({ slug }) => slug)),
  sorted([
    'sec-edgar-corporate-filings',
    'clinicaltrials-gov-studies-trials',
    'openfda-recalls-enforcement-approvals',
    'singapore-bca-green-mark-buildings',
  ]),
);
for (const request of rapidApiRequests) {
  assert.equal(request.host, `${request.slug}.p.rapidapi.com`);
}
record('catalog-allowlists', 'exactly four approved RapidAPI slugs and four approved Apify Actor IDs');

for (const request of apifyRequests) {
  const schemaPath = path.join(
    repositoryRoot,
    'actors',
    request.actorDirectory,
    '.actor',
    'input_schema.json',
  );
  assert.ok(fs.existsSync(schemaPath), `missing live Actor schema ${schemaPath}`);
  const schema = readJson(schemaPath);
  assert.equal(schema.schemaVersion, 1);
  assert.equal(schema.type, 'object');
  validateActorInput(request.body, schema, request.actorId);
  assert.ok(request.body.maxItems <= 10, `${request.actorId} example exceeds safe maxItems`);
  sourceContracts.push({
    kind: 'apify-input-schema',
    id: request.actorId,
    path: relativeToRepository(schemaPath),
    sha256: sha256(schemaPath),
  });
}
record('actor-input-schemas', 'four example bodies validated against repository .actor/input_schema.json files');

for (const request of rapidApiRequests) {
  const specPath = path.join(repositoryRoot, 'pipelines', 'rapidapi_hub', 'openapi', request.openApiFile);
  assert.ok(fs.existsSync(specPath), `missing RapidAPI OpenAPI contract ${specPath}`);
  const spec = readJson(specPath);
  assert.match(spec.openapi, /^3\.0\./);
  const operation = spec.paths?.[request.path]?.get;
  assert.ok(operation, `missing GET ${request.path} in ${request.openApiFile}`);
  const parameters = new Map((operation.parameters ?? []).map((parameter) => [parameter.name, parameter]));
  const supplied = new Set(request.query.map(([key]) => key));
  for (const [key, rawValue] of request.query) {
    const parameter = parameters.get(key);
    assert.ok(parameter, `${request.slug} query parameter ${key} is absent from OpenAPI`);
    validateSchemaValue(coerceQueryValue(rawValue, parameter.schema), parameter.schema, `${request.slug}.${key}`);
  }
  for (const parameter of parameters.values()) {
    if (parameter.required) assert.ok(supplied.has(parameter.name), `${request.slug} missing ${parameter.name}`);
  }
  assert.equal(Object.fromEntries(request.query).limit, '5');
  sourceContracts.push({
    kind: 'rapidapi-openapi',
    id: request.slug,
    path: relativeToRepository(specPath),
    sha256: sha256(specPath),
  });
}
record('rapidapi-openapi-contracts', 'four URLs and query examples validated against repository OpenAPI documents');

const postman = readJson(POSTMAN_COLLECTION);
assert.equal(postman.info.name, COLLECTION_NAME);
assert.equal(
  postman.info.schema,
  'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
);
assert.ok(Array.isArray(postman.item));
assert.deepEqual(postman.item.map(({ name }) => name), ['RapidAPI Paid REST APIs', 'Apify Paid Actors']);
const postmanRequestItems = postmanItems(postman);
assert.equal(postmanRequestItems.length, 8);
assert.equal(new Set(postmanRequestItems.map(({ name }) => name)).size, 8);
for (const request of allRequests) {
  const item = postmanRequestItems.find(({ name }) => name === request.name);
  assert.ok(item, `Postman request missing: ${request.name}`);
  assert.equal(item.request.method, 'slug' in request ? 'GET' : 'POST');
  assert.equal(item.request.url.raw, buildUrl(request));
  assert.deepEqual(objectFromHeaders(item.request.header), expectedHeaders(request));
  if ('slug' in request) {
    assert.equal(item.request.body, undefined);
  } else {
    assert.deepEqual(JSON.parse(item.request.body.raw), request.body);
    const url = new URL(item.request.url.raw);
    assert.deepEqual([...url.searchParams.keys()], ['maxTotalChargeUsd']);
    assert.equal(url.searchParams.get('maxTotalChargeUsd'), MAX_TOTAL_CHARGE_USD);
  }
  const tests = item.event?.filter(({ listen }) => listen === 'test') ?? [];
  assert.equal(tests.length, 1, `${request.id} must have one Postman test event`);
  const testSource = tests[0].script?.exec?.join('\n') ?? '';
  assert.match(testSource, /pm\.test\(/);
  assert.match(testSource, /Content-Type/);
  if (!('slug' in request)) assert.match(testSource, /maxTotalChargeUsd/);
}
record('postman-collection-v2.1', 'eight exact requests, JSON bodies, and response assertion scripts validated');

const postmanEnvironment = readJson(POSTMAN_ENVIRONMENT);
assert.equal(postmanEnvironment._postman_variable_scope, 'environment');
assert.deepEqual(postmanEnvironment.values.map(({ key }) => key), ['APIFY_TOKEN', 'RAPIDAPI_KEY']);
for (const variable of postmanEnvironment.values) {
  assert.equal(variable.value, '');
  assert.equal(variable.type, 'secret');
  assert.equal(variable.enabled, true);
}
record('postman-environment', 'exactly two enabled blank secret variables; no credential values');

const insomnia = readJson(INSOMNIA_EXPORT);
assert.equal(insomnia._type, 'export');
assert.equal(insomnia.__export_format, 4);
assert.ok(Array.isArray(insomnia.resources));
assert.equal(new Set(insomnia.resources.map(({ _id }) => _id)).size, insomnia.resources.length);
const workspaces = insomnia.resources.filter(({ _type }) => _type === 'workspace');
const environments = insomnia.resources.filter(({ _type }) => _type === 'environment');
const insomniaRequests = insomnia.resources.filter(({ _type }) => _type === 'request');
const requestGroups = insomnia.resources.filter(({ _type }) => _type === 'request_group');
assert.equal(workspaces.length, 1);
assert.equal(workspaces[0].name, COLLECTION_NAME);
assert.equal(environments.length, 1);
assert.deepEqual(environments[0].data, { APIFY_TOKEN: '', RAPIDAPI_KEY: '' });
assert.equal(requestGroups.length, 2);
assert.equal(insomniaRequests.length, 8);
for (const request of allRequests) {
  const resource = insomniaRequests.find(({ name }) => name === request.name);
  assert.ok(resource, `Insomnia request missing: ${request.name}`);
  const url = new URL(resource.url);
  for (const parameter of resource.parameters) {
    if (!parameter.disabled) url.searchParams.append(parameter.name, parameter.value);
  }
  assert.equal(url.toString(), buildUrl(request));
  assert.equal(resource.method, 'slug' in request ? 'GET' : 'POST');
  assert.deepEqual(objectFromHeaders(resource.headers), expectedHeaders(request));
  if (!('slug' in request)) assert.deepEqual(JSON.parse(resource.body.text), request.body);
}
record('insomnia-v4-export', 'workspace, secret environment, folders, and eight requests validated');

const brunoConfig = readJson('bruno/bruno.json');
assert.deepEqual(
  { version: brunoConfig.version, name: brunoConfig.name, type: brunoConfig.type },
  { version: '1', name: COLLECTION_NAME, type: 'collection' },
);
const brunoFiles = listFiles(path.join(root, 'bruno'))
  .filter((target) => target.endsWith('.bru'))
  .map((target) => path.relative(root, target).replaceAll(path.sep, '/'));
assert.equal(brunoFiles.length, 10);
assert.ok(brunoFiles.includes('bruno/01-rapidapi/folder.bru'));
assert.ok(brunoFiles.includes('bruno/02-apify/folder.bru'));
for (const request of allRequests) {
  const relativePath = expectedBrunoPath(request);
  assert.ok(brunoFiles.includes(relativePath), `Bruno request missing: ${relativePath}`);
  const text = fs.readFileSync(path.join(root, relativePath), 'utf8');
  const isRapid = 'slug' in request;
  const methodBlock = parseBrunoKeyValues(text, isRapid ? 'get' : 'post');
  const expectedUrl = new URL(buildUrl(request));
  assert.equal(methodBlock.url, `${expectedUrl.origin}${expectedUrl.pathname}`);
  assert.equal(methodBlock.body, isRapid ? 'none' : 'json');
  assert.deepEqual(parseBrunoKeyValues(text, 'params:query'), Object.fromEntries(expectedUrl.searchParams));
  assert.deepEqual(parseBrunoKeyValues(text, 'headers'), expectedHeaders(request));
  assert.match(text, /tests \{/);
  assert.match(text, /res\.getStatus\(\)/);
  if (!isRapid) {
    assert.deepEqual(JSON.parse(extractBlock(text, 'body:json').trim()), request.body);
  }
}
record('bruno-collection', 'bruno.json, two folders, eight .bru requests, bodies, headers, and tests validated');

const deliveryFiles = [
  path.join(root, POSTMAN_COLLECTION),
  path.join(root, POSTMAN_ENVIRONMENT),
  path.join(root, INSOMNIA_EXPORT),
  ...listFiles(path.join(root, 'bruno')),
];
const deliveryText = deliveryFiles.map((target) => fs.readFileSync(target, 'utf8')).join('\n');
const placeholders = [...deliveryText.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)].map((match) => match[1]);
assert.ok(placeholders.length > 0);
assert.deepEqual(sorted(new Set(placeholders)), ['APIFY_TOKEN', 'RAPIDAPI_KEY']);
for (const bearer of deliveryText.matchAll(/Bearer\s+([^"\r\n]+)/g)) {
  assert.equal(bearer[1].trim(), '{{APIFY_TOKEN}}');
}
assert.doesNotMatch(deliveryText, /apify_api_[A-Za-z0-9_-]+/i);
assert.doesNotMatch(deliveryText, /(hong[\s_-]*kong|香港|hk[-_])/i);
const artifactActorIds = sorted(
  new Set([...deliveryText.matchAll(/api\.apify\.com\/v2\/acts\/([A-Za-z0-9]+)/g)].map((match) => match[1])),
);
const artifactRapidSlugs = sorted(
  new Set([...deliveryText.matchAll(/([a-z0-9-]+)\.p\.rapidapi\.com/g)].map((match) => match[1])),
);
assert.deepEqual(artifactActorIds, sorted(apifyRequests.map(({ actorId }) => actorId)));
assert.deepEqual(artifactRapidSlugs, sorted(rapidApiRequests.map(({ slug }) => slug)));
record('credential-and-exclusion-guard', 'only two approved placeholders and exact eight-item URL allowlists occur in delivery artifacts');

const replay = await replayAllPostmanRequests(postmanRequestItems);
record('loopback-http-replay', 'all eight Postman requests replayed against 127.0.0.1 with auth, URL, body, cap, and response checks');

const artifactPaths = [
  'README.md',
  'package.json',
  'catalog.mjs',
  'generate.mjs',
  'verify.mjs',
  POSTMAN_COLLECTION,
  POSTMAN_ENVIRONMENT,
  INSOMNIA_EXPORT,
  'bruno/bruno.json',
  ...brunoFiles,
];
for (const relativePath of artifactPaths) {
  assert.ok(fs.existsSync(path.join(root, relativePath)), `missing artifact ${relativePath}`);
}

const evidence = {
  taskId: 'task-20261126T042428Z-7d40a7',
  projectId: 'postman-insomnia-open-gov-collections',
  generatedAt: new Date().toISOString(),
  status: 'passed',
  runtime: {
    node: process.version,
    minimumNodeMajor: 20,
    thirdPartyDependencies: 0,
  },
  safety: {
    externalNetworkCalls: 0,
    localLoopbackOnly: true,
    credentialValuesIncluded: false,
    allowedPlaceholders: ['APIFY_TOKEN', 'RAPIDAPI_KEY'],
    apifyMaxTotalChargeUsd: Number(MAX_TOTAL_CHARGE_USD),
  },
  coverage: {
    totalRequests: allRequests.length,
    postmanRequests: postmanRequestItems.length,
    insomniaRequests: insomniaRequests.length,
    brunoRequests: allRequests.length,
    actorSchemasValidated: apifyRequests.length,
    rapidApiOpenApiContractsValidated: rapidApiRequests.length,
    loopbackRequestsReplayed: replay.length,
    actorIds: apifyRequests.map(({ actorId }) => actorId),
    rapidApiSlugs: rapidApiRequests.map(({ slug }) => slug),
  },
  checks,
  sourceContracts,
  replay,
  artifacts: artifactPaths.map((relativePath) => {
    const target = path.join(root, relativePath);
    return { relativePath, bytes: fs.statSync(target).size, sha256: sha256(target) };
  }),
};

const evidencePath = path.join(root, 'evidence.json');
fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
assert.equal(readJson(evidencePath).status, 'passed');
console.log(`[PASS] evidence: ${path.relative(repositoryRoot, evidencePath).replaceAll(path.sep, '/')} written`);
console.log(`Verification complete: ${checks.length} checks passed; ${replay.length} loopback requests; 0 external calls.`);

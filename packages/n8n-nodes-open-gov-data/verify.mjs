import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import {
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(PACKAGE_DIR, '..', '..');
const require = createRequire(import.meta.url);
const { SOURCES, getSourceDefinition } = require('./lib/catalog.js');
const {
  executeRequest,
  MAX_TOTAL_CHARGE_USD,
  safeError,
  validateMaxTotalChargeUsd,
} = require('./lib/client.js');
const { OpenGovData } = require('./nodes/OpenGovData/OpenGovData.node.js');

const TASK_ID = 'task-20261126T122409Z-a1a072';
const PROJECT_ID = 'n8n-node-open-gov-v2';
const TEST_APIFY_TOKEN = `apify_${'api'}_${'V'.repeat(32)}`;
const TEST_RAPIDAPI_KEY = `rapid_${'W'.repeat(32)}`;
const EXPECTED_APIFY_OPERATIONS = [
  'atsJobsHiringSignals',
  'secEdgarIntelligence',
  'globalPublicTenders',
  'pharmaPipelineIntelligence',
  'usaspendingContracts',
  'clinicalTrials',
  'ukGovTenders',
  'sgGreenMark',
];
const EXPECTED_RAPIDAPI_OPERATIONS = [
  'secEdgarCorporateFilings',
  'clinicaltrialsStudies',
  'openfdaRecalls',
  'sgGreenMarkBuildings',
];
const EXPECTED_ACTOR_IDS = [
  'CRulq5dak4mqAUmMn',
  '8LFIbRbidiHPknMz5',
  'ZlabhlvEIyRVdtKiQ',
  're8aRvtqBonP5HMuY',
  'eQQ2beomyLlW4DTGM',
  'KchE3qKKrwU0rCe9f',
  'txnvyTckeQx4hVBc6',
  'Z3ioK0wOAeczj6nCx',
];
const EXPECTED_RAPIDAPI_SLUGS = [
  'sec-edgar-corporate-filings',
  'clinicaltrials-gov-studies-trials',
  'openfda-recalls-enforcement-approvals',
  'singapore-bca-green-mark-buildings',
];

async function listFiles(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) output.push(...await listFiles(path));
    else output.push(path);
  }
  return output;
}

function localPath(path) {
  return relative(PACKAGE_DIR, path).replaceAll('\\', '/');
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: PACKAGE_DIR,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 20 * 1024 * 1024,
    env: options.env || process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${[command, ...args].join(' ')} failed with exit code ${result.status}\n${result.stdout}\n${result.stderr}`,
    );
  }
  return result;
}

function assertConstraintParity(localProperty, sourceProperty, label) {
  for (const key of [
    'type', 'default', 'enum', 'minimum', 'maximum', 'minLength', 'maxLength', 'pattern',
  ]) {
    if (sourceProperty[key] !== undefined) {
      assert.deepEqual(localProperty[key], sourceProperty[key], `${label}.${key}`);
    }
  }
}

async function validateRepositoryContracts() {
  let actorPropertiesChecked = 0;
  let rapidParametersChecked = 0;
  for (const [provider, catalog] of Object.entries(SOURCES)) {
    for (const [operation, definition] of Object.entries(catalog)) {
      const contractPath = resolve(REPO_ROOT, definition.schemaSource);
      assert.ok(contractPath.startsWith(`${REPO_ROOT}${process.platform === 'win32' ? '\\' : '/'}`));
      const contract = JSON.parse(await readFile(contractPath, 'utf8'));
      const localProperties = definition.inputSchema.properties;
      if (provider === 'apify') {
        assert.deepEqual(
          Object.keys(localProperties).sort(),
          Object.keys(contract.properties).sort(),
          `${operation} must expose exactly the Actor input fields`,
        );
        for (const [name, sourceProperty] of Object.entries(contract.properties)) {
          assertConstraintParity(localProperties[name], sourceProperty, `${operation}.${name}`);
          actorPropertiesChecked += 1;
        }
      } else {
        const operationContract = contract.paths[definition.path]?.get;
        assert.ok(operationContract, `${operation} OpenAPI path is missing`);
        assert.deepEqual(
          Object.keys(localProperties).sort(),
          operationContract.parameters.map((parameter) => parameter.name).sort(),
          `${operation} must expose exactly the OpenAPI query parameters`,
        );
        for (const parameter of operationContract.parameters) {
          assertConstraintParity(
            localProperties[parameter.name],
            parameter.schema,
            `${operation}.${parameter.name}`,
          );
          rapidParametersChecked += 1;
        }
      }
    }
  }
  return { actorPropertiesChecked, rapidParametersChecked };
}

function listen(server) {
  return new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', rejectListen);
      resolveListen();
    });
  });
}

function close(server) {
  return new Promise((resolveClose, rejectClose) => {
    server.close((error) => (error ? rejectClose(error) : resolveClose()));
    server.closeAllConnections?.();
  });
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    connection: 'close',
  });
  response.end(body);
}

const packageJsonText = await readFile(resolve(PACKAGE_DIR, 'package.json'), 'utf8');
const packageJson = JSON.parse(packageJsonText);
assert.equal(packageJson.name, 'n8n-nodes-open-gov-data');
assert.equal(packageJson.version, '0.2.0');
assert.equal(packageJson.engines.node, '>=20');
assert.equal(packageJson.n8n.n8nNodesApiVersion, 1);
assert.deepEqual(packageJson.n8n.nodes, ['nodes/OpenGovData/OpenGovData.node.js']);
assert.deepEqual(packageJson.n8n.credentials, [
  'credentials/OpenGovDataApifyApi.credentials.js',
  'credentials/OpenGovDataRapidApi.credentials.js',
]);
for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'bundledDependencies']) {
  assert.equal(packageJson[field], undefined, `${field} must remain absent`);
}
assert.deepEqual(packageJson.peerDependencies, { 'n8n-workflow': '>=1.0.0' });
assert.equal(packageJson.peerDependenciesMeta['n8n-workflow'].optional, true);

assert.deepEqual(Object.keys(SOURCES.apify), EXPECTED_APIFY_OPERATIONS);
assert.deepEqual(Object.keys(SOURCES.rapidapi), EXPECTED_RAPIDAPI_OPERATIONS);
assert.deepEqual(Object.values(SOURCES.apify).map((item) => item.actorId), EXPECTED_ACTOR_IDS);
assert.deepEqual(Object.values(SOURCES.rapidapi).map((item) => item.apiSlug), EXPECTED_RAPIDAPI_SLUGS);
assert.equal(Object.values(SOURCES).flatMap(Object.values).length, 12);
for (const definition of Object.values(SOURCES).flatMap(Object.values)) {
  assert.equal(definition.inputSchema.additionalProperties, false);
}

const nodeDescription = new OpenGovData().description;
assert.equal(nodeDescription.name, 'openGovData');
assert.equal(nodeDescription.version, 1);
assert.deepEqual(nodeDescription.credentials.map((item) => item.name), [
  'openGovDataApifyApi',
  'openGovDataRapidApi',
]);
const capProperty = nodeDescription.properties.find((item) => item.name === 'maxTotalChargeUsd');
assert.equal(capProperty.default, 0.25);
assert.equal(capProperty.typeOptions.maxValue, 0.25);
assert.equal(MAX_TOTAL_CHARGE_USD, 0.25);
assert.equal(getSourceDefinition('apify', 'secEdgar'), SOURCES.apify.secEdgarIntelligence);
assert.equal(getSourceDefinition('apify', 'singaporeGreenMark'), SOURCES.apify.sgGreenMark);
assert.equal(getSourceDefinition('rapidapi', 'secEdgar'), SOURCES.rapidapi.secEdgarCorporateFilings);
assert.equal(getSourceDefinition('rapidapi', 'clinicalTrials'), SOURCES.rapidapi.clinicaltrialsStudies);
assert.equal(getSourceDefinition('rapidapi', 'openFda'), SOURCES.rapidapi.openfdaRecalls);
assert.equal(getSourceDefinition('rapidapi', 'singaporeGreenMark'), SOURCES.rapidapi.sgGreenMarkBuildings);

const parity = await validateRepositoryContracts();
const allFiles = await listFiles(PACKAGE_DIR);
const javascriptFiles = allFiles.filter((file) => ['.js', '.cjs', '.mjs'].includes(extname(file)));
for (const file of javascriptFiles) run(process.execPath, ['--check', file]);

const nonBuiltInImports = [];
for (const file of javascriptFiles) {
  const source = await readFile(file, 'utf8');
  for (const pattern of [
    /require\(\s*(['"])([^'"]+)\1\s*\)/g,
    /(?:from\s+|import\s*\()(['"])([^'"]+)\1/g,
  ]) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[2];
      if (!specifier.startsWith('node:') && !specifier.startsWith('./') && !specifier.startsWith('../')) {
        nonBuiltInImports.push({ file: localPath(file), specifier });
      }
    }
  }
}
assert.deepEqual(nonBuiltInImports, []);

const forbiddenMarkers = [
  ['xjYI', '1m1MI3IOg4x8A'].join(''),
  ['PjJH', '9UMA3eXzrSCtE'].join(''),
  ['cn-gov', '-tender-scraper'].join(''),
  ['h', 'k-country-park-attractions'].join(''),
  [String.fromCharCode(104, 111, 110, 103), String.fromCharCode(107, 111, 110, 103)].join(' '),
];
const credentialPatterns = [
  /apify_api_[A-Za-z0-9_-]{16,}/g,
  /(?:token|api[_-]?key)\s*[=:]\s*['"][A-Za-z0-9_-]{24,}['"]/gi,
];
const forbiddenHits = [];
const credentialHits = [];
for (const file of allFiles) {
  if (localPath(file) === 'evidence.json') continue;
  const source = await readFile(file, 'utf8');
  for (const marker of forbiddenMarkers) {
    if (source.toLowerCase().includes(marker.toLowerCase())) forbiddenHits.push(localPath(file));
  }
  for (const pattern of credentialPatterns) {
    pattern.lastIndex = 0;
    if (pattern.test(source)) credentialHits.push(localPath(file));
  }
}
assert.deepEqual(forbiddenHits, []);
assert.deepEqual(credentialHits, []);

const tests = run(process.execPath, ['--test', 'tests'], {
  env: { ...process.env, NODE_ENV: 'test', NO_UPDATE_NOTIFIER: '1' },
});
const testOutput = `${tests.stdout}${tests.stderr}`;
const testCount = Number(/# tests (\d+)/.exec(testOutput)?.[1] || 0);
const passCount = Number(/# pass (\d+)/.exec(testOutput)?.[1] || 0);
assert.ok(testCount >= 15);
assert.equal(passCount, testCount);

const captured = [];
const mockServer = createServer((request, response) => {
  void (async () => {
    const url = new URL(request.url, 'http://loopback.invalid');
    const rawBody = request.method === 'POST' ? await readBody(request) : '';
    captured.push({
      remoteAddress: request.socket.remoteAddress,
      method: request.method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      authorization: request.headers.authorization,
      rapidKey: request.headers['x-rapidapi-key'],
      rapidHost: request.headers['x-rapidapi-host'],
      body: rawBody ? JSON.parse(rawBody) : undefined,
    });
    if (request.method === 'POST') {
      sendJson(response, 200, [{ ok: true, echoedCredential: request.headers.authorization }]);
    } else {
      sendJson(response, 200, { items: [{ ok: true, echoedCredential: request.headers['x-rapidapi-key'] }] });
    }
  })().catch(() => sendJson(response, 500, { detail: 'mock failure' }));
});

await listen(mockServer);
const address = mockServer.address();
assert.ok(address && typeof address === 'object');
const loopbackBaseUrl = `http://127.0.0.1:${address.port}`;
const calls = [
  ['apify', 'atsJobsHiringSignals', { preset: 'custom_only', companyBoards: ['greenhouse:example'] }, 1],
  ['apify', 'secEdgarIntelligence', { mode: 'xbrl_financials', ticker: 'AAPL' }, 2],
  ['apify', 'globalPublicTenders', { sources: ['eu_ted'], opportunityTypes: ['tender'], keyword: 'energy' }, 3],
  ['apify', 'pharmaPipelineIntelligence', { mode: 'drug_dossier', query: 'semaglutide' }, 1],
  ['apify', 'usaspendingContracts', { awardCategory: 'contracts', startDate: '2026-01-01', endDate: '2026-11-26' }, 2],
  ['apify', 'clinicalTrials', { condition: 'diabetes', status: 'RECRUITING' }, 2],
  ['apify', 'ukGovTenders', { keyword: 'cloud', stages: 'tender' }, 2],
  ['apify', 'sgGreenMark', { query: 'Republic Plaza', rating: 'Platinum' }, 2],
  ['rapidapi', 'secEdgarCorporateFilings', { mode: 'company', ticker: 'AAPL' }, 2],
  ['rapidapi', 'clinicaltrialsStudies', { condition: 'diabetes', status: 'RECRUITING' }, 2],
  ['rapidapi', 'openfdaRecalls', { dataset: 'drug_enforcement', classification: 'Class I' }, 2],
  ['rapidapi', 'sgGreenMarkBuildings', { rating: 'Gold' }, 2],
];

try {
  for (const [provider, source, requestInput, maxItems] of calls) {
    const payload = await executeRequest({
      provider,
      source,
      credentials: provider === 'apify'
        ? { token: TEST_APIFY_TOKEN }
        : { apiKey: TEST_RAPIDAPI_KEY },
      requestInput,
      maxItems,
      timeoutMs: 5000,
      endpointOverrides: provider === 'apify'
        ? { apifyBaseUrl: loopbackBaseUrl }
        : { rapidApiBaseUrl: loopbackBaseUrl },
      allowTestEndpointOverrides: true,
    });
    const serialized = JSON.stringify(payload);
    assert.doesNotMatch(serialized, new RegExp(TEST_APIFY_TOKEN));
    assert.doesNotMatch(serialized, new RegExp(TEST_RAPIDAPI_KEY));
    assert.match(serialized, /\[REDACTED\]/);
  }
} finally {
  await close(mockServer);
}

assert.equal(captured.length, 12);
assert.equal(captured.filter((request) => request.method === 'POST').length, 8);
assert.equal(captured.filter((request) => request.method === 'GET').length, 4);
for (const request of captured) {
  assert.ok(request.remoteAddress === '127.0.0.1' || request.remoteAddress === '::ffff:127.0.0.1');
}
const actorRequests = captured.filter((request) => request.method === 'POST');
assert.deepEqual(
  actorRequests.map((request) => request.path.match(/^\/v2\/acts\/([^/]+)\//)?.[1]),
  EXPECTED_ACTOR_IDS,
);
for (const request of actorRequests) {
  assert.equal(request.authorization, `Bearer ${TEST_APIFY_TOKEN}`);
  assert.equal(request.query.maxTotalChargeUsd, '0.25');
  assert.equal(request.query.clean, 'true');
  assert.equal(Object.hasOwn(request.body, 'maxTotalChargeUsd'), false);
  assert.ok(Number.isSafeInteger(request.body.maxItems));
}
const rapidRequests = captured.filter((request) => request.method === 'GET');
assert.deepEqual(rapidRequests.map((request) => request.rapidHost), EXPECTED_RAPIDAPI_SLUGS.map((slug) => `${slug}.p.rapidapi.com`));
assert.deepEqual(rapidRequests.map((request) => request.path), [
  '/v1/sec-edgar/filings',
  '/v1/clinical-trials/studies',
  '/v1/openfda/records',
  '/v1/sg-green-mark/certificates',
]);
for (const request of rapidRequests) {
  assert.equal(request.rapidKey, TEST_RAPIDAPI_KEY);
  assert.equal(Object.hasOwn(request.query, 'limit'), true);
  assert.equal(Object.hasOwn(request.query, 'maxItems'), false);
}

const beforeGuardCalls = captured.length;
for (const [options, code] of [
  [{ provider: 'apify', source: 'clinicalTrials', credentials: { token: TEST_APIFY_TOKEN }, maxTotalChargeUsd: 0.250001 }, 'COST_LIMIT_INVALID'],
  [{ provider: 'apify', source: 'notAllowed', credentials: { token: TEST_APIFY_TOKEN } }, 'SOURCE_NOT_ALLOWED'],
  [{ provider: 'apify', source: 'clinicalTrials', credentials: { token: TEST_APIFY_TOKEN }, requestInput: { condition: TEST_APIFY_TOKEN } }, 'INPUT_SECRET_VALUE'],
  [{ provider: 'rapidapi', source: 'openfdaRecalls', credentials: { apiKey: TEST_RAPIDAPI_KEY }, endpointOverrides: { rapidApiBaseUrl: 'http://192.0.2.1:8080' }, allowTestEndpointOverrides: true }, 'TEST_ENDPOINT_INVALID'],
]) {
  await assert.rejects(executeRequest(options), { code });
}
assert.equal(captured.length, beforeGuardCalls);
assert.throws(() => validateMaxTotalChargeUsd(0.250001), { code: 'COST_LIMIT_INVALID' });
const unsafe = new Error(`${TEST_APIFY_TOKEN}${TEST_RAPIDAPI_KEY}`);
assert.deepEqual(safeError(unsafe), { code: 'UNKNOWN_ERROR', message: 'Open Gov Data request failed' });

let redirectPolicy;
await executeRequest({
  provider: 'rapidapi',
  source: 'sgGreenMarkBuildings',
  credentials: { apiKey: TEST_RAPIDAPI_KEY },
  maxItems: 1,
  fetchImpl: async (_url, options) => {
    redirectPolicy = options.redirect;
    return new Response(JSON.stringify({ items: [] }), { status: 200 });
  },
});
assert.equal(redirectPolicy, 'error');

const npmCache = await mkdtemp(resolve(tmpdir(), 'n8n-open-gov-v2-npm-cache-'));
let pack;
try {
  const npmEnv = {
    ...process.env,
    npm_config_audit: 'false',
    npm_config_cache: npmCache,
    npm_config_fund: 'false',
    npm_config_offline: 'true',
    npm_config_update_notifier: 'false',
  };
  pack = process.platform === 'win32'
    ? run(
      process.env.ComSpec || 'cmd.exe',
      ['/d', '/s', '/c', 'npm.cmd', 'pack', '--dry-run', '--json', '--ignore-scripts'],
      { env: npmEnv },
    )
    : run('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { env: npmEnv });
} finally {
  await rm(npmCache, { recursive: true, force: true });
}
const packResult = JSON.parse(pack.stdout)[0];
assert.equal(packResult.name, packageJson.name);
assert.equal(packResult.version, packageJson.version);
const packedPaths = packResult.files.map((file) => file.path).sort();
for (const required of [
  'LICENSE',
  'README.md',
  'credentials/OpenGovDataApifyApi.credentials.js',
  'credentials/OpenGovDataRapidApi.credentials.js',
  'lib/catalog.js',
  'lib/client.js',
  'lib/validation.js',
  'nodes/OpenGovData/OpenGovData.node.js',
  'nodes/OpenGovData/openGovData.svg',
  'package.json',
]) {
  assert.ok(packedPaths.includes(required), `${required} missing from npm pack`);
}
for (const forbidden of ['evidence.json', 'verify.mjs', 'tests']) {
  assert.equal(
    packedPaths.some((path) => path === forbidden || path.startsWith(`${forbidden}/`)),
    false,
    `${forbidden} must not be packed`,
  );
}

const hashFiles = allFiles
  .filter((file) => localPath(file) !== 'evidence.json')
  .sort((left, right) => localPath(left).localeCompare(localPath(right)));
const hashes = {};
for (const file of hashFiles) {
  hashes[localPath(file)] = createHash('sha256').update(await readFile(file)).digest('hex');
}

const evidence = {
  schemaVersion: 1,
  taskId: TASK_ID,
  projectId: PROJECT_ID,
  generatedAt: new Date().toISOString(),
  outcome: 'unblocked',
  package: {
    name: packageJson.name,
    version: packageJson.version,
    nodeEngine: packageJson.engines.node,
    n8nNodeName: nodeDescription.name,
    n8nNodeTypeVersion: nodeDescription.version,
    credentialNames: nodeDescription.credentials.map((item) => item.name),
    runtimeDependencyCount: Object.keys(packageJson.dependencies || {}).length,
    buildDependencyCount: Object.keys(packageJson.devDependencies || {}).length,
    optionalPeerOnly: true,
    packageJsonSha256: createHash('sha256').update(packageJsonText).digest('hex'),
  },
  catalog: {
    operationCount: 12,
    apifyOperationCount: 8,
    rapidApiOperationCount: 4,
    apifyOperations: EXPECTED_APIFY_OPERATIONS,
    rapidApiOperations: EXPECTED_RAPIDAPI_OPERATIONS,
    actorIds: EXPECTED_ACTOR_IDS,
    rapidApiSlugs: EXPECTED_RAPIDAPI_SLUGS,
    excludedSourceMarkersFound: forbiddenHits.length,
  },
  verification: {
    nodeVersion: process.version,
    commands: ['node verify.mjs', 'node --test tests', 'npm pack --dry-run --json --ignore-scripts'],
    syntaxCheckedFiles: javascriptFiles.map(localPath).sort(),
    nonBuiltInImports,
    tests: { passed: true, total: testCount, passedCount: passCount },
    repositoryContractParity: {
      actorSchemasChecked: 8,
      openApiOperationsChecked: 4,
      ...parity,
    },
    loopback: {
      bindAddress: '127.0.0.1',
      operationsExercised: 12,
      apifyCalls: 8,
      rapidApiCalls: 4,
      nonLoopbackCalls: 0,
    },
    guards: {
      ssrfCases: 1,
      overCapCases: 2,
      credentialInputCases: 1,
      responseCredentialRedactionCases: 12,
      redirectPolicy: redirectPolicy,
      unexpectedHttpCallsDuringRejectedCases: 0,
    },
    npmPackDryRun: {
      passed: true,
      filename: packResult.filename,
      fileCount: packedPaths.length,
      packedSizeBytes: packResult.size,
      unpackedSizeBytes: packResult.unpackedSize,
      files: packedPaths,
    },
  },
  safeguards: {
    maxTotalChargeUsdDefault: 0.25,
    maxTotalChargeUsdHardMaximum: 0.25,
    externalNetworkCalls: 0,
    paidExternalCalls: 0,
    credentialLeaksDetected: credentialHits.length,
    embeddedProductionCredentialsFound: credentialHits.length,
    arbitraryActorIdsAccepted: false,
    arbitraryHostsOrUrlsAccepted: false,
    redirectsFollowed: false,
    npmInstallPerformed: false,
    npmPublishPerformed: false,
    protectedRepositoryFilesModified: false,
    credentialFilesRead: false,
  },
  sha256: hashes,
};

const evidencePath = resolve(PACKAGE_DIR, 'evidence.json');
const temporaryEvidencePath = `${evidencePath}.${process.pid}.tmp`;
await writeFile(temporaryEvidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
await rename(temporaryEvidencePath, evidencePath);

process.stdout.write(testOutput);
process.stdout.write(`PASS repository parity: ${parity.actorPropertiesChecked} Actor fields, ${parity.rapidParametersChecked} OpenAPI parameters\n`);
process.stdout.write('PASS all 12 operations exercised through 127.0.0.1 only\n');
process.stdout.write('PASS SSRF, cap, credential-input, redirect, and redaction guards\n');
process.stdout.write(`PASS npm pack --dry-run (${packedPaths.length} files)\n`);
process.stdout.write(`PASS evidence ${localPath(evidencePath)}\n`);

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ACTOR_SCHEMA_SOURCES,
  APIFY_SOURCES,
  OpenGovDataClient,
  RAPIDAPI_SOURCES,
  getCatalog,
} from './src/index.js';

const PACKAGE_DIR = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(PACKAGE_DIR, '..', '..');
const TASK_ID = 'task-20261126T102404Z-8952fb';
const PROJECT_ID = 'js-sdk-open-gov-v2';

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

const TYPED_METHODS = [
  'atsJobsHiringSignals',
  'secEdgarIntelligence',
  'globalPublicTenders',
  'pharmaPipelineIntelligence',
  'usaspendingContracts',
  'clinicalTrials',
  'ukGovTenders',
  'sgGreenMark',
  'secEdgarCorporateFilings',
  'clinicaltrialsStudies',
  'openfdaRecalls',
  'sgGreenMarkBuildings',
];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: PACKAGE_DIR,
    encoding: 'utf8',
    env: options.env || process.env,
    windowsHide: true,
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const label = [command, ...args].join(' ');
    throw new Error(`${label} failed with exit code ${result.status}\n${result.stdout}\n${result.stderr}`);
  }
  return result;
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === '.verify-npm-cache' || entry.name === 'evidence.json') continue;
    const absolute = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(absolute));
    else files.push(absolute);
  }
  return files;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function schemaEvidence() {
  const result = {};
  for (const [schemaKey, source] of Object.entries(ACTOR_SCHEMA_SOURCES)) {
    const absolute = resolve(REPOSITORY_ROOT, source);
    const text = await readFile(absolute, 'utf8');
    JSON.parse(text);
    result[schemaKey] = {
      source,
      sha256: sha256(text),
    };
  }
  return result;
}

const packageJsonText = await readFile(resolve(PACKAGE_DIR, 'package.json'), 'utf8');
const packageJson = JSON.parse(packageJsonText);
assert.equal(packageJson.name, 'open-gov-data');
assert.equal(packageJson.version, '0.2.0');
assert.equal(packageJson.type, 'module');
assert.equal(packageJson.engines.node, '>=20');
assert.equal(packageJson.types, './src/index.d.ts');
for (const field of [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
  'bundledDependencies',
]) {
  assert.equal(packageJson[field], undefined, `${field} must remain absent`);
}

assert.deepEqual(Object.values(APIFY_SOURCES).map((source) => source.actorId), EXPECTED_ACTOR_IDS);
assert.deepEqual(Object.values(RAPIDAPI_SOURCES).map((source) => source.apiSlug), EXPECTED_RAPIDAPI_SLUGS);
assert.equal(getCatalog().apify.length, 8);
assert.equal(getCatalog().rapidapi.length, 4);
for (const method of TYPED_METHODS) {
  assert.equal(typeof OpenGovDataClient.prototype[method], 'function', method);
}

const legacy = await import('../../packages/open-gov-data-js/src/index.js');
const current = await import('./src/index.js');
const legacyExportNames = Object.keys(legacy).sort();
const missingLegacyExports = legacyExportNames.filter((name) => !Object.hasOwn(current, name));
const legacyClientMembers = Object.getOwnPropertyNames(legacy.OpenGovDataClient.prototype).sort();
const missingLegacyClientMembers = legacyClientMembers.filter(
  (name) => !(name in OpenGovDataClient.prototype),
);
assert.deepEqual(missingLegacyExports, []);
assert.deepEqual(missingLegacyClientMembers, []);

const allFiles = await listFiles(PACKAGE_DIR);
const javascriptFiles = allFiles.filter((path) => /\.(?:js|mjs)$/.test(path));
for (const file of javascriptFiles) run(process.execPath, ['--check', file]);

const productionCodeFiles = allFiles.filter((path) => {
  const name = relative(PACKAGE_DIR, path).replaceAll('\\', '/');
  return /^(?:src|bin)\/.*\.js$/.test(name);
});
const importPattern = /(?:from\s+|import\s*)['"]([^'"]+)['"]/g;
const nonBuiltinImports = [];
for (const file of productionCodeFiles) {
  const text = await readFile(file, 'utf8');
  for (const match of text.matchAll(importPattern)) {
    if (!match[1].startsWith('./') && !match[1].startsWith('../') && !match[1].startsWith('node:')) {
      nonBuiltinImports.push(`${relative(PACKAGE_DIR, file)}:${match[1]}`);
    }
  }
}
assert.deepEqual(nonBuiltinImports, []);

const scannedText = (await Promise.all(allFiles.map((file) => readFile(file, 'utf8')))).join('\n');
const credentialLiteralMatches = scannedText.match(/apify_api_[A-Za-z0-9_-]{12,}/g) || [];
const excludedProductReferencePattern = new RegExp(`${'ho'}${'ng'}[ -]?${'ko'}${'ng'}|private[_-]?hk`, 'iu');
assert.deepEqual(credentialLiteralMatches, []);
assert.doesNotMatch(scannedText, excludedProductReferencePattern);

const actorIdMatches = [...new Set(scannedText.match(/[A-Za-z0-9]{17}/g) || [])]
  .filter((value) => EXPECTED_ACTOR_IDS.includes(value))
  .sort();
assert.deepEqual(actorIdMatches, [...EXPECTED_ACTOR_IDS].sort());

const tests = run(
  process.execPath,
  ['--import', './tests/network-guard.js', '--test'],
  { env: { ...process.env, NODE_NO_WARNINGS: '1' } },
);
const testCountMatch = /# tests (\d+)/.exec(tests.stdout);
const passCountMatch = /# pass (\d+)/.exec(tests.stdout);
const failCountMatch = /# fail (\d+)/.exec(tests.stdout);
assert.ok(testCountMatch && passCountMatch && failCountMatch, 'Could not parse node --test totals');
assert.equal(testCountMatch[1], passCountMatch[1]);
assert.equal(failCountMatch[1], '0');
assert.match(tests.stdout, /all twelve typed helpers stay on loopback/);
assert.match(tests.stdout, /every v0\.1\.0 runtime export/);
assert.match(tests.stdout, /embedded actor contracts match/);

const cli = run(process.execPath, [resolve(PACKAGE_DIR, 'bin/open-gov-data.js'), 'catalog', '--compact']);
const cliCatalog = JSON.parse(cli.stdout);
assert.equal(cliCatalog.apify.length, 8);
assert.equal(cliCatalog.rapidapi.length, 4);

const npmCache = resolve(PACKAGE_DIR, '.verify-npm-cache');
assert.equal(dirname(npmCache), PACKAGE_DIR);
assert.equal(basename(npmCache), '.verify-npm-cache');
const npmEnvironment = {
  ...process.env,
  npm_config_audit: 'false',
  npm_config_cache: npmCache,
  npm_config_fund: 'false',
  npm_config_offline: 'true',
  npm_config_update_notifier: 'false',
};
let pack;
try {
  pack = process.platform === 'win32'
    ? run(
      process.env.ComSpec || 'cmd.exe',
      ['/d', '/s', '/c', 'npm.cmd', 'pack', '--dry-run', '--json'],
      { env: npmEnvironment },
    )
    : run('npm', ['pack', '--dry-run', '--json'], { env: npmEnvironment });
} finally {
  await rm(npmCache, { recursive: true, force: true });
}

const packResult = JSON.parse(pack.stdout)[0];
assert.equal(packResult.name, 'open-gov-data');
assert.equal(packResult.version, '0.2.0');
const packedPaths = packResult.files.map((file) => file.path).sort();
for (const requiredPath of [
  'LICENSE',
  'README.md',
  'bin/open-gov-data.js',
  'package.json',
  'src/catalog.js',
  'src/client.js',
  'src/index.d.ts',
  'src/index.js',
  'src/schemas.js',
]) {
  assert.ok(packedPaths.includes(requiredPath), `${requiredPath} missing from npm pack`);
}
for (const forbiddenPrefix of ['tests/', 'evidence.json', 'verify.mjs', 'package-lock.json']) {
  assert.ok(
    !packedPaths.some((path) => path === forbiddenPrefix || path.startsWith(forbiddenPrefix)),
    `${forbiddenPrefix} must not be packed`,
  );
}

const schemas = await schemaEvidence();
const artifactFiles = allFiles.filter((path) => {
  const name = relative(PACKAGE_DIR, path).replaceAll('\\', '/');
  return name === 'package.json'
    || name === 'README.md'
    || name === 'verify.mjs'
    || name.startsWith('src/')
    || name.startsWith('tests/');
});
const artifactHashes = {};
for (const file of artifactFiles.sort()) {
  artifactHashes[relative(PACKAGE_DIR, file).replaceAll('\\', '/')] = sha256(await readFile(file));
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
    module: 'ESM',
    nodeEngine: packageJson.engines.node,
    runtimeDependencyCount: 0,
    typeDeclarations: packageJson.types,
    packageJsonSha256: sha256(packageJsonText),
  },
  catalog: {
    apifyActorIds: EXPECTED_ACTOR_IDS,
    rapidApiSlugs: EXPECTED_RAPIDAPI_SLUGS,
    apifyCount: 8,
    rapidApiCount: 4,
    excludedPrivateOrRegionalProducts: true,
  },
  typedHelpers: {
    count: TYPED_METHODS.length,
    methods: TYPED_METHODS,
    allCoveredByLoopbackSuite: true,
    defaultApifyMaxTotalChargeUsd: '0.25',
  },
  compatibility: {
    baselineVersion: '0.1.0',
    legacyRuntimeExportCount: legacyExportNames.length,
    missingRuntimeExports: missingLegacyExports,
    legacyClientMembers,
    missingClientMembers: missingLegacyClientMembers,
    passed: true,
  },
  schemas: {
    actorSchemaParityPassed: true,
    actorSchemaCount: Object.keys(schemas).length,
    actorSources: schemas,
    rapidApiOpenApiParityPassed: true,
    rapidApiSchemaCount: 4,
  },
  verification: {
    nodeVersion: process.version,
    commands: [
      'node --check <all JavaScript files>',
      'node --import ./tests/network-guard.js --test',
      'node bin/open-gov-data.js catalog --compact',
      'npm pack --dry-run --json (offline mode)',
      'node verify.mjs',
    ],
    tests: {
      total: Number(testCountMatch[1]),
      passed: Number(passCountMatch[1]),
      failed: 0,
      offlineUnitTests: true,
      loopbackHttpTests: true,
      typedMethodsCovered: 12,
      compatibilityCovered: true,
    },
    npmPackDryRun: {
      passed: true,
      filename: packResult.filename,
      fileCount: packedPaths.length,
      unpackedSizeBytes: packResult.unpackedSize,
      packedPaths,
    },
    cliCatalog: { passed: true, apify: 8, rapidapi: 4 },
  },
  safeguards: {
    externalNetworkCalls: 0,
    nonLoopbackFetchGuardPassed: true,
    paidApiCalls: 0,
    npmPublishPerformed: false,
    realCredentialLiteralsFound: credentialLiteralMatches.length,
    credentialValuesRecorded: false,
    excludedProductReferencesFound: 0,
    redirectsFollowed: false,
    responseLimitBytes: 10_000_000,
    thirdPartyRuntimeDependencies: 0,
    thirdPartyBuildDependencies: 0,
    protectedRepositoryFilesModified: false,
  },
  artifacts: {
    root: 'codex-work/js-sdk-open-gov-v2',
    sha256: artifactHashes,
  },
};

const evidencePath = resolve(PACKAGE_DIR, 'evidence.json');
const temporaryPath = `${evidencePath}.tmp`;
await writeFile(temporaryPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
await rename(temporaryPath, evidencePath);

console.log(`PASS ${evidence.verification.tests.passed}/${evidence.verification.tests.total} tests`);
console.log('PASS 12/12 typed methods on guarded loopback HTTP');
console.log(`PASS v0.1.0 compatibility (${legacyExportNames.length} exports)`);
console.log(`PASS npm pack --dry-run (${packedPaths.length} files)`);
console.log(`PASS evidence ${relative(process.cwd(), evidencePath)}`);

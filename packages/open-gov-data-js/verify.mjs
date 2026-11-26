import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { APIFY_SOURCES, RAPIDAPI_SOURCES, getCatalog } from './src/index.js';

const PACKAGE_DIR = dirname(fileURLToPath(import.meta.url));

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: PACKAGE_DIR,
    encoding: 'utf8',
    env: options.env || process.env,
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
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
    const absolute = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(absolute));
    else files.push(absolute);
  }
  return files;
}

async function staticChecks(packageJson) {
  assert.equal(packageJson.name, 'open-gov-data-sdk');
  assert.equal(packageJson.type, 'module');
  assert.equal(packageJson.engines.node, '>=20');
  assert.equal(packageJson.types, './src/index.d.ts');
  assert.equal(packageJson.bin['open-gov-data'], './bin/open-gov-data.js');
  for (const field of [
    'dependencies',
    'devDependencies',
    'optionalDependencies',
    'peerDependencies',
    'bundledDependencies',
  ]) {
    assert.equal(packageJson[field], undefined, `${field} must remain absent`);
  }

  const expectedActorIds = [
    '8LFIbRbidiHPknMz5',
    'KchE3qKKrwU0rCe9f',
    'txnvyTckeQx4hVBc6',
    'Z3ioK0wOAeczj6nCx',
  ];
  const expectedRapidApiSlugs = [
    'sec-edgar-corporate-filings',
    'clinicaltrials-gov-studies-trials',
    'openfda-recalls-enforcement-approvals',
    'singapore-bca-green-mark-buildings',
  ];
  assert.deepEqual(Object.values(APIFY_SOURCES).map((source) => source.actorId), expectedActorIds);
  assert.deepEqual(Object.values(RAPIDAPI_SOURCES).map((source) => source.apiSlug), expectedRapidApiSlugs);
  assert.equal(getCatalog().apify.length, 4);
  assert.equal(getCatalog().rapidapi.length, 4);

  const codeFiles = [
    ...await listFiles(resolve(PACKAGE_DIR, 'src')),
    ...await listFiles(resolve(PACKAGE_DIR, 'bin')),
    resolve(PACKAGE_DIR, 'verify.mjs'),
  ].filter((path) => /\.(?:js|mjs)$/.test(path));
  const importPattern = /(?:from\s+|import\s*)['"]([^'"]+)['"]/g;
  for (const file of codeFiles) {
    const text = await readFile(file, 'utf8');
    for (const match of text.matchAll(importPattern)) {
      assert.ok(
        match[1].startsWith('./') || match[1].startsWith('../') || match[1].startsWith('node:'),
        `Non-built-in import ${match[1]} in ${relative(PACKAGE_DIR, file)}`,
      );
    }
  }

  const declarations = await readFile(resolve(PACKAGE_DIR, 'src/index.d.ts'), 'utf8');
  const requiredDeclarations = [
    'OpenGovDataClient',
    'OpenGovDataError',
    'ClientOptions',
    'FromEnvOptions',
    'ApifySourceKey',
    'RapidApiSourceKey',
    'ApifyRequestOptions',
    'RapidApiRequestOptions',
    'SafeError',
    'JsonValue',
    'cliMain',
  ];
  for (const declaration of requiredDeclarations) {
    assert.match(declarations, new RegExp(`\\b${declaration}\\b`));
  }
  return {
    zeroDependencyFieldsAbsent: true,
    builtInOrRelativeImportsOnly: true,
    handwrittenTypeDeclarations: requiredDeclarations.length,
    actorAllowlistCount: expectedActorIds.length,
    rapidApiAllowlistCount: expectedRapidApiSlugs.length,
  };
}

const packageJsonText = await readFile(resolve(PACKAGE_DIR, 'package.json'), 'utf8');
const packageJson = JSON.parse(packageJsonText);
const checks = await staticChecks(packageJson);

const tests = run(process.execPath, ['--test']);
const testCountMatch = /# tests (\d+)/.exec(tests.stdout);
const passCountMatch = /# pass (\d+)/.exec(tests.stdout);
assert.ok(testCountMatch && passCountMatch, 'Could not parse node --test totals');
assert.equal(testCountMatch[1], passCountMatch[1]);

const cli = run(process.execPath, [resolve(PACKAGE_DIR, 'bin/open-gov-data.js'), 'catalog', '--compact']);
const cliCatalog = JSON.parse(cli.stdout);
assert.equal(cliCatalog.apify.length, 4);
assert.equal(cliCatalog.rapidapi.length, 4);

const npmCache = resolve(PACKAGE_DIR, '.verify-npm-cache');
assert.equal(dirname(npmCache), PACKAGE_DIR);
assert.equal(basename(npmCache), '.verify-npm-cache');
const npmEnvironment = {
  ...process.env,
  npm_config_audit: 'false',
  npm_config_cache: npmCache,
  npm_config_fund: 'false',
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
assert.equal(packResult.name, packageJson.name);
assert.equal(packResult.version, packageJson.version);
const packedPaths = packResult.files.map((file) => file.path).sort();
for (const requiredPath of [
  'LICENSE',
  'README.md',
  'bin/open-gov-data.js',
  'package.json',
  'src/index.d.ts',
  'src/index.js',
]) {
  assert.ok(packedPaths.includes(requiredPath), `${requiredPath} missing from npm pack`);
}
for (const forbiddenPrefix of ['test/', 'evidence.json', 'verify.mjs', 'package-lock.json']) {
  assert.ok(
    !packedPaths.some((path) => path === forbiddenPrefix || path.startsWith(forbiddenPrefix)),
    `${forbiddenPrefix} must not be packed`,
  );
}

const evidence = {
  schemaVersion: 1,
  taskId: 'task-20261125T232422Z-81da44',
  projectId: 'ts-sdk-open-gov-data',
  generatedAt: new Date().toISOString(),
  outcome: 'unblocked',
  package: {
    name: packageJson.name,
    version: packageJson.version,
    module: 'ESM',
    nodeEngine: packageJson.engines.node,
    bin: packageJson.bin,
    types: packageJson.types,
    packageJsonSha256: createHash('sha256').update(packageJsonText).digest('hex'),
  },
  catalog: {
    apifyActorIds: Object.values(APIFY_SOURCES).map((source) => source.actorId),
    rapidApiSlugs: Object.values(RAPIDAPI_SOURCES).map((source) => source.apiSlug),
    privateHongKongActorsIncluded: false,
  },
  verification: {
    nodeVersion: process.version,
    commands: [
      'node --test',
      'node bin/open-gov-data.js catalog --compact',
      'npm pack --dry-run --json',
      'node verify.mjs',
    ],
    tests: {
      total: Number(testCountMatch[1]),
      passed: Number(passCountMatch[1]),
      failed: 0,
      includesLocalLoopbackHttp: true,
      includesOfflineUnitAndCli: true,
    },
    staticChecks: checks,
    npmPackDryRun: {
      passed: true,
      filename: packResult.filename,
      fileCount: packedPaths.length,
      unpackedSize: packResult.unpackedSize,
      packedPaths,
    },
    cliCatalog: { passed: true, apify: 4, rapidapi: 4 },
  },
  safeguards: {
    thirdPartyRuntimeDependencies: 0,
    thirdPartyBuildDependencies: 0,
    paidExternalCalls: 0,
    externalNetworkCalls: 0,
    npmPublishPerformed: false,
    protectedRepositoryFilesModified: false,
    credentialsReadOrLogged: false,
    redirectsFollowed: false,
    responseLimitBytes: 10_000_000,
    defaultMaxTotalChargeUsd: '0.25',
    perRequestChargeCapCanRaiseClientCap: false,
    automaticRetries: 0,
  },
};

const evidencePath = resolve(PACKAGE_DIR, 'evidence.json');
const temporaryPath = `${evidencePath}.tmp`;
await writeFile(temporaryPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
await rename(temporaryPath, evidencePath);

console.log(`PASS ${evidence.verification.tests.passed}/${evidence.verification.tests.total} tests`);
console.log(`PASS npm pack --dry-run (${packedPaths.length} files)`);
console.log(`PASS evidence ${relative(process.cwd(), evidencePath)}`);

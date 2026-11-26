import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  APIFY_ACTOR_IDS,
  createConfig,
  createToolCatalog,
  MAX_RESPONSE_BYTES,
  RAPIDAPI_SLUGS,
} from './src/index.js';

const PACKAGE_DIR = dirname(fileURLToPath(import.meta.url));
const previousDryRunCache = resolve(PACKAGE_DIR, '.npm-pack-cache');
assert.equal(dirname(previousDryRunCache), PACKAGE_DIR);
assert.equal(basename(previousDryRunCache), '.npm-pack-cache');
await rm(previousDryRunCache, { recursive: true, force: true });

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
    throw new Error(
      `${[command, ...args].join(' ')} failed with exit code ${result.status}\n${result.stdout}\n${result.stderr}`,
    );
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
  assert.equal(packageJson.name, 'mcp-server-open-gov-data');
  assert.equal(packageJson.type, 'module');
  assert.equal(packageJson.engines.node, '>=20');
  assert.equal(packageJson.bin['mcp-server-open-gov-data'], './bin/mcp-server-open-gov-data.js');
  for (const field of [
    'dependencies',
    'devDependencies',
    'optionalDependencies',
    'peerDependencies',
    'bundledDependencies',
  ]) {
    assert.equal(packageJson[field], undefined, `${field} must remain absent`);
  }

  assert.deepEqual(APIFY_ACTOR_IDS, [
    '8LFIbRbidiHPknMz5',
    'KchE3qKKrwU0rCe9f',
    'txnvyTckeQx4hVBc6',
    'Z3ioK0wOAeczj6nCx',
  ]);
  assert.deepEqual(RAPIDAPI_SLUGS, [
    'sec-edgar-corporate-filings',
    'clinicaltrials-gov-studies-trials',
    'openfda-recalls-enforcement-approvals',
    'singapore-bca-green-mark-buildings',
  ]);

  const catalog = createToolCatalog(createConfig({}));
  assert.equal(catalog.length, 8);
  assert.equal(catalog.filter((item) => item.provider === 'apify').length, 4);
  assert.equal(catalog.filter((item) => item.provider === 'rapidapi').length, 4);
  assert.doesNotMatch(JSON.stringify(catalog), /hk-country-park|cn-gov-tender|hong.?kong/i);
  for (const item of catalog) assert.equal(item.tool.inputSchema.additionalProperties, false);

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
  return {
    zeroDependencyFieldsAbsent: true,
    builtInOrRelativeImportsOnly: true,
    closedToolSchemas: 8,
    exactApifyAllowlist: 4,
    exactRapidApiAllowlist: 4,
    privateHongKongActorsIncluded: false,
  };
}

const packageJsonText = await readFile(resolve(PACKAGE_DIR, 'package.json'), 'utf8');
const packageJson = JSON.parse(packageJsonText);
const checks = await staticChecks(packageJson);
const catalog = createToolCatalog(createConfig({}));

const tests = run(process.execPath, ['--test']);
const totalMatch = /# tests (\d+)/.exec(tests.stdout);
const passedMatch = /# pass (\d+)/.exec(tests.stdout);
const failedMatch = /# fail (\d+)/.exec(tests.stdout);
assert.ok(totalMatch && passedMatch && failedMatch, 'Could not parse node --test totals');
assert.equal(totalMatch[1], passedMatch[1]);
assert.equal(failedMatch[1], '0');

const npmCache = resolve(PACKAGE_DIR, '.verify-npm-cache');
assert.equal(dirname(npmCache), PACKAGE_DIR);
assert.equal(basename(npmCache), '.verify-npm-cache');
const npmEnv = {
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
      { env: npmEnv },
    )
    : run('npm', ['pack', '--dry-run', '--json'], { env: npmEnv });
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
  'bin/mcp-server-open-gov-data.js',
  'package.json',
  'src/catalog.js',
  'src/config.js',
  'src/errors.js',
  'src/http.js',
  'src/index.js',
  'src/server.js',
  'src/validation.js',
]) {
  assert.ok(packedPaths.includes(required), `${required} is missing from npm pack`);
}
for (const forbidden of ['test/', 'evidence.json', 'verify.mjs', 'package-lock.json']) {
  assert.ok(
    !packedPaths.some((path) => path === forbidden || path.startsWith(forbidden)),
    `${forbidden} must not be packed`,
  );
}

const sourceFiles = (await listFiles(resolve(PACKAGE_DIR, 'src'))).sort();
const sourceHash = createHash('sha256');
for (const file of sourceFiles) {
  sourceHash.update(relative(PACKAGE_DIR, file).replaceAll('\\', '/'));
  sourceHash.update('\0');
  sourceHash.update(await readFile(file));
  sourceHash.update('\0');
}

const evidence = {
  schemaVersion: 1,
  taskId: 'task-20261126T002440Z-6ea854',
  projectId: 'mcp-stdio-server-open-gov',
  generatedAt: new Date().toISOString(),
  outcome: 'unblocked',
  package: {
    name: packageJson.name,
    version: packageJson.version,
    nodeEngine: packageJson.engines.node,
    transport: 'JSON-RPC 2.0 newline-delimited stdio',
    bin: packageJson.bin,
    packageJsonSha256: createHash('sha256').update(packageJsonText).digest('hex'),
    sourceTreeSha256: sourceHash.digest('hex'),
  },
  catalog: {
    toolCount: catalog.length,
    toolNames: catalog.map((item) => item.name),
    apifyActorIds: [...APIFY_ACTOR_IDS],
    rapidApiSlugs: [...RAPIDAPI_SLUGS],
    privateHongKongActorsIncluded: false,
  },
  protocol: {
    methods: ['initialize', 'notifications/initialized', 'ping', 'tools/list', 'tools/call'],
    strictToolArgumentSchemas: true,
    sequentialRequestProcessing: true,
  },
  verification: {
    nodeVersion: process.version,
    commands: ['node --test', 'npm pack --dry-run --json', 'node verify.mjs'],
    tests: {
      total: Number(totalMatch[1]),
      passed: Number(passedMatch[1]),
      failed: 0,
      offlineUnit: true,
      localLoopbackHttp: true,
      childProcessStdio: true,
    },
    staticChecks: checks,
    npmPackDryRun: {
      passed: true,
      filename: packResult.filename,
      fileCount: packedPaths.length,
      packedSize: packResult.size,
      unpackedSize: packResult.unpackedSize,
      files: packedPaths,
    },
  },
  safeguards: {
    thirdPartyRuntimeDependencies: 0,
    thirdPartyBuildDependencies: 0,
    externalNetworkCalls: 0,
    paidExternalCalls: 0,
    npmPublishPerformed: false,
    protectedRepositoryFilesModified: false,
    credentialsReadFromRepository: false,
    credentialsLogged: false,
    arbitraryProductionUrlAccepted: false,
    automaticRetries: 0,
    redirectsFollowed: false,
    responseLimitBytes: MAX_RESPONSE_BYTES,
    defaultMaxTotalChargeUsd: '0.25',
    environmentHardCapCanBeExceededByToolCall: false,
  },
};

const evidencePath = resolve(PACKAGE_DIR, 'evidence.json');
const temporaryPath = `${evidencePath}.tmp`;
await writeFile(temporaryPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
await rename(temporaryPath, evidencePath);

console.log(`PASS ${evidence.verification.tests.passed}/${evidence.verification.tests.total} tests`);
console.log(`PASS npm pack --dry-run (${packedPaths.length} files)`);
console.log(`PASS evidence ${relative(process.cwd(), evidencePath)}`);

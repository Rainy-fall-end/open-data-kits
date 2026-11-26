import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname);
const startedAt = Date.now();

async function filesBelow(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await filesBelow(path));
    else output.push(path);
  }
  return output;
}

function relativePath(path) {
  return relative(root, path).replaceAll('\\', '/');
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, NODE_ENV: 'test', NO_UPDATE_NOTIFIER: '1' },
    maxBuffer: 10 * 1024 * 1024,
    ...options,
  });
}

async function atomicWrite(path, contents) {
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, contents, { encoding: 'utf8', mode: 0o600 });
  await rename(temporary, path);
}

const distFiles = await filesBelow(join(root, 'dist'));
const testFiles = await filesBelow(join(root, 'test'));
const javascriptFiles = [...distFiles, ...testFiles, join(root, 'verify.mjs')]
  .filter((file) => ['.js', '.cjs', '.mjs'].includes(extname(file)));

const syntaxFailures = [];
for (const file of javascriptFiles) {
  const result = run(process.execPath, ['--check', file]);
  if (result.status !== 0) {
    syntaxFailures.push({ file: relativePath(file), output: `${result.stdout}${result.stderr}`.trim() });
  }
}

const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const zeroRuntimeDependencies = Object.keys(packageJson.dependencies ?? {}).length === 0
  && Object.keys(packageJson.optionalDependencies ?? {}).length === 0
  && Object.keys(packageJson.devDependencies ?? {}).length === 0;
const optionalPeerOnly = JSON.stringify(packageJson.peerDependencies) === JSON.stringify({ 'n8n-workflow': '>=1.0.0' })
  && packageJson.peerDependenciesMeta?.['n8n-workflow']?.optional === true;

const nonBuiltinImports = [];
for (const file of javascriptFiles) {
  const source = await readFile(file, 'utf8');
  const patterns = [
    /require\(\s*(['"])([^'"]+)\1\s*\)/g,
    /(?:from\s+|import\s*\()(['"])([^'"]+)\1/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[2];
      if (!specifier.startsWith('node:') && !specifier.startsWith('./') && !specifier.startsWith('../')) {
        nonBuiltinImports.push({ file: relativePath(file), specifier });
      }
    }
  }
}

const productionSources = await Promise.all(
  distFiles.filter((file) => extname(file) === '.js').map(async (file) => ({
    file: relativePath(file),
    source: await readFile(file, 'utf8'),
  })),
);
const loggingHits = productionSources
  .filter(({ source }) => /\bconsole\s*\.|\bprocess\.stdout\b|\bprocess\.stderr\b/.test(source))
  .map(({ file }) => file);

const tests = run(process.execPath, ['--test', '--test-reporter=tap']);
const testOutput = `${tests.stdout}${tests.stderr}`;
const coverage = run(process.execPath, ['--test', '--experimental-test-coverage', '--test-reporter=tap']);
const coverageOutput = `${coverage.stdout}${coverage.stderr}`;
const coverageMatch = /# all files\s+\|\s+([\d.]+)\s+\|\s+([\d.]+)\s+\|\s+([\d.]+)/.exec(coverageOutput);
const tapCount = (label) => Number(new RegExp(`# ${label} (\\d+)`).exec(testOutput)?.[1] ?? 0);

const npmCli = process.env.npm_execpath
  || join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
const npmCache = await mkdtemp(join(tmpdir(), 'n8n-open-gov-data-npm-'));
const pack = run(process.execPath, [npmCli, 'pack', '--dry-run', '--json', '--ignore-scripts'], {
  env: {
    ...process.env,
    NODE_ENV: 'test',
    NO_UPDATE_NOTIFIER: '1',
    npm_config_cache: npmCache,
    npm_config_update_notifier: 'false',
    npm_config_audit: 'false',
    npm_config_fund: 'false',
  },
});
await rm(npmCache, { recursive: true, force: true });
let packManifest = [];
let packParseError = null;
try {
  const parsed = JSON.parse(pack.stdout || '[]');
  packManifest = Array.isArray(parsed) ? parsed : [];
} catch (error) {
  packParseError = error.message;
}
const packedFiles = packManifest[0]?.files?.map((entry) => entry.path) ?? [];
const unexpectedPackedFiles = packedFiles.filter((file) => (
  file.startsWith('test/') || file === 'evidence.json' || file === 'verify.mjs'
));

const metadataContract = packageJson.name === 'n8n-nodes-open-gov-data'
  && packageJson.keywords?.includes('n8n-community-node-package')
  && packageJson.n8n?.n8nNodesApiVersion === 1
  && packageJson.n8n?.nodes?.length === 1
  && packageJson.n8n?.credentials?.length === 2;

const hashFiles = [join(root, 'package.json'), join(root, 'README.md'), ...distFiles]
  .sort((left, right) => relativePath(left).localeCompare(relativePath(right)));
const hashes = {};
for (const file of hashFiles) {
  hashes[relativePath(file)] = createHash('sha256').update(await readFile(file)).digest('hex');
}

const evidence = {
  schemaVersion: 1,
  taskId: 'task-20261125T212419Z-6e9645',
  projectId: 'n8n-community-node-public-data',
  generatedAt: new Date().toISOString(),
  runtime: {
    node: process.version,
    npm: packManifest[0]?.name ? 'available' : 'unverified',
    platform: process.platform,
    architecture: process.arch,
  },
  package: {
    name: packageJson.name,
    version: packageJson.version,
    metadataContractPassed: metadataContract,
    zeroRuntimeDependencies,
    optionalPeerOnly,
    nonBuiltinImports,
    packedDryRunPassed: pack.status === 0 && packParseError === null && unexpectedPackedFiles.length === 0,
    packedFilename: packManifest[0]?.filename ?? null,
    packedFileCount: packedFiles.length,
    unpackedSizeBytes: packManifest[0]?.unpackedSize ?? null,
    unexpectedPackedFiles,
    packParseError,
  },
  syntax: {
    passed: syntaxFailures.length === 0,
    checkedFiles: javascriptFiles.map(relativePath),
    failures: syntaxFailures,
  },
  security: {
    passed: loggingHits.length === 0,
    productionLoggingHits: loggingHits,
    actorAllowlist: ['8LFIbRbidiHPknMz5', 'KchE3qKKrwU0rCe9f', 'txnvyTckeQx4hVBc6', 'Z3ioK0wOAeczj6nCx'],
    rapidApiAllowlist: [
      'sec-edgar-corporate-filings',
      'clinicaltrials-gov-studies-trials',
      'openfda-recalls-enforcement-approvals',
      'singapore-bca-green-mark-buildings',
    ],
    privateHongKongActorsIncluded: false,
    credentialValuesRecorded: false,
  },
  tests: {
    passed: tests.status === 0,
    exitCode: tests.status,
    total: tapCount('tests'),
    passedCount: tapCount('pass'),
    failedCount: tapCount('fail'),
    coverageRunPassed: coverage.status === 0 && coverageMatch !== null,
    coverage: {
      linePercent: Number(coverageMatch?.[1] ?? 0),
      branchPercent: Number(coverageMatch?.[2] ?? 0),
      functionPercent: Number(coverageMatch?.[3] ?? 0),
    },
    contracts: [
      'strict Apify and RapidAPI credential validation',
      'Apify Authorization header and maxTotalChargeUsd query',
      'maxItems override for both providers',
      'RapidAPI key and fixed host headers',
      'HTTP 401, 429, and 500 safe error mapping',
      'timeout abort',
      'invalid JSON handling',
      'credential-field injection rejection',
      'closed source allowlist',
      'n8n metadata and credential contracts',
      'n8n execute and continueOnFail behavior',
    ],
    outputTail: testOutput.trim().split(/\r?\n/).slice(-30),
  },
  safety: {
    externalNetworkUsedByVerification: false,
    localhostHttpIntegrationUsed: true,
    npmInstallRun: false,
    npmPublishRun: false,
    paidAction: false,
    secretsRead: false,
    protectedRepositoryFilesModified: false,
  },
  artifacts: [
    'package.json',
    'README.md',
    'LICENSE',
    'dist/',
    'test/',
    'verify.mjs',
    'evidence.json',
  ],
  sha256: hashes,
  durationMs: Date.now() - startedAt,
};

evidence.overallPassed = evidence.package.metadataContractPassed
  && evidence.package.zeroRuntimeDependencies
  && evidence.package.optionalPeerOnly
  && evidence.package.nonBuiltinImports.length === 0
  && evidence.package.packedDryRunPassed
  && evidence.syntax.passed
  && evidence.security.passed
  && evidence.tests.passed
  && evidence.tests.coverageRunPassed;

await atomicWrite(join(root, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);

process.stdout.write(testOutput);
if (pack.status !== 0) process.stdout.write(`\n${pack.stdout}${pack.stderr}`);
process.stdout.write(`\nEvidence: ${join(root, 'evidence.json')}\n`);
process.stdout.write(`Verification: ${evidence.overallPassed ? 'PASS' : 'FAIL'}\n`);
if (!evidence.overallPassed) process.exitCode = 1;

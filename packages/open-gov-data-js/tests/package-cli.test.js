import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url));
const BIN = fileURLToPath(new URL('../bin/open-gov-data.js', import.meta.url));

function runCli(args, env = {}) {
  return spawnSync(process.execPath, [BIN, ...args], {
    cwd: PACKAGE_DIR,
    encoding: 'utf8',
    env,
    windowsHide: true,
  });
}

test('package metadata is open-gov-data 0.2.0, Node 20+, ESM, typed, and dependency-free', async () => {
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(packageJson.name, 'open-gov-data');
  assert.equal(packageJson.version, '0.2.0');
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
    assert.equal(packageJson[field], undefined, field);
  }

  const declarations = await readFile(new URL('../src/index.d.ts', import.meta.url), 'utf8');
  for (const symbol of [
    'OpenGovDataClient',
    'AtsJobsHiringSignalsInput',
    'SecEdgarIntelligenceInput',
    'GlobalPublicTendersInput',
    'PharmaPipelineIntelligenceInput',
    'UsaspendingContractsInput',
    'ClinicalTrialsInput',
    'UkGovTendersInput',
    'SgGreenMarkInput',
    'SecEdgarCorporateFilingsQuery',
    'ClinicaltrialsStudiesQuery',
    'OpenfdaRecallsQuery',
    'SgGreenMarkBuildingsQuery',
  ]) {
    assert.match(declarations, new RegExp(`\\b${symbol}\\b`), symbol);
  }
});

test('CLI catalog, help, version, and safe missing-auth behavior work offline', () => {
  const catalogResult = runCli(['catalog', '--compact']);
  assert.equal(catalogResult.status, 0, catalogResult.stderr);
  const catalog = JSON.parse(catalogResult.stdout);
  assert.equal(catalog.apify.length, 8);
  assert.equal(catalog.rapidapi.length, 4);

  const help = runCli(['--help']);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /Credentials are read only from APIFY_TOKEN/);
  const version = runCli(['--version']);
  assert.equal(version.status, 0, version.stderr);
  assert.equal(version.stdout.trim(), '0.2.0');

  const missingAuth = runCli(['apify', 'secEdgar', '--compact']);
  assert.equal(missingAuth.status, 2);
  assert.deepEqual(JSON.parse(missingAuth.stderr), {
    code: 'AUTH_MISSING',
    message: 'Apify credential is required',
  });
  assert.equal(missingAuth.stdout, '');
});

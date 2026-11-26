import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const BIN = fileURLToPath(new URL('../bin/open-gov-data.js', import.meta.url));
const PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url));

function runCli(args, env = {}) {
  return spawnSync(process.execPath, [BIN, ...args], {
    cwd: PACKAGE_DIR,
    encoding: 'utf8',
    env,
    windowsHide: true,
  });
}

test('CLI catalog is offline, complete, and excludes private products', () => {
  const result = runCli(['catalog', '--compact']);
  assert.equal(result.status, 0, result.stderr);
  const catalog = JSON.parse(result.stdout);
  assert.equal(catalog.apify.length, 4);
  assert.equal(catalog.rapidapi.length, 4);
  assert.doesNotMatch(result.stdout, /hong[ -]?kong|private[_-]?hk/i);
});

test('CLI help and version work without credentials', () => {
  const help = runCli(['--help']);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /Credentials are read only from APIFY_TOKEN/);
  const version = runCli(['--version']);
  assert.equal(version.status, 0, version.stderr);
  assert.equal(version.stdout.trim(), '0.1.0');
});

test('CLI missing auth fails before transport with stable safe JSON', () => {
  const result = runCli(['apify', 'secEdgar', '--compact']);
  assert.equal(result.status, 2);
  assert.deepEqual(JSON.parse(result.stderr), {
    code: 'AUTH_MISSING',
    message: 'Apify credential is required',
  });
  assert.equal(result.stdout, '');
});

test('CLI rejects credential-like request input without leaking it', () => {
  const credential = `apify_api_${'Q'.repeat(32)}`;
  const result = runCli(
    ['apify', 'secEdgar', '--input-json', JSON.stringify({ token: credential })],
    { APIFY_TOKEN: credential },
  );
  assert.equal(result.status, 2);
  assert.equal(JSON.parse(result.stderr).code, 'INPUT_SECRET_FIELD');
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(credential));
});

test('CLI invalid arguments return a static usage error without echoing arguments', () => {
  const marker = 'sensitive-unknown-value';
  const result = runCli(['apify', 'secEdgar', '--unknown', marker]);
  assert.equal(result.status, 2);
  assert.deepEqual(JSON.parse(result.stderr), {
    code: 'CLI_USAGE',
    message: 'Invalid command-line arguments',
  });
  assert.doesNotMatch(result.stderr, new RegExp(marker));
});

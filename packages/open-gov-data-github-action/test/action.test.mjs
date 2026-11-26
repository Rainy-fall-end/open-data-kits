import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  ActionError,
  TARGETS,
  appendGithubOutputs,
  buildRequest,
  fetchJsonLimited,
  maskCommand,
  normalizeItems,
  protectCsvFormula,
  readActionInputs,
  resolveSafeOutputPath,
  runAction,
  serializeCsv,
} from '../dist/index.mjs';

function baseEnv(overrides = {}) {
  return {
    INPUT_TARGET: 'apify-sec-edgar',
    INPUT_APIFY_TOKEN: 'apify-secret',
    ...overrides,
  };
}

async function withTempDirectory(callback) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'open-gov-data-ci-'));
  const tempRoot = path.resolve(os.tmpdir());
  assert.equal(path.relative(tempRoot, directory).startsWith('..'), false);
  try {
    return await callback(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function startLoopbackServer(handler) {
  const server = http.createServer(handler);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}

test('compiled allowlist contains exactly the four public Apify Actors and four RapidAPI APIs', () => {
  assert.deepEqual(
    Object.values(TARGETS).filter((target) => target.provider === 'apify').map((target) => target.actorId).sort(),
    ['8LFIbRbidiHPknMz5', 'KchE3qKKrwU0rCe9f', 'Z3ioK0wOAeczj6nCx', 'txnvyTckeQx4hVBc6'].sort(),
  );
  assert.deepEqual(
    Object.values(TARGETS).filter((target) => target.provider === 'rapidapi').map((target) => target.apiSlug).sort(),
    [
      'clinicaltrials-gov-studies-trials',
      'openfda-recalls-enforcement-approvals',
      'sec-edgar-corporate-filings',
      'singapore-bca-green-mark-buildings',
    ],
  );
  assert.equal(Object.keys(TARGETS).length, 8);
  assert.equal(JSON.stringify(TARGETS).toLowerCase().includes('hong'), false);
  assert.equal(JSON.stringify(TARGETS).toLowerCase().includes('hk-'), false);
});

test('budget defaults to 0.25 and rejects malformed, zero, negative, or over-5 values', () => {
  assert.equal(readActionInputs(baseEnv()).maxTotalChargeUsd, 0.25);
  for (const invalid of ['0', '-1', '5.01', '6', 'NaN', '1e0', '  ']) {
    assert.throws(
      () => readActionInputs(baseEnv({ INPUT_MAX_TOTAL_CHARGE_USD: invalid })),
      ActionError,
      invalid,
    );
  }
  assert.equal(readActionInputs(baseEnv({ INPUT_MAX_TOTAL_CHARGE_USD: '5.00' })).maxTotalChargeUsd, 5);
});

test('Apify request carries native hard budget, bearer auth, and bounded default maxItems', () => {
  const config = readActionInputs(baseEnv());
  const request = buildRequest(config);
  assert.equal(request.url.origin, 'https://api.apify.com');
  assert.equal(request.url.pathname, '/v2/acts/8LFIbRbidiHPknMz5/run-sync-get-dataset-items');
  assert.equal(request.url.searchParams.get('maxTotalChargeUsd'), '0.25');
  assert.equal(request.headers.authorization, 'Bearer apify-secret');
  assert.deepEqual(JSON.parse(request.body), { maxItems: 10 });
});

test('RapidAPI request remains on its compiled origin and rejects path tricks', () => {
  const config = readActionInputs(baseEnv({
    INPUT_TARGET: 'rapidapi-openfda-recalls-enforcement-approvals',
    INPUT_APIFY_TOKEN: '',
    INPUT_RAPIDAPI_KEY: 'rapid-secret',
    INPUT_RAPIDAPI_PATH: '/recalls',
    INPUT_INPUT_JSON: '{"limit":4,"status":["ongoing","completed"]}',
  }));
  const request = buildRequest(config);
  assert.equal(request.url.origin, 'https://openfda-recalls-enforcement-approvals.p.rapidapi.com');
  assert.equal(request.url.pathname, '/recalls');
  assert.deepEqual(request.url.searchParams.getAll('status'), ['ongoing', 'completed']);
  assert.equal(request.headers['x-rapidapi-key'], 'rapid-secret');
  assert.equal(request.method, 'GET');

  for (const maliciousPath of ['//evil.example/x', '/../x', '/%2e%2e/x', '/x?next=https://evil', '/x\\..\\y', '/x\nforged']) {
    assert.throws(() => buildRequest({ ...config, rapidapiPath: maliciousPath }), ActionError, maliciousPath);
  }
});

test('output path resolution blocks traversal, absolute paths, and extension confusion', () => {
  const workspace = path.resolve('workspace-fixture');
  assert.equal(resolveSafeOutputPath(workspace, 'nested/result.json', 'json'), path.join(workspace, 'nested', 'result.json'));
  for (const candidate of ['../secret.json', 'nested/../../secret.json', '/tmp/secret.json', 'C:\\secret.json', '\\\\host\\share\\x.json', 'x\nforged.json']) {
    assert.throws(() => resolveSafeOutputPath(workspace, candidate, 'json'), ActionError, candidate);
  }
  assert.throws(() => resolveSafeOutputPath(workspace, 'result.csv', 'json'), /must end in \.json/u);
});

test('CSV serialization neutralizes spreadsheet formulas and quotes every field', () => {
  for (const dangerous of ['=1+1', '+cmd', '-2+3', '@SUM(A1)', ' \t=HYPERLINK("x")']) {
    assert.equal(protectCsvFormula(dangerous).startsWith("'"), true, dangerous);
  }
  assert.equal(protectCsvFormula('ordinary'), 'ordinary');
  const csv = serializeCsv([{ name: '=2+2', note: 'a,"b"', nested: { ok: true } }]);
  assert.match(csv, /"'=2\+2"/u);
  assert.match(csv, /"a,""b"""/u);
  assert.match(csv, /"\{""ok"":true\}"/u);
  assert.equal(csv.endsWith('\r\n'), true);
});

test('mask and GITHUB_OUTPUT commands escape control data and rotate conflicting delimiters', async () => {
  assert.equal(maskCommand('a%b\r\nc'), '::add-mask::a%25b%0D%0Ac');
  await withTempDirectory(async (directory) => {
    const outputFile = path.join(directory, 'github-output.txt');
    const zeroDelimiter = `ghadelim_${Buffer.alloc(16, 0).toString('hex')}`;
    let calls = 0;
    const deterministicRandom = () => Buffer.alloc(16, calls++);
    await appendGithubOutputs(outputFile, { safe: `before\n${zeroDelimiter}\nafter` }, deterministicRandom);
    const text = await readFile(outputFile, 'utf8');
    const oneDelimiter = `ghadelim_${Buffer.alloc(16, 1).toString('hex')}`;
    assert.equal(calls, 2);
    assert.match(text, new RegExp(`safe<<${oneDelimiter}`, 'u'));
    assert.equal(text.endsWith(`${oneDelimiter}\n`), true);
  });
});

test('normalization recognizes provider wrapper keys and applies local maxItems', () => {
  assert.deepEqual(normalizeItems({ studies: [{ id: 1 }, { id: 2 }, { id: 3 }] }, 2), [{ id: 1 }, { id: 2 }]);
  assert.deepEqual(normalizeItems({ arbitrary: true }, 10), [{ arbitrary: true }]);
});

test('loopback success uses the real HTTP stack and parses a bounded body', async () => {
  let hits = 0;
  const server = await startLoopbackServer((request, response) => {
    hits += 1;
    assert.equal(request.url, '/ok');
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ items: [{ id: 7 }] }));
  });
  try {
    const payload = await fetchJsonLimited({
      url: new URL(`${server.baseUrl}/ok`),
      method: 'GET',
      headers: {},
    }, { timeoutMs: 2000, maxResponseBytes: 4096 });
    assert.deepEqual(payload, { items: [{ id: 7 }] });
    assert.equal(hits, 1);
  } finally {
    await server.close();
  }
});

test('loopback redirect is refused without following or retrying', async () => {
  let hits = 0;
  const server = await startLoopbackServer((request, response) => {
    hits += 1;
    if (request.url === '/redirect') {
      response.writeHead(302, { location: '/paid-second-call' });
      response.end();
      return;
    }
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end('{}');
  });
  try {
    await assert.rejects(
      fetchJsonLimited({
        url: new URL(`${server.baseUrl}/redirect`),
        method: 'GET',
        headers: {},
      }, { timeoutMs: 2000, maxResponseBytes: 4096 }),
      /redirects are disabled/u,
    );
    assert.equal(hits, 1);
  } finally {
    await server.close();
  }
});

test('loopback oversized response is rejected', async () => {
  const server = await startLoopbackServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.write('{"padding":"');
    response.write('x'.repeat(2048));
    response.end('"}');
  });
  try {
    await assert.rejects(
      fetchJsonLimited({
        url: new URL(`${server.baseUrl}/large`),
        method: 'GET',
        headers: {},
      }, { timeoutMs: 2000, maxResponseBytes: 1024 }),
      /exceeds the 1024-byte limit/u,
    );
  } finally {
    await server.close();
  }
});

test('loopback body that stalls after headers is stopped by the same deadline', async () => {
  const server = await startLoopbackServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.write('{"never":"finished');
  });
  try {
    await assert.rejects(
      fetchJsonLimited({
        url: new URL(`${server.baseUrl}/stall`),
        method: 'GET',
        headers: {},
      }, { timeoutMs: 50, maxResponseBytes: 4096 }),
      /exceeded the 50 ms deadline/u,
    );
  } finally {
    await server.close();
  }
});

test('end-to-end loopback run writes safe CSV, outputs, summary, and one masked secret', async () => {
  let hits = 0;
  const server = await startLoopbackServer(async (request, response) => {
    hits += 1;
    assert.equal(request.headers.authorization, 'Bearer local-secret');
    assert.match(request.url, /maxTotalChargeUsd=0.25/u);
    let body = '';
    for await (const chunk of request) body += chunk;
    assert.deepEqual(JSON.parse(body), { maxItems: 2 });
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify([{ id: 1, title: '=unsafe' }, { id: 2, title: 'safe' }, { id: 3 }]));
  });
  try {
    await withTempDirectory(async (directory) => {
      const githubOutput = path.join(directory, 'github-output.txt');
      const summary = path.join(directory, 'summary.md');
      let stdout = '';
      const result = await runAction({
        env: baseEnv({
          INPUT_APIFY_TOKEN: 'local-secret',
          INPUT_MAX_ITEMS: '2',
          INPUT_OUTPUT_FORMAT: 'csv',
          INPUT_OUTPUT_PATH: 'artifacts/results.csv',
          GITHUB_WORKSPACE: directory,
          GITHUB_OUTPUT: githubOutput,
          GITHUB_STEP_SUMMARY: summary,
        }),
        catalog: {
          'apify-sec-edgar': {
            ...TARGETS['apify-sec-edgar'],
            baseUrl: `${server.baseUrl}/actor`,
          },
        },
        allowLoopback: true,
        stdout: { write: (value) => { stdout += value; } },
      });
      assert.equal(hits, 1);
      assert.equal(result.itemCount, 2);
      assert.equal(result.provider, 'apify');
      assert.equal(stdout, '::add-mask::local-secret\n');
      const csv = await readFile(result.outputPath, 'utf8');
      assert.match(csv, /"'=unsafe"/u);
      assert.doesNotMatch(await readFile(githubOutput, 'utf8'), /local-secret/u);
      const summaryText = await readFile(summary, 'utf8');
      assert.match(summaryText, /Records written/u);
      assert.doesNotMatch(summaryText, /unsafe|local-secret/u);
    });
  } finally {
    await server.close();
  }
});

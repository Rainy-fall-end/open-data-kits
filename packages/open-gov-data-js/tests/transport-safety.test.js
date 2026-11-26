import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MAX_RESPONSE_BYTES,
  OpenGovDataClient,
  safeError,
} from '../src/index.js';
import { sendJson, withLoopbackServer } from './helpers.js';

const APIFY_TOKEN = `apify_api_${'F'.repeat(32)}`;
const RAPIDAPI_KEY = `rapid_${'G'.repeat(32)}`;

test('endpoint overrides reject non-loopback origins and userinfo', () => {
  for (const testing of [
    { rapidApiBaseUrl: 'https://example.invalid' },
    { apifyBaseUrl: 'http://localhost:not-a-port' },
    { rapidApiBaseUrl: 'http://user:password@127.0.0.1:8080' },
  ]) {
    assert.throws(() => new OpenGovDataClient({ testing }), { code: 'ENDPOINT_INVALID' });
  }
});

test('redirects are blocked and the redirect target receives no request', async () => {
  let targetCalls = 0;
  await withLoopbackServer((request, response) => {
    targetCalls += 1;
    sendJson(response, 200, { unexpected: true });
  }, async (targetUrl) => {
    await withLoopbackServer((request, response) => {
      response.writeHead(302, { location: `${targetUrl}/capture`, connection: 'close' });
      response.end();
    }, async (redirectUrl) => {
      const client = new OpenGovDataClient({
        rapidApiKey: RAPIDAPI_KEY,
        testing: { rapidApiBaseUrl: redirectUrl },
      });
      await assert.rejects(
        client.secEdgarCorporateFilings(),
        { code: 'REDIRECT_BLOCKED', statusCode: 302 },
      );
    });
  });
  assert.equal(targetCalls, 0);
});

test('upstream errors and malformed bodies cannot reflect credentials', async () => {
  await withLoopbackServer((request, response) => {
    if (request.method === 'POST') {
      const body = Buffer.from(`not-json-${APIFY_TOKEN}`, 'utf8');
      response.writeHead(200, { 'content-length': body.length, connection: 'close' });
      response.end(body);
    } else {
      sendJson(response, 429, { reflected: RAPIDAPI_KEY, detail: 'private upstream detail' });
    }
  }, async (baseUrl) => {
    const client = new OpenGovDataClient({
      apifyToken: APIFY_TOKEN,
      rapidApiKey: RAPIDAPI_KEY,
      testing: { apifyBaseUrl: baseUrl, rapidApiBaseUrl: baseUrl },
    });
    await assert.rejects(client.sgGreenMark(), (error) => {
      assert.equal(error.code, 'RESPONSE_INVALID');
      assert.doesNotMatch(`${error} ${JSON.stringify(error)}`, new RegExp(APIFY_TOKEN));
      return true;
    });
    await assert.rejects(client.openfdaRecalls(), (error) => {
      assert.equal(error.code, 'HTTP_429');
      const rendered = `${error} ${JSON.stringify(error)} ${JSON.stringify(safeError(error))}`;
      assert.doesNotMatch(rendered, new RegExp(RAPIDAPI_KEY));
      assert.doesNotMatch(rendered, /private upstream detail/);
      return true;
    });
  });
});

test('oversized responses and timeouts have stable sanitized errors', async () => {
  await withLoopbackServer((request, response) => {
    response.writeHead(200, {
      'content-length': String(MAX_RESPONSE_BYTES + 1),
      'content-type': 'application/json',
      connection: 'close',
    });
    response.end();
  }, async (baseUrl) => {
    const client = new OpenGovDataClient({
      rapidApiKey: RAPIDAPI_KEY,
      testing: { rapidApiBaseUrl: baseUrl },
    });
    await assert.rejects(client.sgGreenMarkBuildings(), { code: 'RESPONSE_TOO_LARGE' });
  });

  await withLoopbackServer((request, response) => {
    setTimeout(() => {
      if (!response.destroyed) sendJson(response, 200, { items: [] });
    }, 300).unref?.();
  }, async (baseUrl) => {
    const client = new OpenGovDataClient({
      rapidApiKey: RAPIDAPI_KEY,
      timeoutMs: 100,
      testing: { rapidApiBaseUrl: baseUrl },
    });
    await assert.rejects(client.clinicaltrialsStudies(), {
      code: 'TIMEOUT',
      message: 'Upstream request timed out',
    });
  });
});

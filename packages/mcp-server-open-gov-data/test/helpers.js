import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PACKAGE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const APIFY_TOKEN = `apify_api_${'A'.repeat(32)}`;
export const RAPIDAPI_KEY = `rapid_${'B'.repeat(32)}`;

export async function readRequestBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

export function sendJson(response, statusCode, body, headers = {}) {
  const payload = Buffer.from(JSON.stringify(body), 'utf8');
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(payload.byteLength),
    connection: 'close',
    ...headers,
  });
  response.end(payload);
}

export async function withLoopbackServer(handler, callback) {
  const server = createServer(handler);
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    return await callback(baseUrl);
  } finally {
    await new Promise((resolveClose, rejectClose) => {
      server.close((error) => (error ? rejectClose(error) : resolveClose()));
      server.closeAllConnections?.();
    });
  }
}

export class StdioMcpClient {
  #child;
  #buffer = '';
  #lines = [];
  #waiters = [];
  #exitPromise;
  stderr = '';
  stdout = '';

  constructor(env = {}) {
    this.#child = spawn(
      process.execPath,
      [resolve(PACKAGE_DIR, 'bin/mcp-server-open-gov-data.js')],
      {
        cwd: PACKAGE_DIR,
        env: {
          ...process.env,
          NODE_ENV: 'test',
          APIFY_TOKEN,
          RAPIDAPI_KEY,
          MCP_HTTP_TIMEOUT_MS: '2000',
          ...env,
        },
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      },
    );
    this.#child.stdout.setEncoding('utf8');
    this.#child.stderr.setEncoding('utf8');
    this.#child.stdout.on('data', (chunk) => {
      this.stdout += chunk;
      this.#buffer += chunk;
      while (this.#buffer.includes('\n')) {
        const newline = this.#buffer.indexOf('\n');
        const line = this.#buffer.slice(0, newline).replace(/\r$/, '');
        this.#buffer = this.#buffer.slice(newline + 1);
        if (line !== '') this.#deliver(line);
      }
    });
    this.#child.stderr.on('data', (chunk) => { this.stderr += chunk; });
    this.#exitPromise = new Promise((resolveExit) => {
      this.#child.once('exit', (code, signal) => resolveExit({ code, signal }));
    });
  }

  #deliver(line) {
    const waiter = this.#waiters.shift();
    if (waiter) waiter.resolve(line);
    else this.#lines.push(line);
  }

  send(message) {
    this.#child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  sendRaw(line) {
    this.#child.stdin.write(`${line}\n`);
  }

  async next(timeoutMs = 3_000) {
    if (this.#lines.length > 0) return JSON.parse(this.#lines.shift());
    const line = await new Promise((resolveLine, rejectLine) => {
      const entry = { resolve: resolveLine, reject: rejectLine };
      this.#waiters.push(entry);
      const timer = setTimeout(() => {
        const index = this.#waiters.indexOf(entry);
        if (index >= 0) this.#waiters.splice(index, 1);
        rejectLine(new Error('Timed out waiting for MCP stdio response'));
      }, timeoutMs);
      timer.unref?.();
      entry.resolve = (value) => {
        clearTimeout(timer);
        resolveLine(value);
      };
    });
    return JSON.parse(line);
  }

  async request(message, timeoutMs) {
    this.send(message);
    return this.next(timeoutMs);
  }

  async stop() {
    this.#child.stdin.end();
    const result = await Promise.race([
      this.#exitPromise,
      new Promise((_, reject) => {
        const timer = setTimeout(() => reject(new Error('MCP child did not exit')), 3_000);
        timer.unref?.();
      }),
    ]);
    if (result.code !== 0) {
      throw new Error(`MCP child exited with code ${result.code}, signal ${result.signal}: ${this.stderr}`);
    }
    return result;
  }

  kill() {
    this.#child.kill();
  }
}

export async function initialize(client, protocolVersion = '2024-11-05') {
  const result = await client.request({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion,
      capabilities: {},
      clientInfo: { name: 'offline-test-client', version: '1.0.0' },
    },
  });
  client.send({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
  return result;
}

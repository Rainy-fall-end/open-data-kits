import { createServer } from 'node:http';

export async function readRequestBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export function sendJson(response, statusCode, value, headers = {}) {
  const body = Buffer.from(JSON.stringify(value), 'utf8');
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(body.byteLength),
    connection: 'close',
    ...headers,
  });
  response.end(body);
}

export async function withLoopbackServer(handler, action) {
  const server = createServer((request, response) => {
    Promise.resolve(handler(request, response)).catch(() => response.destroy());
  });
  server.on('clientError', (error, socket) => socket.destroy(error));
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    return await action(baseUrl);
  } finally {
    await new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections?.();
    });
  }
}

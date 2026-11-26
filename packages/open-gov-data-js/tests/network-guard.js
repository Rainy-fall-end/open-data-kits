const originalFetch = globalThis.fetch;
const LOOPBACK_HOSTS = new Set(['127.0.0.1', '[::1]', 'localhost']);

if (typeof originalFetch === 'function') {
  globalThis.fetch = function guardedFetch(input, init) {
    const rawUrl = typeof input === 'string' || input instanceof URL ? input : input.url;
    const url = new URL(rawUrl);
    if (!LOOPBACK_HOSTS.has(url.hostname) || url.port.length === 0) {
      throw new Error('Verification blocked a non-loopback HTTP request');
    }
    return originalFetch.call(this, input, init);
  };
}

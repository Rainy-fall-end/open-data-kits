import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const GS_FILE = path.join(HERE, 'google-sheets', 'OpenGovConnectors.gs');
const PQ_DIR = path.join(HERE, 'power-query');
const EVIDENCE_FILE = path.join(HERE, 'evidence.json');

const APPROVED_ACTORS = new Set([
  '8LFIbRbidiHPknMz5',
  'KchE3qKKrwU0rCe9f',
  'txnvyTckeQx4hVBc6',
  'Z3ioK0wOAeczj6nCx',
]);

const APPROVED_RAPID_HOSTS = new Map([
  ['sec-edgar-corporate-filings.p.rapidapi.com', '/v1/sec-edgar/filings'],
  ['clinicaltrials-gov-studies-trials.p.rapidapi.com', '/v1/clinical-trials/studies'],
  ['openfda-recalls-enforcement-approvals.p.rapidapi.com', '/v1/openfda/records'],
  ['singapore-bca-green-mark-buildings.p.rapidapi.com', '/v1/sg-green-mark/certificates'],
]);

const CONNECTORS = [
  {
    name: 'RAPIDAPI_SEC_EDGAR',
    args: ['search', '', '10-K,10-Q,8-K', '', '', '', '', 5],
    kind: 'rapid',
  },
  {
    name: 'RAPIDAPI_CLINICAL_TRIALS',
    args: ['', '', '', '', '', 5],
    kind: 'rapid',
  },
  {
    name: 'RAPIDAPI_OPENFDA',
    args: ['drug_enforcement', '', '', '', 5],
    kind: 'rapid',
  },
  {
    name: 'RAPIDAPI_SG_GREEN_MARK',
    args: ['', 5],
    kind: 'rapid',
  },
  {
    name: 'APIFY_SEC_EDGAR',
    args: ['search', '', '10-K,10-Q,8-K', '', '', '', '', 10],
    kind: 'apify',
  },
  {
    name: 'APIFY_CLINICAL_TRIALS',
    args: ['', '', '', '', '', 10],
    kind: 'apify',
  },
  {
    name: 'APIFY_UK_TENDERS',
    args: ['', 'tender', '', '', 10],
    kind: 'apify',
  },
  {
    name: 'APIFY_SG_GREEN_MARK',
    args: ['', '', '', 10],
    kind: 'apify',
  },
];

const OPENAPI_CONTRACTS = [
  {
    file: 'sec-edgar-api.json',
    route: '/v1/sec-edgar/filings',
    params: ['mode', 'query', 'forms', 'cik', 'ticker', 'startDate', 'endDate', 'limit'],
  },
  {
    file: 'clinical-trials-api.json',
    route: '/v1/clinical-trials/studies',
    params: ['condition', 'intervention', 'status', 'sponsor', 'queryTerm', 'limit'],
  },
  {
    file: 'openfda-recalls-api.json',
    route: '/v1/openfda/records',
    params: ['dataset', 'searchQuery', 'classification', 'status', 'limit'],
  },
  {
    file: 'sg-green-mark-api.json',
    route: '/v1/sg-green-mark/certificates',
    params: ['limit', 'rating'],
  },
];

const ACTOR_CONTRACTS = [
  {
    actorId: '8LFIbRbidiHPknMz5',
    file: path.join('actors', 'sec-edgar-filings-scraper', '.actor', 'input_schema.json'),
    properties: ['mode', 'query', 'forms', 'cik', 'ticker', 'startDate', 'endDate', 'maxItems'],
  },
  {
    actorId: 'KchE3qKKrwU0rCe9f',
    file: path.join('actors', 'clinical-trials-scraper', '.actor', 'input_schema.json'),
    properties: ['condition', 'intervention', 'status', 'sponsor', 'queryTerm', 'maxItems'],
  },
  {
    actorId: 'txnvyTckeQx4hVBc6',
    file: path.join('actors', 'uk-gov-tenders-scraper', '.actor', 'input_schema.json'),
    properties: ['keyword', 'stages', 'minValue', 'publishedFrom', 'maxItems'],
  },
  {
    actorId: 'Z3ioK0wOAeczj6nCx',
    file: path.join('actors', 'sg-green-mark-buildings', '.actor', 'input_schema.json'),
    properties: ['query', 'rating', 'expiresWithinDays', 'maxItems'],
  },
];

const PQ_EXPECTATIONS = new Map([
  ['rapidapi-sec-edgar.pq', { kind: 'rapid', marker: 'sec-edgar-corporate-filings.p.rapidapi.com', route: 'v1/sec-edgar/filings' }],
  ['rapidapi-clinical-trials.pq', { kind: 'rapid', marker: 'clinicaltrials-gov-studies-trials.p.rapidapi.com', route: 'v1/clinical-trials/studies' }],
  ['rapidapi-openfda.pq', { kind: 'rapid', marker: 'openfda-recalls-enforcement-approvals.p.rapidapi.com', route: 'v1/openfda/records' }],
  ['rapidapi-sg-green-mark.pq', { kind: 'rapid', marker: 'singapore-bca-green-mark-buildings.p.rapidapi.com', route: 'v1/sg-green-mark/certificates' }],
  ['apify-sec-edgar.pq', { kind: 'apify', marker: '8LFIbRbidiHPknMz5' }],
  ['apify-clinical-trials.pq', { kind: 'apify', marker: 'KchE3qKKrwU0rCe9f' }],
  ['apify-uk-tenders.pq', { kind: 'apify', marker: 'txnvyTckeQx4hVBc6' }],
  ['apify-sg-green-mark.pq', { kind: 'apify', marker: 'Z3ioK0wOAeczj6nCx' }],
]);

function loopbackWorkerMain() {
  const http = require('node:http');
  const { parentPort } = require('node:worker_threads');

  const rapidRoutes = new Map([
    ['sec-edgar-corporate-filings.p.rapidapi.com', '/v1/sec-edgar/filings'],
    ['clinicaltrials-gov-studies-trials.p.rapidapi.com', '/v1/clinical-trials/studies'],
    ['openfda-recalls-enforcement-approvals.p.rapidapi.com', '/v1/openfda/records'],
    ['singapore-bca-green-mark-buildings.p.rapidapi.com', '/v1/sg-green-mark/certificates'],
  ]);
  const actors = new Set([
    '8LFIbRbidiHPknMz5',
    'KchE3qKKrwU0rCe9f',
    'txnvyTckeQx4hVBc6',
    'Z3ioK0wOAeczj6nCx',
  ]);

  function send(response, status, value) {
    const body = typeof value === 'string' ? value : JSON.stringify(value);
    response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
    response.end(body);
  }

  const server = http.createServer((request, response) => {
    if (request.method !== 'POST' || request.url !== '/dispatch') {
      send(response, 404, { detail: 'loopback route not found' });
      return;
    }
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      let envelope;
      try {
        envelope = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        send(response, 400, { detail: 'bad test envelope' });
        return;
      }
      const original = new URL(envelope.url);
      const options = envelope.options || {};
      const headers = options.headers || {};
      let isRapid = false;
      let forceError = false;
      let forceShape = false;

      if (rapidRoutes.has(original.hostname)) {
        isRapid = true;
        if (
          original.protocol !== 'https:' ||
          original.pathname !== rapidRoutes.get(original.hostname) ||
          headers['X-RapidAPI-Key'] !== 'rapid-test-value' ||
          headers['X-RapidAPI-Host'] !== original.hostname ||
          String(options.method || '').toLowerCase() !== 'get'
        ) {
          send(response, 401, { detail: 'invalid RapidAPI request' });
          return;
        }
        forceError = original.searchParams.get('query') === '__error__';
        forceShape = original.searchParams.get('query') === '__shape__';
      } else if (original.hostname === 'api.apify.com') {
        const actorMatch = original.pathname.match(/^\/v2\/acts\/([^/]+)\/run-sync-get-dataset-items$/);
        if (
          original.protocol !== 'https:' ||
          !actorMatch ||
          !actors.has(actorMatch[1]) ||
          original.searchParams.get('maxTotalChargeUsd') !== '0.25' ||
          headers.Authorization !== 'Bearer apify-test-value' ||
          String(options.method || '').toLowerCase() !== 'post'
        ) {
          send(response, 401, { detail: 'invalid Apify request' });
          return;
        }
        let input;
        try {
          input = JSON.parse(options.payload || '{}');
        } catch {
          send(response, 400, { detail: 'invalid Actor input' });
          return;
        }
        forceError = input.query === '__error__';
        forceShape = input.query === '__shape__';
      } else {
        send(response, 451, { detail: 'external host blocked by loopback verifier' });
        return;
      }

      if (forceError) {
        send(response, 503, { detail: 'synthetic upstream failure' });
        return;
      }
      if (forceShape) {
        send(response, 200, isRapid ? {} : { items: [] });
        return;
      }

      const item = {
        '=header': 'header-safe',
        array: ['=inside-json'],
        nested: {
          at: '@cmd',
          cr: '\rcommand',
          minus: '-1',
          plus: '+1',
          safe: 'ordinary',
          tab: '\tcommand',
        },
        sourcePath: original.pathname,
        title: '=SUM(1,1)',
      };
      send(response, 200, isRapid ? { items: [item] } : [item]);
    });
  });

  server.listen(0, '127.0.0.1', () => {
    parentPort.postMessage({ type: 'ready', port: server.address().port });
  });
  parentPort.on('message', (message) => {
    if (message === 'close') {
      server.close(() => process.exit(0));
    }
  });
}

function syncLoopbackClientMain() {
  const http = require('node:http');
  const port = Number(process.argv[1]);
  const body = Buffer.from(process.argv[2], 'base64');
  const request = http.request(
    {
      hostname: '127.0.0.1',
      port,
      path: '/dispatch',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': body.length,
      },
    },
    (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        process.stdout.write(JSON.stringify({
          status: response.statusCode,
          body: Buffer.concat(chunks).toString('utf8'),
        }));
      });
    },
  );
  request.on('error', (error) => {
    process.stderr.write(error.stack || String(error));
    process.exitCode = 1;
  });
  request.end(body);
}

async function startLoopback() {
  const worker = new Worker('(' + loopbackWorkerMain.toString() + ')()', { eval: true });
  const ready = await new Promise((resolve, reject) => {
    worker.once('message', resolve);
    worker.once('error', reject);
  });
  assert.equal(ready.type, 'ready');
  assert.ok(Number.isInteger(ready.port) && ready.port > 0);
  return { worker, port: ready.port };
}

async function stopLoopback(worker) {
  if (!worker) return;
  const exited = new Promise((resolve) => worker.once('exit', resolve));
  worker.postMessage('close');
  await exited;
}

function makeAppsScriptContext(port) {
  const calls = [];
  const properties = new Map([
    ['RAPIDAPI_KEY', 'rapid-test-value'],
    ['APIFY_TOKEN', 'apify-test-value'],
  ]);
  const menus = [];

  function createMenu(name) {
    return {
      name,
      entries: [],
      addItem(label, handler) {
        this.entries.push({ type: 'item', label, handler });
        return this;
      },
      addSubMenu(menu) {
        this.entries.push({ type: 'submenu', menu });
        return this;
      },
      addToUi() {
        menus.push(this);
        return this;
      },
    };
  }

  const context = {
    PropertiesService: {
      getScriptProperties() {
        return {
          getProperty(name) {
            return properties.has(name) ? properties.get(name) : null;
          },
        };
      },
    },
    SpreadsheetApp: {
      getUi() {
        return { createMenu };
      },
    },
    UrlFetchApp: {
      fetch(url, options) {
        const normalized = JSON.parse(JSON.stringify(options || {}));
        calls.push({ url: String(url), options: normalized });
        const envelope = Buffer.from(JSON.stringify({ url: String(url), options: normalized })).toString('base64');
        const child = spawnSync(
          process.execPath,
          ['-e', '(' + syncLoopbackClientMain.toString() + ')()', String(port), envelope],
          { encoding: 'utf8', timeout: 10_000 },
        );
        if (child.error) throw child.error;
        if (child.status !== 0) {
          throw new Error('Loopback client failed: ' + child.stderr);
        }
        const response = JSON.parse(child.stdout);
        return {
          getResponseCode() {
            return response.status;
          },
          getContentText() {
            return response.body;
          },
        };
      },
    },
  };
  vm.createContext(context, { name: 'OpenGovConnectors.gs sandbox' });
  return { context, calls, properties, menus };
}

function assertSafeTable(table, connectorName) {
  assert.ok(Array.isArray(table), connectorName + ' must return an array');
  assert.equal(table.length, 2, connectorName + ' should return one header and one data row');
  assert.ok(table.every((row) => Array.isArray(row)), connectorName + ' rows must be arrays');
  const width = table[0].length;
  assert.ok(width > 0, connectorName + ' must expose columns');
  assert.ok(table.every((row) => row.length === width), connectorName + ' table must be rectangular');
  for (const row of table) {
    for (const cell of row) {
      if (typeof cell === 'string') {
        assert.doesNotMatch(cell, /^[=+\-@\t\r]/, connectorName + ' returned an unsafe cell');
      }
    }
  }
  const values = Object.fromEntries(table[0].map((header, index) => [header, table[1][index]]));
  assert.equal(values["'=header"], 'header-safe');
  assert.equal(values.title, "'=SUM(1,1)");
  assert.equal(values['nested.plus'], "'+1");
  assert.equal(values['nested.minus'], "'-1");
  assert.equal(values['nested.at'], "'@cmd");
  assert.equal(values['nested.tab'], "'\tcommand");
  assert.equal(values['nested.cr'], "'\rcommand");
  assert.equal(values['nested.safe'], 'ordinary');
  assert.equal(values.array, '["=inside-json"]');
}

function tokenizeM(source) {
  const tokens = [];
  const pairs = new Map([['(', ')'], ['[', ']'], ['{', '}']]);
  let index = 0;

  while (index < source.length) {
    const character = source[index];
    if (/\s/.test(character)) {
      index += 1;
      continue;
    }
    if (source.startsWith('//', index)) {
      index = source.indexOf('\n', index + 2);
      if (index === -1) break;
      continue;
    }
    if (source.startsWith('/*', index)) {
      let depth = 1;
      index += 2;
      while (index < source.length && depth > 0) {
        if (source.startsWith('/*', index)) {
          depth += 1;
          index += 2;
        } else if (source.startsWith('*/', index)) {
          depth -= 1;
          index += 2;
        } else {
          index += 1;
        }
      }
      assert.equal(depth, 0, 'unterminated M block comment');
      continue;
    }
    if (source.startsWith('#"', index) || character === '"') {
      const quotedIdentifier = source.startsWith('#"', index);
      index += quotedIdentifier ? 2 : 1;
      let value = '';
      let closed = false;
      while (index < source.length) {
        if (source[index] === '"') {
          if (source[index + 1] === '"') {
            value += '"';
            index += 2;
            continue;
          }
          index += 1;
          closed = true;
          break;
        }
        value += source[index];
        index += 1;
      }
      assert.ok(closed, 'unterminated M string');
      tokens.push({ type: quotedIdentifier ? 'identifier' : 'string', value });
      continue;
    }
    const identifier = source.slice(index).match(/^[A-Za-z_][A-Za-z0-9_.]*/);
    if (identifier) {
      tokens.push({ type: 'identifier', value: identifier[0] });
      index += identifier[0].length;
      continue;
    }
    const number = source.slice(index).match(/^\d+(?:\.\d+)?/);
    if (number) {
      tokens.push({ type: 'number', value: number[0] });
      index += number[0].length;
      continue;
    }
    const doubleSymbol = source.slice(index, index + 2);
    if (['=>', '<>', '>=', '<=', '..'].includes(doubleSymbol)) {
      tokens.push({ type: 'symbol', value: doubleSymbol });
      index += 2;
      continue;
    }
    tokens.push({ type: 'symbol', value: character });
    index += 1;
  }

  const stack = [];
  for (const token of tokens) {
    if (token.type === 'symbol' && pairs.has(token.value)) {
      stack.push(pairs.get(token.value));
    } else if (token.type === 'symbol' && [')', ']', '}'].includes(token.value)) {
      assert.equal(token.value, stack.pop(), 'mismatched M delimiter');
    }
  }
  assert.equal(stack.length, 0, 'unclosed M delimiter');
  return tokens;
}

function parseMModule(source) {
  const tokens = tokenizeM(source);
  assert.ok(tokens.length > 3, 'M module is empty');
  assert.equal(tokens[0].value.toLowerCase(), 'let', 'M module must begin with let');

  let letDepth = 0;
  let rootIn = -1;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type === 'identifier' && token.value.toLowerCase() === 'let') {
      letDepth += 1;
    } else if (token.type === 'identifier' && token.value.toLowerCase() === 'in') {
      letDepth -= 1;
      assert.ok(letDepth >= 0, 'unexpected M in keyword');
      if (letDepth === 0) {
        rootIn = index;
        break;
      }
    }
  }
  assert.ok(rootIn > 1, 'M module has no matching in expression');
  assert.ok(rootIn < tokens.length - 1, 'M module has an empty output expression');

  let delimiterDepth = 0;
  let nestedLetDepth = 1;
  let bindingStart = 1;
  const bindings = [];
  for (let index = 1; index < rootIn; index += 1) {
    const token = tokens[index];
    if (token.type === 'symbol' && ['(', '[', '{'].includes(token.value)) delimiterDepth += 1;
    if (token.type === 'symbol' && [')', ']', '}'].includes(token.value)) delimiterDepth -= 1;
    if (token.type === 'identifier' && token.value.toLowerCase() === 'let') nestedLetDepth += 1;
    if (token.type === 'identifier' && token.value.toLowerCase() === 'in') nestedLetDepth -= 1;
    if (token.value === ',' && delimiterDepth === 0 && nestedLetDepth === 1) {
      bindings.push(tokens.slice(bindingStart, index));
      bindingStart = index + 1;
    }
  }
  bindings.push(tokens.slice(bindingStart, rootIn));
  assert.ok(bindings.length >= 8, 'M module should define its request and transformation pipeline');
  for (const binding of bindings) {
    assert.ok(binding.length >= 3, 'empty M binding');
    assert.equal(binding[0].type, 'identifier', 'M binding must begin with an identifier');
    assert.equal(binding[1].value, '=', 'M binding must assign with =');
  }
  return { tokens: tokens.length, bindings: bindings.length };
}

async function listArtifactFiles() {
  const files = [
    GS_FILE,
    path.join(HERE, 'README.md'),
    path.join(HERE, 'verify.mjs'),
  ];
  for (const entry of await readdir(PQ_DIR, { withFileTypes: true })) {
    if (entry.isFile()) files.push(path.join(PQ_DIR, entry.name));
  }
  return files;
}

async function validateSecurityScope() {
  const files = await listArtifactFiles();
  const combined = (await Promise.all(files.map((file) => readFile(file, 'utf8')))).join('\n');

  const candidateActorIds = combined.match(/\b(?=[A-Za-z0-9]{17}\b)(?=[A-Za-z0-9]*\d)[A-Za-z0-9]{17}\b/g) || [];
  for (const actorId of candidateActorIds) {
    assert.ok(APPROVED_ACTORS.has(actorId), 'unapproved Actor identifier found');
  }

  const candidateRapidHosts = combined.match(/\b[a-z0-9-]+\.p\.rapidapi\.com\b/g) || [];
  for (const host of candidateRapidHosts) {
    assert.ok(APPROVED_RAPID_HOSTS.has(host), 'unapproved RapidAPI host found');
  }

  const restrictedMarkers = [
    ['cn', 'gov', 'tender'].join('-'),
    ['hk', 'country', 'park'].join('-'),
    ['country', 'park', 'attractions'].join('-'),
  ];
  for (const marker of restrictedMarkers) {
    assert.ok(!combined.toLowerCase().includes(marker), 'restricted private-product marker found');
  }

  assert.doesNotMatch(combined, /\bapify_api_[A-Za-z0-9_-]{20,}\b/, 'possible Apify credential found');
  assert.doesNotMatch(combined, /\b[A-Fa-f0-9]{40,}\b/, 'possible hardcoded credential found');
  const protectedPosixPath = ['..', 'keys', ''].join('/');
  const protectedWindowsPath = ['..', 'keys', ''].join('\\');
  assert.ok(!combined.includes(protectedPosixPath) && !combined.includes(protectedWindowsPath), 'protected credential path referenced');
  return {
    filesScanned: files.length,
    approvedActorIdOccurrences: candidateActorIds.length,
    approvedRapidHostOccurrences: candidateRapidHosts.length,
  };
}

async function validateOpenApiContracts() {
  for (const expectation of OPENAPI_CONTRACTS) {
    const file = path.join(REPO, 'pipelines', 'rapidapi_hub', 'openapi', expectation.file);
    const contract = JSON.parse(await readFile(file, 'utf8'));
    assert.match(contract.openapi, /^3\./);
    const dataRoutes = Object.keys(contract.paths).filter((route) => route !== '/health');
    assert.deepEqual(dataRoutes, [expectation.route]);
    const operation = contract.paths[expectation.route]?.get;
    assert.ok(operation, expectation.file + ' must expose the expected GET route');
    assert.deepEqual(operation.parameters.map((parameter) => parameter.name), expectation.params);
    const responseSchema = operation.responses?.['200']?.content?.['application/json']?.schema;
    assert.ok(responseSchema?.$ref, expectation.file + ' must define a 200 response schema');
    const wrapperName = responseSchema.$ref.split('/').at(-1);
    const wrapper = contract.components?.schemas?.[wrapperName];
    assert.equal(wrapper?.properties?.items?.type, 'array');
  }
  return OPENAPI_CONTRACTS.map((contract) => contract.file);
}

async function validateActorContracts() {
  const schemas = new Map();
  for (const expectation of ACTOR_CONTRACTS) {
    const schema = JSON.parse(await readFile(path.join(REPO, expectation.file), 'utf8'));
    assert.equal(schema.schemaVersion, 1);
    assert.equal(schema.type, 'object');
    assert.deepEqual(Object.keys(schema.properties).sort(), [...expectation.properties].sort());
    assert.ok(schema.properties.maxItems);
    assert.ok(schema.properties.maxItems.default <= 10);
    schemas.set(expectation.actorId, schema);
  }
  return schemas;
}

async function validatePowerQueryModules() {
  const files = (await readdir(PQ_DIR)).filter((file) => file.endsWith('.pq')).sort();
  assert.deepEqual(files, [...PQ_EXPECTATIONS.keys()].sort());
  const parsed = {};

  for (const file of files) {
    const source = await readFile(path.join(PQ_DIR, file), 'utf8');
    const expectation = PQ_EXPECTATIONS.get(file);
    parsed[file] = parseMModule(source);
    assert.ok(source.includes(expectation.marker));
    assert.ok(source.includes('Web.Contents'));
    assert.ok(source.includes('ManualStatusHandling = {400..599}'));
    assert.ok(source.includes('FlattenRecord'));
    assert.ok(source.includes('SafeCell'));
    if (expectation.kind === 'rapid') {
      assert.ok(source.includes('RapidApiKey'));
      assert.ok(!source.includes('ApifyToken'));
      assert.ok(source.includes(expectation.route));
      assert.ok(source.includes('#"X-RapidAPI-Key" = Key'));
    } else {
      assert.ok(source.includes('ApifyToken'));
      assert.ok(!source.includes('RapidApiKey'));
      assert.ok(source.includes('maxTotalChargeUsd = "0.25"'));
      assert.ok(source.includes('Authorization = "Bearer " & Token'));
    }
  }
  return parsed;
}

async function validateAppsScript(port) {
  const source = await readFile(GS_FILE, 'utf8');
  const publicFunctions = [...source.matchAll(/function\s+([A-Z][A-Z0-9_]+)\s*\(/g)].map((match) => match[1]);
  assert.deepEqual(publicFunctions.sort(), CONNECTORS.map((connector) => connector.name).sort());
  assert.ok(source.includes('PropertiesService.getScriptProperties()'));
  assert.ok(source.includes("requiredScriptProperty_('RAPIDAPI_KEY')"));
  assert.ok(source.includes("requiredScriptProperty_('APIFY_TOKEN')"));
  assert.ok(source.includes('maxTotalChargeUsd='));

  const sandbox = makeAppsScriptContext(port);
  new vm.Script(source, { filename: GS_FILE }).runInContext(sandbox.context, { timeout: 2_000 });
  sandbox.context.onOpen();
  assert.equal(sandbox.menus.length, 1);
  assert.equal(sandbox.menus[0].name, 'Open Gov Connectors');
  assert.equal(sandbox.menus[0].entries.length, 2);
  assert.deepEqual(sandbox.menus[0].entries.map((entry) => entry.menu.entries.length), [4, 4]);

  for (const connector of CONNECTORS) {
    const table = sandbox.context[connector.name](...connector.args);
    assertSafeTable(table, connector.name);
  }
  const successCalls = sandbox.calls.slice();
  assert.equal(successCalls.length, 8);

  const rapidCalls = successCalls.filter((call) => new URL(call.url).hostname.endsWith('.p.rapidapi.com'));
  assert.equal(rapidCalls.length, 4);
  for (const call of rapidCalls) {
    const url = new URL(call.url);
    assert.equal(url.pathname, APPROVED_RAPID_HOSTS.get(url.hostname));
    assert.equal(call.options.headers['X-RapidAPI-Host'], url.hostname);
    assert.equal(call.options.headers['X-RapidAPI-Key'], 'rapid-test-value');
  }

  const actorSchemas = await validateActorContracts();
  const apifyCalls = successCalls.filter((call) => new URL(call.url).hostname === 'api.apify.com');
  assert.equal(apifyCalls.length, 4);
  for (const call of apifyCalls) {
    const url = new URL(call.url);
    assert.equal(url.searchParams.get('maxTotalChargeUsd'), '0.25');
    const actorId = url.pathname.split('/')[3];
    assert.ok(APPROVED_ACTORS.has(actorId));
    const input = JSON.parse(call.options.payload);
    const schema = actorSchemas.get(actorId);
    for (const key of Object.keys(input)) {
      assert.ok(schema.properties[key], actorId + ' received an input outside its contract');
    }
    assert.equal(call.options.headers.Authorization, 'Bearer apify-test-value');
  }

  sandbox.properties.delete('RAPIDAPI_KEY');
  assert.throws(() => sandbox.context.RAPIDAPI_SG_GREEN_MARK('', 5), /Missing Script Property: RAPIDAPI_KEY/);
  sandbox.properties.set('RAPIDAPI_KEY', 'rapid-test-value');
  sandbox.properties.delete('APIFY_TOKEN');
  assert.throws(() => sandbox.context.APIFY_SG_GREEN_MARK('', '', '', 10), /Missing Script Property: APIFY_TOKEN/);
  sandbox.properties.set('APIFY_TOKEN', 'apify-test-value');

  assert.throws(
    () => sandbox.context.RAPIDAPI_SEC_EDGAR('search', '__error__', '', '', '', '', '', 5),
    /RapidAPI HTTP 503/,
  );
  assert.throws(
    () => sandbox.context.APIFY_SEC_EDGAR('search', '__error__', '', '', '', '', '', 10),
    /Apify HTTP 503/,
  );
  assert.throws(
    () => sandbox.context.RAPIDAPI_SEC_EDGAR('search', '__shape__', '', '', '', '', '', 5),
    /items array/,
  );
  assert.throws(
    () => sandbox.context.APIFY_SEC_EDGAR('search', '__shape__', '', '', '', '', '', 10),
    /dataset item array/,
  );
  assert.throws(() => sandbox.context.RAPIDAPI_SG_GREEN_MARK('', 21), /limit must be an integer/);

  return {
    connectorFunctions: CONNECTORS.map((connector) => connector.name),
    successfulLoopbackRequests: successCalls.length,
    errorCases: 7,
    menuItems: 8,
  };
}

async function main() {
  assert.ok(Number(process.versions.node.split('.')[0]) >= 20, 'Node.js 20 or newer is required');
  const checks = {};
  let worker;

  try {
    const loopback = await startLoopback();
    worker = loopback.worker;
    checks.appsScript = await validateAppsScript(loopback.port);
    checks.openapiContracts = await validateOpenApiContracts();
    checks.powerQuery = await validatePowerQueryModules();
    checks.security = await validateSecurityScope();
    checks.actorContracts = ACTOR_CONTRACTS.map((contract) => contract.file);

    const evidence = {
      taskId: 'task-20261126T044155Z-ed794f',
      projectId: 'excel-sheets-bi-open-gov-connectors',
      status: 'passed',
      generatedAt: new Date().toISOString(),
      runtime: {
        node: process.version,
        dependencies: 0,
        network: '127.0.0.1 loopback only',
      },
      summary: {
        googleSheetsConnectorFunctions: 8,
        powerQueryModules: 8,
        rapidApiContractsValidated: 4,
        actorInputSchemasValidated: 4,
        externalNetworkCalls: 0,
      },
      checks,
    };
    await writeFile(EVIDENCE_FILE, JSON.stringify(evidence, null, 2) + '\n', 'utf8');
    process.stdout.write('PASS: 8 Apps Script connectors, 8 Power Query modules, 8 public contracts; evidence.json written.\n');
  } catch (error) {
    const evidence = {
      taskId: 'task-20261126T044155Z-ed794f',
      projectId: 'excel-sheets-bi-open-gov-connectors',
      status: 'failed',
      generatedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    };
    await writeFile(EVIDENCE_FILE, JSON.stringify(evidence, null, 2) + '\n', 'utf8');
    throw error;
  } finally {
    await stopLoopback(worker);
  }
}

await main();

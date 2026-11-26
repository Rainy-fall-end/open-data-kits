import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { readFile, readdir, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const evidencePath = join(here, 'evidence.json');
const manifest = JSON.parse(await readFile(join(here, 'presets.json'), 'utf8'));

const evidence = {
  taskId: 'task-20261126T055943Z-e3ef2f',
  projectId: 'flagship-conversion-kits-v2',
  generatedAt: new Date().toISOString(),
  nodeVersion: process.version,
  status: 'failed',
  checks: {},
  artifacts: []
};

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function validateSchema(value, schema, path = '$') {
  const errors = [];
  const type = schema.type;
  const isObject = value !== null && typeof value === 'object' && !Array.isArray(value);
  const typeOk = !type
    || (type === 'object' && isObject)
    || (type === 'array' && Array.isArray(value))
    || (type === 'string' && typeof value === 'string')
    || (type === 'boolean' && typeof value === 'boolean')
    || (type === 'number' && typeof value === 'number' && Number.isFinite(value))
    || (type === 'integer' && Number.isInteger(value));

  if (!typeOk) {
    errors.push(`${path}: expected ${type}`);
    return errors;
  }
  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${path}: value is not in enum`);
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path}: below minimum`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path}: above maximum`);
  }
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${path}: shorter than minLength`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${path}: longer than maxLength`);
  }
  if (Array.isArray(value) && schema.items) {
    value.forEach((item, index) => errors.push(...validateSchema(item, schema.items, `${path}[${index}]`)));
  }
  if (isObject) {
    for (const required of schema.required || []) {
      if (!Object.prototype.hasOwnProperty.call(value, required)) errors.push(`${path}.${required}: required`);
    }
    for (const [key, item] of Object.entries(value)) {
      if (schema.properties?.[key]) {
        errors.push(...validateSchema(item, schema.properties[key], `${path}.${key}`));
      } else if (schema.additionalProperties === false) {
        errors.push(`${path}.${key}: additional property`);
      }
    }
  }
  return errors;
}

function assignmentValue(node, name) {
  return node.parameters.assignments.assignments.find((item) => item.name === name)?.value;
}

function queryValue(node, name) {
  return node.parameters.queryParameters.parameters.find((item) => item.name === name)?.value;
}

async function verifyManifestAndSchemas() {
  assert.equal(manifest.version, 1);
  assert.equal(manifest.maxTotalChargeUsd, 0.25);
  assert.equal(manifest.presets.length, 6);
  assert.equal(new Set(manifest.presets.map((preset) => preset.key)).size, 6);
  assert.equal(new Set(manifest.presets.map((preset) => preset.actorId)).size, 5);

  const expectedActors = new Map([
    ['ats_jobs', 'CRulq5dak4mqAUmMn'],
    ['sec_form_d', '8LFIbRbidiHPknMz5'],
    ['sec_xbrl_aapl', '8LFIbRbidiHPknMz5'],
    ['global_tenders', 'ZlabhlvEIyRVdtKiQ'],
    ['pharma_pipeline', 're8aRvtqBonP5HMuY'],
    ['usaspending_contracts', 'eQQ2beomyLlW4DTGM']
  ]);

  const results = [];
  for (const preset of manifest.presets) {
    assert.equal(preset.actorId, expectedActors.get(preset.key));
    const schemaFile = resolve(repoRoot, preset.schemaPath);
    assert.ok(schemaFile.startsWith(`${repoRoot}\\`) || schemaFile.startsWith(`${repoRoot}/`));
    const schema = JSON.parse(await readFile(schemaFile, 'utf8'));
    const errors = validateSchema(preset.input, schema);
    assert.deepEqual(errors, [], `${preset.key} schema errors: ${errors.join('; ')}`);
    assert.ok(Number.isInteger(preset.input.maxItems));
    results.push({ key: preset.key, schema: preset.schemaPath, valid: true });
  }
  assert.equal(manifest.presets.find((preset) => preset.key === 'sec_form_d').input.mode, 'form_d_funding');
  const xbrl = manifest.presets.find((preset) => preset.key === 'sec_xbrl_aapl').input;
  assert.equal(xbrl.mode, 'xbrl_financials');
  assert.equal(xbrl.ticker, 'AAPL');
  evidence.checks.schemaValidation = { passed: true, payloads: results };
}

async function verifyN8n() {
  const files = (await readdir(join(here, 'n8n'))).filter((name) => name.endsWith('.json')).sort();
  assert.deepEqual(files, manifest.presets.map((preset) => preset.n8nFile).sort());
  const results = [];
  for (const preset of manifest.presets) {
    const workflow = JSON.parse(await readFile(join(here, 'n8n', preset.n8nFile), 'utf8'));
    assert.equal(workflow.active, false);
    assert.equal(workflow.nodes.length, 3);
    assert.ok(workflow.connections['Run manually']);
    const config = workflow.nodes.find((node) => node.type === 'n8n-nodes-base.set');
    const request = workflow.nodes.find((node) => node.type === 'n8n-nodes-base.httpRequest');
    assert.ok(config && request);
    assert.equal(assignmentValue(config, 'actorId'), preset.actorId);
    assert.equal(assignmentValue(config, 'outputFormat'), 'json');
    assert.equal(assignmentValue(config, 'input'), `={{ ${JSON.stringify(preset.input)} }}`);
    assert.equal(request.parameters.method, 'POST');
    assert.equal(request.parameters.url, `https://api.apify.com/v2/acts/${preset.actorId}/run-sync-get-dataset-items`);
    assert.equal(queryValue(request, 'format'), '={{ $json.outputFormat }}');
    assert.equal(queryValue(request, 'maxTotalChargeUsd'), '0.25');
    assert.equal(request.parameters.jsonBody, '={{ $json.input }}');
    const authorization = request.parameters.headerParameters.parameters.find((item) => item.name === 'Authorization');
    assert.ok(authorization.value.includes('$env.APIFY_TOKEN'));
    results.push({ file: `n8n/${preset.n8nFile}`, actorId: preset.actorId, outputModes: ['json', 'csv'], capUsd: 0.25 });
  }
  evidence.checks.n8nContracts = { passed: true, workflows: results };
}

async function verifyPostman() {
  const file = join(here, 'postman', 'Flagship-Apify-Workflows.postman_collection.json');
  const collection = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(collection.info.schema, 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json');
  assert.equal(collection.auth.type, 'bearer');
  assert.equal(collection.auth.bearer.find((item) => item.key === 'token').value, '{{APIFY_TOKEN}}');
  assert.equal(collection.variable.find((item) => item.key === 'APIFY_TOKEN').value, '');
  assert.equal(collection.item.length, 6);

  const results = [];
  for (const preset of manifest.presets) {
    const item = collection.item.find((candidate) => candidate.name === preset.name);
    assert.ok(item, `Missing Postman item for ${preset.key}`);
    assert.equal(item.request.method, 'POST');
    assert.ok(item.request.url.raw.includes(`/acts/${preset.actorId}/`));
    assert.equal(item.request.url.query.find((query) => query.key === 'maxTotalChargeUsd').value, '0.25');
    assert.equal(item.request.url.query.find((query) => query.key === 'format').value, 'json');
    assert.deepEqual(JSON.parse(item.request.body.raw), preset.input);
    const tests = item.event.find((event) => event.listen === 'test')?.script.exec.join('\n') || '';
    assert.match(tests, /HTTP status is successful/);
    assert.match(tests, /Response is a dataset array/);
    assert.ok(tests.includes(`at.most(${preset.input.maxItems})`));
    assert.match(tests, /Maximum charge is fixed at USD 0\.25/);
    results.push({ preset: preset.key, assertions: 4, capUsd: 0.25 });
  }
  evidence.checks.postmanContracts = { passed: true, requests: results };
}

const loopbackServerSource = String.raw`
const http = require('node:http');
const fs = require('node:fs');
const callsFile = process.argv[1];
const server = http.createServer((request, response) => {
  let body = '';
  request.setEncoding('utf8');
  request.on('data', (chunk) => { body += chunk; });
  request.on('end', () => {
    try {
      const url = new URL(request.url, 'http://127.0.0.1');
      const input = JSON.parse(body || '{}');
      const call = {
        method: request.method,
        path: url.pathname,
        query: Object.fromEntries(url.searchParams),
        input,
        authorizationPresent: /^Bearer\s+/.test(request.headers.authorization || '')
      };
      fs.appendFileSync(callsFile, JSON.stringify(call) + '\n');
      const row = {
        recordId: 'sandbox-record',
        formulaEquals: '=2+2',
        formulaPlus: '+1',
        formulaMinus: '-1',
        formulaAt: '@handle',
        formulaTab: '\tcommand',
        formulaCr: '\rcommand',
        nested: { company: 'Example', metrics: { score: 42 } },
        tags: ['one', 'two']
      };
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify([row]));
    } catch (error) {
      response.writeHead(400, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: error.message }));
    }
  });
});
server.listen(0, '127.0.0.1', () => {
  process.stdout.write(JSON.stringify({ port: server.address().port }) + '\n');
});
process.on('SIGTERM', () => server.close(() => process.exit(0)));
`;

const loopbackClientSource = String.raw`
const http = require('node:http');
const target = new URL(process.argv[1]);
const method = process.argv[2];
const payload = process.argv[3];
const headers = JSON.parse(process.argv[4]);
headers['Content-Length'] = Buffer.byteLength(payload);
const request = http.request(target, { method, headers }, (response) => {
  let body = '';
  response.setEncoding('utf8');
  response.on('data', (chunk) => { body += chunk; });
  response.on('end', () => process.stdout.write(JSON.stringify({ status: response.statusCode, body })));
});
request.on('error', (error) => { process.stderr.write(error.message); process.exitCode = 1; });
request.end(payload);
`;

async function startLoopbackServer(callsFile) {
  const child = spawn(process.execPath, ['-e', loopbackServerSource, callsFile], {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  const ready = await new Promise((resolveReady, rejectReady) => {
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => rejectReady(new Error(`Loopback server timeout: ${stderr}`)), 5000);
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      const newline = stdout.indexOf('\n');
      if (newline >= 0) {
        clearTimeout(timer);
        resolveReady(JSON.parse(stdout.slice(0, newline)));
      }
    });
    child.on('exit', (code) => {
      if (!stdout.includes('\n')) {
        clearTimeout(timer);
        rejectReady(new Error(`Loopback server exited ${code}: ${stderr}`));
      }
    });
  });
  return { child, port: ready.port };
}

function createSpreadsheetMock() {
  const sheets = new Map();
  const menus = [];
  class Sheet {
    constructor(name) {
      this.name = name;
      this.writes = [];
    }
    clearContents() { this.writes = []; return this; }
    getRange(row, column, rows = 1, columns = 1) {
      const sheet = this;
      return {
        setValue(value) { sheet.writes.push({ row, column, values: [[value]] }); return this; },
        setValues(values) {
          assert.equal(values.length, rows);
          assert.ok(values.every((line) => line.length === columns));
          sheet.writes.push({ row, column, values: plain(values) });
          return this;
        }
      };
    }
    setFrozenRows() { return this; }
    autoResizeColumns() { return this; }
  }
  const spreadsheet = {
    getSheetByName(name) { return sheets.get(name) || null; },
    insertSheet(name) { const sheet = new Sheet(name); sheets.set(name, sheet); return sheet; }
  };
  const ui = {
    createMenu(name) {
      const menu = { name, items: [] };
      menus.push(menu);
      const chain = {
        addItem(label, functionName) { menu.items.push({ label, functionName }); return chain; },
        addSeparator() { return chain; },
        addToUi() { return chain; }
      };
      return chain;
    }
  };
  return {
    sheets,
    menus,
    api: {
      getUi() { return ui; },
      getActiveSpreadsheet() { return spreadsheet; }
    }
  };
}

async function verifyAppsScript() {
  const temporary = await mkdtemp(join(tmpdir(), 'flagship-kit-'));
  const callsFile = join(temporary, 'calls.jsonl');
  let child;
  let externalNetworkCalls = 0;
  const spreadsheet = createSpreadsheetMock();
  const requestedProperties = [];

  try {
    const running = await startLoopbackServer(callsFile);
    child = running.child;
    const source = await readFile(join(here, 'google-sheets', 'FlagshipConnectors.gs'), 'utf8');
    const sandbox = {
      FLAGSHIP_API_BASE_URL_OVERRIDE: `http://127.0.0.1:${running.port}/v2`,
      PropertiesService: {
        getScriptProperties() {
          return {
            getProperty(name) {
              requestedProperties.push(name);
              return name === 'APIFY_TOKEN' ? 'sandbox-token' : null;
            }
          };
        }
      },
      SpreadsheetApp: spreadsheet.api,
      UrlFetchApp: {
        fetch(url, options) {
          const target = new URL(url);
          if (target.hostname !== '127.0.0.1') {
            externalNetworkCalls += 1;
            throw new Error(`Blocked non-loopback request to ${target.hostname}`);
          }
          const headers = { ...(options.headers || {}), 'Content-Type': options.contentType || 'application/json' };
          const result = execFileSync(
            process.execPath,
            ['-e', loopbackClientSource, target.href, String(options.method || 'get').toUpperCase(), options.payload || '', JSON.stringify(headers)],
            { encoding: 'utf8', timeout: 10000, windowsHide: true }
          );
          const response = JSON.parse(result);
          return {
            getResponseCode() { return response.status; },
            getContentText() { return response.body; }
          };
        }
      }
    };
    const context = vm.createContext(sandbox, {
      name: 'FlagshipConnectorsSandbox',
      codeGeneration: { strings: false, wasm: false }
    });
    vm.runInContext(source, context, { filename: 'FlagshipConnectors.gs', timeout: 2000 });

    assert.equal(context.FLAGSHIP_MAX_TOTAL_CHARGE_USD, 0.25);
    for (const preset of manifest.presets) {
      const scriptPreset = plain(context.FLAGSHIP_PRESETS[preset.key]);
      assert.deepEqual(scriptPreset, {
        name: preset.name,
        actorId: preset.actorId,
        sheetName: preset.sheetName,
        input: preset.input
      });
      assert.equal(typeof context[preset.functionName], 'function');
      assert.equal(context[preset.functionName](), 1);
    }
    context.onOpen();
    assert.equal(spreadsheet.menus.length, 1);
    assert.equal(spreadsheet.menus[0].items.length, 6);
    assert.deepEqual(requestedProperties, Array(6).fill('APIFY_TOKEN'));
    assert.equal(externalNetworkCalls, 0);

    const callsText = await readFile(callsFile, 'utf8');
    const calls = callsText.trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
    assert.equal(calls.length, 6);
    calls.forEach((call, index) => {
      const preset = manifest.presets[index];
      assert.equal(call.method, 'POST');
      assert.equal(call.path, `/v2/acts/${preset.actorId}/run-sync-get-dataset-items`);
      assert.equal(call.query.format, 'json');
      assert.equal(call.query.clean, 'true');
      assert.equal(call.query.maxTotalChargeUsd, '0.25');
      assert.equal(call.authorizationPresent, true);
      assert.deepEqual(call.input, preset.input);
    });

    let neutralizedCells = 0;
    for (const preset of manifest.presets) {
      const sheet = spreadsheet.sheets.get(preset.sheetName);
      assert.ok(sheet);
      const cells = sheet.writes.flatMap((write) => write.values.flat());
      assert.equal(cells.filter((cell) => typeof cell === 'string' && /^[=+\-@\t\r]/.test(cell)).length, 0);
      for (const prefix of ['=', '+', '-', '@', '\t', '\r']) {
        assert.ok(cells.some((cell) => typeof cell === 'string' && cell.startsWith(`'${prefix}`)));
        neutralizedCells += 1;
      }
      assert.ok(cells.includes('nested.company'));
      assert.ok(cells.includes('nested.metrics.score'));
      assert.ok(cells.includes('["one","two"]'));
    }

    evidence.checks.appsScriptSandbox = {
      passed: true,
      functionsExecuted: 6,
      loopbackCalls: calls.length,
      externalNetworkCalls,
      propertiesReads: requestedProperties.length,
      sheetsWritten: spreadsheet.sheets.size,
      formulaPrefixesTested: 6,
      neutralizedCells,
      nestedFlatteningVerified: true,
      menuItems: spreadsheet.menus[0].items.length
    };
  } finally {
    if (child && !child.killed) child.kill();
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    await rm(temporary, { recursive: true, force: true });
  }
}

async function walk(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await walk(fullPath));
    else output.push(fullPath);
  }
  return output;
}

async function verifySecurity() {
  const files = (await walk(here)).filter((file) => !file.endsWith('evidence.json'));
  const credentialLeaks = [];
  const restrictedLeaks = [];
  const realCredentialPattern = /apify_api_[A-Za-z0-9_-]{20,}/gi;
  const restrictedPatterns = [
    new RegExp(['hong', 'kong'].join('[\\s_-]*'), 'i'),
    new RegExp(['actor', 'hk'].join('[-_]'), 'i'),
    new RegExp(['hk', 'country', 'park'].join('[-_]'), 'i')
  ];
  for (const file of files) {
    const content = await readFile(file, 'utf8');
    if (realCredentialPattern.test(content)) credentialLeaks.push(relative(here, file));
    realCredentialPattern.lastIndex = 0;
    if (restrictedPatterns.some((pattern) => pattern.test(content))) restrictedLeaks.push(relative(here, file));
  }
  assert.deepEqual(credentialLeaks, []);
  assert.deepEqual(restrictedLeaks, []);
  evidence.checks.security = {
    passed: true,
    filesScanned: files.length,
    credentialLeaks: 0,
    restrictedActorLeaks: 0,
    externalNetworkCalls: evidence.checks.appsScriptSandbox.externalNetworkCalls,
    approvedActorIdsOnly: true
  };
}

async function hashArtifacts() {
  const files = [
    'README.md',
    'presets.json',
    'build-artifacts.mjs',
    'verify.mjs',
    'google-sheets/FlagshipConnectors.gs',
    'postman/Flagship-Apify-Workflows.postman_collection.json',
    ...manifest.presets.map((preset) => `n8n/${preset.n8nFile}`)
  ];
  const output = [];
  for (const file of files) {
    const bytes = await readFile(join(here, file));
    output.push({ file, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  return output;
}

try {
  assert.ok(Number(process.versions.node.split('.')[0]) >= 20, 'Node 20 or newer is required');
  await verifyManifestAndSchemas();
  await verifyN8n();
  await verifyPostman();
  await verifyAppsScript();
  await verifySecurity();
  evidence.artifacts = await hashArtifacts();
  evidence.status = 'passed';
  evidence.summary = 'All six presets passed repository-schema, n8n, Postman, Apps Script sandbox, cost-cap, flattening, formula-neutralization, credential, restricted-actor, and zero-external-call checks.';
} catch (error) {
  evidence.status = 'failed';
  evidence.error = { name: error.name, message: error.message, stack: error.stack };
  process.exitCode = 1;
} finally {
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
}

if (evidence.status === 'passed') {
  console.log(`PASS: ${evidence.summary}`);
  console.log(`Evidence: ${evidencePath}`);
} else {
  console.error(`FAIL: ${evidence.error?.message || 'Unknown verification error'}`);
}

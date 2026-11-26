import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(await readFile(join(here, 'presets.json'), 'utf8'));
const cap = manifest.maxTotalChargeUsd.toFixed(2);

await mkdir(join(here, 'n8n'), { recursive: true });
await mkdir(join(here, 'postman'), { recursive: true });

function n8nWorkflow(preset, index) {
  const inputExpression = `={{ ${JSON.stringify(preset.input)} }}`;
  const tokenExpression = "={{ 'Bearer ' + $env.APIFY_TOKEN }}";
  return {
    name: `Flagship ${index + 1} - ${preset.name}`,
    nodes: [
      {
        parameters: {},
        id: `manual-trigger-${preset.key}`,
        name: 'Run manually',
        type: 'n8n-nodes-base.manualTrigger',
        typeVersion: 1,
        position: [0, 0]
      },
      {
        parameters: {
          assignments: {
            assignments: [
              { id: `actor-${preset.key}`, name: 'actorId', value: preset.actorId, type: 'string' },
              { id: `format-${preset.key}`, name: 'outputFormat', value: 'json', type: 'string' },
              { id: `input-${preset.key}`, name: 'input', value: inputExpression, type: 'object' }
            ]
          },
          options: {}
        },
        id: `preset-${preset.key}`,
        name: 'Preset (set outputFormat to json or csv)',
        type: 'n8n-nodes-base.set',
        typeVersion: 3.4,
        position: [240, 0]
      },
      {
        parameters: {
          method: 'POST',
          url: `https://api.apify.com/v2/acts/${preset.actorId}/run-sync-get-dataset-items`,
          sendQuery: true,
          queryParameters: {
            parameters: [
              { name: 'format', value: '={{ $json.outputFormat }}' },
              { name: 'clean', value: 'true' },
              { name: 'maxTotalChargeUsd', value: cap }
            ]
          },
          sendHeaders: true,
          headerParameters: {
            parameters: [
              { name: 'Authorization', value: tokenExpression }
            ]
          },
          sendBody: true,
          specifyBody: 'json',
          jsonBody: '={{ $json.input }}',
          options: {}
        },
        id: `run-${preset.key}`,
        name: 'Run actor and return dataset',
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 4.2,
        position: [520, 0]
      }
    ],
    pinData: {},
    connections: {
      'Run manually': {
        main: [[{ node: 'Preset (set outputFormat to json or csv)', type: 'main', index: 0 }]]
      },
      'Preset (set outputFormat to json or csv)': {
        main: [[{ node: 'Run actor and return dataset', type: 'main', index: 0 }]]
      }
    },
    active: false,
    settings: { executionOrder: 'v1' },
    versionId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    meta: { templateCredsSetupCompleted: true },
    tags: []
  };
}

for (const [index, preset] of manifest.presets.entries()) {
  const workflow = n8nWorkflow(preset, index);
  await writeFile(join(here, 'n8n', preset.n8nFile), `${JSON.stringify(workflow, null, 2)}\n`);
}

function postmanItem(preset) {
  const tests = [
    'pm.test("HTTP status is successful", function () {',
    '  pm.expect(pm.response.code).to.be.within(200, 299);',
    '});',
    'const rows = pm.response.json();',
    'pm.test("Response is a dataset array", function () {',
    '  pm.expect(rows).to.be.an("array");',
    '});',
    `pm.test("Result respects maxItems (${preset.input.maxItems})", function () {`,
    `  pm.expect(rows.length).to.be.at.most(${preset.input.maxItems});`,
    '});',
    'pm.test("Maximum charge is fixed at USD 0.25", function () {',
    '  const parameter = pm.request.url.query.find(function (item) { return item.key === "maxTotalChargeUsd"; });',
    '  pm.expect(parameter && parameter.value).to.eql("0.25");',
    '});'
  ];
  return {
    name: preset.name,
    event: [{ listen: 'test', script: { type: 'text/javascript', exec: tests } }],
    request: {
      method: 'POST',
      header: [{ key: 'Content-Type', value: 'application/json', type: 'text' }],
      body: { mode: 'raw', raw: JSON.stringify(preset.input, null, 2), options: { raw: { language: 'json' } } },
      url: {
        raw: `https://api.apify.com/v2/acts/${preset.actorId}/run-sync-get-dataset-items?format=json&clean=true&maxTotalChargeUsd=${cap}`,
        protocol: 'https',
        host: ['api', 'apify', 'com'],
        path: ['v2', 'acts', preset.actorId, 'run-sync-get-dataset-items'],
        query: [
          { key: 'format', value: 'json' },
          { key: 'clean', value: 'true' },
          { key: 'maxTotalChargeUsd', value: cap }
        ]
      },
      description: `Runs the public ${preset.name} preset and returns clean JSON dataset items.`
    },
    response: []
  };
}

const collection = {
  info: {
    _postman_id: '3c23c8d6-d21e-4c5f-9368-b74fe5b0e7d2',
    name: 'Flagship Apify Workflows',
    description: 'Six cost-capped buyer workflows for five public-data Apify Actors. Set APIFY_TOKEN in the collection variables before running.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
  },
  auth: {
    type: 'bearer',
    bearer: [{ key: 'token', value: '{{APIFY_TOKEN}}', type: 'string' }]
  },
  variable: [{ key: 'APIFY_TOKEN', value: '', type: 'secret' }],
  item: manifest.presets.map(postmanItem)
};

await writeFile(
  join(here, 'postman', 'Flagship-Apify-Workflows.postman_collection.json'),
  `${JSON.stringify(collection, null, 2)}\n`
);

console.log(`Built ${manifest.presets.length} n8n workflows and one Postman collection.`);

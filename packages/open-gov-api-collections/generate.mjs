import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  COLLECTION_DESCRIPTION,
  COLLECTION_NAME,
  allRequests,
  apifyRequests,
  buildUrl,
  expectedHeaders,
  rapidApiRequests,
} from './catalog.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const generatedAt = '2026-11-26T04:24:28.000Z';

function writeJson(relativePath, value) {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeText(relativePath, value) {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, value.replace(/\r\n/g, '\n'), 'utf8');
}

function postmanTests(request) {
  if ('slug' in request) {
    return [
      'pm.test("HTTP status is 200", function () {',
      '  pm.response.to.have.status(200);',
      '});',
      'pm.test("Response is JSON with a bounded items array", function () {',
      '  pm.expect(pm.response.headers.get("Content-Type")).to.include("application/json");',
      '  const payload = pm.response.json();',
      '  pm.expect(payload).to.be.an("object");',
      '  pm.expect(payload.items).to.be.an("array");',
      '  pm.expect(payload.items.length).to.be.at.most(5);',
      '});',
      'pm.test("RapidAPI billing reports returned rows", function () {',
      '  pm.expect(pm.response.headers.get("X-RapidAPI-Billing")).to.match(/^Rows=\\d+$/);',
      '});',
    ];
  }
  return [
    'pm.test("Apify synchronous run completed", function () {',
    '  pm.expect([200, 201]).to.include(pm.response.code);',
    '});',
    'pm.test("Response is a bounded dataset item array", function () {',
    '  pm.expect(pm.response.headers.get("Content-Type")).to.include("application/json");',
    '  const payload = pm.response.json();',
    '  pm.expect(payload).to.be.an("array");',
    '  pm.expect(payload.length).to.be.at.most(5);',
    '});',
    'pm.test("Server-side cost cap remains in the request URL", function () {',
    '  pm.expect(pm.request.url.query.get("maxTotalChargeUsd")).to.equal("0.25");',
    '});',
  ];
}

function postmanItem(request) {
  const url = new URL(buildUrl(request));
  const headers = expectedHeaders(request);
  const item = {
    name: request.name,
    event: [
      {
        listen: 'test',
        script: { exec: postmanTests(request), type: 'text/javascript' },
      },
    ],
    request: {
      method: 'slug' in request ? 'GET' : 'POST',
      header: Object.entries(headers).map(([key, value]) => ({ key, value, type: 'text' })),
      auth: { type: 'noauth' },
      url: {
        raw: url.toString(),
        protocol: url.protocol.slice(0, -1),
        host: url.hostname.split('.'),
        path: url.pathname.split('/').filter(Boolean),
        query: [...url.searchParams.entries()].map(([key, value]) => ({ key, value })),
      },
      description:
        'slug' in request
          ? `Paid RapidAPI request for ${request.slug}. Requires an active subscription; sending it may consume quota.`
          : `Paid Apify Actor request for ${request.actorId}. The maxTotalChargeUsd=0.25 query parameter is a server-side hard spend cap.`,
    },
    response: [],
  };
  if (!('slug' in request)) {
    item.request.body = {
      mode: 'raw',
      raw: JSON.stringify(request.body, null, 2),
      options: { raw: { language: 'json' } },
    };
  }
  return item;
}

const collection = {
  info: {
    _postman_id: '3ac73e7a-7bc2-4fd4-bb65-c77c7a3a8d40',
    name: COLLECTION_NAME,
    description: COLLECTION_DESCRIPTION,
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  item: [
    {
      name: 'RapidAPI Paid REST APIs',
      description: 'Four read-only RapidAPI endpoints. Subscribe before sending requests.',
      item: rapidApiRequests.map(postmanItem),
    },
    {
      name: 'Apify Paid Actors',
      description: 'Four public paid Actors. Every synchronous request has a USD 0.25 server-side charge cap.',
      item: apifyRequests.map(postmanItem),
    },
  ],
  event: [],
  variable: [],
};

const environment = {
  id: 'c62e45d4-53f3-421c-88dc-f76ddd8c1256',
  name: `${COLLECTION_NAME} - Local Secrets`,
  values: [
    { key: 'APIFY_TOKEN', value: '', type: 'secret', enabled: true },
    { key: 'RAPIDAPI_KEY', value: '', type: 'secret', enabled: true },
  ],
  _postman_variable_scope: 'environment',
  _postman_exported_at: generatedAt,
  _postman_exported_using: 'Node.js 20 zero-dependency generator',
};

function insomniaRequest(request, parentId, index) {
  const url = new URL(buildUrl(request));
  const isRapid = 'slug' in request;
  return {
    _id: `req_${request.id.replaceAll('-', '_')}`,
    parentId,
    modified: 1795656000000 + index,
    created: 1795656000000 + index,
    url: `${url.origin}${url.pathname}`,
    name: request.name,
    description: isRapid
      ? `Paid RapidAPI request for ${request.slug}.`
      : `Paid Apify Actor ${request.actorId}; maxTotalChargeUsd is fixed at 0.25.`,
    method: isRapid ? 'GET' : 'POST',
    body: isRapid
      ? {}
      : { mimeType: 'application/json', text: JSON.stringify(request.body, null, 2) },
    parameters: [...url.searchParams.entries()].map(([name, value]) => ({
      id: `pair_${request.id.replaceAll('-', '_')}_${name}`,
      name,
      value,
      disabled: false,
    })),
    headers: Object.entries(expectedHeaders(request)).map(([name, value]) => ({ name, value })),
    authentication: {},
    metaSortKey: -1000 + index,
    isPrivate: false,
    settingStoreCookies: false,
    settingSendCookies: false,
    settingDisableRenderRequestBody: false,
    settingEncodeUrl: true,
    settingRebuildPath: true,
    settingFollowRedirects: 'global',
    _type: 'request',
  };
}

const workspaceId = 'wrk_open_gov_paid_apis';
const rapidGroupId = 'fld_rapidapi_paid';
const apifyGroupId = 'fld_apify_paid';
const insomnia = {
  _type: 'export',
  __export_format: 4,
  __export_date: generatedAt,
  __export_source: 'open-gov-api-client-collections@1.0.0',
  resources: [
    {
      _id: workspaceId,
      parentId: null,
      modified: 1795656000000,
      created: 1795656000000,
      name: COLLECTION_NAME,
      description: COLLECTION_DESCRIPTION,
      scope: 'collection',
      _type: 'workspace',
    },
    {
      _id: 'env_open_gov_local_secrets',
      parentId: workspaceId,
      modified: 1795656000000,
      created: 1795656000000,
      name: 'Base Environment',
      data: { APIFY_TOKEN: '', RAPIDAPI_KEY: '' },
      dataPropertyOrder: null,
      color: null,
      isPrivate: true,
      metaSortKey: 1,
      _type: 'environment',
    },
    {
      _id: rapidGroupId,
      parentId: workspaceId,
      modified: 1795656000000,
      created: 1795656000000,
      name: 'RapidAPI Paid REST APIs',
      description: 'Four read-only paid RapidAPI requests.',
      environment: {},
      environmentPropertyOrder: null,
      metaSortKey: -2000,
      _type: 'request_group',
    },
    {
      _id: apifyGroupId,
      parentId: workspaceId,
      modified: 1795656000000,
      created: 1795656000000,
      name: 'Apify Paid Actors',
      description: 'Four paid Actor requests with a USD 0.25 hard cap.',
      environment: {},
      environmentPropertyOrder: null,
      metaSortKey: -1000,
      _type: 'request_group',
    },
    ...rapidApiRequests.map((request, index) => insomniaRequest(request, rapidGroupId, index)),
    ...apifyRequests.map((request, index) =>
      insomniaRequest(request, apifyGroupId, rapidApiRequests.length + index),
    ),
  ],
};

function brunoKeyValueBlock(name, entries) {
  return `${name} {\n${entries.map(([key, value]) => `  ${key}: ${value}`).join('\n')}\n}\n`;
}

function brunoRequest(request, sequence) {
  const isRapid = 'slug' in request;
  const url = new URL(buildUrl(request));
  const lines = [
    brunoKeyValueBlock('meta', [
      ['name', request.name],
      ['type', 'http'],
      ['seq', String(sequence)],
    ]),
    brunoKeyValueBlock(isRapid ? 'get' : 'post', [
      ['url', `${url.origin}${url.pathname}`],
      ['body', isRapid ? 'none' : 'json'],
      ['auth', 'none'],
    ]),
    brunoKeyValueBlock('params:query', [...url.searchParams.entries()]),
    brunoKeyValueBlock('headers', Object.entries(expectedHeaders(request))),
  ];
  if (!isRapid) {
    lines.push(`body:json {\n  ${JSON.stringify(request.body)}\n}\n`);
  }
  lines.push(
    isRapid
      ? `tests {\n  test("HTTP status is 200", function () {\n    expect(res.getStatus()).to.equal(200);\n  });\n  test("Response has an items array", function () {\n    expect(res.getBody().items).to.be.an("array");\n  });\n}\n`
      : `tests {\n  test("Apify synchronous run completed", function () {\n    expect([200, 201]).to.include(res.getStatus());\n  });\n  test("Response is an item array", function () {\n    expect(res.getBody()).to.be.an("array");\n  });\n}\n`,
  );
  return `${lines.join('\n')}\n`;
}

writeJson('postman/Open-Gov-Paid-APIs.postman_collection.json', collection);
writeJson('postman/Open-Gov-Paid-APIs.postman_environment.json', environment);
writeJson('insomnia/Open-Gov-Paid-APIs.insomnia.json', insomnia);
writeJson('bruno/bruno.json', {
  version: '1',
  name: COLLECTION_NAME,
  type: 'collection',
  ignore: ['node_modules', '.git'],
});
writeText(
  'bruno/01-rapidapi/folder.bru',
  `${brunoKeyValueBlock('meta', [
    ['name', 'RapidAPI Paid REST APIs'],
    ['type', 'folder'],
    ['seq', '1'],
  ])}\n`,
);
writeText(
  'bruno/02-apify/folder.bru',
  `${brunoKeyValueBlock('meta', [
    ['name', 'Apify Paid Actors'],
    ['type', 'folder'],
    ['seq', '2'],
  ])}\n`,
);
rapidApiRequests.forEach((request, index) => {
  const filename = `${String(index + 1).padStart(2, '0')}-${request.slug}.bru`;
  writeText(`bruno/01-rapidapi/${filename}`, brunoRequest(request, index + 1));
});
apifyRequests.forEach((request, index) => {
  const filename = `${String(index + 1).padStart(2, '0')}-${request.id.slice('apify-'.length)}.bru`;
  writeText(`bruno/02-apify/${filename}`, brunoRequest(request, index + 1));
});

console.log(`Generated Postman, Insomnia, and Bruno artifacts for ${allRequests.length} requests.`);

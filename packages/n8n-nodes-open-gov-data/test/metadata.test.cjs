'use strict';

const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const { resolve } = require('node:path');
const test = require('node:test');
const { OpenGovDataApifyApi } = require('../dist/credentials/OpenGovDataApifyApi.credentials.js');
const { OpenGovDataRapidApi } = require('../dist/credentials/OpenGovDataRapidApi.credentials.js');
const { OpenGovData } = require('../dist/nodes/OpenGovData/OpenGovData.node.js');

const root = resolve(__dirname, '..');
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

test('package follows the n8n community discovery contract', () => {
  assert.equal(packageJson.name, 'n8n-nodes-open-gov-data');
  assert.ok(packageJson.keywords.includes('n8n-community-node-package'));
  assert.equal(packageJson.n8n.n8nNodesApiVersion, 1);
  assert.deepEqual(packageJson.n8n.nodes, ['dist/nodes/OpenGovData/OpenGovData.node.js']);
  assert.deepEqual(packageJson.n8n.credentials, [
    'dist/credentials/OpenGovDataApifyApi.credentials.js',
    'dist/credentials/OpenGovDataRapidApi.credentials.js',
  ]);
  for (const relativePath of [...packageJson.n8n.nodes, ...packageJson.n8n.credentials]) {
    assert.equal(existsSync(resolve(root, relativePath)), true, `${relativePath} must exist`);
  }
});

test('package has no runtime or development dependencies and only an optional n8n peer', () => {
  assert.deepEqual(packageJson.dependencies ?? {}, {});
  assert.deepEqual(packageJson.optionalDependencies ?? {}, {});
  assert.deepEqual(packageJson.devDependencies ?? {}, {});
  assert.deepEqual(packageJson.peerDependencies, { 'n8n-workflow': '>=1.0.0' });
  assert.equal(packageJson.peerDependenciesMeta['n8n-workflow'].optional, true);
  assert.equal(packageJson.engines.node, '>=20');
});

test('node metadata declares both conditional credentials and the hard charge cap', () => {
  const description = new OpenGovData().description;
  assert.equal(description.name, 'openGovData');
  assert.deepEqual(description.inputs, ['main']);
  assert.deepEqual(description.outputs, ['main']);
  assert.deepEqual(description.credentials.map((credential) => credential.name), [
    'openGovDataApifyApi',
    'openGovDataRapidApi',
  ]);
  const cap = description.properties.find((property) => property.name === 'maxTotalChargeUsd');
  assert.ok(cap);
  assert.equal(cap.required, true);
  assert.equal(cap.default, 0.25);
  assert.deepEqual(cap.displayOptions, { show: { provider: ['apify'] } });
  assert.equal(description.properties.find((property) => property.name === 'maxItems').default, 10);
});

test('credential metadata uses password fields and never embeds a credential value', () => {
  for (const credential of [new OpenGovDataApifyApi(), new OpenGovDataRapidApi()]) {
    assert.equal(credential.properties.length, 1);
    assert.equal(credential.properties[0].type, 'string');
    assert.equal(credential.properties[0].typeOptions.password, true);
    assert.equal(credential.properties[0].default, '');
    assert.equal(credential.properties[0].required, true);
  }
});

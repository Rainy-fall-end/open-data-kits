'use strict';

const assert = require('node:assert/strict');
const { existsSync, readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const test = require('node:test');
const { OpenGovDataApifyApi } = require('../credentials/OpenGovDataApifyApi.credentials.js');
const { OpenGovDataRapidApi } = require('../credentials/OpenGovDataRapidApi.credentials.js');
const {
  SOURCES,
  canonicalSource,
  getSourceDefinition,
  sourceOptions,
} = require('../lib/catalog.js');
const { OpenGovData } = require('../nodes/OpenGovData/OpenGovData.node.js');

const root = resolve(__dirname, '..');
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

test('catalog exposes exactly eight canonical Apify and four canonical RapidAPI operations', () => {
  assert.deepEqual(Object.keys(SOURCES.apify), [
    'atsJobsHiringSignals',
    'secEdgarIntelligence',
    'globalPublicTenders',
    'pharmaPipelineIntelligence',
    'usaspendingContracts',
    'clinicalTrials',
    'ukGovTenders',
    'sgGreenMark',
  ]);
  assert.deepEqual(Object.keys(SOURCES.rapidapi), [
    'secEdgarCorporateFilings',
    'clinicaltrialsStudies',
    'openfdaRecalls',
    'sgGreenMarkBuildings',
  ]);
  assert.equal(sourceOptions('apify').length, 8);
  assert.equal(sourceOptions('rapidapi').length, 4);
});

test('v0.1 source values remain accepted without appearing as duplicate operations', () => {
  assert.equal(canonicalSource('apify', 'secEdgar'), 'secEdgarIntelligence');
  assert.equal(canonicalSource('apify', 'singaporeGreenMark'), 'sgGreenMark');
  assert.equal(canonicalSource('rapidapi', 'secEdgar'), 'secEdgarCorporateFilings');
  assert.equal(canonicalSource('rapidapi', 'clinicalTrials'), 'clinicaltrialsStudies');
  assert.equal(canonicalSource('rapidapi', 'openFda'), 'openfdaRecalls');
  assert.equal(canonicalSource('rapidapi', 'singaporeGreenMark'), 'sgGreenMarkBuildings');
  assert.equal(getSourceDefinition('apify', 'clinicalTrials'), SOURCES.apify.clinicalTrials);
  assert.equal(getSourceDefinition('apify', 'ukGovTenders'), SOURCES.apify.ukGovTenders);
});

test('package and n8n manifest preserve the v0.1 node and credential identities', () => {
  assert.equal(packageJson.name, 'n8n-nodes-open-gov-data');
  assert.equal(packageJson.version, '0.2.0');
  assert.equal(packageJson.n8n.n8nNodesApiVersion, 1);
  assert.deepEqual(packageJson.n8n.nodes, ['nodes/OpenGovData/OpenGovData.node.js']);
  assert.deepEqual(packageJson.n8n.credentials, [
    'credentials/OpenGovDataApifyApi.credentials.js',
    'credentials/OpenGovDataRapidApi.credentials.js',
  ]);
  for (const path of [...packageJson.n8n.nodes, ...packageJson.n8n.credentials]) {
    assert.equal(existsSync(resolve(root, path)), true, `${path} must exist`);
  }
  const description = new OpenGovData().description;
  assert.equal(description.name, 'openGovData');
  assert.equal(description.version, 1);
  assert.deepEqual(description.credentials.map((item) => item.name), [
    'openGovDataApifyApi',
    'openGovDataRapidApi',
  ]);
  assert.equal(new OpenGovDataApifyApi().name, 'openGovDataApifyApi');
  assert.equal(new OpenGovDataRapidApi().name, 'openGovDataRapidApi');
});

test('package has no runtime/build dependencies and only the optional n8n peer', () => {
  assert.deepEqual(packageJson.dependencies ?? {}, {});
  assert.deepEqual(packageJson.optionalDependencies ?? {}, {});
  assert.deepEqual(packageJson.devDependencies ?? {}, {});
  assert.deepEqual(packageJson.peerDependencies, { 'n8n-workflow': '>=1.0.0' });
  assert.equal(packageJson.peerDependenciesMeta['n8n-workflow'].optional, true);
  assert.equal(packageJson.engines.node, '>=20');
});

test('node declares the immutable 0.25 default and maximum charge cap', () => {
  const description = new OpenGovData().description;
  const cap = description.properties.find((property) => property.name === 'maxTotalChargeUsd');
  assert.equal(cap.default, 0.25);
  assert.equal(cap.required, true);
  assert.equal(cap.typeOptions.maxValue, 0.25);
  assert.equal(description.properties.find((property) => property.name === 'maxItems').default, 10);
});

test('credential metadata is password-only and embeds no values', () => {
  for (const credential of [new OpenGovDataApifyApi(), new OpenGovDataRapidApi()]) {
    assert.equal(credential.properties.length, 1);
    assert.equal(credential.properties[0].typeOptions.password, true);
    assert.equal(credential.properties[0].default, '');
    assert.equal(credential.properties[0].required, true);
  }
});

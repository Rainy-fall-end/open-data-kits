'use strict';

const { sourceOptions } = require('../../lib/catalog.js');
const { executeRequest, extractRecords, safeError } = require('../../lib/client.js');

class OpenGovData {
  constructor() {
    this.description = {
      displayName: 'Open Gov Data',
      name: 'openGovData',
      icon: 'file:openGovData.svg',
      group: ['transform'],
      version: 1,
      subtitle: '={{$parameter["provider"] + ": " + $parameter["source"]}}',
      description: 'Fetch 12 allowlisted public-data products through cost-capped Apify or RapidAPI',
      defaults: { name: 'Open Gov Data' },
      inputs: ['main'],
      outputs: ['main'],
      credentials: [
        {
          name: 'openGovDataApifyApi',
          required: true,
          displayOptions: { show: { provider: ['apify'] } },
        },
        {
          name: 'openGovDataRapidApi',
          required: true,
          displayOptions: { show: { provider: ['rapidapi'] } },
        },
      ],
      properties: [
        {
          displayName: 'Provider',
          name: 'provider',
          type: 'options',
          noDataExpression: true,
          options: [
            { name: 'Apify Actors', value: 'apify' },
            { name: 'RapidAPI', value: 'rapidapi' },
          ],
          default: 'apify',
        },
        {
          displayName: 'Operation',
          name: 'source',
          type: 'options',
          noDataExpression: true,
          displayOptions: { show: { provider: ['apify'] } },
          options: sourceOptions('apify'),
          default: 'atsJobsHiringSignals',
        },
        {
          displayName: 'Operation',
          name: 'source',
          type: 'options',
          noDataExpression: true,
          displayOptions: { show: { provider: ['rapidapi'] } },
          options: sourceOptions('rapidapi'),
          default: 'secEdgarCorporateFilings',
        },
        {
          displayName: 'Request Input',
          name: 'requestInput',
          type: 'json',
          default: '{}',
          description: 'Actor input or RapidAPI query parameters. Unknown and credential-like fields are rejected.',
        },
        {
          displayName: 'Max Items',
          name: 'maxItems',
          type: 'number',
          typeOptions: { minValue: 1, maxValue: 10000 },
          default: 10,
          description: 'Overrides Actor maxItems or RapidAPI limit; each selected product enforces its own maximum.',
        },
        {
          displayName: 'Max Total Charge USD',
          name: 'maxTotalChargeUsd',
          type: 'number',
          typeOptions: { minValue: 0.00005, maxValue: 0.25, numberPrecision: 5 },
          displayOptions: { show: { provider: ['apify'] } },
          default: 0.25,
          required: true,
          description: 'Hard server-side Apify spending cap. This node never permits more than $0.25 per run.',
        },
        {
          displayName: 'Timeout (ms)',
          name: 'timeoutMs',
          type: 'number',
          typeOptions: { minValue: 100, maxValue: 300000 },
          default: 30000,
          description: 'Abort the single upstream attempt after this duration. Requests are never retried.',
        },
      ],
    };
  }

  async execute() {
    const inputs = this.getInputData();
    const output = [];
    const credentialCache = new Map();
    for (let index = 0; index < inputs.length; index += 1) {
      const provider = this.getNodeParameter('provider', index);
      const credentialName = provider === 'apify' ? 'openGovDataApifyApi' : 'openGovDataRapidApi';
      try {
        if (!credentialCache.has(credentialName)) {
          credentialCache.set(credentialName, await this.getCredentials(credentialName, index));
        }
        const payload = await executeRequest({
          provider,
          source: this.getNodeParameter('source', index),
          requestInput: this.getNodeParameter('requestInput', index, '{}'),
          maxItems: this.getNodeParameter('maxItems', index, 10),
          maxTotalChargeUsd: provider === 'apify'
            ? this.getNodeParameter('maxTotalChargeUsd', index, 0.25)
            : undefined,
          timeoutMs: this.getNodeParameter('timeoutMs', index, 30000),
          credentials: credentialCache.get(credentialName),
        });
        for (const record of extractRecords(payload)) {
          output.push({
            json: record && typeof record === 'object' && !Array.isArray(record) ? record : { value: record },
            pairedItem: { item: index },
          });
        }
      } catch (error) {
        const details = safeError(error);
        if (this.continueOnFail()) {
          output.push({ json: { error: details }, pairedItem: { item: index } });
        } else {
          const wrapped = new Error(details.message);
          wrapped.name = 'OpenGovDataNodeError';
          wrapped.code = details.code;
          if (details.statusCode !== undefined) wrapped.statusCode = details.statusCode;
          throw wrapped;
        }
      }
    }
    return [output];
  }
}

module.exports = { OpenGovData };

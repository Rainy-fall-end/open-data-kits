import { formatUsdMicros, USD_SCALE } from './config.js';

export const APIFY_ACTOR_IDS = Object.freeze([
  '8LFIbRbidiHPknMz5',
  'KchE3qKKrwU0rCe9f',
  'txnvyTckeQx4hVBc6',
  'Z3ioK0wOAeczj6nCx',
]);

export const RAPIDAPI_SLUGS = Object.freeze([
  'sec-edgar-corporate-filings',
  'clinicaltrials-gov-studies-trials',
  'openfda-recalls-enforcement-approvals',
  'singapore-bca-green-mark-buildings',
]);

const trialStatuses = Object.freeze([
  'RECRUITING',
  'NOT_YET_RECRUITING',
  'ACTIVE_NOT_RECRUITING',
  'COMPLETED',
  'ENROLLING_BY_INVITATION',
  'SUSPENDED',
  'TERMINATED',
  'WITHDRAWN',
  'UNKNOWN',
]);

const ratings = Object.freeze(['Platinum', 'Goldplus', 'Gold', 'Certified']);

const shortText = (maxLength) => ({ type: 'string', minLength: 1, maxLength });
const date = () => ({ type: 'string', format: 'date' });
const closedObject = (properties, extras = {}) => ({
  type: 'object',
  properties,
  additionalProperties: false,
  ...extras,
});

function secProperties(rowProperty) {
  return {
    mode: {
      type: 'string',
      enum: ['search', 'company'],
      default: 'search',
      description: 'Use search for full-text/recent filings or company for CIK/ticker lookup.',
    },
    query: { ...shortText(200), description: 'Full-text EDGAR keyword query.' },
    forms: {
      ...shortText(100),
      default: '10-K,10-Q,8-K',
      description: 'Comma-separated SEC form types.',
    },
    cik: {
      type: 'string',
      minLength: 1,
      maxLength: 10,
      pattern: '^\\d{1,10}$',
      description: 'SEC Central Index Key, padded or unpadded.',
    },
    ticker: {
      type: 'string',
      minLength: 1,
      maxLength: 16,
      pattern: '^[A-Za-z][A-Za-z0-9.-]{0,15}$',
      description: 'US stock ticker symbol.',
    },
    startDate: { ...date(), description: 'Earliest filing date (YYYY-MM-DD).' },
    endDate: { ...date(), description: 'Latest filing date (YYYY-MM-DD).' },
    ...rowProperty,
  };
}

const companyRequirement = {
  if: {
    type: 'object',
    properties: { mode: { const: 'company' } },
    required: ['mode'],
  },
  then: { anyOf: [{ required: ['cik'] }, { required: ['ticker'] }] },
};

function clinicalProperties(rowProperty) {
  return {
    condition: { ...shortText(200), description: 'Medical condition or disease.' },
    intervention: { ...shortText(200), description: 'Intervention or treatment.' },
    status: { type: 'string', enum: [...trialStatuses] },
    sponsor: { ...shortText(200), description: 'Lead sponsor or collaborator.' },
    queryTerm: { ...shortText(200), description: 'General keyword across study fields.' },
    ...rowProperty,
  };
}

function rapidLimit() {
  return {
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 20,
      default: 5,
      description: 'Maximum rows for this single paid RapidAPI request.',
    },
  };
}

function actorControls(config, maximum) {
  return {
    maxItems: {
      type: 'integer',
      minimum: 1,
      maximum,
      default: 10,
      description: 'Maximum dataset items requested from the Actor.',
    },
    maxTotalChargeUsd: {
      type: 'number',
      exclusiveMinimum: 0,
      maximum: config.hardChargeMicros / USD_SCALE,
      multipleOf: 0.000001,
      default: config.defaultChargeMicros / USD_SCALE,
      description: `Server-side Apify charge cap; cannot exceed the environment hard cap of USD ${formatUsdMicros(config.hardChargeMicros)}.`,
    },
  };
}

function definition({ name, title, description, provider, source, actorId, apiSlug, host, path, inputSchema }) {
  return Object.freeze({
    name,
    provider,
    source,
    actorId,
    apiSlug,
    host,
    path,
    tool: Object.freeze({ name, title, description, inputSchema }),
  });
}

export function createToolCatalog(config) {
  const rapid = rapidLimit();
  const actorSec = actorControls(config, 5_000);
  const actorClinical = actorControls(config, 5_000);
  const actorUk = actorControls(config, 2_000);
  const actorSg = actorControls(config, 1_000);

  const definitions = [
    definition({
      name: 'rapidapi_sec_edgar_filings',
      title: 'RapidAPI: SEC EDGAR Corporate Filings',
      description: 'Paid read-only query of SEC EDGAR filings through sec-edgar-corporate-filings.',
      provider: 'rapidapi',
      source: 'secEdgar',
      apiSlug: RAPIDAPI_SLUGS[0],
      host: `${RAPIDAPI_SLUGS[0]}.p.rapidapi.com`,
      path: '/v1/sec-edgar/filings',
      inputSchema: closedObject(secProperties(rapid), { allOf: [companyRequirement] }),
    }),
    definition({
      name: 'rapidapi_clinical_trials',
      title: 'RapidAPI: ClinicalTrials.gov Studies',
      description: 'Paid read-only query of ClinicalTrials.gov studies through clinicaltrials-gov-studies-trials.',
      provider: 'rapidapi',
      source: 'clinicalTrials',
      apiSlug: RAPIDAPI_SLUGS[1],
      host: `${RAPIDAPI_SLUGS[1]}.p.rapidapi.com`,
      path: '/v1/clinical-trials/studies',
      inputSchema: closedObject(clinicalProperties(rapid)),
    }),
    definition({
      name: 'rapidapi_openfda_records',
      title: 'RapidAPI: openFDA Records',
      description: 'Paid read-only query of openFDA recalls, enforcement records, and approvals.',
      provider: 'rapidapi',
      source: 'openFda',
      apiSlug: RAPIDAPI_SLUGS[2],
      host: `${RAPIDAPI_SLUGS[2]}.p.rapidapi.com`,
      path: '/v1/openfda/records',
      inputSchema: closedObject({
        dataset: {
          type: 'string',
          enum: ['drug_enforcement', 'device_recall', 'food_enforcement', 'drug_approvals'],
          default: 'drug_enforcement',
        },
        searchQuery: { ...shortText(200), description: 'openFDA search expression or keyword.' },
        classification: { type: 'string', enum: ['Class I', 'Class II', 'Class III'] },
        status: { type: 'string', enum: ['Ongoing', 'Completed', 'Terminated'] },
        ...rapid,
      }),
    }),
    definition({
      name: 'rapidapi_singapore_green_mark',
      title: 'RapidAPI: Singapore BCA Green Mark Buildings',
      description: 'Paid read-only query of Singapore BCA Green Mark building certificates.',
      provider: 'rapidapi',
      source: 'singaporeGreenMark',
      apiSlug: RAPIDAPI_SLUGS[3],
      host: `${RAPIDAPI_SLUGS[3]}.p.rapidapi.com`,
      path: '/v1/sg-green-mark/certificates',
      inputSchema: closedObject({
        rating: { type: 'string', enum: [...ratings] },
        ...rapid,
      }),
    }),
    definition({
      name: 'apify_sec_edgar_filings',
      title: 'Apify: SEC EDGAR Corporate Filings',
      description: 'Run the fixed paid SEC EDGAR Actor with a mandatory server-side charge cap.',
      provider: 'apify',
      source: 'secEdgar',
      actorId: APIFY_ACTOR_IDS[0],
      inputSchema: closedObject(secProperties(actorSec), { allOf: [companyRequirement] }),
    }),
    definition({
      name: 'apify_clinical_trials',
      title: 'Apify: ClinicalTrials.gov Studies',
      description: 'Run the fixed paid ClinicalTrials.gov Actor with a mandatory server-side charge cap.',
      provider: 'apify',
      source: 'clinicalTrials',
      actorId: APIFY_ACTOR_IDS[1],
      inputSchema: closedObject(clinicalProperties(actorClinical)),
    }),
    definition({
      name: 'apify_uk_gov_tenders',
      title: 'Apify: UK Government Tenders',
      description: 'Run the fixed paid UK Contracts Finder OCDS Actor with a mandatory server-side charge cap.',
      provider: 'apify',
      source: 'ukGovTenders',
      actorId: APIFY_ACTOR_IDS[2],
      inputSchema: closedObject({
        keyword: { ...shortText(120), description: 'Case-insensitive notice keyword.' },
        stages: {
          type: 'string',
          enum: ['tender', 'planning', 'award', 'planning,tender,award'],
          default: 'tender',
        },
        minValue: { type: 'number', minimum: 0 },
        publishedFrom: {
          type: 'string',
          minLength: 10,
          maxLength: 40,
          pattern: '^\\d{4}-\\d{2}-\\d{2}(?:T[^\\s]{1,30})?$',
          description: 'Earliest publication date or ISO 8601 timestamp.',
        },
        ...actorUk,
      }),
    }),
    definition({
      name: 'apify_singapore_green_mark',
      title: 'Apify: Singapore BCA Green Mark Buildings',
      description: 'Run the fixed paid Singapore Green Mark Actor with a mandatory server-side charge cap.',
      provider: 'apify',
      source: 'singaporeGreenMark',
      actorId: APIFY_ACTOR_IDS[3],
      inputSchema: closedObject({
        query: { ...shortText(120), description: 'Project name or certificate reference.' },
        rating: { type: 'string', enum: [...ratings] },
        expiresWithinDays: { type: 'integer', minimum: 0, maximum: 3_650 },
        ...actorSg,
      }),
    }),
  ];

  return Object.freeze(definitions);
}

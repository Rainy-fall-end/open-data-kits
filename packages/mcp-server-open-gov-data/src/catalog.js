import { formatUsdMicros, USD_SCALE } from './config.js';

export const APIFY_ACTOR_IDS = Object.freeze([
  'CRulq5dak4mqAUmMn',
  '8LFIbRbidiHPknMz5',
  'ZlabhlvEIyRVdtKiQ',
  're8aRvtqBonP5HMuY',
  'eQQ2beomyLlW4DTGM',
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

export const RAPIDAPI_HOSTS = Object.freeze(
  RAPIDAPI_SLUGS.map((slug) => `${slug}.p.rapidapi.com`),
);

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
const isoDateOrEmpty = '^(?:|\\d{4}-\\d{2}-\\d{2})$';

const string = (maxLength, extras = {}) => ({ type: 'string', maxLength, ...extras });
const closedObject = (properties, extras = {}) => ({
  type: 'object',
  properties,
  additionalProperties: false,
  ...extras,
});
const stringArray = (itemSchema, maximum = 100) => ({
  type: 'array',
  items: itemSchema,
  maxItems: maximum,
  uniqueItems: true,
});

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
      description: `Server-side Apify charge cap; cannot exceed USD ${formatUsdMicros(config.hardChargeMicros)}.`,
    },
  };
}

function rapidLimit(maximum = 20) {
  return {
    limit: {
      type: 'integer',
      minimum: 1,
      maximum,
      default: 5,
      description: 'Maximum rows returned by this single RapidAPI request.',
    },
  };
}

function definition({
  name,
  title,
  description,
  provider,
  source,
  actorId,
  apiSlug,
  host,
  path,
  schemaSource,
  inputSchema,
}) {
  return Object.freeze({
    name,
    provider,
    source,
    actorId,
    apiSlug,
    host,
    path,
    schemaSource,
    tool: Object.freeze({ name, title, description, inputSchema }),
  });
}

export function createToolCatalog(config) {
  const definitions = [
    definition({
      name: 'apify_ats_jobs_hiring_signals',
      title: 'Apify: ATS Jobs & Hiring Signals',
      description: 'Run the fixed public ATS jobs and hiring-signals Actor with a mandatory charge cap.',
      provider: 'apify',
      source: 'atsJobsHiringSignals',
      actorId: APIFY_ACTOR_IDS[0],
      schemaSource: 'actors/ats-jobs-hiring-signals-scraper/.actor/input_schema.json',
      inputSchema: closedObject({
        preset: {
          type: 'string',
          enum: ['ai_leaders', 'fintech_saas', 'all_curated', 'custom_only'],
          default: 'ai_leaders',
        },
        companyBoards: stringArray(string(500, { minLength: 1 }), 100),
        keywords: string(500),
        remoteOnly: { type: 'boolean', default: false },
        departmentFilter: string(200),
        includeDescription: { type: 'boolean', default: false },
        ...actorControls(config, 10_000),
      }),
    }),
    definition({
      name: 'apify_sec_edgar_intelligence',
      title: 'Apify: SEC EDGAR Intelligence',
      description: 'Run Form D funding, XBRL financials, or corporate filings on the fixed public SEC Actor.',
      provider: 'apify',
      source: 'secEdgarIntelligence',
      actorId: APIFY_ACTOR_IDS[1],
      schemaSource: 'actors/sec-edgar-filings-scraper/.actor/input_schema.json',
      inputSchema: closedObject({
        mode: {
          type: 'string',
          enum: ['form_d_funding', 'xbrl_financials', 'filings'],
          default: 'form_d_funding',
        },
        query: string(200),
        ticker: string(16, { pattern: '^(?:|[A-Za-z][A-Za-z0-9.-]{0,15})$' }),
        cik: string(20, { pattern: '^(?:|\\d{1,20})$' }),
        forms: string(100),
        startDate: string(10, { pattern: isoDateOrEmpty }),
        endDate: string(10, { pattern: isoDateOrEmpty }),
        excludePooledFunds: { type: 'boolean', default: false },
        minOfferingAmountUsd: { type: 'integer', minimum: 0 },
        industryFilter: string(120),
        includeAmendments: { type: 'boolean', default: true },
        ...actorControls(config, 5_000),
      }),
    }),
    definition({
      name: 'apify_global_public_tenders',
      title: 'Apify: Global Public Tenders & Grants',
      description: 'Run the fixed public multi-source tenders and grants Actor with a mandatory charge cap.',
      provider: 'apify',
      source: 'globalPublicTenders',
      actorId: APIFY_ACTOR_IDS[2],
      schemaSource: 'actors/global-public-tenders-grants-aggregator/.actor/input_schema.json',
      inputSchema: closedObject({
        sources: stringArray({
          type: 'string',
          enum: [
            'uk_find_a_tender',
            'eu_ted',
            'us_grants_gov',
            'usaspending',
            'world_bank',
            'canada_contracts',
            'austender',
          ],
        }, 7),
        opportunityTypes: stringArray({
          type: 'string',
          enum: ['tender', 'grant', 'award'],
        }, 3),
        keyword: string(200),
        dateFrom: string(10, { pattern: isoDateOrEmpty }),
        dateTo: string(10, { pattern: isoDateOrEmpty }),
        perSourceLimit: { type: 'integer', minimum: 1, maximum: 1_000, default: 2 },
        sourceTimeoutSecs: { type: 'integer', minimum: 1, maximum: 30, default: 20 },
        ...actorControls(config, 5_000),
      }),
    }),
    definition({
      name: 'apify_pharma_pipeline_intelligence',
      title: 'Apify: Pharma & Biotech Pipeline Intelligence',
      description: 'Run the fixed public biomedical pipeline Actor with a mandatory charge cap.',
      provider: 'apify',
      source: 'pharmaPipelineIntelligence',
      actorId: APIFY_ACTOR_IDS[3],
      schemaSource: 'actors/pharma-biotech-pipeline-intelligence/.actor/input_schema.json',
      inputSchema: closedObject({
        mode: { type: 'string', enum: ['drug_dossier', 'pipeline_feed'], default: 'drug_dossier' },
        query: string(200, { minLength: 1 }),
        drugNames: stringArray(string(200, { minLength: 1 }), 25),
        sourceItemsPerQuery: { type: 'integer', minimum: 1, maximum: 25, default: 5 },
        sourceTimeoutSeconds: { type: 'integer', minimum: 2, maximum: 60, default: 25 },
        requestDelayMs: { type: 'integer', minimum: 0, maximum: 5_000, default: 150 },
        ...actorControls(config, 1_000),
      }),
    }),
    definition({
      name: 'apify_usaspending_contracts',
      title: 'Apify: USAspending Contracts & Grants',
      description: 'Run the fixed public USAspending awards Actor with a mandatory charge cap.',
      provider: 'apify',
      source: 'usaspendingContracts',
      actorId: APIFY_ACTOR_IDS[4],
      schemaSource: 'actors/usaspending-gov-contracts-scraper/.actor/input_schema.json',
      inputSchema: closedObject({
        keyword: string(200),
        awardCategory: { type: 'string', enum: ['contracts', 'grants', 'idvs'], default: 'contracts' },
        startDate: string(10, { pattern: '^\\d{4}-\\d{2}-\\d{2}$' }),
        endDate: string(10, { pattern: '^\\d{4}-\\d{2}-\\d{2}$' }),
        awardingAgency: string(200),
        minAwardAmount: { type: 'number', minimum: 0 },
        naicsCode: string(20, { pattern: '^(?:|[A-Za-z0-9.-]{1,20})$' }),
        sortOrder: { type: 'string', enum: ['desc', 'asc'], default: 'desc' },
        ...actorControls(config, 5_000),
      }),
    }),
    definition({
      name: 'apify_clinical_trials',
      title: 'Apify: ClinicalTrials.gov Studies',
      description: 'Run the fixed public ClinicalTrials.gov Actor with a mandatory charge cap.',
      provider: 'apify',
      source: 'clinicalTrials',
      actorId: APIFY_ACTOR_IDS[5],
      schemaSource: 'actors/clinical-trials-scraper/.actor/input_schema.json',
      inputSchema: closedObject({
        condition: string(200),
        intervention: string(200),
        status: { type: 'string', enum: ['', ...trialStatuses] },
        sponsor: string(200),
        queryTerm: string(200),
        ...actorControls(config, 5_000),
      }),
    }),
    definition({
      name: 'apify_uk_gov_tenders',
      title: 'Apify: UK Government Tenders',
      description: 'Run the fixed public UK Contracts Finder Actor with a mandatory charge cap.',
      provider: 'apify',
      source: 'ukGovTenders',
      actorId: APIFY_ACTOR_IDS[6],
      schemaSource: 'actors/uk-gov-tenders-scraper/.actor/input_schema.json',
      inputSchema: closedObject({
        keyword: string(120),
        stages: {
          type: 'string',
          enum: ['tender', 'planning', 'award', 'planning,tender,award'],
          default: 'tender',
        },
        minValue: { type: 'number', minimum: 0 },
        publishedFrom: string(40, {
          pattern: '^(?:|\\d{4}-\\d{2}-\\d{2}(?:T[^\\s]{1,30})?)$',
        }),
        ...actorControls(config, 2_000),
      }),
    }),
    definition({
      name: 'apify_sg_green_mark',
      title: 'Apify: Singapore BCA Green Mark Buildings',
      description: 'Run the fixed public Singapore Green Mark Actor with a mandatory charge cap.',
      provider: 'apify',
      source: 'singaporeGreenMark',
      actorId: APIFY_ACTOR_IDS[7],
      schemaSource: 'actors/sg-green-mark-buildings/.actor/input_schema.json',
      inputSchema: closedObject({
        query: string(120),
        rating: { type: 'string', enum: ['', ...ratings] },
        expiresWithinDays: { type: 'integer', minimum: 0, maximum: 3_650 },
        ...actorControls(config, 1_000),
      }),
    }),
    definition({
      name: 'rapidapi_sec_edgar',
      title: 'RapidAPI: SEC EDGAR Corporate Filings',
      description: 'Query the fixed SEC EDGAR filings endpoint from its checked OpenAPI contract.',
      provider: 'rapidapi',
      source: 'secEdgar',
      apiSlug: RAPIDAPI_SLUGS[0],
      host: RAPIDAPI_HOSTS[0],
      path: '/v1/sec-edgar/filings',
      schemaSource: 'pipelines/rapidapi_hub/openapi/sec-edgar-api.json',
      inputSchema: closedObject({
        mode: { type: 'string', enum: ['search', 'company'], default: 'search' },
        query: string(200),
        forms: string(100),
        cik: string(20),
        ticker: string(16),
        startDate: string(10, { pattern: isoDateOrEmpty }),
        endDate: string(10, { pattern: isoDateOrEmpty }),
        ...rapidLimit(20),
      }),
    }),
    definition({
      name: 'rapidapi_clinical_trials',
      title: 'RapidAPI: ClinicalTrials.gov Studies',
      description: 'Query the fixed ClinicalTrials.gov studies endpoint from its checked OpenAPI contract.',
      provider: 'rapidapi',
      source: 'clinicalTrials',
      apiSlug: RAPIDAPI_SLUGS[1],
      host: RAPIDAPI_HOSTS[1],
      path: '/v1/clinical-trials/studies',
      schemaSource: 'pipelines/rapidapi_hub/openapi/clinical-trials-api.json',
      inputSchema: closedObject({
        condition: string(200),
        intervention: string(200),
        status: { type: 'string', enum: [...trialStatuses] },
        sponsor: string(200),
        queryTerm: string(200),
        ...rapidLimit(20),
      }),
    }),
    definition({
      name: 'rapidapi_openfda',
      title: 'RapidAPI: openFDA Records',
      description: 'Query the fixed openFDA records endpoint from its checked OpenAPI contract.',
      provider: 'rapidapi',
      source: 'openFda',
      apiSlug: RAPIDAPI_SLUGS[2],
      host: RAPIDAPI_HOSTS[2],
      path: '/v1/openfda/records',
      schemaSource: 'pipelines/rapidapi_hub/openapi/openfda-recalls-api.json',
      inputSchema: closedObject({
        dataset: {
          type: 'string',
          enum: ['drug_enforcement', 'device_recall', 'food_enforcement', 'drug_approvals'],
          default: 'drug_enforcement',
        },
        searchQuery: string(200),
        classification: { type: 'string', enum: ['Class I', 'Class II', 'Class III'] },
        status: { type: 'string', enum: ['Ongoing', 'Completed', 'Terminated'] },
        ...rapidLimit(20),
      }),
    }),
    definition({
      name: 'rapidapi_sg_green_mark',
      title: 'RapidAPI: Singapore BCA Green Mark Buildings',
      description: 'Query the fixed Singapore Green Mark certificates endpoint from its checked OpenAPI contract.',
      provider: 'rapidapi',
      source: 'singaporeGreenMark',
      apiSlug: RAPIDAPI_SLUGS[3],
      host: RAPIDAPI_HOSTS[3],
      path: '/v1/sg-green-mark/certificates',
      schemaSource: 'pipelines/rapidapi_hub/openapi/sg-green-mark-api.json',
      inputSchema: closedObject({
        limit: rapidLimit(20).limit,
        rating: { type: 'string', enum: [...ratings] },
      }),
    }),
  ];
  return Object.freeze(definitions);
}

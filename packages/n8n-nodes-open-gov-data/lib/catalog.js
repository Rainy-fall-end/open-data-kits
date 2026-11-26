'use strict';

const objectSchema = (properties) => ({ type: 'object', properties, additionalProperties: false });
const stringSchema = (options = {}) => ({ type: 'string', ...options });
const integerSchema = (options = {}) => ({ type: 'integer', ...options });
const numberSchema = (options = {}) => ({ type: 'number', ...options });
const arraySchema = (options = {}) => ({ type: 'array', ...options });

const trialStatuses = [
  'RECRUITING',
  'NOT_YET_RECRUITING',
  'ACTIVE_NOT_RECRUITING',
  'COMPLETED',
  'ENROLLING_BY_INVITATION',
  'SUSPENDED',
  'TERMINATED',
  'WITHDRAWN',
  'UNKNOWN',
];
const ratings = ['Platinum', 'Goldplus', 'Gold', 'Certified'];
const rapidLimit = integerSchema({ minimum: 1, maximum: 20, default: 5 });

const SOURCES = Object.freeze({
  apify: Object.freeze({
    atsJobsHiringSignals: Object.freeze({
      label: 'ATS Jobs & Hiring Signals',
      actorId: 'CRulq5dak4mqAUmMn',
      schemaSource: 'actors/ats-jobs-hiring-signals-scraper/.actor/input_schema.json',
      inputSchema: objectSchema({
        preset: stringSchema({ default: 'ai_leaders', enum: ['ai_leaders', 'fintech_saas', 'all_curated', 'custom_only'] }),
        companyBoards: arraySchema({ default: [] }),
        keywords: stringSchema({ default: '' }),
        remoteOnly: { type: 'boolean', default: false },
        departmentFilter: stringSchema({ default: '' }),
        includeDescription: { type: 'boolean', default: false },
        maxItems: integerSchema({ minimum: 1, maximum: 10000, default: 10 }),
      }),
    }),
    secEdgarIntelligence: Object.freeze({
      label: 'SEC EDGAR Intelligence',
      actorId: '8LFIbRbidiHPknMz5',
      schemaSource: 'actors/sec-edgar-filings-scraper/.actor/input_schema.json',
      inputSchema: objectSchema({
        mode: stringSchema({ default: 'form_d_funding', enum: ['form_d_funding', 'xbrl_financials', 'filings'] }),
        query: stringSchema({ default: '' }),
        ticker: stringSchema({ default: '' }),
        cik: stringSchema({ default: '' }),
        forms: stringSchema({ default: '10-K,10-Q,8-K' }),
        startDate: stringSchema({ default: '' }),
        endDate: stringSchema({ default: '' }),
        excludePooledFunds: { type: 'boolean', default: false },
        minOfferingAmountUsd: integerSchema({ minimum: 0 }),
        industryFilter: stringSchema({ default: '' }),
        includeAmendments: { type: 'boolean', default: true },
        maxItems: integerSchema({ minimum: 1, maximum: 5000, default: 10 }),
      }),
    }),
    globalPublicTenders: Object.freeze({
      label: 'Global Public Tenders & Grants',
      actorId: 'ZlabhlvEIyRVdtKiQ',
      schemaSource: 'actors/global-public-tenders-grants-aggregator/.actor/input_schema.json',
      inputSchema: objectSchema({
        sources: arraySchema({ default: ['uk_find_a_tender', 'eu_ted', 'us_grants_gov', 'usaspending', 'world_bank', 'canada_contracts', 'austender'] }),
        opportunityTypes: arraySchema({ default: ['tender', 'grant', 'award'] }),
        keyword: stringSchema({ default: '' }),
        dateFrom: stringSchema({ default: '' }),
        dateTo: stringSchema({ default: '' }),
        maxItems: integerSchema({ minimum: 1, maximum: 5000, default: 10 }),
        perSourceLimit: integerSchema({ minimum: 1, maximum: 1000, default: 2 }),
        sourceTimeoutSecs: integerSchema({ minimum: 1, maximum: 30, default: 20 }),
      }),
    }),
    pharmaPipelineIntelligence: Object.freeze({
      label: 'Pharma & Biotech Pipeline Intelligence',
      actorId: 're8aRvtqBonP5HMuY',
      schemaSource: 'actors/pharma-biotech-pipeline-intelligence/.actor/input_schema.json',
      inputSchema: objectSchema({
        mode: stringSchema({ default: 'drug_dossier', enum: ['drug_dossier', 'pipeline_feed'] }),
        query: stringSchema({ default: 'semaglutide', minLength: 1, maxLength: 200 }),
        drugNames: arraySchema({ default: [] }),
        maxItems: integerSchema({ minimum: 1, maximum: 1000, default: 10 }),
        sourceItemsPerQuery: integerSchema({ minimum: 1, maximum: 25, default: 5 }),
        sourceTimeoutSeconds: integerSchema({ minimum: 2, maximum: 60, default: 25 }),
        requestDelayMs: integerSchema({ minimum: 0, maximum: 5000, default: 150 }),
      }),
    }),
    usaspendingContracts: Object.freeze({
      label: 'USAspending Federal Contracts & Grants',
      actorId: 'eQQ2beomyLlW4DTGM',
      schemaSource: 'actors/usaspending-gov-contracts-scraper/.actor/input_schema.json',
      inputSchema: objectSchema({
        keyword: stringSchema({ default: '' }),
        awardCategory: stringSchema({ default: 'contracts', enum: ['contracts', 'grants', 'idvs'] }),
        startDate: stringSchema({ default: '2025-01-01' }),
        endDate: stringSchema({ default: '2026-12-31' }),
        awardingAgency: stringSchema({ default: '' }),
        minAwardAmount: numberSchema({ minimum: 0 }),
        naicsCode: stringSchema({ default: '' }),
        sortOrder: stringSchema({ default: 'desc', enum: ['desc', 'asc'] }),
        maxItems: integerSchema({ minimum: 1, maximum: 5000, default: 10 }),
      }),
    }),
    clinicalTrials: Object.freeze({
      label: 'ClinicalTrials.gov Studies & Trials',
      actorId: 'KchE3qKKrwU0rCe9f',
      schemaSource: 'actors/clinical-trials-scraper/.actor/input_schema.json',
      inputSchema: objectSchema({
        condition: stringSchema({ default: '' }),
        intervention: stringSchema({ default: '' }),
        status: stringSchema({ default: '', enum: ['', ...trialStatuses] }),
        sponsor: stringSchema({ default: '' }),
        queryTerm: stringSchema({ default: '' }),
        maxItems: integerSchema({ minimum: 1, maximum: 5000, default: 10 }),
      }),
    }),
    ukGovTenders: Object.freeze({
      label: 'UK Government Tenders',
      actorId: 'txnvyTckeQx4hVBc6',
      schemaSource: 'actors/uk-gov-tenders-scraper/.actor/input_schema.json',
      inputSchema: objectSchema({
        keyword: stringSchema({ default: '', maxLength: 120 }),
        stages: stringSchema({ default: 'tender', enum: ['tender', 'planning', 'award', 'planning,tender,award'] }),
        minValue: numberSchema({ minimum: 0 }),
        publishedFrom: stringSchema({ default: '', maxLength: 40 }),
        maxItems: integerSchema({ minimum: 1, maximum: 2000, default: 10 }),
      }),
    }),
    sgGreenMark: Object.freeze({
      label: 'Singapore BCA Green Mark Buildings',
      actorId: 'Z3ioK0wOAeczj6nCx',
      schemaSource: 'actors/sg-green-mark-buildings/.actor/input_schema.json',
      inputSchema: objectSchema({
        query: stringSchema({ default: '', maxLength: 120 }),
        rating: stringSchema({ default: '', enum: ['', ...ratings] }),
        expiresWithinDays: integerSchema({ minimum: 0, maximum: 3650 }),
        maxItems: integerSchema({ minimum: 1, maximum: 1000, default: 10 }),
      }),
    }),
  }),
  rapidapi: Object.freeze({
    secEdgarCorporateFilings: Object.freeze({
      label: 'SEC EDGAR Corporate Filings',
      apiSlug: 'sec-edgar-corporate-filings',
      host: 'sec-edgar-corporate-filings.p.rapidapi.com',
      path: '/v1/sec-edgar/filings',
      schemaSource: 'pipelines/rapidapi_hub/openapi/sec-edgar-api.json',
      inputSchema: objectSchema({
        mode: stringSchema({ default: 'search', enum: ['search', 'company'] }),
        query: stringSchema({ default: '', maxLength: 200 }),
        forms: stringSchema({ default: '10-K,10-Q,8-K', maxLength: 100 }),
        cik: stringSchema({ default: '', maxLength: 20 }),
        ticker: stringSchema({ default: '', maxLength: 16 }),
        startDate: stringSchema({ default: '', maxLength: 10 }),
        endDate: stringSchema({ default: '', maxLength: 10 }),
        limit: rapidLimit,
      }),
    }),
    clinicaltrialsStudies: Object.freeze({
      label: 'ClinicalTrials.gov Studies & Trials',
      apiSlug: 'clinicaltrials-gov-studies-trials',
      host: 'clinicaltrials-gov-studies-trials.p.rapidapi.com',
      path: '/v1/clinical-trials/studies',
      schemaSource: 'pipelines/rapidapi_hub/openapi/clinical-trials-api.json',
      inputSchema: objectSchema({
        condition: stringSchema({ default: '', maxLength: 200 }),
        intervention: stringSchema({ default: '', maxLength: 200 }),
        status: stringSchema({ enum: trialStatuses }),
        sponsor: stringSchema({ default: '', maxLength: 200 }),
        queryTerm: stringSchema({ default: '', maxLength: 200 }),
        limit: rapidLimit,
      }),
    }),
    openfdaRecalls: Object.freeze({
      label: 'openFDA Recalls, Enforcement & Approvals',
      apiSlug: 'openfda-recalls-enforcement-approvals',
      host: 'openfda-recalls-enforcement-approvals.p.rapidapi.com',
      path: '/v1/openfda/records',
      schemaSource: 'pipelines/rapidapi_hub/openapi/openfda-recalls-api.json',
      inputSchema: objectSchema({
        dataset: stringSchema({ default: 'drug_enforcement', enum: ['drug_enforcement', 'device_recall', 'food_enforcement', 'drug_approvals'] }),
        searchQuery: stringSchema({ default: '', maxLength: 200 }),
        classification: stringSchema({ enum: ['Class I', 'Class II', 'Class III'] }),
        status: stringSchema({ enum: ['Ongoing', 'Completed', 'Terminated'] }),
        limit: rapidLimit,
      }),
    }),
    sgGreenMarkBuildings: Object.freeze({
      label: 'Singapore BCA Green Mark Buildings',
      apiSlug: 'singapore-bca-green-mark-buildings',
      host: 'singapore-bca-green-mark-buildings.p.rapidapi.com',
      path: '/v1/sg-green-mark/certificates',
      schemaSource: 'pipelines/rapidapi_hub/openapi/sg-green-mark-api.json',
      inputSchema: objectSchema({
        limit: rapidLimit,
        rating: stringSchema({ enum: ratings }),
      }),
    }),
  }),
});

const LEGACY_SOURCE_ALIASES = Object.freeze({
  apify: Object.freeze({ secEdgar: 'secEdgarIntelligence', singaporeGreenMark: 'sgGreenMark' }),
  rapidapi: Object.freeze({
    secEdgar: 'secEdgarCorporateFilings',
    clinicalTrials: 'clinicaltrialsStudies',
    openFda: 'openfdaRecalls',
    singaporeGreenMark: 'sgGreenMarkBuildings',
  }),
});

function canonicalSource(provider, source) {
  return LEGACY_SOURCE_ALIASES[provider]?.[source] || source;
}

function getSourceDefinition(provider, source) {
  return SOURCES[provider]?.[canonicalSource(provider, source)];
}

function sourceOptions(provider) {
  return Object.entries(SOURCES[provider] || {}).map(([value, source]) => ({
    name: source.label,
    value,
    description: provider === 'apify'
      ? `Public Apify Actor ${source.actorId}`
      : `RapidAPI ${source.apiSlug}`,
  }));
}

module.exports = {
  LEGACY_SOURCE_ALIASES,
  SOURCES,
  canonicalSource,
  getSourceDefinition,
  sourceOptions,
};

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export const ACTOR_SCHEMA_SOURCES = Object.freeze({
  atsJobsHiringSignals: 'actors/ats-jobs-hiring-signals-scraper/.actor/input_schema.json',
  secEdgarIntelligence: 'actors/sec-edgar-filings-scraper/.actor/input_schema.json',
  globalPublicTenders: 'actors/global-public-tenders-grants-aggregator/.actor/input_schema.json',
  pharmaPipelineIntelligence: 'actors/pharma-biotech-pipeline-intelligence/.actor/input_schema.json',
  usaspendingContracts: 'actors/usaspending-gov-contracts-scraper/.actor/input_schema.json',
  clinicalTrials: 'actors/clinical-trials-scraper/.actor/input_schema.json',
  ukGovTenders: 'actors/uk-gov-tenders-scraper/.actor/input_schema.json',
  sgGreenMark: 'actors/sg-green-mark-buildings/.actor/input_schema.json',
});

// These runtime contracts mirror the validation keywords in the repository's
// authoritative Actor input schemas. UI-only titles and descriptions are omitted.
export const APIFY_INPUT_SCHEMAS = deepFreeze({
  atsJobsHiringSignals: {
    type: 'object',
    required: [],
    properties: {
      preset: {
        type: 'string',
        default: 'ai_leaders',
        enum: ['ai_leaders', 'fintech_saas', 'all_curated', 'custom_only'],
      },
      companyBoards: { type: 'array', default: [] },
      keywords: { type: 'string', default: '' },
      remoteOnly: { type: 'boolean', default: false },
      departmentFilter: { type: 'string', default: '' },
      includeDescription: { type: 'boolean', default: false },
      maxItems: { type: 'integer', default: 10, minimum: 1, maximum: 10_000 },
    },
  },
  secEdgarIntelligence: {
    type: 'object',
    required: [],
    properties: {
      mode: {
        type: 'string',
        default: 'form_d_funding',
        enum: ['form_d_funding', 'xbrl_financials', 'filings'],
      },
      query: { type: 'string', default: '' },
      ticker: { type: 'string', default: '' },
      cik: { type: 'string', default: '' },
      forms: { type: 'string', default: '10-K,10-Q,8-K' },
      startDate: { type: 'string', default: '' },
      endDate: { type: 'string', default: '' },
      excludePooledFunds: { type: 'boolean', default: false },
      minOfferingAmountUsd: { type: 'integer', minimum: 0 },
      industryFilter: { type: 'string', default: '' },
      includeAmendments: { type: 'boolean', default: true },
      maxItems: { type: 'integer', default: 10, minimum: 1, maximum: 5_000 },
    },
  },
  globalPublicTenders: {
    type: 'object',
    required: [],
    properties: {
      sources: {
        type: 'array',
        default: [
          'uk_find_a_tender',
          'eu_ted',
          'us_grants_gov',
          'usaspending',
          'world_bank',
          'canada_contracts',
          'austender',
        ],
      },
      opportunityTypes: { type: 'array', default: ['tender', 'grant', 'award'] },
      keyword: { type: 'string', default: '' },
      dateFrom: { type: 'string', default: '' },
      dateTo: { type: 'string', default: '' },
      maxItems: { type: 'integer', default: 10, minimum: 1, maximum: 5_000 },
      perSourceLimit: { type: 'integer', default: 2, minimum: 1, maximum: 1_000 },
      sourceTimeoutSecs: { type: 'integer', default: 20, minimum: 1, maximum: 30 },
    },
  },
  pharmaPipelineIntelligence: {
    type: 'object',
    properties: {
      mode: {
        type: 'string',
        default: 'drug_dossier',
        enum: ['drug_dossier', 'pipeline_feed'],
      },
      query: { type: 'string', default: 'semaglutide', minLength: 1, maxLength: 200 },
      drugNames: { type: 'array', default: [] },
      maxItems: { type: 'integer', default: 10, minimum: 1, maximum: 1_000 },
      sourceItemsPerQuery: { type: 'integer', default: 5, minimum: 1, maximum: 25 },
      sourceTimeoutSeconds: { type: 'integer', default: 25, minimum: 2, maximum: 60 },
      requestDelayMs: { type: 'integer', default: 150, minimum: 0, maximum: 5_000 },
    },
  },
  usaspendingContracts: {
    type: 'object',
    required: [],
    properties: {
      keyword: { type: 'string', default: '' },
      awardCategory: {
        type: 'string',
        default: 'contracts',
        enum: ['contracts', 'grants', 'idvs'],
      },
      startDate: { type: 'string', default: '2025-01-01' },
      endDate: { type: 'string', default: '2026-12-31' },
      awardingAgency: { type: 'string', default: '' },
      minAwardAmount: { type: 'number', minimum: 0 },
      naicsCode: { type: 'string', default: '' },
      sortOrder: { type: 'string', default: 'desc', enum: ['desc', 'asc'] },
      maxItems: { type: 'integer', default: 10, minimum: 1, maximum: 5_000 },
    },
  },
  clinicalTrials: {
    type: 'object',
    required: [],
    properties: {
      condition: { type: 'string', default: '' },
      intervention: { type: 'string', default: '' },
      status: {
        type: 'string',
        default: '',
        enum: [
          '',
          'RECRUITING',
          'NOT_YET_RECRUITING',
          'ACTIVE_NOT_RECRUITING',
          'COMPLETED',
          'ENROLLING_BY_INVITATION',
          'SUSPENDED',
          'TERMINATED',
          'WITHDRAWN',
          'UNKNOWN',
        ],
      },
      sponsor: { type: 'string', default: '' },
      queryTerm: { type: 'string', default: '' },
      maxItems: { type: 'integer', default: 10, minimum: 1, maximum: 5_000 },
    },
  },
  ukGovTenders: {
    type: 'object',
    properties: {
      keyword: { type: 'string', default: '', maxLength: 120 },
      stages: {
        type: 'string',
        default: 'tender',
        enum: ['tender', 'planning', 'award', 'planning,tender,award'],
      },
      minValue: { type: 'number', minimum: 0 },
      publishedFrom: { type: 'string', default: '', maxLength: 40 },
      maxItems: { type: 'integer', default: 10, minimum: 1, maximum: 2_000 },
    },
  },
  sgGreenMark: {
    type: 'object',
    properties: {
      query: { type: 'string', default: '', maxLength: 120 },
      rating: {
        type: 'string',
        default: '',
        enum: ['', 'Platinum', 'Goldplus', 'Gold', 'Certified'],
      },
      expiresWithinDays: { type: 'integer', minimum: 0, maximum: 3_650 },
      maxItems: { type: 'integer', default: 10, minimum: 1, maximum: 1_000 },
    },
  },
});

export const RAPIDAPI_QUERY_SCHEMAS = deepFreeze({
  secEdgarCorporateFilings: {
    type: 'object',
    properties: {
      mode: { type: 'string', enum: ['search', 'company'], default: 'search' },
      query: { type: 'string', maxLength: 200, default: '' },
      forms: { type: 'string', maxLength: 100, default: '10-K,10-Q,8-K' },
      cik: { type: 'string', maxLength: 20, default: '' },
      ticker: { type: 'string', maxLength: 16, default: '' },
      startDate: { type: 'string', maxLength: 10, default: '' },
      endDate: { type: 'string', maxLength: 10, default: '' },
      limit: { type: 'integer', minimum: 1, maximum: 20, default: 5 },
    },
  },
  clinicaltrialsStudies: {
    type: 'object',
    properties: {
      condition: { type: 'string', maxLength: 200, default: '' },
      intervention: { type: 'string', maxLength: 200, default: '' },
      status: {
        type: 'string',
        enum: [
          'RECRUITING',
          'NOT_YET_RECRUITING',
          'ACTIVE_NOT_RECRUITING',
          'COMPLETED',
          'ENROLLING_BY_INVITATION',
          'SUSPENDED',
          'TERMINATED',
          'WITHDRAWN',
          'UNKNOWN',
        ],
      },
      sponsor: { type: 'string', maxLength: 200, default: '' },
      queryTerm: { type: 'string', maxLength: 200, default: '' },
      limit: { type: 'integer', minimum: 1, maximum: 20, default: 5 },
    },
  },
  openfdaRecalls: {
    type: 'object',
    properties: {
      dataset: {
        type: 'string',
        enum: ['drug_enforcement', 'device_recall', 'food_enforcement', 'drug_approvals'],
        default: 'drug_enforcement',
      },
      searchQuery: { type: 'string', maxLength: 200, default: '' },
      classification: { type: 'string', enum: ['Class I', 'Class II', 'Class III'] },
      status: { type: 'string', enum: ['Ongoing', 'Completed', 'Terminated'] },
      limit: { type: 'integer', minimum: 1, maximum: 20, default: 5 },
    },
  },
  sgGreenMarkBuildings: {
    type: 'object',
    properties: {
      limit: { type: 'integer', minimum: 1, maximum: 20, default: 5 },
      rating: { type: 'string', enum: ['Platinum', 'Goldplus', 'Gold', 'Certified'] },
    },
  },
});

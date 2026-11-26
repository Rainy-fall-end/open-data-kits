function frozenSource(value) {
  return Object.freeze(value);
}

const apifySources = {
  atsJobsHiringSignals: frozenSource({
    key: 'atsJobsHiringSignals',
    label: 'ATS Jobs & Hiring Signals',
    actorId: 'CRulq5dak4mqAUmMn',
  }),
  secEdgar: frozenSource({
    key: 'secEdgar',
    label: 'SEC EDGAR Corporate Filings',
    actorId: '8LFIbRbidiHPknMz5',
  }),
  globalPublicTenders: frozenSource({
    key: 'globalPublicTenders',
    label: 'Global Public Tenders & Grants',
    actorId: 'ZlabhlvEIyRVdtKiQ',
  }),
  pharmaPipelineIntelligence: frozenSource({
    key: 'pharmaPipelineIntelligence',
    label: 'Pharma & Biotech Pipeline Intelligence',
    actorId: 're8aRvtqBonP5HMuY',
  }),
  usaspendingContracts: frozenSource({
    key: 'usaspendingContracts',
    label: 'USAspending Federal Contracts & Grants',
    actorId: 'eQQ2beomyLlW4DTGM',
  }),
  clinicalTrials: frozenSource({
    key: 'clinicalTrials',
    label: 'ClinicalTrials.gov Studies & Trials',
    actorId: 'KchE3qKKrwU0rCe9f',
  }),
  ukGovTenders: frozenSource({
    key: 'ukGovTenders',
    label: 'UK Government Tenders',
    actorId: 'txnvyTckeQx4hVBc6',
  }),
  singaporeGreenMark: frozenSource({
    key: 'singaporeGreenMark',
    label: 'Singapore BCA Green Mark Buildings',
    actorId: 'Z3ioK0wOAeczj6nCx',
  }),
};

Object.defineProperties(apifySources, {
  secEdgarIntelligence: {
    value: frozenSource({
      ...apifySources.secEdgar,
      key: 'secEdgarIntelligence',
      label: 'SEC EDGAR Intelligence',
    }),
    enumerable: false,
  },
  sgGreenMark: {
    value: frozenSource({ ...apifySources.singaporeGreenMark, key: 'sgGreenMark' }),
    enumerable: false,
  },
});

export const APIFY_SOURCES = Object.freeze(apifySources);

const rapidApiSources = {
  secEdgar: frozenSource({
    key: 'secEdgar',
    label: 'SEC EDGAR Corporate Filings',
    apiSlug: 'sec-edgar-corporate-filings',
    host: 'sec-edgar-corporate-filings.p.rapidapi.com',
    path: '/v1/sec-edgar/filings',
  }),
  clinicalTrials: frozenSource({
    key: 'clinicalTrials',
    label: 'ClinicalTrials.gov Studies & Trials',
    apiSlug: 'clinicaltrials-gov-studies-trials',
    host: 'clinicaltrials-gov-studies-trials.p.rapidapi.com',
    path: '/v1/clinical-trials/studies',
  }),
  openFda: frozenSource({
    key: 'openFda',
    label: 'openFDA Recalls, Enforcement & Approvals',
    apiSlug: 'openfda-recalls-enforcement-approvals',
    host: 'openfda-recalls-enforcement-approvals.p.rapidapi.com',
    path: '/v1/openfda/records',
  }),
  singaporeGreenMark: frozenSource({
    key: 'singaporeGreenMark',
    label: 'Singapore BCA Green Mark Buildings',
    apiSlug: 'singapore-bca-green-mark-buildings',
    host: 'singapore-bca-green-mark-buildings.p.rapidapi.com',
    path: '/v1/sg-green-mark/certificates',
  }),
};

Object.defineProperties(rapidApiSources, {
  secEdgarCorporateFilings: { value: rapidApiSources.secEdgar, enumerable: false },
  clinicaltrialsStudies: { value: rapidApiSources.clinicalTrials, enumerable: false },
  openfdaRecalls: { value: rapidApiSources.openFda, enumerable: false },
  sgGreenMarkBuildings: { value: rapidApiSources.singaporeGreenMark, enumerable: false },
});

export const RAPIDAPI_SOURCES = Object.freeze(rapidApiSources);

export function getCatalog() {
  return {
    apify: Object.values(APIFY_SOURCES).map((source) => ({ ...source })),
    rapidapi: Object.values(RAPIDAPI_SOURCES).map((source) => ({ ...source })),
  };
}

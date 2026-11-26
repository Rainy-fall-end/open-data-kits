function frozenSource(value) {
  return Object.freeze(value);
}

export const APIFY_SOURCES = Object.freeze({
  secEdgar: frozenSource({
    key: 'secEdgar',
    label: 'SEC EDGAR Corporate Filings',
    actorId: '8LFIbRbidiHPknMz5',
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
});

export const RAPIDAPI_SOURCES = Object.freeze({
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
});

export function getCatalog() {
  return {
    apify: Object.values(APIFY_SOURCES).map((source) => ({ ...source })),
    rapidapi: Object.values(RAPIDAPI_SOURCES).map((source) => ({ ...source })),
  };
}

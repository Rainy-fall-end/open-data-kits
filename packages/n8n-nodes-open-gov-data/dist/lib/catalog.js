'use strict';

const SOURCES = Object.freeze({
  apify: Object.freeze({
    secEdgar: Object.freeze({
      label: 'SEC EDGAR Corporate Filings',
      actorId: '8LFIbRbidiHPknMz5',
    }),
    clinicalTrials: Object.freeze({
      label: 'ClinicalTrials.gov Studies & Trials',
      actorId: 'KchE3qKKrwU0rCe9f',
    }),
    ukGovTenders: Object.freeze({
      label: 'UK Government Tenders',
      actorId: 'txnvyTckeQx4hVBc6',
    }),
    singaporeGreenMark: Object.freeze({
      label: 'Singapore BCA Green Mark Buildings',
      actorId: 'Z3ioK0wOAeczj6nCx',
    }),
  }),
  rapidapi: Object.freeze({
    secEdgar: Object.freeze({
      label: 'SEC EDGAR Corporate Filings',
      apiSlug: 'sec-edgar-corporate-filings',
      host: 'sec-edgar-corporate-filings.p.rapidapi.com',
      path: '/v1/sec-edgar/filings',
    }),
    clinicalTrials: Object.freeze({
      label: 'ClinicalTrials.gov Studies & Trials',
      apiSlug: 'clinicaltrials-gov-studies-trials',
      host: 'clinicaltrials-gov-studies-trials.p.rapidapi.com',
      path: '/v1/clinical-trials/studies',
    }),
    openFda: Object.freeze({
      label: 'openFDA Recalls, Enforcement & Approvals',
      apiSlug: 'openfda-recalls-enforcement-approvals',
      host: 'openfda-recalls-enforcement-approvals.p.rapidapi.com',
      path: '/v1/openfda/records',
    }),
    singaporeGreenMark: Object.freeze({
      label: 'Singapore BCA Green Mark Buildings',
      apiSlug: 'singapore-bca-green-mark-buildings',
      host: 'singapore-bca-green-mark-buildings.p.rapidapi.com',
      path: '/v1/sg-green-mark/certificates',
    }),
  }),
});

function sourceOptions(provider) {
  const catalog = SOURCES[provider];
  if (!catalog) return [];
  return Object.entries(catalog).map(([value, source]) => ({
    name: source.label,
    value,
    description: provider === 'apify'
      ? `Public Apify Actor ${source.actorId}`
      : `RapidAPI ${source.apiSlug}`,
  }));
}

module.exports = { SOURCES, sourceOptions };

export const COLLECTION_NAME = 'Open Government Paid APIs';
export const COLLECTION_DESCRIPTION =
  'Eight read-only paid API examples for public US, UK, and Singapore government data. Requests are not sent by the offline verifier. Configure credentials locally and review provider pricing before manually sending a request.';
export const MAX_TOTAL_CHARGE_USD = '0.25';

export const rapidApiRequests = Object.freeze([
  Object.freeze({
    id: 'rapidapi-sec-edgar',
    name: 'SEC EDGAR Corporate Filings',
    slug: 'sec-edgar-corporate-filings',
    host: 'sec-edgar-corporate-filings.p.rapidapi.com',
    path: '/v1/sec-edgar/filings',
    openApiFile: 'sec-edgar-api.json',
    query: Object.freeze([
      Object.freeze(['mode', 'search']),
      Object.freeze(['query', 'artificial intelligence']),
      Object.freeze(['forms', '10-K,10-Q,8-K']),
      Object.freeze(['startDate', '2025-01-01']),
      Object.freeze(['limit', '5']),
    ]),
  }),
  Object.freeze({
    id: 'rapidapi-clinical-trials',
    name: 'ClinicalTrials.gov Studies and Trials',
    slug: 'clinicaltrials-gov-studies-trials',
    host: 'clinicaltrials-gov-studies-trials.p.rapidapi.com',
    path: '/v1/clinical-trials/studies',
    openApiFile: 'clinical-trials-api.json',
    query: Object.freeze([
      Object.freeze(['condition', 'diabetes']),
      Object.freeze(['intervention', 'metformin']),
      Object.freeze(['status', 'RECRUITING']),
      Object.freeze(['limit', '5']),
    ]),
  }),
  Object.freeze({
    id: 'rapidapi-openfda',
    name: 'openFDA Recalls, Enforcement and Approvals',
    slug: 'openfda-recalls-enforcement-approvals',
    host: 'openfda-recalls-enforcement-approvals.p.rapidapi.com',
    path: '/v1/openfda/records',
    openApiFile: 'openfda-recalls-api.json',
    query: Object.freeze([
      Object.freeze(['dataset', 'drug_enforcement']),
      Object.freeze(['classification', 'Class I']),
      Object.freeze(['limit', '5']),
    ]),
  }),
  Object.freeze({
    id: 'rapidapi-singapore-green-mark',
    name: 'Singapore BCA Green Mark Buildings',
    slug: 'singapore-bca-green-mark-buildings',
    host: 'singapore-bca-green-mark-buildings.p.rapidapi.com',
    path: '/v1/sg-green-mark/certificates',
    openApiFile: 'sg-green-mark-api.json',
    query: Object.freeze([
      Object.freeze(['limit', '5']),
      Object.freeze(['rating', 'Platinum']),
    ]),
  }),
]);

export const apifyRequests = Object.freeze([
  Object.freeze({
    id: 'apify-sec-edgar',
    name: 'SEC EDGAR Filings Actor',
    actorId: '8LFIbRbidiHPknMz5',
    actorDirectory: 'sec-edgar-filings-scraper',
    body: Object.freeze({
      mode: 'search',
      query: 'artificial intelligence',
      forms: '10-K,10-Q,8-K',
      startDate: '2025-01-01',
      maxItems: 5,
    }),
  }),
  Object.freeze({
    id: 'apify-clinical-trials',
    name: 'ClinicalTrials.gov Studies Actor',
    actorId: 'KchE3qKKrwU0rCe9f',
    actorDirectory: 'clinical-trials-scraper',
    body: Object.freeze({
      condition: 'diabetes',
      intervention: 'metformin',
      status: 'RECRUITING',
      sponsor: '',
      queryTerm: '',
      maxItems: 5,
    }),
  }),
  Object.freeze({
    id: 'apify-uk-gov-tenders',
    name: 'UK Government Tenders Actor',
    actorId: 'txnvyTckeQx4hVBc6',
    actorDirectory: 'uk-gov-tenders-scraper',
    body: Object.freeze({
      keyword: 'technology',
      stages: 'tender',
      minValue: 10000,
      publishedFrom: '2026-01-01',
      maxItems: 5,
    }),
  }),
  Object.freeze({
    id: 'apify-singapore-green-mark',
    name: 'Singapore BCA Green Mark Buildings Actor',
    actorId: 'Z3ioK0wOAeczj6nCx',
    actorDirectory: 'sg-green-mark-buildings',
    body: Object.freeze({
      query: '',
      rating: 'Platinum',
      expiresWithinDays: 3650,
      maxItems: 5,
    }),
  }),
]);

export function buildUrl(request) {
  if ('slug' in request) {
    const url = new URL(`https://${request.host}${request.path}`);
    for (const [key, value] of request.query) url.searchParams.append(key, value);
    return url.toString();
  }
  return `https://api.apify.com/v2/acts/${request.actorId}/run-sync-get-dataset-items?maxTotalChargeUsd=${MAX_TOTAL_CHARGE_USD}`;
}

export function expectedHeaders(request) {
  if ('slug' in request) {
    return Object.freeze({
      Accept: 'application/json',
      'X-RapidAPI-Key': '{{RAPIDAPI_KEY}}',
      'X-RapidAPI-Host': request.host,
    });
  }
  return Object.freeze({
    Accept: 'application/json',
    Authorization: 'Bearer {{APIFY_TOKEN}}',
    'Content-Type': 'application/json',
  });
}

export const allRequests = Object.freeze([...rapidApiRequests, ...apifyRequests]);

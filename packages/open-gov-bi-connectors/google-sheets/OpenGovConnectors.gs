/**
 * Open Government BI Connectors for Google Sheets.
 *
 * Set RAPIDAPI_KEY and APIFY_TOKEN in Project Settings > Script properties.
 * The eight public connector functions return two-dimensional arrays and can be
 * used as spreadsheet formulas. Nested records are flattened into dotted
 * columns. Untrusted text is neutralized before it reaches a cell.
 */

var OGC_APIFY_MAX_CHARGE_USD_ = 0.25;

var OGC_RAPIDAPI_ = {
  sec: {
    host: 'sec-edgar-corporate-filings.p.rapidapi.com',
    path: '/v1/sec-edgar/filings'
  },
  trials: {
    host: 'clinicaltrials-gov-studies-trials.p.rapidapi.com',
    path: '/v1/clinical-trials/studies'
  },
  fda: {
    host: 'openfda-recalls-enforcement-approvals.p.rapidapi.com',
    path: '/v1/openfda/records'
  },
  greenMark: {
    host: 'singapore-bca-green-mark-buildings.p.rapidapi.com',
    path: '/v1/sg-green-mark/certificates'
  }
};

var OGC_ACTORS_ = {
  sec: '8LFIbRbidiHPknMz5',
  trials: 'KchE3qKKrwU0rCe9f',
  tenders: 'txnvyTckeQx4hVBc6',
  greenMark: 'Z3ioK0wOAeczj6nCx'
};

/** Add the Open Gov Connectors menu whenever the spreadsheet opens. */
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  var rapid = ui.createMenu('RapidAPI (4)')
    .addItem('SEC EDGAR filings', 'menuRapidSec_')
    .addItem('ClinicalTrials.gov studies', 'menuRapidTrials_')
    .addItem('openFDA records', 'menuRapidFda_')
    .addItem('Singapore Green Mark', 'menuRapidGreenMark_');
  var apify = ui.createMenu('Apify Actors (4)')
    .addItem('SEC EDGAR filings', 'menuApifySec_')
    .addItem('ClinicalTrials.gov studies', 'menuApifyTrials_')
    .addItem('UK government tenders', 'menuApifyTenders_')
    .addItem('Singapore Green Mark', 'menuApifyGreenMark_');
  ui.createMenu('Open Gov Connectors')
    .addSubMenu(rapid)
    .addSubMenu(apify)
    .addToUi();
}

/**
 * RapidAPI: SEC EDGAR corporate filings.
 * @customfunction
 */
function RAPIDAPI_SEC_EDGAR(mode, query, forms, cik, ticker, startDate, endDate, limit) {
  return rapidApi_(OGC_RAPIDAPI_.sec, {
    mode: textOrDefault_(mode, 'search'),
    query: textOrDefault_(query, ''),
    forms: textOrDefault_(forms, '10-K,10-Q,8-K'),
    cik: textOrDefault_(cik, ''),
    ticker: textOrDefault_(ticker, ''),
    startDate: textOrDefault_(startDate, ''),
    endDate: textOrDefault_(endDate, ''),
    limit: boundedInteger_(limit, 5, 1, 20, 'limit')
  });
}

/**
 * RapidAPI: ClinicalTrials.gov studies.
 * @customfunction
 */
function RAPIDAPI_CLINICAL_TRIALS(condition, intervention, status, sponsor, queryTerm, limit) {
  return rapidApi_(OGC_RAPIDAPI_.trials, {
    condition: textOrDefault_(condition, ''),
    intervention: textOrDefault_(intervention, ''),
    status: textOrDefault_(status, ''),
    sponsor: textOrDefault_(sponsor, ''),
    queryTerm: textOrDefault_(queryTerm, ''),
    limit: boundedInteger_(limit, 5, 1, 20, 'limit')
  });
}

/**
 * RapidAPI: openFDA recalls, enforcement records, and approvals.
 * @customfunction
 */
function RAPIDAPI_OPENFDA(dataset, searchQuery, classification, status, limit) {
  return rapidApi_(OGC_RAPIDAPI_.fda, {
    dataset: textOrDefault_(dataset, 'drug_enforcement'),
    searchQuery: textOrDefault_(searchQuery, ''),
    classification: textOrDefault_(classification, ''),
    status: textOrDefault_(status, ''),
    limit: boundedInteger_(limit, 5, 1, 20, 'limit')
  });
}

/**
 * RapidAPI: Singapore BCA Green Mark certificates.
 * @customfunction
 */
function RAPIDAPI_SG_GREEN_MARK(rating, limit) {
  return rapidApi_(OGC_RAPIDAPI_.greenMark, {
    rating: textOrDefault_(rating, ''),
    limit: boundedInteger_(limit, 5, 1, 20, 'limit')
  });
}

/**
 * Apify: SEC EDGAR corporate filings. Every run has a USD 0.25 hard cap.
 * @customfunction
 */
function APIFY_SEC_EDGAR(mode, query, forms, cik, ticker, startDate, endDate, maxItems) {
  return apifyActor_(OGC_ACTORS_.sec, {
    mode: textOrDefault_(mode, 'search'),
    query: textOrDefault_(query, ''),
    forms: textOrDefault_(forms, '10-K,10-Q,8-K'),
    cik: textOrDefault_(cik, ''),
    ticker: textOrDefault_(ticker, ''),
    startDate: textOrDefault_(startDate, ''),
    endDate: textOrDefault_(endDate, ''),
    maxItems: boundedInteger_(maxItems, 10, 1, 5000, 'maxItems')
  });
}

/**
 * Apify: ClinicalTrials.gov studies. Every run has a USD 0.25 hard cap.
 * @customfunction
 */
function APIFY_CLINICAL_TRIALS(condition, intervention, status, sponsor, queryTerm, maxItems) {
  return apifyActor_(OGC_ACTORS_.trials, {
    condition: textOrDefault_(condition, ''),
    intervention: textOrDefault_(intervention, ''),
    status: textOrDefault_(status, ''),
    sponsor: textOrDefault_(sponsor, ''),
    queryTerm: textOrDefault_(queryTerm, ''),
    maxItems: boundedInteger_(maxItems, 10, 1, 5000, 'maxItems')
  });
}

/**
 * Apify: UK government tenders. Every run has a USD 0.25 hard cap.
 * @customfunction
 */
function APIFY_UK_TENDERS(keyword, stages, minValue, publishedFrom, maxItems) {
  var input = {
    keyword: textOrDefault_(keyword, ''),
    stages: textOrDefault_(stages, 'tender'),
    publishedFrom: textOrDefault_(publishedFrom, ''),
    maxItems: boundedInteger_(maxItems, 10, 1, 2000, 'maxItems')
  };
  if (!isBlank_(minValue)) {
    input.minValue = nonNegativeNumber_(minValue, 'minValue');
  }
  return apifyActor_(OGC_ACTORS_.tenders, input);
}

/**
 * Apify: Singapore BCA Green Mark certificates. Every run has a USD 0.25 hard cap.
 * @customfunction
 */
function APIFY_SG_GREEN_MARK(query, rating, expiresWithinDays, maxItems) {
  var input = {
    query: textOrDefault_(query, ''),
    rating: textOrDefault_(rating, ''),
    maxItems: boundedInteger_(maxItems, 10, 1, 1000, 'maxItems')
  };
  if (!isBlank_(expiresWithinDays)) {
    input.expiresWithinDays = boundedInteger_(expiresWithinDays, 0, 0, 3650, 'expiresWithinDays');
  }
  return apifyActor_(OGC_ACTORS_.greenMark, input);
}

function rapidApi_(endpoint, query) {
  var key = requiredScriptProperty_('RAPIDAPI_KEY');
  var url = 'https://' + endpoint.host + endpoint.path + buildQuery_(query);
  var response = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: {
      'X-RapidAPI-Key': key,
      'X-RapidAPI-Host': endpoint.host
    },
    muteHttpExceptions: true
  });
  var payload = decodeResponse_(response, 'RapidAPI');
  if (!payload || !Array.isArray(payload.items)) {
    throw new Error('RapidAPI response must contain an items array.');
  }
  return recordsToTable_(payload.items);
}

function apifyActor_(actorId, input) {
  var token = requiredScriptProperty_('APIFY_TOKEN');
  var url = 'https://api.apify.com/v2/acts/' + encodeURIComponent(actorId) +
    '/run-sync-get-dataset-items?maxTotalChargeUsd=' + OGC_APIFY_MAX_CHARGE_USD_;
  var response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(input),
    headers: { Authorization: 'Bearer ' + token },
    muteHttpExceptions: true
  });
  var payload = decodeResponse_(response, 'Apify');
  if (!Array.isArray(payload)) {
    throw new Error('Apify response must be a dataset item array.');
  }
  return recordsToTable_(payload);
}

function requiredScriptProperty_(name) {
  var value = PropertiesService.getScriptProperties().getProperty(name);
  if (!value || !String(value).trim()) {
    throw new Error('Missing Script Property: ' + name);
  }
  return String(value).trim();
}

function decodeResponse_(response, provider) {
  var status = response.getResponseCode();
  var text = response.getContentText();
  if (status < 200 || status >= 300) {
    throw new Error(provider + ' HTTP ' + status + ': ' + sanitizeErrorText_(text));
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(provider + ' returned invalid JSON.');
  }
}

function sanitizeErrorText_(text) {
  return String(text || '').replace(/[\r\n\t]+/g, ' ').slice(0, 300);
}

function buildQuery_(values) {
  var parts = [];
  Object.keys(values).forEach(function (key) {
    var value = values[key];
    if (!isBlank_(value)) {
      parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)));
    }
  });
  return parts.length ? '?' + parts.join('&') : '';
}

function recordsToTable_(records) {
  if (!records.length) {
    return [['No results']];
  }
  var flattened = records.map(function (record) {
    var output = Object.create(null);
    flattenValue_(record, '', output, 0);
    return output;
  });
  var seen = Object.create(null);
  var headers = [];
  flattened.forEach(function (record) {
    Object.keys(record).forEach(function (key) {
      if (!seen[key]) {
        seen[key] = true;
        headers.push(key);
      }
    });
  });
  if (!headers.length) {
    headers.push('value');
  }
  var table = [headers.map(sanitizeCell_)];
  flattened.forEach(function (record) {
    table.push(headers.map(function (header) {
      return Object.prototype.hasOwnProperty.call(record, header) ? sanitizeCell_(record[header]) : '';
    }));
  });
  return table;
}

function flattenValue_(value, prefix, output, depth) {
  if (depth > 12) {
    output[prefix || 'value'] = safeJson_(value);
    return;
  }
  if (value === null || typeof value !== 'object' || value instanceof Date) {
    output[prefix || 'value'] = value === null ? '' : value;
    return;
  }
  if (Array.isArray(value)) {
    output[prefix || 'value'] = safeJson_(value);
    return;
  }
  var keys = Object.keys(value).sort();
  if (!keys.length) {
    output[prefix || 'value'] = '{}';
    return;
  }
  keys.forEach(function (key) {
    var escaped = escapeColumnPart_(key);
    flattenValue_(value[key], prefix ? prefix + '.' + escaped : escaped, output, depth + 1);
  });
}

function escapeColumnPart_(key) {
  return String(key).replace(/\\/g, '\\\\').replace(/\./g, '\\.');
}

function safeJson_(value) {
  try {
    return JSON.stringify(value);
  } catch (error) {
    return '[Unserializable value]';
  }
}

function sanitizeCell_(value) {
  if (value === null || typeof value === 'undefined') {
    return '';
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  var text = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(text)) {
    return "'" + text;
  }
  return text;
}

function textOrDefault_(value, fallback) {
  return isBlank_(value) ? fallback : String(value);
}

function boundedInteger_(value, fallback, minimum, maximum, name) {
  if (isBlank_(value)) {
    return fallback;
  }
  var number = Number(value);
  if (!isFinite(number) || Math.floor(number) !== number || number < minimum || number > maximum) {
    throw new Error(name + ' must be an integer from ' + minimum + ' to ' + maximum + '.');
  }
  return number;
}

function nonNegativeNumber_(value, name) {
  var number = Number(value);
  if (!isFinite(number) || number < 0) {
    throw new Error(name + ' must be a non-negative number.');
  }
  return number;
}

function isBlank_(value) {
  return value === null || typeof value === 'undefined' || String(value).trim() === '';
}

function writeMenuResult_(title, table) {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getActiveSheet();
  var active = sheet.getActiveCell();
  sheet.getRange(active.getRow(), active.getColumn(), table.length, table[0].length).setValues(table);
  spreadsheet.toast(table.length - 1 + ' row(s) loaded', title, 5);
}

function menuRapidSec_() {
  writeMenuResult_('SEC EDGAR via RapidAPI', RAPIDAPI_SEC_EDGAR('search', '', '10-K,10-Q,8-K', '', '', '', '', 5));
}
function menuRapidTrials_() {
  writeMenuResult_('ClinicalTrials.gov via RapidAPI', RAPIDAPI_CLINICAL_TRIALS('', '', '', '', '', 5));
}
function menuRapidFda_() {
  writeMenuResult_('openFDA via RapidAPI', RAPIDAPI_OPENFDA('drug_enforcement', '', '', '', 5));
}
function menuRapidGreenMark_() {
  writeMenuResult_('Green Mark via RapidAPI', RAPIDAPI_SG_GREEN_MARK('', 5));
}
function menuApifySec_() {
  writeMenuResult_('SEC EDGAR via Apify', APIFY_SEC_EDGAR('search', '', '10-K,10-Q,8-K', '', '', '', '', 10));
}
function menuApifyTrials_() {
  writeMenuResult_('ClinicalTrials.gov via Apify', APIFY_CLINICAL_TRIALS('', '', '', '', '', 10));
}
function menuApifyTenders_() {
  writeMenuResult_('UK tenders via Apify', APIFY_UK_TENDERS('', 'tender', '', '', 10));
}
function menuApifyGreenMark_() {
  writeMenuResult_('Green Mark via Apify', APIFY_SG_GREEN_MARK('', '', '', 10));
}

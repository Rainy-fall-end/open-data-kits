/**
 * Flagship Apify Connectors for Google Sheets.
 *
 * Setup:
 *   1. In Apps Script, add a Script Property named APIFY_TOKEN.
 *   2. Paste this file into the bound script and reload the spreadsheet.
 *   3. Use the "Flagship Apify" menu.
 *
 * Every run is hard-capped at USD 0.25. Tokens are sent in an Authorization
 * header and are never written to cells or logs.
 */

var FLAGSHIP_MAX_TOTAL_CHARGE_USD = 0.25;

var FLAGSHIP_PRESETS = {
  ats_jobs: {
    name: 'ATS Jobs & Hiring Signals',
    actorId: 'CRulq5dak4mqAUmMn',
    sheetName: 'ATS Hiring Signals',
    input: {
      preset: 'ai_leaders',
      keywords: 'AI, Machine Learning, LLM',
      remoteOnly: false,
      departmentFilter: '',
      includeDescription: false,
      maxItems: 50
    }
  },
  sec_form_d: {
    name: 'SEC Form D Startup Funding',
    actorId: '8LFIbRbidiHPknMz5',
    sheetName: 'SEC Form D Funding',
    input: {
      mode: 'form_d_funding',
      query: 'artificial intelligence',
      excludePooledFunds: true,
      minOfferingAmountUsd: 1000000,
      industryFilter: '',
      includeAmendments: false,
      maxItems: 100
    }
  },
  sec_xbrl_aapl: {
    name: 'SEC XBRL AAPL Financials',
    actorId: '8LFIbRbidiHPknMz5',
    sheetName: 'AAPL XBRL Financials',
    input: {
      mode: 'xbrl_financials',
      ticker: 'AAPL',
      forms: '10-K,10-Q',
      maxItems: 50
    }
  },
  global_tenders: {
    name: 'Global Public Tenders & Grants',
    actorId: 'ZlabhlvEIyRVdtKiQ',
    sheetName: 'Global Tenders',
    input: {
      sources: [
        'uk_find_a_tender',
        'eu_ted',
        'us_grants_gov',
        'usaspending',
        'world_bank',
        'canada_contracts',
        'austender'
      ],
      opportunityTypes: ['tender', 'grant', 'award'],
      keyword: 'artificial intelligence',
      dateFrom: '',
      dateTo: '',
      maxItems: 50,
      perSourceLimit: 10,
      sourceTimeoutSecs: 20
    }
  },
  pharma_pipeline: {
    name: 'Pharma & Biotech Pipeline Intelligence',
    actorId: 're8aRvtqBonP5HMuY',
    sheetName: 'Pharma Pipeline',
    input: {
      mode: 'drug_dossier',
      query: 'semaglutide',
      drugNames: [],
      maxItems: 10,
      sourceItemsPerQuery: 5,
      sourceTimeoutSeconds: 25,
      requestDelayMs: 150
    }
  },
  usaspending_contracts: {
    name: 'USASpending Federal Contracts',
    actorId: 'eQQ2beomyLlW4DTGM',
    sheetName: 'Federal Contracts',
    input: {
      keyword: 'cybersecurity',
      awardCategory: 'contracts',
      startDate: '2025-01-01',
      endDate: '2026-12-31',
      awardingAgency: '',
      minAwardAmount: 1000000,
      naicsCode: '541511',
      sortOrder: 'desc',
      maxItems: 50
    }
  }
};

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Flagship Apify')
    .addItem('Import ATS hiring signals', 'importAtsJobs')
    .addSeparator()
    .addItem('Import SEC Form D startup funding', 'importSecFormD')
    .addItem('Import AAPL XBRL financials', 'importSecXbrlAapl')
    .addSeparator()
    .addItem('Import global tenders and grants', 'importGlobalTenders')
    .addItem('Import pharma pipeline intelligence', 'importPharmaPipeline')
    .addItem('Import federal contracts', 'importUsaSpendingContracts')
    .addToUi();
}

function importAtsJobs() {
  return runFlagshipPreset_('ats_jobs');
}

function importSecFormD() {
  return runFlagshipPreset_('sec_form_d');
}

function importSecXbrlAapl() {
  return runFlagshipPreset_('sec_xbrl_aapl');
}

function importGlobalTenders() {
  return runFlagshipPreset_('global_tenders');
}

function importPharmaPipeline() {
  return runFlagshipPreset_('pharma_pipeline');
}

function importUsaSpendingContracts() {
  return runFlagshipPreset_('usaspending_contracts');
}

function runFlagshipPreset_(presetKey) {
  var preset = FLAGSHIP_PRESETS[presetKey];
  if (!preset) {
    throw new Error('Unknown Flagship preset: ' + presetKey);
  }

  var token = PropertiesService.getScriptProperties().getProperty('APIFY_TOKEN');
  if (!token) {
    throw new Error('Missing APIFY_TOKEN. Add it under Project Settings > Script Properties.');
  }

  var endpoint = getFlagshipApiBaseUrl_()
    + '/acts/' + encodeURIComponent(preset.actorId)
    + '/run-sync-get-dataset-items'
    + '?format=json&clean=true&maxTotalChargeUsd=' + FLAGSHIP_MAX_TOTAL_CHARGE_USD;

  var response = UrlFetchApp.fetch(endpoint, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify(preset.input),
    muteHttpExceptions: true
  });

  var status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    throw new Error('Apify request failed (' + status + '): ' + response.getContentText().slice(0, 500));
  }

  var records = JSON.parse(response.getContentText());
  if (!Array.isArray(records)) {
    throw new Error('Expected a JSON dataset array from ' + preset.name + '.');
  }

  writeRecordsToSheet_(preset.sheetName, records);
  return records.length;
}

function getFlagshipApiBaseUrl_() {
  if (typeof FLAGSHIP_API_BASE_URL_OVERRIDE !== 'undefined' && FLAGSHIP_API_BASE_URL_OVERRIDE) {
    return String(FLAGSHIP_API_BASE_URL_OVERRIDE).replace(/\/$/, '');
  }
  return 'https://api.apify.com/v2';
}

function writeRecordsToSheet_(sheetName, records) {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName(sheetName) || spreadsheet.insertSheet(sheetName);
  sheet.clearContents();

  if (records.length === 0) {
    sheet.getRange(1, 1).setValue('No records returned for this preset.');
    return;
  }

  var flattened = records.map(function (record) {
    return flattenRecord_(record);
  });
  var headerMap = {};
  flattened.forEach(function (record) {
    Object.keys(record).forEach(function (key) {
      headerMap[key] = true;
    });
  });
  var rawHeaders = Object.keys(headerMap).sort();
  var displayHeaders = rawHeaders.map(neutralizeFormula_);
  var values = flattened.map(function (record) {
    return rawHeaders.map(function (header) {
      return neutralizeFormula_(Object.prototype.hasOwnProperty.call(record, header) ? record[header] : '');
    });
  });

  sheet.getRange(1, 1, 1, displayHeaders.length).setValues([displayHeaders]);
  sheet.getRange(2, 1, values.length, displayHeaders.length).setValues(values);
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, displayHeaders.length);
}

function flattenRecord_(record) {
  var output = {};
  flattenValue_(record, '', output);
  return output;
}

function flattenValue_(value, prefix, output) {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    var keys = Object.keys(value);
    if (keys.length === 0 && prefix) {
      output[prefix] = '{}';
      return;
    }
    keys.forEach(function (key) {
      var path = prefix ? prefix + '.' + key : key;
      flattenValue_(value[key], path, output);
    });
    return;
  }

  if (Array.isArray(value)) {
    output[prefix || 'value'] = JSON.stringify(value);
    return;
  }

  output[prefix || 'value'] = value === null || typeof value === 'undefined' ? '' : value;
}

function neutralizeFormula_(value) {
  if (typeof value !== 'string') {
    return value;
  }
  return /^[=+\-@\t\r]/.test(value) ? "'" + value : value;
}

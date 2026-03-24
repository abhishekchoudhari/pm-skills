// ============================================================
// PM Tracker — Google Apps Script (TEMPLATE)
// Offline sync (runs without Claude) + Sheet formatting
// ============================================================
//
// SETUP (one-time):
//   1. Go to script.google.com → New project → paste this file
//   2. Fill in YOUR values in the CONFIG section below
//   3. Run setupProperties() once
//   4. Run formatAllSheets() once to apply formatting
//   5. Run setupTriggers() once to activate scheduled sync
//   Authorize Gmail + Sheets scopes when prompted.
//
// WHAT IT DOES (when Claude Code is offline):
//   • 10am: incremental Gmail scan + daily summary email
//   • 3pm:  incremental Gmail scan
//   • 7pm:  incremental Gmail scan
//   New vendor emails are appended as Open rows with Risk=TBD.
//   Run Claude Code sync (/pm-project-management:expert-pm-tracker sync all)
//   to enrich TBD rows with AI risk scoring.
// ============================================================

// ── CONFIG — fill these in before running ───────────────────

const INITIATIVES = {
  // Replace key names, sheetId, sheetTab, vendorDomains, and keywords
  // with your own initiative details. Add or remove initiatives as needed.

  MyInitiative1: {
    sheetId: 'YOUR_GOOGLE_SHEET_ID_1',          // from the sheet URL
    sheetTab: 'Sheet1',                          // tab name inside the sheet
    vendorDomains: ['vendor1.com', 'vendor2.com'],
    keywords: ['keyword1', 'keyword2'],
    riskCol: 8,    // column number (1-based) for Risk
    statusCol: 6,  // column number (1-based) for Status
    totalCols: 10, // total columns in your tracker schema
  },

  MyInitiative2: {
    sheetId: 'YOUR_GOOGLE_SHEET_ID_2',
    sheetTab: 'Sheet1',
    vendorDomains: ['vendor3.com'],
    keywords: ['keyword3', 'keyword4'],
    riskCol: 7,
    statusCol: 5,
    totalCols: 9,
  }
};

const SUMMARY_EMAIL = 'you@yourcompany.com';   // daily summary recipient
const USER_DOMAIN   = 'yourcompany.com';        // filters out internal emails

// ── One-time Setup ──────────────────────────────────────────

function setupProperties() {
  const props = PropertiesService.getScriptProperties();
  const now = new Date().toISOString();
  Object.keys(INITIATIVES).forEach(name => {
    if (!props.getProperty('last_sync_' + name)) {
      props.setProperty('last_sync_' + name, now);
    }
  });
  Logger.log('Properties initialised. last_sync = ' + now);
}

// ── Triggers ────────────────────────────────────────────────

function setupTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger('runMorningSyncAndEmail')
    .timeBased().atHour(10).everyDays(1).create();

  ScriptApp.newTrigger('runIncrementalSync')
    .timeBased().atHour(15).everyDays(1).create();

  ScriptApp.newTrigger('runIncrementalSync')
    .timeBased().atHour(19).everyDays(1).create();

  Logger.log('Triggers created: 10am (sync+email), 3pm (sync), 7pm (sync)');
}

function runMorningSyncAndEmail() {
  runIncrementalSync();
  sendDailySummaryEmail();
}

// ── Incremental Gmail Sync ───────────────────────────────────

function runIncrementalSync() {
  const props = PropertiesService.getScriptProperties();

  Object.entries(INITIATIVES).forEach(([name, cfg]) => {
    const lastSyncStr = props.getProperty('last_sync_' + name);
    const lastSync = lastSyncStr ? new Date(lastSyncStr) : new Date(Date.now() - 30 * 86400000);
    const afterDate = Utilities.formatDate(lastSync, 'GMT', 'yyyy/MM/dd');

    const domainQuery = cfg.vendorDomains.map(d => 'from:' + d).join(' OR ');
    const query = '(' + domainQuery + ') after:' + afterDate + ' -from:@' + USER_DOMAIN;

    const threads = GmailApp.search(query, 0, 20);
    if (threads.length === 0) {
      Logger.log(name + ': no new threads since ' + afterDate);
      return;
    }

    const ss = SpreadsheetApp.openById(cfg.sheetId);
    const sheet = ss.getSheetByName(cfg.sheetTab);
    const newRows = [];

    threads.forEach(thread => {
      const msgs = thread.getMessages();
      const lastMsg = msgs[msgs.length - 1];
      if (lastMsg.getDate() <= lastSync) return;

      const senderDomain = (lastMsg.getFrom().match(/@([\w.]+)/) || [])[1] || 'Unknown';
      const subject = thread.getFirstMessageSubject()
        .replace(/^(Re:|Fwd:|FW:|RE:)\s*/gi, '').trim();
      const snippet = msgs[0].getPlainBody()
        .replace(/\r?\n/g, ' ').replace(/\s+/g, ' ')
        .substring(0, 120).trim();
      const dateStr = Utilities.formatDate(lastMsg.getDate(), Session.getScriptTimeZone(), 'dd MMM yyyy');

      // Build a row matching your tracker schema (adjust field count to match totalCols)
      const row = cfg.totalCols === 10
        ? [subject, 'Not enough context', 'Not enough context', '-', '-', 'Open', snippet, 'TBD', senderDomain, 'Gmail (auto ' + dateStr + ')']
        : [subject, 'Not enough context', 'Not enough context', '-', 'Open', snippet, 'TBD', senderDomain, 'Gmail (auto ' + dateStr + ')'];

      newRows.push(row);
    });

    if (newRows.length > 0) {
      const startRow = sheet.getLastRow() + 1;
      sheet.getRange(startRow, 1, newRows.length, newRows[0].length).setValues(newRows);
      applyRiskFormatting(sheet, cfg.riskCol);
      applyStatusFormatting(sheet, cfg.statusCol);
      Logger.log(name + ': appended ' + newRows.length + ' new row(s)');
    }

    props.setProperty('last_sync_' + name, new Date().toISOString());
  });
}

// ── Daily Summary Email ──────────────────────────────────────

function sendDailySummaryEmail() {
  const tz = Session.getScriptTimeZone();
  const today = Utilities.formatDate(new Date(), tz, 'dd MMM yyyy');
  let totalOpen = 0;
  let body = '<h2 style="color:#1a3a5c">Progress Tracker ' + today + '</h2>';
  body += '<p style="color:#555">Auto-generated by PM Tracker Apps Script.</p>';

  Object.entries(INITIATIVES).forEach(([name, cfg]) => {
    const sheet = SpreadsheetApp.openById(cfg.sheetId).getSheetByName(cfg.sheetTab);
    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return;

    const statusIdx = cfg.statusCol - 1;
    const riskIdx = cfg.riskCol - 1;

    const openItems = data.slice(1).filter(row => {
      const s = (row[statusIdx] || '').toString().toLowerCase();
      return s !== 'done' && s !== 'closed' && s !== 'cancelled' && s !== '';
    });

    const high = openItems.filter(r => r[riskIdx] === 'HIGH').length;
    const med  = openItems.filter(r => r[riskIdx] === 'MEDIUM').length;
    const low  = openItems.filter(r => r[riskIdx] === 'LOW').length;
    const tbd  = openItems.filter(r => r[riskIdx] === 'TBD').length;

    totalOpen += openItems.length;

    const url = 'https://docs.google.com/spreadsheets/d/' + cfg.sheetId;
    body += '<h3><a href="' + url + '" style="color:#1a3a5c">' + name + '</a></h3>';
    body += '<p>' + openItems.length + ' open items &nbsp;|&nbsp; ';
    body += '<b style="color:#cc0000">HIGH: ' + high + '</b> &nbsp; ';
    body += '<b style="color:#e65c00">MEDIUM: ' + med + '</b> &nbsp; ';
    body += '<b style="color:#274e13">LOW: ' + low + '</b>';
    if (tbd > 0) body += ' &nbsp; <span style="color:#888">TBD: ' + tbd + ' (needs Claude sync)</span>';
    body += '</p>';

    const highItems = openItems.filter(r => r[riskIdx] === 'HIGH').slice(0, 5);
    if (highItems.length > 0) {
      body += '<ul style="margin:4px 0">';
      highItems.forEach(r => {
        const task = r[0] || '-';
        const update = r[cfg.totalCols === 10 ? 6 : 5] || '-';
        body += '<li><b>' + task + '</b> — ' + update + '</li>';
      });
      body += '</ul>';
    }
  });

  body += '<hr><p style="color:#aaa;font-size:11px">Sent by PM Tracker Apps Script (offline mode). ';
  body += 'Run Claude Code sync for AI-enriched risk scoring.</p>';

  GmailApp.sendEmail(
    SUMMARY_EMAIL,
    'Progress Tracker ' + today + ' | #' + totalOpen + ' open items',
    'Open in a mail client that supports HTML.',
    { htmlBody: body }
  );
  Logger.log('Summary email sent: ' + totalOpen + ' open items');
}

// ── Formatting ───────────────────────────────────────────────

function formatAllSheets() {
  Object.entries(INITIATIVES).forEach(([name, cfg]) => {
    const ss = SpreadsheetApp.openById(cfg.sheetId);
    const sheet = ss.getSheetByName(cfg.sheetTab);
    formatSheet(sheet, cfg);
    Logger.log('Formatted: ' + name);
  });
}

function formatSheet(sheet, cfg) {
  const lastRow = Math.max(sheet.getLastRow(), 2);
  const totalCols = cfg.totalCols;

  const header = sheet.getRange(1, 1, 1, totalCols);
  header.setBackground('#1a3a5c')
        .setFontColor('#ffffff')
        .setFontWeight('bold')
        .setFontSize(11)
        .setVerticalAlignment('middle')
        .setHorizontalAlignment('center')
        .setWrap(true);
  sheet.setRowHeight(1, 38);
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(1);

  // Adjust column widths to match your schema
  const widths = totalCols === 10
    ? [280, 130, 120, 120, 100, 110, 300, 80, 110, 90]
    : [280, 130, 120, 100, 110, 300, 80, 110, 90];
  widths.forEach((w, i) => sheet.setColumnWidth(i + 1, w));

  for (let row = 2; row <= lastRow; row++) {
    sheet.getRange(row, 1, 1, totalCols)
         .setBackground(row % 2 === 0 ? '#f0f4f9' : '#ffffff');
  }

  sheet.getRange(2, 1, lastRow - 1, totalCols)
       .setFontSize(10).setVerticalAlignment('top').setWrap(true);

  applyRiskFormatting(sheet, cfg.riskCol);
  applyStatusFormatting(sheet, cfg.statusCol);

  sheet.getRange(1, 1, lastRow, totalCols)
       .setBorder(true, true, true, true, true, true, '#d0d0d0',
                  SpreadsheetApp.BorderStyle.SOLID);
}

function applyRiskFormatting(sheet, riskCol) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  for (let row = 2; row <= lastRow; row++) {
    const cell = sheet.getRange(row, riskCol);
    switch (cell.getValue()) {
      case 'HIGH':   cell.setBackground('#f4cccc').setFontColor('#cc0000').setFontWeight('bold'); break;
      case 'MEDIUM': cell.setBackground('#fce5cd').setFontColor('#b45309').setFontWeight('bold'); break;
      case 'LOW':    cell.setBackground('#d9ead3').setFontColor('#274e13').setFontWeight('bold'); break;
      case 'TBD':    cell.setBackground('#efefef').setFontColor('#888888').setFontWeight('normal'); break;
      default:       cell.setBackground(null).setFontColor(null).setFontWeight('normal');
    }
  }
}

function applyStatusFormatting(sheet, statusCol) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  for (let row = 2; row <= lastRow; row++) {
    const cell = sheet.getRange(row, statusCol);
    switch (cell.getValue()) {
      case 'Done':
      case 'Closed':       cell.setBackground('#d9ead3').setFontColor('#274e13'); break;
      case 'In Progress':  cell.setBackground('#fff2cc').setFontColor('#7d4c00'); break;
      case 'In Review':
      case 'Open':         cell.setBackground('#fce5cd').setFontColor('#7d4c00'); break;
      case 'To be Picked':
      case 'Solutionizing': cell.setBackground('#efefef').setFontColor('#555555'); break;
      default:             cell.setBackground(null).setFontColor(null);
    }
  }
}

// ============================================================
// PM Tracker — Google Apps Script  v5  (TEMPLATE)
// Autonomous sync: Gmail → Claude AI → Google Sheets → Morning Briefing
// ============================================================
//
// SETUP (one-time, run in order):
//   1. Go to script.google.com → New project → paste this file
//   2. Fill in SUMMARY_EMAIL, USER_DOMAIN, MASTER_SHEET_ID below
//   3. Project Settings → Script Properties → Add:
//        ANTHROPIC_API_KEY = sk-ant-...
//   4. Run setupConfigTab()      — creates _Config tab in Master Dashboard (initiative config lives there)
//   5. Run setupProperties()     — initialises last_sync (lookback per initiative)
//   6. Run formatAllSheets()     — creates headers, dropdowns, formatting
//   7. Run setupTriggers()       — 10am sync+email, 5pm sync
//   Authorise Gmail + Sheets scopes when prompted.
//
// ADDING A NEW INITIATIVE LATER:
//   1. Add a row to the _Config tab in your Master Dashboard sheet (no code changes needed)
//   2. Edit addNewInitiativeSetup(): set initiativeName to match the new row's Initiative column
//   3. Run addNewInitiativeSetup()
//   4. Run formatAllSheets()
//
// MAINTENANCE:
//   clearSyncProperties()    — force full re-scan from scratch
//   cleanupClaimedThreads()  — prune stale thread locks (runs automatically)
//
// SCHEDULE (no Claude Code required once set up):
//   10am — Gmail scan + AI risk scoring + morning briefing email
//   5pm  — Gmail scan + AI risk scoring (no email)
//
// COLUMN SCHEMA (unified — same for every initiative sheet):
//   A  Task              B  Category          C  [Team] SPOC  ← INTERNAL_TEAM_NAME
//   D  ETA               E  Status            F  Latest Update
//   G  Commitments       H  Risk Score        I  Risk
//   J  Vendor            K  Source (hyperlink) L  Action Pending On
//   M  Last Updated  ← written automatically
// ============================================================

// ── FILTER CONSTANTS ────────────────────────────────────────

// Threads with any of these patterns in the subject are dropped before Claude analysis
const SKIP_SUBJECT_PATTERNS = [
  'planned maintenance', 'downtime', 'maintenance activity', 'scheduled maintenance',
  'redmine ticketing', 'out of office', 'automatic reply', 'auto-generated',
  'undelivered mail', 'delivery status', 'delivery failure', 'mail delivery',
  'mailer-daemon', 'ndr:', 'read receipt', 'bounce notification'
];

// Emails relayed through these security/gateway domains are not counted as vendor messages
const RELAY_DOMAINS = [
  'trendmicro.com', 'mimecast.com', 'proofpoint.com',
  'barracudanetworks.com', 'ironport.com', 'symanteccloud.com', 'messagelabs.com'
];

// ── CONFIG ──────────────────────────────────────────────────
// Initiative configs live in the _Config tab of your Master Dashboard sheet.
// Run setupConfigTab() once to create the tab with headers and example data.
// After that, add or edit initiatives directly in the sheet — no code changes needed.

// Script-level cache: loaded once per execution, shared across all functions in the run
let _initiatives = null;

// Returns initiatives config object, loading from _Config tab on first call per execution
function getInitiatives() {
  if (!_initiatives) _initiatives = loadInitiatives();
  return _initiatives;
}

// Reads _Config tab from Master Dashboard and returns an initiatives config object
function loadInitiatives() {
  const master   = SpreadsheetApp.openById(MASTER_SHEET_ID);
  const cfgSheet = master.getSheetByName('_Config');
  if (!cfgSheet) throw new Error('_Config tab not found in master sheet. Run setupConfigTab() first.');

  const data = cfgSheet.getDataRange().getValues();
  if (data.length < 2) throw new Error('_Config tab has no initiative rows. Add at least one row below the header.');

  const headers = data[0].map(String);
  const col     = label => headers.indexOf(label);

  const initiatives = {};
  for (let i = 1; i < data.length; i++) {
    const row  = data[i];
    const name = String(row[col('Initiative')] || '').trim();
    if (!name) continue;

    // Skip rows explicitly marked inactive — empty or 'Y' means active (backward compatible)
    const activeVal = col('Active') >= 0 ? String(row[col('Active')] || '').trim().toLowerCase() : '';
    if (activeVal === 'n' || activeVal === 'no' || activeVal === 'false') {
      Logger.log('Skipping inactive initiative: ' + name);
      continue;
    }

    initiatives[name] = {
      sheetId:            String(row[col('Sheet ID')]        || '').trim(),
      sheetTab:           String(row[col('Sheet Tab')]       || 'Open Items').trim(),
      vendorDomains:      String(row[col('Vendor Domains')]  || '').split(',').map(s => s.trim()).filter(Boolean),
      vendorNames:        String(row[col('Vendor Names')]    || '').split(',').map(s => s.trim()).filter(Boolean),
      focusContacts:      String(row[col('Focus Contacts')]  || '').split(',').map(s => s.trim()).filter(Boolean),
      teamContext:        String(row[col('Team Context')]    || '').trim(),
      initiativeDeadline: String(row[col('Deadline')]        || '').trim() || null,
      scan_lookback_days: parseInt(row[col('Lookback Days')] || 30) || 30,
      description:        String(row[col('Description')]     || '').trim(),
      // Column indices are unified across all initiative sheets — not stored per row
      statusCol: 5, updateCol: 6, commitCol: 7, riskScoreCol: 8,
      riskCol: 9, vendorCol: 10, sourceCol: 11, actionCol: 12, totalCols: 12,
    };
  }

  if (Object.keys(initiatives).length === 0) throw new Error('No valid rows found in _Config tab.');
  Logger.log('Loaded ' + Object.keys(initiatives).length + ' initiatives from _Config tab');
  return initiatives;
}

// One-time setup: creates _Config tab in the Master Dashboard with headers and example rows
// Run once. After that, manage initiatives directly in the sheet.
function setupConfigTab() {
  const master   = SpreadsheetApp.openById(MASTER_SHEET_ID);
  const existing = master.getSheetByName('_Config');
  if (existing) {
    Logger.log('_Config tab already exists. Edit it directly, or delete and re-run to reset.');
    return;
  }

  const cfgSheet = master.insertSheet('_Config');
  const headers  = [
    'Initiative', 'Sheet ID', 'Sheet Tab', 'Vendor Domains', 'Vendor Names',
    'Focus Contacts', 'Team Context', 'Deadline', 'Lookback Days', 'Description', 'Active'
  ];
  cfgSheet.getRange(1, 1, 1, headers.length).setValues([headers])
    .setBackground('#1a3a5c').setFontColor('#ffffff').setFontWeight('bold');

  // Example rows — replace with your actual initiatives
  // Active: Y = include in sync, N = pause without deleting (leave blank to default to active)
  const rows = [
    [
      'MyInitiative1',
      'YOUR_GOOGLE_SHEET_ID_1',
      'Open Items',
      'vendor1.com,vendor2.com',
      'Vendor One,Vendor Two',
      'key.person@vendor1.com',
      'Alice → compliance and risk; Bob → tech integrations; Carol → ops and reconciliation',
      '',
      30,
      'One sentence describing what this initiative tracks',
      'Y'
    ],
    [
      'MyInitiative2',
      'YOUR_GOOGLE_SHEET_ID_2',
      'Open Items',
      'vendor3.com',
      'Vendor Three',
      '',
      'Alice → owner and escalations; Dave → regulatory and audit',
      '2026-06-30',
      30,
      'Description of what initiative 2 tracks',
      'Y'
    ]
  ];

  cfgSheet.getRange(2, 1, rows.length, headers.length).setValues(rows);

  const widths = [160, 260, 90, 220, 120, 300, 500, 90, 90, 350, 55];
  widths.forEach((w, i) => cfgSheet.setColumnWidth(i + 1, w));
  cfgSheet.setFrozenRows(1);
  cfgSheet.getRange(2, 1, rows.length, headers.length).setWrap(true);
  cfgSheet.setRowHeightsForced(2, rows.length, 80);

  Logger.log('_Config tab created. Replace the example rows with your actual initiatives, then run setupProperties().');
}

const SUMMARY_EMAIL       = 'you@yourcompany.com';
const USER_DOMAIN         = 'yourcompany.com';
const MASTER_SHEET_ID     = 'YOUR_MASTER_SHEET_ID';
const INTERNAL_TEAM_NAME  = 'Your Team';  // replace with your team name — used in dropdowns, prompts, email UI

// ── One-time Setup ───────────────────────────────────────────

function setupProperties() {
  const props = PropertiesService.getScriptProperties();

  Object.entries(getInitiatives()).forEach(([name, cfg]) => {
    if (!props.getProperty('last_sync_' + name)) {
      const days         = cfg.scan_lookback_days || 30;
      const lookbackDate = new Date(Date.now() - days * 86400000);
      props.setProperty('last_sync_' + name, lookbackDate.toISOString());
      Logger.log(name + ': last_sync initialised to ' + days + ' days ago');
    } else {
      Logger.log(name + ': last_sync already set — skipping');
    }
    // first_sync_complete intentionally NOT set here — set after actual sync
  });

  if (!props.getProperty('ANTHROPIC_API_KEY')) {
    Logger.log('⚠️  ANTHROPIC_API_KEY missing. Add via Project Settings → Script Properties.');
  } else {
    Logger.log('✓  ANTHROPIC_API_KEY found.');
  }
}

// Clear all sync state — forces a full re-scan on next run
function clearSyncProperties() {
  const props   = PropertiesService.getScriptProperties();
  const allKeys = Object.keys(props.getProperties());
  allKeys.forEach(key => {
    if (key.startsWith('last_sync_') || key.startsWith('first_sync_complete_') || key.startsWith('claimed_')) {
      props.deleteProperty(key);
    }
  });
  Logger.log('Cleared all sync properties. Run setupProperties() then syncAll().');
}

// Run after adding a new row to the _Config tab in your Master Dashboard
// Edit initiativeName to match the Initiative column value in the new row
function addNewInitiativeSetup() {
  const initiativeName = 'NewInitiativeName';  // must match the Initiative column in _Config tab
  const lookbackDays   = 30;

  const cfg = getInitiatives()[initiativeName];
  if (!cfg) {
    Logger.log('ERROR: "' + initiativeName + '" not found in _Config tab. Add the row first, then re-run.');
    return;
  }

  // Validate the sheet and tab exist before setting properties
  try {
    const ss    = SpreadsheetApp.openById(cfg.sheetId);
    const sheet = ss.getSheetByName(cfg.sheetTab);
    if (!sheet) {
      Logger.log('WARNING: tab "' + cfg.sheetTab + '" not found in sheet ' + cfg.sheetId +
        '. Rename the default tab to "' + cfg.sheetTab + '" then re-run.');
      return;
    }
    Logger.log(initiativeName + ': sheet and tab verified.');
  } catch (e) {
    Logger.log('ERROR: could not open sheet ' + cfg.sheetId + ' — ' + e.message);
    return;
  }

  const props        = PropertiesService.getScriptProperties();
  const lookbackDate = new Date(Date.now() - lookbackDays * 86400000);
  props.setProperty('last_sync_' + initiativeName, lookbackDate.toISOString());
  props.deleteProperty('first_sync_complete_' + initiativeName);
  Logger.log(initiativeName + ': will scan back ' + lookbackDays + ' days. Run formatAllSheets() then syncAll().');
}

// Prune claimed_ thread keys older than max lookback + 7d buffer
// Runs automatically at the end of every syncAll()
function cleanupClaimedThreads() {
  const props    = PropertiesService.getScriptProperties();
  const allProps = props.getProperties();
  const maxDays  = Math.max(...Object.values(getInitiatives()).map(c => c.scan_lookback_days || 30));
  const cutoffMs = Date.now() - (maxDays + 7) * 86400000;
  let   deleted  = 0;

  Object.entries(allProps).forEach(([key, value]) => {
    if (!key.startsWith('claimed_')) return;
    const ts = parseInt((value || '').split('|')[1]);
    if (ts && ts < cutoffMs) { props.deleteProperty(key); deleted++; }
  });
  if (deleted > 0) Logger.log('Cleaned up ' + deleted + ' stale claimed_ keys');
}

// ── Triggers ────────────────────────────────────────────────

function setupTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('runMorningSyncAndEmail').timeBased().atHour(10).everyDays(1).create();
  ScriptApp.newTrigger('runIncrementalSync').timeBased().atHour(17).everyDays(1).create();
  Logger.log('Triggers set: 10am (sync+email), 5pm (sync only)');
}

function runMorningSyncAndEmail() {
  const runResults = syncAll(null, true);
  generateAndSendBriefing(runResults);
}

function runIncrementalSync() {
  syncAll(null, false);
}

// ── Core Sync Orchestrator ───────────────────────────────────
// To sync a single initiative manually, call: syncAll('MyInitiativeName', false)

function syncAll(initiativeFilter, isMorning) {
  const all         = getInitiatives();
  const initiatives = initiativeFilter && all[initiativeFilter]
    ? { [initiativeFilter]: all[initiativeFilter] }
    : all;

  const nowTs = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd MMM yyyy HH:mm');

  // Step 1: Collect + filter threads (messages cached inside each thread object)
  const allThreadData = collectAllThreads(initiatives);

  // Step 2: Route ambiguous threads (shared vendor domains) — single Claude call
  const routingDecisions = routeAmbiguousThreads(allThreadData, initiatives);

  // Step 3: Sync each initiative
  const runResults = {};
  Object.entries(initiatives).forEach(([name, cfg]) => {
    try {
      const { threads, lastSync } = allThreadData[name];
      const myThreads = threads.filter(t => {
        const decision = routingDecisions[t.getId()];
        return !decision || decision === name;
      });
      runResults[name] = syncInitiative(name, cfg, myThreads, lastSync);
    } catch (e) {
      Logger.log('ERROR syncing ' + name + ': ' + e.message + '\n' + e.stack);
      runResults[name] = { newCount: 0, updatedCount: 0, openRows: [], riskCounts: { high: 0, medium: 0, low: 0 }, error: e.message };
    }
  });

  // Step 4: Single-pass master sheet update (all initiatives, one open)
  updateAllMasterSheetEntries(initiatives, runResults, nowTs);

  // Step 5: Rewrite entire _Snapshot in one pass (morning only, for delta tracking)
  if (isMorning) updateAllSnapshots(initiatives, runResults);

  // Periodic cleanup of stale claimed_ thread locks
  try { cleanupClaimedThreads(); } catch (e) { /* non-critical */ }

  Logger.log('syncAll complete: ' + JSON.stringify(
    Object.fromEntries(Object.entries(runResults).map(([k, v]) =>
      [k, v.newCount + ' new, ' + v.updatedCount + ' updated']))
  ));
  return runResults;
}

// ── Gmail Collection ─────────────────────────────────────────

function collectAllThreads(initiatives) {
  const props = PropertiesService.getScriptProperties();
  const allThreadData = {};

  Object.entries(initiatives).forEach(([name, cfg]) => {
    const lastSyncStr  = props.getProperty('last_sync_' + name);
    const lookbackDays = cfg.scan_lookback_days || 30;
    const lastSync     = lastSyncStr
      ? new Date(lastSyncStr)
      : new Date(Date.now() - lookbackDays * 86400000);
    const afterDate    = Utilities.formatDate(lastSync, 'GMT', 'yyyy/MM/dd');

    const domainQuery = cfg.vendorDomains.map(d => 'from:' + d).join(' OR ');
    const query       = '(' + domainQuery + ') after:' + afterDate + ' -in:chats';

    let rawThreads = [];
    try {
      rawThreads = GmailApp.search(query, 0, 40);
    } catch (e) {
      Logger.log(name + ': Gmail search failed — ' + e.message);
    }

    // Fetch messages once per thread — cached on the object for all downstream use
    const threadCache = rawThreads.map(thread => ({
      thread,
      msgs: thread.getMessages()
    }));

    const filtered = threadCache.filter(({ thread, msgs }) => {
      const subject = thread.getFirstMessageSubject().toLowerCase();

      // 1. Drop maintenance/OOO/NDR/automated notifications
      if (SKIP_SUBJECT_PATTERNS.some(p => subject.includes(p))) return false;

      // 2. Count genuine vendor messages (exclude relay/gateway domains)
      const vendorMsgs = msgs.filter(m => {
        const domain = extractDomain(m.getFrom());
        if (RELAY_DOMAINS.some(r => domain.includes(r))) return false;
        return cfg.vendorDomains.some(d => domain.includes(d));
      });
      if (vendorMsgs.length === 0) return false;

      // 3. Substantive thread: first message from vendor OR 2+ genuine vendor messages
      //    Prevents internal threads where vendor merely replied once as a CC
      const firstDomain   = extractDomain(msgs[0].getFrom());
      const firstIsVendor = cfg.vendorDomains.some(d => firstDomain.includes(d));
      if (!firstIsVendor && vendorMsgs.length < 2) return false;

      // 4. Must have activity since lastSync
      return msgs[msgs.length - 1].getDate() > lastSync;
    });

    // Sort focus contacts to front, cap at 20
    // Pre-compute isFocus per thread (O(n×m)) rather than re-evaluating in every sort comparison
    const focusSet  = new Set((cfg.focusContacts || []).map(fc => fc.toLowerCase()));
    const withFocus = filtered.map(item => ({
      ...item,
      isFocus: focusSet.size > 0 && item.msgs.some(m => focusSet.has(extractEmail(m.getFrom()).toLowerCase()))
    }));
    const sorted = withFocus.sort((a, b) => (b.isFocus ? 1 : 0) - (a.isFocus ? 1 : 0));

    // Attach cached messages to thread object — reused in buildThreadContext
    const finalThreads = sorted.slice(0, 20).map(({ thread, msgs }) => {
      thread._cachedMsgs = msgs;
      return thread;
    });

    allThreadData[name] = { threads: finalThreads, lastSync };
    Logger.log(name + ': ' + finalThreads.length + ' threads after filter (from ' + rawThreads.length + ' raw)');
  });

  return allThreadData;
}

// ── Cross-Initiative Routing ─────────────────────────────────

function routeAmbiguousThreads(allThreadData, initiatives) {
  const props               = PropertiesService.getScriptProperties();
  const threadInitiativeMap = {};

  Object.entries(allThreadData).forEach(([name, { threads }]) => {
    threads.forEach(thread => {
      const id = thread.getId();
      if (!threadInitiativeMap[id]) threadInitiativeMap[id] = { initiatives: [], thread };
      if (!threadInitiativeMap[id].initiatives.includes(name)) {
        threadInitiativeMap[id].initiatives.push(name);
      }
    });
  });

  const ambiguous = Object.entries(threadInitiativeMap)
    .filter(([, { initiatives: inits }]) => inits.length > 1);

  if (ambiguous.length === 0) return {};

  const routingDecisions = {};
  const needsRouting     = [];

  ambiguous.forEach(([id, { initiatives: inits, thread }]) => {
    const stored  = props.getProperty('claimed_' + id);
    const claimed = stored ? stored.split('|')[0] : null;
    if (claimed && inits.includes(claimed)) {
      routingDecisions[id] = claimed;
    } else {
      needsRouting.push({ id, thread, initiatives: inits });
    }
  });

  if (needsRouting.length === 0) return routingDecisions;

  const apiKey = props.getProperty('ANTHROPIC_API_KEY');
  if (!apiKey) {
    needsRouting.forEach(({ id, initiatives: inits }) => { routingDecisions[id] = inits.sort()[0]; });
    return routingDecisions;
  }

  const anyFirstSync = Object.keys(initiatives).some(
    name => props.getProperty('first_sync_complete_' + name) !== 'true'
  );
  const model = anyFirstSync ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001';

  const initiativeDescriptions = Object.fromEntries(
    Object.entries(initiatives).map(([name, cfg]) => [name, cfg.description])
  );

  const threadsForRouting = needsRouting.map(({ id, thread, initiatives: inits }) => {
    const msgs = thread._cachedMsgs || thread.getMessages();
    return {
      thread_id:             id,
      subject:               thread.getFirstMessageSubject(),
      snippet:               msgs[msgs.length - 1].getPlainBody()
                               .replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').substring(0, 200),
      candidate_initiatives: inits
    };
  });

  const prompt =
    'Route each email thread to exactly one initiative based on its content.\n\n' +
    'Initiatives:\n' +
    Object.entries(initiativeDescriptions).map(([n, d]) => '- ' + n + ': ' + d).join('\n') + '\n\n' +
    'Threads:\n' + JSON.stringify(threadsForRouting, null, 2) + '\n\n' +
    'For each thread choose only from its candidate_initiatives. Pick the most specific match.\n' +
    'JSON only: {"routing":{"threadId":"InitiativeName"}}';

  try {
    const resp   = callClaude(prompt, model, 300);
    const result = JSON.parse(resp);
    Object.entries(result.routing || {}).forEach(([id, initiative]) => {
      routingDecisions[id] = initiative;
    });
  } catch (e) {
    Logger.log('Routing call failed: ' + e.message + ' — fallback to alphabetical');
  }

  needsRouting.forEach(({ id, initiatives: inits }) => {
    if (!routingDecisions[id]) routingDecisions[id] = inits.sort()[0];
  });

  Logger.log('Routing decisions: ' + JSON.stringify(routingDecisions));
  return routingDecisions;
}

// ── Per-Initiative Sync ──────────────────────────────────────

function syncInitiative(name, cfg, threads, lastSync) {
  const props = PropertiesService.getScriptProperties();
  const tz    = Session.getScriptTimeZone();
  const nowTs = Utilities.formatDate(new Date(), tz, 'dd MMM yyyy HH:mm');

  const ss    = SpreadsheetApp.openById(cfg.sheetId);
  const sheet = ss.getSheetByName(cfg.sheetTab);

  if (!sheet) {
    Logger.log(name + ': tab "' + cfg.sheetTab + '" not found — skipping');
    return { newCount: 0, updatedCount: 0, openRows: [], riskCounts: { high: 0, medium: 0, low: 0 }, error: 'Sheet tab not found' };
  }

  const { openRows, threadIdMap } = loadOpenRows(sheet, cfg);

  // Skip threads already claimed by another initiative
  const validThreads = threads.filter(thread => {
    const stored  = props.getProperty('claimed_' + thread.getId());
    const claimed = stored ? stored.split('|')[0] : null;
    return !claimed || claimed === name;
  });

  const isFirstSync = props.getProperty('first_sync_complete_' + name) !== 'true';
  const model       = isFirstSync ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001';
  const maxMsgs     = isFirstSync ? 8 : 3;
  const maxChars    = isFirstSync ? 1500 : 450;

  const threadData = validThreads.map(thread =>
    buildThreadContext(thread, cfg, lastSync, maxMsgs, maxChars, tz, threadIdMap)
  );

  let analysisResult = { thread_results: [], stale_updates: [] };
  if (threadData.length > 0 || openRows.some(r => r.days_since_last_update >= 14)) {
    analysisResult = batchAnalyze(name, threadData, openRows, cfg, isFirstSync, model);
  }

  const { newCount, updatedCount } = applyResults(sheet, cfg, analysisResult, threadData, openRows, threadIdMap, nowTs);

  lockClaimedThreads(analysisResult.thread_results, name);
  props.setProperty('last_sync_' + name, new Date().toISOString());

  if (isFirstSync) {
    props.setProperty('first_sync_complete_' + name, 'true');
    Logger.log(name + ': first sync done — switching to Haiku for future runs');
  }

  // Reload fresh rows after writes — used for master sheet counts + briefing reuse
  const { openRows: freshRows, riskCounts } = loadOpenRows(sheet, cfg);

  Logger.log(name + ': new=' + newCount + ', updated=' + updatedCount +
    ', HIGH=' + riskCounts.high + ', MED=' + riskCounts.medium + ', LOW=' + riskCounts.low +
    ', model=' + model);
  return { newCount, updatedCount, openRows: freshRows, riskCounts };
}

// ── Thread Context Builder ───────────────────────────────────

function buildThreadContext(thread, cfg, lastSync, maxMsgs, maxChars, tz, threadIdMap) {
  // Reuse cached messages from collectAllThreads — no extra API call
  const msgs    = thread._cachedMsgs || thread.getMessages();
  const lastMsg = msgs[msgs.length - 1];
  const id      = thread.getId();
  const subject = thread.getFirstMessageSubject()
    .replace(/^(Re:|Fwd:|FW:|RE:|AW:|Rv:)\s*/gi, '').trim();
  const dateStr = Utilities.formatDate(lastMsg.getDate(), tz, 'dd MMM yyyy');

  const newMsgs  = msgs.filter(m => m.getDate() > lastSync).slice(-maxMsgs);
  const perMsg   = Math.floor(maxChars / Math.max(newMsgs.length, 1));
  const messages = newMsgs.map(m => {
    const from = m.getFrom().replace(/<[^>]+>/, '').trim();
    const body = m.getPlainBody()
      .replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').substring(0, perMsg).trim();
    return from + ': ' + body;
  }).join(' || ');

  const lastVendorMsg   = msgs.slice().reverse().find(m =>
    cfg.vendorDomains.some(d => extractDomain(m.getFrom()).includes(d))
  );
  const lastInternalMsg = msgs.slice().reverse().find(m =>
    extractDomain(m.getFrom()).includes(USER_DOMAIN)
  );

  const daysSinceVendor   = lastVendorMsg
    ? Math.round((Date.now() - lastVendorMsg.getDate().getTime()) / 86400000) : 999;
  const daysSinceInternal = lastInternalMsg
    ? Math.round((Date.now() - lastInternalMsg.getDate().getTime()) / 86400000) : 999;

  return {
    thread_id:                 id,
    subject,
    date_str:                  dateStr,
    messages,
    days_since_vendor_reply:   daysSinceVendor,
    days_since_internal_reply: daysSinceInternal,
    sender_domain:             extractDomain(lastMsg.getFrom()),
    already_tracked:           !!(threadIdMap[id]),
    existing_row_idx:          threadIdMap[id] || null
  };
}

// ── Load Open Rows ───────────────────────────────────────────

function loadOpenRows(sheet, cfg) {
  const lastRow     = sheet.getLastRow();
  const openRows    = [];
  const threadIdMap = {};
  const riskCounts  = { high: 0, medium: 0, low: 0 };

  if (lastRow < 2) return { openRows, threadIdMap, riskCounts };

  const data        = sheet.getRange(2, 1, lastRow - 1, cfg.totalCols + 1).getValues();
  // Pre-fetch all Source column formulas in one call — avoids one getFormula() API call per row
  const allFormulas = sheet.getRange(2, cfg.sourceCol, lastRow - 1, 1).getFormulas();

  data.forEach((row, idx) => {
    const task   = String(row[0] || '').trim();
    const status = String(row[cfg.statusCol - 1] || '').toLowerCase();

    const sourceCell = (allFormulas[idx] && allFormulas[idx][0]) ||
                       String(row[cfg.sourceCol - 1] || '');
    const idFromUrl  = sourceCell.match(/\/mail\/u\/0\/#all\/([^"'\)]+)/);
    const idFromText = sourceCell.match(/Gmail:(\S+?)\s*[\(\n]/);
    const threadId   = (idFromUrl && idFromUrl[1]) || (idFromText && idFromText[1]);
    if (threadId) threadIdMap[threadId] = idx + 2;

    const isDone = ['done', 'closed', 'cancelled'].includes(status);
    if (!isDone && task) {
      const risk         = String(row[cfg.riskCol - 1] || '').toUpperCase();
      const lastUpdVal   = row[cfg.totalCols];
      const lastUpdDate  = lastUpdVal ? new Date(lastUpdVal) : null;
      const daysSinceUpd = lastUpdDate && !isNaN(lastUpdDate)
        ? Math.round((Date.now() - lastUpdDate.getTime()) / 86400000) : 999;

      // Count open-row risks for master sheet
      if (risk === 'HIGH')        riskCounts.high++;
      else if (risk === 'MEDIUM') riskCounts.medium++;
      else if (risk === 'LOW')    riskCounts.low++;

      openRows.push({
        row_index:              idx + 2,
        raw_row:                row,        // full row array — enables single-call batch updates
        task,
        status:                 row[cfg.statusCol - 1],
        risk_score:             parseFloat(row[cfg.riskScoreCol - 1]) || null,
        risk:                   String(row[cfg.riskCol - 1] || ''),
        eta_date:               String(row[3] || '-'),
        update:                 String(row[cfg.updateCol - 1] || ''),
        commitment:             String(row[cfg.commitCol - 1] || ''),
        action_pending_on:      String(row[cfg.actionCol - 1] || ''),
        days_since_last_update: daysSinceUpd
      });
    }
  });

  return { openRows, threadIdMap, riskCounts };
}

// ── Claude Call 2: Batch Analyze ────────────────────────────

function batchAnalyze(initiativeName, threadData, openRows, cfg, isFirstSync, model) {
  const CHUNK_SIZE = 10;
  const combined   = { thread_results: [], stale_updates: [] };

  for (let i = 0; i < Math.max(threadData.length, 1); i += CHUNK_SIZE) {
    const chunk     = threadData.slice(i, i + CHUNK_SIZE);
    const staleRows = i === 0 ? openRows.filter(r => r.days_since_last_update >= 14) : [];

    if (i > 0) Utilities.sleep(1500);  // pause between chunks to avoid rate limits

    const result = batchAnalyzeChunk(initiativeName, chunk, openRows, staleRows, cfg, isFirstSync, model);
    combined.thread_results.push(...(result.thread_results || []));
    if (i === 0) combined.stale_updates = result.stale_updates || [];
  }

  return combined;
}

function batchAnalyzeChunk(initiativeName, threadData, openRows, staleRows, cfg, isFirstSync, model) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');

  const fallback = {
    thread_results: threadData.map(t => ({
      thread_id: t.thread_id, action: t.already_tracked ? 'update' : 'new',
      matched_task: '', task: t.subject, category: 'Unknown', spoc: 'Unknown',
      eta_date: '-', status: 'Open', update: t.messages.substring(0, 120),
      commitment: '', risk_score: 2.00, risk: 'TBD',
      action_pending_on: t.sender_domain, is_resolved: false
    })),
    stale_updates: []
  };
  if (!apiKey) return fallback;

  let deadlineCtx = 'No initiative deadline.';
  if (cfg.initiativeDeadline) {
    const daysTo = Math.round((new Date(cfg.initiativeDeadline) - new Date()) / 86400000);
    deadlineCtx  = 'Initiative deadline: ' + cfg.initiativeDeadline +
      ' (' + (daysTo > 0 ? daysTo + 'd away' : Math.abs(daysTo) + 'd overdue') + ')';
  }

  const today       = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd MMM yyyy');
  const teamContext = cfg.teamContext || 'No team context provided.';

  const prompt =
    'You are a PM risk analyst reviewing external vendor email threads.\n\n' +
    'Initiative: ' + initiativeName + '\n' +
    'Description: ' + cfg.description + '\n' +
    'Deadline: ' + deadlineCtx + '\n' +
    'Today: ' + today + '\n' +
    'Internal team context: ' + teamContext + '\n\n' +
    'EXISTING OPEN TASKS (match semantically — do not create duplicates):\n' +
    openRows.slice(0, 40).map((r, i) => (i + 1) + '. ' + r.task).join('\n') + '\n\n' +
    (threadData.length > 0
      ? 'EMAIL THREADS TO ANALYZE:\n' + JSON.stringify(threadData.map(t => ({
          thread_id:                 t.thread_id,
          subject:                   t.subject,
          messages:                  t.messages,
          days_since_vendor_reply:   t.days_since_vendor_reply,
          days_since_internal_reply: t.days_since_internal_reply,
          sender_domain:             t.sender_domain,
          already_tracked:           t.already_tracked
        })), null, 2) + '\n\n'
      : '') +
    (staleRows.length > 0
      ? 'OPEN ROWS TO CHECK FOR STALENESS (no recent email activity):\n' +
        JSON.stringify(staleRows.map(r => ({
          task: r.task, risk_score: r.risk_score, risk: r.risk,
          eta_date: r.eta_date, days_since_last_update: r.days_since_last_update
        })), null, 2) + '\n\n'
      : '') +
    'INSTRUCTIONS FOR thread_results:\n' +
    '  action: "new" | "update" (already_tracked=true) | "skip"\n' +
    '  Skip when: semantic duplicate of existing tracked task, purely informational thread,\n' +
    '    automated notification, newsletter, read receipt, or FYI-only with no open actions.\n' +
    '  matched_task: exact existing task name if action=skip or update, else ""\n' +
    '  task: clean subject (strip Re:/Fwd: prefixes)\n' +
    '  category: Ops/Feature/Compliance/Tech/Process/Testing/Certification/Risk/CX/Regulatory/Migration/Data/Escalation\n' +
    '  spoc: first name of internal owner based on team context above (match by topic area), else "Unknown"\n' +
    '  eta_date: specific delivery date if mentioned (DD MMM), else "-"\n' +
    '  status: Open/In Progress/In Review/On Hold/Done (only if clearly resolved)\n' +
    '  update: one clear sentence — current state + what needs to happen next\n' +
    '  commitment: explicit promise with deadline (e.g. "Vendor to share spec by 28 Mar"), else ""\n' +
    '  risk_score: (0.30×time)+(0.25×eta)+(0.25×tone)+(0.20×velocity). Each dimension 1-3.\n' +
    '    time: 1=vendor replied <48h ago, 2=2-5d, 3=>5d.\n' +
    '      If days_since_internal_reply < days_since_vendor_reply, reduce time score by 1 (we replied recently).\n' +
    '    eta: 1=>14d away, 2=3-14d, 3=<3d or overdue.\n' +
    '      Deadline modifier: +0.2(8-30d to deadline), +0.4(<7d), +0.6(overdue). Cap 3.00.\n' +
    '    tone: 1=clear commitments and next steps, 2=vague or non-committal, 3=deflecting/no reply\n' +
    '    velocity: 1=active back-and-forth, 2=replies slowing, 3=one-sided/stalled\n' +
    '  risk: LOW(1.00-1.67) MEDIUM(1.67-2.33) HIGH(2.33-3.00)\n' +
    '  action_pending_on: "' + INTERNAL_TEAM_NAME + '" if vendor is waiting on you to act, else vendor short name\n' +
    '  is_resolved: true only if thread clearly signals closure/completion\n\n' +
    'INSTRUCTIONS FOR stale_updates (rows with days_since_last_update >= 14):\n' +
    '  Only include rows where status is not Done/Closed and the thread has gone silent.\n' +
    '  new_risk_score: current risk_score + 0.3, capped at 3.00\n' +
    '  new_risk: LOW/MEDIUM/HIGH based on new score\n' +
    '  reason: one sentence explaining the staleness\n\n' +
    'Respond with valid JSON only — no markdown:\n' +
    '{"thread_results":[{"thread_id":"...","action":"new","matched_task":"","task":"...","category":"Ops","spoc":"Alice","eta_date":"-","status":"Open","update":"...","commitment":"","risk_score":2.00,"risk":"MEDIUM","action_pending_on":"Vendor One","is_resolved":false}],' +
    '"stale_updates":[{"task":"...","new_risk_score":2.30,"new_risk":"MEDIUM","reason":"..."}]}';

  try {
    const maxTokens = isFirstSync ? 4000 : 1500;
    const raw       = callClaude(prompt, model, maxTokens);
    Logger.log(initiativeName + ' batchAnalyze raw: ' + raw.substring(0, 300));
    return JSON.parse(raw);
  } catch (e) {
    Logger.log('batchAnalyze failed: ' + e.message);
    return fallback;
  }
}

// ── Apply Results to Sheet ───────────────────────────────────

function applyResults(sheet, cfg, analysisResult, threadData, openRows, threadIdMap, nowTs) {
  let newCount = 0, updatedCount = 0;
  const newRows    = [];
  const rowUpdates = [];  // { rowIdx, values[] } collected for batch write

  const threadMeta = {};
  threadData.forEach(t => { threadMeta[t.thread_id] = t; });

  // Build task→openRow map from already-loaded data — avoids re-reading sheet for stale updates
  const taskToOpenRow = {};
  openRows.forEach(r => { taskToOpenRow[r.task.trim()] = r; });

  (analysisResult.thread_results || []).forEach(result => {
    if (result.action === 'skip') {
      Logger.log('Skip: "' + result.task + '" → ' + (result.matched_task || 'no-action'));
      return;
    }

    const meta   = threadMeta[result.thread_id] || {};
    const rowIdx = threadIdMap[result.thread_id];

    if (result.action === 'update' && rowIdx) {
      const openRow = openRows.find(r => r.row_index === rowIdx);

      if (openRow && openRow.raw_row) {
        // Clone raw_row and apply updates — writes entire row in one API call
        const r      = [...openRow.raw_row];
        const isDone = ['done', 'closed', 'cancelled'].includes(String(r[cfg.statusCol - 1]).toLowerCase());

        r[cfg.updateCol - 1] = result.update || r[cfg.updateCol - 1];
        r[cfg.totalCols]     = nowTs;  // col M (index 12)

        if (!isDone) {
          if (result.commitment)               r[cfg.commitCol - 1]    = result.commitment;
          if (result.risk_score !== undefined) r[cfg.riskScoreCol - 1] = result.risk_score;
          if (result.risk)                     r[cfg.riskCol - 1]      = result.risk;
          if (result.action_pending_on)        r[cfg.actionCol - 1]    = result.action_pending_on;
          if (result.is_resolved)              r[cfg.statusCol - 1]    = 'Done';
        }
        rowUpdates.push({ rowIdx, values: r });

      } else {
        // Row not in openRows (already closed) — minimal fallback write
        sheet.getRange(rowIdx, cfg.updateCol).setValue(result.update || '');
        sheet.getRange(rowIdx, cfg.totalCols + 1).setValue(nowTs);
      }
      updatedCount++;

    } else {
      newRows.push({
        data: [
          result.task                              || meta.subject || '',
          result.category                          || 'Unknown',
          result.spoc                              || 'Unknown',
          result.eta_date                          || '-',
          result.is_resolved ? 'Done' : (result.status || 'Open'),
          result.update                            || '',
          result.commitment                        || '',
          result.risk_score !== undefined ? result.risk_score : '',
          result.risk                              || 'TBD',
          meta.sender_domain                       || '',
          '',    // Source — HYPERLINK formula set below
          result.action_pending_on                 || '',
          nowTs
        ],
        thread_id: result.thread_id
      });
    }
  });

  // Batch-write all updates: one getRange().setValues() per row (vs 6-7 individual setValue calls)
  rowUpdates.forEach(u => {
    sheet.getRange(u.rowIdx, 1, 1, u.values.length).setValues([u.values]);
  });

  // Batch-append new rows in one call
  if (newRows.length > 0) {
    const startRow = findLastDataRow(sheet) + 1;
    sheet.getRange(startRow, 1, newRows.length, newRows[0].data.length)
         .setValues(newRows.map(r => r.data));

    // Batch-set all HYPERLINK formulas in one call (not one per row)
    const formulas = newRows.map(r =>
      r.thread_id
        ? ['=HYPERLINK("https://mail.google.com/mail/u/0/#all/' + r.thread_id + '","Open thread")']
        : ['']
    );
    sheet.getRange(startRow, cfg.sourceCol, newRows.length, 1).setFormulas(formulas);

    newCount = newRows.length;
    Logger.log('Appended ' + newCount + ' new rows');
  }

  // Apply stale updates using pre-built map — no sheet re-read needed
  (analysisResult.stale_updates || []).forEach(su => {
    const openRow = taskToOpenRow[su.task.trim()];
    if (openRow && openRow.raw_row) {
      const r = [...openRow.raw_row];
      r[cfg.riskScoreCol - 1] = su.new_risk_score;
      r[cfg.riskCol - 1]      = su.new_risk;
      sheet.getRange(openRow.row_index, 1, 1, r.length).setValues([r]);
      Logger.log('Stale bump: "' + su.task + '" → ' + su.new_risk_score + ' ' + su.new_risk);
    }
  });

  return { newCount, updatedCount };
}

// ── Thread ID Lock ───────────────────────────────────────────

function lockClaimedThreads(threadResults, initiativeName) {
  const props = PropertiesService.getScriptProperties();
  const ts    = Date.now();
  (threadResults || []).forEach(result => {
    if (result.action !== 'skip' && result.thread_id) {
      // Store as "initiativeName|timestamp" — timestamp enables TTL cleanup
      props.setProperty('claimed_' + result.thread_id, initiativeName + '|' + ts);
    }
  });
}

// ── Snapshot (Delta Tracking) ────────────────────────────────

// Rewrites entire _Snapshot tab in one batch
function updateAllSnapshots(initiatives, runResults) {
  try {
    const master    = SpreadsheetApp.openById(MASTER_SHEET_ID);
    let snapSheet   = master.getSheetByName('_Snapshot');
    if (!snapSheet) {
      snapSheet = master.insertSheet('_Snapshot');
      snapSheet.hideSheet();
    }

    const rows = [['Initiative', 'Task', 'Risk', 'Status', 'Action Pending On']];
    Object.keys(initiatives).forEach(name => {
      const openRows = (runResults[name] && runResults[name].openRows) || [];
      openRows.forEach(r => rows.push([name, r.task, r.risk || '', r.status || '', r.action_pending_on || '']));
    });

    snapSheet.clearContents();
    if (rows.length > 1) snapSheet.getRange(1, 1, rows.length, 5).setValues(rows);
  } catch (e) {
    Logger.log('updateAllSnapshots failed: ' + e.message);
  }
}

// Read all snapshots in one sheet call, return grouped by initiative name
function readAllSnapshots() {
  try {
    const master    = SpreadsheetApp.openById(MASTER_SHEET_ID);
    const snapSheet = master.getSheetByName('_Snapshot');
    if (!snapSheet) return {};

    const grouped = {};
    snapSheet.getDataRange().getValues().slice(1).forEach(r => {
      if (!r[0]) return;
      if (!grouped[r[0]]) grouped[r[0]] = [];
      grouped[r[0]].push({ task: r[1], risk: r[2], status: r[3], action_pending_on: r[4] });
    });
    return grouped;
  } catch (e) {
    Logger.log('readAllSnapshots failed: ' + e.message);
    return {};
  }
}

function computeDeltas(currentOpenRows, snapshotRows) {
  const snapMap    = {};
  snapshotRows.forEach(r => { snapMap[r.task] = r; });
  const currentMap = {};
  currentOpenRows.forEach(r => { currentMap[r.task] = r; });
  const riskOrder  = { 'LOW': 1, 'MEDIUM': 2, 'HIGH': 3, 'TBD': 0 };

  return {
    new: currentOpenRows.filter(r => !snapMap[r.task]).map(r => r.task),
    risk_escalated: currentOpenRows
      .filter(r => snapMap[r.task] && (riskOrder[r.risk] || 0) > (riskOrder[snapMap[r.task].risk] || 0))
      .map(r => r.task + ': ' + snapMap[r.task].risk + ' → ' + r.risk),
    risk_improved: currentOpenRows
      .filter(r => snapMap[r.task] && (riskOrder[r.risk] || 0) < (riskOrder[snapMap[r.task].risk] || 0))
      .map(r => r.task + ': ' + snapMap[r.task].risk + ' → ' + r.risk),
    closed: snapshotRows.filter(r => !currentMap[r.task]).map(r => r.task)
  };
}

// ── Claude Call 3: Morning Briefing ─────────────────────────

function generateAndSendBriefing(runResults) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  const tz     = Session.getScriptTimeZone();
  const today  = Utilities.formatDate(new Date(), tz, 'dd MMM yyyy');

  // Single read of _Snapshot for all initiatives
  const allSnapshots = readAllSnapshots();

  const initiativeData = [];
  let   totalOpen      = 0;
  let   totalHigh      = 0;

  Object.entries(getInitiatives()).forEach(([name, cfg]) => {
    try {
      // Reuse pre-loaded openRows from runResults — no sheet re-open needed
      const openRows = (runResults[name] && runResults[name].openRows) || [];
      const snapshot = allSnapshots[name] || [];
      const deltas   = computeDeltas(openRows, snapshot);

      totalOpen += openRows.length;
      totalHigh += openRows.filter(r => r.risk === 'HIGH').length;

      initiativeData.push({
        name,
        deadline:   cfg.initiativeDeadline || null,
        url:        'https://docs.google.com/spreadsheets/d/' + cfg.sheetId,
        open_items: openRows.map(r => ({
          task:                   r.task,
          risk:                   r.risk,
          risk_score:             r.risk_score,
          status:                 r.status,
          action_pending_on:      r.action_pending_on,
          eta_date:               r.eta_date,
          update:                 r.update,
          commitment:             r.commitment,
          days_since_last_update: r.days_since_last_update
        })),
        delta: deltas
      });
    } catch (e) {
      Logger.log('Briefing data error for ' + name + ': ' + e.message);
    }
  });

  // Send whenever there are open items — this is a daily briefing, always useful if work exists
  const shouldSend = totalOpen > 0;

  if (!shouldSend) {
    Logger.log('Briefing: nothing to report — email skipped');
    return;
  }

  if (!apiKey) {
    sendBasicEmail(initiativeData, today, totalOpen);
    return;
  }

  const prompt =
    'You are a chief of staff preparing a morning briefing.\n\n' +
    'Today: ' + today + '\n' +
    'Initiative tracker data:\n' +
    JSON.stringify(initiativeData, null, 2) + '\n\n' +
    'Generate a structured briefing:\n\n' +
    '1. focus_items: up to 5 items that need personal action today, ranked by urgency.\n' +
    '   Include ONLY items where action_pending_on="' + INTERNAL_TEAM_NAME + '", HIGH risk with ETA within 7 days,\n' +
    '   overdue commitments, or items stale 14+ days with no response.\n' +
    '   Be specific — use exact task names, vendor names, days elapsed, and dates.\n' +
    '   suggested_action must be a concrete next step, not vague phrases like "follow up".\n' +
    '   Each: {priority, initiative, task, reason, suggested_action}\n\n' +
    '2. initiative_summaries: one per initiative.\n' +
    '   Each: {name, open_count, high_count, headline (punchy 1-sentence status — be direct),\n' +
    '     delta_summary (what changed vs yesterday — new items, risks escalated, items closed),\n' +
    '     has_action (bool: true if your team action needed)}\n\n' +
    'JSON only — no markdown:\n' +
    '{"focus_items":[{"priority":1,"initiative":"...","task":"...","reason":"...","suggested_action":"..."}],' +
    '"initiative_summaries":[{"name":"...","open_count":0,"high_count":0,"headline":"...","delta_summary":"...","has_action":true}]}';

  try {
    const raw      = callClaude(prompt, 'claude-sonnet-4-6', 2000);
    const briefing = JSON.parse(raw);

    const focusCount = (briefing.focus_items || []).length;
    const html       = buildBriefingEmail(briefing, initiativeData, today, totalOpen, totalHigh);
    const subjectTag = focusCount > 0
      ? focusCount + ' action' + (focusCount > 1 ? 's' : '') + ' needed'
      : (totalHigh > 0 ? totalHigh + ' HIGH risk' : totalOpen + ' open');

    GmailApp.sendEmail(
      SUMMARY_EMAIL,
      'Progress Tracker ' + today + ' | ' + subjectTag + ' | ' + totalOpen + ' open',
      'View in an HTML-capable email client.',
      { htmlBody: html }
    );
    Logger.log('Briefing email sent: ' + focusCount + ' focus items, ' + totalOpen + ' open');
  } catch (e) {
    Logger.log('Briefing Claude call failed: ' + e.message + ' — sending basic email');
    sendBasicEmail(initiativeData, today, totalOpen);
  }
}

function buildBriefingEmail(briefing, initiativeData, today, totalOpen, totalHigh) {
  const focusItems = briefing.focus_items || [];
  const summaries  = briefing.initiative_summaries || [];

  let html = '<div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;color:#222;font-size:14px;line-height:1.5">';

  // ── Header ──
  html += '<div style="background:#1a3a5c;color:#fff;padding:16px 20px;border-radius:4px 4px 0 0">';
  html += '<div style="font-size:18px;font-weight:bold">Progress Tracker — ' + today + '</div>';
  html += '<div style="font-size:13px;opacity:0.8;margin-top:3px">' +
    totalOpen + ' open &nbsp;·&nbsp; HIGH: ' + totalHigh + '</div>';
  html += '</div>';

  // ── Action Required ──
  if (focusItems.length > 0) {
    html += '<div style="background:#fff4f4;border:1px solid #f5c6c6;border-top:none;padding:16px 20px">';
    html += '<div style="color:#cc0000;font-weight:700;font-size:15px;margin-bottom:12px">';
    html += 'ACTION REQUIRED TODAY (' + focusItems.length + ')';
    html += '</div>';
    html += '<ol style="padding-left:20px;margin:0">';
    focusItems.forEach(item => {
      html += '<li style="margin-bottom:16px;padding-left:2px">';
      html += '<div style="font-weight:700;color:#1a3a5c">' + escapeHtml(item.task) + '</div>';
      html += '<div style="color:#777;font-size:12px;margin-bottom:2px">' + escapeHtml(item.initiative) + '</div>';
      html += '<div style="color:#555;font-size:13px">' + escapeHtml(item.reason) + '</div>';
      html += '<div style="color:#cc0000;font-size:13px;font-weight:600;margin-top:3px">→ ' + escapeHtml(item.suggested_action) + '</div>';
      html += '</li>';
    });
    html += '</ol></div>';
  } else {
    html += '<div style="background:#f0f7f0;border:1px solid #c3dfc3;border-top:none;padding:10px 20px;color:#274e13;font-size:13px">';
    html += 'No items require your action today.</div>';
  }

  // ── Initiative Snapshot ──
  html += '<div style="padding:16px 20px;border:1px solid #e0e0e0;border-top:none">';
  html += '<div style="font-weight:700;color:#1a3a5c;margin-bottom:12px">INITIATIVE SNAPSHOT</div>';

  summaries.forEach(summary => {
    const iData       = initiativeData.find(i => i.name === summary.name) || {};
    const url         = iData.url || '#';
    const items       = iData.open_items || [];
    const highCnt     = items.filter(r => r.risk === 'HIGH').length;
    const medCnt      = items.filter(r => r.risk === 'MEDIUM').length;
    const lowCnt      = items.filter(r => r.risk === 'LOW').length;
    const yourItems   = items.filter(r => r.action_pending_on === INTERNAL_TEAM_NAME);
    const border      = highCnt > 0 ? '#cc0000' : summary.has_action ? '#ca8a04' : '#1a3a5c';

    html += '<div style="margin-bottom:12px;padding:10px 14px;border-left:4px solid ' + border + ';background:#fafafa">';
    html += '<div><b><a href="' + url + '" style="color:#1a3a5c;text-decoration:none">' + escapeHtml(summary.name) + '</a></b> ';
    html += '<span style="font-size:12px;color:#666">';
    html += (summary.open_count || 0) + ' open &nbsp; ';
    html += '<b style="color:#cc0000">HIGH: ' + highCnt + '</b> &nbsp; ';
    html += '<b style="color:#ca8a04">MED: ' + medCnt + '</b> &nbsp; ';
    html += '<b style="color:#274e13">LOW: ' + lowCnt + '</b>';
    html += '</span></div>';
    html += '<div style="color:#444;font-size:13px;margin-top:4px">' + escapeHtml(summary.headline || '') + '</div>';
    if (summary.delta_summary) {
      html += '<div style="color:#777;font-size:12px;margin-top:2px">' + escapeHtml(summary.delta_summary) + '</div>';
    }
    if (yourItems.length > 0) {
      html += '<div style="color:#b45309;font-size:12px;font-weight:600;margin-top:4px">' + INTERNAL_TEAM_NAME + ' to act: ' +
        yourItems.slice(0, 3).map(r => escapeHtml(r.task)).join(', ') +
        (yourItems.length > 3 ? ' +' + (yourItems.length - 3) + ' more' : '') + '</div>';
    }
    html += '</div>';
  });

  html += '</div>';

  // ── Footer ──
  html += '<div style="padding:8px 20px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 4px 4px;background:#f5f5f5">';
  html += '<span style="color:#aaa;font-size:11px">PM Tracker · Claude Sonnet · ' + today;
  html += ' · <a href="https://docs.google.com/spreadsheets/d/' + MASTER_SHEET_ID + '" style="color:#aaa">Master Sheet</a></span>';
  html += '</div></div>';

  return html;
}

function sendBasicEmail(initiativeData, today, totalOpen) {
  let html = '<div style="font-family:Arial,sans-serif;max-width:680px">';
  html += '<h2 style="color:#1a3a5c">Progress Tracker — ' + today + ' (' + totalOpen + ' open)</h2>';
  initiativeData.forEach(i => {
    const highCnt = (i.open_items || []).filter(r => r.risk === 'HIGH').length;
    const medCnt  = (i.open_items || []).filter(r => r.risk === 'MEDIUM').length;
    html += '<h3><a href="' + i.url + '" style="color:#1a3a5c">' + escapeHtml(i.name) + '</a></h3>';
    html += '<p>' + (i.open_items || []).length + ' open &nbsp;|&nbsp; HIGH: ' + highCnt + ' &nbsp;|&nbsp; MED: ' + medCnt + '</p>';
  });
  html += '</div>';
  GmailApp.sendEmail(
    SUMMARY_EMAIL,
    'Progress Tracker ' + today + ' | ' + totalOpen + ' open',
    'View in HTML client.',
    { htmlBody: html }
  );
}

// ── Master Sheet Update ──────────────────────────────────────

// Single-pass update for all initiatives — one master sheet open, one data read
function updateAllMasterSheetEntries(initiatives, runResults, timestamp) {
  try {
    const master  = SpreadsheetApp.openById(MASTER_SHEET_ID);
    const sheet   = master.getSheetByName('Initiatives') || master.getSheets()[0];
    const data    = sheet.getDataRange().getValues();
    const headers = data[0].map(String);

    const sheetIdCol = headers.indexOf('Sheet ID') + 1;
    if (sheetIdCol === 0) { Logger.log('Master sheet: "Sheet ID" column not found'); return; }

    const ensureCol = label => {
      let col = headers.indexOf(label) + 1;
      if (col === 0) {
        col = headers.length + 1;
        sheet.getRange(1, col).setValue(label)
             .setBackground('#1a3a5c').setFontColor('#ffffff').setFontWeight('bold');
        sheet.setColumnWidth(col, 120);
        headers.push(label);
      }
      return col;
    };

    const syncCol = ensureCol('Last Sync (Script)');
    const newCol  = ensureCol('New (Last Run)');
    const updCol  = ensureCol('Updated (Last Run)');

    const highCol = headers.indexOf('Open HIGH')   + 1;
    const medCol  = headers.indexOf('Open MEDIUM') + 1;
    const lowCol  = headers.indexOf('Open LOW')    + 1;

    const resultBySheetId = {};
    Object.entries(initiatives).forEach(([name, cfg]) => {
      resultBySheetId[cfg.sheetId] = { name, ...runResults[name] };
    });

    const foundSheetIds = new Set();
    const rowBatch      = [];  // collect all row writes, then flush in one pass

    for (let i = 1; i < data.length; i++) {
      const rowSheetId = String(data[i][sheetIdCol - 1]);
      const result     = resultBySheetId[rowSheetId];
      if (!result) continue;

      foundSheetIds.add(rowSheetId);
      const rc       = result.riskCounts || {};
      const maxCol   = Math.max(syncCol, newCol, updCol,
                         highCol > 0 ? highCol : 0, medCol > 0 ? medCol : 0, lowCol > 0 ? lowCol : 0);
      const rowClone = data[i].slice();
      while (rowClone.length < maxCol) rowClone.push('');

      rowClone[syncCol - 1] = timestamp;
      if (result.newCount     !== undefined) rowClone[newCol - 1]  = result.newCount;
      if (result.updatedCount !== undefined) rowClone[updCol - 1]  = result.updatedCount;
      if (highCol > 0) rowClone[highCol - 1] = rc.high   || 0;
      if (medCol  > 0) rowClone[medCol  - 1] = rc.medium || 0;
      if (lowCol  > 0) rowClone[lowCol  - 1] = rc.low    || 0;

      rowBatch.push({ rowIdx: i + 1, values: rowClone });
      Logger.log('Master: ' + result.name + ' → ' + timestamp +
        ' | HIGH=' + (rc.high || 0) + ' MED=' + (rc.medium || 0) + ' LOW=' + (rc.low || 0));
    }

    // Write all matched rows — one setValues() per row instead of 6 setValue() calls per row
    rowBatch.forEach(u => sheet.getRange(u.rowIdx, 1, 1, u.values.length).setValues([u.values]));

    // Auto-create master rows for any new initiatives not yet in the master sheet
    Object.entries(resultBySheetId).forEach(([sheetId, result]) => {
      if (foundSheetIds.has(sheetId)) return;

      const cfg     = initiatives[result.name] || {};
      const rc      = result.riskCounts || {};
      const newRowI = sheet.getLastRow() + 1;
      const rowData = Array(Math.max(headers.length, 12)).fill('');

      const set = (label, value) => {
        const col = headers.indexOf(label);
        if (col >= 0) rowData[col] = value;
      };
      set('Initiative',         result.name);
      set('Tracker Link',       'https://docs.google.com/spreadsheets/d/' + sheetId);
      set('Vendors',            (cfg.vendorNames || []).join(', '));
      set('Open HIGH',          rc.high   || 0);
      set('Open MEDIUM',        rc.medium || 0);
      set('Open LOW',           rc.low    || 0);
      set('Sheet ID',           sheetId);
      set('Last Sync (Script)', timestamp);
      set('New (Last Run)',     result.newCount     || 0);
      set('Updated (Last Run)', result.updatedCount || 0);

      sheet.getRange(newRowI, 1, 1, rowData.length).setValues([rowData]);
      Logger.log('Master: auto-created row for new initiative ' + result.name);
    });

  } catch (e) {
    Logger.log('Master sheet update failed: ' + e.message);
  }
}

// ── Formatting ───────────────────────────────────────────────

function formatAllSheets() {
  Object.entries(getInitiatives()).forEach(([name, cfg]) => {
    const ss    = SpreadsheetApp.openById(cfg.sheetId);
    const sheet = ss.getSheetByName(cfg.sheetTab);
    if (!sheet) { Logger.log(name + ': tab not found'); return; }
    formatSheet(sheet, cfg);
    Logger.log('Formatted: ' + name);
  });
}

function formatSheet(sheet, cfg) {
  const lastRow = Math.max(sheet.getLastRow(), 2);
  const allCols = cfg.totalCols + 1;

  const headers = [
    'Task', 'Category', INTERNAL_TEAM_NAME + ' SPOC', 'ETA', 'Status',
    'Latest Update', 'Commitments', 'Risk Score', 'Risk',
    'Vendor', 'Source', 'Action Pending On', 'Last Updated'
  ];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, allCols)
       .setBackground('#1a3a5c').setFontColor('#ffffff')
       .setFontWeight('bold').setFontSize(11)
       .setVerticalAlignment('middle').setHorizontalAlignment('center')
       .setWrap(true);
  sheet.setRowHeight(1, 42);
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(1);

  const widths = [280, 120, 110, 90, 110, 300, 200, 65, 80, 100, 120, 120, 140];
  widths.forEach((w, i) => sheet.setColumnWidth(i + 1, w));

  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, allCols)
         .setFontSize(10).setVerticalAlignment('top').setWrap(true);
    sheet.getRange(2, cfg.riskScoreCol, lastRow - 1, 1)
         .setNumberFormat('0.00').setHorizontalAlignment('right');
  }

  sheet.getRange(1, 1, lastRow, allCols)
       .setBorder(true, true, true, true, true, true, '#d0d0d0',
                  SpreadsheetApp.BorderStyle.SOLID);

  // All dropdowns and conditional format rules in a single consolidated call
  setupDropdownsAndFormatting(sheet, cfg, lastRow);
}

// Returns the row number of the last row that has actual content in column A.
// More reliable than sheet.getLastRow() which can be inflated by ghost formatting ranges.
function findLastDataRow(sheet) {
  const maxRow = sheet.getLastRow();
  if (maxRow < 2) return 1;
  const colA = sheet.getRange(2, 1, maxRow - 1, 1).getValues();
  let lastDataRow = 1;
  for (let i = 0; i < colA.length; i++) {
    if (String(colA[i][0]).trim()) lastDataRow = i + 2;
  }
  return lastDataRow;
}

// All dropdowns and conditional format rules set in one setConditionalFormatRules() call
function setupDropdownsAndFormatting(sheet, cfg, lastRow) {
  lastRow = Math.max(lastRow || sheet.getLastRow(), 2);

  const riskRange   = sheet.getRange(2, cfg.riskCol,   lastRow - 1, 1);
  const statusRange = sheet.getRange(2, cfg.statusCol, lastRow - 1, 1);
  const actionRange = sheet.getRange(2, cfg.actionCol, lastRow - 1, 1);

  riskRange.setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(['HIGH', 'MEDIUM', 'LOW', 'TBD'], true)
      .setAllowInvalid(false).build()
  );
  statusRange.setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(['Open', 'In Progress', 'In Review', 'On Hold', 'Done', 'Closed'], true)
      .setAllowInvalid(true).build()
  );
  actionRange.setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList([INTERNAL_TEAM_NAME, ...(cfg.vendorNames || []), 'Unknown'], true)
      .setAllowInvalid(true).build()
  );

  sheet.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('HIGH').setFontColor('#cc0000').setBold(true).setRanges([riskRange]).build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('MEDIUM').setFontColor('#ca8a04').setBold(true).setRanges([riskRange]).build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('LOW').setFontColor('#274e13').setBold(true).setRanges([riskRange]).build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('TBD').setFontColor('#888888').setRanges([riskRange]).build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('Open').setFontColor('#cc0000').setBold(true).setRanges([statusRange]).build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('In Progress').setFontColor('#1565c0').setBold(true).setRanges([statusRange]).build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('In Review').setFontColor('#6d28d9').setBold(true).setRanges([statusRange]).build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('On Hold').setFontColor('#e65100').setRanges([statusRange]).build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('Done').setFontColor('#274e13').setBold(true).setRanges([statusRange]).build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('Closed').setFontColor('#274e13').setBold(true).setRanges([statusRange]).build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo(INTERNAL_TEAM_NAME).setFontColor('#b45309').setBold(true).setRanges([actionRange]).build(),
  ]);
}

// ── Shared Claude API Helper ─────────────────────────────────

function callClaude(prompt, model, maxTokens, attempt) {
  attempt = attempt || 1;
  const apiKey = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    headers: {
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json'
    },
    payload: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages:   [{ role: 'user', content: prompt }]
    }),
    muteHttpExceptions: true
  });

  const statusCode = response.getResponseCode();
  const parsed     = JSON.parse(response.getContentText());

  // Exponential backoff on rate limit (429) or overload (529): 6s, 12s, 24s
  if ((statusCode === 429 || statusCode === 529) && attempt < 4) {
    const waitMs = Math.pow(2, attempt) * 3000;
    Logger.log('Claude ' + statusCode + ' — retry ' + attempt + ' in ' + (waitMs / 1000) + 's');
    Utilities.sleep(waitMs);
    return callClaude(prompt, model, maxTokens, attempt + 1);
  }

  if (parsed.error) throw new Error('Claude API: ' + parsed.error.message);

  let text = parsed.content[0].text.trim();
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
  return text;
}

// ── Utilities ────────────────────────────────────────────────

function extractDomain(fromHeader) {
  const match = (fromHeader || '').match(/@([\w.-]+)/);
  return match ? match[1].toLowerCase() : '';
}

function extractEmail(fromHeader) {
  const angleMatch = (fromHeader || '').match(/<([^>]+)>/);
  return angleMatch ? angleMatch[1].toLowerCase() : fromHeader.toLowerCase().trim();
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

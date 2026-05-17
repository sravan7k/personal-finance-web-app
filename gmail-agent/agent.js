require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const db = require('../db');
const { listEmailIdsForAccount, fetchEmailsByIds } = require('./gmail');
const { classifyEmailsBatch } = require('./classifier');
const { getLastRunTime, setLastRunTime, isEmailProcessed, markEmailProcessed } = require('./state');

function loadConfig() {
  const configPath = path.join(__dirname, 'config.json');
  if (!fs.existsSync(configPath)) {
    throw new Error('gmail-agent/config.json not found. Copy config.example.json and fill in your accounts.');
  }
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

function startOfCurrentMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function isLikelyTransaction(email, filters) {
  const { senderDomains = [], subjectKeywords = [] } = filters;
  const from = email.from.toLowerCase();
  const subject = email.subject.toLowerCase();
  return senderDomains.some((d) => from.includes(d.toLowerCase())) ||
         subjectKeywords.some((k) => subject.includes(k.toLowerCase()));
}

async function runAgent() {
  console.log(`[Gmail Agent] ─── Run started at ${new Date().toISOString()}`);

  let config;
  try {
    config = loadConfig();
  } catch (err) {
    console.error(`[Gmail Agent] Config error: ${err.message}`);
    return;
  }

  const accounts = config.accounts ?? [];
  if (accounts.length === 0) {
    console.warn('[Gmail Agent] No accounts configured in gmail-agent/config.json');
    return;
  }

  const filters = config.filters ?? {};

  const lastRunTime = getLastRunTime();
  let afterDate;

  if (!lastRunTime) {
    afterDate = startOfCurrentMonth();
    console.log(`[Gmail Agent] First run — scanning from ${afterDate.toDateString()} (start of month)`);
  } else {
    // Go back 1 day from last run as a safety buffer; processed_emails prevents duplicates
    afterDate = new Date(new Date(lastRunTime).getTime() - 86_400_000);
    console.log(`[Gmail Agent] Incremental run — scanning since ${afterDate.toDateString()}`);
  }

  const insertTx = db.prepare(
    'INSERT INTO transactions (type, amount, category, date, note, recurring) VALUES (?, ?, ?, ?, ?, 0)'
  );

  let totalNew = 0;
  let totalAlreadyProcessed = 0;
  let totalFilteredOut = 0;
  let totalTransactions = 0;

  for (const account of accounts) {
    console.log(`[Gmail Agent] Processing account: ${account}`);

    // Step 1: Get all matching email IDs from Gmail (cheap list call)
    let allIds;
    try {
      allIds = await listEmailIdsForAccount(account, afterDate, filters);
    } catch (err) {
      console.error(`[Gmail Agent] Failed to list emails for ${account}: ${err.message}`);
      continue;
    }

    // Step 2: Filter out already-processed IDs before fetching full details
    const newIds = allIds.filter((id) => !isEmailProcessed(id));
    totalAlreadyProcessed += allIds.length - newIds.length;
    console.log(
      `[Gmail Agent] ${allIds.length} emails found, ${newIds.length} new, ` +
      `${allIds.length - newIds.length} already processed`
    );

    if (newIds.length === 0) continue;

    // Step 3: Fetch full details only for new emails
    let emails;
    try {
      emails = await fetchEmailsByIds(account, newIds);
    } catch (err) {
      console.error(`[Gmail Agent] Failed to fetch email details for ${account}: ${err.message}`);
      continue;
    }

    // Step 4: Client-side filter — confirm sender domain or subject keyword match
    const toClassify = [];
    for (const email of emails) {
      if (isLikelyTransaction(email, filters)) {
        toClassify.push(email);
      } else {
        markEmailProcessed(email.id);
        totalFilteredOut++;
      }
    }

    console.log(
      `[Gmail Agent] ${toClassify.length} emails to classify, ` +
      `${totalFilteredOut} skipped by client-side filter`
    );

    if (toClassify.length === 0) continue;

    // Step 5: Batch classify with Claude (50% cheaper than sequential calls)
    let results;
    try {
      results = await classifyEmailsBatch(toClassify);
    } catch (err) {
      console.error(`[Gmail Agent] Batch classification failed: ${err.message}`);
      continue;
    }

    // Step 6: Insert transactions and mark all classified emails as processed
    for (const email of toClassify) {
      const result = results.get(email.id) ?? { isTransaction: false };

      if (result.isTransaction && typeof result.amount === 'number' && result.amount > 0) {
        const type = result.type === 'income' ? 'income' : 'expense';
        const date = result.date || new Date().toISOString().slice(0, 10);
        const note = result.note || email.subject;
        const category = result.category || (type === 'income' ? 'Other Income' : 'Other Expense');

        insertTx.run(type, result.amount, category, date, note);
        totalTransactions++;

        console.log(
          `[Gmail Agent]   ✓ ${type.toUpperCase()} ₹${result.amount} · ${category} · ${date} — ${note}`
        );
      }

      markEmailProcessed(email.id);
      totalNew++;
    }
  }

  setLastRunTime(new Date().toISOString());

  console.log(
    `[Gmail Agent] ─── Done: ${totalNew} emails classified, ${totalTransactions} transactions added, ` +
    `${totalFilteredOut} skipped by client filter, ${totalAlreadyProcessed} already processed`
  );
}

module.exports = { runAgent };

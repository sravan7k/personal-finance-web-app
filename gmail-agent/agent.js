require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const db = require('../db');
const { fetchEmailsForAccount } = require('./gmail');
const { classifyEmail } = require('./classifier');
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

// Small delay between Claude API calls to avoid bursting rate limits
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

  let totalEmails = 0;
  let totalSkipped = 0;
  let totalTransactions = 0;

  for (const account of accounts) {
    console.log(`[Gmail Agent] Processing account: ${account}`);

    let emails;
    try {
      emails = await fetchEmailsForAccount(account, afterDate);
    } catch (err) {
      console.error(`[Gmail Agent] Failed to fetch emails for ${account}: ${err.message}`);
      continue;
    }

    console.log(`[Gmail Agent] ${emails.length} emails fetched for ${account}`);

    for (const email of emails) {
      if (isEmailProcessed(email.id)) {
        totalSkipped++;
        continue;
      }

      totalEmails++;
      let result;

      try {
        result = await classifyEmail(email);
        await sleep(4000); // 15 RPM free tier limit → 1 request per 4 seconds
      } catch (err) {
        console.error(`[Gmail Agent] Classifier error on email ${email.id}: ${err.message}`);
        markEmailProcessed(email.id); // skip on next run so one bad email doesn't block forever
        continue;
      }

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
    }
  }

  setLastRunTime(new Date().toISOString());

  console.log(
    `[Gmail Agent] ─── Done: ${totalEmails} emails classified, ${totalTransactions} transactions added, ${totalSkipped} already-processed skipped`
  );
}

module.exports = { runAgent };

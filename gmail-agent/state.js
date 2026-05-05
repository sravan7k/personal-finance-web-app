const db = require('../db');

function getLastRunTime() {
  const row = db.prepare("SELECT value FROM agent_state WHERE key = 'last_run_at'").get();
  return row ? row.value : null;
}

function setLastRunTime(isoString) {
  db.prepare(
    "INSERT OR REPLACE INTO agent_state (key, value) VALUES ('last_run_at', ?)"
  ).run(isoString);
}

function isEmailProcessed(emailId) {
  return !!db.prepare('SELECT 1 FROM processed_emails WHERE email_id = ?').get(emailId);
}

function markEmailProcessed(emailId) {
  db.prepare(
    'INSERT OR IGNORE INTO processed_emails (email_id) VALUES (?)'
  ).run(emailId);
}

module.exports = { getLastRunTime, setLastRunTime, isEmailProcessed, markEmailProcessed };

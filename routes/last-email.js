const express = require('express');
const path = require('path');
const fs = require('fs');
const { getLastEmail } = require('../gmail-agent/last-mail-agent');

const router = express.Router();

function loadAccounts() {
  const configPath = path.join(__dirname, '..', 'gmail-agent', 'config.json');
  if (!fs.existsSync(configPath)) return [];
  return JSON.parse(fs.readFileSync(configPath, 'utf8')).accounts ?? [];
}

router.get('/', async (req, res) => {
  const accounts = loadAccounts();
  if (accounts.length === 0) {
    return res.json({ subject: null, from: null, date: null });
  }

  try {
    const email = await getLastEmail(accounts[0]);
    if (!email) return res.json({ subject: null, from: null, date: null });
    res.json({ subject: email.subject, from: email.from, date: email.date });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

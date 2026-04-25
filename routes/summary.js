const express = require('express');
const db = require('../db');
const router = express.Router();

router.get('/', (_req, res) => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  const monthPrefix = `${year}-${month}`;

  const totalIncome   = db.prepare("SELECT COALESCE(SUM(amount),0) AS v FROM transactions WHERE type='income'").get().v;
  const totalExpenses = db.prepare("SELECT COALESCE(SUM(amount),0) AS v FROM transactions WHERE type='expense'").get().v;

  const monthlyIncome   = db.prepare("SELECT COALESCE(SUM(amount),0) AS v FROM transactions WHERE type='income'  AND date LIKE ?").get(`${monthPrefix}%`).v;
  const monthlyExpenses = db.prepare("SELECT COALESCE(SUM(amount),0) AS v FROM transactions WHERE type='expense' AND date LIKE ?").get(`${monthPrefix}%`).v;

  res.json({
    totalBalance:    totalIncome - totalExpenses,
    monthlyIncome,
    monthlyExpenses,
  });
});

module.exports = router;

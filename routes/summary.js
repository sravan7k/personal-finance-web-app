const express = require('express');
const db = require('../db');
const router = express.Router();

router.get('/', (req, res) => {
  const now = new Date();
  const year  = parseInt(req.query.year)  || now.getFullYear();
  const month = String(parseInt(req.query.month) || (now.getMonth() + 1)).padStart(2, '0');
  const monthPrefix = `${year}-${month}`;

  const income   = db.prepare("SELECT COALESCE(SUM(amount),0) AS v FROM transactions WHERE type='income'  AND date LIKE ?").get(`${monthPrefix}%`).v;
  const expenses = db.prepare("SELECT COALESCE(SUM(amount),0) AS v FROM transactions WHERE type='expense' AND date LIKE ?").get(`${monthPrefix}%`).v;

  res.json({
    totalBalance:    income - expenses,
    monthlyIncome:   income,
    monthlyExpenses: expenses,
  });
});

module.exports = router;

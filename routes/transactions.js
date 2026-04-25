const express = require('express');
const db = require('../db');
const router = express.Router();

// GET all transactions (newest first)
router.get('/', (_req, res) => {
  const rows = db.prepare(
    'SELECT * FROM transactions ORDER BY date DESC, created_at DESC'
  ).all();
  res.json(rows);
});

// POST new transaction
router.post('/', (req, res) => {
  const { type, amount, category, date, note = '', recurring = false } = req.body;

  if (!['income', 'expense'].includes(type)) {
    return res.status(400).json({ error: 'Invalid type' });
  }
  if (!amount || isNaN(amount) || Number(amount) <= 0) {
    return res.status(400).json({ error: 'Amount must be a positive number' });
  }
  if (!category) return res.status(400).json({ error: 'Category is required' });
  if (!date)     return res.status(400).json({ error: 'Date is required' });

  const result = db.prepare(
    'INSERT INTO transactions (type, amount, category, date, note, recurring) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(type, Number(amount), category, date, note, recurring ? 1 : 0);

  res.status(201).json({
    id: Number(result.lastInsertRowid),
    type,
    amount: Number(amount),
    category,
    date,
    note,
    recurring: recurring ? 1 : 0,
  });
});

// DELETE a transaction
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const result = db.prepare('DELETE FROM transactions WHERE id = ?').run(Number(id));
  if (result.changes === 0) return res.status(404).json({ error: 'Transaction not found' });
  res.json({ success: true });
});

module.exports = router;

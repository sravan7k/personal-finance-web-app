const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const db = new DatabaseSync(path.join(__dirname, 'finance.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS transactions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    type       TEXT    NOT NULL CHECK(type IN ('income', 'expense')),
    amount     REAL    NOT NULL CHECK(amount > 0),
    category   TEXT    NOT NULL,
    date       TEXT    NOT NULL,
    note       TEXT    DEFAULT '',
    recurring  INTEGER NOT NULL DEFAULT 0,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  )
`);

module.exports = db;

# Product Requirements Document
## Personal Finance Web Application

**Version:** 1.2  
**Date:** 2026-04-25  
**Status:** Draft

---

## 1. Overview

A simple, lightweight personal finance web application that allows a user to track their income and expenses, view a monthly summary dashboard, and manage their transaction history — all without requiring a login or backend server.

---

## 2. Goals

- Provide a frictionless way to log and review personal transactions
- Give a clear snapshot of financial health at a glance
- Keep the app fast and accessible with zero setup (no install, no account)

## 3. Non-Goals

- User authentication or multi-user support
- Charts, graphs, or analytics
- Budget planning or savings goals
- Editing transactions (delete + re-add is sufficient for v1)
- Filtering or searching transactions
- Data export / import
- Mobile app (web only)

---

## 4. Target User

An individual who wants a simple, no-friction tool to record daily income and expenses and keep track of their financial balance without complex setup.

---

## 5. Features

### 5.1 Dashboard

Displayed at the top of the page. Updates automatically as transactions are added or deleted.

| Metric | Description |
|---|---|
| **Total Balance** | Running net balance across all transactions (all-time income minus all-time expenses) as of the latest transaction date |
| **Income This Month** | Sum of all income transactions in the current calendar month |
| **Expenses This Month** | Sum of all expense transactions in the current calendar month |

**Behavior:**
- "This month" is determined by the current calendar month (e.g., April 2026)
- Total Balance reflects the cumulative balance across all recorded time, not just the current month
- All three values update in real time whenever a transaction is added or deleted

---

### 5.2 Add Transaction

A form that allows the user to log a new income or expense entry.

**Fields:**

| Field | Type | Required | Notes |
|---|---|---|---|
| Type | Toggle / Radio | Yes | "Income" or "Expense" |
| Amount | Number | Yes | Positive value; decimals allowed (2 decimal places) |
| Category | Dropdown | Yes | See category list in §5.5 |
| Date | Date picker | Yes | Defaults to today |
| Note | Text input | No | Short description, max 100 characters |
| Recurring | Checkbox | No | Marks the transaction as a recurring entry |

**Behavior:**
- Submitting the form appends the transaction to the list and updates the dashboard instantly
- Form resets to defaults after a successful submission
- Amount must be greater than 0; invalid inputs show an inline error

---

### 5.3 Transaction List

A reverse-chronological list of all recorded transactions.

**Each entry displays:**
- Transaction type indicator (income = green, expense = red)
- Amount (formatted as currency)
- Category
- Date
- Note (if provided)
- Recurring badge (shown only if the transaction is marked recurring)
- Delete button

**Behavior:**
- Newest transactions appear at the top
- Clicking delete opens a confirmation dialog ("Are you sure you want to delete this transaction?") with Confirm and Cancel actions; the transaction is only removed if the user confirms
- Deleting a transaction updates the dashboard immediately
- If no transactions exist, a friendly empty-state message is shown

---

### 5.4 Data Persistence

- All data is stored in a local SQLite database file (`finance.db`)
- Data persists across page refreshes and server restarts
- Data is stored in a local `finance.db` SQLite file on disk
- Data is scoped to the local machine (no sync or cloud backup)
- No data is sent to any external server

---

### 5.5 Recurring Transactions

A transaction can be flagged as recurring at the time of entry via a checkbox in the Add Transaction form.

**Behavior:**
- Recurring is a metadata label only — it does not automatically create future transactions
- Recurring transactions are visually distinguished in the list with a "Recurring" badge
- They participate in dashboard calculations exactly like non-recurring transactions
- A recurring transaction can be deleted the same way as any other transaction (with confirmation)

**Rationale:** Keeps the feature simple while giving users a way to visually identify fixed regular costs (e.g., rent, salary) without introducing scheduling complexity.

---

### 5.6 Categories

A fixed list used for both income and expense transactions:

| Category |
|---|
| Salary |
| Food |
| Rent |
| Transport |
| Entertainment |
| Healthcare |
| Shopping |
| Other |

---

## 6. Technical Constraints

| Constraint | Decision |
|---|---|
| Frontend | Plain HTML, CSS, vanilla JavaScript — no frameworks |
| Backend | Node.js + Express — lightweight local REST API server |
| Database | SQLite (via `better-sqlite3`) — single `.db` file on disk |
| Deployment | Run locally; frontend served by the Node server |
| Browser support | Modern browsers (Chrome, Firefox, Safari, Edge) |
| Dependencies | Node.js runtime, `express`, `better-sqlite3` |

### Architecture

```
Browser (HTML/CSS/JS)
        │
        │  REST API (HTTP)
        ▼
Node.js + Express server (local)
        │
        │  SQL queries
        ▼
SQLite database (finance.db)
        ▲
        │  SQL tools (run_sql)
Claude Agent (future)
```

### Why SQLite + Node.js
- Data stays on the user's machine (personal finance data is sensitive)
- Works fully offline
- The `.db` file is portable and trivial to back up
- Agents can use a `run_sql` tool to read and write with full SQL support
- Compatible with Claude's MCP SQLite server for agent integration

---

## 7. UI / UX Guidelines

- Clean, card-based layout
- Dashboard cards displayed in a horizontal row at the top
- Transaction form below the dashboard
- Transaction list below the form
- Responsive layout that works on desktop and tablet
- Minimal color palette: neutral background, green for income, red for expense

---

## 8. Out of Scope for v1 (Future Considerations)

- Month/category filters on the transaction list
- Pie chart or bar chart breakdowns
- CSV export
- Auto-scheduling of recurring transactions (v1 treats recurring as a label only)
- AI agent integration (planned for v2 — agents will interact with SQLite via SQL tools)
- Dark mode
- PWA / offline support

---

## 9. Success Criteria

- User can add an income or expense transaction in under 10 seconds
- Dashboard values are always accurate and reflect the current state of all transactions
- Data survives a page refresh
- App works with zero installation or configuration

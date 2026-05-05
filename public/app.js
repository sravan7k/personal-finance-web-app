const form          = document.getElementById('transaction-form');
const amountError   = document.getElementById('amount-error');
const listEl        = document.getElementById('transaction-list');
const overlay       = document.getElementById('confirm-overlay');
const confirmBtn    = document.getElementById('confirm-delete-btn');
const cancelBtn     = document.getElementById('cancel-delete-btn');

let pendingDeleteId = null;

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(amount) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount);
}

function fmtDate(dateStr) {
  const [y, m, d] = dateStr.split('-');
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

async function refreshDashboard() {
  const data = await fetch('/api/summary').then(r => r.json());

  const balanceEl = document.getElementById('total-balance');
  balanceEl.textContent = fmt(data.totalBalance);
  balanceEl.classList.toggle('negative', data.totalBalance < 0);

  document.getElementById('monthly-income').textContent   = fmt(data.monthlyIncome);
  document.getElementById('monthly-expenses').textContent = fmt(data.monthlyExpenses);
}

// ── Transaction List ──────────────────────────────────────────────────────────

function renderTransactions(transactions) {
  if (transactions.length === 0) {
    listEl.innerHTML = '<p class="empty-state">No transactions yet. Add one above.</p>';
    return;
  }

  listEl.innerHTML = transactions.map(tx => `
    <div class="transaction-item">
      <div class="tx-indicator ${tx.type}"></div>
      <div class="tx-body">
        <div class="tx-top">
          <span class="tx-category">${tx.category}</span>
          ${tx.recurring ? '<span class="badge-recurring">Recurring</span>' : ''}
          ${tx.note ? `<span class="tx-note">${tx.note}</span>` : ''}
        </div>
        <div class="tx-date">${fmtDate(tx.date)}</div>
      </div>
      <span class="tx-amount ${tx.type}">${tx.type === 'income' ? '+' : '-'}${fmt(tx.amount)}</span>
      <button class="btn-delete" data-id="${tx.id}" title="Delete">&#x2715;</button>
    </div>
  `).join('');
}

async function refreshList() {
  const transactions = await fetch('/api/transactions').then(r => r.json());
  renderTransactions(transactions);
}

async function refreshLatestEmail() {
  try {
    const data = await fetch('/api/last-email').then(r => r.json());
    document.getElementById('latest-email-subject').textContent = data.subject || '(no subject)';
    document.getElementById('latest-email-meta').textContent = data.from
      ? `${data.from}  ·  ${data.date}`
      : '';
  } catch {
    document.getElementById('latest-email-subject').textContent = 'Unable to load';
  }
}

async function refreshAll() {
  await Promise.all([refreshDashboard(), refreshList(), refreshLatestEmail()]);
}

// ── Add Transaction ───────────────────────────────────────────────────────────

document.getElementById('date').valueAsDate = new Date();

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  amountError.textContent = '';

  const data = {
    type:      form.querySelector('input[name="type"]:checked').value,
    amount:    parseFloat(form.amount.value),
    category:  form.category.value,
    date:      form.date.value,
    note:      form.note.value.trim(),
    recurring: form.recurring.checked,
  };

  if (!data.amount || data.amount <= 0) {
    amountError.textContent = 'Enter a valid amount greater than 0.';
    return;
  }

  const res = await fetch('/api/transactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const err = await res.json();
    amountError.textContent = err.error || 'Something went wrong.';
    return;
  }

  form.reset();
  document.getElementById('date').valueAsDate = new Date();
  await refreshAll();
});

// ── Delete with Confirm Dialog ────────────────────────────────────────────────

listEl.addEventListener('click', (e) => {
  const btn = e.target.closest('.btn-delete');
  if (!btn) return;
  pendingDeleteId = btn.dataset.id;
  overlay.classList.remove('hidden');
});

cancelBtn.addEventListener('click', () => {
  pendingDeleteId = null;
  overlay.classList.add('hidden');
});

overlay.addEventListener('click', (e) => {
  if (e.target === overlay) {
    pendingDeleteId = null;
    overlay.classList.add('hidden');
  }
});

confirmBtn.addEventListener('click', async () => {
  if (!pendingDeleteId) return;
  overlay.classList.add('hidden');

  await fetch(`/api/transactions/${pendingDeleteId}`, { method: 'DELETE' });
  pendingDeleteId = null;
  await refreshAll();
});

// ── Init ──────────────────────────────────────────────────────────────────────

refreshAll();

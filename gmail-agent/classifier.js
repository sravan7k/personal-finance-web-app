const Anthropic = require('@anthropic-ai/sdk');

const SYSTEM_PROMPT = `You are a financial transaction detector specialized in Indian financial emails (amounts in INR ₹).

Analyze each email and decide if it contains a financial transaction: payment confirmation, bank debit/credit, UPI transfer, credit card charge, salary credit, EMI deduction, bill payment, subscription charge, refund, or similar.

When a transaction is found, extract:
- type: "income" if money was received (salary, UPI received, refund, cashback, interest credited); "expense" if money was spent or debited (purchase, UPI sent, bill, EMI, subscription)
- amount: numeric INR amount only (no ₹ symbol, no commas)
- category: most specific category from the lists below
- date: transaction date as YYYY-MM-DD (use email date if not stated)
- note: concise description — merchant name, purpose, or sender/receiver

Income categories: Salary, Freelance, UPI Received, Bank Transfer, Investment Return, Refund, Cashback, Interest, Other Income
Expense categories: Food & Dining, Transport, Shopping, Bills & Utilities, UPI Sent, EMI, Subscription, Health, Entertainment, Education, Travel, Bank Charges, Other Expense

Rules:
- Ignore marketing emails, OTPs, newsletters, and alerts with no monetary value
- For range amounts (e.g. "up to ₹500") set isTransaction to false
- Respond with valid JSON only — no prose, no markdown. Schema:
  { "isTransaction": boolean, "type": "income"|"expense", "amount": number, "category": string, "date": "YYYY-MM-DD", "note": string }
- Omit fields other than isTransaction when isTransaction is false`;

const POLL_INTERVAL_MS = 10_000;
const POLL_TIMEOUT_MS = 30 * 60 * 1000;

let _client = null;

function client() {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set in environment');
    _client = new Anthropic.default({ apiKey });
  }
  return _client;
}

function formatEmailContent(email) {
  return [
    `From: ${email.from}`,
    `Subject: ${email.subject}`,
    `Date: ${email.date}`,
    '',
    email.body,
  ].join('\n');
}

function parseResult(text) {
  try {
    const clean = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    return JSON.parse(clean);
  } catch {
    return { isTransaction: false };
  }
}

async function classifyEmailsBatch(emails) {
  if (emails.length === 0) return new Map();

  const batch = await client().messages.batches.create({
    requests: emails.map((email) => ({
      custom_id: email.id,
      params: {
        model: 'claude-haiku-4-5',
        max_tokens: 300,
        system: [
          {
            type: 'text',
            text: SYSTEM_PROMPT,
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: [{ role: 'user', content: formatEmailContent(email) }],
      },
    })),
  });

  console.log(`[Gmail Agent] Batch ${batch.id} submitted (${emails.length} emails)`);

  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let status = batch;
  while (status.processing_status === 'in_progress') {
    if (Date.now() > deadline) throw new Error(`Batch ${batch.id} timed out after 30 minutes`);
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    status = await client().messages.batches.retrieve(batch.id);
    console.log(
      `[Gmail Agent] Batch ${batch.id}: ${status.request_counts.processing} processing, ` +
      `${status.request_counts.succeeded} succeeded, ${status.request_counts.errored} errored`
    );
  }

  const results = new Map();
  for await (const item of await client().messages.batches.results(batch.id)) {
    if (item.result.type === 'succeeded') {
      const text = item.result.message.content[0]?.type === 'text'
        ? item.result.message.content[0].text
        : '';
      results.set(item.custom_id, parseResult(text));
    } else {
      results.set(item.custom_id, { isTransaction: false });
    }
  }

  return results;
}

module.exports = { classifyEmailsBatch };

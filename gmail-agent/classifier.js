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

let _client = null;

function client() {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set in environment');
    _client = new Anthropic.default({ apiKey });
  }
  return _client;
}

async function classifyEmail(email) {
  const content = [
    `From: ${email.from}`,
    `Subject: ${email.subject}`,
    `Date: ${email.date}`,
    '',
    email.body,
  ].join('\n');

  const response = await client().messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 300,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' }, // cached across all 714 calls
      },
    ],
    messages: [{ role: 'user', content }],
  });

  const text = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '';

  try {
    return JSON.parse(text);
  } catch {
    return { isTransaction: false };
  }
}

module.exports = { classifyEmail };

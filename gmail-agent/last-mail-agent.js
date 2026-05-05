require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const { getAccountDir, SCOPES } = require('./gmail');

function loadConfig() {
  const configPath = path.join(__dirname, 'config.json');
  if (!fs.existsSync(configPath)) {
    throw new Error('gmail-agent/config.json not found. Copy config.example.json and fill in your accounts.');
  }
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

function buildAuth(email) {
  const accountDir = getAccountDir(email);
  const credPath = path.join(accountDir, 'credentials.json');
  const tokenPath = path.join(accountDir, 'token.json');

  if (!fs.existsSync(credPath)) {
    throw new Error(`credentials.json not found for ${email}. Run: node gmail-agent/setup.js ${email}`);
  }
  if (!fs.existsSync(tokenPath)) {
    throw new Error(`token.json not found for ${email}. Run: node gmail-agent/setup.js ${email}`);
  }

  const credentials = JSON.parse(fs.readFileSync(credPath, 'utf8'));
  const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;

  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris?.[0]);
  oAuth2Client.setCredentials(JSON.parse(fs.readFileSync(tokenPath, 'utf8')));

  oAuth2Client.on('tokens', (tokens) => {
    const existing = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
    fs.writeFileSync(tokenPath, JSON.stringify({ ...existing, ...tokens }, null, 2));
  });

  return oAuth2Client;
}

function stripHtml(html) {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractBody(payload) {
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64url').toString('utf8');
  }
  if (payload.mimeType === 'text/html' && payload.body?.data) {
    return stripHtml(Buffer.from(payload.body.data, 'base64url').toString('utf8'));
  }
  if (payload.parts) {
    let plain = '';
    let html = '';
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        plain = Buffer.from(part.body.data, 'base64url').toString('utf8');
      } else if (part.mimeType === 'text/html' && part.body?.data) {
        html = stripHtml(Buffer.from(part.body.data, 'base64url').toString('utf8'));
      } else if (part.parts) {
        const nested = extractBody(part);
        if (nested) plain = plain || nested;
      }
    }
    return plain || html;
  }
  return '';
}

async function getLastEmail(email) {
  const auth = buildAuth(email);
  const gmail = google.gmail({ version: 'v1', auth });

  // List only the single most recent message
  const listRes = await gmail.users.messages.list({
    userId: 'me',
    maxResults: 1,
  });

  const messages = listRes.data.messages || [];
  if (messages.length === 0) {
    return null;
  }

  const detail = await gmail.users.messages.get({
    userId: 'me',
    id: messages[0].id,
    format: 'full',
  });

  const msg = detail.data;
  const headers = msg.payload?.headers || [];
  const get = (name) => headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';

  return {
    id: msg.id,
    subject: get('Subject'),
    from: get('From'),
    to: get('To'),
    date: get('Date'),
    body: extractBody(msg.payload || {}),
  };
}

async function runLastMailAgent() {
  console.log(`[Last Mail Agent] ─── Run started at ${new Date().toISOString()}`);

  let config;
  try {
    config = loadConfig();
  } catch (err) {
    console.error(`[Last Mail Agent] Config error: ${err.message}`);
    return;
  }

  const accounts = config.accounts ?? [];
  if (accounts.length === 0) {
    console.warn('[Last Mail Agent] No accounts configured in gmail-agent/config.json');
    return;
  }

  for (const account of accounts) {
    console.log(`\n[Last Mail Agent] Account: ${account}`);

    let email;
    try {
      email = await getLastEmail(account);
    } catch (err) {
      console.error(`[Last Mail Agent] Failed to fetch last email for ${account}: ${err.message}`);
      continue;
    }

    if (!email) {
      console.log('[Last Mail Agent] No emails found.');
      continue;
    }

    console.log('─'.repeat(60));
    console.log(`  ID      : ${email.id}`);
    console.log(`  From    : ${email.from}`);
    console.log(`  To      : ${email.to}`);
    console.log(`  Date    : ${email.date}`);
    console.log(`  Subject : ${email.subject}`);
    console.log('  Body    :');
    console.log(email.body.slice(0, 1000) || '(empty)');
    console.log('─'.repeat(60));
  }

  console.log('\n[Last Mail Agent] ─── Done');
}

module.exports = { runLastMailAgent, getLastEmail };

if (require.main === module) {
  runLastMailAgent().catch((err) => {
    console.error('[Last Mail Agent] Fatal error:', err);
    process.exit(1);
  });
}

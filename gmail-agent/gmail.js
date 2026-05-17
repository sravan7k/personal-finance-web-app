const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

function getAccountDir(email) {
  return path.join(__dirname, 'accounts', email);
}

function buildAuth(email) {
  const accountDir = getAccountDir(email);
  const credPath = path.join(accountDir, 'credentials.json');
  const tokenPath = path.join(accountDir, 'token.json');

  if (!fs.existsSync(credPath)) {
    throw new Error(
      `credentials.json not found for ${email}. Run: node gmail-agent/setup.js ${email}`
    );
  }
  if (!fs.existsSync(tokenPath)) {
    throw new Error(
      `token.json not found for ${email}. Run: node gmail-agent/setup.js ${email}`
    );
  }

  const credentials = JSON.parse(fs.readFileSync(credPath, 'utf8'));
  const { client_secret, client_id, redirect_uris } =
    credentials.installed || credentials.web;

  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris?.[0]);
  oAuth2Client.setCredentials(JSON.parse(fs.readFileSync(tokenPath, 'utf8')));

  // Auto-refresh tokens when they expire
  oAuth2Client.on('tokens', (tokens) => {
    const existing = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
    fs.writeFileSync(tokenPath, JSON.stringify({ ...existing, ...tokens }, null, 2));
  });

  return oAuth2Client;
}

function gmailDateQuery(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}/${m}/${d}`;
}

// Strip HTML tags and collapse whitespace for plain-text extraction
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
  // Prefer plain text
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
        // Nested multipart
        const nested = extractBody(part);
        if (nested) plain = plain || nested;
      }
    }
    return plain || html;
  }

  return '';
}

function parseMessage(msg) {
  const headers = msg.payload?.headers || [];
  const get = (name) => headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';

  const body = extractBody(msg.payload || {});

  return {
    id: msg.id,
    subject: get('Subject'),
    from: get('From'),
    date: get('Date'),
    body: body.slice(0, 2500),
  };
}

function buildQuery(afterDate, filters = {}) {
  const { senderDomains = [], subjectKeywords = [] } = filters;

  const fromTerms = senderDomains.map((d) => `from:${d}`);
  const subjectTerms = subjectKeywords.map((k) => `subject:"${k}"`);
  const allTerms = [...fromTerms, ...subjectTerms];

  const filterClause = allTerms.length > 0 ? ` {${allTerms.join(' ')}}` : '';
  return `after:${gmailDateQuery(afterDate)}${filterClause}`;
}

const FETCH_CONCURRENCY = 10;
const FIELDS = 'id,payload(mimeType,headers,body/data,parts(mimeType,body/data,parts(mimeType,body/data,parts(mimeType,body/data))))';

async function fetchMessageDetails(gmailClient, ids) {
  const results = [];
  for (let i = 0; i < ids.length; i += FETCH_CONCURRENCY) {
    const chunk = ids.slice(i, i + FETCH_CONCURRENCY);
    const fetched = await Promise.all(
      chunk.map((id) =>
        gmailClient.users.messages.get({ userId: 'me', id, format: 'full', fields: FIELDS })
          .then((res) => parseMessage(res.data))
      )
    );
    results.push(...fetched);
  }
  return results;
}

async function listEmailIdsForAccount(email, afterDate, filters = {}) {
  const auth = buildAuth(email);
  const gmailClient = google.gmail({ version: 'v1', auth });

  const query = buildQuery(afterDate, filters);
  const ids = [];
  let pageToken;

  do {
    const res = await gmailClient.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 500,
      fields: 'messages/id,nextPageToken',
      ...(pageToken ? { pageToken } : {}),
    });

    (res.data.messages || []).forEach(({ id }) => ids.push(id));
    pageToken = res.data.nextPageToken;
  } while (pageToken);

  return ids;
}

async function fetchEmailsByIds(email, ids) {
  if (ids.length === 0) return [];
  const auth = buildAuth(email);
  const gmailClient = google.gmail({ version: 'v1', auth });
  return fetchMessageDetails(gmailClient, ids);
}

module.exports = { listEmailIdsForAccount, fetchEmailsByIds, buildQuery, getAccountDir, SCOPES };

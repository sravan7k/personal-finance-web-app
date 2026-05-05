/**
 * One-time setup: authenticates a Gmail account and saves its token.
 *
 * Usage:
 *   node gmail-agent/setup.js you@gmail.com
 *
 * Before running:
 *   1. Go to https://console.cloud.google.com/
 *   2. Create a project and enable the Gmail API
 *   3. Go to APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID
 *   4. Download credentials.json and place it at:
 *        gmail-agent/accounts/<your-email>/credentials.json
 *
 * Desktop app credentials: authorization code is pasted manually.
 * Web app credentials:     a local server on port 3001 captures the redirect automatically.
 *                          Add http://localhost:3001 to your OAuth client's Authorized redirect URIs.
 */

const { google } = require('googleapis');
const fs = require('fs');
const http = require('http');
const path = require('path');
const readline = require('readline');
const { getAccountDir, SCOPES } = require('./gmail');

const LOOPBACK_PORT = 3001;
const LOOPBACK_URI  = `http://localhost:${LOOPBACK_PORT}`;

async function captureCodeViaLoopback(authUrl) {
  console.log('\nOpen this URL in your browser to authorize Gmail access:\n');
  console.log('  ' + authUrl + '\n');
  console.log('After signing in, your browser will show "This page can\'t be found".');
  console.log('That\'s expected. Look at the browser address bar — the URL will look like:');
  console.log('  http://localhost:3001/?code=4/0AX...&scope=...\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const input = await new Promise((resolve) =>
    rl.question('Copy the full URL from the address bar and paste it here:\n> ', resolve)
  );
  rl.close();

  // Accept either the full URL or just the code value
  let code;
  try {
    const url = new URL(input.trim());
    code = url.searchParams.get('code');
  } catch {
    code = input.trim(); // user pasted just the code
  }

  if (!code) throw new Error('Could not extract authorization code from the pasted input.');
  return code;
}

async function captureCodeManually(authUrl) {
  console.log('\nOpen this URL in your browser to authorize Gmail access:\n');
  console.log('  ' + authUrl + '\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const code = await new Promise((resolve) =>
    rl.question('Paste the authorization code here: ', resolve)
  );
  rl.close();
  return code.trim();
}

async function setup(email) {
  if (!email) {
    console.error('Usage: node gmail-agent/setup.js <your-email@gmail.com>');
    process.exit(1);
  }

  const accountDir = getAccountDir(email);
  const credPath   = path.join(accountDir, 'credentials.json');
  const tokenPath  = path.join(accountDir, 'token.json');

  if (!fs.existsSync(credPath)) {
    console.error(`\nError: credentials.json not found at:\n  ${credPath}\n`);
    console.log('Steps to get it:');
    console.log('  1. https://console.cloud.google.com/ → select your project');
    console.log('  2. APIs & Services → Enable APIs → Gmail API');
    console.log('  3. Credentials → Create Credentials → OAuth 2.0 Client ID → Desktop app');
    console.log('  4. Download the JSON and save it to the path above');
    process.exit(1);
  }

  const credentials = JSON.parse(fs.readFileSync(credPath, 'utf8'));
  const isWebApp    = !!credentials.web;
  const { client_secret, client_id } = credentials.installed ?? credentials.web;
  const redirectUri = isWebApp ? LOOPBACK_URI : (credentials.installed?.redirect_uris?.[0] ?? 'urn:ietf:wg:oauth:2.0:oob');

  if (isWebApp) {
    console.log(`\nWeb app credential detected.`);
    console.log(`Make sure ${LOOPBACK_URI} is listed under Authorized redirect URIs for your OAuth client`);
    console.log('in Google Cloud Console → APIs & Services → Credentials.\n');
  }

  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirectUri);
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });

  const code = isWebApp
    ? await captureCodeViaLoopback(authUrl)
    : await captureCodeManually(authUrl);

  const { tokens } = await oAuth2Client.getToken(code);

  fs.mkdirSync(accountDir, { recursive: true });
  fs.writeFileSync(tokenPath, JSON.stringify(tokens, null, 2));

  console.log(`\nToken saved to:\n  ${tokenPath}`);
  console.log(`\nSetup complete! The agent will scan ${email} daily at 9 AM.`);
  console.log('To run it immediately: npm run gmail:run');
}

setup(process.argv[2]).catch((err) => {
  console.error('\nSetup failed:', err.message);
  process.exit(1);
});

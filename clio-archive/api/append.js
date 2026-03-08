// api/append.js — Vercel serverless function (Node.js runtime)
import crypto from 'crypto';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { rows } = req.body;
  if (!rows || !Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'No rows provided' });
  }

  const SHEET_ID     = process.env.VITE_SHEETS_ID;
  const CLIENT_EMAIL = process.env.SHEETS_CLIENT_EMAIL;
  const PRIVATE_KEY  = (process.env.SHEETS_PRIVATE_KEY || '').replace(/\\n/g, '\n');

  if (!SHEET_ID || !CLIENT_EMAIL || !PRIVATE_KEY) {
    return res.status(500).json({ error: `Missing credentials: ${!SHEET_ID?'SHEET_ID ':''} ${!CLIENT_EMAIL?'CLIENT_EMAIL ':''} ${!PRIVATE_KEY?'PRIVATE_KEY':''}` });
  }

  try {
    const token = await getAccessToken(CLIENT_EMAIL, PRIVATE_KEY);

    const range   = 'Artículos!A:J';
    const apiUrl  = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;

    const sheetsResp = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({ values: rows }),
    });

    if (!sheetsResp.ok) {
      const err = await sheetsResp.json();
      return res.status(500).json({ error: err.error?.message || 'Sheets API error' });
    }

    const result = await sheetsResp.json();
    return res.status(200).json({ ok: true, updatedRows: result.updates?.updatedRows });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function getAccessToken(clientEmail, privateKeyPem) {
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss:   clientEmail,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud:   'https://oauth2.googleapis.com/token',
    exp:   now + 3600,
    iat:   now,
  };

  const header  = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify(claim));
  const unsigned = `${header}.${payload}`;

  const sign = crypto.createSign('RSA-SHA256');
  sign.update(unsigned);
  sign.end();
  const sig = sign.sign(privateKeyPem, 'base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  const jwt = `${unsigned}.${sig}`;

  const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion:  jwt,
    }),
  });

  if (!tokenResp.ok) {
    const e = await tokenResp.json();
    throw new Error(e.error_description || 'Failed to get access token');
  }

  const { access_token } = await tokenResp.json();
  return access_token;
}

function b64url(str) {
  return Buffer.from(str).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

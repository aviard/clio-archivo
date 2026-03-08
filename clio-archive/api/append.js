// api/append.js — Vercel serverless function
// Receives rows from the Admin panel and appends them to Google Sheets.
// The service account credentials live here, server-side, never exposed to browsers.

export default async function handler(req, res) {
  // Only accept POST
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
    return res.status(500).json({ error: 'Google Sheets credentials not configured' });
  }

  try {
    // 1. Get an access token using the service account JWT
    const token = await getAccessToken(CLIENT_EMAIL, PRIVATE_KEY);

    // 2. Append the rows to the Sheet
    const range  = 'Artículos!A:J';
    const apiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;

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

// ── Minimal JWT / OAuth2 implementation for Google service accounts ───────────
// (no external dependencies needed — uses Web Crypto API available in Vercel edge)

async function getAccessToken(clientEmail, privateKeyPem) {
  const now  = Math.floor(Date.now() / 1000);
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

  const key = await importRSAKey(privateKeyPem);
  const sig = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    key,
    new TextEncoder().encode(unsigned)
  );

  const jwt = `${unsigned}.${b64urlBuf(sig)}`;

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
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function b64urlBuf(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function importRSAKey(pem) {
  const pemBody = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));
  return crypto.subtle.importKey(
    'pkcs8', der.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  );
}

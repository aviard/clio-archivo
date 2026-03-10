// Google Sheets integration
// Sheet tab: "Articles"
// Columns: A=year B=issue_no C=title D=author E=pages F=domain G=period H=tags I=new_tags J=pdf_url

const SHEET_ID = import.meta.env.VITE_SHEETS_ID;
const API_KEY  = import.meta.env.VITE_SHEETS_API_KEY;
const RANGE    = 'Artículos!A2:L';

export async function loadAllArticles() {
  if (!SHEET_ID || !API_KEY) return [];
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(RANGE)}?key=${API_KEY}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Error al leer Google Sheets (${resp.status})`);
  const data = await resp.json();
  return (data.values || []).map(r => ({
    year:     r[0] || '',
    no:       r[1] || '',
    title:    r[2] || '',
    author:   r[3] || '',
    pages:    r[4] || '',
    domain:   r[5] || '',
    period:   r[6] || '',
    tags:     r[7] ? r[7].split('|').map(t => t.trim()).filter(Boolean) : [],
    new_tags: r[8] ? r[8].split('|').map(t => t.trim()).filter(Boolean) : [],
    pdf_url:  r[9] || '',
    indice:   r[10] || '',
    resumen:  r[11] || '',
  }));
}

export async function loadCatalogedKeys() {
  const arts = await loadAllArticles();
  const keys = new Set();
  arts.forEach(a => {
    keys.add(`${a.year}-${a.no}`);  // e.g. "1946-74-75"
    keys.add(a.no);                  // e.g. "74-75" — fallback for issues.js mismatches
  });
  return keys;
}

export async function appendIssueArticles(issue, articles) {
  const rows = articles.map(a => [
    issue.year,
    issue.no,
    a.title    || '',
    a.author   || '',
    a.pages    || '',
    a.domain   || '',
    a.period   || '',
    (a.tags    || []).join(', '),
    (a.new_tags|| []).join(', '),
    issue.pdf,
    a.indice   || '',
    a.resumen  || '',
  ]);
  const resp = await fetch('/api/append', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rows }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error || `Error al guardar (${resp.status})`);
  }
  return resp.json();
}

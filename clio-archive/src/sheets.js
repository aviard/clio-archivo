// Google Sheets integration
// Columns: A=año B=número C=título D=autor E=páginas F=tema G=dominio H=período I=etiquetas J=etiquetas_nuevas K=pdf_url L=indice M=resumen

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
    year:     r[0]  || '',
    no:       r[1]  || '',
    title:    r[2]  || '',
    author:   r[3]  || '',
    pages:    r[4]  || '',
    domain:   r[5]  || '',   // F = Tema = dominio value
    period:   r[6]  || '',   // G = Dominio = periodo value
    tags:     r[7]  ? r[7].split(',').map(t => t.trim()).filter(Boolean) : [],  // H = Periodo = etiquetas
    new_tags: [],
    pdf_url:  r[9]  || '',   // J = Etiquetas Nuevas = pdf_url
    indice:   r[10] || '',
    resumen:  r[11] || '',
  }));
}

export async function loadCatalogedKeys() {
  const arts = await loadAllArticles();
  const keys = new Set();
  arts.forEach(a => {
    const y4 = a.year.slice(0, 4);
    keys.add(`${a.year}-${a.no}`);
    keys.add(`${y4}-${a.no}`);
    keys.add(a.no);
  });
  const size = new Set(arts.map(a => `${a.year}-${a.no}`)).size;
  return { has: k => keys.has(k), size };
}

export async function appendIssueArticles(issue, articles) {
  const rows = articles.map(a => [
    issue.year,
    issue.no,
    a.title    || '',
    a.author   || '',
    a.pages    || '',
    '',                          // tema — left blank
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

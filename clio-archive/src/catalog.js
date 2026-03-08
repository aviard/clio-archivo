import { DOMAINS, PERIODS, SEED_TAGS } from './taxonomy.js';

async function fetchPdfBase64(pdfUrl) {
  const proxy = `https://corsproxy.io/?${encodeURIComponent(pdfUrl)}`;
  const resp = await fetch(proxy);
  if (!resp.ok) throw new Error(`No se pudo obtener el PDF (HTTP ${resp.status})`);
  const blob = await resp.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function extractArticles(issue, pdfBase64) {
  const prompt = `Eres un bibliotecario académico especializado en historia dominicana y caribeña.
Estás catalogando la revista Clío (Academia Dominicana de la Historia), número ${issue.no}, año ${issue.year}.

Extrae TODOS los artículos, ensayos, documentos, discursos y trabajos publicados en este número.

Para cada artículo proporciona los siguientes campos:

1. "title" — título exacto tal como aparece
2. "author" — autor(es); usa "" si no aparece
3. "pages" — páginas; usa "" si no aparece

4. "domain" — UN solo dominio temático amplio:
${DOMAINS.map(d => `   • ${d}`).join('\n')}

5. "period" — el período histórico que el artículo ESTUDIA (no el año de publicación).
   IMPORTANTE: esto es el período que el artículo examina, no cuándo fue escrito.
   Un artículo de 1978 sobre milicias del siglo XVII debe llevar "Colonial".
${PERIODS.map(p => `   • ${p}`).join('\n')}

6. "tags" — entre 5 y 8 etiquetas específicas. Usa las de esta lista cuando apliquen,
   pero propón etiquetas nuevas si ninguna existente describe bien el tema:
${SEED_TAGS.map(t => `   • ${t}`).join('\n')}

7. "new_tags" — etiquetas que propones que NO están en la lista de arriba. Usa [] si ninguna.

Devuelve ÚNICAMENTE un array JSON válido. Sin texto, sin markdown.
Formato de cada objeto:
{"title":"...","author":"...","pages":"...","domain":"...","period":"...","tags":["..."],"new_tags":["..."]}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 6000,
      messages: [{
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
          { type: 'text', text: prompt },
        ],
      }],
    }),
  });

  const data = await response.json();
  if (data.error) throw new Error(data.error.message);
  const raw = data.content.map(c => c.text || '').join('').replace(/```json|```/g, '').trim();
  return JSON.parse(raw);
}

export async function catalogIssue(issue) {
  const base64   = await fetchPdfBase64(issue.pdf);
  const articles = await extractArticles(issue, base64);
  return articles;
}

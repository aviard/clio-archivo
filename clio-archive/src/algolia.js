// Algolia full-text search
// Searches the clio_articulos index directly from the browser
// Uses the Search-Only API key (safe to expose publicly)

const ALGOLIA_APP_ID    = 'ECDJVNXUVQ';
const ALGOLIA_SEARCH_KEY = '21be47dd83d18277bc0958e5d0b45d1a';
const ALGOLIA_INDEX     = 'clio_articulos';

const BASE_URL = `https://${ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/${ALGOLIA_INDEX}/query`;

export async function algoliaSearch(query, { domain = '', period = '', page = 0 } = {}) {
  if (!query || query.trim().length < 2) return { hits: [], nbHits: 0, nbPages: 0 };

  // Build optional filters
  const filters = [
    domain ? `dominio:"${domain}"` : '',
    period ? `periodo:"${period}"` : '',
  ].filter(Boolean).join(' AND ');

  const body = {
    query,
    hitsPerPage: 20,
    page,
    attributesToHighlight: ['titulo', 'autor', 'resumen', 'texto'],
    highlightPreTag: '<mark>',
    highlightPostTag: '</mark>',
    attributesToSnippet: ['texto:40', 'resumen:30'],
    ...(filters ? { filters } : {}),
  };

  const resp = await fetch(BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Algolia-Application-Id': ALGOLIA_APP_ID,
      'X-Algolia-API-Key': ALGOLIA_SEARCH_KEY,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) throw new Error(`Algolia error ${resp.status}`);
  return resp.json();
}

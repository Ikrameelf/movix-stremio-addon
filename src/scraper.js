const axios = require('axios');
const cheerio = require('cheerio');

// ============================================================
// AUTO URL RESOLVER
// Movix change souvent de domaine (ex: movix.tax -> movix.cx)
// Ce module suit les redirections HTTP automatiquement
// et met a jour l'URL en memoire sans redemarrer le container.
// ============================================================

const SEED_URLS = [
  'https://movix.zip'
];

let currentBaseURL = 'https://movix.zip';
let lastChecked = 0;
const CHECK_INTERVAL = 30 * 60 * 1000; // Verifier toutes les 30 minutes

/**
 * Suit les redirections HTTP d'une URL et retourne l'URL finale.
 * Movix redirige automatiquement vers son nouveau domaine.
 */
async function resolveURL(startUrl) {
  try {
    const res = await axios.get(startUrl, {
      headers: HEADERS,
      timeout: 10000,
      maxRedirects: 10,
      validateStatus: (s) => s < 500,
    });
    // L'URL finale apres toutes les redirections
    const finalURL = res.request?.res?.responseUrl || res.config?.url || startUrl;
    const parsed = new URL(finalURL);
    return `${parsed.protocol}//${parsed.host}`;
  } catch (e) {
    return null;
  }
}

/**
 * Verifie si l'URL courante est toujours valide.
 * Si le site repond avec une redirection vers un autre domaine,
 * on met a jour currentBaseURL automatiquement.
 */
async function refreshBaseURL() {
  const now = Date.now();
  if (now - lastChecked < CHECK_INTERVAL) return currentBaseURL;
  lastChecked = now;

  console.log(`[URL-Watcher] Verification de l'URL courante: ${currentBaseURL}`);

  // 1. Essayer d'abord l'URL courante
  const resolved = await resolveURL(currentBaseURL);
  if (resolved && resolved !== currentBaseURL) {
    console.log(`[URL-Watcher] Redirection detectee: ${currentBaseURL} -> ${resolved}`);
    currentBaseURL = resolved;
    return currentBaseURL;
  }
  if (resolved) {
    console.log(`[URL-Watcher] URL toujours valide: ${currentBaseURL}`);
    return currentBaseURL;
  }

  // 2. Si l'URL courante est morte, tester les URLs de secours
  console.log(`[URL-Watcher] URL courante inaccessible, tentative des URLs de secours...`);
  for (const seed of SEED_URLS) {
    if (seed === currentBaseURL) continue;
    const r = await resolveURL(seed);
    if (r) {
      console.log(`[URL-Watcher] Nouvelle URL trouvee via ${seed}: ${r}`);
      currentBaseURL = r;
      return currentBaseURL;
    }
  }

  console.log(`[URL-Watcher] Aucune URL valide trouvee, on garde: ${currentBaseURL}`);
  return currentBaseURL;
}

/**
 * Retourne l'URL de base courante (avec verif automatique).
 */
async function getBaseURL() {
  return await refreshBaseURL();
}

// Verifier l'URL au demarrage
refreshBaseURL().then(url => {
  console.log(`[URL-Watcher] URL initiale: ${url}`);
});

// ============================================================
// SCRAPER
// ============================================================

async function fetchPage(url) {
  const res = await axios.get(url, {
    headers: HEADERS,
    timeout: 10000,
    maxRedirects: 10,
  });
  // Si la requete a ete redirigee vers un nouveau domaine, on met a jour
  const finalURL = res.request?.res?.responseUrl || res.config?.url || url;
  try {
    const parsed = new URL(finalURL);
    const newBase = `${parsed.protocol}//${parsed.host}`;
    if (newBase !== currentBaseURL) {
      console.log(`[URL-Watcher] Redirection detectee lors du scraping: ${currentBaseURL} -> ${newBase}`);
      currentBaseURL = newBase;
      lastChecked = Date.now();
    }
  } catch (e) {}
  return cheerio.load(res.data);
}

async function getMovies(skip = 0, search = '') {
  try {
    const BASE_URL = await getBaseURL();

    // Page des films
    const page = Math.floor(skip / 20) + 1;

    // Recherche : on utilise la recherche du site si un terme est fourni
    const url = search
      ? `${BASE_URL}/search?query=${encodeURIComponent(search)}`
      : `${BASE_URL}/movies?page=${page}`;

    console.log(`[Movix] Recherche films: ${url}`);

    const $ = await fetchPage(url);
    const items = [];

    $('a[href*="/movie/"]').each((i, el) => {
      const link = $(el).attr('href');

      if (!link) return;

      const fullLink = link.startsWith('http')
        ? link
        : new URL(link, BASE_URL).href;

      // Évite les doublons
      if (items.some(item => item.link === fullLink)) return;

      const container = $(el);
      const title =
        container.find('h2, h3, h4').first().text().trim() ||
        container.text().trim();

      const img =
        container.find('img').first().attr('src') ||
        container.find('img').first().attr('data-src') ||
        '';

      if (!title) return;

      const id = 'movix_' + Buffer.from(fullLink).toString('base64');

      items.push({
        id,
        type: 'movie',
        name: title,
        poster: img,
        link: fullLink
      });
    });

    console.log(`[Movix] Films trouvés: ${items.length}`);

    return items.slice(0, 20);

  } catch (e) {
    console.error('Error fetching movies:', e.message);
    return [];
  }
}


async function getSeries(skip = 0, search = '') {
  try {
    const BASE_URL = await getBaseURL();

    const page = Math.floor(skip / 20) + 1;

    // Recherche : on utilise la recherche du site si un terme est fourni
    const url = search
      ? `${BASE_URL}/search?query=${encodeURIComponent(search)}`
      : `${BASE_URL}/tv-shows?page=${page}`;

    console.log(`[Movix] Recherche séries: ${url}`);

    const $ = await fetchPage(url);
    const items = [];

    $('a[href*="/tv-show/"]').each((i, el) => {
      const link = $(el).attr('href');

      if (!link) return;

      const fullLink = link.startsWith('http')
        ? link
        : new URL(link, BASE_URL).href;

      // Évite les doublons
      if (items.some(item => item.link === fullLink)) return;

      const container = $(el);
      const title =
        container.find('h2, h3, h4').first().text().trim() ||
        container.text().trim();

      const img =
        container.find('img').first().attr('src') ||
        container.find('img').first().attr('data-src') ||
        '';

      if (!title) return;

      const id = 'movix_' + Buffer.from(fullLink).toString('base64');

      items.push({
        id,
        type: 'series',
        name: title,
        poster: img,
        link: fullLink
      });
    });

    console.log(`[Movix] Séries trouvées: ${items.length}`);

    return items.slice(0, 20);

  } catch (e) {
    console.error('Error fetching series:', e.message);
    return [];
  }
}

async function getStreams(link) {
  try {
    const $ = await fetchPage(link);
    const streams = [];
    $('iframe, source, video').each((i, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src') || '';
      if (src && (src.includes('http') || src.startsWith('//'))) {
        streams.push({
          title: 'Movix Stream ' + (i + 1),
          url: src.startsWith('//') ? 'https:' + src : src
        });
      }
    });
    return streams;
  } catch (e) {
    console.error('Error fetching streams:', e.message);
    return [];
  }
}

// Expose l'URL courante pour le monitoring
function getCurrentURL() {
  return currentBaseURL;
}

module.exports = { getMovies, getSeries, getStreams, getBaseURL, getCurrentURL };

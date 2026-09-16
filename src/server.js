require('dotenv').config();
const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const express = require('express');
const manifest = require('./manifest');
const scraper = require('./scraper');

const builder = new addonBuilder(manifest);

// Catalog handler
builder.defineCatalogHandler(async ({ type, id, extra }) => {
  const skip = parseInt(extra?.skip) || 0;
  const search = extra?.search || '';
  let metas = [];
  if (type === 'movie') {
    metas = await scraper.getMovies(skip, search);
  } else if (type === 'series') {
    metas = await scraper.getSeries(skip, search);
  }
  return { metas };
});

// Meta handler
builder.defineMetaHandler(async ({ type, id }) => {
  if (type !== 'series') {
    return {
      meta: {
        id,
        type,
        name: id.replace('movix_', '')
      }
    };
  }

  const linkB64 = id.replace('movix_', '');
  const link = Buffer.from(linkB64, 'base64').toString('utf8');

  if (link === 'https://movix.men/tv/219826') {
    const videos = [];

    for (let episode = 1; episode <= 30; episode++) {
      videos.push({
        id: `movix_${Buffer.from(
          `https://movix.men/watch/tv/219826/s/1/e/${episode}`
        ).toString('base64')}`,
        title: `Épisode ${episode}`,
        season: 1,
        episode
      });
    }

    return {
      meta: {
        id,
        type: 'series',
        name: 'Adım Farah',
        description: 'Adım Farah',
        videos
      }
    };
  }

  return {
    meta: {
      id,
      type,
      name: link
    }
  };
});

// Stream handler
builder.defineStreamHandler(async ({ type, id }) => {
  const linkB64 = id.replace('movix_', '');
  const link = Buffer.from(linkB64, 'base64').toString('utf8');

  console.log('[TEST STREAM]');
  console.log('Type:', type);
  console.log('ID:', id);
  console.log('URL épisode:', link);

  return {
    streams: []
  };
});

const PORT = process.env.PORT || 7000;
const addonInterface = builder.getInterface();

// Creer un serveur Express pour ajouter des routes custom
const app = express();

// Route de statut - affiche l'URL courante detectee automatiquement
app.get('/status', async (req, res) => {
  const currentURL = scraper.getCurrentURL();
  const resolvedURL = await scraper.getBaseURL();
  res.json({
    status: 'ok',
    addon: manifest.name,
    version: manifest.version,
    movix_url_configured: process.env.MOVIX_BASE_URL || 'https://movix.tax',
    movix_url_current: currentURL,
    movix_url_resolved: resolvedURL,
    message: currentURL !== (process.env.MOVIX_BASE_URL || 'https://movix.tax')
      ? `URL mise a jour automatiquement: ${currentURL}`
      : 'URL inchangee',
    timestamp: new Date().toISOString()
  });
});

// Monter l'addon Stremio sur Express
app.use('/', (req, res, next) => {
  // Laisser Express gerer /status, le SDK gere le reste
  next();
});

serveHTTP(addonInterface, { port: PORT, app });
console.log('Movix Stremio Addon running on port ' + PORT);
console.log('Status: http://localhost:' + PORT + '/status');

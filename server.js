'use strict';

const express = require('express');
const axios   = require('axios');
const cheerio = require('cheerio');
const path    = require('path');

const app  = express();
const PORT = 3000;

const INAMI_BASE = 'https://webappsa.riziv-inami.fgov.be';
const HTTP_HEADERS = {
  'User-Agent'      : 'Mozilla/5.0 (compatible; NomensoftViewer/1.0)',
  'Accept'          : 'text/html,application/xhtml+xml',
  'Accept-Language' : 'fr-BE,fr;q=0.9',
};

// ─── Static files ────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Convert a Belgian date string "d/mm/yyyy" → ISO "yyyy-mm-dd"
 * Returns null when the input is empty / invalid.
 */
function belgianToISO(str) {
  if (!str || !str.trim()) return null;
  const parts = str.trim().split('/');
  if (parts.length !== 3) return null;
  const [d, m, y] = parts;
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

/**
 * Resolve a href that may be relative to an absolute INAMI URL.
 */
function absoluteHref(href) {
  if (!href) return null;
  if (href.startsWith('http')) return href;
  return `${INAMI_BASE}${href.startsWith('/') ? '' : '/'}${href}`;
}

// ─── INAMI fetchers ───────────────────────────────────────────────────────────

/**
 * Fetch the French libellé (description) for a nomenclature code.
 * DEBUG MODE: Renvoie l'erreur exacte si ça plante sur le cloud.
 */
async function fetchDescription(code) {
  try {
    const { data, status } = await axios.get(
      `${INAMI_BASE}/Nomen/fr/${code}`,
      { headers: HTTP_HEADERS, timeout: 8_000 }
    );

    const scriptMatch = data.match(/var\s+labelHistory\s*=\s*(\[[\s\S]*?\]);/);
    
    if (scriptMatch && scriptMatch[1]) {
      try {
        const labelHistory = JSON.parse(scriptMatch[1]);
        if (labelHistory.length > 0 && labelHistory[0].label1Short) {
          return labelHistory[0].label1Short.trim();
        }
        return `[DEBUG] JSON trouvé mais label1Short est vide.`;
      } catch (err) {
        return `[DEBUG] Impossible de lire le JSON: ${err.message}`;
      }
    }

    // Si on arrive ici, la page s'est chargée mais la variable JS n'y est pas
    const $ = cheerio.load(data);
    const pageTitle = $('title').text().trim();
    console.log(`[DEBUG] Variable introuvable. Statut HTTP: ${status}. Titre vu par le serveur: "${pageTitle}"`);
    return `[DEBUG] Variable introuvable. Statut HTTP: ${status}. Titre vu par le serveur: "${pageTitle}"`;

  } catch (err) {
    // Si l'INAMI bloque le serveur Cloud (Erreur 403, Timeout, etc.)
    return `[DEBUG] Blocage INAMI: ${err.message} (Statut HTTP: ${err.response?.status || 'Aucun'})`;
  }
}
/**
 * Fetch and parse the full fee history table for a nomenclature code.
 * Returns an object with parsed columns, dates and fee rows.
 */
async function fetchFeeHistory(code) {
  const { data } = await axios.get(
    `${INAMI_BASE}/Nomen/fr/${code}/fees/history`,
    { headers: HTTP_HEADERS, timeout: 12_000 }
  );

  const $ = cheerio.load(data);

  // ── The first <table> on the page is the fees history table ──────────────
  const table = $('table').first();

  const documents  = [];   // { name, link }
  const startDates = [];   // ISO strings
  const endDates   = [];   // ISO strings or null
  const feeRows    = {};   // { "0": ["23,50 €", ...], "1300": [...], ... }

  table.find('tr').each((_, tr) => {
    const cells = $(tr).find('td, th');
    if (!cells.length) return;

    // Normalize the first-cell label
    const label = $(cells[0]).text().trim().replace(/:$/, '').trim();

    if (label === 'DOCUMENT') {
      cells.each((j, td) => {
        if (j === 0) return;
        const a    = $(td).find('a');
        const name = a.text().trim() || $(td).text().trim();
        const link = absoluteHref(a.attr('href') || null);
        documents.push({ name, link });
      });

    } else if (label === 'Date de début') {
      cells.each((j, td) => {
        if (j === 0) return;
        startDates.push(belgianToISO($(td).text().trim()));
      });

    } else if (label === 'Date de fin') {
      cells.each((j, td) => {
        if (j === 0) return;
        endDates.push(belgianToISO($(td).text().trim()));
      });

    } else if (/^\d+$/.test(label)) {
      // Fee-code row  (e.g. "0", "1300", "3300", …)
      const values = [];
      cells.each((j, td) => {
        if (j === 0) return;
        values.push($(td).text().trim() || null);
      });
      feeRows[label] = values;
    }
  });

  return { documents, startDates, endDates, feeRows };
}

// ─── API endpoint ─────────────────────────────────────────────────────────────

/**
 * GET /api/fees?code=101032&date=2024-03-15
 *
 * Returns the tariffs applicable on the given date for the 4 relevant fee codes:
 *   3300  → Part patient BIM
 *   3600  → Part patient NON-BIM
 *   1300  → Intervention OA BIM
 *   1600  → Intervention OA NON-BIM
 */
app.get('/api/fees', async (req, res) => {
  const { code, date } = req.query;

  // ── Input validation ──────────────────────────────────────────────────────
  if (!code || !/^\d{6}$/.test(code)) {
    return res.status(400).json({
      error: 'Code nomenclature invalide. Il doit contenir exactement 6 chiffres.',
    });
  }

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Date invalide. Format attendu : YYYY-MM-DD.' });
  }

  try {
    // Run both fetches in parallel for speed
    const [history, description] = await Promise.all([
      fetchFeeHistory(code),
      fetchDescription(code),
    ]);

    const { documents, startDates, endDates, feeRows } = history;

    // ── Find the column whose period contains the requested date ─────────────
    // Dates are ISO strings → lexicographic comparison works perfectly
    let col = -1;
    for (let i = 0; i < startDates.length; i++) {
      const start = startDates[i];
      const end   = endDates[i];
      if (!start) continue;
      if (date >= start && (!end || date <= end)) {
        col = i;
        break;
      }
    }

    if (col === -1) {
      return res.status(404).json({
        error: `Aucun tarif trouvé pour le code ${code} à la date ${date}.`,
      });
    }

    // ── Extract the 4 relevant fee codes + honoraire de base ─────────────────
    const RELEVANT_CODES = ['0', '1300', '1600', '3300', '3600'];
    const fees = {};
    RELEVANT_CODES.forEach(fc => {
      fees[fc] = feeRows[fc]?.[col] ?? null;
    });

    return res.json({
      code,
      description,
      date,
      period: {
        start: startDates[col],
        end  : endDates[col] ?? null,   // null = currently valid
      },
      document: documents[col] ?? null,
      fees,
    });

  } catch (err) {
    if (err.response?.status === 404) {
      return res.status(404).json({
        error: `Code nomenclature ${code} introuvable sur NomenSoft.`,
      });
    }
    console.error('[INAMI fetch error]', err.message);
    return res.status(500).json({
      error: 'Erreur lors de la récupération des données INAMI. Réessayez dans quelques instants.',
    });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════╗
║   INAMI Nomensoft Viewer                 ║
║   http://localhost:${PORT}                  ║
╚══════════════════════════════════════════╝
  `);
});

import axios from 'axios';
import * as cheerio from 'cheerio';

const INAMI_BASE = 'https://webappsa.riziv-inami.fgov.be';
const HTTP_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; NomensoftViewer/1.0)',
  'Accept': 'text/html,application/xhtml+xml',
  'Accept-Language': 'fr-BE,fr;q=0.9',
};

function belgianToISO(str) {
  if (!str || !str.trim()) return null;
  const parts = str.trim().split('/');
  if (parts.length !== 3) return null;
  const [d, m, y] = parts;
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

function absoluteHref(href) {
  if (!href) return null;
  if (href.startsWith('http')) return href;
  return `${INAMI_BASE}${href.startsWith('/') ? '' : '/'}${href}`;
}

async function fetchDescription(code) {
  try {
    const { data } = await axios.get(
      `${INAMI_BASE}/Nomen/fr/${code}`,
      { headers: HTTP_HEADERS, timeout: 8000 }
    );
    const $ = cheerio.load(data);
    let description = null;
    $('textarea').each((_, el) => {
      const txt = $(el).text().trim();
      if (txt) { description = txt; return false; }
    });
    return description;
  } catch {
    return null;
  }
}

async function fetchFeeHistory(code) {
  const { data } = await axios.get(
    `${INAMI_BASE}/Nomen/fr/${code}/fees/history`,
    { headers: HTTP_HEADERS, timeout: 12000 }
  );

  const $ = cheerio.load(data);
  const table = $('table').first();

  const documents = [];
  const startDates = [];
  const endDates = [];
  const feeRows = {};

  table.find('tr').each((_, tr) => {
    const cells = $(tr).find('td, th');
    if (!cells.length) return;

    const label = $(cells[0]).text().trim().replace(/:$/, '').trim();

    if (label === 'DOCUMENT') {
      cells.each((j, td) => {
        if (j === 0) return;
        const a = $(td).find('a');
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

export default async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const date = url.searchParams.get('date');

  if (!code || !/^\d{6}$/.test(code)) {
    return Response.json(
      { error: 'Code nomenclature invalide. Il doit contenir exactement 6 chiffres.' },
      { status: 400 }
    );
  }

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json(
      { error: 'Date invalide. Format attendu : YYYY-MM-DD.' },
      { status: 400 }
    );
  }

  try {
    const [history, description] = await Promise.all([
      fetchFeeHistory(code),
      fetchDescription(code),
    ]);

    const { documents, startDates, endDates, feeRows } = history;

    let col = -1;
    for (let i = 0; i < startDates.length; i++) {
      const start = startDates[i];
      const end = endDates[i];
      if (!start) continue;
      if (date >= start && (!end || date <= end)) {
        col = i;
        break;
      }
    }

    if (col === -1) {
      return Response.json(
        { error: `Aucun tarif trouvé pour le code ${code} à la date ${date}.` },
        { status: 404 }
      );
    }

    const RELEVANT_CODES = ['0', '1300', '1600', '3300', '3600'];
    const fees = {};
    RELEVANT_CODES.forEach(fc => {
      fees[fc] = feeRows[fc]?.[col] ?? null;
    });

    return Response.json({
      code,
      description,
      date,
      period: {
        start: startDates[col],
        end: endDates[col] ?? null,
      },
      document: documents[col] ?? null,
      fees,
    });

  } catch (err) {
    if (err.response?.status === 404) {
      return Response.json(
        { error: `Code nomenclature ${code} introuvable sur NomenSoft.` },
        { status: 404 }
      );
    }
    console.error('[INAMI fetch error]', err.message);
    return Response.json(
      { error: 'Erreur lors de la récupération des données INAMI. Réessayez dans quelques instants.' },
      { status: 500 }
    );
  }
};

export const config = {
  path: '/api/fees',
};

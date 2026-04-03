'use strict';

/* ═══════════════════════════════════════════════════════════════
   INAMI Nomensoft Viewer — app.js
   ═══════════════════════════════════════════════════════════════ */

// ─── DOM references ───────────────────────────────────────────────
const els = {
  form          : document.getElementById('form-tarifs'),
  codeInput     : document.getElementById('input-code'),
  dateInput     : document.getElementById('input-date'),
  groupCode     : document.getElementById('group-code'),
  groupDate     : document.getElementById('group-date'),
  errorCode     : document.getElementById('error-code'),
  errorDate     : document.getElementById('error-date'),
  btnSearch     : document.getElementById('btn-search'),
  resultsSection: document.getElementById('results-section'),
  errorSection  : document.getElementById('error-section'),
  errorMessage  : document.getElementById('error-message'),

  // Result fields
  resultCode    : document.getElementById('result-code'),
  resultDesc    : document.getElementById('result-description'),
  resultPeriod  : document.getElementById('result-period-text'),
  resultDocLink : document.getElementById('result-doc-link'),
  resultDocName : document.getElementById('result-doc-name'),

  // Price columns (for filtering)
  colBim        : document.getElementById('col-bim'),
  colNonBim     : document.getElementById('col-non-bim'),

  // Prices
  price3300     : document.getElementById('price-3300'),
  price3600     : document.getElementById('price-3600'),
  price1300     : document.getElementById('price-1300'),
  price1600     : document.getElementById('price-1600'),
  totalBim      : document.getElementById('total-bim'),
  totalNonBim   : document.getElementById('total-non-bim'),
};

// ─── State ────────────────────────────────────────────────────────
let activeFilter = 'all'; // 'all' | 'bim' | 'non-bim'

// ─── Init ─────────────────────────────────────────────────────────
(function init() {
  // Default date = today
  els.dateInput.value = todayISO();

  // Code input: digits only, max 6
  els.codeInput.addEventListener('input', () => {
    els.codeInput.value = els.codeInput.value.replace(/\D/g, '').slice(0, 6);
    clearFieldError('code');
  });

  els.dateInput.addEventListener('change', () => clearFieldError('date'));

  // BIM toggle
  document.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.dataset.value;
      applyFilter();
    });
  });

  // Form submission
  els.form.addEventListener('submit', e => {
    e.preventDefault();
    handleSearch();
  });
})();

// ─── Filter logic ─────────────────────────────────────────────────

/**
 * Show/hide the BIM and Non-BIM columns based on activeFilter.
 * Also adjusts the grid to single-column when only one is shown.
 */
function applyFilter() {
  const grid = document.querySelector('.prices-grid');
  if (!els.colBim || !els.colNonBim || !grid) return;

  const showBim    = activeFilter === 'all' || activeFilter === 'bim';
  const showNonBim = activeFilter === 'all' || activeFilter === 'non-bim';

  els.colBim.classList.toggle('hidden', !showBim);
  els.colNonBim.classList.toggle('hidden', !showNonBim);

  // Switch grid to single column when only one side is visible
  grid.style.gridTemplateColumns = (showBim && showNonBim) ? '' : '1fr';
}

// ─── Search handler ───────────────────────────────────────────────
async function handleSearch() {
  if (!validateForm()) return;

  const code = els.codeInput.value.trim();
  const date = els.dateInput.value;

  setLoading(true);
  hideResults();
  hideError();

  try {
    const res  = await fetch(`/api/fees?code=${encodeURIComponent(code)}&date=${encodeURIComponent(date)}`);
    const data = await res.json();

    if (!res.ok) {
      showError(data.error ?? 'Une erreur inattendue est survenue.');
      return;
    }

    renderResults(data);

  } catch (_err) {
    showError('Impossible de joindre le serveur. Vérifiez que l\'application est démarrée.');
  } finally {
    setLoading(false);
  }
}

// ─── Validation ──────────────────────────────────────────────────
function validateForm() {
  let valid = true;

  if (!/^\d{6}$/.test(els.codeInput.value.trim())) {
    setFieldError('code', 'Le code doit contenir exactement 6 chiffres.');
    valid = false;
  }

  if (!els.dateInput.value) {
    setFieldError('date', 'Veuillez sélectionner une date.');
    valid = false;
  }

  return valid;
}

function setFieldError(field, msg) {
  const errorEl   = field === 'code' ? els.errorCode : els.errorDate;
  const wrapperEl = (field === 'code' ? els.codeInput : els.dateInput)
                    .closest('.input-wrapper');
  errorEl.textContent = msg;
  wrapperEl?.classList.add('has-error');
}

function clearFieldError(field) {
  const errorEl   = field === 'code' ? els.errorCode : els.errorDate;
  const wrapperEl = (field === 'code' ? els.codeInput : els.dateInput)
                    .closest('.input-wrapper');
  errorEl.textContent = '';
  wrapperEl?.classList.remove('has-error');
}

// ─── UI state helpers ─────────────────────────────────────────────
function setLoading(loading) {
  els.btnSearch.disabled = loading;
  els.btnSearch.classList.toggle('is-loading', loading);
}

function hideResults() { els.resultsSection.classList.add('hidden'); }
function showResults()  { els.resultsSection.classList.remove('hidden'); }

function hideError()    { els.errorSection.classList.add('hidden'); }
function showError(msg) {
  els.errorMessage.textContent = msg;
  els.errorSection.classList.remove('hidden');
  els.errorSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ─── Render results ───────────────────────────────────────────────
function renderResults(data) {
  // Meta
  els.resultCode.textContent = data.code;
  els.resultDesc.textContent = data.description ?? `Code ${data.code}`;

  // Period
  const start = formatBelgianDate(data.period.start);
  const end   = data.period.end ? formatBelgianDate(data.period.end) : 'En cours';
  els.resultPeriod.textContent = `${start} → ${end}`;

  // Official document link
  if (data.document?.link) {
    els.resultDocLink.href        = data.document.link;
    els.resultDocName.textContent = data.document.name ?? 'Document officiel';
    els.resultDocLink.classList.remove('hidden');
  } else {
    els.resultDocLink.classList.add('hidden');
  }

  // Prices
  const fees = data.fees ?? {};

  const p3300 = parseFeeAmount(fees['3300']);
  const p3600 = parseFeeAmount(fees['3600']);
  const p1300 = parseFeeAmount(fees['1300']);
  const p1600 = parseFeeAmount(fees['1600']);

  els.price3300.textContent = formatEuro(p3300);
  els.price3600.textContent = formatEuro(p3600);
  els.price1300.textContent = formatEuro(p1300);
  els.price1600.textContent = formatEuro(p1600);

  els.totalBim.textContent = (p3300 !== null && p1300 !== null)
    ? formatEuro(round2(p3300 + p1300))
    : '—';

  els.totalNonBim.textContent = (p3600 !== null && p1600 !== null)
    ? formatEuro(round2(p3600 + p1600))
    : '—';

  showResults();
  // Apply current filter before scrolling into view
  applyFilter();
  els.resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ─── Formatters / helpers ─────────────────────────────────────────

function parseFeeAmount(str) {
  if (!str || str.trim() === '' || str === '—') return null;
  const cleaned = str.replace(/[€\s]/g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function formatEuro(amount) {
  if (amount === null) return '—';
  return amount.toLocaleString('fr-BE', {
    style                : 'currency',
    currency             : 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatBelgianDate(isoStr) {
  if (!isoStr) return '?';
  const [y, m, d] = isoStr.split('-');
  return `${d}/${m}/${y}`;
}

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

function round2(n) {
  return Math.round(n * 100) / 100;
}


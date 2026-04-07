'use strict';

/* ═══════════════════════════════════════════════════════════════
   INAMI Nomensoft Viewer — app.js (Avec Audit DB & Fallback Codes)
   ═══════════════════════════════════════════════════════════════ */

const els = {
  // Navigation Tabs
  tabs: document.querySelectorAll('.tab-btn'),
  panels: document.querySelectorAll('.tab-panel'),

  // Tab 1 : Tarifs
  form          : document.getElementById('form-tarifs'),
  codeInput     : document.getElementById('input-code'),
  dateInput     : document.getElementById('input-date'),
  statusInput   : document.getElementById('input-status'),
  btnSearch     : document.getElementById('btn-search'),
  resultsSection: document.getElementById('results-section'),
  errorSection  : document.getElementById('error-section'),
  errorMessage  : document.getElementById('error-message'),
  resultCode    : document.getElementById('result-code'),
  resultDesc    : document.getElementById('result-description'),
  resultPeriod  : document.getElementById('result-period-text'),
  resultDocLink : document.getElementById('result-doc-link'),
  price3300     : document.getElementById('price-3300'),
  price3600     : document.getElementById('price-3600'),
  price1300     : document.getElementById('price-1300'),
  price1600     : document.getElementById('price-1600'),
  totalBim      : document.getElementById('total-bim'),
  totalNonBim   : document.getElementById('total-non-bim'),
  colBim        : document.getElementById('col-bim'),
  colNonBim     : document.getElementById('col-non-bim'),

  // Tab 2 : Audit DB
  formCompare   : document.getElementById('form-compare'),
  csvInput      : document.getElementById('input-csv'),
  typeCompare   : document.getElementById('input-compare-type'),
  dateCompare   : document.getElementById('input-compare-date'),
  btnRunCompare : document.getElementById('btn-run-compare'),
  progressSec   : document.getElementById('compare-progress-section'),
  progressText  : document.getElementById('progress-text'),
  progressBar   : document.getElementById('progress-bar'),
  resultsSecComp: document.getElementById('compare-results-section'),
  countOk       : document.getElementById('count-ok'),
  countObsolete : document.getElementById('count-obsolete'),
  tbodyResults  : document.getElementById('tbody-results'),
  sqlSection    : document.getElementById('sql-section'),
  sqlCode       : document.getElementById('sql-code'),
  btnCopySql    : document.getElementById('btn-copy-sql')
};

(function init() {
  els.dateInput.value = todayISO();
  if(els.dateCompare) els.dateCompare.value = todayISO();

  // Tab Switch Logic
  els.tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      if(tab.classList.contains('tab-disabled')) return;
      els.tabs.forEach(t => t.classList.remove('active'));
      els.panels.forEach(p => p.classList.add('hidden'));
      tab.classList.add('active');
      document.getElementById(`tab-${tab.dataset.tab}`).classList.remove('hidden');
    });
  });

  // Tab 1 Events
  els.codeInput.addEventListener('input', () => els.codeInput.value = els.codeInput.value.replace(/\D/g, '').slice(0, 6));
  els.statusInput.addEventListener('change', () => { if (!els.resultsSection.classList.contains('hidden')) applyStatusFilter(); });
  els.form.addEventListener('submit', e => { e.preventDefault(); handleSearch(); });

  // Tab 2 Events
  if(els.formCompare) {
    els.formCompare.addEventListener('submit', e => { e.preventDefault(); handleCompare(); });
    els.btnCopySql.addEventListener('click', () => {
      navigator.clipboard.writeText(els.sqlCode.textContent);
      els.btnCopySql.textContent = "Copié !";
      setTimeout(() => els.btnCopySql.textContent = "Copier", 2000);
    });
  }
})();

// ============================================================================
// NOUVEAU HELPER : Gestion du fallback des codes de facturation
// ============================================================================
function getBestFee(data, primaryCode, fallbackCode) {
  if (data.fees[primaryCode] !== null && data.fees[primaryCode] !== undefined) {
    return { value: parseFeeAmount(data.fees[primaryCode]), usedCode: primaryCode };
  }
  if (data.fees[fallbackCode] !== null && data.fees[fallbackCode] !== undefined) {
    return { value: parseFeeAmount(data.fees[fallbackCode]), usedCode: fallbackCode };
  }
  return { value: null, usedCode: primaryCode }; // Par défaut
}

// ============================================================================
// TAB 1 : LOGIQUE CLASSIQUE
// ============================================================================
async function handleSearch() {
  const code = els.codeInput.value.trim();
  const date = els.dateInput.value;
  if(!/^\d{6}$/.test(code) || !date) return showError("Code ou date invalide.");

  setLoading(true); hideResults(); hideError();
  try {
    const res = await fetch(`/api/fees?code=${encodeURIComponent(code)}&date=${encodeURIComponent(date)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    renderResults(data);
  } catch (err) { showError(err.message); } finally { setLoading(false); }
}

function renderResults(data) {
  els.resultCode.textContent = data.code;
  els.resultDesc.textContent = data.description ?? `Code ${data.code}`;
  els.resultPeriod.textContent = `${formatBelgianDate(data.period.start)} → ${data.period.end ? formatBelgianDate(data.period.end) : 'En cours'}`;
  
  // Utilisation de la nouvelle logique de Fallback
  const bimTM = getBestFee(data, '3300', '3510'); // Patient BIM
  const bimOA = getBestFee(data, '1300', '1510'); // Mutuelle BIM
  const normTM = getBestFee(data, '3600', '3810'); // Patient Non-BIM
  const normOA = getBestFee(data, '1600', '1810'); // Mutuelle Non-BIM

  // Mise à jour des montants
  els.price3300.textContent = formatEuro(bimTM.value);
  els.price1300.textContent = formatEuro(bimOA.value);
  els.price3600.textContent = formatEuro(normTM.value);
  els.price1600.textContent = formatEuro(normOA.value);

  // Mise à jour des sous-titres pour afficher le VRAI code utilisé
  els.price3300.previousElementSibling.textContent = `Part personnelle · code ${bimTM.usedCode}`;
  els.price1300.previousElementSibling.textContent = `Remboursement · code ${bimOA.usedCode}`;
  els.price3600.previousElementSibling.textContent = `Part personnelle · code ${normTM.usedCode}`;
  els.price1600.previousElementSibling.textContent = `Remboursement · code ${normOA.usedCode}`;

  // Calcul des totaux
  els.totalBim.textContent = (bimTM.value !== null && bimOA.value !== null) ? formatEuro(round2(bimTM.value + bimOA.value)) : '—';
  els.totalNonBim.textContent = (normTM.value !== null && normOA.value !== null) ? formatEuro(round2(normTM.value + normOA.value)) : '—';

  showResults(); applyStatusFilter();
}

function applyStatusFilter() {
  const status = els.statusInput.value;
  const pricesGrid = document.querySelector('#tab-tarifs .prices-grid');
  els.colBim.classList.remove('hidden'); els.colNonBim.classList.remove('hidden'); pricesGrid.classList.remove('single-col');
  if (status === 'bim') { els.colNonBim.classList.add('hidden'); pricesGrid.classList.add('single-col'); } 
  else if (status === 'non-bim') { els.colBim.classList.add('hidden'); pricesGrid.classList.add('single-col'); }
}

// ============================================================================
// TAB 2 : AUDIT BASE DE DONNEES
// ============================================================================
function handleCompare() {
  const file = els.csvInput.files[0];
  const typeFilter = els.typeCompare.value;
  const date = els.dateCompare.value;

  if (!file) return alert("Veuillez sélectionner un fichier CSV.");

  els.btnRunCompare.disabled = true;
  els.resultsSecComp.classList.add('hidden');
  els.progressSec.classList.remove('hidden');

  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: function(results) {
      const data = results.data;
      
      const requiredCols = ['id', 'type', 'inami', 'tm_price', 'oa_price', 'insurance_category'];
      const missing = requiredCols.filter(c => !results.meta.fields.includes(c));
      if (missing.length > 0) {
        alert(`Erreur de structure. Colonnes manquantes dans le CSV : ${missing.join(', ')}`);
        resetAuditUI();
        return;
      }

      const rowsToProcess = data.filter(r => typeFilter === 'all' || r.type === typeFilter);
      
      if(rowsToProcess.length === 0) {
        alert("Aucune donnée correspondant au filtre dans le fichier.");
        resetAuditUI();
        return;
      }

      runAudit(rowsToProcess, date);
    }
  });
}

async function runAudit(rows, date) {
  let okCount = 0;
  let obsoleteCount = 0;
  let sqlQueries = [];
  els.tbodyResults.innerHTML = '';
  
  const inamiCache = {};

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const code = row.inami.replace(/\D/g, ''); 
    
    els.progressText.textContent = `Analyse en cours... ${i + 1} / ${rows.length}`;
    els.progressBar.style.width = `${((i + 1) / rows.length) * 100}%`;

    let inamiData = inamiCache[code];
    if (!inamiData) {
      try {
        const res = await fetch(`/api/fees?code=${code}&date=${date}`);
        if(res.ok) {
          inamiData = await res.json();
          inamiCache[code] = inamiData;
        }
      } catch (e) { console.error("Erreur sur le code", code); }
    }

    let officialTm = null;
    let officialOa = null;
    let statusHTML = '';
    let needsUpdate = false;

    if (inamiData && inamiData.fees) {
      if (row.insurance_category.toLowerCase() === 'bim') {
        officialTm = getBestFee(inamiData, '3300', '3510').value;
        officialOa = getBestFee(inamiData, '1300', '1510').value;
      } else { 
        // fallback pour 'normal' ou autre
        officialTm = getBestFee(inamiData, '3600', '3810').value;
        officialOa = getBestFee(inamiData, '1600', '1810').value;
      }
    }

    const currentTm = parseFloat(row.tm_price);
    const currentOa = parseFloat(row.oa_price);

    if (officialTm !== null && officialOa !== null) {
      const tmDiff = Math.abs(currentTm - officialTm);
      const oaDiff = Math.abs(currentOa - officialOa);

      if (tmDiff > 0.01 || oaDiff > 0.01) {
        needsUpdate = true;
        obsoleteCount++;
        statusHTML = `<span style="color:#ef4444; font-weight:bold;">❌ Obsolète</span>`;
        sqlQueries.push(`UPDATE consultation_consultation SET tm_price = ${officialTm}, oa_price = ${officialOa} WHERE id = ${row.id}; -- Code ${row.inami} (${row.insurance_category})`);
      } else {
        okCount++;
        statusHTML = `<span style="color:#10b981; font-weight:bold;">✅ À jour</span>`;
      }
    } else {
      statusHTML = `<span style="color:#f59e0b;">⚠️ Code introuvable RIZIV</span>`;
    }

    const tr = document.createElement('tr');
    tr.style.borderBottom = "1px solid #e2e8f0";
    tr.style.background = needsUpdate ? "#fef2f2" : "transparent";
    tr.innerHTML = `
      <td style="padding: 0.75rem;">${row.id}</td>
      <td style="padding: 0.75rem;"><strong>${row.inami}</strong></td>
      <td style="padding: 0.75rem;">${row.type}<br><small style="color:#64748b;">${row.insurance_category.toUpperCase()}</small></td>
      <td style="padding: 0.75rem; ${needsUpdate?'text-decoration:line-through; color:#94a3b8;':''}">TM: ${currentTm} €<br>OA: ${currentOa} €</td>
      <td style="padding: 0.75rem;"><strong>TM: ${officialTm!==null?officialTm:'?'} €<br>OA: ${officialOa!==null?officialOa:'?'} €</strong></td>
      <td style="padding: 0.75rem;">${statusHTML}</td>
    `;
    els.tbodyResults.appendChild(tr);
  }

  els.progressSec.classList.add('hidden');
  els.resultsSecComp.classList.remove('hidden');
  els.btnRunCompare.disabled = false;

  els.countOk.textContent = okCount;
  els.countObsolete.textContent = obsoleteCount;

  if (sqlQueries.length > 0) {
    els.sqlSection.classList.remove('hidden');
    els.sqlCode.innerHTML = `BEGIN;<br><br>${sqlQueries.join('<br>')}<br><br>COMMIT;`;
  } else {
    els.sqlSection.classList.add('hidden');
  }
}

function resetAuditUI() {
  els.btnRunCompare.disabled = false;
  els.progressSec.classList.add('hidden');
}

// ============================================================================
// HELPERS
// ============================================================================
function setLoading(loading) { els.btnSearch.disabled = loading; els.btnSearch.classList.toggle('is-loading', loading); }
function hideResults() { els.resultsSection.classList.add('hidden'); }
function showResults() { els.resultsSection.classList.remove('hidden'); }
function hideError() { els.errorSection.classList.add('hidden'); }
function showError(msg) { els.errorMessage.textContent = msg; els.errorSection.classList.remove('hidden'); }

function parseFeeAmount(str) {
  if (!str || str.trim() === '' || str === '—') return null;
  const cleaned = str.replace(/[€\s]/g, '').replace(',', '.');
  const n = parseFloat(cleaned); return isNaN(n) ? null : n;
}

function formatEuro(amount) {
  if (amount === null) return '—';
  return amount.toLocaleString('fr-BE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 });
}
function formatBelgianDate(isoStr) {
  if (!isoStr) return '?';
  const [y, m, d] = isoStr.split('-'); return `${d}/${m}/${y}`;
}
function todayISO() { return new Date().toISOString().split('T')[0]; }
function round2(n) { return Math.round(n * 100) / 100; }
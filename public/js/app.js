'use strict';

/* ═══════════════════════════════════════════════════════════════
   INAMI Nomensoft Viewer — app.js (Audit DB groupé par INAMI + Filtres)
   ═══════════════════════════════════════════════════════════════ */

const els = {
  tabs: document.querySelectorAll('.tab-btn'),
  panels: document.querySelectorAll('.tab-panel'),

  // Tab 1 : Tarifs
  form: document.getElementById('form-tarifs'),
  codeInput: document.getElementById('input-code'),
  dateInput: document.getElementById('input-date'),
  statusInput: document.getElementById('input-status'),
  doctorInput: document.getElementById('input-doctor'),
  btnSearch: document.getElementById('btn-search'),
  resultsSection: document.getElementById('results-section'),
  errorSection: document.getElementById('error-section'),
  errorMessage: document.getElementById('error-message'),
  resultCode: document.getElementById('result-code'),
  resultDesc: document.getElementById('result-description'),
  resultPeriod: document.getElementById('result-period-text'),

  // Blocs doctor
  blockAgree   : document.getElementById('block-agree'),
  blockStagiaire: document.getElementById('block-stagiaire'),

  // Agréé — colonnes patient
  colBim   : document.getElementById('col-bim'),
  colNonBim: document.getElementById('col-non-bim'),

  // Agréé — montants
  price3300: document.getElementById('price-3300'),
  price3600: document.getElementById('price-3600'),
  price1300: document.getElementById('price-1300'),
  price1600: document.getElementById('price-1600'),
  totalBim : document.getElementById('total-bim'),
  totalNonBim: document.getElementById('total-non-bim'),

  // Stagiaire — colonnes patient
  stagColBim   : document.getElementById('stag-col-bim'),
  stagColNonBim: document.getElementById('stag-col-non-bim'),

  // Stagiaire — montants
  stagTmBim     : document.getElementById('stag-price-tm-bim'),
  stagOaBim     : document.getElementById('stag-price-oa-bim'),
  stagTotalBim  : document.getElementById('stag-total-bim'),
  stagBaseBim   : document.getElementById('stag-base-bim'),
  stagTmNonBim  : document.getElementById('stag-price-tm-non-bim'),
  stagOaNonBim  : document.getElementById('stag-price-oa-non-bim'),
  stagTotalNonBim: document.getElementById('stag-total-non-bim'),
  stagBaseNonBim: document.getElementById('stag-base-non-bim'),

  // Tab 2 : Audit DB
  formCompare: document.getElementById('form-compare'),
  csvInput: document.getElementById('input-csv'),
  typeCompare: document.getElementById('input-compare-type'),
  dateCompare: document.getElementById('input-compare-date'),
  btnRunCompare: document.getElementById('btn-run-compare'),
  progressSec: document.getElementById('compare-progress-section'),
  progressText: document.getElementById('progress-text'),
  progressBar: document.getElementById('progress-bar'),
  resultsSecComp: document.getElementById('compare-results-section'),
  countOk: document.getElementById('count-ok'),
  countObsolete: document.getElementById('count-obsolete'),
  tbodyResults: document.getElementById('tbody-results'),
  sqlSection: document.getElementById('sql-section'),
  sqlCode: document.getElementById('sql-code'),
  btnCopySql: document.getElementById('btn-copy-sql'),
  auditFilter: document.getElementById('filter-audit-status')
};

// ─── Module state ─────────────────────────────────────────────────
let lastApiData = null; // Dernière réponse API stockée pour recalcul sans nouvel appel

(function init() {
  els.dateInput.value = todayISO();
  if (els.dateCompare) els.dateCompare.value = todayISO();

  els.tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      if (tab.classList.contains('tab-disabled')) return;
      els.tabs.forEach(t => t.classList.remove('active'));
      els.panels.forEach(p => p.classList.add('hidden'));
      tab.classList.add('active');
      document.getElementById(`tab-${tab.dataset.tab}`).classList.remove('hidden');
    });
  });

  els.codeInput.addEventListener('input', () => els.codeInput.value = els.codeInput.value.replace(/\D/g, '').slice(0, 6));

  // Filtres : recalcul immédiat si des données sont déjà chargées
  els.statusInput.addEventListener('change', () => { if (lastApiData) applyFilters(); });
  els.doctorInput.addEventListener('change', () => { if (lastApiData) applyFilters(); });

  els.form.addEventListener('submit', e => { e.preventDefault(); handleSearch(); });

  if (els.formCompare) {
    els.formCompare.addEventListener('submit', e => { e.preventDefault(); handleCompare(); });
    els.btnCopySql.addEventListener('click', () => {
      navigator.clipboard.writeText(els.sqlCode.textContent);
      els.btnCopySql.textContent = "Copié !";
      setTimeout(() => els.btnCopySql.textContent = "Copier", 2000);
    });
    if (els.auditFilter) {
      els.auditFilter.addEventListener('change', applyAuditFilter);
    }
  }
})();

function getBestFee(data, primaryCode, fallbackCode) {
  if (data.fees[primaryCode] !== null && data.fees[primaryCode] !== undefined) {
    return { value: parseFeeAmount(data.fees[primaryCode]), usedCode: primaryCode };
  }
  if (data.fees[fallbackCode] !== null && data.fees[fallbackCode] !== undefined) {
    return { value: parseFeeAmount(data.fees[fallbackCode]), usedCode: fallbackCode };
  }
  return { value: null, usedCode: primaryCode };
}

// ============================================================================
// TAB 1 : RECHERCHE CLASSIQUE
// ============================================================================
async function handleSearch() {
  const code = els.codeInput.value.trim();
  const date = els.dateInput.value;
  if (!/^\d{6}$/.test(code) || !date) return showError("Code ou date invalide.");

  setLoading(true); hideResults(); hideError();
  try {
    const res = await fetch(`/api/fees?code=${encodeURIComponent(code)}&date=${encodeURIComponent(date)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    renderResults(data);
  } catch (err) { showError(err.message); } finally { setLoading(false); }
}

function renderResults(data) {
  lastApiData = data;

  // ── Meta ──────────────────────────────────────────────────────
  els.resultCode.textContent = data.code;
  els.resultDesc.textContent = data.description ?? `Code ${data.code}`;
  els.resultPeriod.textContent = `${formatBelgianDate(data.period.start)} → ${data.period.end ? formatBelgianDate(data.period.end) : 'En cours'}`;

  if (data.document?.link) {
    const link = document.getElementById('result-doc-link');
    if (link) { link.href = data.document.link; link.classList.remove('hidden'); }
    const name = document.getElementById('result-doc-name');
    if (name) name.textContent = data.document.name ?? 'Document officiel';
  }

  // ── Agréé — remplissage des montants ──────────────────────────
  const bimTM  = getBestFee(data, '3300', '3510');
  const bimOA  = getBestFee(data, '1300', '1510');
  const normTM = getBestFee(data, '3600', '3810');
  const normOA = getBestFee(data, '1600', '1810');

  els.price3300.textContent = formatEuro(bimTM.value);
  els.price1300.textContent = formatEuro(bimOA.value);
  els.price3600.textContent = formatEuro(normTM.value);
  els.price1600.textContent = formatEuro(normOA.value);

  els.price3300.previousElementSibling.textContent = `Part personnelle · code ${bimTM.usedCode}`;
  els.price1300.previousElementSibling.textContent = `Remboursement · code ${bimOA.usedCode}`;
  els.price3600.previousElementSibling.textContent = `Part personnelle · code ${normTM.usedCode}`;
  els.price1600.previousElementSibling.textContent = `Remboursement · code ${normOA.usedCode}`;

  els.totalBim.textContent    = (bimTM.value  !== null && bimOA.value  !== null) ? formatEuro(round2(bimTM.value  + bimOA.value))  : '—';
  els.totalNonBim.textContent = (normTM.value !== null && normOA.value !== null) ? formatEuro(round2(normTM.value + normOA.value)) : '—';

  // ── Stagiaire — calcul et remplissage ────────────────────────
  const stag = computeStagiaire(data);

  els.stagTmBim.textContent      = formatEuro(stag.tmBim);
  els.stagOaBim.textContent      = formatEuro(stag.oaBim);
  els.stagTotalBim.textContent   = formatEuro(stag.honoraireBim);
  els.stagBaseBim.textContent    = stag.honoraireBim !== null
    ? `${formatEuro(bimTM.value + bimOA.value)} × 75%`
    : '';

  els.stagTmNonBim.textContent      = formatEuro(stag.tmNonBim);
  els.stagOaNonBim.textContent      = formatEuro(stag.oaNonBim);
  els.stagTotalNonBim.textContent   = formatEuro(stag.honairaireNonBim);
  els.stagBaseNonBim.textContent    = stag.honairaireNonBim !== null
    ? `${formatEuro(normTM.value + normOA.value)} × 75%`
    : '';

  showResults();
  applyFilters();
}

/**
 * Calcule les tarifs stagiaire (75%) depuis les données agréé.
 * Règles :
 *   - Honoraire stagiaire = round2(honoraire_agréé × 0.75)   [arrondi standard]
 *   - TM patient           = identique à l'agréé               [inchangé]
 *   - Intervention OA      = honoraire_stagiaire − TM          [par déduction]
 */
function computeStagiaire(data) {
  const bimTM  = getBestFee(data, '3300', '3510').value;
  const bimOA  = getBestFee(data, '1300', '1510').value;
  const normTM = getBestFee(data, '3600', '3810').value;
  const normOA = getBestFee(data, '1600', '1810').value;

  const honoraireAgree    = (bimTM  !== null && bimOA  !== null) ? round2(bimTM  + bimOA)  : null;
  const honoraireNonAgree = (normTM !== null && normOA !== null) ? round2(normTM + normOA) : null;

  const honoraireStagBim    = honoraireAgree    !== null ? round2(honoraireAgree    * 0.75) : null;
  const honoraireStagNonBim = honoraireNonAgree !== null ? round2(honoraireNonAgree * 0.75) : null;

  return {
    // BIM
    tmBim        : bimTM,                                                               // inchangé
    oaBim        : (honoraireStagBim  !== null && bimTM  !== null) ? round2(honoraireStagBim  - bimTM)  : null,
    honoraireBim : honoraireStagBim,
    // Non-BIM
    tmNonBim     : normTM,                                                              // inchangé
    oaNonBim     : (honoraireStagNonBim !== null && normTM !== null) ? round2(honoraireStagNonBim - normTM) : null,
    honairaireNonBim: honoraireStagNonBim,
  };
}

/**
 * Applique les deux filtres (statut patient + type médecin) sans nouvel appel API.
 * Appelée à chaque changement de select ET après chaque renderResults.
 */
function applyFilters() {
  const status = els.statusInput.value;   // 'all' | 'bim' | 'non-bim'
  const doctor = els.doctorInput.value;   // 'agree' | 'stagiaire' | 'both'

  // ── Visibilité des blocs médecin ─────────────────────────────
  els.blockAgree.classList.toggle('hidden',    doctor === 'stagiaire');
  els.blockStagiaire.classList.toggle('hidden', doctor === 'agree');

  // ── Filtre patient dans le bloc Agréé ────────────────────────
  applyPatientFilter(els.colBim, els.colNonBim, status);

  // ── Filtre patient dans le bloc Stagiaire ────────────────────
  applyPatientFilter(els.stagColBim, els.stagColNonBim, status);
}

/** Masque/affiche les colonnes BIM et Non-BIM selon le filtre patient, et adapte la grille. */
function applyPatientFilter(colBimEl, colNonBimEl, status) {
  if (!colBimEl || !colNonBimEl) return;
  const grid = colBimEl.closest('.prices-grid');

  colBimEl.classList.remove('hidden');
  colNonBimEl.classList.remove('hidden');
  grid?.classList.remove('single-col');

  if (status === 'bim')     { colNonBimEl.classList.add('hidden'); grid?.classList.add('single-col'); }
  if (status === 'non-bim') { colBimEl.classList.add('hidden');    grid?.classList.add('single-col'); }
}

// ============================================================================
// TAB 2 : AUDIT BASE DE DONNÉES (GROUPÉ & FILTRÉ)
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
    complete: function (results) {
      const data = results.data;

      const requiredCols = ['id', 'type', 'inami', 'tm_price', 'oa_price', 'insurance_category'];
      const missing = requiredCols.filter(c => !results.meta.fields.includes(c));
      if (missing.length > 0) {
        alert(`Erreur de structure. Colonnes manquantes dans le CSV : ${missing.join(', ')}`);
        resetAuditUI();
        return;
      }

      const rowsToProcess = data.filter(r => typeFilter === 'all' || r.type === typeFilter);

      if (rowsToProcess.length === 0) {
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
  const processedData = []; // Pour stocker les lignes traitées avant de les grouper

  // 1. Collecte et vérification des données (sans afficher)
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const code = row.inami.replace(/\D/g, '');

    els.progressText.textContent = `Analyse en cours... ${i + 1} / ${rows.length}`;
    els.progressBar.style.width = `${((i + 1) / rows.length) * 100}%`;

    let inamiData = inamiCache[code];
    if (!inamiData) {
      try {
        const res = await fetch(`/api/fees?code=${code}&date=${date}`);
        if (res.ok) {
          inamiData = await res.json();
          inamiCache[code] = inamiData;
        }
      } catch (e) { console.error("Erreur sur le code", code); }
    }

    let officialTm = null;
    let officialOa = null;
    let needsUpdate = false;
    let rowStatusCategory = 'ok';
    let statusHTML = '';

    if (inamiData && inamiData.fees) {
      if (row.insurance_category.toLowerCase() === 'bim') {
        officialTm = getBestFee(inamiData, '3300', '3510').value;
        officialOa = getBestFee(inamiData, '1300', '1510').value;
      } else {
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
        rowStatusCategory = 'obsolete';
        statusHTML = `<span style="color:#ef4444; font-weight:bold;">❌ Obsolète</span>`;

        // On stocke juste les données brutes pour construire la CTE plus tard
        sqlQueries.push({
          id: row.id,
          inami: row.inami,
          cat: row.insurance_category || 'non spécifié',
          oldTm: currentTm, newTm: officialTm,
          oldOa: currentOa, newOa: officialOa
        });
      } else {
        okCount++;
        rowStatusCategory = 'ok';
        statusHTML = `<span style="color:#10b981; font-weight:bold;">✅ À jour</span>`;
      }
    } else {
      needsUpdate = true;
      obsoleteCount++;
      rowStatusCategory = 'obsolete';
      statusHTML = `<span style="color:#f59e0b;">⚠️ Introuvable RIZIV</span>`;
    }

    // On stocke le résultat traité
    processedData.push({
      ...row,
      codeINAMI: row.inami, // On groupe par l'affichage d'origine du CSV
      currentTm, currentOa, officialTm, officialOa,
      needsUpdate, statusHTML, rowStatusCategory
    });
  }

  // 2. Groupement des données par Code INAMI
  const groupedData = {};
  processedData.forEach(item => {
    if (!groupedData[item.codeINAMI]) groupedData[item.codeINAMI] = [];
    groupedData[item.codeINAMI].push(item);
  });

  // 3. Affichage HTML par groupe
  Object.keys(groupedData).sort().forEach(inamiCode => {
    const items = groupedData[inamiCode];

    // Ligne d'en-tête du groupe
    const headerTr = document.createElement('tr');
    headerTr.className = 'group-header-row';
    headerTr.style.background = '#f8fafc';
    headerTr.style.borderTop = '2px solid #cbd5e1';
    headerTr.style.borderBottom = '1px solid #e2e8f0';
    headerTr.innerHTML = `
      <td colspan="6" style="padding: 0.75rem; font-weight: 600; color: #0f172a;">
        Code INAMI : <span style="color: var(--primary); font-size: 1.1em;">${inamiCode}</span> 
        <span style="font-weight: 400; color: #64748b; font-size: 0.85em; margin-left: 0.5rem;">
          (${items.length} ligne${items.length > 1 ? 's' : ''} associée${items.length > 1 ? 's' : ''})
        </span>
      </td>
    `;
    els.tbodyResults.appendChild(headerTr);

    // Lignes de détail
    items.forEach(item => {
      const tr = document.createElement('tr');
      tr.className = 'audit-data-row';
      tr.dataset.status = item.rowStatusCategory;
      tr.style.borderBottom = "1px solid #e2e8f0";
      tr.style.background = item.needsUpdate ? "#fef2f2" : "transparent";

      tr.innerHTML = `
        <td style="padding: 0.75rem; padding-left: 2rem;">ID: ${item.id}</td>
        <td style="padding: 0.75rem; color: #64748b;">${item.inami}</td>
        <td style="padding: 0.75rem;">${item.type}<br><strong style="font-size: 0.85em;">${item.insurance_category.toUpperCase()}</strong></td>
        <td style="padding: 0.75rem; ${item.needsUpdate ? 'text-decoration:line-through; color:#94a3b8;' : ''}">TM: ${item.currentTm} €<br>OA: ${item.currentOa} €</td>
        <td style="padding: 0.75rem;"><strong>TM: ${item.officialTm !== null ? item.officialTm : '?'} €<br>OA: ${item.officialOa !== null ? item.officialOa : '?'} €</strong></td>
        <td style="padding: 0.75rem;">${item.statusHTML}</td>
      `;
      els.tbodyResults.appendChild(tr);
    });
  });

  els.progressSec.classList.add('hidden');
  els.resultsSecComp.classList.remove('hidden');
  els.btnRunCompare.disabled = false;

  els.countOk.textContent = okCount;
  els.countObsolete.textContent = obsoleteCount;

  // Réinitialiser le filtre d'affichage sur "Tous" à la fin de l'analyse
  if (els.auditFilter) {
    els.auditFilter.value = 'all';
    applyAuditFilter();
  }

// Construction du SQL final avec CTE pour un seul tableau de retour
  if (sqlQueries.length > 0) {
    els.sqlSection.classList.remove('hidden');
    
    let cteParts = [];
    let unionParts = [];
    
    sqlQueries.forEach((q, index) => {
      const alias = `upd${index + 1}`;
      cteParts.push(
        `  ${alias} AS (\n` +
        `    UPDATE consultation_consultation SET tm_price = ${q.newTm}, oa_price = ${q.newOa} WHERE id = ${q.id}\n` +
        `    RETURNING inami, '${q.cat}' AS categorie, ${q.oldTm} AS old_tm, tm_price AS new_tm, ${q.oldOa} AS old_oa, oa_price AS new_oa\n` +
        `  )`
      );
      unionParts.push(`SELECT * FROM ${alias}`);
    });

    const finalSql = 
      `BEGIN;\n\n` +
      `WITH\n` +
      `${cteParts.join(',\n')}\n` +
      `${unionParts.join('\nUNION ALL\n')};\n\n` +
      `-- ⚠️ ATTENTION : La transaction est ouverte.\n` +
      `-- Vérifiez les résultats dans le tableau ci-dessus.\n` +
      `-- Si tout est correct, exécutez :\n` +
      `-- COMMIT;\n` +
      `-- Sinon, annulez avec :\n` +
      `-- ROLLBACK;`;

    // Utilisation de textContent pour éviter les problèmes d'interprétation HTML
    els.sqlCode.textContent = finalSql;
  } else {
    els.sqlSection.classList.add('hidden');
  }
}

// Fonction de filtrage (Lignes + En-têtes de groupe)
function applyAuditFilter() {
  if (!els.auditFilter) return;
  const filterVal = els.auditFilter.value;

  // Étape 1 : Masquer/Afficher les lignes de données
  const dataRows = els.tbodyResults.querySelectorAll('.audit-data-row');
  dataRows.forEach(row => {
    const status = row.dataset.status;
    row.style.display = (filterVal === 'all' || filterVal === status) ? '' : 'none';
  });

  // Étape 2 : Masquer les en-têtes de groupe si toutes leurs lignes sont masquées
  const headers = els.tbodyResults.querySelectorAll('.group-header-row');
  headers.forEach(header => {
    let hasVisibleChild = false;
    let nextNode = header.nextElementSibling;

    // Parcourt les lignes sous l'en-tête jusqu'au prochain en-tête
    while (nextNode && nextNode.classList.contains('audit-data-row')) {
      if (nextNode.style.display !== 'none') {
        hasVisibleChild = true;
        break;
      }
      nextNode = nextNode.nextElementSibling;
    }

    header.style.display = hasVisibleChild ? '' : 'none';
  });
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
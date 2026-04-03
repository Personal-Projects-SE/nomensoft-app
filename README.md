# INAMI Nomensoft Viewer

Application locale de consultation des tarifs INAMI (nomenclature RIZIV).

## Prérequis

- [Node.js](https://nodejs.org/) v18+

## Installation

```bash
cd nomensoft-app
npm install
```

## Démarrage

```bash
npm start
```

Ouvrez ensuite [http://localhost:3000](http://localhost:3000) dans votre navigateur.

## Fonctionnalités

| Onglet | Statut | Description |
|--------|--------|-------------|
| Tarifs par date | ✅ Disponible | Tarifs BIM / Non-BIM pour un code + date |
| Comparaison BIM / Non-BIM | 🔜 Bientôt | — |
| Historique des tarifs | 🔜 Bientôt | — |

## Architecture

```
nomensoft-app/
├── server.js          # Express + proxy INAMI (évite les problèmes CORS)
├── public/
│   ├── index.html     # SPA - page unique avec onglets
│   ├── css/app.css    # Styles (CSS custom properties, responsive)
│   └── js/app.js      # Logique frontend (Vanilla JS)
└── package.json
```

## Codes de tarification

| Code | Libellé | Cas d'usage |
|------|---------|-------------|
| 3300 | Part personnelle bénéficiaires **BIM** | Ticket modérateur patient BIM |
| 3600 | Part personnelle bénéficiaires **non-BIM** | Ticket modérateur patient non-BIM |
| 1300 | Intervention OA bénéficiaires **BIM** | Remboursement mutuelle BIM |
| 1600 | Intervention OA bénéficiaires **non-BIM** | Remboursement mutuelle non-BIM |

Honoraire total = Part personnelle + Intervention OA

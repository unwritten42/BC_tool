# Release checklist — BC_tools (conservativo)

## Obiettivo
Verificare che il pacchetto contenga **solo** file runtime necessari e che tooling/documentazione non entrino nell’artefatto di distribuzione.

## Includere nel pacchetto runtime
- `manifest.json`
- Tutti i file referenziati direttamente da `manifest.json`, popup/ options HTML e content scripts, inclusi:
  - `src/**` usati da manifest o HTML
  - `assets/**` usati da manifest/HTML (icons, svg, ecc.)

## Escludere (tooling/documentazione)
Questi non devono entrare nel pacchetto runtime, salvo necessità tecnica dimostrata:
- `.agents/`
- `.codebase-memory/`
- `.mcp.json`
- `skills-lock.json`
- `docs/`
- `tests/`
- `tools/`
- `node_modules/`
- `package.json` e `package-lock.json`
- `.vscode/`

## Verifiche prima del rilascio
- Eseguire `npm run build`: crea `dist/`, la cartella caricabile come estensione unpacked e contenente il runtime.
- Eseguire `npm test`; per i controlli UI, dopo `npx playwright install chromium`, eseguire `npm run test:ui`.
- `manifest.json` entry point corretti (background/service worker, options_ui.page, action.default_popup, content_scripts js/css order).
- Tutti i percorsi in `manifest.json` esistono su disco.
- Le icone dichiarate nel manifest esistono e hanno le dimensioni corrispondenti.
- Tutti gli script linkati in `src/popup/popup.html` e `src/options/index.html` esistono e l’ordine rispetta le dipendenze.
- Nessun duplicato o listener doppio introdotto.
- La diagnostica condivisa usa lo stesso payload e non cambia schema.

## Restyling dell'interfaccia
- Includere font e icone locali referenziati e le rispettive licenze in `assets/vendor/`.
- Eseguire `npm test` e, dopo `npx playwright install chromium`, `npm run test:ui`.
- Il controllo browser usa un profilo temporaneo isolato e fixture sintetiche: non modifica il profilo Chrome personale.
- Verificare temi chiaro/scuro, layout popup A/Verticale e opzioni a 1440, 1024 e 390 px, senza controlli fuori schermo.
- Verificare gli stili Moderno/Classico dalla modalità Personalizza, il salvataggio in `visualStyle`, il mantenimento della scelta dopo reload e l'applicazione a popup e impostazioni.
- Confermare filtri vuoti/numerosi, testi lunghi, apertura tabella, navigazione categorie, salvataggio, modelli ZPL, caricamento/validazione RDLC, manuale e anteprima preset.
- Verificare in Business Central reale i comandi contestuali ZPL/Saldo/export, la stampa e il rendering remoto Labelary prima del rilascio: le fixture del controllo UI non li certificano.
- Conservare ordine script, chiavi storage, messaggi, ID e tipi dei controlli, condizioni dei comandi e algoritmi esistenti.
- Confrontare le schermate prodotte con le anteprime in [restyling](restyling.md); non sono file o mockup Figma.

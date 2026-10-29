# Restyling BC_tools

Il restyling riguarda popup, categorie e form delle impostazioni, strumenti ZPL/RDLC, manuale, assistenza e dialoghi. Restano invariati routing, salvataggio, chiavi storage, messaggi, condizioni dei comandi e algoritmi. Il codice iniettato in Business Central non e stato modificato.

## Stili selezionabili

Durante **Personalizza** compare il selettore **Stile applicazione**. `Moderno` e il default; `Classico` riattiva i fogli CSS precedenti, salvati senza modifiche in `src/popup/styles/popup.classic.css` e `src/options/styles/options.classic.css`. La preferenza `visualStyle` e sincronizzata tramite il salvataggio impostazioni esistente e si applica al popup alla successiva apertura. Il tema chiaro/scuro e il layout popup restano indipendenti.

Anteprime classiche generate con Chromium e dati sintetici:

- [Popup classico](restyling/popup-classic-light.png)
- [Impostazioni classiche durante Personalizza](restyling/settings-classic.png)

I CSS classici sono stati confrontati con la copia pre-restyling tramite SHA-256 e risultano identici.

## Anteprime dell'implementazione

Schermate dell'estensione caricata in Chromium, con soli dati sintetici:

- [Popup compatto chiaro](restyling/popup-a-light.png)
- [Popup verticale scuro](restyling/popup-vertical-dark.png)
- [Categorie delle impostazioni](restyling/settings-light.png)
- [Impostazioni UI](restyling/settings-ui-light.png)

Queste immagini documentano l'implementazione, non un progetto Figma. Il collegamento autenticato al server Figma non era disponibile durante il lavoro; non e stato creato alcun file Figma.

## Verifica ripetibile

```powershell
npm ci
npx playwright install chromium
npm test
npm run test:ui
```

Playwright e una dipendenza esclusivamente di sviluppo. Lo script usa Chromium con l'estensione realmente caricata, un profilo temporaneo che viene eliminato e fixture senza dati aziendali. Gli screenshot completi vengono scritti nella directory temporanea `bc-tools-ui-restyle`, oppure nel percorso indicato da `BC_TOOLS_UI_OUTPUT`.

Per confrontare ID e tipi dei controlli delle sei sezioni con una copia precedente completa dell'estensione:

```powershell
$env:BC_TOOLS_BASELINE = 'C:\percorso\copia-precedente'
npm run test:ui
```

Il controllo copre entrambi gli stili in Personalizza e nel popup, persistenza dopo reload, due temi e layout popup, tutte le categorie a tre larghezze, assenza di overflow orizzontale, caricamento immagini, ricerca categorie, navigazione, persistenza di un'impostazione e di un filtro, apertura tabelle, modelli ZPL, caricamento/validazione RDLC e dialoghi manuale/preset. Il contesto Business Central e una pagina sintetica; non certifica stampa, rendering Labelary o operazioni su dati BC reali. I test Node esistenti restano separati.

## Asset locali

- Icone: [Lucide](https://github.com/lucide-icons/lucide), commit `03f11e2d6adc319ea21e9a1d5820a99cd3767257`, solo SVG utilizzati e licenza ISC inclusa.
- Font: [Source Sans 3](https://github.com/adobe-fonts/source-sans), commit `87b37a2daaed80fcb8e8ccb0085c4d72ddade12e`, WOFF2 Regular/Semibold e licenza OFL inclusa.

Nessun font, icona o script viene caricato da CDN durante l'uso. Permessi e dipendenze runtime dell'estensione non cambiano. Tooling, test, documentazione e dipendenze di sviluppo vanno esclusi dal pacchetto come indicato nella [checklist di rilascio](release-checklist.md).
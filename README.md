# BC_tools

<p align="center">
  <img src="assets/icons/icon-128.png" width="88" alt="Logo BC_tools" />
</p>

<p align="center">
  Strumenti rapidi per lavorare ogni giorno con Microsoft Dynamics 365 Business Central.
</p>

<p align="center">
  <a href="#funzionalità">Funzionalità</a> ·
  <a href="#installazione">Installazione</a> ·
  <a href="#sviluppo">Sviluppo</a> ·
  <a href="docs/BC_tools_funzioni.md">Manuale completo</a>
</p>

BC_tools è un'estensione Manifest V3 per Microsoft Edge che raccoglie in un unico popup scorciatoie, ricerche e strumenti configurabili per Business Central.

## Funzionalità

| ⚡ **Azioni rapide** | 🎛️ **Interfaccia configurabile** |
| --- | --- |
| Apri pagine e tabelle, usa ricerche rapide e filtri salvati, oppure acquisisci il Page ID dalla scheda corrente. | Personalizza il layout del popup e attiva le migliorie per pagine, FactBox, campi e righe di Business Central. |
| 📊 **Tabelle e ordinamento** | 🏷️ **Strumenti ZPL** |
| Esporta le righe caricate nella tabella e configura l'ordinamento automatico sulle pagine desiderate. | Visualizza e modifica etichette ZPL, prepara anteprime e gestisci modelli e dati delle stampanti. |

Sono inoltre disponibili l'importazione e l'esportazione delle impostazioni in JSON, temi e strumenti di diagnostica.

> **Nota sull'esportazione:** l'esportazione tabellare include le righe attualmente caricate nella pagina Business Central; potrebbe quindi non contenere l'intero risultato.

## Requisiti

- Microsoft Edge con supporto alle estensioni Manifest V3.
- Accesso al client web di Business Central su `businesscentral.dynamics.com`.
- Connessione Internet per generare le anteprime ZPL tramite Labelary.

## Installazione

Per caricare una copia locale dell'estensione:

1. Clona o scarica questo repository.
2. Dalla cartella del progetto, esegui `npm ci` e poi `npm run build`.
3. Apri `edge://extensions` e attiva **Modalità sviluppatore**.
4. Seleziona **Carica non pacchettizzata** e scegli la cartella `dist` generata al punto 2.
5. Apri Business Central e configura le funzioni dal popup di BC_tools.

### Avviso nuove versioni

All'apertura del popup, BC_tools controlla la versione pubblicata nel [manifest del repository](https://raw.githubusercontent.com/unwritten42/BC_tool/main/manifest.json). Se è più recente, mostra un avviso con un link alle modifiche su GitHub. L'avviso non scarica né installa aggiornamenti: per aggiornare una copia locale, scarica il codice aggiornato, esegui di nuovo la build e ricarica l'estensione da `edge://extensions`. Per segnalare una nuova versione, aggiorna `version` in `manifest.json` e pubblica la modifica sul branch `main`.

## Sviluppo

```bash
npm ci
npm test
npm run test:ui
npm run build
```

La build valida i riferimenti locali e prepara la cartella `dist`, pronta da caricare come estensione non pacchettizzata.

## Privacy e dati

Le configurazioni e la diagnostica vengono salvate nell'archiviazione dell'estensione. All'apertura del popup viene contattato GitHub per verificare la versione pubblicata. La generazione delle anteprime invia il contenuto ZPL al servizio esterno Labelary: verifica le regole aziendali prima di inviare etichette che contengono dati riservati o personali.

## Documentazione

Consulta il [manuale completo](docs/BC_tools_funzioni.md) per istruzioni d'uso, impostazioni, limiti noti, privacy e risoluzione dei problemi.

## Segnalazioni e contributi

Segnalazioni e contributi sono benvenuti. Per facilitare la verifica, indica i passaggi per riprodurre il problema e la versione del browser; rimuovi dati aziendali, personali e URL sensibili da screenshot e log.

# BC_tools 3.2 - Manuale completo

## 1. Scopo del manuale

BC_tools è un'estensione Microsoft Edge Manifest V3 progettata per velocizzare attività ricorrenti nel client Web di Dynamics 365 Business Central. Questo manuale descrive il comportamento verificato nei file del progetto, l'uso operativo delle funzioni, i dati salvati, i limiti noti e le procedure di diagnosi.

Il manuale distingue tra:

- funzioni disponibili nel popup dell'estensione;
- configurazione nella pagina Impostazioni;
- modifiche applicate all'interfaccia Business Central;
- automazioni di ordinamento;
- strumenti ZPL;
- importazione, esportazione e diagnostica;
- architettura tecnica, sicurezza e limiti.

> Nota: le etichette dell'interfaccia possono essere abbreviate rispetto alle descrizioni riportate qui. La versione analizzata è la 3.2.

## 2. Requisiti e ambito operativo

### 2.1 Requisiti

Per utilizzare BC_tools servono:

1. Microsoft Edge con l'estensione installata e attiva.
2. Accesso al client Web di Dynamics 365 Business Central.
3. Una sessione autenticata quando si usano funzioni che leggono o modificano la pagina Business Central corrente.
4. Una scheda Business Central valida al momento di un'azione che apre una pagina.
5. Accesso a Internet per la generazione delle anteprime ZPL tramite Labelary.

### 2.2 Siti ai quali l'estensione accede

I content script vengono eseguiti sulle pagine che corrispondono a:

```text
https://businesscentral.dynamics.com/*
```

La generazione delle immagini ZPL usa inoltre:

```text
https://api.labelary.com/*
```
### 2.3 Permessi dichiarati

L'estensione richiede:

- `activeTab`: consente di interagire con la scheda attiva dopo un'azione dell'utente;
- `storage`: consente di salvare configurazioni e diagnostica;
- `contextMenus`: consente di costruire il menu contestuale di ricerca.

Non è dichiarato il permesso generale `tabs`.

BC_tools è composta da quattro aree principali.

### 3.1 Popup

Il popup è la finestra aperta dall'icona dell'estensione. Offre:

- apertura diretta di tabelle;
- accesso alle tabelle salvate;
- ricerche rapide configurabili;
- acquisizione del Page ID dalla scheda Business Central;
- aggiunta rapida della pagina corrente all'ordinamento automatico;
- collegamento alla pagina 8700;
- accesso alle Impostazioni;
- accesso allo ZPL Viewer nelle pagine supportate.

### 3.2 Pagina Impostazioni

La pagina Impostazioni gestisce:

- migliorie dell'interfaccia Business Central;
- layout del popup;
- ordinamento automatico;
- filtri di ricerca;
- tabelle salvate;
- ZPL Viewer;
- importazione ed esportazione;
- diagnostica;
- tema e organizzazione della dashboard.

### 3.3 Content script

I content script operano direttamente nel DOM di Business Central per:

- applicare le migliorie visive;
- inserire il pulsante di copia del codice articolo;
- aggiungere pulsanti di copia ai campi cliccabili o FlowField riconosciuti;
- evidenziare le righe in base allo stato;
- aprire la ricerca nella pagina principale, se abilitato;
- aprire automaticamente il comando riconosciuto **Mostra il resto**;
- mantenere il layout pagina e lo stato della FactBox scelti, se i rispettivi flag sono attivi;
- ordinare la prima colonna nelle sole pagine autorizzate;
- aprire documenti creati riconosciuti nei dialog Business Central;
- acquisire dati dalle griglie per l'esportazione tabellare e dalle pagine ZPL/stampa supportate.

### 3.4 Service worker

Il service worker Manifest V3:

- salva le impostazioni riconosciute;
- mantiene il mirror locale delle impostazioni UI;
- raccoglie la diagnostica;
- inoltra il comando da tastiera per Wide/Normal;
- costruisce e aggiorna il menu contestuale;
- risolve il contesto della scheda sorgente e costruisce gli URL Business Central.

## 4. Primo avvio consigliato

### 4.1 Aprire le Impostazioni

1. Selezionare l'icona di BC_tools nella barra di Edge.
2. Nel popup, selezionare l'icona a forma di ingranaggio.
3. Si apre la pagina Impostazioni in una scheda dedicata.

### 4.2 Eseguire un'azione nel contesto corrente

1. Aprire la scheda Business Central desiderata.
2. Aprire BC_tools e configurare un filtro o una tabella preferita.
3. Eseguire l'azione dal popup: il contesto viene letto dalla scheda attiva in quel momento.
4. Il mirino acquisisce soltanto Page ID e descrizione per compilare una riga filtro.
5. L'ambiente e la società non vengono salvati nelle impostazioni.

### 4.3 Configurazione iniziale minima

1. Aggiungere almeno una tabella preferita o un filtro rapido.
2. Aprire la scheda Business Central da usare.
3. Verificare ambiente e società nel risultato aperto.
4. Esportare un backup JSON della configurazione.

## 5. Popup rapido

## 5.1 Struttura del popup

Il popup contiene:

- intestazione con logo e comandi rapidi;
- area **Azioni rapide** con card dinamiche;
- campo Table Viewer;
- filtri salvati visibili;
- accesso alle tabelle salvate;
- indicazione che il tasto Invio esegue l'azione del campo attivo;
- notifiche temporanee di esito;
- finestre modali per la lista tabelle.

La larghezza predefinita del popup è 560 pixel e l'altezza massima è 600 pixel, con scorrimento quando necessario.

## 5.2 Table Viewer

### Scopo
Apre direttamente una tabella Business Central partendo dal relativo ID numerico.

### Procedura

1. Aprire il popup.
2. Individuare la card **Table Viewer**.
3. Inserire l'ID numerico della tabella.
4. Premere **Invio** oppure il pulsante di apertura.
5. L'estensione usa la scheda Business Central attiva e sostituisce il parametro `table`.
6. La tabella viene aperta in una nuova scheda.

### Validazione

- L'ID deve essere numerico.
- Se la scheda attiva non è Business Central o il contesto non è valido, l'azione mostra un errore e non apre una scheda.
- La disponibilità effettiva della tabella dipende dai permessi Business Central dell'utente.

## 5.3 Tabelle salvate

### Scopo

Mostra i collegamenti configurati nella pagina Impostazioni.

### Procedura

1. Aprire il popup.
2. Selezionare **Salvate**.
3. Nella finestra modale consultare le tabelle salvate.
4. Selezionare la tabella desiderata.
5. Chiudere la finestra con **Chiudi** se non si vuole aprire alcuna voce.

È possibile salvare più tabelle; ogni elemento aggiunto mostra una nuova riga vuota pronta da compilare.

## 5.4 Ricerca rapida

Ogni filtro configurato e non marcato **No popup** genera una card nel popup.

### Procedura

1. Aprire il popup.
2. Individuare la card con la label configurata.
3. Inserire il valore da cercare.
4. Premere Invio oppure il pulsante della card.
5. L'estensione applica gli asterischi configurati a sinistra o a destra.
6. Costruisce l'URL con pagina, campo e filtro.
7. Apre la ricerca nella scheda Business Central attiva al momento dell'esecuzione.

La query usa `%20` per gli spazi, come indicato nella [documentazione Microsoft sul Web client URL](https://learn.microsoft.com/en-us/dynamics365/business-central/dev-itpro/developer/devenv-web-client-urls). Il parametro `bookmark` non viene trasferito: identifica il record selezionato nella pagina sorgente e può interferire con la destinazione filtrata.

### Wildcard

- `*val`: aggiunge un asterisco prima del valore.
- `val*`: aggiunge un asterisco dopo il valore.
- entrambe le opzioni: costruiscono una ricerca del tipo `*valore*`.

Gli asterischi modificano il criterio passato a Business Central. Il risultato dipende dalle regole di filtro del campo di destinazione.

### Apertura automatica del risultato unico

Le ricerche avviate dal popup e dal menu contestuale mantengono il marcatore `#bc-tools-open-single`. Dopo il caricamento e l’applicazione del filtro, BC_tools conta le righe dati visibili nelle griglie: apre il documento soltanto se il totale è esattamente una riga, stabile e valida. L’apertura non richiede che la scheda Business Central sia attiva o che la riga abbia già il focus: usa il focus esistente, una sola azione visibile non secondaria oppure la riga, se non ci sono azioni figlie. Se più azioni sono plausibili, non forza l’apertura. Griglie visibili senza righe non impediscono l’apertura; due o più righe complessive, anche distribuite su più griglie, non vengono aperte. La griglia, la firma dei valori visibili e l’azione devono rimanere coerenti per almeno tre controlli consecutivi e non devono essere presenti indicatori visibili di caricamento, errore o assenza risultati.

I valori dichiarativi `aria-rowcount` e `aria-setsize` non partecipano più alla decisione: una singola riga visibile, stabile e apribile può essere aperta anche quando tali metadati sono obsoleti. Se l'ordinamento automatico di BC_tools riscrive il parametro `filter` mentre ordina la stessa pagina, società e contesto, la ricerca conserva il job e continua a controllare il risultato usando il filtro aggiornato. La riconciliazione viene condivisa tra il frame principale e gli iframe Business Central e accetta soltanto un ordinamento automatico avviato dopo il job e riferito allo stesso contesto; le modifiche al filtro non correlate al sort continuano ad annullare il job. Con zero righe, più righe, riga non apribile, cambio di pagina o timeout, la ricerca non forza alcuna apertura. Restano invariati filtro, wildcard, Page ID e società della scheda sorgente.

#### Limiti e test

- I wrapper annidati equivalenti vengono deduplicati; le righe dati vengono contate complessivamente anche se presenti in griglie indipendenti.
- Sono esclusi checkbox, menu, ellissi, copia, informazioni, eliminazione, modifica e pulsanti aggiunti da BC_tools.
- Se esistono più link plausibili nella stessa riga e non è possibile identificare quello principale, non viene eseguita alcuna azione.
- Il job mantiene la scadenza di 180 secondi e il ciclo operativo massimo di 120 secondi, per tollerare caricamenti lenti della pagina e dei risultati.
- Verificare ricerche esatte e con wildcard, zero/uno/più risultati, griglie virtualizzate, righe ricreate, metadati ARIA obsoleti, Enter, popup, menu contestuale, cambio pagina e timeout.

## 5.5 Pagina 8700

Il pulsante con il segnalibro apre la pagina 8700 usando la scheda Business Central attiva al momento del click.

## 5.6 Mirino

Il pulsante con il mirino acquisisce dalla scheda Business Central attiva:

- Page ID;
- descrizione della pagina, quando individuabile.

Non acquisisce né salva tenant, ambiente o società.

### Limiti

- La scheda attiva deve appartenere a Business Central.
- Il Page ID deve essere ricavabile dall'URL o dal contesto supportato.
- Le pagine aperte con solo `bookmark` possono non esporre il Page ID numerico.

## 5.7 Aggiungi pagina al sort

Il pulsante dedicato aggiunge il Page ID della scheda attiva alla lista **Pagine incluse**.

Procedura:

1. aprire in Business Central la pagina da ordinare automaticamente;
2. aprire BC_tools;
3. selezionare **Aggiungi pagina al sort**;
4. verificare nelle Impostazioni che l'ID compaia nella lista;
5. attivare **Ordinamento automatico**, se non è già attivo.

La lista viene normalizzata, deduplicata e ordinata numericamente.

## 5.8 Pulsante ZPL contestuale

Quando la pagina Business Central corrente è la 5107911, il popup mostra il pulsante **ZPL**.

Il pulsante:

1. cerca la griglia corretta;
2. individua semanticamente la colonna **Stringa fissa**;
3. scorre la griglia per acquisire le righe;
4. ricompone i dati nel loro ordine;
5. conserva il blocco delimitato da `^XA` e `^XZ`;
6. trasferisce il contenuto una sola volta allo ZPL Viewer;
7. avvia automaticamente la generazione dell'anteprima.

## 5.9 Esportazione della tabella Business Central

L'azione è disponibile se **Esportazione tabelle** è attiva in **Migliorie UI** e la scheda corrente è una pagina Business Central il cui URL contiene un solo parametro `table=<ID>` numerico.

1. Aprire la pagina Business Central della tabella da esportare.
2. Aprire il popup e selezionare **Esporta tabella**.
3. Selezionare **Righe caricate** per acquisire le righe raggiungibili nella griglia.
4. Controllare l'esito della scansione e selezionare **Scarica XLSX**.

Il file Excel viene generato localmente. La funzione legge la griglia della pagina, non l'intero archivio Business Central: tabelle virtualizzate o scansioni interrotte possono produrre un'esportazione parziale. Il popup mostra un avviso e indica quando la scansione non è completa. Durante l'acquisizione, non cambiare scheda o navigazione.

## 5.10 Saldo articolo nei Movimenti warehouse

Attivare **Saldo articolo Movimenti warehouse** in **Migliorie UI**. Il popup mostra **Saldo articolo** soltanto quando la scheda attiva è la pagina 7318, **Movimenti warehouse**.

1. Aprire la vista e applicare i filtri desiderati in Business Central.
2. Aprire BC_tools e selezionare **Saldo articolo**.
3. Attendere l'analisi della griglia; il pannello nella pagina mostra il riepilogo e i dettagli per gruppo.
4. Selezionare un gruppo per consultare i movimenti associati.

L'analisi usa i movimenti della vista filtrata corrente e richiede che la griglia e le colonne necessarie siano riconosciute. Se la vista cambia durante la scansione, l'operazione viene annullata o richiede un aggiornamento. Il totale dei movimenti interni è informativo e non rappresenta la disponibilità dell'articolo.

## 6. Pagina Impostazioni

## 6.1 Dashboard

La pagina Impostazioni usa una dashboard a card. Le categorie previste sono:

- Migliorie UI;
- Ricerca e filtri;
- Tabelle;
- ZPL Viewer;
- Importa/Esporta;
- RDLC Field Mapper.

### Navigazione

1. Selezionare una card per aprirne il dettaglio.
2. Usare **Tutte le impostazioni** per tornare alla dashboard.
3. La navigazione aggiorna il frammento dell'URL con la categoria.
4. I tasti Indietro e Avanti del browser possono ripristinare la vista precedente.
5. Quando l'utente apre volontariamente una categoria dalla dashboard, la pagina registra nella sola `sessionStorage` della scheda la categoria richiesta, aggiorna l'hash ed esegue un unico reload controllato. Al nuovo caricamento riapre la stessa categoria e rimuove subito il marcatore anti-loop.
6. Il reload controllato non viene richiesto durante tour guidato, Personalizza, dialog aperti, navigazioni programmatiche, caricamento iniziale da hash, ripristino Indietro/Avanti, ritorno alla dashboard o riapertura successiva al reload. Il marcatore tecnico non usa `chrome.storage.sync` o `chrome.storage.local` e termina con la sessione della scheda.

Al primo avvio dopo l'installazione si apre la pagina Impostazioni, ma il tour non parte automaticamente. Per iniziarlo, aprire il menu dal pulsante di assistenza e selezionare **Tour guidato**.

### Ricerca categorie

Il campo di ricerca filtra le card in base a titolo, descrizione e tag. Se nessuna categoria corrisponde, viene mostrato un messaggio dedicato.

## 6.2 Salvataggio automatico

Le modifiche vengono salvate automaticamente. Una conferma visiva **Salvato** segnala il completamento.

Il salvataggio passa dal service worker tramite un messaggio esplicito. Il worker accetta solo chiavi presenti nell'elenco autorizzato. Questo impedisce alla pagina Opzioni di scrivere impostazioni arbitrarie attraverso quel contratto.

`chrome.storage.sync` è la fonte canonica delle configurazioni. Le principali impostazioni UI vengono anche rispecchiate localmente per rendere più affidabile l'applicazione immediata del tema e del layout popup.

## 6.3 Recupero dopo il ricaricamento dell'estensione

Una pagina Impostazioni già aperta può restare visibile dopo il reload di un'estensione unpacked, ma perdere l'accesso alle API `chrome.*` del vecchio contesto. La presenza di `runtime.id` non è considerata una prova sufficiente: BC_tools verifica una lettura innocua dello storage e tenta un ping del service worker.

Le normali interazioni non vengono intercettate né riprodotte: click, tastiera, checkbox, selettori e file picker mantengono l'attivazione originale. Tutte le operazioni runtime e storage della pagina passano da wrapper protetti con un unico contratto di esito. Un contesto invalidato interrompe l'operazione e richiede un solo reload; un worker temporaneamente non raggiungibile consente il fallback storage. Nessuna operazione viene dichiarata riuscita senza conferma della scrittura.

## 6.4 Tema

Il tema può essere chiaro o scuro.

- La scelta viene salvata.
- Il popup usa la stessa impostazione.
- I colori sono definiti nei fogli di stile, non iniettati dinamicamente con stringhe CSS.

## 6.5 Layout del popup

Sono disponibili:

- **Layout pop-up A**: versione compatta e modernizzata;
- **Layout pop-up verticale**: card più descrittive in disposizione verticale.

La scelta è salvata nello storage sincronizzato e mantenuta anche nel mirror locale.

## 7. Ricerca e filtri

## 7.1 Campi di una riga filtro

Ogni riga contiene:

- **Label**: testo mostrato all'utente;
- **Pagina**: ID numerico della pagina Business Central;
- **Campo**: nome del campo da filtrare;
- **\*val**: aggiunge una wildcard a sinistra;
- **val\***: aggiunge una wildcard a destra;
- **No popup**: esclude la riga dal popup senza rimuoverla dal menu contestuale.

Le proprietà legacy di ambiente e società eventualmente presenti nelle righe importate vengono ignorate e non vengono usate per le aperture.

## 7.2 Normalizzazione

- Le righe completamente vuote vengono eliminate dalla configurazione salvata.
- Le righe sono sanificate prima del salvataggio.
- Le label inserite nell'interfaccia sono trattate come testo.
- L'importazione accetta soltanto le proprietà riconosciute.

## 7.3 Configurazione operativa

1. Aprire **Ricerca e filtri**.
2. Compilare Label, Pagina e Campo.
3. Attivare le wildcard necessarie.
4. Attivare **No popup** se la ricerca deve comparire solo nel menu contestuale.
5. Attendere la conferma di salvataggio.
6. Aprire il popup e verificare la card, se prevista.
7. Eseguire una ricerca di prova in un ambiente non critico.

## 7.4 Menu contestuale

Quando si seleziona del testo in Business Central e si apre il menu con il tasto destro, BC_tools crea la voce **BC_tools: cerca** con i filtri validi.

Il menu viene ricostruito:

- all'installazione;
- all'avvio del service worker;
- quando cambia la configurazione `quickFilters`.

### Procedura

1. Selezionare un testo nella pagina Business Central.
2. Aprire il menu contestuale.
3. Selezionare **BC_tools: cerca**.
4. Scegliere il filtro desiderato.
5. L'estensione applica le wildcard della riga.
6. La ricerca si apre usando il contesto specifico del filtro o quello generale.

## 8. Tabelle preferite

## 8.1 Tabelle salvate

Ogni voce richiede:

- etichetta;
- ID numerico della tabella.

Sono consentite fino a 10 voci.

## 8.2 Gestione

1. Aprire la categoria corretta.
2. Compilare etichetta e ID.
3. Attendere il salvataggio automatico.
4. Per modificare, aggiornare i valori della riga.
5. Per rimuovere, svuotare o eliminare la riga tramite i comandi disponibili.
6. Verificare la lista dal popup.

Le righe vengono sanificate per conservare soltanto etichetta e ID tabella.

## 9. Migliorie UI Business Central

## 9.1 Nascondi pulsante notifiche

Quando attiva, aggiunge una classe CSS all'elemento radice del documento Business Central e nasconde il contenitore storico `#notifications_container` oppure il pulsante identificato dai suoi attributi `id`, `aria-label`, `title` o `data-automation-id`.

- L'impostazione predefinita è disattiva.
- La classe viene applicata in ogni frame necessario.
- La modifica è puramente visiva e non cancella notifiche.

## 9.2 Valori in monospace

Quando attiva, applica uno stack di font monospaziato a:

- controlli stringa in modifica;
- controlli stringa in sola lettura;
- valori nelle griglie;
- valori nelle liste impilate.

È utile per confrontare codici, numeri e stringhe con allineamento costante.

## 9.3 Sillabazione delle caption

Quando attiva, imposta `hyphens:auto` sulle intestazioni di colonna riconosciute. L'effetto dipende dal supporto del browser e dalla lingua del contenuto.

## 9.4 Apertura automatica della ricerca nella home

Quando attiva, BC_tools cerca il controllo di ricerca interno nella pagina principale e lo apre una sola volta nel contesto previsto.

La funzione osserva il DOM per gestire il caricamento dinamico dell'interfaccia. Se il controllo non è individuato in modo affidabile, non deve forzare elementi non riconosciuti.

## 9.5 Pulsante copia codice articolo

### Colonne riconosciute

La funzione cerca intestazioni normalizzate corrispondenti a:

- Nr. articolo;
- Numero articolo;
- Codice articolo tecnico.

### Comportamento

1. Identifica la colonna nella griglia.
2. Aggiunge un piccolo pulsante di copia nelle celle valide.
3. Legge il testo della cella al click.
4. Usa l'API Clipboard quando disponibile.
5. Se necessario, usa un fallback locale compatibile.
6. Mostra uno stato visivo di successo o errore.

### Privacy

Il valore copiato non viene scritto nella diagnostica. Vengono registrati soltanto lo stato della funzione, l'esito e il nome normalizzato della colonna.

### Disattivazione

Quando l'opzione viene disattivata:

- i pulsanti già inseriti vengono rimossi;
- le successive mutazioni della griglia non li ricreano.


### 9.6 Apri documenti creati
  
Quando l’opzione **Apri documenti creati** è attiva, BC_tools analizza il testo completo dei dialog Business Central tramite un parser comune basato su gruppi di keyword. Il riconoscimento richiede contemporaneamente tipo documentale, numero, esito positivo e pulsante visibile **OK** o **Va bene**. Accenti, maiuscole, spazi e apostrofi tipografici vengono normalizzati; parole intermedie non impediscono il riconoscimento.

Sono gestiti, in ordine dai casi più specifici:
- spedizione registrata da ordine di trasferimento;
- spedizione warehouse registrata;
- spedizione registrata da ordine di vendita;
- ordine di produzione rilasciato;
- spedizione warehouse creata;
- attività di prelievo;
- attività di stoccaggio.

Il numero viene letto dopo **nr**, **nr.**, **n**, **n.** o **numero** quando l’indicatore è presente. Per i messaggi storici privi di indicatore viene usata una ricerca contestuale legata al tipo, senza assumere un formato aziendale fisso. Sono ammessi lettere, cifre, punto, underscore, slash e trattino.

Nel dialog viene aggiunto un solo comando **Apri documento**, con tooltip e nome accessibile che riportano il numero individuato. Il comando apre il documento in una nuova scheda, conserva la società presente nell’URL corrente, applica pagina, tabella, campo, filtro e modalità già previsti per il target e chiude il messaggio tramite **OK**.

#### Limiti e protezioni
- Una singola keyword documentale non è sufficiente.
- Messaggi negativi, esiti mancanti, numeri mancanti o pulsante di conferma assente non generano il comando.
- Il testo viene letto dal dialog completo; valori di input o textarea discendenti non sostituiscono il messaggio.
- Ogni dialog produce al massimo un target e un pulsante.
- La funzione resta subordinata all’impostazione **Apri documenti creati** e continua a osservare i dialog dinamici.
- La diagnostica degli scarti plausibili registra soltanto motivo, tipo candidato quando disponibile, frame e lunghezza del testo normalizzato; non registra testo, numero, società o URL completo.

#### Test funzionali
Verificare almeno due formulazioni positive per ogni target, incluse abbreviazioni, accenti, apostrofi, maiuscole e parole intermedie. Includere numeri come `26PWR-016161`, `PWR-16161`, `12345`, `WH/PICK_001` e `26-PWR.016161`. Per ogni target verificare inoltre esito negativo, numero mancante, indicatore senza numero, tipo ambiguo, conferma mancante, dialog nascosto e funzione disattivata. Controllare infine URL, company, filtro, click su OK, assenza di duplicati, dialog dinamici, tutti i frame e reload.

### 9.7 Evidenzia righe per stato

L'opzione **Evidenzia righe per stato** riconosce gli stati **Aperto/Open** e **Rilasciato/Released** nelle griglie Business Central e applica colori tenui distinti. La riga selezionata resta bianca. L'evidenziazione si aggiorna quando la griglia cambia e non modifica i dati o lo stato del record. Le righe con stato o colonna non riconosciuti non vengono evidenziate.

### 9.8 Pulsante copia campi cliccabili

L'opzione **Pulsante copia campi cliccabili** aggiunge un comando di copia ai valori delle griglie riconosciuti come cliccabili/sottolineati oppure FlowField teal. **Preferenze globali per pagina** è attivo per impostazione predefinita: in questo modo **Mostra pulsante Copia** e **Nascondi pulsante Copia** valgono per la stessa combinazione ID pagina + colonna in ogni ambiente e società. Disattivandolo, si applicano le preferenze contestuali per ambiente, società, ID pagina e colonna, mantenute separatamente; riattivandolo tornano applicabili quelle globali. Colonne omonime su pagine diverse restano indipendenti in entrambi gli ambiti. L'ID viene ricavato dalla pagina che contiene la griglia, anche nei frame interni di Business Central senza parametro `page`; l'URL corrente e quello superiore sono usati come fallback. Gli elementi non visibili non vengono riconosciuti come campi cliccabili. Il testo viene copiato negli appunti quando si seleziona il comando; la funzione non modifica il valore in Business Central.

**Azzera** rimuove le preferenze Mostra/Nascondi sia contestuali sia globali, senza modificare le impostazioni automatiche per tipo di campo. L'export comprende entrambi gli ambiti; l'import aggiorna soltanto gli ambiti presenti nel file e conserva quelli assenti. Le preferenze automatiche per tipo di campo restano globali e indipendenti dal flag.

Le chiavi locali sono `bcToolsHiddenCopyFields` e `bcToolsShownCopyFields` per l'ambito contestuale e `bcToolsHiddenCopyFieldsGlobal` e `bcToolsShownCopyFieldsGlobal` per quello globale. Ogni valore è un array di chiavi opache `copy-<hash>`: quelle contestuali derivano da origine, percorso, società, ID pagina e colonna; quelle globali da ID pagina e colonna. Le colonne duplicate sulla stessa pagina includono l'indice per distinguerle.

Le precedenti preferenze salvate senza un contesto pagina corretto non vengono trasferite automaticamente: in quei casi occorre selezionare nuovamente **Mostra** o **Nascondi** sulla colonna desiderata. Le opzioni automatiche globali per tipo di campo continuano invece a valere su tutte le pagine.

### 10. Layout Wide e FactBox

Le opzioni **Forza layout pagina** e **Forza stato FactBox** sono indipendenti e disattivabili. Ogni flag abilita la relativa scelta: **Sempre Wide** o **Sempre normale (non Wide)** per la pagina; **Sempre aperta** o **Sempre chiusa** per la FactBox. Quando sono attive, si applicano alle pagine Business Central sotto `businesscentral.dynamics.com`, senza dipendere dall'ID della pagina. Se disattivate, BC_tools non forza il relativo stato e consente modifiche manuali. Le scelte vengono conservate anche disattivando il flag. In assenza di una scelta salvata, i target restano Wide e FactBox chiusa.

### Meccanismo

Business Central conserva informazioni di layout in chiavi `localStorage` che contengono `:layout:`. BC_tools interviene sui campi JSON:

- quando **Forza layout pagina** e' attiva, imposta `PageLayoutExpanded` a `true` per Wide o `false` per normale;
- quando **Forza stato FactBox** e' attiva, imposta `AsideAreaRightExpanded` a `true` per aperta o `false` per chiusa.

La funzione:

1. individua le chiavi di layout;
2. analizza solo valori JSON validi;
3. imposta i campi richiesti anche quando Business Central non li ha ancora salvati;
4. evita scritture quando il valore è già corretto;
5. applica subito solo le forzature attivate;
6. ripete il controllo ogni 500 ms finché almeno una forzatura resta attiva;
7. intercetta le scritture di Business Central e reagisce a focus e ritorno di visibilità.

Per evitare scritture duplicate, la correzione del localStorage viene assegnata a un solo frame per origine quando possibile. In ogni frame vengono inoltre controllati i pulsanti nativi di pagina e FactBox: un click viene eseguito soltanto se etichetta/scorciatoia e stato ARIA o azione dichiarata identificano uno stato diverso dal target. I tentativi sul medesimo controllo sono limitati e distanziati; nessun CSS allarga artificialmente la pagina.

L'opzione **Apri automaticamente “Mostra il resto”** cerca in ogni frame pulsanti, controlli con ruolo button e link con etichette corrispondenti a **Mostra il resto**, **Mostra di più**, **Show more** o **Show the rest**. Il controllo deve essere visibile, abilitato e non già espanso. Viene attivato al massimo un controllo riconosciuto per frame e pagina; l'apertura viene tentata di nuovo quando cambia il contesto pagina.

### Limiti

- Il meccanismo dipende dalla struttura delle chiavi di layout di Business Central.
- Il cambio immediato della pagina aperta richiede pulsanti nativi riconoscibili. Controlli ambigui o privi di stato non vengono cliccati. I test automatici usano un DOM simulato in Chromium con l'estensione reale; non sostituiscono la verifica nel tenant autenticato.
- Vale per le pagine servite da `businesscentral.dynamics.com`, in linea con il manifest.
- Al primo caricamento dopo l'aggiornamento dell'estensione, Business Central potrebbe mostrare per un istante lo stato precedente prima che il content script lo corregga.

## 11. Ordinamento automatico

## 11.1 Scopo

Ordina automaticamente la prima colonna utilizzabile nelle sole pagine autorizzate dall'utente.

## 11.2 Impostazioni

- **Ordinamento automatico**: abilita o disabilita la funzione.
- **Direzione**:
  - decrescente, con i valori più recenti per primi;
  - crescente, con i valori meno recenti per primi.
- **Pagine incluse**: allowlist degli ID pagina.

## 11.3 Aggiunta manuale di una pagina

1. Aprire **Migliorie UI**.
2. Attivare **Ordinamento automatico**.
3. Inserire l'ID nel campo **Aggiungi pagina alla lista**.
4. Premere Invio, Tab oppure uscire dal campo.
5. Il campo viene svuotato.
6. L'ID compare come elemento rimovibile.

Durante la digitazione vengono conservate solo cifre.

## 11.4 Rimozione

Selezionare il pulsante **×** dell'ID. La lista viene aggiornata e salvata.

## 11.5 Nome pagina nel tooltip

Il tooltip usa:

1. la mappa standard integrata;
2. le label dei filtri salvati con lo stesso Page ID.

La pagina 22 è mappata come **Clienti**. Se il nome non è disponibile, il tooltip segnala che non è noto.

## 11.6 Regole di esecuzione

L'ordinamento viene eseguito soltanto quando:

- la funzione è attiva;
- il Page ID è numerico e presente nella allowlist;
- è visibile una sola griglia;
- esiste una prima colonna utilizzabile;
- l'operazione non è già stata completata per il contesto corrente.

Il contesto è identificato con pagina e società. Cambiando società, la funzione può essere eseguita nuovamente.

## 11.7 Determinazione della direzione

Business Central localizza il valore `aria-sort`. Per ridurre la dipendenza dalla lingua, l'autosort:

1. conosce alcune stringhe comuni di crescente e decrescente;
2. quando parte da una colonna non ordinata, apprende il valore restituito dal primo click come crescente;
3. per ottenere il decrescente può eseguire un secondo click;
4. attende che `aria-sort` cambi realmente prima di procedere;
5. applica un limite massimo di tre click.

Tempi interni verificati:

- debounce DOM: 250 ms;
- controllo navigazione: 250 ms;
- polling dello stato: 120 ms;
- attesa massima del cambio: 6000 ms.

## 11.8 Prevenzione dei conflitti con l'utente

Dopo avere raggiunto l'obiettivo, o esaurito i tentativi, l'autosort considera conclusa la pagina. Se l'utente modifica manualmente l'ordinamento, la funzione non continua a contrastarlo nello stesso contesto.

## 11.9 Limiti noti

- Le pagine aperte soltanto tramite `bookmark` non vengono riconosciute se l'URL non contiene `page=<ID>`.
- Con più griglie visibili l'ordinamento viene saltato per evitare di scegliere una subform o una FactBox in modo ambiguo.
- La prima colonna deve essere interagibile e deve esporre uno stato di ordinamento osservabile.
- Cambiamenti futuri del DOM Business Central possono richiedere l'aggiornamento dei selettori.

## 12. ZPL Viewer

## 12.1 Scopo

Lo ZPL Viewer consente di:

- incollare o importare codice ZPL;
- generare un'anteprima PNG tramite Labelary;
- scaricare l'immagine;
- lavorare con blocchi multipli;
- controllare duplicati e campi dinamici;
- inserire testo centrato e codici a barre;
- salvare modelli;
- acquisire stampanti e preparare una stampa tramite le pagine Business Central supportate;
- esportare in Excel i dati letti dalla griglia origine.

## 12.2 Delimitatori ZPL

Un'etichetta valida viene delimitata da:

```text
^XA
...
^XZ
```

Il comando di normalizzazione:

- crea un contenuto minimo se l'editor è vuoto;
- aggiunge `^XA` se manca;
- aggiunge `^XZ` se manca;
- non duplica i delimitatori già presenti.

## 12.3 Parametri di anteprima

Lo ZPL Viewer gestisce:

- densità in dpmm: 6, 8, 12 o 24;
- larghezza etichetta;
- altezza etichetta;
- indice dell'etichetta quando il contenuto rappresenta più etichette.

Se il codice contiene `^PW` o `^LL`, le dimensioni in dot possono essere derivate da questi comandi. In assenza di valori espliciti, vengono calcolate dalle dimensioni impostate e dalla densità.

## 12.4 Generazione anteprima

1. Incollare o importare lo ZPL.
2. Selezionare densità e dimensioni.
3. Specificare l'indice, se necessario.
4. Selezionare il comando di anteprima.
5. L'estensione invia lo ZPL all'endpoint Labelary autorizzato dal manifest.
6. L'immagine restituita viene mostrata nel pannello.
7. Il pannello si ridimensiona al caricamento, alla modifica dei parametri e al ridimensionamento della finestra.

Lo ZPL inviato a Labelary può contenere dati dell'etichetta. Prima dell'uso, verificare che l'invio sia conforme alle regole aziendali applicabili.

## 12.5 Scaricamento PNG

Dopo una generazione riuscita:

1. selezionare **Scarica**;
2. il browser salva l'immagine PNG generata;
3. se non esiste un'anteprima valida, il comando non dispone di un'immagine da scaricare.

## 12.6 Esempio, pulizia e inserimento centrato

Sono disponibili comandi per:

- caricare un esempio ZPL;
- svuotare editor, modelli correnti, snapshot tabella e anteprima;
- aggiungere solo i delimitatori mancanti;
- inserire uno snippet di testo centrato prima di `^XZ`.

Lo snippet centrato usa la larghezza etichetta calcolata e mantiene il cursore in una posizione visibile.

## 12.7 Inserimento codice a barre

1. Posizionare il cursore nel punto desiderato.
2. Inserire il contenuto del codice a barre.
3. Specificare l'altezza.
4. Usare il comando di anteprima barcode per verificarlo.
5. Usare il comando di inserimento per aggiungere lo snippet nell'editor.
6. Il codice viene inserito prima del delimitatore finale quando necessario.

I valori vengono validati prima di costruire lo snippet.

## 12.8 Diagnosi duplicati

Lo ZPL Viewer dispone di un pannello dedicato ai duplicati:

- analizza gli elementi supportati;
- elenca le occorrenze individuate;
- permette di chiudere il pannello;
- consente di rimuovere l'elemento selezionato quando l'operazione è supportata.

Dopo una modifica, rigenerare l'anteprima e verificare visivamente l'etichetta.

## 12.9 Evidenziazione campo

Il comando di evidenziazione aiuta a individuare nell'editor il campo o il riferimento dinamico selezionato. Conserva la selezione e porta il cursore nell'area visibile del testo.

## 12.10 Modelli ZPL

È possibile salvare fino a 5 modelli nella chiave locale dedicata.

Operazioni disponibili:

- salvataggio con nome;
- caricamento del modello selezionato;
- eliminazione del modello selezionato.

I modelli ZPL salvati sono inclusi nell'esportazione completa delle impostazioni.

## 12.11 Acquisizione stampanti e preparazione stampa

Lo ZPL Viewer usa una lista di nomi stampante acquisita dalla pagina Business Central supportata. L'ID della pagina stampanti implementato è 5108105.

Flusso previsto:

1. aprire o rendere disponibile la pagina Business Central supportata;
2. acquisire/aggiornare l'elenco stampanti;
3. selezionare una stampante;
4. preparare il job di stampa;
5. il job viene salvato nella chiave locale dedicata;
6. la prosecuzione avviene attraverso il flusso Business Central implementato dal content script.

La disponibilità delle stampanti e della pagina dipende dalla configurazione e dai permessi Business Central.

## 12.12 Esportazione Excel completa

Quando lo ZPL proviene dalla griglia Business Central supportata, viene conservato uno snapshot tabellare.

L'esportazione:

- conserva tutte le colonne lette;
- aggiorna la colonna **Stringa fissa** con le modifiche dell'editor;
- ripristina `%1` nelle righe collegate a **Nome campo tabella origine**;
- conserva la logica di relazione campo anche se il testo visualizzato è stato reso più leggibile nell'editor.

Se non è disponibile uno snapshot compatibile, l'esportazione completa non dispone dei dati tabellari originali.

## 13. Importazione ed esportazione impostazioni

## 13.1 Esportazione JSON

L'esportazione completa può includere:

- filtri;
- tabelle salvate;
- modelli ZPL salvati;
- tema;
- migliorie UI;
- layout popup;
- pagine incluse nell'autosort;
- ordine dei box/categorie.

I nuovi export non includono URL, ambiente o società.

### Procedura consigliata

1. Aprire **Importa/Esporta**.
2. Selezionare **Esporta JSON**.
3. Conservare il file in una posizione protetta.

## 13.2 Importazione JSON

L'importazione:

1. legge il file selezionato;
2. accetta soltanto chiavi riconosciute;
3. applica i limiti numerici delle raccolte;
4. prepara un riepilogo delle modifiche;
5. richiede conferma prima della sovrascrittura;
6. salva le impostazioni accettate;
7. lascia invariate le impostazioni assenti dal file.

I file legacy che contengono URL o proprietà obsolete nei filtri vengono accettati; tali proprietà sono ignorate e non modificano lo storage.

### Controlli dopo l'import

Verificare:

- scheda Business Central, ambiente e società correnti;
- numero e contenuto dei filtri;
- tabelle salvate;
- tema e layout popup;
- pagine incluse nell'autosort;
- modelli ZPL;
- apertura di un collegamento di prova.

## 14. Diagnostica

## 14.1 Scopo

La diagnostica raccoglie eventi tecnici per analizzare il comportamento di:

- autosort;
- content script e migliorie UI;
- forzature Wide e FactBox attivate dall'utente;
- popup;
- pagina Impostazioni;
- filtri;
- tabelle;
- ZPL.

## 14.2 Conservazione

- Gli eventi sono salvati in `chrome.storage.local`.
- Il limite globale è 1000 eventi.
- L'autosort mantiene anche un buffer in memoria di 200 eventi consultabile nel contesto del content script.
- La diagnostica non viene sincronizzata tramite `chrome.storage.sync`.

## 14.3 Contenuto di un evento

Un evento può includere:

- data e ora ISO;
- componente;
- nome evento;
- dettagli sanificati;
- tab ID e frame ID quando disponibili.

Le stringhe sono limitate in lunghezza. Gli oggetti e gli array sono limitati in profondità e numero di elementi.

## 14.4 Protezioni dati

- Gli URL inseriti nei dettagli vengono ridotti a origine, percorso ed eventuale parametro `page`.
- Gli errori di risoluzione URL registrano soltanto componente e causa tecnica, senza URL, società o filtri.
- Il valore copiato dal pulsante codice articolo non viene registrato.
- La documentazione dell'interfaccia dichiara che i valori digitati non vengono registrati.

## 14.5 Esportare la diagnostica

1. Aprire **Importa/Esporta**.
2. Individuare **Diagnostica completa**.
3. Selezionare **Esporta diagnostica**.
4. Conservare il JSON solo per il tempo necessario all'analisi.
5. Prima di condividerlo, verificarne comunque il contenuto.

## 14.6 Cancellare la diagnostica

1. Aprire la sezione diagnostica.
2. Selezionare **Cancella diagnostica**.
3. Verificare il messaggio di esito.

La cancellazione degli eventi non modifica le impostazioni sincronizzate.

## 15. Storage e persistenza

## 15.1 Storage sincronizzato

`chrome.storage.sync` contiene principalmente:

- opzioni UI;
- ordinamento;
- applicazione delle forzature Wide e FactBox quando abilitate;
- tema;
- layout popup;
- pagine incluse;
- ordine delle categorie;
- filtri;
- tabelle;

## 15.2 Storage locale

`chrome.storage.local` contiene o rispecchia:

- backup delle principali impostazioni UI;
- diagnostica;
- modelli ZPL;
- nomi stampante acquisiti;
- job ZPL di stampa;
- dati temporanei necessari ai flussi locali.

Il contesto BC passato dal popup allo ZPL Viewer è temporaneo in `chrome.storage.session` ed è consumato una sola volta.

## 15.3 Coerenza del salvataggio

Il service worker serializza le operazioni di salvataggio con una catena di Promise. Questo riduce il rischio che scritture simultanee si sovrappongano. Prima viene aggiornato lo storage sincronizzato; poi viene aggiornato il mirror locale delle impostazioni UI.

## 16. Sicurezza e privacy

## 16.1 Principi applicati

Dal codice analizzato risultano queste misure:

- Manifest V3 con service worker;
- codice JavaScript incluso nel pacchetto;
- lista esplicita delle chiavi di configurazione accettate;
- `textContent` o escaping HTML nei punti dinamici principali;
- sanificazione della diagnostica;
- limitazione dei siti tramite host permissions;
- nessun permesso generale `tabs` nel manifest;
- operazioni DOM difensive, con no-op quando gli elementi non sono riconosciuti.

## 16.2 Dati inviati a servizi esterni

La generazione dell'anteprima invia il contenuto ZPL a Labelary. Se lo ZPL contiene dati personali, identificativi, logistici o commerciali, applicare le regole aziendali prima dell'invio.

## 16.3 URL con filtri

Gli URL Business Central possono contenere società, Page ID, Table ID e criteri di filtro. Evitare di condividere collegamenti che espongano dati o criteri sensibili.

## 16.4 Limiti di responsabilità tecnica

BC_tools automatizza interazioni e costruzione di URL, ma non sostituisce:

- autorizzazioni Business Central;
- controlli di accesso del tenant;
- regole di protezione dati;
- validazione funzionale delle etichette ZPL;
- procedure aziendali di stampa.

## 17. Risoluzione dei problemi

## 17.1 Il popup non apre la tabella

Controllare:

1. che l'ID sia numerico;
2. che la scheda attiva sia Business Central e che ambiente e società siano quelli desiderati;
3. che l'utente abbia accesso alla tabella;
4. che il browser non blocchi l'apertura della nuova scheda;
5. la diagnostica del popup.

## 17.2 Una ricerca rapida non compare

Controllare:

1. che la riga sia completa;
2. che **No popup** non sia attivo;
3. che il salvataggio sia completato;
4. chiudere e riaprire il popup;
5. verificare che il layout popup non nasconda la card fuori dall'area visibile;
6. esportare la configurazione e controllare `quickFilters`.

## 17.3 Il menu contestuale non è aggiornato

1. salvare nuovamente il filtro;
2. attendere la ricostruzione del menu;
3. riavviare l'estensione se il service worker era stato ricaricato;
4. verificare che la selezione avvenga in Business Central;
5. controllare la diagnostica del background.

## 17.4 Il mirino non rileva la pagina

1. rendere attiva la scheda Business Central;
2. verificare che l'URL appartenga al dominio autorizzato;
3. controllare la presenza di `page=<ID>`;
4. evitare, per questa operazione, una pagina identificata solo da `bookmark`;
5. ricaricare la pagina Business Central dopo un aggiornamento dell'estensione.

## 17.5 L'autosort non parte

Controllare:

1. opzione attiva;
2. direzione selezionata;
3. Page ID presente nella lista;
4. URL con `page=<ID>`;
5. una sola griglia visibile;
6. intestazione della prima colonna interagibile;
7. nessun ordinamento già completato nello stesso contesto;
8. log `__bcToolsAutoSortDiagnostics` nel contesto corretto del content script.

## 17.6 Layout o FactBox non vengono forzati

1. verificare che il flag della forzatura desiderata sia attivo nelle Impostazioni;
2. ricaricare l'estensione unpacked in `edge://extensions` e la pagina Business Central;
3. verificare che l'URL sia sotto `businesscentral.dynamics.com`;
4. attendere il successivo ciclo di applicazione;
5. controllare la chiave `:layout:`: `PageLayoutExpanded` deve corrispondere alla scelta Wide/normale e `AsideAreaRightExpanded` alla scelta aperta/chiusa, soltanto con il relativo flag attivo.

## 17.7 Il pulsante copia non compare

1. verificare che l'opzione sia attiva;
2. controllare che il nome colonna corrisponda a uno dei nomi riconosciuti;
3. attendere il caricamento completo della griglia;
4. scorrere la griglia per attivare il rendering delle righe;
5. controllare eventuali modifiche recenti alla caption della colonna.

## 17.8 L'anteprima ZPL fallisce

Controllare:

1. presenza di `^XA` e `^XZ`;
2. densità valida;
3. larghezza e altezza valide;
4. indice etichetta corretto;
5. connettività verso Labelary;
6. risposta del servizio esterno;
7. sintassi ZPL;
8. diagnostica ZPL.

## 17.9 L'esportazione Excel è disabilitata o incompleta

L'esportazione completa richiede uno snapshot ottenuto dalla griglia Business Central supportata. Se lo ZPL è stato soltanto incollato manualmente, le colonne originali non sono disponibili.

## 17.10 La pagina Impostazioni sembra attiva ma i pulsanti non funzionano

Può accadere dopo il reload o l'aggiornamento di un'estensione unpacked. La pagina verifica storage e service worker su focus, ritorno di visibilità, prime interazioni e controllo periodico. Se il contesto è invalidato, l'azione viene interrotta e viene richiesto un solo reload automatico, senza mostrare una conferma di salvataggio non verificata. Se il problema persiste dopo il reload automatico, controllare la diagnostica tecnica della pagina Opzioni.

## 18. FAQ

### Le impostazioni sono salvate automaticamente?

Sì. La pagina mostra una conferma visiva dopo il salvataggio.

### Posso usare un filtro solo dal menu contestuale?

Sì. Attivare **No popup**.

### Quanti filtri posso salvare?

Fino a 10.

### Quante tabelle posso salvare?

Fino a 10.

### Quanti modelli ZPL posso salvare?

Fino a 5.

### L'autosort agisce su tutte le pagine?

No. Agisce soltanto sugli ID presenti in **Pagine incluse**.

### L'autosort può agire su pagine con subform?

Se risultano visibili più griglie, l'operazione viene saltata per evitare ambiguità.

### Il valore copiato viene registrato?

No. La diagnostica non salva il codice articolo copiato.

### La diagnostica viene sincronizzata?

No. Resta nello storage locale dell'estensione.

### Posso trasferire la configurazione su un altro PC?

Sì, tramite esportazione e importazione JSON. Il contesto Business Central non viene trasferito: ogni apertura usa la scheda sorgente.

### Perché una pagina aperta da bookmark non viene ordinata?

Perché l'autosort richiede un URL che esponga `page=<ID>`.

### Lo ZPL resta locale?

L'editor e i modelli sono gestiti dall'estensione, ma la generazione dell'anteprima invia lo ZPL al servizio Labelary.

## 19. Checklist operativa

### Configurazione

- [ ] Scheda Business Central, ambiente e società verificati prima dell'azione.
- [ ] Tema e layout popup scelti.
- [ ] Filtri testati.
- [ ] Tabelle preferite testate.
- [ ] Pagine autosort incluse esplicitamente.
- [ ] Backup JSON esportato.

### Verifica dopo un aggiornamento

- [ ] Versione manifest verificata.
- [ ] Popup aperto senza errori.
- [ ] Impostazioni caricate.
- [ ] Salvataggio automatico verificato.
- [ ] Menu contestuale aggiornato.
- [ ] Content script attivi su Business Central.
- [ ] Autosort provato in una pagina test.
- [ ] Flag Layout e FactBox provati attivi e disattivi su più pagine Business Central.
- [ ] Copia codice articolo provata.
- [ ] ZPL Viewer provato con dati non sensibili.
- [ ] Diagnostica esportabile e cancellabile.

## 20. Riferimento tecnico sintetico

### Manifest

- Manifest version: 3.
- Versione estensione: 3.2.
- Popup: `src/popup/popup.html`.
- Opzioni: `src/options/index.html`.
- Service worker: `src/background/background.js`.
- Content script dichiarati:
  - `src/content/bc_layout_state.js`;
  - `src/content/bc_enhance.js`;
  - `src/content/bc_autosort.js`.
- CSS content script:
  - `src/content/bc_enhance.css`.
- Esecuzione content script: `document_start`.
- Frame: tutti i frame.

### Chiavi principali

Impostazioni accettate dal service worker per il salvataggio:

```text
saldoArticoloMovimentiWarehouse
visualStyle
hideNotificationsButton
showValuesInMonospace
showHyphensInColumnCaptions
highlightStatusRows
autoOpenHomeSearch
showPageFieldCopyButton
pageFieldCopyEnabled
pageFieldCopyClickable
pageFieldCopyFlowField
pageFieldCopyMode
pageFieldCopyGlobalPreferences
showCreatedDocumentButton
enableTableExport
autoShowMore
autoSortFirstColumn
sortDirection
autoWide
layoutMode
forceFactbox
factboxMode
uiTheme
popupLayout
includedPages
optionsLayout
quickFilters
quickTables
includedPageNames
```

Chiavi locali tecniche principali:

```text
bcToolsUiSettings
bcToolsDiagnostics
bcToolsZplModels
bcToolsPrinterNames
bcToolsZplPrintJob
```

### Limiti principali

```text
Filtri: 10
Tabelle salvate: 10
Modelli ZPL: 5
Diagnostica locale: 1000 eventi
Buffer autosort in memoria: 200 eventi
```

## 21. File sperimentali o non attivi nel manifest

Nel set di sorgenti sono presenti file che non risultano caricati dal manifest corrente:

- `bc_wide_click.js`: esperimento per forzare il Wide tramite click, con selettori ancora da confermare;
- `bc_wide_hook.js`: hook di `Storage.prototype` per Layout e FactBox;
- `index_add_excluded_pages.js`: blocco indipendente per una lista di pagine escluse, non collegato alla pagina Impostazioni e non incluso negli script caricati dall'HTML analizzato.

Questi file non devono essere descritti come funzioni disponibili all'utente finché non vengono integrati, caricati e validati nel pacchetto effettivo.

## 22. Conclusione

BC_tools concentra in un'unica estensione l'apertura rapida di oggetti Business Central, ricerche contestuali, preferiti, personalizzazioni UI, ordinamento controllato e strumenti ZPL. Le automazioni più invasive sono limitate da allowlist, controlli sul DOM, validazione delle chiavi e meccanismi di no-op sicuro. Per un uso affidabile, verificare la scheda Business Central sorgente prima di ogni azione e ripetere i controlli dopo gli aggiornamenti del client Web.

## Appendice A - RDLC Field Mapper

### A.1 Scopo e apertura locale

RDLC Field Mapper apre localmente file `.rdl` e `.rdlc` dalla categoria dedicata nelle Impostazioni. Il contenuto XML resta in memoria nella pagina e non viene inviato a servizi esterni.

Dopo l'apertura, la funzione mostra namespace RDL, dataset, campi dichiarati, Field Name, DataField, numero di utilizzi e riferimenti ai campi individuati negli elementi del layout. I campi custom sono disponibili quando sono dichiarati nel dataset del file.

### A.2 Riferimenti e rimappatura

Ogni occorrenza `Fields!NomeCampo.Value` è selezionabile anche quando è contenuta in una funzione, un aggregato o una concatenazione. Il mapper conserva l'espressione e sostituisce soltanto l'occorrenza selezionata; per riferimenti ripetuti nello stesso elemento, l'interfaccia indica la posizione. Quando l'elemento e il dataset applicabile sono determinabili, il nuovo campo deve essere dichiarato in quel dataset. Se lo scope è ambiguo o il campo corrente non esiste nel dataset, la rimappatura resta bloccata.

La sostituzione puntuale non interpreta né convalida la semantica della formula o la compatibilità funzionale del campo scelto: formule, funzioni e aggregati devono essere verificati prima dell'uso. Il mapper non modifica dataset, celle, righe, colonne, gruppi, filtri, ordinamenti, parametri, codice personalizzato, stili o namespace.

### A.3 Cronologia, validazione ed esportazione

- **Annulla ultima modifica** ripristina il valore precedente del riferimento modificato.
- **Ripristina modifica annullata** riapplica l'ultima modifica annullata.
- **Torna al file originale** elimina le modifiche della sessione e ricarica il contenuto iniziale.
- **Valida** controlla localmente il documento, i dataset e i riferimenti ai campi dichiarati; non valuta la semantica delle formule.
- **Salva nuova copia** esporta un nuovo file con suffisso `_field-mapped.rdlc` senza sovrascrivere l'originale.

L'area di lavoro riprende il layout a tre colonne dello ZPL Viewer e usa tutta la larghezza disponibile: a sinistra sono raccolti comandi, campi e struttura XML; al centro c'è l'anteprima; a destra riferimenti e rimappatura. Riepilogo e avvisi usano la larghezza intera sopra le colonne. A larghezze ridotte le colonne si riadattano senza perdere contenuti. L'anteprima si adatta automaticamente allo spazio disponibile. La classificazione in Page Header, Body e Page Footer segue esclusivamente la gerarchia XML del report. I contenitori mantengono sfondo trasparente e i figli sono posizionati relativamente al contenitore; Tablix, Table e Matrix sono indicati come regioni ripetibili senza generare celle o dati. Le immagini usano placeholder locali. Elementi privi di coordinate restano consultabili nell'albero; quelli non supportati sono indicati con placeholder. Selezionando un riferimento, un elemento di campo nell'anteprima o nell'albero XML, la selezione viene sincronizzata tra i tre pannelli; se un elemento contiene più riferimenti nessuno viene scelto automaticamente. Riferimenti non modificabili restano selezionabili per evidenziarne la posizione e mostrano il motivo del blocco. L'anteprima è una mappa strutturale semplificata, non un renderer RDLC e non garantisce la stessa resa di Business Central.

### A.4 Privacy e limiti

XML, espressioni, nomi dei campi, testi del report, immagini incorporate e dati aziendali non vengono salvati in `chrome.storage`. La diagnostica registra soltanto operazione, esito, categoria e conteggi tecnici non sensibili.

La validazione locale non garantisce la corretta esecuzione del report in Business Central e la funzione non costituisce un designer RDLC completo. Scope o strutture non determinabili vengono bloccati invece di essere modificati automaticamente.



### Esportazione tabelle (righe caricate)
La funzione è disattivata per impostazione predefinita. Dopo l’attivazione in Migliorie UI Business Central, il popup mostra **Esporta tabella** esclusivamente quando l’URL top-level Business Central contiene un solo parametro `table` con ID intero positivo. **Righe caricate** acquisisce localmente le righe renderizzate nella singola griglia principale visibile e cerca il contenitore scorrevole anche tra i discendenti della griglia e i suoi antenati. Scorre a incrementi per richiedere ulteriori righe virtualizzate, aspetta la stabilizzazione e ripristina poi la posizione iniziale. Le intestazioni sono lette una volta dalla griglia e ogni riga intestazione incontrata durante la scansione viene esclusa dai dati. Le righe già acquisite vengono deduplicate anche quando si ripresentano in finestre di scorrimento non contigue, mantenendo distinte righe identiche presenti nella stessa rilevazione; i valori inizialmente vuoti vengono arricchiti quando una riga ricompare nella finestra virtualizzata. Le celle di visualizzazione BC, incluse quelle usate per FlowField, vengono lette dal DOM renderizzato; lo scanner aspetta gli aggiornamenti DOM asincroni. L’estrazione può riportare soltanto valori che BC ha effettivamente renderizzato nel client; non esegue calcoli AL. Le API standard di Business Central espongono pagine e query API disponibili nell’ambiente, non un endpoint generico per leggere una tabella arbitraria; perciò questa funzione non offre il completamento tramite API. Le celle sono allineate usando l’indice accessibile di colonna o la posizione nella riga; si leggono testo visibile, valori di input/select/checkbox e, quando manca testo, etichette accessibili. Le colonne di servizio completamente vuote vengono escluse. Il file XLSX include il filtro automatico Excel su tutte le colonne, applicato dalla riga d’intestazione fino all’ultima riga esportata. Il popup dell’estensione si chiude 1,5 secondi dopo aver avviato il download, lasciando al browser il tempo di acquisire il Blob dell’XLSX. Prima del download mostra il conteggio acquisito e richiede conferma. Più griglie indipendenti, contesto cambiato o griglia non riconoscibile bloccano il download. I dati esportati non sono salvati nello storage né inseriti nella diagnostica.

Nota tecnica: le primitive XLSX minime della modalità tabella sono temporaneamente duplicate nel modulo locale `src/shared/xlsx_local.js`; `zpl_viewer.js` resta invariato per evitare un refactoring più ampio e preservare il comportamento ZPL.

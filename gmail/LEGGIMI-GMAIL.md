# Lettore posta Gmail – installazione (una volta per ogni Gmail)

Serve per far comparire nell'app, in **Da confermare**, le scadenze che arrivano per mail (polizze, bollette, rate…), anche quando i dati stanno nell'allegato PDF.
Non cancella, non sposta e non inoltra nulla. Nell'app non entra niente finché una persona non preme **Aggiungi**.

> Fallo da un **computer** (anche il tuo), con il browser collegato alla Gmail del genitore: l'editor di Apps Script non è comodo da telefono. Il telefono (iPhone o altro) non c'entra: lo script gira nei server di Google.

## Prima: nell'app
1. Impostazioni → **Posta automatica (avanzate)** → **Copia la chiave**. (La vede solo chi gestisce lo spazio.)
2. Dal tuo `config.js` ti servono l'indirizzo Supabase e la chiave "anon".

## Poi: su Google (con l'account Gmail del genitore)
1. Vai su **script.google.com** → **Nuovo progetto**. Chiamalo "Scadenziario".
2. Cancella il codice di esempio e incolla tutto `scadenziario-gmail.gs`.
3. In cima, sostituisci i 3 valori: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `INBOX_TOKEN`.
4. A sinistra, accanto a **Servizi** premi **+** → scegli **Drive API** → versione **v3** → **Aggiungi**. (Serve a leggere i PDF.)
5. Nell'elenco delle funzioni in alto scegli **provaSenzaInviare** → **Esegui**. Google chiede i permessi (Gmail, Drive, connessione esterna): *Avanzate* → *Vai a Scadenziario (non sicuro)* → *Consenti*. È normale per gli script personali.
6. Apri **Registro esecuzioni**: vedi cosa troverebbe nelle ultime mail, senza inviare niente.
7. Scegli **installaControlloAutomatico** → **Esegui**. Da ora controlla ogni 10 minuti.

Ripeti dal punto 1 per l'altra Gmail, con la **stessa chiave**.

## Se qualcosa non va
- *Nessuna proposta*: guarda il registro; lo script considera solo le mail dei **3 giorni** scorsi, in Posta in arrivo, non in Promozioni/Social.
- *"Invio non riuscito (401/404)"*: la chiave o l'indirizzo Supabase sono sbagliati, oppure non hai rilanciato lo schema SQL v4.
- *PDF non letto*: i PDF protetti da password non si leggono. Resta il link alla mail.
- Per **fermarlo**: Apps Script → **Attivatori** (icona orologio) → elimina l'attivatore.
- Nuova chiave: Impostazioni → Posta automatica → **Nuova chiave**, poi incollala nello script.

## Privacy
- Lo script può leggere tutta la posta di quell'account (è il permesso che Google chiede), ma invia all'app solo: mittente, oggetto, data, importo, targa, numero polizza e link alla mail.
- I PDF vengono convertiti in testo da Google Drive e il file temporaneo viene subito cestinato.
- Il link alla mail funziona solo dove sei collegato a quella Gmail.

---
## Se il "+" accanto a Servizi non si apre
1. Usa una finestra in incognito (o un profilo Chrome) con **solo** la Gmail da collegare, e consenti i popup per script.google.com.
2. Impostazioni progetto (ingranaggio) → spunta «Mostra il file manifest appsscript.json», poi sostituiscilo con:
```json
{ "timeZone": "Europe/Rome",
  "dependencies": { "enabledAdvancedServices": [ { "userSymbol": "Drive", "serviceId": "drive", "version": "v3" } ] },
  "exceptionLogging": "STACKDRIVER", "runtimeVersion": "V8" }
```
3. Esegui `provaSenzaInviare` e consenti i permessi. Quando i risultati sono giusti, esegui `installaControlloAutomatico` una volta sola.
4. Una copia dello script per ogni Gmail (papà e mamma), con **la stessa chiave della posta**.

---
## Novità
- **Appuntamenti:** lo script riconosce visite, prelievi, assemblee, riunioni e gli inviti di calendario (.ics), con **data, ora e luogo**. Compaiono in «Da confermare» come «Appuntamento» e, una volta aggiunti, in Home → «Prossimi appuntamenti».
- **Meno errori:** preventivi, codici di accesso, newsletter e mail senza oggetto non diventano più scadenze. Ogni proposta dice «Dalla mail …» e perché ha letto quella data.
- **Prima scansione:** `provaUltimi60Giorni` (vedi cosa trova, senza inviare) e poi `primaScansione` (invia; rilancia finché dice «finito»).
- **Nessuna IA, nessun dato fuori da Google:** tutto è letto da regole dentro il tuo account. `elencoMittenti` mostra chi ti scrive di più, per fare regole su misura.

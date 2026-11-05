# Scadenziario – guida (versione 3)

PWA per tenere sotto controllo scadenze e costi di casa, mezzi e altro, condivisa tra più persone.
File statici, nessun build. Costo: 0 € (Netlify + Supabase piano gratuito).

## Novità della v3: schede specifiche per ogni categoria
- **Mezzi**: scegli *Auto* o *Moto/scooter*. Dopo il nome (e la targa) un percorso guidato, saltabile, chiede una voce alla volta: dati del mezzo (immatricolazione, acquisto, km), assicurazione, bollo (o "esente"), revisione, tagliando, gomme, finanziamento. La prossima revisione si calcola da sola (4 anni dalla prima immatricolazione, poi ogni 2, a fine mese); il prossimo tagliando dall'ultimo.
- **Casa**: *In affitto* (affitto, contratto, registro) o *Di proprietà* (mutuo, IMU con scadenze 16 giugno/16 dicembre, condominio); per entrambe luce, gas, acqua, internet, rifiuti, assicurazione, caldaia.
- **Altro**: documenti (identità, patente, passaporto, tessera sanitaria), salute (visite, esami, vaccini, farmaci), animali, abbonamenti, garanzie, tasse e fisco, lavoro, scuola, banca e libero.
- **Lavori e ricambi**: per mezzi e case, storico di cosa è stato fatto (cambio olio, pastiglie, idraulico…) con data, km, costo e officina.
- Ogni voce può essere nascosta se non serve ("Voci nascoste" per riaverla). Mutuo e finanziamento smettono da soli di contare le rate dopo l'ultima.

### Aggiornamento v3
1. **Supabase → SQL Editor**: incolla di nuovo tutto `supabase-schema.sql` → Run (aggiunge solo colonne e la tabella `item_logs`; i dati restano).
2. Carica su GitHub tutti i file **tranne `config.js`**, compreso il nuovo `schede.js`.
3. `sw.js` ha già `VERSION = "v5"`: i telefoni si aggiornano da soli.

## Novità della v2
- Navigazione **Home · Casa · Mezzi · Altro**, con più case e più mezzi.
- Icone vettoriali al posto delle emoji, nuova icona dell'app.
- Pannelli: si chiudono scorrendo verso il basso o toccando fuori. Dalla pagina di una casa/mezzo si torna indietro con la freccia o scorrendo dal bordo sinistro verso destra.
- Eliminazioni con conferma nello stile dell'app.
- **Inserimento guidato**: dopo aver creato una casa o un mezzo compare una schermata con le voci tipiche (affitto, luce, gas, internet… / assicurazione, bollo, revisione, tagliando): si compila solo ciò che si sa.
- **Account e spazio condiviso**: ognuno ha il proprio accesso; chi entra con il codice invito vede e modifica le stesse scadenze.

## Ordine di aggiornamento (importante)
Fai le cose in questo ordine, altrimenti la nuova app trova uno schema vecchio.

### 1. Supabase – aggiorna lo schema
1. **SQL Editor** → **New query** → incolla tutto `supabase-schema.sql` → **Run**.
   Si può rilanciare senza danni. Se avevi già dati della v1, vengono conservati: ognuno ottiene il suo spazio e la categoria "auto" diventa "mezzi".
2. **Authentication → Sign In / Providers → Email**: lascia attiva la registrazione (*Allow new users to sign up*).
3. **Authentication → URL Configuration**: in *Site URL* metti l'indirizzo Netlify dell'app (serve ai link di conferma email e di recupero password).
4. Consigliato per la famiglia: sempre in *Providers → Email* disattiva **Confirm email**. Il servizio email gratuito di Supabase ha pochissimi invii all'ora e la conferma può bloccare chi si registra. Senza conferma, chi crea l'account entra subito.

### 2. GitHub – carica i file
Carica nel repository tutti i file di questa cartella **tranne `config.js`** (contiene già le tue chiavi Supabase: non va sovrascritto). Non dimenticare il nuovo file `icons.js` e la cartella `icons`.
Con Git:
```bash
git add .
git commit -m "Versione 2"
git push
```

### 3. Netlify
Si ripubblica da solo a ogni push. Quando modifichi i file, cambia `VERSION` in `sw.js` (es. `v4`) così i telefoni scaricano la nuova versione.

### 4. Primo accesso
1. Apri l'app e accedi con il tuo account (o creane uno con *Non hai un account? Registrati*).
2. Se non hai dati precedenti compare "Benvenuto": scegli **Sono il primo** → *Crea il nostro spazio*.
3. **Impostazioni (icona con i cursori in alto a destra)** → compare il **codice invito**. Premi *Invia* e mandalo ai tuoi genitori.
4. Loro aprono l'app, premono *Registrati*, e al "Benvenuto" scelgono **Ho un codice di invito**.

Un account può far parte di un solo spazio. Se il codice finisce nelle mani sbagliate, *Genera un nuovo codice* invalida il vecchio (chi è già dentro resta).

## Installazione sul telefono
- **iPhone**: Safari → Condividi → *Aggiungi alla schermata Home*.
- **Android**: Chrome → menu ⋮ → *Installa app*.
Se cambi icona o aggiorni l'app e il telefono mostra ancora la vecchia, elimina l'icona dalla Home e aggiungila di nuovo.

## Uso quotidiano
- **Casa / Mezzi / Altro**: elenco con spesa prevista a 12 mesi; tocca un elemento per vederne le scadenze.
- Pulsante **+ Scadenza**: scegli che cosa è, metti data e importo. La ripetizione si imposta da sola (bollo ogni anno, revisione ogni 2 anni, affitto ogni mese…).
- Cerchio ✓: segna come pagata e crea subito la scadenza successiva (con *Annulla*).
- **Altre opzioni** nel modulo → *Compila da un'email*: incolli il testo di una mail e propone tipo, data e importo (da controllare).
- **Impostazioni** → esporta nel calendario (.ics, con avviso 7 giorni e 1 giorno prima), copia di sicurezza dei dati, importazione.

## Prossimi passi possibili
- **Notifiche push** una settimana prima della scadenza (funzionano su iPhone con l'app aggiunta alla Home): servono una funzione Supabase pianificata e le chiavi push.
- **Lettura automatica di bollette ed email** (foto o inoltro → scadenza proposta da confermare): richiede un servizio di lettura, di norma a pagamento a consumo.

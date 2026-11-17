# Scadenziario – guida (versione 5)

PWA per tenere sotto controllo scadenze e costi di casa, mezzi e altro, condivisa tra più persone.
File statici, nessun build. Costo: 0 € (Netlify + Supabase piano gratuito).

## Novità della v5
- **Storico per voce**: nulla si perde più. In ogni scheda (bollo, assicurazione, bollette…) c'è il tasto **Storico**: lista dei pagamenti, **grafico** e confronto con il pagamento precedente (es. "+6%"), con media e totale. Quando premi ✓ il pagamento entra da solo nello storico; puoi aggiungere anche quelli passati. Se invece sposti la scadenza in avanti dalla scheda, l'app chiede "La scadenza precedente è stata pagata?" e la conserva. In ogni mezzo/casa c'è anche **Storico dei pagamenti** con tutte le voci.
- **Turni di lavoro**: in *Altro* scegli **Lavoro e turni** (uno per persona, es. "Turni di Mamma"). Calendario del mese: tocca un giorno per scegliere il turno (con nota), oppure scegli un tipo e tocca più giorni di seguito. **Ripeti un ciclo** compila da solo settimane o mesi (es. mattina, pomeriggio, notte, 2 riposi). I tipi di turno (nome, sigla, colore, orario) si personalizzano da **Tipi**. **Stampa** crea una pagina A4 per orizzontale (da iPhone: Stampa → pizzico sull'anteprima per salvarla in PDF o AirPrint). In Home compaiono i turni di oggi e domani. Le scadenze di lavoro (contratto, abbonamento trasporti…) restano sotto il calendario.

### Aggiornamento v5 (in quest'ordine)
1. **Supabase → SQL Editor**: incolla di nuovo tutto `supabase-schema.sql` → Run (aggiunge solo la tabella `shifts`).
2. Carica i file su GitHub (tranne `config.js`); `sw.js` è già a `v7`.

## Novità della v4
- **Sola lettura**: due codici invito in Impostazioni, uno "Può modificare" (genitori) e uno "Solo lettura" (figli). Chi gestisce vede l'elenco delle persone e può cambiare il permesso o rimuoverle. Il blocco vale anche sul server (Supabase), non solo nell'app.
- **Home "Da fare questa settimana"**: in cima solo ciò che è scaduto o scade entro 7 giorni, con il tasto ✓.
- **Link ai documenti**: ogni voce, scadenza e lavoro ha un campo *Link* (mail, Drive…) e il tasto *Apri documento*. Niente viene caricato su Supabase.
- **Da confermare**: riquadro in Home con le proposte che arrivano dalla posta (vedi `gmail/LEGGIMI-GMAIL.md`). Si preme *Aggiungi* (si apre il modulo già compilato) o *Scarta*. Se la mail porta la targa, la proposta si aggancia da sola al mezzo giusto.
- **Script Gmail** (cartella `gmail/`): legge le mail e i PDF allegati (es. gli avvisi di scadenza Allianz) e manda le proposte all'app. Funziona anche con iPhone: gira sui server di Google.

### Aggiornamento v4 (in quest'ordine)
1. **Supabase → SQL Editor**: incolla di nuovo tutto `supabase-schema.sql` → Run. Aggiunge ruoli, codici, tabella `inbox`, campi link. I dati restano; chi c'è già mantiene i suoi permessi (chi ha creato lo spazio gestisce, gli altri modificano).
2. Carica su GitHub tutti i file **tranne `config.js`**, compresa la cartella `gmail`.
3. `sw.js` è già a `v6`. Apri l'app, entra in Impostazioni: vedrai i due codici e le persone.
4. Solo quando vuoi la posta automatica: segui `gmail/LEGGIMI-GMAIL.md`.

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

## v6 – Turni insieme
- In Altro (e in Home) compare «Turni insieme»: un solo calendario con i turni di tutti, un colore per persona. Si stampa su un foglio.
- Per ogni persona crea una scheda «Lavoro e turni» (es. «Turni di Giovanni», «Turni di Patrizia»).
- Sigle come sul foglio dell'ospedale: 1 (8–14), 1C (6–14), 2A (13–19), 2 (14–22), 3 (22–06), S, R, REP, F, P, Ma. Si possono rinominare o aggiungere da «Tipi».

## v7
- Titolo del mese nel calendario leggibile anche su iPhone; reparto di ogni settimana (anche in stampa); «Compila dal foglio» con la foto del foglio come guida (resta sul telefono).
- Versione per computer (schermo largo): barra a sinistra, finestre al centro, elenchi a due colonne. Su telefono non cambia nulla.
- Script Gmail: `primaScansione` (ultimi 60 giorni) e `provaUltimi60Giorni`.

## v8
- Da rilanciare in Supabase (SQL Editor): `supabase-schema.sql` (il blocco v7 aggiunge l'orario agli appuntamenti).
- «Compila dal foglio» è anche nella pagina di ogni persona.
- Posta: appuntamenti con ora e luogo, meno falsi positivi.
- PC: ogni voce è una scheda; spaziatura sotto «Aggiungi».

## v9
- Tolta ogni intelligenza artificiale (script, app, funzione Supabase): tutto gira con regole dentro il tuo account Google.
- «Da confermare» avvisa se la proposta sembra già presente nell'app («Sembra già presente…», «Aggiungi comunque»).
- Script: `elencoMittenti` (mappa di chi ti scrive, solo mittente e oggetto).

## Novità v10 — lettura dei turni dalla foto (nel telefono)
In **Turni → Compila dal foglio → «Leggi la riga dalla foto»**:
1. scegli la foto del prospetto mensile (tutta la tabella dentro, ben illuminata);
2. tocca i 4 angoli della tabella (alto-sinistra, alto-destra, basso-destra, basso-sinistra), poi li ripeti più precisi;
3. scorri i nomi e tocca la riga della persona;
4. controlla le sigle: le caselle incerte sono **gialle**, accanto all'immagine della casella; correggi dal menu;
5. «Usa queste sigle» e poi «Compila il calendario».
Tutto avviene sul telefono: nessuna foto parte, nessun servizio esterno, gratis.
Il lettore riconosce: 1, 1C, 1CR, 1B, 1D, 2, 2A, 2*, 3, S, R, A, F, P e il vuoto. Le sigle che nel tuo calendario non esistono vengono segnalate e saltate.

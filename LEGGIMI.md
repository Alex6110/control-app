# Scadenziario – guida di messa online

PWA per tenere sotto controllo scadenze e costi di auto e casa.
Nessun build, nessuna dipendenza: sono file statici. Costo: 0 €.

## 1. Provala subito (2 minuti, senza Supabase)
Lascia `config.js` com'è e pubblica la cartella su Netlify (passo 3).
L'app funziona in **modalità locale**: i dati restano nel browser di quel dispositivo.
Serve per provarla; per avere gli stessi dati su telefono e PC passa al passo 2.

## 2. Collega Supabase (dati sincronizzati)
1. Crea un account su supabase.com → **New project** (piano Free; scegli una regione EU, es. Frankfurt).
2. **SQL Editor** → incolla tutto `supabase-schema.sql` → **Run**.
3. **Authentication → Users → Add user → Create new user**: inserisci la tua email e una password, spunta *Auto Confirm User*.
4. **Authentication → Sign In / Providers → Email**: disattiva *Allow new users to sign up* (così nessun altro può registrarsi).
5. **Project Settings → API**: copia *Project URL* e la chiave *anon public* dentro `config.js`:
   ```js
   window.APP_CONFIG = { supabaseUrl: "https://xxxx.supabase.co", supabaseKey: "eyJ..." };
   ```
   (La anon key può stare nel codice: i dati sono protetti dalle regole RLS dello schema.)

> Nota piano Free: Supabase mette in pausa i progetti inattivi per 7 giorni. Usando l'app regolarmente non succede; se capita, basta "Restore" dalla dashboard.

## 3. Pubblica su Netlify
- Più semplice: su app.netlify.com → **Add new site → Deploy manually** → trascina la cartella `scadenziario`.
- Oppure carica la cartella su un repository GitHub e collegalo a Netlify (ogni modifica si pubblica da sola).
- Quando modifichi i file, cambia `VERSION` in `sw.js` (es. `v2`) così i dispositivi si aggiornano subito.

## 4. Installala sul telefono
- **iPhone**: apri il sito in Safari → Condividi → *Aggiungi alla schermata Home*.
- **Android**: Chrome → menu ⋮ → *Installa app*.

## 5. Come inserire i dati
1. **Auto e casa** → crea gli elementi (es. "Fiat Panda", "Casa in affitto").
2. Pulsante **+ Scadenza**: scegli l'elemento e il tipo (assicurazione, bollo, luce…). La ripetizione si imposta da sola (bollo ogni anno, revisione ogni 2 anni, affitto ogni mese…); tu metti solo data e importo.
3. Quando paghi, tocca il cerchio ✓: la scadenza successiva viene creata automaticamente.
4. Nella scheda **Costi** vedi la spesa dei prossimi 12 mesi, mese per mese e per categoria.

Scorciatoia: **📋 Incolla il testo di un'email** nel modulo di nuova scadenza compila data, importo e tipo (da controllare prima di salvare).

## 6. Promemoria
**Impostazioni → Esporta nel calendario (.ics)** aggiunge le scadenze ad Apple/Google Calendar con avviso 7 giorni e 1 giorno prima. Le scadenze ricorrenti si ripetono da sole nel calendario.

## 7. Automazione completa delle email (passo successivo, opzionale)
Obiettivo: inoltri la mail dell'assicurazione e la scadenza compare da sola. Schema consigliato, tutto gratuito o quasi:

1. Un indirizzo di inoltro (es. Cloudflare Email Routing → Email Worker, oppure Postmark/Mailgun inbound) riceve le mail che inoltri.
2. Il Worker/funzione legge il testo e lo passa a un parser (le stesse regole di `parseEmailText` in `app.js`, oppure un modello AI via API, che è più preciso ma ha un piccolo costo).
3. La funzione scrive in Supabase (`deadlines`) con una chiave di servizio, **in stato da confermare**, così controlli tu con un tocco.

Consigli: inoltra solo le mail che ti interessano (filtro automatico in Gmail), e tieni sempre un passaggio di conferma: polizze e bollette hanno formati molto diversi e un errore sulla data costa caro.

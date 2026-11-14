# Lettura turni da foto (Edge Function)

Serve a far leggere la riga di una persona da una foto del prospetto. La chiave segreta resta su Supabase, mai nell'app.

## Una volta sola (tutto dal sito di Supabase, senza terminale)
1. Supabase → **Edge Functions** → **Deploy a new function** → «Via Editor». Nome: `leggi-turni` (esatto).
2. Cancella il codice di esempio, incolla il contenuto di `index.ts`, premi **Deploy**.
3. Edge Functions → **Secrets** → aggiungi **ANTHROPIC_API_KEY** (consigliata) con la chiave da console.anthropic.com
   (servono pochi euro di credito: una foto costa circa 1–3 centesimi). In alternativa **GEMINI_API_KEY** (Google AI Studio, gratuita
   ma con limiti e con condizioni sull'uso dei dati: sul piano gratuito Google può usarli per migliorare i suoi prodotti).
4. Lascia attiva l'opzione «Verify JWT»: così possono usarla solo gli utenti dell'app.

## Come si usa
Turni insieme → Compila dal foglio → scegli la foto → scrivi il cognome come sta sul foglio → «Leggi la riga dalla foto».
Le sigle lette compaiono nella casella: CONTROLLALE guardando la foto, correggi, poi «Compila il calendario».

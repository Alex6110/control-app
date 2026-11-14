// Supabase Edge Function "leggi-turni"
// Riceve la foto del prospetto turni, trova la riga di una persona e restituisce le sigle giorno per giorno.
// Serve UNA chiave segreta: ANTHROPIC_API_KEY (consigliata) oppure GEMINI_API_KEY.
// Solo gli utenti collegati all'app possono chiamarla (verifica del JWT attiva).

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

function prompt(p: { cognome: string; nome: string; mese: string; giorni: number; codici: string[] }) {
  return `La foto mostra il prospetto mensile dei turni di un laboratorio analisi: una tabella con una riga per ogni persona (cognome e nome a sinistra) e una colonna per ogni giorno del mese, con sigle nelle caselle. Può essere storta, riflettere la luce e contenere correzioni a penna: quando una sigla è corretta a mano, vale la correzione.

Trova la riga di ${p.cognome}${p.nome ? ' ' + p.nome : ''}. Il mese atteso è ${p.mese} (${p.giorni} giorni). Leggi con la massima attenzione la sigla di OGNI giorno, da 1 a ${p.giorni}, seguendo la riga e l'intestazione dei giorni (controlla che la colonna corrisponda al numero del giorno, e le lettere dei giorni della settimana se presenti).

Sigle ammesse: ${p.codici.join(', ')}. Se una casella è vuota scrivi "-". Se non riesci a leggerla con sicurezza scrivi la tua ipotesi migliore e metti il numero del giorno in "dubbi". Non inventare: meglio un dubbio che una sigla sbagliata.

Rispondi SOLO con JSON, senza altro testo:
{"riga_trovata": true/false, "mese_letto": "es. ottobre 2026 oppure null", "sigle": [esattamente ${p.giorni} elementi], "dubbi": [numeri dei giorni incerti], "nota": "una frase su eventuali problemi (foto sfocata, riga non trovata, ecc.)"}`;
}

async function chiediClaude(key: string, mime: string, b64: string, testo: string) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: Deno.env.get('ANTHROPIC_MODEL') || 'claude-sonnet-5-5', max_tokens: 1500,
      messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: mime, data: b64 } }, { type: 'text', text: testo }] }],
    }),
  });
  if (!r.ok) throw new Error('Claude ' + r.status + ' ' + (await r.text()).slice(0, 300));
  const j = await r.json();
  return (j.content || []).map((c: { text?: string }) => c.text || '').join('');
}

async function chiediGemini(key: string, mime: string, b64: string, testo: string) {
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + (Deno.env.get('GEMINI_MODEL') || 'gemini-2.5-flash') + ':generateContent', {
    method: 'POST', headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: testo }, { inline_data: { mime_type: mime, data: b64 } }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0 } }),
  });
  if (!r.ok) throw new Error('Gemini ' + r.status + ' ' + (await r.text()).slice(0, 300));
  const j = await r.json();
  return (j.candidates?.[0]?.content?.parts || []).map((p: { text?: string }) => p.text || '').join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ errore: 'metodo non valido' }, 405);
  try {
    const b = await req.json();
    const mime = ['image/jpeg', 'image/png', 'image/webp'].includes(b.mime) ? b.mime : 'image/jpeg';
    const img = String(b.image || '');
    if (img.length < 1000 || img.length > 6_000_000) return json({ errore: 'immagine non valida o troppo grande' }, 400);
    const giorni = Math.min(31, Math.max(28, Number(b.giorni) || 30));
    const codici = (Array.isArray(b.codici) ? b.codici : []).map((x: unknown) => String(x).slice(0, 6)).slice(0, 40);
    const p = { cognome: String(b.cognome || '').slice(0, 40), nome: String(b.nome || '').slice(0, 40), mese: String(b.mese || '').slice(0, 30), giorni, codici };
    if (!p.cognome) return json({ errore: 'manca il cognome' }, 400);
    const testo = prompt(p);
    const kc = Deno.env.get('ANTHROPIC_API_KEY'), kg = Deno.env.get('GEMINI_API_KEY');
    if (!kc && !kg) return json({ errore: 'nessuna chiave configurata (ANTHROPIC_API_KEY o GEMINI_API_KEY)' }, 500);
    const out = kc ? await chiediClaude(kc, mime, img, testo) : await chiediGemini(kg!, mime, img, testo);
    const m = out.match(/\{[\s\S]*\}/);
    if (!m) return json({ errore: 'risposta non leggibile' }, 502);
    const r = JSON.parse(m[0]);
    const sigle = (Array.isArray(r.sigle) ? r.sigle : []).slice(0, 31).map((x: unknown) => (x == null ? '-' : String(x).trim().slice(0, 6) || '-'));
    return json({ riga_trovata: r.riga_trovata !== false, mese_letto: r.mese_letto ?? null, sigle, dubbi: Array.isArray(r.dubbi) ? r.dubbi.map(Number).filter((n: number) => n >= 1 && n <= 31) : [], nota: r.nota ? String(r.nota).slice(0, 200) : '' });
  } catch (e) {
    return json({ errore: String((e as Error).message || e).slice(0, 300) }, 500);
  }
});

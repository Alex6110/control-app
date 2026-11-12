/**
 * Scadenziario – lettore della posta Gmail (Google Apps Script)
 *
 * Cosa fa: ogni 10 minuti guarda le mail nuove e, se parlano di una scadenza
 * (polizza, bolletta, bollo, rata, tassa…), manda all'app una PROPOSTA con data,
 * importo e link alla mail. Nell'app compare in "Da confermare": non entra nulla
 * senza che una persona prema "Aggiungi".
 *
 * Cosa NON fa: non scrive, non cancella, non sposta e non inoltra mail.
 * Dall'account esce solo il riassunto (mittente, oggetto, data, importo, link).
 * I PDF vengono letti con Google Drive: il file temporaneo viene subito cestinato.
 *
 * INSTALLAZIONE: vedi gmail/LEGGIMI-GMAIL.md
 */

// ====== DA COMPILARE (3 righe) ======
var SUPABASE_URL = 'https://XXXX.supabase.co';   // lo stesso di config.js
var SUPABASE_ANON_KEY = 'INCOLLA_LA_CHIAVE_ANON'; // la stessa di config.js
var INBOX_TOKEN = 'INCOLLA_LA_CHIAVE_DELLA_POSTA'; // App → Impostazioni → Posta automatica → Copia la chiave
// ====================================

var GIORNI_INDIETRO = 3;        // quanti giorni di posta guardare
var MAX_MAIL_PER_GIRO = 30;
var MAX_PDF_BYTES = 6 * 1024 * 1024;

/* ---------------------------------------------------------------
 * PARTE 1 – lettura del testo (funzioni pure, provate con Node)
 * ------------------------------------------------------------- */
var MESI = { gennaio: 1, febbraio: 2, marzo: 3, aprile: 4, maggio: 5, giugno: 6, luglio: 7, agosto: 8, settembre: 9, ottobre: 10, novembre: 11, dicembre: 12,
  gen: 1, feb: 2, mar: 3, apr: 4, mag: 5, giu: 6, lug: 7, ago: 8, set: 9, sett: 9, ott: 10, nov: 11, dic: 12 };

var TIPI = [ // [id, etichetta, regex]  (l'ordine conta: il primo che trova vince)
  ['bollo', 'Bollo auto', /\bbollo\b|tassa automobilistica|tassa di propriet[àa] (?:auto|veicol)/i],
  ['revisione', 'Revisione', /\brevisione\b(?=[^\n]{0,80}(?:auto|veicol|moto|motorizzazione|targa|mctc))|(?:auto|veicol|moto|motorizzazione|targa)[^\n]{0,80}\brevisione\b/i],
  ['tagliando', 'Tagliando', /\btagliando\b/i],
  ['assicurazione', 'Assicurazione', /polizza|assicurazion|\brca\b|premio|rata (?:di )?premio|quietanza/i],
  ['imu', 'IMU', /\bimu\b|imposta municipale/i],
  ['rifiuti', 'TARI (rifiuti)', /\btari\b|rifiuti/i],
  ['luce', 'Bolletta luce', /energia elettrica|\bluce\b|\benel\b|plenitude|\bedison\b|\bsorgenia\b|\ba2a\b.*elettric/i],
  ['gas', 'Bolletta gas', /\bgas\b|\bmetano\b/i],
  ['acqua', 'Bolletta acqua', /servizio idrico|\bacqua\b|\bacquedotto\b|\biren\b|\bacea\b|\bhera\b.*acqua/i],
  ['internet', 'Internet', /fibra|internet|\badsl\b|\bwi-?fi\b|\btim\b|\bvodafone\b|\bfastweb\b|\bwind\s?tre\b|\biliad\b|\bsky\s?wifi\b/i],
  ['condominio', 'Condominio', /condomini|amministratore di condominio/i],
  ['abbonamento', 'Abbonamento', /abbonamento|rinnovo (?:automatico|dell)|canone/i],
];
var RICEVUTA = /quietanza|ricevuta di pagamento|pagamento (?:\S+ )?(?:ricevuto|effettuato|completato|andato a buon fine)|abbiamo ricevuto (?:il |l')?(?:suo )?pagamento|grazie per (?:aver pagato|il pagamento)/i;
var PROMO = /disiscriv|annulla (?:la )?(?:tua )?iscrizione|unsubscribe|newsletter|\bsconti?\b|\boffert[ae]\b|\bpromo(?:zione)?\b|\bsaldi\b|black friday|\bcoupon\b|risparmia/i;
var SCAD = /scadenz|da pagare entro|entro il|pagabile entro|data limite|termine di pagamento/i;

function iso(y, m, d) {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  var dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return y + '-' + ('0' + m).slice(-2) + '-' + ('0' + d).slice(-2);
}

// Tutte le date del testo con la posizione in cui compaiono.
function trovaDate(t) {
  var out = [], m, re;
  re = /\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4}|\d{2})\b/g;
  while ((m = re.exec(t))) { var v = iso(+m[3], +m[2], +m[1]); if (v) out.push({ d: v, i: m.index, len: m[0].length }); }
  re = /\b(\d{1,2})\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre|gen|feb|mar|apr|mag|giu|lug|ago|sett?|ott|nov|dic)\.?\s+(\d{4})\b/gi;
  while ((m = re.exec(t))) { var w = iso(+m[3], MESI[m[2].toLowerCase()], +m[1]); if (w) out.push({ d: w, i: m.index, len: m[0].length }); }
  return out.sort(function (a, b) { return a.i - b.i; });
}

function numero(s) { // "1.234,56" -> 1234.56
  var n = parseFloat(String(s).replace(/\./g, '').replace(',', '.'));
  return isFinite(n) ? n : null;
}

// Importo vicino a parole come "importo", "totale da pagare", "premio"; ignora "-" e "0".
function trovaImporto(t) {
  var re = /(?:importo|totale(?: da pagare)?|da pagare|premio|rata|canone)[^\d\n€]{0,40}(?:€\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/i;
  var m = re.exec(t);
  if (m) { var n = numero(m[1]); if (n) return n; }
  m = /€\s*(\d{1,3}(?:\.\d{3})*,\d{2})|(\d{1,3}(?:\.\d{3})*,\d{2})\s*(?:€|euro)/i.exec(t);
  if (m) { var k = numero(m[1] || m[2]); if (k) return k; }
  return null;
}

var TARGA = /\b([A-Z]{2})\s?(\d{3})\s?([A-Z]{2})\b/;
var TARGA_MOTO = /\b([A-Z]{2})\s?(\d{5})\b/;

var TIPI_VEICOLO = { bollo: 1, revisione: 1, tagliando: 1, assicurazione: 1 };

function trovaTipo(t) {
  for (var i = 0; i < TIPI.length; i++) if (TIPI[i][2].test(t)) return { id: TIPI[i][0], label: TIPI[i][1] };
  return null;
}

function nomeMittente(from) {
  var m = /^\s*"?([^"<]+?)"?\s*<([^>]+)>/.exec(from || '');
  var nome = m ? m[1].trim() : '';
  var mail = m ? m[2] : String(from || '');
  var dom = (/@([^>\s]+)/.exec(mail) || [])[1] || '';
  var base = dom.replace(/^(mail|email|noreply|no-reply|info)\./i, '').split('.')[0];
  if (nome && !/^(no.?reply|info|servizio clienti)$/i.test(nome)) return nome;
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : mail;
}

/**
 * Legge una mail (oggetto + corpo + testo degli allegati) e restituisce
 * un elenco di proposte (può essere vuoto). Non inventa mai dati: se non
 * trova una data o una ricevuta, non propone nulla.
 */
function analizza(msg) {
  var allegati = (msg.allegati || []).join('\n');
  var t = ((msg.oggetto || '') + '\n' + (msg.corpo || '') + '\n' + allegati).replace(/[ \t\u00a0]+/g, ' ');
  // il tipo si decide prima dall'oggetto, poi dal mittente, e solo per ultimo dal testo
  var tipo = trovaTipo(msg.oggetto || '') || trovaTipo(msg.mittente || '') || trovaTipo((msg.corpo || '') + ' ' + allegati);
  if (!tipo) return [];
  var ricevuta = RICEVUTA.test(t) && !/in scadenza|le ricord|scadenza (?:rata|della)/i.test(t);
  var date = trovaDate(t);
  var promo = PROMO.test(t);
  var base = { sender: nomeMittente(msg.mittente), subject: (msg.oggetto || '').slice(0, 250), kind: tipo.id, link: msg.link || '', ext: msg.id, paid_hint: ricevuta };
  var righe = [];

  // 1) tabelle del tipo "polizza  targa  data  importo" (una riga = una scadenza)
  var re = /(\d{6,12})\s+([A-Z]{2}\s?\d{3}\s?[A-Z]{2}|[A-Z]{2}\s?\d{5})\b[^\n]{0,60}?(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{4})(?:\s*(?:€\s*)?(\d{1,3}(?:\.\d{3})*,\d{2})|\s*[-–])?/g, m;
  while ((m = re.exec(t))) {
    var dd = m[3].split(/[\/.\-]/);
    var d = iso(+dd[2], +dd[1], +dd[0]);
    if (!d) continue;
    righe.push({ due_date: d, amount: m[4] ? numero(m[4]) : null, plate: m[2].replace(/\s/g, ''), ref: m[1] });
  }
  // 2) altrimenti una sola proposta: la data più vicina a "scadenza / entro il"
  if (!righe.length) {
    var best = null;
    date.forEach(function (x) {
      var vicino = t.slice(Math.max(0, x.i - 70), x.i + x.len + 10);
      if (SCAD.test(vicino) && !best) best = x;
    });
    if (!best && date.length === 1) best = date[0];
    var ref = (/(?:polizza|contratto|cliente|fattura|utenza)\s*(?:n[°o.]?|numero|nr\.?)?\s*[:\s]\s*([A-Z0-9\/\-]{6,20})/i.exec(t) || [])[1] || '';
    var targa = (TARGA.exec(t) || TARGA_MOTO.exec(t) || [])[0] || '';
    if (best || ricevuta) righe.push({ due_date: best ? best.d : null, amount: trovaImporto(t), plate: targa.replace(/\s/g, ''), ref: ref });
  }
  if (!righe.length) return [];
  var assemblea = tipo.id === 'condominio' && /assemblea|convocazione/i.test(msg.oggetto || '');
  if (assemblea) {
    var dOgg = trovaDate(msg.oggetto || '')[0];
    var dTesto = dOgg || date[0];
    righe = [{ due_date: dTesto ? dTesto.d : null, amount: null, plate: '', ref: '' }];
    tipo = { id: 'condominio', label: 'Assemblea condominio' };
  }
  if (!TIPI_VEICOLO[tipo.id]) righe.forEach(function (r) { r.plate = ''; });
  if (promo && !righe.some(function (r) { return r.due_date; })) return [];   // pubblicità senza scadenza
  if (promo && !ricevuta && !SCAD.test(t)) return [];

  return righe.map(function (r, n) {
    var etichetta = ricevuta ? 'Pagamento ricevuto' : (tipo.id === 'assicurazione' && /rat[ae]/i.test(t) ? 'Rata assicurazione' : tipo.label);
    return {
      ext_id: base.ext + ':' + n, sender: base.sender, subject: base.subject, kind: base.kind,
      title: etichetta + ' · ' + base.sender, due_date: r.due_date, amount: r.amount, plate: r.plate || null, ref: r.ref || null,
      link: base.link, note: null, paid_hint: base.paid_hint,
    };
  });
}

/* ---------------------------------------------------------------
 * PARTE 2 – Gmail, Drive e invio all'app (solo in Apps Script)
 * ------------------------------------------------------------- */
function testoDaPdf(blob) {
  if (blob.getBytes().length > MAX_PDF_BYTES) return '';
  var id = null;
  try {
    // Richiede il servizio avanzato "Drive API" (v3): vedi la guida.
    var f = Drive.Files.create({ name: 'tmp-scadenziario', mimeType: 'application/vnd.google-apps.document' }, blob, { ocrLanguage: 'it' });
    id = f.id;
    return DocumentApp.openById(id).getBody().getText();
  } catch (e) {
    Logger.log('PDF non leggibile: ' + e);
    return '';
  } finally {
    if (id) { try { DriveApp.getFileById(id).setTrashed(true); } catch (e2) {} }
  }
}

function giaVisti() { return JSON.parse(PropertiesService.getScriptProperties().getProperty('visti') || '[]'); }
function segnaVisto(id) {
  var v = giaVisti(); v.push(id);
  PropertiesService.getScriptProperties().setProperty('visti', JSON.stringify(v.slice(-400)));
}

function raccogli() {
  var email = Session.getEffectiveUser().getEmail();
  var q = 'in:inbox newer_than:' + GIORNI_INDIETRO + 'd -category:promotions -category:social -category:forums';
  var visti = giaVisti(), righe = [], idsNuovi = [], n = 0;
  GmailApp.search(q, 0, MAX_MAIL_PER_GIRO).forEach(function (th) {
    th.getMessages().forEach(function (m) {
      var id = m.getId();
      if (visti.indexOf(id) >= 0 || n >= MAX_MAIL_PER_GIRO) return;
      n++; idsNuovi.push(id);
      var allegati = [];
      m.getAttachments({ includeInlineImages: false }).forEach(function (a) {
        if (/pdf/i.test(a.getContentType())) allegati.push(testoDaPdf(a.copyBlob()));
      });
      var link = 'https://mail.google.com/mail/?authuser=' + encodeURIComponent(email) + '#all/' + th.getId();
      var r = analizza({ id: id, mittente: m.getFrom(), oggetto: m.getSubject(), corpo: m.getPlainBody().slice(0, 20000), allegati: allegati, link: link });
      r.forEach(function (x) { righe.push(x); });
    });
  });
  return { righe: righe, ids: idsNuovi };
}

function invia(righe) {
  var res = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/rpc/submit_inbox', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY },
    payload: JSON.stringify({ p_token: INBOX_TOKEN, p_rows: righe }),
  });
  if (res.getResponseCode() >= 300) throw new Error('Invio non riuscito (' + res.getResponseCode() + '): ' + res.getContentText());
  return res.getContentText();
}

// Funzione che gira da sola ogni 10 minuti.
function controllaPosta() {
  var r = raccogli();
  if (r.righe.length) invia(r.righe);
  r.ids.forEach(segnaVisto);
  Logger.log('Mail guardate: ' + r.ids.length + ' · proposte inviate: ' + r.righe.length);
}

// Prova a secco: mostra nel registro che cosa troverebbe, senza inviare niente.
function provaSenzaInviare() {
  var r = raccogli();
  Logger.log(JSON.stringify(r.righe, null, 2));
  Logger.log('Mail guardate: ' + r.ids.length + ' · proposte: ' + r.righe.length + ' (niente inviato)');
}

// Da lanciare UNA volta: crea il controllo automatico ogni 10 minuti.
function installaControlloAutomatico() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'controllaPosta') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('controllaPosta').timeBased().everyMinutes(10).create();
  Logger.log('Fatto: da ora la posta viene controllata ogni 10 minuti.');
}

if (typeof module !== 'undefined') module.exports = { analizza: analizza, trovaDate: trovaDate, trovaImporto: trovaImporto };

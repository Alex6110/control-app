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
  ['documento', 'Documento in scadenza', /\bspid\b|\bcie(?:id)?\b|posteid|carta d.identit|passaporto|\bpatente\b|tessera sanitaria|firma digitale|certificato digitale/i],
  ['abbonamento', 'Abbonamento', /abbonamento|rinnovo (?:automatico|dell)|canone/i],
  ['altro', 'Pagamento pagoPA', /pagopa/i],
];
// Mail da NON proporre mai come scadenza (preventivi, codici, accessi, sondaggi…)
var NEGATIVI = /cambio password|notifica cambio|revoca otp|notifiche? di accesso|avviso di accesso|verifica identit[àa] digitale|certificato di malattia|avviso di sicurezza|informativa|aggiornamento (?:ai|alla|dei|alle) |termini (?:e condizioni|di servizio)|tracking pixel|preventiv|quotazione|codice (?:di )?(?:verifica|accesso|sicurezza)|\botp\b|nuovo accesso|accesso eseguito|reimposta (?:la )?password|conferma (?:la tua )?(?:registrazione|iscrizione)|benvenut[oa]|sondaggio|questionario|ti piace|valuta (?:il|la|l')|recensione/i;
var AUTOLETTURA = /autolettura/i;
// Appuntamenti
var APPUNT = /appuntament|prenotazion|prenotat[oa]|visita (?:medica|specialistica|di controllo|ambulatoriale|oculistica|cardiologica)|\bvisita\b|\bprelievo\b|ecografia|\besame\b|vaccin|colloquio|\briunione\b|assemblea|convocazione|sopralluogo|intervento (?:tecnico|programmato)|ritiro (?:referto|documenti)|\bseduta\b/i;
var ORA = /(?:\bore\b|\balle\b|\bh\b|dalle)\s*(\d{1,2})(?:[:.h](\d{2}))?|\b([01]?\d|2[0-3]):([0-5]\d)\b/i;
var LUOGO = /(?:presso|luogo|sede|ambulatorio|ospedale|studio|indirizzo)\s*[:\-]?\s*([A-ZÀ-Ý0-9][^\n.;]{3,70})|\b((?:in |a )?(?:via|viale|piazza|corso|largo|lungomare)\s+[A-ZÀ-Ýa-zà-ý' ]{2,40}\s*,?\s*\d{0,4}[^\n.;]{0,20})/i;
var RICEVUTA = /riepilogo del tuo pagamento|ricevuta (?:telematica|pagopa)|conferma di avvenuto pagamento|quietanza|ricevuta di pagamento|pagamento (?:\S+ )?(?:ricevuto|effettuato|completato|andato a buon fine)|abbiamo ricevuto (?:il |l')?(?:suo )?pagamento|grazie per (?:aver pagato|il pagamento)/i;
// Mittenti che mandano solo pubblicità, newsletter, corsi, avvisi di sicurezza o notifiche: non diventano mai scadenze.
// (Lista fatta sull'elenco reale dei mittenti di Giovanni e Patrizia. Aggiungine altri quando serve.)
var DOMINI_IGNORATI = /(?:^|\.)(?:accounts\.google\.com|google\.com|openai\.com|supabase\.io|dropbox\.com|subito\.it|mymercato\.it|fastfooddiet\.it|insideapple\.apple\.com|modadistrict\.com|triumph\.com|yesalps\.com|ticketone\.it|change\.org|fpcgil\.it|trenitalia\.it|mooneygo\.it|mycicero\.it|dimar\.it)$/i;
// Mittenti che mandano soprattutto pubblicità, ma ogni tanto anche cose che contano (rinnovi, costi, scadenze di SPID/CIE…):
// le loro mail si leggono davvero e diventano proposta SOLO se il testo parla di una scadenza/rinnovo/addebito con una data.
var DOMINI_RUMOROSI = /(?:^|\.)(?:amazon\.(?:it|com)|amazonmusic\.com|dazn\.com|segugio\.it|telepass\.com|services\.telepass\.it|unipol\.it|paypal\.(?:com|it)|namirial\.com|namirialnotify\.com|cartaidentita\.it|inps\.it|messaggi\.intesasanpaolo\.com|comunicazioni\.poste\.it|mail\.eon\.it|metisformazionericerca\.it|fpformazione\.it|fadecm\.net|biomedia\.net|vits\.it|italianmr\.com|tsrm\.org|tsrmpstrpgeimsv\.org|ecmclub\.org|euromediform\.it|eduiss\.it|infocongressi\.com|corsiecm\.info)$/i;
// Segnali di una cosa PERSONALE (non pubblicità): rinnovo/addebito/scadenza di qualcosa che hai
var SEGNALE_FORTE = /(?:si rinnov|verr[àa] rinnovat|rinnovo (?:automatico|dell|del)|ti verr[àa] addebitat|addebito (?:di|sul|della)|sar[àa] addebitat|scade (?:il|tra|a breve)|scadr[àa] (?:il|tra)|in scadenza (?:il|tra)|valida? fino al|data di scadenza|la tua (?:carta|identit|spid|cie|polizza|rc|assicurazione)[^.\n]{0,40}scad)/i;
function dominioDi(from) { var m = /@([^>\s"]+)/.exec(String(from || '')); return m ? m[1].toLowerCase() : ''; }

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

function trovaTipo(t, minimo) {
  for (var i = 0; i < TIPI.length; i++) {
    var debole = { condominio: 1, abbonamento: 1, internet: 1, acqua: 1, documento: 1, rifiuti: 1 }[TIPI[i][0]];
    if (!minimo || !debole) { if (TIPI[i][2].test(t)) return { id: TIPI[i][0], label: TIPI[i][1] }; continue; }
    var re = new RegExp(TIPI[i][2].source, 'gi'), n = 0;
    while (re.exec(t)) n++;
    if (n >= minimo) return { id: TIPI[i][0], label: TIPI[i][1] };
  }
  return null;
}

// Frammento di testo attorno a un punto, per spiegare "perché l'ho proposta".
function attorno(t, i, len) {
  var a = Math.max(0, i - 45), b = Math.min(t.length, i + len + 25);
  return ('…' + t.slice(a, b).replace(/\s+/g, ' ').trim() + '…').slice(0, 140);
}

function trovaOra(t) {
  var m = ORA.exec(t); if (!m) return null;
  var h = m[1] != null ? +m[1] : +m[3], mi = m[2] != null ? +m[2] : (m[4] != null ? +m[4] : 0);
  if (h > 23 || mi > 59) return null;
  return ('0' + h).slice(-2) + ':' + ('0' + mi).slice(-2);
}

function pulisciOggetto(o) { return String(o || '').replace(/^\s*((re|r|fwd|fw|i)\s*:\s*)+/i, '').replace(/^\s*(promemoria|reminder)\s*[:\-]\s*/i, '').replace(/\s+/g, ' ').trim(); }

// ICS (inviti di calendario): restituisce {due_date, time, title, place} o null
function leggiIcs(txt) {
  var m = /DTSTART[^:\n]*:(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})\d{2}(Z?))?/.exec(txt || ''); if (!m) return null;
  var y = +m[1], mo = +m[2], d = +m[3], hh = m[4] != null ? +m[4] : null, mm = m[5] != null ? +m[5] : 0;
  if (m[6] === 'Z' && hh != null) {
    var dt = new Date(Date.UTC(y, mo - 1, d, hh, mm));
    try { var f = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(dt); var q = /(\d{4})-(\d{2})-(\d{2})\D+(\d{2}):(\d{2})/.exec(f); y = +q[1]; mo = +q[2]; d = +q[3]; hh = +q[4]; mm = +q[5]; }
    catch (e) { dt = new Date(dt.getTime() + 3600000); y = dt.getUTCFullYear(); mo = dt.getUTCMonth() + 1; d = dt.getUTCDate(); hh = dt.getUTCHours(); mm = dt.getUTCMinutes(); }
  }
  var s = /SUMMARY[^:\n]*:([^\r\n]+)/.exec(txt), l = /LOCATION[^:\n]*:([^\r\n]+)/.exec(txt);
  return { due_date: iso(y, mo, d), time: hh != null ? ('0' + hh).slice(-2) + ':' + ('0' + mm).slice(-2) : null, title: s ? s[1].replace(/\\,/g, ',').trim() : '', place: l ? l[1].replace(/\\,/g, ',').trim() : '' };
}

// Se la mail parla di un appuntamento restituisce la proposta, altrimenti null.
function trovaAppuntamento(msg, t, date, base) {
  var ogg = pulisciOggetto(msg.oggetto);
  var ics = leggiIcs(msg.ics);
  var haParola = APPUNT.test(ogg) || (APPUNT.test(t.slice(0, 1500)) && ORA.test(t));
  if (!ics && !haParola) return null;
  var d = ics && ics.due_date ? ics.due_date : null, i0 = 0;
  if (!d) {
    var dOgg = trovaDate(ogg)[0];
    var cand = dOgg ? { d: dOgg.d, i: 0 } : (date.filter(function (x) { return !oggiPassata(x.d, msg.oggi); })[0] || null);
    if (!cand) return null;
    d = cand.d; i0 = cand.i;
    // se nel testo la stessa data compare ancora, l'ora si cerca lì (es. «il giorno 25 novembre alle ore 18:30»)
    date.forEach(function (x) { if (x.d === d && x.i > ogg.length + 2) i0 = x.i; });
  }
  if (oggiPassata(d, msg.oggi)) return null;
  var ora = ics && ics.time ? ics.time : (trovaOra(t.slice(i0, i0 + 400)) || trovaOra(t));
  var lm = LUOGO.exec(String(msg.corpo || '') + '\n' + String(msg.allegati ? msg.allegati.join('\n') : '')); var luogo = ics && ics.place ? ics.place : (lm ? (lm[1] || lm[2] || '').trim() : '');
  var testa = ogg + ' ' + t.slice(0, 700), mt;
  var titolo = /assemblea/i.test(testa) ? 'Assemblea condominio' : /prelievo/i.test(testa) ? 'Prelievo'
    : (mt = /visita\s+(medica|specialistica|di controllo|ambulatoriale|[a-zà-ý]+ica|[a-zà-ý]+ologica)/i.exec(testa)) ? 'Visita ' + mt[1].toLowerCase()
    : (mt = /ecografia|esame|vaccin\w*|colloquio|sopralluogo|riunione/i.exec(testa)) ? mt[0].charAt(0).toUpperCase() + mt[0].slice(1).toLowerCase()
    : (ics && ics.title) ? ics.title : (ogg && ogg.length <= 50 && !/^(appuntament|promemoria|prenotazion|convocazion|invito)/i.test(ogg)) ? ogg : 'Appuntamento';
  return { ext_id: base.ext + ':a', sender: base.sender, subject: base.subject, kind: 'appuntamento', title: titolo + ' · ' + base.sender,
    due_date: d, time: ora, amount: null, plate: null, ref: null, link: base.link, paid_hint: false,
    note: (luogo ? 'Luogo: ' + luogo.slice(0, 80) + '. ' : '') + (ics ? 'Dall\'invito di calendario.' : 'Data e ora lette dal testo della mail.') };
}
function oggiPassata(d, oggi) { return !!oggi && d < oggi; }

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
  var dom = dominioDi(msg.mittente);
  if (DOMINI_IGNORATI.test(dom)) return [];
  var oggetto = msg.oggetto || '';
  var sintetico = !oggetto.trim();
  if (sintetico) { oggetto = ((msg.corpo || '').split('\n').filter(function (r) { return r.trim(); })[0] || '').slice(0, 120); msg = Object.assign({}, msg, { oggetto: oggetto }); }
  if (NEGATIVI.test(oggetto)) return [];
  if (DOMINI_RUMOROSI.test(dom) && !(SEGNALE_FORTE.test(oggetto + ' ' + t) && trovaDate(t).length)) return [];
  var base0 = { sender: nomeMittente(msg.mittente), subject: oggetto.slice(0, 250), link: msg.link || '', ext: msg.id };
  var dateT = trovaDate(t);
  // appuntamenti (anche dagli inviti di calendario)
  var ap = trovaAppuntamento(msg, t, dateT, base0);
  if (ap && !(PROMO.test(oggetto) && !msg.ics)) return [ap];
  if (NEGATIVI.test(t.slice(0, 600))) return [];
  // autolettura: non è un pagamento ma una cosa da fare entro una data
  if (AUTOLETTURA.test(oggetto)) {
    var dl = dateT.filter(function (x) { return SCAD.test(attorno(t, x.i, x.len)) || true; })[0];
    var tp = trovaTipo(oggetto + ' ' + (msg.mittente || '')) || trovaTipo(t, 2);
    if (dl && oggiPassata(dl.d, msg.oggi)) dl = null;
    return dl ? [{ ext_id: msg.id + ':l', sender: base0.sender, subject: base0.subject, kind: 'altro', title: 'Autolettura' + (tp ? ' ' + tp.label.replace(/^Bolletta /, '') : '') + ' · ' + base0.sender, due_date: dl.d, time: null, amount: null, plate: null, ref: null, link: base0.link, paid_hint: false, note: 'Da comunicare entro la data indicata ' + attorno(t, dl.i, dl.len) }] : [];
  }
  // il tipo si decide prima dall'oggetto, poi dal mittente, e dal testo solo con prove forti (2 citazioni)
  var tipo = (sintetico ? null : trovaTipo(oggetto)) || trovaTipo(msg.mittente || '') || trovaTipo((msg.corpo || '') + ' ' + allegati, 2);
  if (!tipo) return [];
  var ricevuta = RICEVUTA.test(t) && !/in scadenza|le ricord|scadenza (?:rata|della)/i.test(t);
  var date = trovaDate(t);
  var promo = PROMO.test(t);
  var base = { sender: base0.sender, subject: base0.subject, kind: tipo.id, link: msg.link || '', ext: msg.id, paid_hint: ricevuta };
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
    if (best || ricevuta) righe.push({ due_date: best ? best.d : null, amount: trovaImporto(t), plate: targa.replace(/\s/g, ''), ref: ref, why: best ? 'Data presa da ' + attorno(t, best.i, best.len) : '' });
  }
  if (!righe.length) return [];
  var assemblea = tipo.id === 'condominio' && /assemblea|convocazione/i.test(msg.oggetto || '');
  if (assemblea) {
    var dOgg = trovaDate(msg.oggetto || '')[0];
    var dTesto = dOgg || date[0];
    righe = [{ due_date: dTesto ? dTesto.d : null, amount: null, plate: '', ref: '', why: '' }];
    tipo = { id: 'condominio', label: 'Assemblea condominio' };
  }
  if (!TIPI_VEICOLO[tipo.id]) righe.forEach(function (r) { r.plate = ''; });
  if (promo && !righe.some(function (r) { return r.due_date; })) return [];   // pubblicità senza scadenza
  if (promo && !ricevuta && !SCAD.test(t)) return [];

  return righe.map(function (r, n) {
    var etichetta = ricevuta ? 'Pagamento ricevuto' : (tipo.id === 'assicurazione' && /rat[ae]/i.test(t) ? 'Rata assicurazione' : tipo.label);
    return {
      ext_id: base.ext + ':' + n, sender: base.sender, subject: base.subject, kind: base.kind,
      title: etichetta + ' · ' + base.sender, due_date: r.due_date, time: null, amount: r.amount, plate: r.plate || null, ref: r.ref || null,
      link: base.link, note: r.why || null, paid_hint: base.paid_hint,
    };
  });
}

/* ---------------------------------------------------------------
 * PARTE 2 – Gmail, Drive e invio all'app (solo in Apps Script)
 * ------------------------------------------------------------- */
// Legge il testo di un allegato: PDF, foto/scansioni (con riconoscimento del testo), Word, OpenDocument, RTF, testo, HTML.
function leggibile(a) {
  var tipo = String(a.getContentType() || '').toLowerCase(), nome = String(a.getName() || '').toLowerCase();
  if (/pdf/.test(tipo) || /\.pdf$/.test(nome)) return 'pdf';
  if (/^image\/(jpeg|png|gif|bmp)/.test(tipo) || /\.(jpe?g|png|gif|bmp)$/.test(nome)) return a.getSize() > 25000 ? 'img' : '';   // niente loghi e firme
  if (/wordprocessing|msword|opendocument\.text|rtf|text\/plain|text\/html/.test(tipo) || /\.(docx?|odt|rtf|txt|html?)$/.test(nome)) return 'doc';
  return '';
}
function testoDaPdf(blob) {
  if (blob.getBytes().length > MAX_PDF_BYTES) return '';
  var id = null;
  try {
    // Richiede il servizio avanzato "Drive API" (v3): vedi la guida.
    var f = Drive.Files.create({ name: 'tmp-scadenziario', mimeType: 'application/vnd.google-apps.document' }, blob, { ocrLanguage: 'it' });
    id = f.id;
    // Il testo si scarica con l'API di Drive (niente servizio Documenti, che chiede un permesso in più)
    var r = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + id + '/export?mimeType=text%2Fplain',
      { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
    return r.getResponseCode() === 200 ? r.getContentText() : '';
  } catch (e) {
    Logger.log('PDF non leggibile: ' + e);
    return '';
  } finally {
    if (id) { try { Drive.Files.remove(id); } catch (e2) { try { DriveApp.getFileById(id).setTrashed(true); } catch (e3) {} } }
  }
}

function giaVisti() { return JSON.parse(PropertiesService.getScriptProperties().getProperty('visti') || '[]'); }
function segnaVisto(id) {
  var v = giaVisti(); v.push(id);
  PropertiesService.getScriptProperties().setProperty('visti', JSON.stringify(v.slice(-400)));
}

function raccogli(giorni, soloNuove) {
  var email = Session.getEffectiveUser().getEmail();
  var q = 'in:inbox newer_than:' + (giorni || GIORNI_INDIETRO) + 'd -category:promotions -category:social -category:forums';
  var visti = giaVisti(), righe = [], idsNuovi = [], n = 0;
  GmailApp.search(q, 0, MAX_MAIL_PER_GIRO).forEach(function (th) {
    th.getMessages().forEach(function (m) {
      var id = m.getId();
      if ((soloNuove !== false && visti.indexOf(id) >= 0) || n >= MAX_MAIL_PER_GIRO) return;
      n++; idsNuovi.push(id);
      var allegati = [], ics = '';
      m.getAttachments({ includeInlineImages: false }).forEach(function (a) {
        if (leggibile(a) && allegati.length < 4) allegati.push(testoDaPdf(a.copyBlob()));
        else if (/calendar|\.ics$/i.test(a.getContentType() + ' ' + a.getName())) { try { ics += a.getDataAsString(); } catch (e) {} }
      });
      var link = 'https://mail.google.com/mail/?authuser=' + encodeURIComponent(email) + '#all/' + th.getId();
      var msgObj = { id: id, mittente: m.getFrom(), oggetto: m.getSubject(), corpo: m.getPlainBody().slice(0, 20000), allegati: allegati, ics: ics, oggi: Utilities.formatDate(new Date(), 'Europe/Rome', 'yyyy-MM-dd'), link: link };
      var r = analizza(msgObj);
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

// PRIMA VOLTA: guarda le mail degli ultimi 60 giorni (a gruppi di 30 per volta) e le manda all'app.
// Lancia 'primaScansione' più volte finché nel log trovi "Mail guardate: 0".
function primaScansione() {
  var r = raccogli(60, true);
  if (r.righe.length) invia(r.righe);
  r.ids.forEach(segnaVisto);
  Logger.log('Mail guardate: ' + r.ids.length + ' · proposte inviate: ' + r.righe.length + (r.ids.length >= MAX_MAIL_PER_GIRO ? ' · ce ne sono altre: rilancia' : ' · finito'));
}
// Come sopra ma senza inviare nulla: serve solo a vedere che cosa troverebbe.
function provaUltimi60Giorni() {
  var r = raccogli(60, false);
  Logger.log(JSON.stringify(r.righe, null, 2));
  Logger.log('Mail guardate: ' + r.ids.length + ' · proposte: ' + r.righe.length + ' (niente inviato)');
}

// MAPPA DELLA POSTA: elenca chi ti scrive di più negli ultimi 90 giorni, con 2 oggetti di esempio
// (NIENTE testo delle mail, solo mittente e oggetto). Serve a scrivere regole su misura per i tuoi mittenti.
// Esegui, apri il log e incolla qui in chat l'elenco che vuoi condividere (puoi cancellare le righe private).
function elencoMittenti() {
  var per = {}, fine = 0, start = 0;
  while (start < 600) {
    var th = GmailApp.search('in:anywhere newer_than:90d -in:spam -in:trash', start, 100);
    if (!th.length) break;
    th.forEach(function (t) {
      var m = t.getMessages()[0], f = m.getFrom(), mail = (/<([^>]+)>/.exec(f) || [0, f])[1].toLowerCase();
      var dom = mail.split('@')[1] || mail;
      var o = per[dom] || (per[dom] = { n: 0, ogg: [], promo: 0 });
      o.n++; if (o.ogg.length < 2 && o.ogg.indexOf(m.getSubject()) < 0) o.ogg.push(m.getSubject());
    });
    start += 100;
  }
  var righe = Object.keys(per).sort(function (a, b) { return per[b].n - per[a].n; }).slice(0, 60).map(function (d) { return per[d].n + ' × ' + d + '  →  ' + per[d].ogg.join('  |  '); });
  Logger.log(righe.join('\n'));
}

// Da lanciare UNA volta: crea il controllo automatico ogni 10 minuti.
function installaControlloAutomatico() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'controllaPosta') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('controllaPosta').timeBased().everyMinutes(10).create();
  Logger.log('Fatto: da ora la posta viene controllata ogni 10 minuti.');
}

if (typeof module !== 'undefined') module.exports = { dominioDi: dominioDi, analizza: analizza, leggiIcs: leggiIcs, trovaDate: trovaDate, trovaImporto: trovaImporto };

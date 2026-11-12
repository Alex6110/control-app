'use strict';

/* =========================================================
   Scadenziario v2 – app.js
   Nessun build. Dati in locale (prova) oppure su Supabase con spazio condiviso.
   Richiede icons.js (funzione ic).
   ========================================================= */

const CFG = window.APP_CONFIG || {};
const MODE = CFG.supabaseUrl && CFG.supabaseKey ? 'cloud' : 'local';

/* ---------- dati di riferimento ---------- */
const CATS = {
  casa: {
    label: 'Casa', icon: 'house', add: 'Aggiungi una casa', title: 'Le tue case',
    empty: 'Aggiungi la tua casa per tenere sotto controllo affitto, bollette e tasse.',
    sugg: ['Casa in affitto', 'Casa di proprietà', 'Seconda casa'], ph: 'es. Casa in via Roma',
  },
  mezzi: {
    label: 'Mezzi', icon: 'car', add: 'Aggiungi un mezzo', title: 'I tuoi mezzi',
    empty: 'Aggiungi la tua auto o la tua moto per non dimenticare più bollo, assicurazione e revisione.',
    sugg: ['Auto', 'Moto', 'Scooter', 'Bicicletta'], ph: 'es. Fiat Panda',
  },
  altro: {
    label: 'Altro', icon: 'shapes', add: 'Aggiungi', title: 'Altro',
    empty: 'Qui puoi tenere documenti, salute, animali, abbonamenti, garanzie e tutto il resto.',
    sugg: ['Abbonamenti', 'Salute', 'Animali', 'Lavoro'], ph: 'es. Abbonamenti',
  },
};
const CAT_ORDER = ['casa', 'mezzi', 'altro'];
const TYPES = SCHEDE.TYPES, SECTIONS = SCHEDE.SECTIONS;

// Il "tipo" di un elemento (Auto/Moto, In affitto/Di proprietà, Documenti/Salute/…) decide quali schede ha.
function typeOf(cat, subtype) {
  const list = TYPES[cat] || [];
  return list.find((t) => t.id === subtype) || (cat === 'altro' ? list.find((t) => t.id === 'libero') : list[0]) || list[0];
}
const itemType = (it) => typeOf(it.category, it.subtype);

const REC = {
  none: { label: 'Una sola volta', m: 0 },
  monthly: { label: 'Ogni mese', m: 1 },
  bimonthly: { label: 'Ogni 2 mesi', m: 2 },
  quarterly: { label: 'Ogni 3 mesi', m: 3 },
  semiannual: { label: 'Ogni 6 mesi', m: 6 },
  yearly: { label: 'Ogni anno', m: 12 },
  biennial: { label: 'Ogni 2 anni', m: 24 },
};

// only: la voce compare solo per quel tipo di casa (affitto / proprieta)
const KINDS = [
  { id: 'assicurazione', label: 'Assicurazione', icon: 'shield', rec: 'yearly', cats: ['mezzi', 'casa', 'altro'] },
  { id: 'bollo', label: 'Bollo', icon: 'receipt', rec: 'yearly', cats: ['mezzi'] },
  { id: 'revisione', label: 'Revisione', icon: 'clipcheck', rec: 'biennial', cats: ['mezzi'] },
  { id: 'tagliando', label: 'Tagliando', icon: 'gauge', rec: 'yearly', cats: ['mezzi'] },
  { id: 'gomme', label: 'Gomme', icon: 'tyre', rec: 'semiannual', cats: ['mezzi'] },
  { id: 'affitto', label: 'Affitto', icon: 'key', rec: 'monthly', cats: ['casa'], only: 'affitto' },
  { id: 'condominio', label: 'Condominio', icon: 'building', rec: 'monthly', cats: ['casa'] },
  { id: 'luce', label: 'Luce', icon: 'zap', rec: 'bimonthly', cats: ['casa'] },
  { id: 'gas', label: 'Gas', icon: 'flame', rec: 'bimonthly', cats: ['casa'] },
  { id: 'acqua', label: 'Acqua', icon: 'droplet', rec: 'quarterly', cats: ['casa'] },
  { id: 'internet', label: 'Internet', icon: 'wifi', rec: 'monthly', cats: ['casa', 'altro'] },
  { id: 'rifiuti', label: 'Rifiuti (TARI)', icon: 'bin', rec: 'yearly', cats: ['casa'] },
  { id: 'imu', label: 'IMU', icon: 'landmark', rec: 'semiannual', cats: ['casa'], only: 'proprieta' },
  { id: 'caldaia', label: 'Caldaia', icon: 'thermo', rec: 'yearly', cats: ['casa'] },
  { id: 'registro', label: 'Registro contratto', icon: 'file', rec: 'yearly', cats: ['casa'], only: 'affitto' },
  { id: 'telefono', label: 'Telefono', icon: 'phone', rec: 'monthly', cats: ['casa', 'altro'] },
  { id: 'abbonamento', label: 'Abbonamento', icon: 'repeat', rec: 'monthly', cats: ['altro'] },
  { id: 'salute', label: 'Visita medica', icon: 'heart', rec: 'yearly', cats: ['altro'] },
  { id: 'animali', label: 'Veterinario', icon: 'paw', rec: 'yearly', cats: ['altro'] },
  { id: 'documento', label: 'Documento (carta d\'identità, patente…)', icon: 'file', rec: 'none', cats: ['altro'] },
  { id: 'altro', label: 'Altro', icon: 'tag', rec: 'none', cats: ['mezzi', 'casa', 'altro'] },
];
const kindOf = (id) => KINDS.find((k) => k.id === id) || KINDS[KINDS.length - 1];
KINDS.push(...SCHEDE.EXTRA_KINDS);
function kindsFor(item, keep) {
  const t = item ? itemType(item) : null;
  if (t?.kinds) return [...t.kinds, ...(keep && !t.kinds.includes(keep) ? [keep] : [])].map((id) => KINDS.find((k) => k.id === id)).filter(Boolean);
  const cat = item?.category || 'altro';
  return KINDS.filter((k) => k.id === keep || (k.cats.includes(cat) && (!k.only || !item?.subtype || k.only === item.subtype)));
}

/* ---------- utilità ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); };
const todayISO = () => toISO(new Date());
const diffDays = (a, b) => Math.round((fromISO(b) - fromISO(a)) / 86400000);
function addMonths(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(y, m - 1 + n, 1, 12);
  const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  t.setDate(Math.min(d, last));
  return toISO(t);
}
const MONTHS_SHORT = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
const fmtDate = (iso) => { const d = fromISO(iso); return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`; };
const fmtShort = (iso) => { const d = fromISO(iso); return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`; };
const _eur2 = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' });
const _eur0 = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0, useGrouping: 'always' });
const eurFmt = { format: (n) => (Math.abs(n - Math.round(n)) < 0.005 ? _eur0.format(n) : _eur2.format(n)) };
const eur0 = _eur0;
const money = (n) => (n == null || n === '' || isNaN(n) ? '' : eurFmt.format(Number(n)));

function relative(iso) {
  const d = diffDays(todayISO(), iso);
  if (d < 0) return d === -1 ? 'scaduta ieri' : `scaduta da ${-d} gg`;
  if (d === 0) return 'oggi';
  if (d === 1) return 'domani';
  if (d <= 31) return `tra ${d} giorni`;
  const m = Math.round(d / 30.4);
  return m < 12 ? (m <= 1 ? "tra circa un mese" : `tra ${m} mesi`) : (m < 18 ? "tra circa un anno" : `tra ${(m / 12).toFixed(1).replace(".", ",").replace(",0", "")} anni`);
}
const urgency = (iso) => { const d = diffDays(todayISO(), iso); return d < 0 ? 'late' : d <= 7 ? 'soon' : ''; };
const safeUrl = (u) => { try { const x = new URL(String(u || '').trim()); return /^https?:$/.test(x.protocol) ? x.href : ''; } catch { return ''; } };
const linkBtn = (u, label = 'Apri documento') => { const h = safeUrl(u); return h ? `<a class="btn secondary linkbtn" href="${esc(h)}" target="_blank" rel="noopener noreferrer">${ic('file')}${label}</a>` : ''; };
const LINK_FIELD = { k: 'link', l: 'Link al documento (facoltativo)', t: 'text', ph: 'Incolla un link: mail, Drive…', hint: 'Così il documento è sempre a un tocco, senza caricarlo qui.' };
const tile = (icon, cat) => `<div class="tile tint-${cat || 'altro'}">${ic(icon)}</div>`;

/* ---------- stato ---------- */
const state = {
  tab: 'home', itemId: null, items: [], deadlines: [], logs: [], shifts: [], shiftMonth: '', paint: null,
  user: null, hid: null, household: null, members: 1, role: 'owner', memberList: [], invites: null, inbox: [],
  ready: false, offline: !navigator.onLine, loadError: '', authMode: 'login', anim: '',
};
let sb = null;

/* ---------- archivio: locale o Supabase ---------- */
const LS = 'scadenziario.data.v1';
const emptyData = () => ({ items: [], deadlines: [], item_logs: [], inbox: [], shifts: [] });
const readLocal = () => { try { return { ...emptyData(), ...(JSON.parse(localStorage.getItem(LS)) || {}) }; } catch { return emptyData(); } };
const writeLocal = (d) => localStorage.setItem(LS, JSON.stringify(d));
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2));

const localStore = {
  async load() { return readLocal(); },
  async insert(t, row) {
    const d = readLocal();
    const r = { id: uuid(), created_at: new Date().toISOString(), ...row };
    d[t].push(r); writeLocal(d); return r;
  },
  async upsertShifts(rows) {
    const d = readLocal(); const out = [];
    for (const r of rows) {
      const i = d.shifts.findIndex((x) => x.item_id === r.item_id && x.day === r.day);
      if (i >= 0) { d.shifts[i] = { ...d.shifts[i], ...r }; out.push(d.shifts[i]); }
      else { const n = { id: uuid(), created_at: new Date().toISOString(), ...r }; d.shifts.push(n); out.push(n); }
    }
    writeLocal(d); return out;
  },
  async update(t, id, patch) {
    const d = readLocal();
    const i = d[t].findIndex((x) => x.id === id);
    d[t][i] = { ...d[t][i], ...patch }; writeLocal(d); return d[t][i];
  },
  async remove(t, id) {
    const d = readLocal();
    d[t] = d[t].filter((x) => x.id !== id);
    if (t === 'items') { d.deadlines = d.deadlines.filter((x) => x.item_id !== id); d.item_logs = d.item_logs.filter((x) => x.item_id !== id); d.shifts = d.shifts.filter((x) => x.item_id !== id); }
    writeLocal(d);
  },
};

const numAmount = (r) => (r && r.amount != null ? { ...r, amount: Number(r.amount) } : r);
const cloudStore = {
  async load() {
    const [a, b, c] = await Promise.all([
      sb.from('items').select('*').order('created_at'),
      sb.from('deadlines').select('*').order('due_date'),
      sb.from('item_logs').select('*').order('done_on', { ascending: false }),
    ]);
    if (a.error) throw a.error;
    if (b.error) throw b.error;
    const d = await sb.from('inbox').select('*').eq('status', 'new').order('due_date', { nullsFirst: false });
    const sh = await sb.from('shifts').select('*').gte('day', addMonths(todayISO(), -18));
    return { items: a.data, deadlines: b.data.map(numAmount), item_logs: c.error ? [] : c.data.map(numAmount), inbox: d.error ? [] : d.data.map(numAmount), shifts: sh.error ? [] : sh.data };
  },
  async insert(t, row) {
    const { data, error } = await sb.from(t).insert({ household_id: state.hid, ...row }).select().single();
    if (error) throw error;
    return t === 'items' ? data : numAmount(data);
  },
  async upsertShifts(rows) {
    const { data, error } = await sb.from('shifts').upsert(rows.map((r) => ({ household_id: state.hid, ...r })), { onConflict: 'item_id,day' }).select();
    if (error) throw error;
    return data;
  },
  async update(t, id, patch) {
    const { data, error } = await sb.from(t).update(patch).eq('id', id).select().single();
    if (error) throw error;
    return t === 'items' ? data : numAmount(data);
  },
  async remove(t, id) {
    const { error } = await sb.from(t).delete().eq('id', id);
    if (error) throw error;
  },
};
const store = MODE === 'cloud' ? cloudStore : localStore;

const readOnly = () => state.role === 'viewer';
const ROLE_LABEL = { owner: 'Gestisce', member: 'Può modificare', viewer: 'Solo lettura' };
function canWrite() {
  if (readOnly()) { toast('Hai accesso in sola lettura: non puoi modificare.'); return false; }
  if (MODE === 'cloud' && (state.offline || state.loadError)) { toast('Sei offline: per ora puoi solo consultare i dati.'); return false; }
  return true;
}

/* ---------- operazioni sui dati ---------- */
const byId = (arr, id) => arr.find((x) => x.id === id);
const sortDeadlines = () => state.deadlines.sort((a, b) => a.due_date.localeCompare(b.due_date));
const normItem = (i) => ({ ...i, category: i.category === 'auto' ? 'mezzi' : i.category, details: i.details || {} });

async function saveItem(id, fields) {
  if (!canWrite()) return null;
  try {
    if (id) {
      const r = normItem(await store.update('items', id, fields));
      state.items = state.items.map((x) => (x.id === id ? r : x));
      return r;
    }
    const r = normItem(await store.insert('items', fields));
    state.items.push(r);
    return r;
  } catch (e) { fail(e); return null; }
}

async function deleteItem(id) {
  if (!canWrite()) return false;
  try {
    await store.remove('items', id);
    state.items = state.items.filter((x) => x.id !== id);
    state.deadlines = state.deadlines.filter((x) => x.item_id !== id);
    state.logs = state.logs.filter((x) => x.item_id !== id);
    return true;
  } catch (e) { fail(e); return false; }
}

async function saveDeadline(id, fields) {
  if (!canWrite()) return null;
  try {
    if (id) {
      const r = await store.update('deadlines', id, fields);
      state.deadlines = state.deadlines.map((x) => (x.id === id ? r : x));
    } else {
      state.deadlines.push(await store.insert('deadlines', fields));
    }
    sortDeadlines();
    return true;
  } catch (e) { fail(e); return null; }
}

async function deleteDeadline(id) {
  if (!canWrite()) return false;
  try {
    await store.remove('deadlines', id);
    state.deadlines = state.deadlines.filter((x) => x.id !== id);
    return true;
  } catch (e) { fail(e); return false; }
}

// Segna come pagata. Se la scadenza si ripete, crea subito la successiva
// (e si ferma da solo alla fine delle rate di un mutuo o di un finanziamento).
async function markPaid(id) {
  if (!canWrite()) return;
  const dl = byId(state.deadlines, id);
  if (!dl) return;
  const sec = dl.section ? SECTIONS[dl.section] : null;
  const it = byId(state.items, dl.item_id);
  const prevDetails = it?.details;
  let nextId = null;
  try {
    const r = await store.update('deadlines', id, { paid: true, paid_on: todayISO() });
    state.deadlines = state.deadlines.map((x) => (x.id === id ? r : x));
    const step = REC[dl.recurrence]?.m || 0;
    if (step) {
      let nd = addMonths(dl.due_date, step);
      if (sec?.eom) nd = SCHEDE.eom(nd);
      if (!dl.until || nd <= dl.until) {
        const next = await store.insert('deadlines', {
          item_id: dl.item_id, kind: dl.kind, title: dl.title, due_date: nd, amount: dl.amount,
          recurrence: dl.recurrence, paid: false, note: dl.note, section: dl.section || null, until: dl.until || null,
        });
        nextId = next.id;
        state.deadlines.push(next);
      }
    }
    // "ultima volta" della scheda (es. ultima revisione) = oggi
    if (sec?.last && it) {
      const s = { ...(it.details?.s || {}) };
      s[dl.section] = { ...(s[dl.section] || {}), [sec.last]: todayISO() };
      await saveItem(it.id, { details: { ...(it.details || {}), s } });
    }
    sortDeadlines();
  } catch (e) { fail(e); render(); return; }
  render();
  toast(nextId ? 'Pagata. Ho già messo la prossima in calendario' : 'Fatto', {
    label: 'Annulla',
    fn: async () => { await reopen(id, nextId, it && prevDetails ? { itemId: it.id, details: prevDetails } : null); },
  });
}

async function reopen(id, removeNextId, restore) {
  if (!canWrite()) return;
  try {
    if (removeNextId) {
      await store.remove('deadlines', removeNextId);
      state.deadlines = state.deadlines.filter((x) => x.id !== removeNextId);
    }
    const r = await store.update('deadlines', id, { paid: false, paid_on: null });
    state.deadlines = state.deadlines.map((x) => (x.id === id ? r : x));
    if (restore) await saveItem(restore.itemId, { details: restore.details });
    sortDeadlines();
  } catch (e) { fail(e); }
  render();
}

// Lavori e ricambi
async function saveLog(id, fields) {
  if (!canWrite()) return null;
  try {
    if (id) {
      const r = await store.update('item_logs', id, fields);
      state.logs = state.logs.map((x) => (x.id === id ? r : x));
    } else state.logs.push(await store.insert('item_logs', fields));
    return true;
  } catch (e) { fail(e); return null; }
}
async function deleteLog(id) {
  if (!canWrite()) return false;
  try { await store.remove('item_logs', id); state.logs = state.logs.filter((x) => x.id !== id); return true; } catch (e) { fail(e); return false; }
}

function fail(e) {
  console.error(e);
  toast('Qualcosa è andato storto. Riprova tra un attimo.');
}

/* ---------- calcoli sui costi ---------- */
// Espande le scadenze aperte in singole occorrenze tra "from" e "to" (ISO, inclusi).
function occurrences(from, to, filter) {
  const out = [];
  for (const dl of state.deadlines) {
    if (dl.paid || (filter && !filter(dl))) continue;
    const step = REC[dl.recurrence]?.m || 0;
    let d = dl.due_date;
    if (d < from) {              // scaduta e non pagata: la conto una volta, adesso
      out.push({ dl, date: from });
      if (!step) continue;
      while (d < from) d = addMonths(d, step);
    }
    let guard = 0;
    while (d <= to && (!dl.until || d <= dl.until) && guard++ < 500) {
      out.push({ dl, date: d });
      if (!step) break;
      d = addMonths(d, step);
    }
  }
  return out;
}

function costWindow() {
  const now = new Date();
  const from = toISO(now);
  const lastMonth = new Date(now.getFullYear(), now.getMonth() + 12, 0, 12);
  const months = [];
  for (let i = 0; i < 12; i++) {
    const m = new Date(now.getFullYear(), now.getMonth() + i, 1, 12);
    months.push({ key: `${m.getFullYear()}-${pad(m.getMonth() + 1)}`, label: MONTHS_SHORT[m.getMonth()], total: 0 });
  }
  return { from, to: toISO(lastMonth), months };
}

function costSummary(filter) {
  const w = costWindow();
  const occ = occurrences(w.from, w.to, filter).filter((o) => o.dl.amount != null);
  const byItem = {}, byCat = {}, byKind = {};
  let total = 0;
  for (const { dl, date } of occ) {
    const amt = Number(dl.amount);
    total += amt;
    const m = w.months.find((x) => x.key === date.slice(0, 7));
    if (m) m.total += amt;
    byItem[dl.item_id] = (byItem[dl.item_id] || 0) + amt;
    const it = byId(state.items, dl.item_id);
    const cat = it ? it.category : 'altro';
    byCat[cat] = (byCat[cat] || 0) + amt;
    byKind[dl.kind] = (byKind[dl.kind] || 0) + amt;
  }
  const missing = state.deadlines.filter((d) => !d.paid && d.amount == null && (!filter || filter(d))).length;
  return { total, months: w.months, byItem, byCat, byKind, missing };
}
const inCat = (cat) => (dl) => byId(state.items, dl.item_id)?.category === cat;
const ofItem = (id) => (dl) => dl.item_id === id;

/* ---------- render ---------- */
const app = $('#app');
const NAV = [['home', 'today', 'Home'], ['casa', 'house', 'Casa'], ['mezzi', 'car', 'Mezzi'], ['altro', 'shapes', 'Altro']];

function render() {
  if (!state.ready) { app.innerHTML = ''; return; }
  if (MODE === 'cloud') {
    if (!state.user) { renderLogin(); updateBadge(); return; }
    if (!state.hid) { renderOnboarding(); return; }
  }
  const item = state.itemId ? byId(state.items, state.itemId) : null;
  if (state.itemId && !item) state.itemId = null;

  if (!(item && itemType(item).shifts)) state.paint = null;
  let page;
  if (item) page = pageItem(item);
  else if (state.tab === 'home') page = pageHome();
  else page = pageSection(state.tab);

  const banner = state.offline && MODE === 'cloud'
    ? `<div class="banner">${ic('alert')}<span>Sei offline: vedi l'ultima copia dei dati. Potrai modificare appena torna la connessione.</span></div>`
    : (state.loadError ? `<div class="banner">${ic('alert')}<span>${esc(state.loadError)}</span></div>` : '');

  const left = item ? `<button class="icon-btn" data-action="back" aria-label="Indietro">${ic('back')}</button>` : '';
  const right = item && !readOnly()
    ? `<button class="icon-btn" data-action="item-menu" data-id="${item.id}" aria-label="Opzioni">${ic('dots')}</button>`
    : `<button class="icon-btn" data-action="settings" aria-label="Impostazioni">${ic('sliders')}</button>`;

  app.innerHTML = `
    <header class="topbar"><div class="wrap bar ${item ? 'has-back' : ''}">
      ${left}<h1>${esc(page.title)}</h1>${right}
    </div></header>
    <main class="wrap ${state.anim === 'push' ? 'page-in' : state.anim === 'pop' ? 'page-back' : ''}">${banner}${page.body}</main>
    ${page.fab && !readOnly() ? `<button class="fab" data-action="new-deadline" ${page.fabItem ? `data-item="${page.fabItem}"` : ''}>${ic('plus')}<span>Scadenza</span></button>` : ''}
    <nav class="nav"><div class="inner">
      ${NAV.map(([id, icon, label]) => `<button data-action="tab" data-tab="${id}" class="${state.tab === id ? 'active' : ''}" aria-label="${label}">${ic(icon)}<span>${label}</span></button>`).join('')}
    </div></nav>`;
  state.anim = '';
  updateBadge();
}

function updateBadge() {
  if (!('setAppBadge' in navigator)) return;
  const today = todayISO();
  const n = state.deadlines.filter((d) => !d.paid && diffDays(today, d.due_date) <= 7).length;
  (n ? navigator.setAppBadge(n) : navigator.clearAppBadge()).catch(() => {});
}

/* --- componenti --- */
function rowDeadline(dl, opts = {}) {
  const k = kindOf(dl.kind);
  const it = byId(state.items, dl.item_id);
  const u = dl.paid ? '' : urgency(dl.due_date);
  const sub = dl.paid
    ? `Pagata il ${fmtDate(dl.paid_on || dl.due_date)}`
    : `${opts.hideItem ? '' : esc(it?.name || '') + ' · '}${relative(dl.due_date)}`;
  return `
    <div class="row ${dl.paid ? 'done' : ''}" data-action="edit-deadline" data-id="${dl.id}" role="button" tabindex="0">
      ${tile(k.icon, it?.category)}
      <div class="main"><div class="t">${esc(dl.title)}</div><div class="s ${u}">${sub}</div></div>
      <div class="right"><div class="amt">${money(dl.amount)}</div><div class="dt">${fmtShort(dl.due_date)}</div></div>
      ${dl.paid ? '' : `<button class="check" data-action="pay" data-id="${dl.id}" aria-label="Segna come pagata">${ic('check')}</button>`}
    </div>`;
}

function barsCard(months, title = 'Mese per mese') {
  const maxM = Math.max(...months.map((m) => m.total), 1);
  const bars = months.map((m, i) => `
    <div class="col ${i === 0 ? 'now' : ''} ${m.total === 0 ? 'zero' : ''}" title="${m.label}: ${eurFmt.format(m.total)}">
      <div class="v">${m.total ? (m.total >= 1000 ? (m.total / 1000).toFixed(1).replace('.', ',') + 'k' : Math.round(m.total)) : ''}</div>
      <div class="bar" style="height:${Math.max(3, (m.total / maxM) * 100)}px"></div>
      <div class="m">${m.label}</div>
    </div>`).join('');
  return `<div class="card"><h2>${title}</h2><div class="bars">${bars}</div>
    <div class="legend-note">Euro. Le scadenze non pagate contano nel mese corrente.</div></div>`;
}

function breakdown(map, labeler) {
  const entries = Object.entries(map).sort((a, b) => b[1] - a[1]);
  const max = entries[0]?.[1] || 1;
  return `<div class="brk">${entries.map(([key, val]) => {
    const l = labeler(key);
    return `<div class="line"><div class="top"><span class="lbl">${ic(l.icon)}${esc(l.name)}</span><b>${eur0.format(val)}</b></div>
      <div class="track"><div class="fill" style="width:${Math.max(3, (val / max) * 100)}%"></div></div></div>`;
  }).join('')}</div>`;
}

function heroCosts(label, total) {
  return `<section class="hero"><div class="label">${label}</div><div class="big">${eur0.format(total)}</div>
    <div class="sub">circa ${eur0.format(total / 12)} al mese da mettere da parte</div></section>`;
}

function emptyStart() {
  return `
    <div class="empty">
      <div class="big-ico">${ic('ring')}</div>
      <h3>Cominciamo da qui</h3>
      <p>Scegli che cosa vuoi tenere sotto controllo. Potrai aggiungere il resto quando vuoi.</p>
      <div class="quick">
        ${CAT_ORDER.map((c, i) => `<button class="btn ${i ? 'secondary' : ''}" data-action="new-item" data-cat="${c}">${ic(CATS[c].icon)}${CATS[c].label === 'Altro' ? 'Altro' : CATS[c].add}</button>`).join('')}
      </div>
    </div>`;
}

/* ---------- turni di lavoro ---------- */
const SHIFT_TYPES = SCHEDE.SHIFT_TYPES;
const MONTHS_LONG = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const DAYS_LONG = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
const SHIFT_COLORS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

function shiftTypes(it, withHidden) {
  const ov = it.details?.shiftTypes || [];
  const base = SHIFT_TYPES.map((d) => ({ ...d, ...(ov.find((o) => o.id === d.id) || {}) }));
  const custom = ov.filter((o) => !SHIFT_TYPES.some((d) => d.id === o.id)).map((o) => ({ ...o, custom: true }));
  const all = [...base, ...custom];
  return withHidden ? all : all.filter((x) => !x.hidden);
}
const shiftOf = (it, id) => shiftTypes(it, true).find((x) => x.id === id) || { id, label: id, short: '?', color: 0 };
const shiftHours = (t) => (t.from && t.to ? `${t.from}–${t.to}` : '');
const shiftMap = (itemId) => Object.fromEntries(state.shifts.filter((x) => x.item_id === itemId).map((x) => [x.day, x]));
const curYM = () => state.shiftMonth || todayISO().slice(0, 7);

function monthCells(ym) {
  const [y, m] = ym.split('-').map(Number);
  const lead = (new Date(y, m - 1, 1, 12).getDay() + 6) % 7;
  const days = new Date(y, m, 0).getDate();
  const total = Math.ceil((lead + days) / 7) * 7;
  return Array.from({ length: total }, (_, i) => {
    const d = new Date(y, m - 1, 1 - lead + i, 12);
    return { iso: toISO(d), n: d.getDate(), inMonth: d.getMonth() === m - 1 };
  });
}

let shiftQ = Promise.resolve();
const persistShift = (fn) => { shiftQ = shiftQ.then(fn).catch(async (e) => { fail(e); try { const d = await store.load(); state.shifts = d.shifts || []; render(); } catch {} }); return shiftQ; };

// Cambia (o svuota) un giorno: l'aggiornamento a schermo è immediato, il salvataggio avviene subito dopo, in ordine.
function applyShift(itemId, day, kind, note) {
  if (!canWrite()) return false;
  const row = state.shifts.find((x) => x.item_id === itemId && x.day === day);
  if (!kind) {
    if (!row) return true;
    state.shifts = state.shifts.filter((x) => x !== row);
    persistShift(() => store.remove('shifts', row.id));
  } else if (row) {
    const n = note === undefined ? row.note : (note || null);
    if (row.kind === kind && n === row.note) return true;
    row.kind = kind; row.note = n || null;
    persistShift(() => store.update('shifts', row.id, { kind: row.kind, note: row.note }));
  } else {
    const nr = { id: 'tmp-' + uuid(), tmp: true, item_id: itemId, day, kind, note: note || null };
    state.shifts.push(nr);
    persistShift(async () => { const r = await store.insert('shifts', { item_id: itemId, day, kind: nr.kind, note: nr.note }); Object.assign(nr, r); delete nr.tmp; });
  }
  return true;
}

function applyShiftsBulk(itemId, entries) {   // entries: [{day, kind}]
  if (!canWrite()) return false;
  const touched = [];
  for (const e of entries) {
    const row = state.shifts.find((x) => x.item_id === itemId && x.day === e.day);
    if (row) { row.kind = e.kind; touched.push(row); }
    else { const nr = { id: 'tmp-' + uuid(), tmp: true, item_id: itemId, day: e.day, kind: e.kind, note: null }; state.shifts.push(nr); touched.push(nr); }
  }
  persistShift(async () => {
    const out = await store.upsertShifts(touched.map((r) => ({ item_id: r.item_id, day: r.day, kind: r.kind, note: r.note ?? null })));
    for (const o of out) { const r = touched.find((x) => x.day === o.day); if (r) { Object.assign(r, o); delete r.tmp; } }
  });
  return true;
}

function shiftsBlock(it) {
  const ym = curYM(); const [y, m] = ym.split('-').map(Number);
  const map = shiftMap(it.id); const types = shiftTypes(it); const today = todayISO();
  const cells = monthCells(ym).map((c) => {
    const r = map[c.iso]; const t = r ? shiftOf(it, r.kind) : null;
    return `<button class="sh-cell ${c.inMonth ? '' : 'out'} ${c.iso === today ? 'today' : ''} ${t ? 'sh-c' + t.color : ''}" data-action="shift-day" data-item="${it.id}" data-day="${c.iso}"
      aria-label="${c.n} ${MONTHS_LONG[m - 1]}${t ? ': ' + esc(t.label) : ''}"><span class="d">${c.n}</span>${t ? `<span class="s">${esc(t.short)}</span>` : ''}${r?.note ? '<i class="nt"></i>' : ''}</button>`;
  }).join('');
  const counts = {};
  Object.values(map).filter((r) => r.day.startsWith(ym)).forEach((r) => { counts[r.kind] = (counts[r.kind] || 0) + 1; });
  const summary = Object.entries(counts).map(([k, n]) => { const t = shiftOf(it, k); return `<span class="sh-sum sh-c${t.color}"><b>${n}</b> ${esc(t.label)}</span>`; }).join('');
  const painting = state.paint && (state.paint === '__erase' ? { label: 'gomma' } : shiftOf(it, state.paint));
  const palette = readOnly() ? '' : `
    <div class="sh-palette">
      ${types.map((t) => `<button class="sh-chip sh-c${t.color} ${state.paint === t.id ? 'sel' : ''}" data-action="shift-paint" data-type="${t.id}"><b>${esc(t.short)}</b>${esc(t.label)}</button>`).join('')}
      <button class="sh-chip erase ${state.paint === '__erase' ? 'sel' : ''}" data-action="shift-paint" data-type="__erase">${ic('trash')}Gomma</button>
      <button class="sh-chip more" data-action="shift-types" data-id="${it.id}">${ic('sliders')}Tipi</button>
    </div>
    <p class="hint sh-hint">${painting ? (state.paint === '__erase' ? 'Tocca i giorni da svuotare.' : `Tocca i giorni da segnare come «${esc(painting.label)}».`) + ' Tocca di nuovo il tipo per smettere.' : 'Tocca un giorno per scegliere il turno. Oppure scegli un tipo qui sopra e poi tocca più giorni in fila.'}</p>`;
  return `
    <div class="card sh-card">
      <div class="sh-nav">
        <button class="icon-btn" data-action="shift-month" data-delta="-1" aria-label="Mese precedente">${ic('back')}</button>
        <button class="sh-title" data-action="shift-month" data-delta="0">${MONTHS_LONG[m - 1]} ${y}</button>
        <button class="icon-btn" data-action="shift-month" data-delta="1" aria-label="Mese successivo">${ic('next')}</button>
      </div>
      <div class="sh-week">${['L', 'M', 'M', 'G', 'V', 'S', 'D'].map((x) => `<span>${x}</span>`).join('')}</div>
      <div class="sh-grid">${cells}</div>
      ${summary ? `<div class="sh-sums">${summary}</div>` : ''}
    </div>
    ${palette}
    <div class="actions row-actions">
      ${readOnly() ? '' : `<button class="btn secondary" data-action="shift-cycle" data-id="${it.id}">${ic('repeat')}Ripeti un ciclo</button>`}
      <button class="btn secondary" data-action="shift-print" data-id="${it.id}">${ic('printer')}Stampa</button>
    </div>`;
}

function openShiftDay(itemId, iso) {
  const it = byId(state.items, itemId); if (!it) return;
  const row = state.shifts.find((x) => x.item_id === itemId && x.day === iso);
  const d = fromISO(iso);
  openSheet(`${DAYS_LONG[d.getDay()]} ${d.getDate()} ${MONTHS_LONG[d.getMonth()]}`, `
    <div class="shift-pick">${shiftTypes(it).map((t) => `
      <button class="sh-big sh-c${t.color} ${row?.kind === t.id ? 'sel' : ''}" data-action="shift-pick" data-item="${itemId}" data-day="${iso}" data-type="${t.id}">
        <b>${esc(t.short)}</b><span>${esc(t.label)}${shiftHours(t) ? `<i>${shiftHours(t)}</i>` : ''}</span></button>`).join('')}</div>
    <label>Nota (facoltativa)<input id="shift-note" maxlength="80" value="${esc(row?.note || '')}" placeholder="es. cambio con Anna"></label>
    <p class="hint">Scegli il turno per salvare anche la nota.</p>
    ${row ? `<div class="actions"><button class="btn danger" data-action="shift-clear" data-item="${itemId}" data-day="${iso}">${ic('trash')}Svuota questo giorno</button></div>` : ''}`);
}

// Tipi di turno: nome, sigla, colore, orario. I predefiniti si possono modificare o nascondere.
function openShiftTypes(itemId) {
  const it = byId(state.items, itemId); if (!it) return;
  const rows = shiftTypes(it, true).map((t) => `
    <button class="row ${t.hidden ? 'done' : ''}" data-action="edit-shift-type" data-item="${itemId}" data-type="${t.id}">
      <span class="sh-chip sh-c${t.color}" style="pointer-events:none"><b>${esc(t.short)}</b></span>
      <div class="main"><div class="t">${esc(t.label)}</div><div class="s">${shiftHours(t) || 'senza orario'}${t.hidden ? ' · nascosto' : ''}</div></div>
      <span class="chev">${ic('pencil')}</span>
    </button>`).join('');
  openSheet('Tipi di turno', `<div class="list">${rows}</div>
    <div class="actions"><button class="btn" data-action="new-shift-type" data-item="${itemId}">${ic('plus')}Aggiungi un tipo</button></div>`);
}

function openShiftTypeForm(itemId, typeId) {
  const it = byId(state.items, itemId); if (!it) return;
  const t = typeId ? shiftOf(it, typeId) : { label: '', short: '', color: 9, from: '', to: '' };
  const isDefault = SHIFT_TYPES.some((d) => d.id === typeId);
  openSheet(typeId ? 'Modifica tipo' : 'Nuovo tipo di turno', `
    <form id="stype-form" data-item="${itemId}" data-type="${typeId || ''}">
      <label>Nome<input name="label" required maxlength="24" value="${esc(t.label)}" placeholder="es. Reperibilità"></label>
      <div class="row2">
        <label>Sigla<input name="short" required maxlength="3" value="${esc(t.short)}" placeholder="es. Re"></label>
        <label>Colore<input type="hidden" name="color" value="${t.color}">
          <div class="swatches">${SHIFT_COLORS.slice(1).map((c) => `<button type="button" class="sw sh-c${c} ${c === t.color ? 'sel' : ''}" data-action="pick-color" data-color="${c}" aria-label="Colore ${c}"></button>`).join('')}</div></label>
      </div>
      <div class="row2">
        <label>Dalle<input type="time" name="from" value="${t.from || ''}"></label>
        <label>Alle<input type="time" name="to" value="${t.to || ''}"></label>
      </div>
      <div class="actions"><button class="btn" type="submit">Salva</button>
        ${typeId && isDefault ? `<button type="button" class="btn secondary" data-action="toggle-shift-type" data-item="${itemId}" data-type="${typeId}">${t.hidden ? 'Mostra di nuovo' : 'Nascondi dalle scelte'}</button>` : ''}
        ${typeId && !isDefault ? `<button type="button" class="btn danger" data-action="delete-shift-type" data-item="${itemId}" data-type="${typeId}">${ic('trash')}Elimina</button>` : ''}
      </div>
    </form>`);
}

async function onShiftTypeSubmit(form) {
  const it = byId(state.items, form.dataset.item); if (!it) return;
  const f = form.elements; const id = form.dataset.type || ('c_' + Date.now().toString(36));
  const entry = { id, label: f.label.value.trim(), short: f.short.value.trim(), color: Number(f.color.value) || 9, from: f.from.value || '', to: f.to.value || '' };
  const prev = it.details?.shiftTypes || [];
  const old = prev.find((x) => x.id === id);
  if (old?.hidden) entry.hidden = true;
  const list = old ? prev.map((x) => (x.id === id ? entry : x)) : [...prev, entry];
  if (await saveItem(it.id, { details: { ...(it.details || {}), shiftTypes: list } })) { openShiftTypes(it.id); render(); toast('Salvato'); }
}

// Ripeti un ciclo: es. Mattina, Pomeriggio, Notte, Riposo, Riposo per tutto il periodo scelto.
let cycleSeq = [];
const CYCLE_PRESETS = [
  ['5 giorni + 2 di riposo', ['giornata', 'giornata', 'giornata', 'giornata', 'giornata', 'riposo', 'riposo']],
  ['Mattina, Pomeriggio, Notte, 2 riposi', ['mattina', 'pomeriggio', 'notte', 'riposo', 'riposo']],
];
function cycleHTML(it) {
  const ym = curYM(); const today = todayISO();
  const start = today.startsWith(ym) ? today : ym + '-01';
  return `
    <form id="cycle-form" data-item="${it.id}">
      <div class="flabel">1. Costruisci la sequenza, un giorno alla volta</div>
      <div class="sh-palette">${shiftTypes(it).map((t) => `<button type="button" class="sh-chip sh-c${t.color}" data-action="cycle-add" data-item="${it.id}" data-type="${t.id}"><b>${esc(t.short)}</b>${esc(t.label)}</button>`).join('')}</div>
      <div class="cycle-seq" id="cycle-seq">${cycleSeqHTML(it)}</div>
      <div class="sugg">${CYCLE_PRESETS.map(([l], i) => `<button type="button" class="chip" data-action="cycle-preset" data-item="${it.id}" data-i="${i}">${esc(l)}</button>`).join('')}</div>
      <div class="flabel">2. Da quando e per quanto</div>
      <div class="row2">
        <label>Primo giorno<input type="date" name="start" required value="${start}"></label>
        <label>Per quanto<select name="span">
          <option value="eom">Fino a fine mese</option><option value="4w">4 settimane</option><option value="8w">8 settimane</option>
          <option value="3m">3 mesi</option><option value="6m">6 mesi</option></select></label>
      </div>
      <p class="hint">I giorni già compilati in quel periodo vengono sostituiti.</p>
      <div class="actions"><button class="btn" type="submit">Applica</button></div>
    </form>`;
}
const cycleSeqHTML = (it) => cycleSeq.length
  ? `${cycleSeq.map((id) => { const t = shiftOf(it, id); return `<span class="sh-sum sh-c${t.color}"><b>${esc(t.short)}</b></span>`; }).join('<i>›</i>')}
     <button type="button" class="chip" data-action="cycle-undo" data-item="${it.id}">Togli l'ultimo</button>`
  : '<span class="hint" style="margin:0">Tocca i turni qui sopra nell\'ordine in cui si ripetono.</span>';
function openShiftCycle(itemId) { const it = byId(state.items, itemId); if (!it) return; cycleSeq = []; openSheet('Ripeti un ciclo', cycleHTML(it)); }

async function onCycleSubmit(form) {
  const it = byId(state.items, form.dataset.item); if (!it) return;
  if (!cycleSeq.length) { toast('Aggiungi almeno un turno alla sequenza.'); return; }
  const start = form.elements.start.value, span = form.elements.span.value;
  const s = fromISO(start);
  let end;
  if (span === 'eom') end = toISO(new Date(s.getFullYear(), s.getMonth() + 1, 0, 12));
  else if (span.endsWith('w')) end = toISO(new Date(s.getFullYear(), s.getMonth(), s.getDate() + parseInt(span, 10) * 7 - 1, 12));
  else end = toISO(new Date(s.getFullYear(), s.getMonth() + parseInt(span, 10), s.getDate() - 1, 12));
  const entries = []; let i = 0;
  for (let d = fromISO(start); toISO(d) <= end; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 12)) {
    entries.push({ day: toISO(d), kind: cycleSeq[i % cycleSeq.length] }); i++;
  }
  if (applyShiftsBulk(it.id, entries)) { state.shiftMonth = start.slice(0, 7); closeSheetNow(); render(); toast(`${entries.length} giorni compilati`); }
}

/* --- stampa del mese --- */
function printShifts(itemId) {
  const it = byId(state.items, itemId); if (!it) return;
  const ym = curYM(); const [y, m] = ym.split('-').map(Number);
  const map = shiftMap(itemId);
  const used = new Set(Object.values(map).filter((r) => r.day.startsWith(ym)).map((r) => r.kind));
  const rows = [];
  const cells = monthCells(ym);
  for (let i = 0; i < cells.length; i += 7) {
    rows.push(`<tr>${cells.slice(i, i + 7).map((c) => {
      const r = c.inMonth ? map[c.iso] : null; const t = r ? shiftOf(it, r.kind) : null;
      return `<td class="${c.inMonth ? '' : 'out'} ${t ? 'pr-c' + t.color : ''}"><span class="d">${c.n}</span>${t ? `<b>${esc(t.short)}</b><small>${esc(shiftHours(t))}</small>` : ''}${r?.note ? `<em>${esc(r.note)}</em>` : ''}</td>`;
    }).join('')}</tr>`);
  }
  const legend = shiftTypes(it, true).filter((t) => used.has(t.id))
    .map((t) => `<span class="pr-leg pr-c${t.color}"><b>${esc(t.short)}</b> ${esc(t.label)}${shiftHours(t) ? ' ' + shiftHours(t) : ''}</span>`).join('');
  const counts = [...used].map((k) => `${Object.values(map).filter((r) => r.day.startsWith(ym) && r.kind === k).length} ${shiftOf(it, k).label.toLowerCase()}`).join(' · ');
  let root = document.getElementById('print-root');
  if (!root) { root = document.createElement('div'); root.id = 'print-root'; document.body.appendChild(root); }
  root.innerHTML = `
    <div class="pr-head"><h1>${esc(it.name)}</h1><div>${MONTHS_LONG[m - 1].charAt(0).toUpperCase() + MONTHS_LONG[m - 1].slice(1)} ${y}</div></div>
    <table class="pr-grid"><thead><tr>${['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'].map((x) => `<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>
    <div class="pr-legend">${legend || ''}</div>
    ${counts ? `<div class="pr-sum">Riepilogo: ${esc(counts)}</div>` : ''}`;
  setTimeout(() => window.print(), 80);
}

function shiftsTodayCard() {
  const today = todayISO(); const tom = toISO(new Date(fromISO(today).getTime() + 86400000));
  const rows = state.items.filter((i) => itemType(i).shifts).map((it) => {
    const a = state.shifts.find((x) => x.item_id === it.id && x.day === today);
    const b = state.shifts.find((x) => x.item_id === it.id && x.day === tom);
    if (!a && !b) return '';
    const part = (r, lbl) => { if (!r) return ''; const t = shiftOf(it, r.kind); return `<span class="sh-sum sh-c${t.color}"><b>${esc(t.short)}</b> ${lbl}: ${esc(t.label)}${shiftHours(t) ? ' ' + shiftHours(t) : ''}</span>`; };
    return `<button class="row" data-action="open-item" data-id="${it.id}">${tile('briefcase', 'altro')}
      <div class="main"><div class="t">${esc(it.name)}</div><div class="s sh-today">${part(a, 'oggi')}${part(b, 'domani')}</div></div><span class="chev">${ic('next')}</span></button>`;
  }).join('');
  return rows ? `<div class="group-title">Turni</div><div class="list">${rows}</div>` : '';
}

/* --- posta da confermare --- */
const normPlate = (x) => String(x || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
function inboxMatch(r) {
  const plate = normPlate(r.plate);
  let item = plate ? state.items.find((i) => normPlate(i.details?.ident?.targa) === plate) : null;
  if (!item && SECTIONS[r.kind]) {
    const cands = state.items.filter((i) => (itemType(i).groups || []).some((g) => g.ids.includes(r.kind)));
    if (cands.length === 1) item = cands[0];
  }
  const sid = item && SECTIONS[r.kind] && (itemType(item).groups || []).some((g) => g.ids.includes(r.kind)) ? r.kind : null;
  return { item, sid };
}

function inboxCard() {
  const list = state.inbox.filter((r) => r.status === 'new');
  if (!list.length) return '';
  const rows = list.slice(0, 5).map((r) => {
    const m = inboxMatch(r);
    const sub = [r.due_date ? fmtDate(r.due_date) : 'data da controllare', r.amount != null ? money(r.amount) : 'importo non indicato'].join(' · ');
    return `<div class="inb">
      <div class="inb-t">${esc(r.title || r.subject || 'Messaggio')}</div>
      <div class="inb-s">${esc(sub)}</div>
      <div class="inb-m">${m.item ? `Per: ${esc(m.item.name)}` : esc(r.sender || '')}${r.paid_hint ? ' · sembra un pagamento già fatto' : ''}</div>
      <div class="inb-a">
        ${r.link ? `<a class="chip" href="${esc(safeUrl(r.link))}" target="_blank" rel="noopener noreferrer">Apri la mail</a>` : ''}
        ${readOnly() ? '' : `<button class="chip" data-action="inbox-skip" data-id="${r.id}">Scarta</button>
        <button class="chip primary" data-action="${r.paid_hint ? 'inbox-paid' : 'inbox-add'}" data-id="${r.id}">${r.paid_hint ? 'Segna pagata' : 'Aggiungi'}</button>`}
      </div>
    </div>`;
  }).join('');
  return `<div class="group-title">Da confermare · ${list.length}</div><div class="card inbox">${rows}${list.length > 5 ? `<p class="hint">Altre ${list.length - 5} dopo queste.</p>` : ''}</div>`;
}

async function resolveInbox(id, status) {
  const r = byId(state.inbox, id); if (!r) return true;
  try { if (MODE === 'cloud') await store.update('inbox', id, { status }); state.inbox = state.inbox.filter((x) => x.id !== id); return true; }
  catch (e) { fail(e); return false; }
}

function acceptInbox(id) {
  const r = byId(state.inbox, id); if (!r) return;
  const m = inboxMatch(r);
  const note = [r.ref ? `Polizza/contratto n. ${r.ref}` : '', r.sender ? `Da: ${r.sender}` : ''].filter(Boolean).join(' · ');
  if (m.item && m.sid) {
    const S = SECTIONS[m.sid];
    const dF = S.fields.find((f) => f.dl === 'date'), aF = S.fields.find((f) => f.dl === 'amount');
    const prefill = { link: r.link || '' };
    if (dF && r.due_date) prefill[dF.k] = r.due_date;
    if (aF && r.amount != null) prefill[aF.k] = r.amount;
    openSection(m.item.id, m.sid, { prefill, inbox: id });
  } else {
    openDeadlineForm(null, m.item?.id || null, { inbox: id, pre: { item_id: m.item?.id, kind: r.kind, due_date: r.due_date || '', amount: r.amount ?? '', note, link: r.link || '' } });
  }
}

async function inboxPaid(id) {
  const r = byId(state.inbox, id); if (!r) return;
  const m = inboxMatch(r);
  const dl = m.item && state.deadlines.find((d) => d.item_id === m.item.id && !d.paid && (m.sid ? d.section === m.sid : d.kind === r.kind));
  if (dl) { await markPaid(dl.id); await resolveInbox(id, 'done'); render(); }
  else { toast('Non trovo la scadenza da chiudere: la scarto.'); await resolveInbox(id, 'dismissed'); render(); }
}

/* --- pagina: Home --- */
function pageHome() {
  if (!state.items.length) return { title: 'Scadenze', body: emptyStart(), fab: false };
  const today = todayISO();
  const open = state.deadlines.filter((d) => !d.paid);
  const late = open.filter((d) => d.due_date < today);
  const week = open.filter((d) => d.due_date >= today && diffDays(today, d.due_date) <= 7);
  const todo = [...late, ...week];
  const month = open.filter((d) => diffDays(today, d.due_date) > 7 && diffDays(today, d.due_date) <= 30);
  const later = open.filter((d) => diffDays(today, d.due_date) > 30);
  const next30 = open.filter((d) => diffDays(today, d.due_date) <= 30);
  const sum30 = next30.reduce((s, d) => s + (Number(d.amount) || 0), 0);
  const sumTodo = todo.reduce((s, d) => s + (Number(d.amount) || 0), 0);

  const hero = `
    <section class="hero">
      <div class="label">Da fare entro 7 giorni</div>
      <div class="big">${todo.length ? todo.length + (todo.length === 1 ? ' cosa' : ' cose') : 'Niente'}</div>
      <div class="sub">${todo.length ? (sumTodo ? eurFmt.format(sumTodo) + ' da pagare' : 'da controllare') : 'Puoi stare tranquillo questa settimana'}</div>
      ${late.length ? `<div class="alert">${ic('alert')}${late.length} ${late.length === 1 ? 'scaduta' : 'scadute'}</div>` : ''}
    </section>`;

  const cs = costSummary();
  const cats = CAT_ORDER.filter((c) => state.items.some((i) => i.category === c));
  const mini = `
    <div class="minis">${cats.map((c) => `
      <button class="mini" data-action="tab" data-tab="${c}">
        ${tile(CATS[c].icon, c)}
        <div class="ml">${CATS[c].label}</div>
        <div class="mv">${cs.byCat[c] ? eur0.format(cs.byCat[c]) : '—'}</div>
        <div class="ms">in 12 mesi</div>
      </button>`).join('')}</div>`;

  const group = (title, arr, cls = '') => arr.length
    ? `<div class="group-title ${cls}">${title}</div><div class="list">${arr.map((d) => rowDeadline(d)).join('')}</div>` : '';
  const todoBlock = todo.length
    ? `<div class="group-title ${late.length ? 'late' : ''}">Da fare questa settimana</div><div class="list">${todo.map((d) => rowDeadline(d)).join('')}</div>`
    : `<div class="card soft done-card">${ic('checkCircle')}<div><div class="t">Tutto fatto per questa settimana</div><div class="hint" style="margin:0">${next30.length ? `Prossima scadenza ${relative(open[0].due_date)}.` : 'Nessuna scadenza in arrivo.'}</div></div></div>`;
  const rest = open.length ? group('Entro 30 giorni', month) + group('Più avanti', later) : '';

  return { title: 'Scadenze', body: hero + shiftsTodayCard() + inboxCard() + todoBlock + mini + rest, fab: true };
}

/* --- pagina: sezione (Casa / Mezzi / Altro) --- */
function pageSection(cat) {
  const c = CATS[cat];
  const items = state.items.filter((i) => i.category === cat);
  if (!items.length) {
    return {
      title: c.label,
      body: `<div class="empty"><div class="big-ico">${ic(c.icon)}</div><h3>${cat === 'altro' ? 'Niente qui, per ora' : 'Ancora nulla'}</h3><p>${c.empty}</p>
        <div class="quick"><button class="btn" data-action="new-item" data-cat="${cat}">${ic('plus')}${c.add}</button></div></div>`,
    };
  }
  const sum = costSummary(inCat(cat));
  const cards = items.map((it) => {
    const own = state.deadlines.filter((d) => d.item_id === it.id && !d.paid);
    const next = own[0];
    const yearly = sum.byItem[it.id] || 0;
    const u = next ? urgency(next.due_date) : '';
    const meta = (itemType(it)?.label || '') + ' · ';
    return `
      <button class="row" data-action="open-item" data-id="${it.id}">
        ${tile(c.icon, cat)}
        <div class="main"><div class="t">${esc(it.name)}</div>
          <div class="s ${u}">${meta}${next ? `${esc(next.title)} ${relative(next.due_date)}` : 'Nessuna scadenza'}</div></div>
        <div class="right"><div class="amt">${yearly ? eur0.format(yearly) : ''}</div><div class="dt">${yearly ? 'in 12 mesi' : ''}</div></div>
        <span class="chev">${ic('next')}</span>
      </button>`;
  }).join('');
  const body = (sum.total ? heroCosts(`Spesa prevista, ${c.label.toLowerCase()}, 12 mesi`, sum.total) : '')
    + `<div class="group-title">${c.title}</div><div class="list">${cards}</div>
       <div class="actions"><button class="btn secondary" data-action="new-item" data-cat="${cat}">${ic('plus')}${c.add}</button></div>`
    + (sum.total ? barsCard(sum.months) : '');
  return { title: c.label, body };
}

/* --- pagina: dettaglio elemento --- */
const openDl = (itemId, sid) => state.deadlines.find((d) => d.item_id === itemId && d.section === sid && !d.paid);

function monthYear(iso) { const d = fromISO(iso); return `${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`; }

// Stato di una scheda: che cosa mostra il riquadro.
function sectionStatus(it, sid) {
  const S = SECTIONS[sid];
  const d = (it.details?.s || {})[sid];
  const dl = openDl(it.id, sid);
  if (S.gate && d && d[S.gate.k] === S.gate.off) return { cls: 'off', line: S.gate.offLabel || 'Non dovuto' };
  if (dl) {
    const u = urgency(dl.due_date);
    let rel = relative(dl.due_date);
    if (dl.until) rel += ` · ultima rata ${monthYear(dl.until)}`;
    return { cls: u || 'ok', line: fmtDate(dl.due_date), rel, amt: dl.amount != null ? money(dl.amount) : '' };
  }
  if (state.deadlines.some((x) => x.item_id === it.id && x.section === sid && x.paid)) return { cls: 'soon', line: 'Da aggiornare', rel: 'inserisci la nuova scadenza' };
  if (d && Object.keys(d).length) return { cls: 'info', line: 'Compilata', rel: 'senza scadenza' };
  return { cls: 'empty', line: 'Da inserire' };
}

function sectionCard(it, sid) {
  const S = SECTIONS[sid]; const st = sectionStatus(it, sid);
  return `
    <button class="scard s-${st.cls}" data-action="open-section" data-item="${it.id}" data-sec="${sid}">
      <div class="sc-top">${tile(S.icon, it.category)}<span class="dot"></span></div>
      <div class="sc-t">${esc(S.title)}</div>
      <div class="sc-s">${esc(st.line)}</div>
      ${st.rel ? `<div class="sc-r">${esc(st.rel)}</div>` : ''}
      ${st.amt ? `<div class="sc-a">${st.amt}</div>` : ''}
    </button>`;
}

function fieldDisplay(f, v) {
  if (f.t === 'date') return fmtDate(v);
  if (f.t === 'number') return `${Number(v).toLocaleString('it-IT')}${f.k === 'km' ? ' km' : ''}`;
  if (f.t === 'money') return money(v);
  if (f.t === 'select') return (f.opts.find((o) => o[0] === v) || [v, v])[1];
  return String(v);
}

function identityCard(it, t) {
  const ident = it.details?.ident || {};
  const fields = t.ident || [];
  if (!fields.length) return it.note ? `<p class="hint item-sub">${esc(t.label)} · ${esc(it.note)}</p>` : `<p class="hint item-sub">${esc(t.label)}</p>`;
  const plate = ident.targa ? `<span class="plate">${esc(ident.targa)}</span>` : '';
  const chips = fields.filter((f) => f.k !== 'targa' && ident[f.k] !== undefined && ident[f.k] !== '')
    .map((f) => `<span class="info-chip"><i>${esc(f.l)}</i>${esc(fieldDisplay(f, ident[f.k]))}</span>`).join('');
  return `
    <div class="idcard">
      <div class="id-top">${tile(t.icon, it.category)}
        <div class="id-main"><div class="id-type">${esc(t.label)}</div>${plate}</div>
        <button class="icon-btn" data-action="edit-ident" data-id="${it.id}" aria-label="Modifica i dati">${ic('pencil')}</button>
      </div>
      ${chips ? `<div class="chips-row">${chips}</div>` : `<button class="link" data-action="edit-ident" data-id="${it.id}">Aggiungi i dati${it.category === 'mezzi' ? ' (targa, date, chilometri)' : ''}</button>`}
      ${it.note ? `<p class="hint" style="margin:10px 0 0">${esc(it.note)}</p>` : ''}
    </div>`;
}

function logsCard(it, t) {
  const logs = state.logs.filter((l) => l.item_id === it.id).sort((a, b) => b.done_on.localeCompare(a.done_on));
  const total = logs.reduce((n, l) => n + (Number(l.amount) || 0), 0);
  const rows = logs.slice(0, 10).map((l) => `
    <div class="row" data-action="edit-log" data-id="${l.id}" role="button" tabindex="0">
      ${tile(l.kind === 'ricambio' ? 'part' : 'wrench', it.category)}
      <div class="main"><div class="t">${esc(l.title)}</div>
        <div class="s">${fmtDate(l.done_on)}${l.km ? ` · ${Number(l.km).toLocaleString('it-IT')} km` : ''}${l.place ? ` · ${esc(l.place)}` : ''}</div></div>
      <div class="right"><div class="amt">${money(l.amount)}</div></div>
    </div>`).join('');
  return `
    <div class="group-title">${esc(t.log.title)}${total ? ` · ${eur0.format(total)} spesi` : ''}</div>
    ${logs.length ? `<div class="list">${rows}</div>${logs.length > 10 ? `<p class="hint">Vedi gli ultimi 10 di ${logs.length}.</p>` : ''}`
      : `<div class="card soft"><p class="hint" style="margin:0">Qui tieni lo storico: che cosa è stato fatto, quando e quanto è costato.</p></div>`}
    <div class="actions"><button class="btn secondary" data-action="new-log" data-id="${it.id}">${ic('plus')}${esc(t.log.add)}</button></div>`;
}

function pageItem(it) {
  const t = itemType(it);
  const sum = costSummary(ofItem(it.id));
  const hidden = it.details?.hidden || [];
  const paid = state.deadlines.filter((d) => d.item_id === it.id && d.paid)
    .sort((a, b) => (b.paid_on || '').localeCompare(a.paid_on || '')).slice(0, 6);
  let body = identityCard(it, t) + (t.shifts ? shiftsBlock(it) : '') + (sum.total ? heroCosts('Spesa prevista nei prossimi 12 mesi', sum.total) : '');

  if (t.groups) {
    body += t.groups.map((g) => {
      const ids = g.ids.filter((id) => !hidden.includes(id));
      return ids.length ? `<div class="group-title">${esc(g.title)}</div><div class="scards">${ids.map((id) => sectionCard(it, id)).join('')}</div>` : '';
    }).join('');
    const nHidden = t.groups.flatMap((g) => g.ids).filter((id) => hidden.includes(id)).length;
    if (nHidden) body += `<div class="center"><button class="link" data-action="show-hidden" data-id="${it.id}">Voci nascoste (${nHidden})</button></div>`;
    const extra = state.deadlines.filter((d) => d.item_id === it.id && !d.paid && !d.section);
    if (extra.length) body += `<div class="group-title">Altre scadenze</div><div class="list">${extra.map((d) => rowDeadline(d, { hideItem: true })).join('')}</div>`;
  } else {
    const open = state.deadlines.filter((d) => d.item_id === it.id && !d.paid);
    body += `<div class="group-title">${t.shifts ? 'Scadenze di lavoro' : 'Da pagare'}</div>` + (open.length
      ? `<div class="list">${open.map((d) => rowDeadline(d, { hideItem: true })).join('')}</div>`
      : `<div class="card soft"><p class="hint" style="margin:0">Ancora nessuna scadenza.</p></div>`);
    body += `<div class="actions"><button class="btn" data-action="new-deadline" data-item="${it.id}">${ic('plus')}${esc(t.addLabel || 'Aggiungi una scadenza')}</button></div>`;
    if (sum.total) body += barsCard(sum.months);
  }
  if (t.log) body += logsCard(it, t);
  if (histRows(it.id).length) body += `<div class="actions"><button class="btn secondary" data-action="open-history" data-item="${it.id}">${ic('chart')}Storico dei pagamenti (${histRows(it.id).length})</button></div>`;
  if (paid.length) body += `<div class="group-title">Pagate di recente</div><div class="list">${paid.map((d) => rowDeadline(d, { hideItem: true })).join('')}</div>`;
  if (sum.missing && t.groups) body += `<p class="hint">${sum.missing} ${sum.missing === 1 ? 'scadenza non ha' : 'scadenze non hanno'} un importo e non ${sum.missing === 1 ? 'è inclusa' : 'sono incluse'} nei conteggi.</p>`;
  return { title: it.name, body, fab: !!t.groups, fabItem: it.id };
}

/* ---------- finestre dal basso (sheet) ---------- */
const sheetRoot = $('#sheet-root');
let sheetOpen = false;

function openSheet(title, body, opts = {}) {
  sheetRoot.innerHTML = `
    <div class="overlay ${opts.noAnim ? 'noanim' : ''}" data-action="close-sheet"></div>
    <div class="sheet ${opts.noAnim ? 'noanim' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="grab"></div>
      ${title ? `<div class="head"><h2>${esc(title)}</h2></div>` : ''}
      ${body}
    </div>`;
  document.body.style.overflow = 'hidden';
  sheetOpen = true;
  if (readOnly()) {
    sheetRoot.querySelectorAll('form').forEach((f) => {
      f.querySelectorAll('input:not([type=hidden]), select, textarea').forEach((e) => { e.disabled = true; });
      f.querySelectorAll('.actions button, .sugg, .paste, [data-action=pick-type], [data-action=pick-kind]').forEach((e) => e.remove());
      f.insertAdjacentHTML('afterbegin', `<div class="banner">${ic('info')}<span>Sola lettura: puoi guardare ma non modificare.</span></div>`);
    });
  }
  if (!opts.noSwipe) enableSwipe($('.sheet', sheetRoot));
}

function closeSheetNow() { sheetRoot.innerHTML = ''; document.body.style.overflow = ''; sheetOpen = false; }
function closeSheet() {
  seq = null;   // chiudere a mano interrompe il percorso guidato
  const sh = $('.sheet', sheetRoot), ov = $('.overlay', sheetRoot);
  if (!sh) { closeSheetNow(); return; }
  sh.style.transition = 'transform .2s ease-in'; sh.style.transform = 'translateY(100%)';
  if (ov) { ov.style.transition = 'opacity .2s'; ov.style.opacity = '0'; }
  setTimeout(closeSheetNow, 190);
}

// Trascina verso il basso per chiudere.
function enableSwipe(sheet) {
  let startY = 0, dy = 0, dragging = false, t0 = 0;
  sheet.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    const onHandle = !!e.target.closest('.grab,.head');
    if (sheet.scrollTop > 0 && !onHandle) return;
    startY = e.touches[0].clientY; dy = 0; dragging = true; t0 = Date.now();
    sheet.style.transition = 'none';
  }, { passive: true });
  sheet.addEventListener('touchmove', (e) => {
    if (!dragging) return;
    if (sheet.scrollTop > 0) { dragging = false; sheet.style.transform = ''; return; }
    dy = e.touches[0].clientY - startY;
    if (dy <= 0) { dy = 0; sheet.style.transform = ''; return; }
    if (e.cancelable) e.preventDefault();
    sheet.style.transform = `translateY(${dy}px)`;
    const ov = $('.overlay', sheetRoot); if (ov) ov.style.opacity = String(Math.max(0.2, 1 - dy / 500));
  }, { passive: false });
  const end = () => {
    if (!dragging) return;
    dragging = false;
    const v = dy / Math.max(1, Date.now() - t0);
    if (dy > 110 || (v > 0.6 && dy > 40)) {
      seq = null;
      sheet.style.transition = 'transform .18s ease-in'; sheet.style.transform = 'translateY(100%)';
      const ov = $('.overlay', sheetRoot); if (ov) { ov.style.transition = 'opacity .18s'; ov.style.opacity = '0'; }
      setTimeout(closeSheetNow, 170);
    } else {
      sheet.style.transition = 'transform .2s ease-out'; sheet.style.transform = '';
      const ov = $('.overlay', sheetRoot); if (ov) ov.style.opacity = '';
    }
  };
  sheet.addEventListener('touchend', end);
  sheet.addEventListener('touchcancel', end);
}

// Conferma nello stile dell'app (al posto di confirm del browser).
function confirmDialog({ title, text, ok = 'Conferma', cancel = 'Annulla', danger = false }) {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'dlg-wrap';
    el.innerHTML = `
      <div class="dlg-overlay"></div>
      <div class="dlg" role="alertdialog" aria-modal="true" aria-label="${esc(title)}">
        <h3>${esc(title)}</h3><p>${esc(text || '')}</p>
        <div class="dlg-actions">
          <button class="btn secondary" data-v="0">${esc(cancel)}</button>
          <button class="btn ${danger ? 'danger-solid' : ''}" data-v="1">${esc(ok)}</button>
        </div>
      </div>`;
    const done = (v) => { document.removeEventListener('keydown', onKey, true); el.classList.add('out'); setTimeout(() => el.remove(), 150); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); done(false); } };
    el.addEventListener('click', (e) => {
      if (e.target.classList.contains('dlg-overlay')) done(false);
      const b = e.target.closest('button[data-v]'); if (b) done(b.dataset.v === '1');
    });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(el);
  });
}

/* --- form scadenza --- */
function kindGrid(item, selected) {
  return kindsFor(item, selected).map((k) =>
    `<button type="button" class="kind ${k.id === selected ? 'sel' : ''}" data-action="pick-kind" data-kind="${k.id}">${ic(k.icon)}<span>${k.label}</span></button>`).join('');
}

function openDeadlineForm(id, presetItemId, opts = {}) {
  if (!state.items.length) { openItemForm(null, 'casa'); return; }
  const dl = id ? byId(state.deadlines, id) : null;
  const pre = opts.pre || {};
  const itemId = dl?.item_id || pre.item_id || presetItemId || state.items[0].id;
  const item = byId(state.items, itemId);
  const kind = dl?.kind || (pre.kind && kindsFor(item).some((x) => x.id === pre.kind) ? pre.kind : kindsFor(item)[0].id);
  const k = kindOf(kind);
  const lock = !!presetItemId || !!dl || state.items.length === 1;

  const itemField = lock
    ? `<input type="hidden" name="item_id" value="${itemId}">${state.items.length > 1 ? `<div class="for-item">${tile(CATS[item.category]?.icon, item.category)}<span>${esc(item.name)}</span></div>` : ''}`
    : `<label>Per quale?<select name="item_id">${state.items.map((i) => `<option value="${i.id}" ${i.id === itemId ? 'selected' : ''}>${esc(i.name)} (${CATS[i.category]?.label})</option>`).join('')}</select></label>`;
  const recOpts = Object.entries(REC).map(([v, r]) => `<option value="${v}" ${(dl?.recurrence || k.rec) === v ? 'selected' : ''}>${r.label}</option>`).join('');

  openSheet(dl ? 'Modifica scadenza' : 'Nuova scadenza', `
    <form id="dl-form" data-id="${dl?.id || ''}" ${opts.inbox ? `data-inbox="${opts.inbox}"` : ''}>
      ${itemField}
      <div class="flabel">Che cosa?</div>
      <div class="kinds" id="kind-grid">${kindGrid(item, kind)}</div>
      <input type="hidden" name="kind" value="${kind}">
      <div class="row2">
        <label>Scadenza<input type="date" name="due_date" required value="${dl?.due_date || pre.due_date || ''}"></label>
        <label>Importo (€)<input type="number" name="amount" step="0.01" min="0" inputmode="decimal" placeholder="se lo sai" value="${dl?.amount ?? pre.amount ?? ''}"></label>
      </div>
      <label>Si ripete<select name="recurrence">${recOpts}</select></label>
      <details class="more" ${pre.link || pre.note || dl?.link ? 'open' : ''}>
        <summary>Altre opzioni</summary>
        <label>Nome<input name="title" value="${esc(dl?.title || k.label)}" required></label>
        <label>Note<textarea name="note" rows="2" placeholder="Numero polizza, contratto…">${esc(dl?.note ?? pre.note ?? '')}</textarea></label>
        ${fieldHTML(LINK_FIELD, dl?.link ?? pre.link)}${linkBtn(dl?.link ?? pre.link)}
        ${dl ? '' : `
        <div class="paste">
          <div class="flabel">Compila da un'email</div>
          <textarea id="paste-text" rows="3" placeholder="Incolla qui il testo dell'email dell'assicurazione, della bolletta…"></textarea>
          <button type="button" class="btn secondary small" data-action="parse-paste">Compila i campi</button>
          <p class="hint">Cerco io data, importo e tipo. Controlla sempre prima di salvare.</p>
        </div>`}
      </details>
      <div class="actions">
        <button class="btn" type="submit">Salva</button>
        ${dl ? `<button type="button" class="btn secondary" data-action="${dl.paid ? 'reopen-form' : 'pay-form'}" data-id="${dl.id}">${dl.paid ? 'Segna come non pagata' : 'Segna come pagata'}</button>
        <button type="button" class="btn danger" data-action="delete-deadline" data-id="${dl.id}">${ic('trash')}Elimina</button>` : ''}
      </div>
    </form>`);
  const form = $('#dl-form');
  form.dataset.lastKindLabel = k.label;
  if (!dl) setTimeout(() => form.elements.due_date.focus({ preventScroll: true }), 60);
}

function applyKind(form, kindId) {
  const f = form.elements; const k = kindOf(kindId);
  f.kind.value = kindId;
  form.querySelectorAll('.kind').forEach((b) => b.classList.toggle('sel', b.dataset.kind === kindId));
  if (!form.dataset.id) f.recurrence.value = k.rec;
  if (!f.title.value || f.title.value === form.dataset.lastKindLabel) f.title.value = k.label;
  form.dataset.lastKindLabel = k.label;
}

function onDeadlineFormChange(e) {
  const form = e.target.closest('#dl-form');
  if (!form || e.target.name !== 'item_id') return;
  const item = byId(state.items, form.elements.item_id.value);
  const list = kindsFor(item);
  const cur = form.elements.kind.value;
  const keep = list.some((x) => x.id === cur) ? cur : list[0].id;
  $('#kind-grid').innerHTML = kindGrid(item, keep);
  applyKind(form, keep);
}

async function onDeadlineSubmit(form) {
  const f = form.elements; const id = form.dataset.id || null;
  const fields = {
    item_id: f.item_id.value, kind: f.kind.value, title: f.title.value.trim() || kindOf(f.kind.value).label,
    due_date: f.due_date.value, amount: f.amount.value === '' ? null : Number(f.amount.value),
    recurrence: f.recurrence.value, note: f.note.value.trim() || null,
    link: f.link.value.trim() ? safeUrl(f.link.value) : null,
  };
  if (f.link.value.trim() && !fields.link) { toast('Il link non è valido: deve iniziare con https://'); return; }
  if (!fields.due_date) { toast('Manca la data di scadenza'); return; }
  if (!id) fields.paid = false;
  const ok = await saveDeadline(id, fields);
  if (ok) { if (form.dataset.inbox) await resolveInbox(form.dataset.inbox, 'done'); closeSheetNow(); render(); toast(id ? 'Salvato' : 'Scadenza aggiunta'); }
}

/* --- incolla email --- */
const IT_MONTHS = { gennaio: 1, gen: 1, febbraio: 2, feb: 2, marzo: 3, mar: 3, aprile: 4, apr: 4, maggio: 5, mag: 5, giugno: 6, giu: 6, luglio: 7, lug: 7, agosto: 8, ago: 8, settembre: 9, set: 9, sett: 9, ottobre: 10, ott: 10, novembre: 11, nov: 11, dicembre: 12, dic: 12 };
const KIND_HINTS = [
  ['bollo', /\bbollo\b|tassa automobilistica/i],
  ['revisione', /revisione/i],
  ['tagliando', /tagliando/i],
  ['assicurazione', /polizza|assicurazion|\brca\b|premio/i],
  ['luce', /energia elettrica|\bluce\b|\benel\b|plenitude|\bedison\b|\bsorgenia\b/i],
  ['gas', /\bgas\b|\bmetano\b/i],
  ['acqua', /\bacqua\b|servizio idrico|\biren\b|\bacquedotto\b/i],
  ['internet', /fibra|internet|\badsl\b|\bwi-?fi\b|\btim\b|\bvodafone\b|\bfastweb\b|\bwind\s?tre\b|\biliad\b/i],
  ['rifiuti', /\btari\b|rifiuti/i],
  ['imu', /\bimu\b/i],
  ['affitto', /canone di locazione|\baffitto\b/i],
];

function parseEmailText(raw) {
  const text = raw.replace(/\s+/g, ' ');
  const res = {};
  for (const [kind, rx] of KIND_HINTS) if (rx.test(text)) { res.kind = kind; break; }
  const dates = [];
  let m;
  const rxNum = /(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/g;
  while ((m = rxNum.exec(text))) {
    let y = +m[3]; if (y < 100) y += 2000;
    if (+m[2] >= 1 && +m[2] <= 12 && +m[1] >= 1 && +m[1] <= 31) dates.push({ iso: `${y}-${pad(+m[2])}-${pad(+m[1])}`, idx: m.index });
  }
  const rxWord = /(\d{1,2})\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre|gen|feb|mar|apr|mag|giu|lug|ago|sett?|ott|nov|dic)\.?\s+(\d{4})/gi;
  while ((m = rxWord.exec(text))) dates.push({ iso: `${m[3]}-${pad(IT_MONTHS[m[2].toLowerCase()])}-${pad(+m[1])}`, idx: m.index });
  const today = todayISO();
  const keyDate = dates.find((d) => /scadenz|scade|entro il|entro:|termine|pagare entro|validit[àa] fino/i.test(text.slice(Math.max(0, d.idx - 45), d.idx)));
  const future = dates.filter((d) => d.iso >= today).sort((a, b) => a.iso.localeCompare(b.iso));
  const pick = keyDate || future[0] || dates[0];
  if (pick) res.due_date = pick.iso;
  const amts = [];
  const rxAmt = /(?:€|eur(?:o)?\.?)\s*(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:,\d{1,2})?)|(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})\s*(?:€|eur(?:o)?\b)/gi;
  while ((m = rxAmt.exec(text))) {
    const n = parseFloat((m[1] || m[2]).replace(/\./g, '').replace(',', '.'));
    if (!isNaN(n)) amts.push({ n, idx: m.index });
  }
  const keyAmt = amts.find((a) => /totale|premio|importo|da pagare|rata|netto|canone/i.test(text.slice(Math.max(0, a.idx - 40), a.idx)));
  const bigAmt = amts.sort((a, b) => b.n - a.n)[0];
  const ap = keyAmt || bigAmt;
  if (ap) res.amount = ap.n;
  return res;
}

function applyPaste(form) {
  const text = $('#paste-text').value;
  if (!text.trim()) { toast("Incolla prima il testo dell'email"); return; }
  const r = parseEmailText(text);
  const f = form.elements; const found = [];
  if (r.kind) {
    const item = byId(state.items, f.item_id.value);
    if (!kindsFor(item).some((x) => x.id === r.kind)) { $('#kind-grid').innerHTML = kindGrid(item, r.kind); }
    form.dataset.lastKindLabel = ''; f.title.value = '';
    applyKind(form, r.kind); found.push(kindOf(r.kind).label);
  }
  if (r.due_date) { f.due_date.value = r.due_date; found.push('scadenza ' + fmtDate(r.due_date)); }
  if (r.amount != null) { f.amount.value = r.amount; found.push(money(r.amount)); }
  toast(found.length ? 'Ho trovato: ' + found.join(', ') + '. Controlla i dati.' : 'Non ho trovato date o importi: compila a mano.');
  if (found.length) { const d = $('details.more'); if (d) d.open = false; }
}

/* --- campi generici (da schede.js) --- */
function fieldHTML(f, val) {
  const v = val ?? '';
  const hint = f.hint ? `<span class="fh">${esc(f.hint)}</span>` : '';
  let input;
  if (f.t === 'select') {
    input = `<select name="${f.k}">${f.def === undefined && v === '' ? '<option value="">—</option>' : ''}${f.opts.map(([o, l]) => `<option value="${o}" ${String(v) === o ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  } else if (f.t === 'date') input = `<input type="date" name="${f.k}" value="${esc(v)}">`;
  else if (f.t === 'money') input = `<input type="number" name="${f.k}" step="0.01" min="0" inputmode="decimal" placeholder="se lo sai" value="${esc(v)}">`;
  else if (f.t === 'number') input = `<input type="number" name="${f.k}" step="1" min="0" inputmode="numeric" value="${esc(v)}">`;
  else input = `<input name="${f.k}" value="${esc(v)}" placeholder="${esc(f.ph || '')}" autocomplete="off" ${f.upper ? 'autocapitalize="characters" style="text-transform:uppercase"' : ''}>`;
  return `<label>${esc(f.l)}${input}${hint}</label>`;
}
function fieldsHTML(fields, values = {}) {
  let out = '', i = 0;
  while (i < fields.length) {
    const f = fields[i], g = fields[i + 1];
    if (f.half && g?.half) { out += `<div class="row2">${fieldHTML(f, values[f.k])}${fieldHTML(g, values[g.k])}</div>`; i += 2; }
    else { out += fieldHTML(f, values[f.k]); i++; }
  }
  return out;
}
function readFields(form, fields) {
  const v = {};
  for (const f of fields) {
    const el = form.elements[f.k]; if (!el) continue;
    let x = String(el.value).trim();
    if (f.upper) x = x.toUpperCase();
    if (x === '') continue;
    v[f.k] = (f.t === 'money' || f.t === 'number') ? Number(x) : x;
  }
  return v;
}

/* --- form elemento (casa / mezzo / altro): scelta del tipo, nome e pochi dati --- */
const TYPE_Q = { mezzi: 'Che mezzo è?', casa: "Com'è la casa?", altro: 'Che cosa vuoi tenere sotto controllo?' };
const typeTiles = (types, sel) => types.map((t) =>
  `<button type="button" class="kind ${t.id === sel ? 'sel' : ''}" data-action="pick-type" data-type="${t.id}">${ic(t.icon)}<span>${esc(t.label)}</span></button>`).join('');

function itemFieldsHTML(t, cur = {}) {
  const createFields = (t.ident || []).filter((f) => (t.create || []).includes(f.k));
  return `
    <label>${esc(t.nameLabel || 'Nome')}<input name="name" required value="${esc(cur.name ?? t.defName ?? '')}" placeholder="${esc(t.ph || '')}" autocomplete="off"></label>
    ${!cur.exists && t.sugg?.length ? `<div class="sugg">${t.sugg.map((x) => `<button type="button" class="chip" data-action="sugg" data-v="${esc(x)}">${esc(x)}</button>`).join('')}</div>` : ''}
    ${fieldsHTML(createFields, cur.ident || {})}`;
}

function openItemForm(id, cat) {
  const it = id ? byId(state.items, id) : null;
  const category = it?.category || cat || 'casa';
  const types = TYPES[category];
  const cur = it ? itemType(it) : types[0];
  openSheet(it ? 'Modifica' : CATS[category].add, `
    <form id="item-form" data-id="${it?.id || ''}" data-cat="${category}" data-type="${cur.id}">
      ${types.length > 1 ? `<div class="flabel">${TYPE_Q[category]}</div><div class="kinds ${types.length > 4 ? 'kinds-many' : 'kinds-2'}" id="type-grid">${typeTiles(types, cur.id)}</div>` : ''}
      <div id="item-fields">${itemFieldsHTML(cur, { name: it?.name, ident: it?.details?.ident, exists: !!it })}</div>
      <div class="actions"><button class="btn" type="submit">${it ? 'Salva' : 'Continua'}</button></div>
    </form>`);
  if (!it) setTimeout(() => { const n = $('#item-form')?.elements.name; if (n && !n.value) n.focus({ preventScroll: true }); }, 60);
}

function setItemType(form, typeId) {
  const types = TYPES[form.dataset.cat];
  const prev = types.find((x) => x.id === form.dataset.type), t = types.find((x) => x.id === typeId);
  if (!t || t === prev) return;
  const name = form.elements.name.value.trim();
  const keep = name && name !== (prev?.defName || '');
  const identAll = readFields(form, [...(prev?.ident || []), ...(t.ident || [])]);
  form.dataset.type = t.id;
  form.querySelectorAll('#type-grid .kind').forEach((b) => b.classList.toggle('sel', b.dataset.type === t.id));
  $('#item-fields').innerHTML = itemFieldsHTML(t, { name: keep ? name : undefined, ident: identAll, exists: !!form.dataset.id });
}

async function onItemSubmit(form) {
  const f = form.elements; const id = form.dataset.id || null; const category = form.dataset.cat;
  const t = TYPES[category].find((x) => x.id === form.dataset.type) || TYPES[category][0];
  const existing = id ? byId(state.items, id) : null;
  const createFields = (t.ident || []).filter((x) => (t.create || []).includes(x.k));
  const vals = readFields(form, createFields);
  const ident = { ...(existing?.details?.ident || {}) };
  createFields.forEach((x) => { if (vals[x.k] !== undefined) ident[x.k] = vals[x.k]; else delete ident[x.k]; });
  const fields = { name: f.name.value.trim(), subtype: t.id, details: { ...(existing?.details || {}), ident } };
  if (!id) fields.category = category;
  const r = await saveItem(id, fields);
  if (!r) return;
  closeSheetNow();
  if (!id) {
    state.tab = r.category; state.itemId = r.id; state.anim = 'push'; render(); window.scrollTo(0, 0);
    startSequence(r.id);
  } else { render(); toast('Salvato'); }
}

/* --- dati dell'elemento (targa, date di acquisto, indirizzo…) --- */
function openIdentity(itemId, opts = {}) {
  const it = byId(state.items, itemId); if (!it) return;
  const t = itemType(it);
  const fields = (t.ident || []).filter((f) => !(opts.seq && (t.create || []).includes(f.k)));
  const title = it.category === 'mezzi' ? 'Dati del mezzo' : it.category === 'casa' ? 'Dati della casa' : 'Dati';
  openSheet(title, `
    <form id="ident-form" data-item="${it.id}" ${opts.seq ? 'data-seq="1"' : ''}>
      ${opts.seq ? `<p class="hint step">Passo 1 di ${opts.seq.ids.length}</p>` : `<label>Nome<input name="__name" required value="${esc(it.name)}" autocomplete="off"></label>`}
      ${fieldsHTML(fields, it.details?.ident || {})}
      ${opts.seq ? '' : `<label>Note<textarea name="__note" rows="2" placeholder="Qualsiasi cosa utile">${esc(it.note || '')}</textarea></label>`}
      <div class="actions">
        <button class="btn" type="submit">${opts.seq ? 'Salva e continua' : 'Salva'}</button>
        ${opts.seq ? '<button type="button" class="btn secondary" data-action="seq-skip">Salta</button>' : ''}
      </div>
    </form>`, { noAnim: !!opts.noAnim });
}

async function onIdentSubmit(form) {
  const it = byId(state.items, form.dataset.item); if (!it) return false;
  const t = itemType(it);
  const seqMode = !!form.dataset.seq;
  const fields = (t.ident || []).filter((f) => !(seqMode && (t.create || []).includes(f.k)));
  const vals = readFields(form, fields);
  const ident = { ...(it.details?.ident || {}) };
  fields.forEach((f) => { if (vals[f.k] !== undefined) ident[f.k] = vals[f.k]; else delete ident[f.k]; });
  const patch = { details: { ...(it.details || {}), ident } };
  if (!seqMode) { patch.name = form.elements.__name.value.trim() || it.name; patch.note = form.elements.__note.value.trim() || null; }
  return !!(await saveItem(it.id, patch));
}

/* --- storico dei pagamenti (le scadenze pagate non si cancellano mai) --- */
const histRows = (itemId, sid) => state.deadlines
  .filter((d) => d.item_id === itemId && d.paid && (!sid || d.section === sid))
  .sort((a, b) => a.due_date.localeCompare(b.due_date));

function histChart(rows) {
  const pts = rows.filter((r) => r.amount != null && Number(r.amount) > 0).slice(-10);
  if (pts.length < 2) return '';
  const first = pts[0].due_date, last = pts[pts.length - 1].due_date;
  const yearly = (monthsBetween(first, last) / (pts.length - 1)) >= 6;
  const labelOf = (d) => { const x = fromISO(d); return yearly ? String(x.getFullYear()) : `${MONTHS_SHORT[x.getMonth()]} ${String(x.getFullYear()).slice(2)}`; };
  const W = 320, H = 168, padT = 22, padB = 24, padX = 10;
  const max = Math.max(...pts.map((r) => Number(r.amount)));
  const bw = Math.min(40, (W - padX * 2) / pts.length - 8);
  const step = (W - padX * 2) / pts.length;
  const bars = pts.map((r, i) => {
    const v = Number(r.amount), h = Math.max(3, (v / max) * (H - padT - padB));
    const x = padX + step * i + (step - bw) / 2, y = H - padB - h;
    const lbl = v >= 1000 ? (v / 1000).toFixed(1).replace('.', ',') + 'k' : String(Math.round(v));
    return `<g><rect class="hc-bar ${i === pts.length - 1 ? 'last' : ''}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="5"/>
      <text class="hc-v" x="${(x + bw / 2).toFixed(1)}" y="${(y - 6).toFixed(1)}" text-anchor="middle">${lbl}</text>
      <text class="hc-x" x="${(x + bw / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle">${esc(labelOf(r.due_date))}</text></g>`;
  }).join('');
  return `<svg class="hchart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Andamento dei pagamenti">
    <line class="hc-base" x1="${padX}" x2="${W - padX}" y1="${H - padB}" y2="${H - padB}"/>${bars}</svg>`;
}

function histStats(rows) {
  const pts = rows.filter((r) => r.amount != null && Number(r.amount) > 0);
  if (!pts.length) return '';
  const last = Number(pts[pts.length - 1].amount);
  const total = pts.reduce((n, r) => n + Number(r.amount), 0);
  let delta = '';
  if (pts.length > 1) {
    const prev = Number(pts[pts.length - 2].amount); const pc = Math.round(((last - prev) / prev) * 100);
    delta = pc === 0 ? 'Uguale al precedente' : `<span class="${pc > 0 ? 'up' : 'down'}">${pc > 0 ? '+' : ''}${pc}%</span> rispetto al precedente`;
  }
  return `<div class="hstats">
    <div><i>Ultimo</i><b>${money(last)}</b></div>
    <div><i>Media</i><b>${money(total / pts.length)}</b></div>
    <div><i>Totale</i><b>${money(total)}</b></div>
  </div>${delta ? `<p class="hint hdelta">${delta}</p>` : ''}`;
}

function openHistory(itemId, sid) {
  const it = byId(state.items, itemId); if (!it) return;
  const S = sid ? SECTIONS[sid] : null;
  const rows = histRows(itemId, sid);
  const t = itemType(it);
  const title = S ? `Storico · ${S.title}` : 'Storico dei pagamenti';
  const list = [...rows].reverse().map((d) => `
    <div class="row" data-action="edit-history" data-id="${d.id}" role="button" tabindex="0">
      ${tile((SECTIONS[d.section]?.icon) || kindOf(d.kind).icon, it.category)}
      <div class="main"><div class="t">${esc(sid ? fmtDate(d.due_date) : d.title)}</div>
        <div class="s">${sid ? '' : fmtDate(d.due_date) + ' · '}${d.paid_on ? 'pagata il ' + fmtDate(d.paid_on) : 'pagata'}${d.link ? ' · con documento' : ''}</div></div>
      <div class="right"><div class="amt">${money(d.amount) || '—'}</div></div>
    </div>`).join('');
  openSheet(title, `
    ${rows.length ? `<div class="card">${histChart(rows) || '<p class="hint" style="margin:0">Il grafico compare con almeno due pagamenti con importo.</p>'}${histStats(rows)}</div>` : ''}
    ${rows.length ? `<div class="group-title">Tutti i pagamenti</div><div class="list">${list}</div>`
      : `<div class="card soft"><p class="hint" style="margin:0">Qui compaiono i pagamenti già fatti. Quando premi ✓ su una scadenza finisce qui da sola.${S ? ' Puoi anche aggiungere quelli passati.' : ''}</p></div>`}
    ${S && !readOnly() ? `<div class="actions"><button class="btn" data-action="new-history" data-item="${itemId}" data-sec="${sid}">${ic('plus')}Aggiungi un pagamento passato</button></div>` : ''}
    <p class="hint">${esc(t.label || '')}</p>`);
}

function openHistoryEntry(itemId, sid, id) {
  const it = byId(state.items, itemId); if (!it) return;
  const S = sid ? SECTIONS[sid] : null;
  const d = id ? byId(state.deadlines, id) : null;
  openSheet(d ? 'Modifica pagamento' : 'Pagamento passato', `
    <form id="hist-form" data-item="${itemId}" data-sec="${sid || ''}" data-id="${d?.id || ''}">
      <div class="row2">
        <label>Scadenza<input type="date" name="due" required value="${d?.due_date || ''}"></label>
        <label>Pagata il<input type="date" name="paid" value="${d?.paid_on || ''}"></label>
      </div>
      <label>Importo (€)<input type="number" name="amount" step="0.01" min="0" inputmode="decimal" placeholder="se lo sai" value="${d?.amount ?? ''}"></label>
      ${fieldHTML(LINK_FIELD, d?.link)}${linkBtn(d?.link)}
      <div class="actions"><button class="btn" type="submit">Salva</button>
        ${d ? `<button type="button" class="btn danger" data-action="delete-history" data-id="${d.id}">${ic('trash')}Elimina</button>` : ''}</div>
    </form>`);
}

async function onHistorySubmit(form) {
  const f = form.elements; const itemId = form.dataset.item; const sid = form.dataset.sec || null; const id = form.dataset.id || null;
  const link = f.link.value.trim() ? safeUrl(f.link.value) : null;
  if (f.link.value.trim() && !link) { toast('Il link non è valido: deve iniziare con https://'); return; }
  const base = { due_date: f.due.value, paid_on: f.paid.value || f.due.value, amount: f.amount.value === '' ? null : Number(f.amount.value), link };
  const S = sid ? SECTIONS[sid] : null;
  const fields = id ? base : { ...base, item_id: itemId, section: sid, kind: S?.kind || 'altro', title: S?.title || 'Pagamento', recurrence: 'none', paid: true, note: null, until: null };
  if (!(await saveDeadline(id, fields))) return;
  openHistory(itemId, sid); render(); toast('Salvato');
}

/* --- schede (assicurazione, bollo, revisione, bollette…) --- */
const secTouched = {};
function monthsBetween(a, b) { const x = fromISO(a), y = fromISO(b); return (y.getFullYear() - x.getFullYear()) * 12 + (y.getMonth() - x.getMonth()); }

function sectionValues(it, sid) {
  const S = SECTIONS[sid];
  const saved = { ...((it.details?.s || {})[sid] || {}) };
  const dl = openDl(it.id, sid);
  if (dl) {
    for (const f of S.fields) {
      if (f.dl === 'date') saved[f.k] = dl.due_date;
      if (f.dl === 'amount') saved[f.k] = dl.amount ?? '';
      if (f.dl === 'rec') saved[f.k] = dl.recurrence;
    }
    if (S.untilFrom && dl.until) saved[S.untilFrom] = monthsBetween(dl.due_date, dl.until) + 1;   // rate che restano davvero
  }
  for (const f of S.fields) if (saved[f.k] === undefined && f.def !== undefined) saved[f.k] = f.def;
  return saved;
}

function openSection(itemId, sid, opts = {}) {
  const it = byId(state.items, itemId); const S = SECTIONS[sid];
  if (!it || !S) return;
  const saved = sectionValues(it, sid);
  if (opts.prefill) Object.assign(saved, opts.prefill);
  const ident = it.details?.ident || {};
  Object.keys(secTouched).forEach((k) => delete secTouched[k]);
  for (const f of S.fields) if (f.auto) {
    secTouched[f.k] = saved[f.k] !== undefined && saved[f.k] !== '';
    if (!secTouched[f.k]) { const a = SCHEDE.computeAuto(f, saved, ident, todayISO()); if (a) saved[f.k] = a; }
  }
  const gateField = S.gate ? S.fields.find((f) => f.k === S.gate.k) : null;
  const rest = S.fields.filter((f) => f !== gateField);
  const gateOff = !!(S.gate && saved[S.gate.k] === S.gate.off);
  const hasData = !!openDl(it.id, sid) || Object.keys((it.details?.s || {})[sid] || {}).length > 0;
  const last = opts.seq && opts.seq.i === opts.seq.ids.length - 1;
  openSheet(S.title, `
    <form id="sec-form" data-item="${it.id}" data-sec="${sid}" ${opts.inbox ? `data-inbox="${opts.inbox}"` : ''}>
      ${opts.seq ? `<p class="hint step">Passo ${opts.seq.i + 1} di ${opts.seq.ids.length}</p>` : ''}
      ${S.intro ? `<div class="intro">${ic('info')}<span>${esc(S.intro)}</span></div>` : ''}
      ${gateField ? fieldHTML(gateField, saved[gateField.k]) : ''}
      <div id="gated" ${gateOff ? 'hidden' : ''}>${fieldsHTML(rest, saved)}${fieldHTML(LINK_FIELD, saved.link)}${linkBtn(saved.link)}</div>
      <div class="actions">
        <button class="btn" type="submit">${opts.seq ? (last ? 'Salva e finisci' : 'Salva e continua') : 'Salva'}</button>
        ${opts.seq ? '<button type="button" class="btn secondary" data-action="seq-skip">Salta</button>'
          : `<button type="button" class="btn secondary" data-action="open-history" data-item="${it.id}" data-sec="${sid}">${ic('history')}Storico${histRows(it.id, sid).length ? ` (${histRows(it.id, sid).length})` : ''}</button>
             <button type="button" class="btn danger" data-action="hide-section" data-item="${it.id}" data-sec="${sid}">${ic('trash')}${hasData ? 'Cancella e nascondi' : 'Non mi serve, nascondi'}</button>`}
      </div>
    </form>`, { noAnim: !!opts.noAnim });
}

// Quando si cambia un campo, ricalcolo quelli "calcolati" (a meno che la persona non li abbia già modificati a mano).
function onSecFormInput(e) {
  const form = e.target.closest?.('#sec-form'); if (!form) return;
  const it = byId(state.items, form.dataset.item); const S = SECTIONS[form.dataset.sec];
  if (!it || !S) return;
  const name = e.target.name;
  if (S.gate && name === S.gate.k) { $('#gated').hidden = e.target.value === S.gate.off; return; }
  const f = S.fields.find((x) => x.k === name);
  if (f?.auto && e.type === 'input') { secTouched[f.k] = true; return; }
  const vals = readFields(form, S.fields);
  for (const g of S.fields) if (g.auto && !secTouched[g.k]) {
    const a = SCHEDE.computeAuto(g, vals, it.details?.ident || {}, todayISO());
    if (a && form.elements[g.k]) form.elements[g.k].value = a;
  }
}

async function onSectionSubmit(form) {
  const it = byId(state.items, form.dataset.item); const sid = form.dataset.sec; const S = SECTIONS[sid];
  if (!it || !S) return false;
  const vals = readFields(form, [...S.fields, LINK_FIELD]);
  if (vals.link) { vals.link = safeUrl(vals.link); if (!vals.link) { toast('Il link non è valido: deve iniziare con https://'); return false; } }
  const gateOff = !!(S.gate && vals[S.gate.k] === S.gate.off);
  const dF = S.fields.find((f) => f.dl === 'date'), aF = S.fields.find((f) => f.dl === 'amount'), rF = S.fields.find((f) => f.dl === 'rec');
  const date = !gateOff && dF ? vals[dF.k] : null;
  const amount = !gateOff && aF && vals[aF.k] !== undefined ? vals[aF.k] : null;
  const rec = (rF && vals[rF.k]) || S.rec;
  const residue = S.untilFrom ? vals[S.untilFrom] : undefined;
  const finished = residue === 0;
  const until = S.untilFrom && date ? SCHEDE.untilFor(date, residue) : null;

  const details = { ...(it.details || {}), s: { ...(it.details?.s || {}), [sid]: vals } };
  if (details.hidden) details.hidden = details.hidden.filter((x) => x !== sid);
  if (!(await saveItem(it.id, { details }))) return false;

  const open = openDl(it.id, sid);
  if (open && date && !finished && date > open.due_date) {
    const paid = await confirmDialog({
      title: 'La scadenza precedente è stata pagata?',
      text: `Quella del ${fmtDate(open.due_date)}${open.amount != null ? ` (${money(open.amount)})` : ''}. Se sì, la conservo nello storico così non va persa.`,
      ok: 'Sì, salvala nello storico', cancel: 'No, correggo solo',
    });
    if (paid) {
      await saveDeadline(null, { item_id: it.id, section: sid, kind: S.kind, title: S.title, due_date: open.due_date, amount: open.amount ?? null,
        recurrence: 'none', paid: true, paid_on: todayISO(), note: null, until: null, link: open.link || null });
    }
  }
  if (!date || finished) { if (open && !(await deleteDeadline(open.id))) return false; }
  else {
    const fields = { item_id: it.id, section: sid, kind: S.kind, title: S.title, due_date: date, amount, recurrence: rec, until, note: null };
    if (!(await saveDeadline(open ? open.id : null, open ? fields : { ...fields, paid: false }))) return false;
  }
  return true;
}

async function hideSection(itemId, sid) {
  const it = byId(state.items, itemId); const S = SECTIONS[sid]; if (!it || !S) return;
  const hasData = !!openDl(itemId, sid) || Object.keys((it.details?.s || {})[sid] || {}).length > 0;
  if (hasData && !(await confirmDialog({ title: `Nascondere “${S.title}”?`, text: 'Il promemoria e i dati inseriti per questa voce verranno cancellati.', ok: 'Nascondi', danger: true }))) return;
  const open = openDl(itemId, sid);
  if (open && !(await deleteDeadline(open.id))) return;
  const s = { ...(it.details?.s || {}) }; delete s[sid];
  const hidden = [...new Set([...(it.details?.hidden || []), sid])];
  if (await saveItem(itemId, { details: { ...(it.details || {}), s, hidden } })) { closeSheetNow(); render(); toast('Voce nascosta. La ritrovi in “Voci nascoste”'); }
}

function openHidden(itemId) {
  const it = byId(state.items, itemId); if (!it) return;
  const hidden = it.details?.hidden || [];
  if (!hidden.length) { closeSheetNow(); render(); return; }
  openSheet('Voci nascoste', `
    <div class="list">${hidden.filter((id) => SECTIONS[id]).map((id) => `
      <button class="row" data-action="unhide-section" data-item="${itemId}" data-sec="${id}">
        ${tile(SECTIONS[id].icon, it.category)}<div class="main"><div class="t">${esc(SECTIONS[id].title)}</div><div class="s">Tocca per mostrarla di nuovo</div></div>
        <span class="chev">${ic('plus')}</span>
      </button>`).join('')}</div>`);
}

/* --- percorso guidato dopo la creazione: una voce alla volta, si può saltare --- */
let seq = null;
function startSequence(itemId) {
  const it = byId(state.items, itemId); if (!it) return;
  const t = itemType(it);
  const ids = [...(t.seqIdent ? ['__ident'] : []), ...(t.core || [])];
  if (!ids.length) return;
  seq = { itemId, ids, i: 0 };
  runSeqStep(false);
}
function runSeqStep(instant) {
  if (!seq) return;
  if (seq.i >= seq.ids.length) { seq = null; closeSheetNow(); render(); toast('Fatto. Le altre voci le trovi nella scheda'); return; }
  const id = seq.ids[seq.i];
  if (instant) { closeSheetNow(); render(); }
  if (id === '__ident') openIdentity(seq.itemId, { seq, noAnim: instant });
  else openSection(seq.itemId, id, { seq, noAnim: instant });
}
function advanceSeq() { if (!seq) return; seq.i++; runSeqStep(true); }

/* --- lavori e ricambi --- */
function openLogForm(itemId, logId) {
  const it = byId(state.items, itemId); if (!it) return;
  const t = itemType(it); if (!t.log) return;
  const lg = logId ? byId(state.logs, logId) : null;
  const vehicle = !!t.log.hasKm;
  const kind = lg?.kind || 'lavoro';
  openSheet(lg ? 'Modifica' : t.log.add, `
    <form id="log-form" data-item="${it.id}" data-id="${lg?.id || ''}">
      ${vehicle ? `<div class="seg two">
        <input type="radio" name="kind" id="lk-l" value="lavoro" ${kind === 'lavoro' ? 'checked' : ''}><label for="lk-l">Lavoro fatto</label>
        <input type="radio" name="kind" id="lk-r" value="ricambio" ${kind === 'ricambio' ? 'checked' : ''}><label for="lk-r">Pezzo sostituito</label>
      </div>` : ''}
      <label>Che cosa?<input name="title" required value="${esc(lg?.title || '')}" placeholder="es. ${esc(t.log.sugg[0])}" autocomplete="off"></label>
      ${lg ? '' : `<div class="sugg">${t.log.sugg.map((x) => `<button type="button" class="chip" data-action="log-sugg" data-v="${esc(x)}">${esc(x)}</button>`).join('')}</div>`}
      <div class="row2">
        <label>Data<input type="date" name="done_on" required value="${lg?.done_on || todayISO()}"></label>
        ${vehicle ? `<label>Chilometri<input type="number" name="km" min="0" step="1" inputmode="numeric" value="${lg?.km ?? ''}" placeholder="facoltativo"></label>`
          : `<label>Costo (€)<input type="number" name="amount" min="0" step="0.01" inputmode="decimal" value="${lg?.amount ?? ''}" placeholder="se lo sai"></label>`}
      </div>
      <div class="row2">
        ${vehicle ? `<label>Costo (€)<input type="number" name="amount" min="0" step="0.01" inputmode="decimal" value="${lg?.amount ?? ''}" placeholder="se lo sai"></label>` : ''}
        <label>${vehicle ? 'Officina' : 'Ditta o persona'}<input name="place" value="${esc(lg?.place || '')}" autocomplete="off"></label>
      </div>
      <label>Note<textarea name="note" rows="2">${esc(lg?.note || '')}</textarea></label>
      ${fieldHTML(LINK_FIELD, lg?.link)}${linkBtn(lg?.link)}
      <div class="actions">
        <button class="btn" type="submit">Salva</button>
        ${lg ? `<button type="button" class="btn danger" data-action="delete-log" data-id="${lg.id}">${ic('trash')}Elimina</button>` : ''}
      </div>
    </form>`);
  if (!lg) setTimeout(() => $('#log-form')?.elements.title.focus({ preventScroll: true }), 60);
}

async function onLogSubmit(form) {
  const f = form.elements; const it = byId(state.items, form.dataset.item); const id = form.dataset.id || null;
  const km = f.km && f.km.value !== '' ? Math.round(Number(f.km.value)) : null;
  const fields = {
    item_id: it.id, kind: f.kind ? f.kind.value : 'lavoro', title: f.title.value.trim(), done_on: f.done_on.value,
    km, amount: f.amount.value === '' ? null : Number(f.amount.value), place: f.place.value.trim() || null, note: f.note.value.trim() || null,
    link: f.link.value.trim() ? safeUrl(f.link.value) : null,
  };
  if (f.link.value.trim() && !fields.link) { toast('Il link non è valido: deve iniziare con https://'); return; }
  if (!(await saveLog(id, fields))) return;
  // i chilometri attuali del mezzo seguono l'ultimo lavoro registrato
  if (km && km > (it.details?.ident?.km || 0)) await saveItem(it.id, { details: { ...(it.details || {}), ident: { ...(it.details?.ident || {}), km } } });
  closeSheetNow(); render(); toast(id ? 'Salvato' : 'Aggiunto');
}

function openItemMenu(id) {
  const it = byId(state.items, id);
  if (!it) return;
  const t = itemType(it);
  openSheet(it.name, `
    <div class="menu">
      <button data-action="edit-item" data-id="${id}">${ic('pencil')}<span>Cambia nome o tipo</span></button>
      ${t.ident?.length ? `<button data-action="edit-ident" data-id="${id}">${ic('file')}<span>Modifica i dati${it.category === 'mezzi' ? ' (targa, date…)' : ''}</span></button>` : ''}
      <button class="danger" data-action="delete-item" data-id="${id}">${ic('trash')}<span>Elimina${it.category === 'casa' ? ' questa casa' : it.category === 'mezzi' ? ' questo mezzo' : ''}</span></button>
    </div>`);
}

/* --- impostazioni --- */
function inviteText(kind) {
  const code = kind === 'view' ? state.invites?.invite_code_view : state.invites?.invite_code;
  return `Ti invito nel nostro Scadenziario! Apri ${location.origin}, crea un account e inserisci questo codice: ${code}`;
}

function membersCard() {
  const owner = state.role === 'owner';
  const rows = state.memberList.map((m) => {
    const me = m.user_id === state.user?.id;
    return `<div class="mrow">
      <div class="mmain"><div class="t">${esc(m.email || 'Persona')}${me ? ' (tu)' : ''}</div><div class="s">${ROLE_LABEL[m.role] || m.role}</div></div>
      ${owner && !me && m.role !== 'owner' ? `<div class="mact">
        <button class="chip" data-action="member-role" data-user="${m.user_id}" data-role="${m.role === 'viewer' ? 'member' : 'viewer'}">${m.role === 'viewer' ? 'Può modificare' : 'Solo lettura'}</button>
        <button class="chip danger" data-action="member-remove" data-user="${m.user_id}" data-email="${esc(m.email || '')}">Rimuovi</button></div>` : ''}
    </div>`;
  }).join('');
  return `<div class="group-title">Persone</div><div class="card soft">${rows || '<p class="hint" style="margin:0">Ci sei solo tu, per ora.</p>'}</div>`;
}

function inviteBlock(kind, title, text) {
  const code = kind === 'view' ? state.invites?.invite_code_view : state.invites?.invite_code;
  return `<div class="invite">
    <div class="t">${title}</div><div class="hint" style="margin:2px 0 8px">${text}</div>
    <div class="code">${esc(code || '—')}</div>
    <div class="two-btn">
      <button class="btn secondary" data-action="copy-code" data-kind="${kind}">${ic('copy')}Copia</button>
      <button class="btn" data-action="share-code" data-kind="${kind}">${ic('share')}Invia</button>
    </div>
    <button class="link" data-action="new-code" data-kind="${kind}">Genera un nuovo codice</button>
  </div>`;
}

function openSettings() {
  const open = state.deadlines.filter((d) => !d.paid).length;
  const hh = state.household; const owner = state.role === 'owner';
  const cloud = MODE === 'cloud' && hh;
  const space = cloud ? `
    <div class="card soft">
      <div class="space-head">${ic('users')}<div><div class="t">${esc(hh.name)}</div>
        <div class="hint">${state.members === 1 ? 'Ci sei solo tu, per ora' : state.members + ' persone condividono questi dati'} · ${ROLE_LABEL[state.role] || ''}</div></div></div>
    </div>
    ${membersCard()}
    ${owner && state.invites ? `<div class="group-title">Invita qualcuno</div><div class="card soft">
      ${inviteBlock('edit', 'Può modificare', 'Per i tuoi genitori e chi gestisce le scadenze con te.')}
      <hr class="sep">
      ${inviteBlock('view', 'Solo lettura', 'Per chi deve solo vedere le scadenze, per esempio i figli.')}
    </div>
    <details class="more adv"><summary>Posta automatica (avanzate)</summary>
      <p class="hint">Serve per collegare lo script di Gmail. La chiave va incollata solo nello script: chi la ha può inviare proposte all'app.</p>
      <div class="two-btn"><button class="btn secondary" data-action="copy-token">${ic('copy')}Copia la chiave</button>
      <button class="btn secondary" data-action="new-token">Nuova chiave</button></div>
    </details>` : ''}`
    : (MODE === 'local' ? `<div class="banner">${ic('info')}<span>Modalità prova: i dati restano solo su questo dispositivo.</span></div>` : '');

  openSheet('Impostazioni', `
    ${space}
    ${MODE === 'cloud' ? `<div class="stat-row"><span>Accesso come</span><b>${esc(state.user?.email || '')}</b></div>` : ''}
    <div class="menu" style="margin-top:8px">
      <button data-action="export-ics" ${open ? '' : 'disabled'}>${ic('calendar')}<span>Metti le scadenze nel calendario</span></button>
      <button data-action="export-json">${ic('download')}<span>Scarica una copia dei dati</span></button>
      ${readOnly() ? '' : `<label class="menu-file">${ic('upload')}<span>Importa una copia dei dati</span><input type="file" id="import-file" accept="application/json,.json" hidden></label>`}
      ${MODE === 'cloud' ? `<button class="danger" data-action="logout">${ic('logout')}<span>Esci</span></button>` : ''}
    </div>`);
}

function download(name, mime, content) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function exportICS() {
  const esc2 = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const RR = { monthly: 'FREQ=MONTHLY', bimonthly: 'FREQ=MONTHLY;INTERVAL=2', quarterly: 'FREQ=MONTHLY;INTERVAL=3', semiannual: 'FREQ=MONTHLY;INTERVAL=6', yearly: 'FREQ=YEARLY', biennial: 'FREQ=YEARLY;INTERVAL=2' };
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Scadenziario//IT', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Scadenziario'];
  for (const d of state.deadlines.filter((x) => !x.paid)) {
    const it = byId(state.items, d.item_id);
    const e = fromISO(d.due_date); e.setDate(e.getDate() + 1);
    const summary = `${d.title}${it ? ' – ' + it.name : ''}${d.amount != null ? ' (' + money(d.amount) + ')' : ''}`;
    lines.push('BEGIN:VEVENT', `UID:${d.id}@scadenziario`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${d.due_date.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${toISO(e).replace(/-/g, '')}`, `SUMMARY:${esc2(summary)}`);
    if (d.note) lines.push(`DESCRIPTION:${esc2(d.note)}`);
    if (RR[d.recurrence]) lines.push(`RRULE:${RR[d.recurrence]}`);
    for (const trig of ['-P7D', '-P1D']) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc2(d.title)}`, `TRIGGER:${trig}`, 'END:VALARM');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  download('scadenziario.ics', 'text/calendar', lines.join('\r\n'));
}

async function importJSON(file) {
  if (!canWrite()) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.items) || !Array.isArray(data.deadlines)) throw new Error('formato');
    const map = {};
    for (const it of data.items) {
      const r = normItem(await store.insert('items', { category: it.category === 'auto' ? 'mezzi' : it.category, subtype: it.subtype || null, name: it.name, note: it.note || null, details: it.details || {} }));
      map[it.id] = r.id; state.items.push(r);
    }
    for (const d of data.deadlines) {
      if (!map[d.item_id]) continue;
      state.deadlines.push(await store.insert('deadlines', {
        item_id: map[d.item_id], kind: d.kind, title: d.title, due_date: d.due_date, amount: d.amount ?? null,
        recurrence: d.recurrence || 'none', paid: !!d.paid, paid_on: d.paid_on || null, note: d.note || null,
        section: d.section || null, until: d.until || null,
      }));
    }
    for (const l of (data.item_logs || [])) {
      if (!map[l.item_id]) continue;
      state.logs.push(await store.insert('item_logs', {
        item_id: map[l.item_id], kind: l.kind || 'lavoro', title: l.title, done_on: l.done_on, km: l.km ?? null,
        amount: l.amount ?? null, place: l.place || null, note: l.note || null,
      }));
    }
    for (const sh of (data.shifts || [])) {
      if (!map[sh.item_id]) continue;
      state.shifts.push(await store.insert('shifts', { item_id: map[sh.item_id], day: sh.day, kind: sh.kind, note: sh.note || null }));
    }
    sortDeadlines(); closeSheetNow(); render();
    toast(`Importati ${data.items.length} elementi e ${data.deadlines.length} scadenze`);
  } catch (e) { console.error(e); toast('Il file non sembra una copia valida.'); }
}

/* ---------- toast ---------- */
let toastTimer;
function toast(msg, action) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(msg)}</span>${action ? `<button type="button">${esc(action.label)}</button>` : ''}`;
  if (action) el.querySelector('button').onclick = () => { el.classList.remove('show'); action.fn(); };
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), action ? 6000 : 3500);
}

/* ---------- accesso, registrazione, spazio condiviso (cloud) ---------- */
function renderLogin() {
  const signup = state.authMode === 'signup';
  app.innerHTML = `
    <div class="login">
      <img class="logo" src="icons/icon-192.png" alt="">
      <h1>Scadenziario</h1>
      <p class="lead">${signup ? 'Crea il tuo account' : 'Accedi per vedere le tue scadenze'}</p>
      <form id="login-form">
        <label>Email<input type="email" name="email" autocomplete="email" required></label>
        <label>Password<input type="password" name="password" autocomplete="${signup ? 'new-password' : 'current-password'}" minlength="6" required></label>
        <p class="err" id="login-err" role="alert"></p>
        <button class="btn" type="submit">${signup ? 'Crea account' : 'Accedi'}</button>
      </form>
      <div class="auth-links">
        <button class="link" data-action="auth-toggle">${signup ? 'Ho già un account: accedi' : 'Non hai un account? Registrati'}</button>
        ${signup ? '' : '<button class="link" data-action="forgot">Password dimenticata?</button>'}
      </div>
    </div>`;
}

function renderOnboarding() {
  app.innerHTML = `
    <div class="login">
      <img class="logo" src="icons/icon-192.png" alt="">
      <h1>Benvenuto</h1>
      <p class="lead">Scegli come iniziare</p>
      <div class="card">
        <h2>Sono il primo</h2>
        <form id="create-hh-form">
          <label>Come lo chiamiamo?<input name="name" value="La nostra famiglia" required></label>
          <button class="btn" type="submit">Crea il nostro spazio</button>
        </form>
      </div>
      <div class="card">
        <h2>Ho un codice di invito</h2>
        <form id="join-hh-form">
          <label>Codice<input name="code" autocomplete="off" autocapitalize="characters" placeholder="es. 3F9A21BC" required></label>
          <p class="err" id="join-err" role="alert"></p>
          <button class="btn secondary" type="submit">Entra nello spazio</button>
        </form>
      </div>
      <div class="auth-links"><button class="link" data-action="logout">Esci</button></div>
    </div>`;
}

const authError = (e) => {
  const m = (e?.message || '').toLowerCase();
  if (m.includes('already')) return 'Esiste già un account con questa email.';
  if (m.includes('password') && (m.includes('short') || m.includes('least') || m.includes('weak'))) return 'La password deve avere almeno 6 caratteri.';
  if (m.includes('rate') || m.includes('too many')) return 'Troppi tentativi. Riprova tra qualche minuto.';
  if (m.includes('email') && m.includes('invalid')) return "L'email non sembra valida.";
  if (m.includes('confirm')) return "Devi prima confermare l'email: controlla la posta.";
  return 'Email o password non corretti.';
};

async function doLogin(form) {
  const err = $('#login-err'); err.textContent = '';
  const email = form.elements.email.value.trim(), password = form.elements.password.value;
  if (state.authMode === 'signup') {
    const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin } });
    if (error) { err.textContent = authError(error); return; }
    if (!data.session) {
      state.authMode = 'login'; renderLogin();
      $('#login-err').style.color = 'var(--ok)';
      $('#login-err').textContent = "Ti ho mandato un'email: aprila per confermare, poi accedi.";
      return;
    }
    state.user = data.user; await loadData(); return;
  }
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) { err.textContent = authError(error); return; }
  state.user = data.user;
  await loadData();
}

async function doForgot() {
  const email = $('#login-form')?.elements.email.value.trim();
  const err = $('#login-err');
  if (!email) { err.style.color = ''; err.textContent = 'Scrivi qui sopra la tua email, poi premi di nuovo.'; return; }
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin });
  err.style.color = error ? '' : 'var(--ok)';
  err.textContent = error ? 'Non sono riuscito a inviare l\'email. Riprova tra poco.' : "Se l'email è registrata, ti ho mandato il link per scegliere una nuova password.";
}

function openNewPassword() {
  openSheet('Scegli una nuova password', `
    <form id="pw-form">
      <label>Nuova password<input type="password" name="pw" minlength="6" autocomplete="new-password" required></label>
      <p class="err" id="pw-err" role="alert"></p>
      <div class="actions"><button class="btn" type="submit">Salva password</button></div>
    </form>`, { noSwipe: true });
}

async function onCreateHousehold(form) {
  const { error } = await sb.rpc('create_household', { p_name: form.elements.name.value });
  if (error) { toast('Non sono riuscito a creare lo spazio.'); console.error(error); return; }
  await loadData();
}

async function onJoinHousehold(form) {
  const err = $('#join-err'); err.textContent = '';
  const { error } = await sb.rpc('join_household', { p_code: form.elements.code.value });
  if (error) {
    err.textContent = error.message.includes('già') ? 'Fai già parte di uno spazio condiviso.' : 'Codice non valido. Controllalo e riprova.';
    return;
  }
  await loadData();
}

/* ---------- eventi ---------- */
const WRITE_ACTIONS = new Set(['shift-day', 'shift-paint', 'shift-pick', 'shift-clear', 'shift-types', 'shift-cycle', 'new-shift-type', 'edit-shift-type', 'new-history', 'delete-history', 'new-deadline', 'new-item', 'new-log', 'edit-item', 'delete-item', 'hide-section', 'unhide-section', 'delete-deadline', 'delete-log', 'pay-form', 'reopen-form', 'inbox-add', 'inbox-paid', 'inbox-skip']);
document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action; const id = el.dataset.id;
  if (a === 'pay') { e.stopPropagation(); markPaid(id); return; }
  if (readOnly() && WRITE_ACTIONS.has(a)) { toast('Hai accesso in sola lettura: non puoi modificare.'); return; }

  switch (a) {
    case 'tab': state.tab = el.dataset.tab; state.itemId = null; render(); window.scrollTo(0, 0); break;
    case 'open-item': { const it = byId(state.items, id); if (it) { state.tab = it.category; state.itemId = id; state.anim = 'push'; render(); window.scrollTo(0, 0); } break; }
    case 'back': state.itemId = null; state.anim = 'pop'; render(); window.scrollTo(0, 0); break;
    case 'new-deadline': openDeadlineForm(null, el.dataset.item); break;
    case 'edit-deadline': {
      const dl = byId(state.deadlines, id); const it = dl && byId(state.items, dl.item_id);
      if (dl && it && dl.section && !dl.paid && SECTIONS[dl.section]) openSection(it.id, dl.section); else openDeadlineForm(id);
      break;
    }
    case 'open-section': openSection(el.dataset.item, el.dataset.sec); break;
    case 'shift-month': { const d = Number(el.dataset.delta); const [y, m] = curYM().split('-').map(Number); state.shiftMonth = d === 0 ? todayISO().slice(0, 7) : toISO(new Date(y, m - 1 + d, 1, 12)).slice(0, 7); render(); break; }
    case 'shift-paint': state.paint = state.paint === el.dataset.type ? null : el.dataset.type; render(); break;
    case 'shift-day': {
      if (state.paint) { if (applyShift(el.dataset.item, el.dataset.day, state.paint === '__erase' ? null : state.paint)) render(); }
      else openShiftDay(el.dataset.item, el.dataset.day);
      break;
    }
    case 'shift-pick': if (applyShift(el.dataset.item, el.dataset.day, el.dataset.type, ($('#shift-note')?.value || '').trim())) { closeSheetNow(); render(); } break;
    case 'shift-clear': if (applyShift(el.dataset.item, el.dataset.day, null)) { closeSheetNow(); render(); } break;
    case 'shift-types': openShiftTypes(id); break;
    case 'new-shift-type': openShiftTypeForm(el.dataset.item, null); break;
    case 'edit-shift-type': openShiftTypeForm(el.dataset.item, el.dataset.type); break;
    case 'pick-color': { const f = el.closest('form'); f.elements.color.value = el.dataset.color; f.querySelectorAll('.sw').forEach((b) => b.classList.toggle('sel', b === el)); break; }
    case 'toggle-shift-type': {
      const it = byId(state.items, el.dataset.item); const cur = shiftOf(it, el.dataset.type);
      const prev = it.details?.shiftTypes || []; const entry = { ...cur, hidden: !cur.hidden }; delete entry.custom;
      const list = prev.some((x) => x.id === cur.id) ? prev.map((x) => (x.id === cur.id ? entry : x)) : [...prev, entry];
      if (await saveItem(it.id, { details: { ...(it.details || {}), shiftTypes: list } })) { openShiftTypes(it.id); render(); }
      break;
    }
    case 'delete-shift-type': {
      const it = byId(state.items, el.dataset.item);
      const used = state.shifts.filter((x) => x.item_id === it.id && x.kind === el.dataset.type).length;
      if (await confirmDialog({ title: 'Eliminare questo tipo?', text: used ? `È usato in ${used} giorni: resteranno segnati con una sigla senza nome.` : 'Non è usato in nessun giorno.', ok: 'Elimina', danger: true })) {
        if (await saveItem(it.id, { details: { ...(it.details || {}), shiftTypes: (it.details?.shiftTypes || []).filter((x) => x.id !== el.dataset.type) } })) { openShiftTypes(it.id); render(); }
      }
      break;
    }
    case 'shift-cycle': openShiftCycle(id); break;
    case 'cycle-add': { cycleSeq.push(el.dataset.type); $('#cycle-seq').innerHTML = cycleSeqHTML(byId(state.items, el.dataset.item)); break; }
    case 'cycle-undo': { cycleSeq.pop(); $('#cycle-seq').innerHTML = cycleSeqHTML(byId(state.items, el.dataset.item)); break; }
    case 'cycle-preset': { cycleSeq = [...CYCLE_PRESETS[Number(el.dataset.i)][1]]; $('#cycle-seq').innerHTML = cycleSeqHTML(byId(state.items, el.dataset.item)); break; }
    case 'shift-print': printShifts(id); break;
    case 'open-history': openHistory(el.dataset.item, el.dataset.sec || null); break;
    case 'new-history': openHistoryEntry(el.dataset.item, el.dataset.sec || null, null); break;
    case 'edit-history': { const d = byId(state.deadlines, id); if (d) openHistoryEntry(d.item_id, d.section || null, id); break; }
    case 'delete-history': {
      const d = byId(state.deadlines, id);
      if (d && await confirmDialog({ title: 'Eliminare questo pagamento?', text: 'Sparirà dallo storico.', ok: 'Elimina', danger: true })) {
        if (await deleteDeadline(id)) { openHistory(d.item_id, d.section || null); render(); toast('Eliminato'); }
      }
      break;
    }
    case 'edit-ident': openIdentity(id); break;
    case 'pick-type': setItemType($('#item-form'), el.dataset.type); break;
    case 'seq-skip': advanceSeq(); break;
    case 'hide-section': hideSection(el.dataset.item, el.dataset.sec); break;
    case 'show-hidden': openHidden(id); break;
    case 'unhide-section': {
      const it = byId(state.items, el.dataset.item);
      if (it && await saveItem(it.id, { details: { ...(it.details || {}), hidden: (it.details?.hidden || []).filter((x) => x !== el.dataset.sec) } })) { render(); openHidden(it.id); }
      break;
    }
    case 'new-log': openLogForm(id); break;
    case 'edit-log': { const lg = byId(state.logs, id); if (lg) openLogForm(lg.item_id, id); break; }
    case 'log-sugg': { const f = $('#log-form'); if (f) { f.elements.title.value = el.dataset.v; f.elements.title.focus(); } break; }
    case 'delete-log': {
      const lg = byId(state.logs, id);
      if (await confirmDialog({ title: 'Eliminare questa voce?', text: lg ? `“${lg.title}” verrà rimossa dallo storico.` : '', ok: 'Elimina', danger: true })) {
        if (await deleteLog(id)) { closeSheetNow(); render(); toast('Eliminata'); }
      }
      break;
    }
    case 'pick-kind': applyKind($('#dl-form'), el.dataset.kind); break;
    case 'new-item': openItemForm(null, el.dataset.cat); break;
    case 'edit-item': openItemForm(id, byId(state.items, id)?.category); break;
    case 'item-menu': openItemMenu(id); break;
    case 'sugg': {
      const f = $('#item-form');
      if (f.dataset.cat === 'casa') setItemType(f, /propriet|seconda/i.test(el.dataset.v) ? 'proprieta' : /affitto/i.test(el.dataset.v) ? 'affitto' : f.dataset.type);
      f.elements.name.value = el.dataset.v;
      break;
    }
    case 'settings': openSettings(); break;
    case 'close-sheet': closeSheet(); break;
    case 'parse-paste': applyPaste($('#dl-form')); break;
    case 'pay-form': closeSheetNow(); markPaid(id); break;
    case 'reopen-form': closeSheetNow(); reopen(id); break;
    case 'delete-deadline': {
      const dl = byId(state.deadlines, id);
      if (await confirmDialog({ title: 'Eliminare questa scadenza?', text: dl ? `“${dl.title}” verrà rimossa.` : '', ok: 'Elimina', danger: true })) {
        if (await deleteDeadline(id)) { closeSheetNow(); render(); toast('Eliminata'); }
      }
      break;
    }
    case 'delete-item': {
      const it = byId(state.items, id);
      const n = state.deadlines.filter((d) => d.item_id === id).length;
      if (await confirmDialog({ title: `Eliminare “${it?.name}”?`, text: n ? `Verranno eliminate anche le sue ${n} scadenze. Non si può annullare.` : 'Non si può annullare.', ok: 'Elimina', danger: true })) {
        if (await deleteItem(id)) { closeSheetNow(); state.itemId = null; state.anim = 'pop'; render(); toast('Eliminato'); }
      }
      break;
    }
    case 'export-ics': exportICS(); break;
    case 'export-json': download('scadenziario-backup.json', 'application/json', JSON.stringify({ items: state.items, deadlines: state.deadlines, item_logs: state.logs, shifts: state.shifts.map(({ tmp, ...r }) => r) }, null, 2)); break;
    case 'copy-code': try { await navigator.clipboard.writeText(el.dataset.kind === 'view' ? state.invites.invite_code_view : state.invites.invite_code); toast('Codice copiato'); } catch { toast('Copia non riuscita: scrivilo a mano'); } break;
    case 'share-code': {
      const txt = inviteText(el.dataset.kind);
      if (navigator.share) { try { await navigator.share({ title: 'Scadenziario', text: txt }); } catch {} }
      else { try { await navigator.clipboard.writeText(txt); toast('Invito copiato: incollalo in un messaggio'); } catch { toast('Condivisione non disponibile'); } }
      break;
    }
    case 'new-code':
      if (await confirmDialog({ title: 'Generare un nuovo codice?', text: 'Il codice attuale non funzionerà più. Chi è già dentro resta nello spazio.', ok: 'Genera' })) {
        const { data, error } = await sb.rpc('regenerate_invite', { p_household: state.hid, p_kind: el.dataset.kind });
        if (error) fail(error); else { state.invites[el.dataset.kind === 'view' ? 'invite_code_view' : 'invite_code'] = data; openSettings(); toast('Nuovo codice pronto'); }
      }
      break;
    case 'copy-token': try { await navigator.clipboard.writeText(state.invites.inbox_token); toast('Chiave copiata'); } catch { toast('Copia non riuscita'); } break;
    case 'new-token':
      if (await confirmDialog({ title: 'Generare una nuova chiave?', text: 'Lo script di Gmail smetterà di funzionare finché non incolli la nuova chiave.', ok: 'Genera' })) {
        const { data, error } = await sb.rpc('regenerate_invite', { p_household: state.hid, p_kind: 'token' });
        if (error) fail(error); else { state.invites.inbox_token = data; toast('Nuova chiave pronta'); }
      }
      break;
    case 'member-role': {
      const { error } = await sb.rpc('set_member_role', { p_household: state.hid, p_user: el.dataset.user, p_role: el.dataset.role });
      if (error) fail(error); else { await loadHousehold(); openSettings(); toast(el.dataset.role === 'viewer' ? 'Ora può solo guardare' : 'Ora può modificare'); }
      break;
    }
    case 'member-remove':
      if (await confirmDialog({ title: 'Rimuovere questa persona?', text: `${el.dataset.email || 'La persona'} non vedrà più le scadenze. Potrà rientrare solo con un nuovo codice.`, ok: 'Rimuovi', danger: true })) {
        const { error } = await sb.rpc('remove_member', { p_household: state.hid, p_user: el.dataset.user });
        if (error) fail(error); else { await loadHousehold(); openSettings(); toast('Persona rimossa'); }
      }
      break;
    case 'inbox-add': acceptInbox(id); break;
    case 'inbox-paid': inboxPaid(id); break;
    case 'inbox-skip': if (await resolveInbox(id, 'dismissed')) { render(); toast('Scartata'); } break;
    case 'auth-toggle': state.authMode = state.authMode === 'login' ? 'signup' : 'login'; renderLogin(); break;
    case 'forgot': doForgot(); break;
    case 'logout':
      if (sb) await sb.auth.signOut();
      document.body.classList.remove('ro'); state.role = 'owner'; state.inbox = [];
      closeSheetNow(); state.user = null; state.hid = null; state.household = null; state.items = []; state.deadlines = []; state.logs = []; state.shifts = []; state.tab = 'home'; state.itemId = null; render();
      break;
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && sheetOpen) closeSheet();
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('.row[role="button"]')) { e.preventDefault(); e.target.click(); }
});

document.addEventListener('input', onSecFormInput);
document.addEventListener('change', (e) => {
  onDeadlineFormChange(e);
  onSecFormInput(e);
  if (e.target.id === 'import-file' && e.target.files[0]) importJSON(e.target.files[0]);
});

document.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const btn = form.querySelector('button[type="submit"]');
  if (btn) btn.disabled = true;
  try {
    switch (form.id) {
      case 'dl-form': await onDeadlineSubmit(form); break;
      case 'noop': break;
      case 'item-form': await onItemSubmit(form); break;
      case 'sec-form': if (await onSectionSubmit(form)) { if (form.dataset.inbox) await resolveInbox(form.dataset.inbox, 'done'); if (seq) advanceSeq(); else { closeSheetNow(); render(); toast('Salvato'); } } break;
      case 'ident-form': if (await onIdentSubmit(form)) { if (seq && form.dataset.seq) advanceSeq(); else { closeSheetNow(); render(); toast('Salvato'); } } break;
      case 'log-form': await onLogSubmit(form); break;
      case 'hist-form': await onHistorySubmit(form); break;
      case 'stype-form': await onShiftTypeSubmit(form); break;
      case 'cycle-form': await onCycleSubmit(form); break;
      case 'login-form': await doLogin(form); break;
      case 'create-hh-form': await onCreateHousehold(form); break;
      case 'join-hh-form': await onJoinHousehold(form); break;
      case 'pw-form': {
        const { error } = await sb.auth.updateUser({ password: form.elements.pw.value });
        if (error) { $('#pw-err').textContent = 'Password non valida (almeno 6 caratteri).'; } else { closeSheetNow(); toast('Password aggiornata'); }
        break;
      }
    }
  } finally { if (btn && btn.isConnected) btn.disabled = false; }
});

// Scorri dal bordo sinistro verso destra per tornare indietro (pagina elemento).
let edge = null;
document.addEventListener('touchstart', (e) => {
  const t = e.touches[0];
  edge = state.itemId && !sheetOpen && t.clientX < 28 ? { x: t.clientX, y: t.clientY } : null;
}, { passive: true });
document.addEventListener('touchend', (e) => {
  if (!edge) return;
  const t = e.changedTouches[0];
  if (t.clientX - edge.x > 70 && Math.abs(t.clientY - edge.y) < 60) { state.itemId = null; state.anim = 'pop'; render(); }
  edge = null;
}, { passive: true });

window.addEventListener('online', () => { state.offline = false; if (MODE === 'cloud' && state.user) loadData(); });
window.addEventListener('offline', () => { state.offline = true; render(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden || !state.ready || sheetOpen) return;
  if (MODE === 'cloud' && state.user && state.hid && !state.offline) loadData(); else render();
});

/* ---------- avvio ---------- */
async function loadHousehold() {
  const { data, error } = await sb.from('household_members').select('household_id, role, households(id,name)').eq('user_id', state.user.id).limit(1);
  if (error) throw error;
  const row = data?.[0];
  state.hid = row?.household_id || null;
  state.household = row?.households || null;
  state.role = row?.role || 'member';
  state.memberList = []; state.invites = null;
  if (state.hid) {
    const m = await sb.rpc('list_members', { p_household: state.hid });
    state.memberList = m.error ? [] : m.data;
    state.members = state.memberList.length || 1;
    if (state.role === 'owner') {
      const iv = await sb.rpc('get_invites', { p_household: state.hid });
      state.invites = iv.error ? null : iv.data?.[0] || null;
    }
  }
  document.body.classList.toggle('ro', readOnly());
}

async function loadData() {
  const snapKey = state.user ? LS + '.snap.' + state.user.id : null;
  try {
    if (MODE === 'cloud') {
      await loadHousehold();
      if (!state.hid) { state.items = []; state.deadlines = []; state.logs = []; state.shifts = []; state.loadError = ''; state.offline = false; render(); return; }
    }
    const d = await store.load();
    state.items = d.items.map(normItem); state.deadlines = d.deadlines; state.logs = d.item_logs || []; state.inbox = d.inbox || []; state.shifts = d.shifts || []; sortDeadlines();
    state.loadError = ''; state.offline = false;
    if (snapKey) { try { localStorage.setItem(snapKey, JSON.stringify({ items: state.items, deadlines: state.deadlines, logs: state.logs, shifts: state.shifts, hid: state.hid, household: state.household, members: state.members })); } catch {} }
  } catch (e) {
    console.error(e);
    const snap = snapKey && localStorage.getItem(snapKey);
    if (snap) {
      const d = JSON.parse(snap);
      state.items = d.items; state.deadlines = d.deadlines; state.logs = d.logs || []; state.shifts = d.shifts || []; state.hid = d.hid; state.household = d.household; state.members = d.members || 1; state.offline = true;
    } else state.loadError = 'Non riesco a caricare i dati. Controlla la connessione.';
  }
  render();
}

function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('script'));
    document.head.appendChild(s);
  });
}

async function init() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  if (MODE === 'local') { state.ready = true; await loadData(); return; }
  try {
    await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2');
    sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true } });
  } catch {
    state.ready = true; state.loadError = 'Non riesco a caricare i componenti. Riprova con la connessione attiva.';
    app.innerHTML = `<div class="login"><div class="banner">${ic('alert')}<span>${esc(state.loadError)}</span></div></div>`;
    return;
  }
  const { data } = await sb.auth.getSession();
  state.user = data.session?.user || null;
  sb.auth.onAuthStateChange((ev) => {
    if (ev === 'SIGNED_OUT') { state.user = null; render(); }
    if (ev === 'PASSWORD_RECOVERY') setTimeout(openNewPassword, 300);
  });
  state.ready = true;
  if (state.user) await loadData(); else render();
}

init();

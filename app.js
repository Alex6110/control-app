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
    empty: 'Qui puoi tenere abbonamenti, visite mediche, animali e tutto il resto.',
    sugg: ['Abbonamenti', 'Salute', 'Animali', 'Lavoro'], ph: 'es. Abbonamenti',
  },
};
const CAT_ORDER = ['casa', 'mezzi', 'altro'];
const SUBTYPES = { affitto: 'In affitto', proprieta: 'Di proprietà' };

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
function kindsFor(item, keep) {
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
  return m < 12 ? `tra ${m} mesi` : (m < 18 ? 'tra circa un anno' : `tra ${(m / 12).toFixed(1).replace('.', ',').replace(',0', '')} anni`);
}
const urgency = (iso) => { const d = diffDays(todayISO(), iso); return d < 0 ? 'late' : d <= 7 ? 'soon' : ''; };
const tile = (icon, cat) => `<div class="tile tint-${cat || 'altro'}">${ic(icon)}</div>`;

/* ---------- stato ---------- */
const state = {
  tab: 'home', itemId: null, items: [], deadlines: [],
  user: null, hid: null, household: null, members: 1,
  ready: false, offline: !navigator.onLine, loadError: '', authMode: 'login', anim: '',
};
let sb = null;

/* ---------- archivio: locale o Supabase ---------- */
const LS = 'scadenziario.data.v1';
const readLocal = () => { try { return JSON.parse(localStorage.getItem(LS)) || { items: [], deadlines: [] }; } catch { return { items: [], deadlines: [] }; } };
const writeLocal = (d) => localStorage.setItem(LS, JSON.stringify(d));
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2));

const localStore = {
  async load() { return readLocal(); },
  async insert(t, row) {
    const d = readLocal();
    const r = { id: uuid(), created_at: new Date().toISOString(), ...row };
    d[t].push(r); writeLocal(d); return r;
  },
  async update(t, id, patch) {
    const d = readLocal();
    const i = d[t].findIndex((x) => x.id === id);
    d[t][i] = { ...d[t][i], ...patch }; writeLocal(d); return d[t][i];
  },
  async remove(t, id) {
    const d = readLocal();
    d[t] = d[t].filter((x) => x.id !== id);
    if (t === 'items') d.deadlines = d.deadlines.filter((x) => x.item_id !== id);
    writeLocal(d);
  },
};

const numAmount = (r) => (r && r.amount != null ? { ...r, amount: Number(r.amount) } : r);
const cloudStore = {
  async load() {
    const [a, b] = await Promise.all([
      sb.from('items').select('*').order('created_at'),
      sb.from('deadlines').select('*').order('due_date'),
    ]);
    if (a.error) throw a.error;
    if (b.error) throw b.error;
    return { items: a.data, deadlines: b.data.map(numAmount) };
  },
  async insert(t, row) {
    const { data, error } = await sb.from(t).insert({ household_id: state.hid, ...row }).select().single();
    if (error) throw error;
    return t === 'deadlines' ? numAmount(data) : data;
  },
  async update(t, id, patch) {
    const { data, error } = await sb.from(t).update(patch).eq('id', id).select().single();
    if (error) throw error;
    return t === 'deadlines' ? numAmount(data) : data;
  },
  async remove(t, id) {
    const { error } = await sb.from(t).delete().eq('id', id);
    if (error) throw error;
  },
};
const store = MODE === 'cloud' ? cloudStore : localStore;

function canWrite() {
  if (MODE === 'cloud' && (state.offline || state.loadError)) { toast('Sei offline: per ora puoi solo consultare i dati.'); return false; }
  return true;
}

/* ---------- operazioni sui dati ---------- */
const byId = (arr, id) => arr.find((x) => x.id === id);
const sortDeadlines = () => state.deadlines.sort((a, b) => a.due_date.localeCompare(b.due_date));
const normItem = (i) => (i.category === 'auto' ? { ...i, category: 'mezzi' } : i);

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

// Segna come pagata. Se la scadenza si ripete, crea subito la successiva.
async function markPaid(id) {
  if (!canWrite()) return;
  const dl = byId(state.deadlines, id);
  if (!dl) return;
  let nextId = null;
  try {
    const r = await store.update('deadlines', id, { paid: true, paid_on: todayISO() });
    state.deadlines = state.deadlines.map((x) => (x.id === id ? r : x));
    const step = REC[dl.recurrence]?.m || 0;
    if (step) {
      const next = await store.insert('deadlines', {
        item_id: dl.item_id, kind: dl.kind, title: dl.title, due_date: addMonths(dl.due_date, step),
        amount: dl.amount, recurrence: dl.recurrence, paid: false, note: dl.note,
      });
      nextId = next.id;
      state.deadlines.push(next);
    }
    sortDeadlines();
  } catch (e) { fail(e); render(); return; }
  render();
  toast(nextId ? 'Pagata. Ho già messo la prossima in calendario' : 'Pagata', {
    label: 'Annulla',
    fn: async () => { await reopen(id, nextId); },
  });
}

async function reopen(id, removeNextId) {
  if (!canWrite()) return;
  try {
    if (removeNextId) {
      await store.remove('deadlines', removeNextId);
      state.deadlines = state.deadlines.filter((x) => x.id !== removeNextId);
    }
    const r = await store.update('deadlines', id, { paid: false, paid_on: null });
    state.deadlines = state.deadlines.map((x) => (x.id === id ? r : x));
    sortDeadlines();
  } catch (e) { fail(e); }
  render();
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
    while (d <= to && guard++ < 500) {
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

  let page;
  if (item) page = pageItem(item);
  else if (state.tab === 'home') page = pageHome();
  else page = pageSection(state.tab);

  const banner = state.offline && MODE === 'cloud'
    ? `<div class="banner">${ic('alert')}<span>Sei offline: vedi l'ultima copia dei dati. Potrai modificare appena torna la connessione.</span></div>`
    : (state.loadError ? `<div class="banner">${ic('alert')}<span>${esc(state.loadError)}</span></div>` : '');

  const left = item ? `<button class="icon-btn" data-action="back" aria-label="Indietro">${ic('back')}</button>` : '';
  const right = item
    ? `<button class="icon-btn" data-action="item-menu" data-id="${item.id}" aria-label="Opzioni">${ic('dots')}</button>`
    : `<button class="icon-btn" data-action="settings" aria-label="Impostazioni">${ic('sliders')}</button>`;

  app.innerHTML = `
    <header class="topbar"><div class="wrap bar ${item ? 'has-back' : ''}">
      ${left}<h1>${esc(page.title)}</h1>${right}
    </div></header>
    <main class="wrap ${state.anim === 'push' ? 'page-in' : state.anim === 'pop' ? 'page-back' : ''}">${banner}${page.body}</main>
    ${page.fab ? `<button class="fab" data-action="new-deadline" ${page.fabItem ? `data-item="${page.fabItem}"` : ''}>${ic('plus')}<span>Scadenza</span></button>` : ''}
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

/* --- pagina: Home --- */
function pageHome() {
  if (!state.items.length) return { title: 'Scadenze', body: emptyStart(), fab: false };
  const today = todayISO();
  const open = state.deadlines.filter((d) => !d.paid);
  const late = open.filter((d) => d.due_date < today);
  const week = open.filter((d) => d.due_date >= today && diffDays(today, d.due_date) <= 7);
  const month = open.filter((d) => diffDays(today, d.due_date) > 7 && diffDays(today, d.due_date) <= 30);
  const later = open.filter((d) => diffDays(today, d.due_date) > 30);
  const next30 = open.filter((d) => diffDays(today, d.due_date) <= 30);
  const sum30 = next30.reduce((s, d) => s + (Number(d.amount) || 0), 0);

  const hero = `
    <section class="hero">
      <div class="label">Da pagare nei prossimi 30 giorni</div>
      <div class="big">${eurFmt.format(sum30)}</div>
      <div class="sub">${next30.length === 0 ? 'Nessuna scadenza in arrivo' : next30.length === 1 ? '1 scadenza' : next30.length + ' scadenze'}</div>
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
  const body = open.length
    ? group('Scadute', late, 'late') + group('Questa settimana', week) + group('Entro 30 giorni', month) + group('Più avanti', later)
    : `<div class="empty"><div class="big-ico ok">${ic('checkCircle')}</div><h3>Tutto in ordine</h3><p>Non c'è nessuna scadenza aperta. Aggiungine una con il pulsante in basso.</p></div>`;

  return { title: 'Scadenze', body: hero + mini + body, fab: true };
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
    const meta = it.subtype ? SUBTYPES[it.subtype] + ' · ' : '';
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
function pageItem(it) {
  const sum = costSummary(ofItem(it.id));
  const open = state.deadlines.filter((d) => d.item_id === it.id && !d.paid);
  const paid = state.deadlines.filter((d) => d.item_id === it.id && d.paid)
    .sort((a, b) => (b.paid_on || '').localeCompare(a.paid_on || '')).slice(0, 8);
  const kinds = Object.keys(sum.byKind).length > 1;
  const body = `
    ${it.subtype || it.note ? `<p class="hint item-sub">${it.subtype ? SUBTYPES[it.subtype] : ''}${it.subtype && it.note ? ' · ' : ''}${esc(it.note || '')}</p>` : ''}
    ${sum.total ? heroCosts('Spesa prevista nei prossimi 12 mesi', sum.total) : ''}
    <div class="group-title">Da pagare</div>
    ${open.length ? `<div class="list">${open.map((d) => rowDeadline(d, { hideItem: true })).join('')}</div>`
      : `<div class="card soft"><p class="hint" style="margin:0 0 12px">Nessuna scadenza. Premi “Scadenza” per aggiungere la prima${GUIDE[it.category === 'casa' ? 'casa_' + (it.subtype || 'affitto') : it.category] ? ', oppure compila le voci principali in un colpo solo.' : '.'}</p>
        ${GUIDE[it.category === 'casa' ? 'casa_' + (it.subtype || 'affitto') : it.category] ? `<button class="btn secondary small" data-action="guided" data-id="${it.id}">Compila le voci principali</button>` : ''}</div>`}
    ${sum.total ? barsCard(sum.months) : ''}
    ${kinds ? `<div class="card"><h2>Dove vanno i soldi</h2>${breakdown(sum.byKind, (k) => { const kd = kindOf(k); return { icon: kd.icon, name: kd.label }; })}</div>` : ''}
    ${paid.length ? `<div class="group-title">Pagate di recente</div><div class="list">${paid.map((d) => rowDeadline(d, { hideItem: true })).join('')}</div>` : ''}
    ${sum.missing ? `<p class="hint">${sum.missing} ${sum.missing === 1 ? 'scadenza non ha' : 'scadenze non hanno'} un importo e non ${sum.missing === 1 ? 'è inclusa' : 'sono incluse'} nei conteggi.</p>` : ''}`;
  return { title: it.name, body, fab: true, fabItem: it.id };
}

/* ---------- finestre dal basso (sheet) ---------- */
const sheetRoot = $('#sheet-root');
let sheetOpen = false;

function openSheet(title, body, opts = {}) {
  sheetRoot.innerHTML = `
    <div class="overlay" data-action="close-sheet"></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="grab"></div>
      ${title ? `<div class="head"><h2>${esc(title)}</h2></div>` : ''}
      ${body}
    </div>`;
  document.body.style.overflow = 'hidden';
  sheetOpen = true;
  if (!opts.noSwipe) enableSwipe($('.sheet', sheetRoot));
}

function closeSheetNow() { sheetRoot.innerHTML = ''; document.body.style.overflow = ''; sheetOpen = false; }
function closeSheet() {
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
function confirmDialog({ title, text, ok = 'Conferma', danger = false }) {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'dlg-wrap';
    el.innerHTML = `
      <div class="dlg-overlay"></div>
      <div class="dlg" role="alertdialog" aria-modal="true" aria-label="${esc(title)}">
        <h3>${esc(title)}</h3><p>${esc(text || '')}</p>
        <div class="dlg-actions">
          <button class="btn secondary" data-v="0">Annulla</button>
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

function openDeadlineForm(id, presetItemId) {
  if (!state.items.length) { openItemForm(null, 'casa'); return; }
  const dl = id ? byId(state.deadlines, id) : null;
  const itemId = dl?.item_id || presetItemId || state.items[0].id;
  const item = byId(state.items, itemId);
  const kind = dl?.kind || kindsFor(item)[0].id;
  const k = kindOf(kind);
  const lock = !!presetItemId || !!dl || state.items.length === 1;

  const itemField = lock
    ? `<input type="hidden" name="item_id" value="${itemId}">${state.items.length > 1 ? `<div class="for-item">${tile(CATS[item.category]?.icon, item.category)}<span>${esc(item.name)}</span></div>` : ''}`
    : `<label>Per quale?<select name="item_id">${state.items.map((i) => `<option value="${i.id}" ${i.id === itemId ? 'selected' : ''}>${esc(i.name)} (${CATS[i.category]?.label})</option>`).join('')}</select></label>`;
  const recOpts = Object.entries(REC).map(([v, r]) => `<option value="${v}" ${(dl?.recurrence || k.rec) === v ? 'selected' : ''}>${r.label}</option>`).join('');

  openSheet(dl ? 'Modifica scadenza' : 'Nuova scadenza', `
    <form id="dl-form" data-id="${dl?.id || ''}">
      ${itemField}
      <div class="flabel">Che cosa?</div>
      <div class="kinds" id="kind-grid">${kindGrid(item, kind)}</div>
      <input type="hidden" name="kind" value="${kind}">
      <div class="row2">
        <label>Scadenza<input type="date" name="due_date" required value="${dl?.due_date || ''}"></label>
        <label>Importo (€)<input type="number" name="amount" step="0.01" min="0" inputmode="decimal" placeholder="se lo sai" value="${dl?.amount ?? ''}"></label>
      </div>
      <label>Si ripete<select name="recurrence">${recOpts}</select></label>
      <details class="more">
        <summary>Altre opzioni</summary>
        <label>Nome<input name="title" value="${esc(dl?.title || k.label)}" required></label>
        <label>Note<textarea name="note" rows="2" placeholder="Numero polizza, contratto…">${esc(dl?.note || '')}</textarea></label>
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
  };
  if (!fields.due_date) { toast('Manca la data di scadenza'); return; }
  if (!id) fields.paid = false;
  const ok = await saveDeadline(id, fields);
  if (ok) { closeSheetNow(); render(); toast(id ? 'Salvato' : 'Scadenza aggiunta'); }
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

/* --- form elemento --- */
function openItemForm(id, cat) {
  const it = id ? byId(state.items, id) : null;
  const category = it?.category || cat || 'casa';
  const c = CATS[category];
  const sub = it?.subtype || (category === 'casa' ? 'affitto' : '');
  openSheet(it ? 'Modifica' : c.add, `
    <form id="item-form" data-id="${it?.id || ''}" data-cat="${category}">
      <label>Nome<input name="name" required value="${esc(it?.name || '')}" placeholder="${esc(c.ph)}" autocomplete="off"></label>
      ${it ? '' : `<div class="sugg">${c.sugg.map((s) => `<button type="button" class="chip" data-action="sugg" data-v="${esc(s)}">${esc(s)}</button>`).join('')}</div>`}
      ${category === 'casa' ? `
      <div class="flabel">Com'è la casa?</div>
      <div class="seg two">
        <input type="radio" name="subtype" id="st-a" value="affitto" ${sub === 'affitto' ? 'checked' : ''}><label for="st-a">In affitto</label>
        <input type="radio" name="subtype" id="st-p" value="proprieta" ${sub === 'proprieta' ? 'checked' : ''}><label for="st-p">Di proprietà</label>
      </div>` : ''}
      <label>Note (facoltativo)<input name="note" value="${esc(it?.note || '')}" placeholder="Targa, indirizzo…" autocomplete="off"></label>
      <div class="actions"><button class="btn" type="submit">Salva</button></div>
    </form>`);
  if (!it) setTimeout(() => $('#item-form').elements.name.focus({ preventScroll: true }), 60);
}

async function onItemSubmit(form) {
  const f = form.elements; const id = form.dataset.id || null; const category = form.dataset.cat;
  const fields = { name: f.name.value.trim(), note: f.note.value.trim() || null };
  if (!id) fields.category = category;
  if (category === 'casa') fields.subtype = f.subtype?.value || null;
  const r = await saveItem(id, fields);
  if (!r) return;
  closeSheetNow();
  if (!id) {
    state.tab = r.category; state.itemId = r.id; state.anim = 'push'; render(); window.scrollTo(0, 0);
    openGuided(r.id);
  } else { render(); toast('Salvato'); }
}

/* --- inserimento guidato: le voci principali in un'unica schermata --- */
// Voci proposte per tipo. Le altre si aggiungono dopo con il pulsante "Scadenza".
const GUIDE = {
  casa_affitto: ['affitto', 'luce', 'gas', 'internet'],
  casa_proprieta: ['luce', 'gas', 'internet', 'imu', 'rifiuti'],
  mezzi: ['assicurazione', 'bollo', 'revisione', 'tagliando'],
};
// Per queste la persona ricorda "quando l'ho fatto l'ultima volta": la prossima la calcoliamo noi.
const LAST_KINDS = new Set(['revisione', 'tagliando', 'caldaia', 'gomme']);

function openGuided(itemId) {
  const item = byId(state.items, itemId);
  if (!item) return;
  const ids = GUIDE[item.category === 'casa' ? 'casa_' + (item.subtype || 'affitto') : item.category];
  if (!ids) { openDeadlineForm(null, itemId); return; }
  const rows = ids.map((id) => {
    const k = kindOf(id); const last = LAST_KINDS.has(id); const m = REC[k.rec].m;
    const every = m === 12 ? 'ogni anno' : m === 24 ? 'ogni 2 anni' : '';
    return `
    <div class="gk">
      <div class="gk-h">${tile(k.icon, item.category)}
        <div><div class="t">${k.label}</div>
        <div class="hint">${last ? `Quando l'hai fatto l'ultima volta?${every ? ` Poi il promemoria sarà ${every}.` : ''}` : 'Quando scade o quando è il prossimo pagamento?'}</div></div></div>
      <div class="row2">
        <label>${last ? 'Fatto il' : 'Scadenza'}<input type="date" name="d_${id}"></label>
        <label>Importo (€)<input type="number" name="a_${id}" step="0.01" min="0" inputmode="decimal" placeholder="se lo sai"></label>
      </div>
    </div>`;
  }).join('');
  openSheet('Cosa vuoi tenere sotto controllo?', `
    <p class="hint" style="margin:-4px 0 14px">Compila solo quello che sai. Le voci vuote vengono ignorate e il resto lo aggiungi quando vuoi.</p>
    <form id="guided-form" data-item="${itemId}">
      ${rows}
      <div class="actions">
        <button class="btn" type="submit">Salva</button>
        <button type="button" class="btn secondary" data-action="close-sheet">Lo faccio dopo</button>
      </div>
    </form>`);
}

async function onGuidedSubmit(form) {
  const itemId = form.dataset.item; const f = form.elements;
  const ids = (GUIDE[(() => { const it = byId(state.items, itemId); return it.category === 'casa' ? 'casa_' + (it.subtype || 'affitto') : it.category; })()]) || [];
  let n = 0;
  for (const id of ids) {
    const date = f['d_' + id].value;
    if (!date) continue;
    const k = kindOf(id);
    const due = LAST_KINDS.has(id) && REC[k.rec].m ? addMonths(date, REC[k.rec].m) : date;
    const a = f['a_' + id].value;
    const ok = await saveDeadline(null, {
      item_id: itemId, kind: id, title: k.label, due_date: due, amount: a === '' ? null : Number(a),
      recurrence: k.rec, note: null, paid: false,
    });
    if (!ok) return;
    n++;
  }
  closeSheetNow(); render();
  toast(n ? (n === 1 ? 'Aggiunta 1 scadenza' : `Aggiunte ${n} scadenze`) : 'Fatto. Aggiungerai le scadenze quando vuoi');
}

function openItemMenu(id) {
  const it = byId(state.items, id);
  if (!it) return;
  openSheet(it.name, `
    <div class="menu">
      <button data-action="edit-item" data-id="${id}">${ic('pencil')}<span>Modifica nome e dettagli</span></button>
      <button class="danger" data-action="delete-item" data-id="${id}">${ic('trash')}<span>Elimina${it.category === 'casa' ? ' questa casa' : it.category === 'mezzi' ? ' questo mezzo' : ''}</span></button>
    </div>`);
}

/* --- impostazioni --- */
function inviteText() {
  return `Ti invito nel nostro Scadenziario! Apri ${location.origin}, crea un account e inserisci questo codice: ${state.household?.invite_code}`;
}

function openSettings() {
  const open = state.deadlines.filter((d) => !d.paid).length;
  const hh = state.household;
  const space = MODE === 'cloud' && hh ? `
    <div class="card soft">
      <div class="space-head">${ic('users')}<div><div class="t">${esc(hh.name)}</div>
        <div class="hint">${state.members === 1 ? 'Ci sei solo tu, per ora' : state.members + ' persone condividono questi dati'}</div></div></div>
      <div class="hint" style="margin:12px 0 6px">Per condividere le scadenze con un'altra persona, dalle questo codice. Dovrà creare un account e inserirlo.</div>
      <div class="code" id="invite-code">${esc(hh.invite_code)}</div>
      <div class="two-btn">
        <button class="btn secondary" data-action="copy-code">${ic('copy')}Copia</button>
        <button class="btn" data-action="share-code">${ic('share')}Invia</button>
      </div>
      <button class="link" data-action="new-code">Genera un nuovo codice (il vecchio smette di funzionare)</button>
    </div>`
    : (MODE === 'local' ? `<div class="banner">${ic('info')}<span>Modalità prova: i dati restano solo su questo dispositivo.</span></div>` : '');

  openSheet('Impostazioni', `
    ${space}
    ${MODE === 'cloud' ? `<div class="stat-row"><span>Accesso come</span><b>${esc(state.user?.email || '')}</b></div>` : ''}
    <div class="menu" style="margin-top:8px">
      <button data-action="export-ics" ${open ? '' : 'disabled'}>${ic('calendar')}<span>Metti le scadenze nel calendario</span></button>
      <button data-action="export-json">${ic('download')}<span>Scarica una copia dei dati</span></button>
      <label class="menu-file">${ic('upload')}<span>Importa una copia dei dati</span><input type="file" id="import-file" accept="application/json,.json" hidden></label>
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
      const r = normItem(await store.insert('items', { category: it.category === 'auto' ? 'mezzi' : it.category, subtype: it.subtype || null, name: it.name, note: it.note || null }));
      map[it.id] = r.id; state.items.push(r);
    }
    for (const d of data.deadlines) {
      if (!map[d.item_id]) continue;
      state.deadlines.push(await store.insert('deadlines', {
        item_id: map[d.item_id], kind: d.kind, title: d.title, due_date: d.due_date, amount: d.amount ?? null,
        recurrence: d.recurrence || 'none', paid: !!d.paid, paid_on: d.paid_on || null, note: d.note || null,
      }));
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
document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action; const id = el.dataset.id;
  if (a === 'pay') { e.stopPropagation(); markPaid(id); return; }

  switch (a) {
    case 'tab': state.tab = el.dataset.tab; state.itemId = null; render(); window.scrollTo(0, 0); break;
    case 'open-item': { const it = byId(state.items, id); if (it) { state.tab = it.category; state.itemId = id; state.anim = 'push'; render(); window.scrollTo(0, 0); } break; }
    case 'back': state.itemId = null; state.anim = 'pop'; render(); window.scrollTo(0, 0); break;
    case 'new-deadline': openDeadlineForm(null, el.dataset.item); break;
    case 'edit-deadline': openDeadlineForm(id); break;
    case 'pick-kind': applyKind($('#dl-form'), el.dataset.kind); break;
    case 'new-item': openItemForm(null, el.dataset.cat); break;
    case 'guided': openGuided(id); break;
    case 'edit-item': openItemForm(id, byId(state.items, id)?.category); break;
    case 'item-menu': openItemMenu(id); break;
    case 'sugg': { const f = $('#item-form'); f.elements.name.value = el.dataset.v; if (/affitto/i.test(el.dataset.v) && f.elements.subtype) f.elements.subtype.value = 'affitto'; if (/propriet/i.test(el.dataset.v) && f.elements.subtype) f.elements.subtype.value = 'proprieta'; break; }
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
    case 'export-json': download('scadenziario-backup.json', 'application/json', JSON.stringify({ items: state.items, deadlines: state.deadlines }, null, 2)); break;
    case 'copy-code': try { await navigator.clipboard.writeText(state.household.invite_code); toast('Codice copiato'); } catch { toast('Copia non riuscita: scrivilo a mano'); } break;
    case 'share-code':
      if (navigator.share) { try { await navigator.share({ title: 'Scadenziario', text: inviteText() }); } catch {} }
      else { try { await navigator.clipboard.writeText(inviteText()); toast('Invito copiato: incollalo in un messaggio'); } catch { toast('Condivisione non disponibile'); } }
      break;
    case 'new-code':
      if (await confirmDialog({ title: 'Generare un nuovo codice?', text: 'Il codice attuale non funzionerà più. Chi è già dentro resta nello spazio.', ok: 'Genera' })) {
        const { data, error } = await sb.rpc('regenerate_invite', { p_household: state.hid });
        if (error) fail(error); else { state.household.invite_code = data; openSettings(); toast('Nuovo codice pronto'); }
      }
      break;
    case 'auth-toggle': state.authMode = state.authMode === 'login' ? 'signup' : 'login'; renderLogin(); break;
    case 'forgot': doForgot(); break;
    case 'logout':
      if (sb) await sb.auth.signOut();
      closeSheetNow(); state.user = null; state.hid = null; state.household = null; state.items = []; state.deadlines = []; state.tab = 'home'; state.itemId = null; render();
      break;
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && sheetOpen) closeSheet();
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('.row[role="button"]')) { e.preventDefault(); e.target.click(); }
});

document.addEventListener('change', (e) => {
  onDeadlineFormChange(e);
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
      case 'item-form': await onItemSubmit(form); break;
      case 'guided-form': await onGuidedSubmit(form); break;
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
  const { data, error } = await sb.from('household_members').select('household_id, households(id,name,invite_code)').limit(1);
  if (error) throw error;
  const row = data?.[0];
  state.hid = row?.household_id || null;
  state.household = row?.households || null;
  if (state.hid) {
    const m = await sb.from('household_members').select('user_id');
    state.members = m.data?.length || 1;
  }
}

async function loadData() {
  const snapKey = state.user ? LS + '.snap.' + state.user.id : null;
  try {
    if (MODE === 'cloud') {
      await loadHousehold();
      if (!state.hid) { state.items = []; state.deadlines = []; state.loadError = ''; state.offline = false; render(); return; }
    }
    const d = await store.load();
    state.items = d.items.map(normItem); state.deadlines = d.deadlines; sortDeadlines();
    state.loadError = ''; state.offline = false;
    if (snapKey) { try { localStorage.setItem(snapKey, JSON.stringify({ items: state.items, deadlines: state.deadlines, hid: state.hid, household: state.household, members: state.members })); } catch {} }
  } catch (e) {
    console.error(e);
    const snap = snapKey && localStorage.getItem(snapKey);
    if (snap) {
      const d = JSON.parse(snap);
      state.items = d.items; state.deadlines = d.deadlines; state.hid = d.hid; state.household = d.household; state.members = d.members || 1; state.offline = true;
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

'use strict';

/* =========================================================
   Scadenziario – app.js
   Nessuna dipendenza, nessun build. Dati in locale oppure su Supabase.
   ========================================================= */

const CFG = window.APP_CONFIG || {};
const MODE = CFG.supabaseUrl && CFG.supabaseKey ? 'cloud' : 'local';

/* ---------- dati di riferimento ---------- */
const CATS = {
  auto: { label: 'Auto', icon: '🚗' },
  casa: { label: 'Casa', icon: '🏠' },
  altro: { label: 'Altro', icon: '📌' },
};

const REC = {
  none: { label: 'Una sola volta', m: 0 },
  monthly: { label: 'Ogni mese', m: 1 },
  bimonthly: { label: 'Ogni 2 mesi', m: 2 },
  quarterly: { label: 'Ogni 3 mesi', m: 3 },
  semiannual: { label: 'Ogni 6 mesi', m: 6 },
  yearly: { label: 'Ogni anno', m: 12 },
  biennial: { label: 'Ogni 2 anni', m: 24 },
};

const KINDS = [
  { id: 'assicurazione', label: 'Assicurazione', icon: '🛡️', rec: 'yearly', cats: ['auto', 'casa', 'altro'] },
  { id: 'bollo', label: 'Bollo auto', icon: '🧾', rec: 'yearly', cats: ['auto'] },
  { id: 'revisione', label: 'Revisione', icon: '🔧', rec: 'biennial', cats: ['auto'] },
  { id: 'tagliando', label: 'Tagliando', icon: '🛠️', rec: 'yearly', cats: ['auto'] },
  { id: 'gomme', label: 'Cambio gomme', icon: '🛞', rec: 'semiannual', cats: ['auto'] },
  { id: 'affitto', label: 'Affitto', icon: '🔑', rec: 'monthly', cats: ['casa'] },
  { id: 'condominio', label: 'Spese condominiali', icon: '🏢', rec: 'monthly', cats: ['casa'] },
  { id: 'luce', label: 'Luce', icon: '💡', rec: 'bimonthly', cats: ['casa'] },
  { id: 'gas', label: 'Gas', icon: '🔥', rec: 'bimonthly', cats: ['casa'] },
  { id: 'acqua', label: 'Acqua', icon: '💧', rec: 'quarterly', cats: ['casa'] },
  { id: 'internet', label: 'Internet', icon: '📶', rec: 'monthly', cats: ['casa', 'altro'] },
  { id: 'rifiuti', label: 'Tassa rifiuti (TARI)', icon: '🗑️', rec: 'yearly', cats: ['casa'] },
  { id: 'imu', label: 'IMU', icon: '🏛️', rec: 'semiannual', cats: ['casa'] },
  { id: 'caldaia', label: 'Manutenzione caldaia', icon: '♨️', rec: 'yearly', cats: ['casa'] },
  { id: 'registro', label: 'Registrazione contratto', icon: '📑', rec: 'yearly', cats: ['casa'] },
  { id: 'telefono', label: 'Telefono', icon: '📱', rec: 'monthly', cats: ['casa', 'altro'] },
  { id: 'abbonamento', label: 'Abbonamento', icon: '🔁', rec: 'monthly', cats: ['altro'] },
  { id: 'salute', label: 'Visita / controllo', icon: '🩺', rec: 'yearly', cats: ['altro'] },
  { id: 'altro', label: 'Altro', icon: '📌', rec: 'none', cats: ['auto', 'casa', 'altro'] },
];
const kindOf = (id) => KINDS.find((k) => k.id === id) || KINDS[KINDS.length - 1];
const kindsFor = (cat, keep) => KINDS.filter((k) => k.cats.includes(cat) || k.id === keep);

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
// interi senza decimali (650 €), altrimenti sempre due decimali (29,90 €)
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

/* ---------- stato ---------- */
const state = {
  tab: 'scadenze', filter: 'all', items: [], deadlines: [],
  user: null, ready: false, offline: !navigator.onLine, loadError: '',
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

const cloudStore = {
  async load() {
    const [a, b] = await Promise.all([
      sb.from('items').select('*').order('created_at'),
      sb.from('deadlines').select('*').order('due_date'),
    ]);
    if (a.error) throw a.error;
    if (b.error) throw b.error;
    const data = { items: a.data, deadlines: b.data.map((x) => ({ ...x, amount: x.amount == null ? null : Number(x.amount) })) };
    try { localStorage.setItem(LS + '.snap.' + state.user.id, JSON.stringify(data)); } catch {}
    return data;
  },
  async insert(t, row) {
    const { data, error } = await sb.from(t).insert(row).select().single();
    if (error) throw error;
    return t === 'deadlines' && data.amount != null ? { ...data, amount: Number(data.amount) } : data;
  },
  async update(t, id, patch) {
    const { data, error } = await sb.from(t).update(patch).eq('id', id).select().single();
    if (error) throw error;
    return t === 'deadlines' && data.amount != null ? { ...data, amount: Number(data.amount) } : data;
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

async function saveItem(id, fields) {
  if (!canWrite()) return null;
  try {
    if (id) {
      const r = await store.update('items', id, fields);
      state.items = state.items.map((x) => (x.id === id ? r : x));
      return r;
    }
    const r = await store.insert('items', fields);
    state.items.push(r);
    return r;
  } catch (e) { fail(e); return null; }
}

async function deleteItem(id) {
  if (!canWrite()) return;
  try {
    await store.remove('items', id);
    state.items = state.items.filter((x) => x.id !== id);
    state.deadlines = state.deadlines.filter((x) => x.item_id !== id);
  } catch (e) { fail(e); }
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
  if (!canWrite()) return;
  try {
    await store.remove('deadlines', id);
    state.deadlines = state.deadlines.filter((x) => x.id !== id);
  } catch (e) { fail(e); }
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
  toast(nextId ? 'Pagata ✓ — ho già messo la prossima in calendario' : 'Pagata ✓', {
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
function occurrences(from, to) {
  const out = [];
  for (const dl of state.deadlines) {
    if (dl.paid) continue;
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

function costSummary() {
  const w = costWindow();
  const occ = occurrences(w.from, w.to).filter((o) => o.dl.amount != null);
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
  const missing = state.deadlines.filter((d) => !d.paid && d.amount == null).length;
  return { total, months: w.months, byItem, byCat, byKind, missing };
}

/* ---------- render ---------- */
const app = $('#app');

function render() {
  if (!state.ready) { app.innerHTML = ''; return; }
  if (MODE === 'cloud' && !state.user) { renderLogin(); updateBadge(); return; }

  const titles = { scadenze: 'Scadenze', costi: 'Costi', elementi: 'Auto e casa' };
  const views = { scadenze: viewDeadlines, costi: viewCosts, elementi: viewItems };
  const banner = state.offline && MODE === 'cloud'
    ? '<div class="banner">Sei offline: vedi l\'ultima copia dei dati. Le modifiche tornano disponibili appena c\'è connessione.</div>'
    : (state.loadError ? `<div class="banner">${esc(state.loadError)}</div>` : '');

  app.innerHTML = `
    <header class="topbar"><div class="wrap">
      <h1>${titles[state.tab]}</h1>
      <button class="icon-btn" data-action="settings" aria-label="Impostazioni">⚙️</button>
    </div></header>
    <main class="wrap">${banner}${views[state.tab]()}</main>
    ${state.tab !== 'elementi' && state.items.length ? '<button class="fab" data-action="new-deadline"><span class="plus">+</span> Scadenza</button>' : ''}
    <nav class="nav"><div class="inner">
      ${navBtn('scadenze', '📅', 'Scadenze')}${navBtn('costi', '💶', 'Costi')}${navBtn('elementi', '🚗', 'Auto e casa')}
    </div></nav>`;
  updateBadge();
}
const navBtn = (id, ico, label) => `<button data-action="tab" data-tab="${id}" class="${state.tab === id ? 'active' : ''}" aria-label="${label}"><span class="ico">${ico}</span>${label}</button>`;

function updateBadge() {
  if (!('setAppBadge' in navigator)) return;
  const today = todayISO();
  const n = state.deadlines.filter((d) => !d.paid && diffDays(today, d.due_date) <= 7).length;
  (n ? navigator.setAppBadge(n) : navigator.clearAppBadge()).catch(() => {});
}

/* --- vista: scadenze --- */
function rowDeadline(dl, opts = {}) {
  const k = kindOf(dl.kind);
  const it = byId(state.items, dl.item_id);
  const u = dl.paid ? '' : urgency(dl.due_date);
  const sub = dl.paid
    ? `Pagata il ${fmtDate(dl.paid_on || dl.due_date)}`
    : `${opts.hideItem ? '' : esc(it?.name || '') + ' · '}${relative(dl.due_date)}`;
  return `
    <div class="row ${dl.paid ? 'done' : ''}" data-action="edit-deadline" data-id="${dl.id}" role="button" tabindex="0">
      <div class="ico">${k.icon}</div>
      <div class="main"><div class="t">${esc(dl.title)}</div><div class="s ${u}">${sub}</div></div>
      <div class="right"><div class="amt">${money(dl.amount)}</div><div class="dt">${fmtShort(dl.due_date)}</div></div>
      ${dl.paid ? '' : `<button class="check" data-action="pay" data-id="${dl.id}" aria-label="Segna come pagata" title="Segna come pagata">✓</button>`}
    </div>`;
}

function viewDeadlines() {
  if (!state.items.length) return emptyStart();
  const today = todayISO();
  const cats = [...new Set(state.items.map((i) => i.category))];
  const inFilter = (dl) => state.filter === 'all' || byId(state.items, dl.item_id)?.category === state.filter;
  const open = state.deadlines.filter((d) => !d.paid && inFilter(d));

  const late = open.filter((d) => d.due_date < today);
  const week = open.filter((d) => d.due_date >= today && diffDays(today, d.due_date) <= 7);
  const month = open.filter((d) => diffDays(today, d.due_date) > 7 && diffDays(today, d.due_date) <= 30);
  const later = open.filter((d) => diffDays(today, d.due_date) > 30);

  const next30 = open.filter((d) => diffDays(today, d.due_date) <= 30);
  const sum30 = next30.reduce((s, d) => s + (Number(d.amount) || 0), 0);

  const chips = cats.length > 1
    ? `<div class="chips">
        <button class="chip ${state.filter === 'all' ? 'active' : ''}" data-action="filter" data-f="all">Tutto</button>
        ${cats.map((c) => `<button class="chip ${state.filter === c ? 'active' : ''}" data-action="filter" data-f="${c}">${CATS[c].icon} ${CATS[c].label}</button>`).join('')}
      </div>` : '';

  const group = (title, arr, cls = '') => arr.length
    ? `<div class="group-title ${cls}">${title}</div><div class="list">${arr.map((d) => rowDeadline(d)).join('')}</div>` : '';

  const hero = `
    <section class="hero">
      <div class="label">Da pagare nei prossimi 30 giorni</div>
      <div class="big">${eurFmt.format(sum30)}</div>
      <div class="sub">${next30.length === 0 ? 'Nessuna scadenza in arrivo 🎉' : next30.length === 1 ? '1 scadenza' : next30.length + ' scadenze'}</div>
      ${late.length ? `<div class="alert">⚠️ ${late.length} ${late.length === 1 ? 'scaduta' : 'scadute'}</div>` : ''}
    </section>`;

  const body = open.length
    ? group('Scadute', late, 'late') + group('Questa settimana', week) + group('Entro 30 giorni', month) + group('Più avanti', later)
    : '<div class="empty"><div class="big-ico">✅</div><h3>Tutto in ordine</h3><p>Non c\'è nessuna scadenza aperta. Aggiungine una con il pulsante in basso.</p></div>';

  return hero + chips + body;
}

function emptyStart() {
  return `
    <div class="empty">
      <div class="big-ico">👋</div>
      <h3>Cominciamo da qui</h3>
      <p>Crea l'auto o la casa di cui vuoi tenere sotto controllo scadenze e spese.</p>
      <div class="quick">
        <button class="btn" data-action="new-item" data-cat="auto">🚗 Aggiungi un'auto</button>
        <button class="btn secondary" data-action="new-item" data-cat="casa">🏠 Aggiungi una casa</button>
        <button class="btn secondary" data-action="new-item" data-cat="altro">📌 Altro</button>
      </div>
    </div>`;
}

/* --- vista: costi --- */
function breakdown(map, labeler, onClickAction) {
  const entries = Object.entries(map).sort((a, b) => b[1] - a[1]);
  const max = entries[0]?.[1] || 1;
  return `<div class="brk">${entries.map(([key, val]) => {
    const l = labeler(key);
    const head = `<span>${l.icon} ${esc(l.name)}</span><b>${eur0.format(val)}</b>`;
    return `<div class="line">
      ${onClickAction ? `<button class="top" data-action="${onClickAction}" data-id="${esc(key)}">${head}</button>` : `<div class="top">${head}</div>`}
      <div class="track"><div class="fill" style="width:${Math.max(3, (val / max) * 100)}%"></div></div>
    </div>`;
  }).join('')}</div>`;
}

function viewCosts() {
  if (!state.items.length) return emptyStart();
  const c = costSummary();
  if (c.total === 0) {
    return `<div class="empty"><div class="big-ico">💶</div><h3>Ancora nessun costo</h3>
      <p>Inserisci l'importo nelle scadenze e qui vedrai quanto spendi ogni mese e ogni anno.</p></div>`;
  }
  const maxM = Math.max(...c.months.map((m) => m.total), 1);
  const bars = c.months.map((m, i) => `
    <div class="col ${i === 0 ? 'now' : ''} ${m.total === 0 ? 'zero' : ''}" title="${m.label}: ${eurFmt.format(m.total)}">
      <div class="v">${m.total ? (m.total >= 1000 ? (m.total / 1000).toFixed(1).replace('.', ',') + 'k' : Math.round(m.total)) : ''}</div>
      <div class="bar" style="height:${Math.max(2, (m.total / maxM) * 100)}px"></div>
      <div class="m">${m.label}</div>
    </div>`).join('');

  return `
    <section class="hero">
      <div class="label">Spesa prevista nei prossimi 12 mesi</div>
      <div class="big">${eur0.format(c.total)}</div>
      <div class="sub">circa ${eur0.format(c.total / 12)} al mese da mettere da parte</div>
    </section>
    <div class="card"><h2>Mese per mese</h2><div class="bars">${bars}</div>
      <div class="legend-note">Importi in euro. Le scadenze non pagate vengono contate nel mese corrente.</div></div>
    <div class="card"><h2>Per categoria</h2>${breakdown(c.byCat, (k) => ({ icon: CATS[k]?.icon || '📌', name: CATS[k]?.label || k }))}</div>
    <div class="card"><h2>Per auto / casa</h2>${breakdown(c.byItem, (k) => { const it = byId(state.items, k); return { icon: CATS[it?.category]?.icon || '📌', name: it?.name || '—' }; }, 'open-item')}</div>
    <div class="card"><h2>Per tipo di spesa</h2>${breakdown(c.byKind, (k) => { const kd = kindOf(k); return { icon: kd.icon, name: kd.label }; })}</div>
    ${c.missing ? `<p class="hint">ℹ️ ${c.missing} ${c.missing === 1 ? 'scadenza non ha' : 'scadenze non hanno'} un importo e ${c.missing === 1 ? 'non è inclusa' : 'non sono incluse'} nei conteggi.</p>` : ''}`;
}

/* --- vista: elementi --- */
function viewItems() {
  if (!state.items.length) return emptyStart();
  const w = costWindow();
  const occ = occurrences(w.from, w.to);
  const cards = state.items.map((it) => {
    const own = state.deadlines.filter((d) => d.item_id === it.id && !d.paid);
    const next = own[0];
    const yearly = occ.filter((o) => o.dl.item_id === it.id && o.dl.amount != null).reduce((s, o) => s + Number(o.dl.amount), 0);
    const u = next ? urgency(next.due_date) : '';
    return `
      <button class="row" data-action="open-item" data-id="${it.id}">
        <div class="ico">${CATS[it.category]?.icon || '📌'}</div>
        <div class="main"><div class="t">${esc(it.name)}</div>
          <div class="s ${u}">${next ? `Prossima: ${esc(next.title)} · ${relative(next.due_date)}` : 'Nessuna scadenza'}</div></div>
        <div class="right"><div class="amt">${yearly ? eur0.format(yearly) : ''}</div><div class="dt">${yearly ? 'in 12 mesi' : ''}</div></div>
      </button>`;
  }).join('');
  return `<div class="list" style="margin-top:8px">${cards}</div>
    <div class="actions"><button class="btn secondary" data-action="new-item">+ Aggiungi auto o casa</button></div>`;
}

/* ---------- accesso (solo modalità cloud) ---------- */
function renderLogin() {
  app.innerHTML = `
    <div class="login">
      <img class="logo" src="icons/icon-192.png" alt="">
      <h1>Scadenziario</h1>
      <p class="lead">Accedi per vedere le tue scadenze</p>
      <form id="login-form">
        <label>Email<input type="email" name="email" autocomplete="email" required></label>
        <label>Password<input type="password" name="password" autocomplete="current-password" required></label>
        <p class="err" id="login-err"></p>
        <button class="btn" type="submit">Accedi</button>
      </form>
    </div>`;
}

/* ---------- sheet (finestre dal basso) ---------- */
const sheetRoot = $('#sheet-root');
function openSheet(title, body) {
  sheetRoot.innerHTML = `
    <div class="overlay" data-action="close-sheet"></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="grab"></div>
      <div class="head"><h2>${esc(title)}</h2><button class="icon-btn" data-action="close-sheet" aria-label="Chiudi">✕</button></div>
      ${body}
    </div>`;
  document.body.style.overflow = 'hidden';
}
function closeSheet() { sheetRoot.innerHTML = ''; document.body.style.overflow = ''; }

/* --- form scadenza --- */
function openDeadlineForm(id, presetItem) {
  if (!state.items.length) { openItemForm(null, 'auto'); return; }
  const dl = id ? byId(state.deadlines, id) : null;
  const itemId = dl?.item_id || presetItem || state.items[0].id;
  const item = byId(state.items, itemId);
  const kind = dl?.kind || kindsFor(item.category)[0].id;
  const k = kindOf(kind);

  const itemOpts = state.items.map((i) => `<option value="${i.id}" ${i.id === itemId ? 'selected' : ''}>${CATS[i.category]?.icon || ''} ${esc(i.name)}</option>`).join('');
  const recOpts = Object.entries(REC).map(([v, r]) => `<option value="${v}" ${(dl?.recurrence || k.rec) === v ? 'selected' : ''}>${r.label}</option>`).join('');

  openSheet(dl ? 'Modifica scadenza' : 'Nuova scadenza', `
    <form id="dl-form" data-id="${dl?.id || ''}">
      ${dl ? '' : `
      <details class="paste">
        <summary>📋 Incolla il testo di un'email</summary>
        <textarea id="paste-text" rows="4" placeholder="Incolla qui l'email dell'assicurazione, della bolletta, del bollo…"></textarea>
        <button type="button" class="btn small" data-action="parse-paste">Compila i campi per me</button>
        <p>Cerco io data di scadenza, importo e tipo. Controlla sempre prima di salvare.</p>
      </details>`}
      <label>Auto o casa<select name="item_id">${itemOpts}</select></label>
      <label>Cosa<select name="kind">${kindOptions(item.category, kind)}</select></label>
      <label>Nome<input name="title" value="${esc(dl?.title || k.label)}" required></label>
      <div class="row2">
        <label>Scadenza<input type="date" name="due_date" required value="${dl?.due_date || ''}"></label>
        <label>Importo (€)<input type="number" name="amount" step="0.01" min="0" inputmode="decimal" placeholder="facoltativo" value="${dl?.amount ?? ''}"></label>
      </div>
      <label>Si ripete<select name="recurrence">${recOpts}</select></label>
      <label>Note<textarea name="note" rows="2" placeholder="Numero polizza, contratto…">${esc(dl?.note || '')}</textarea></label>
      <div class="actions">
        <button class="btn" type="submit">Salva</button>
        ${dl ? `<button type="button" class="btn secondary" data-action="${dl.paid ? 'reopen-form' : 'pay-form'}" data-id="${dl.id}">${dl.paid ? 'Riapri (non pagata)' : '✓ Segna come pagata'}</button>
        <button type="button" class="btn danger" data-action="delete-deadline" data-id="${dl.id}">Elimina</button>` : ''}
      </div>
    </form>`);
  const form = $('#dl-form');
  form.dataset.lastKindLabel = k.label;
  if (!dl) setTimeout(() => form.elements.due_date.focus({ preventScroll: true }), 50);
}
const kindOptions = (cat, sel) => kindsFor(cat, sel).map((x) => `<option value="${x.id}" ${x.id === sel ? 'selected' : ''}>${x.icon} ${x.label}</option>`).join('');

function onDeadlineFormChange(e) {
  const form = e.target.closest('#dl-form');
  if (!form) return;
  const f = form.elements;
  if (e.target.name === 'item_id') {
    const cat = byId(state.items, f.item_id.value)?.category || 'altro';
    const cur = f.kind.value;
    const list = kindsFor(cat);
    const keep = list.some((x) => x.id === cur) ? cur : list[0].id;
    f.kind.innerHTML = kindOptions(cat, keep);
    applyKind(form, keep);
  } else if (e.target.name === 'kind') {
    applyKind(form, f.kind.value);
  }
}
function applyKind(form, kindId) {
  const f = form.elements; const k = kindOf(kindId);
  if (!form.dataset.id) f.recurrence.value = k.rec;
  if (!f.title.value || f.title.value === form.dataset.lastKindLabel) f.title.value = k.label;
  form.dataset.lastKindLabel = k.label;
}

async function onDeadlineSubmit(form) {
  const f = form.elements; const id = form.dataset.id || null;
  const amount = f.amount.value === '' ? null : Number(f.amount.value);
  const fields = {
    item_id: f.item_id.value, kind: f.kind.value, title: f.title.value.trim() || kindOf(f.kind.value).label,
    due_date: f.due_date.value, amount, recurrence: f.recurrence.value, note: f.note.value.trim() || null,
  };
  if (!fields.due_date) { toast('Manca la data di scadenza'); return; }
  if (!id) { fields.paid = false; }
  const ok = await saveDeadline(id, fields);
  if (ok) { closeSheet(); render(); toast(id ? 'Salvato ✓' : 'Scadenza aggiunta ✓'); }
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

  // date
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

  // importi
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
  if (!text.trim()) { toast('Incolla prima il testo dell\'email'); return; }
  const r = parseEmailText(text);
  const f = form.elements;
  const found = [];
  if (r.kind) {
    const cat = byId(state.items, f.item_id.value)?.category || 'altro';
    f.kind.innerHTML = kindOptions(cat, r.kind);
    f.kind.value = r.kind;
    form.dataset.lastKindLabel = '';
    f.title.value = '';
    applyKind(form, r.kind);
    found.push(kindOf(r.kind).label);
  }
  if (r.due_date) { f.due_date.value = r.due_date; found.push('scadenza ' + fmtDate(r.due_date)); }
  if (r.amount != null) { f.amount.value = r.amount; found.push(money(r.amount)); }
  toast(found.length ? 'Ho trovato: ' + found.join(', ') + '. Controlla i dati.' : 'Non ho trovato date o importi: compila a mano.');
  if (found.length) $('details.paste').open = false;
}

/* --- form elemento --- */
function openItemForm(id, presetCat) {
  const it = id ? byId(state.items, id) : null;
  const cat = it?.category || presetCat || 'auto';
  const ph = { auto: 'es. Fiat Panda', casa: 'es. Appartamento in affitto', altro: 'es. Abbonamenti' };
  openSheet(it ? 'Modifica' : 'Nuovo elemento', `
    <form id="item-form" data-id="${it?.id || ''}">
      <div class="seg">
        ${Object.entries(CATS).map(([k, c]) => `<input type="radio" name="category" id="c-${k}" value="${k}" ${k === cat ? 'checked' : ''}><label for="c-${k}">${c.icon} ${c.label}</label>`).join('')}
      </div>
      <label>Nome<input name="name" required value="${esc(it?.name || '')}" placeholder="${ph[cat]}"></label>
      <label>Note<textarea name="note" rows="2" placeholder="Targa, indirizzo, proprietario…">${esc(it?.note || '')}</textarea></label>
      <div class="actions">
        <button class="btn" type="submit">Salva</button>
        ${it ? `<button type="button" class="btn danger" data-action="delete-item" data-id="${it.id}">Elimina (con tutte le sue scadenze)</button>` : ''}
      </div>
    </form>`);
  if (!it) setTimeout(() => $('#item-form').elements.name.focus({ preventScroll: true }), 50);
}

async function onItemSubmit(form) {
  const f = form.elements; const id = form.dataset.id || null;
  const r = await saveItem(id, { category: f.category.value, name: f.name.value.trim(), note: f.note.value.trim() || null });
  if (!r) return;
  closeSheet(); render();
  if (!id) { toast('Aggiunto ✓ — ora inserisci le sue scadenze'); openDeadlineForm(null, r.id); }
}

/* --- dettaglio elemento --- */
function openItemDetail(id) {
  const it = byId(state.items, id);
  if (!it) return;
  const w = costWindow();
  const yearly = occurrences(w.from, w.to).filter((o) => o.dl.item_id === id && o.dl.amount != null).reduce((s, o) => s + Number(o.dl.amount), 0);
  const open = state.deadlines.filter((d) => d.item_id === id && !d.paid);
  const paid = state.deadlines.filter((d) => d.item_id === id && d.paid).sort((a, b) => (b.paid_on || '').localeCompare(a.paid_on || '')).slice(0, 8);
  openSheet(`${CATS[it.category]?.icon || ''} ${it.name}`, `
    ${it.note ? `<p class="hint" style="margin-top:-6px">${esc(it.note)}</p>` : ''}
    <div class="card" style="box-shadow:none;background:var(--bg);padding:6px 14px">
      <div class="stat-row"><span>Spesa prevista, 12 mesi</span><b>${eur0.format(yearly)}</b></div>
      <div class="stat-row"><span>Al mese, in media</span><b>${eur0.format(yearly / 12)}</b></div>
    </div>
    <div class="group-title" style="margin-top:10px">Da pagare</div>
    ${open.length ? `<div class="list" style="box-shadow:none;border:1px solid var(--line)">${open.map((d) => rowDeadline(d, { hideItem: true })).join('')}</div>` : '<p class="hint">Nessuna scadenza aperta.</p>'}
    ${paid.length ? `<div class="group-title">Pagate di recente</div><div class="list" style="box-shadow:none;border:1px solid var(--line)">${paid.map((d) => rowDeadline(d, { hideItem: true })).join('')}</div>` : ''}
    <div class="actions">
      <button class="btn" data-action="new-deadline" data-item="${id}">+ Aggiungi scadenza</button>
      <button class="btn secondary" data-action="edit-item" data-id="${id}">Modifica nome o categoria</button>
    </div>`);
}

/* --- impostazioni --- */
function openSettings() {
  const open = state.deadlines.filter((d) => !d.paid).length;
  openSheet('Impostazioni', `
    ${MODE === 'cloud'
      ? `<div class="card" style="box-shadow:none;background:var(--bg)"><div class="stat-row"><span>Account</span><b>${esc(state.user?.email || '')}</b></div>
         <div class="stat-row"><span>Dati</span><b>sincronizzati ☁️</b></div></div>`
      : `<div class="banner">Modalità locale: i dati restano solo su questo dispositivo. Per averli su telefono e computer collega Supabase (vedi la guida).</div>`}
    <div class="actions" style="margin-top:6px">
      <button class="btn secondary" data-action="export-ics" ${open ? '' : 'disabled'}>📆 Esporta nel calendario (.ics)</button>
      <p class="hint" style="margin:-4px 2px 4px">Aggiunge le scadenze ad Apple/Google Calendar con un promemoria 7 giorni e 1 giorno prima.</p>
      <button class="btn secondary" data-action="export-json">💾 Scarica una copia dei dati</button>
      <label class="btn secondary" style="margin:0;text-align:center;cursor:pointer">📥 Importa una copia dei dati
        <input type="file" id="import-file" accept="application/json,.json" hidden></label>
      ${MODE === 'cloud' ? '<button class="btn danger" data-action="logout">Esci</button>' : ''}
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
    const start = d.due_date.replace(/-/g, '');
    const end = addMonths(d.due_date, 0); const e = fromISO(end); e.setDate(e.getDate() + 1);
    const summary = `${d.title}${it ? ' – ' + it.name : ''}${d.amount != null ? ' (' + money(d.amount) + ')' : ''}`;
    lines.push('BEGIN:VEVENT', `UID:${d.id}@scadenziario`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${start}`, `DTEND;VALUE=DATE:${toISO(e).replace(/-/g, '')}`,
      `SUMMARY:${esc2(summary)}`);
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
      const r = await store.insert('items', { category: it.category, name: it.name, note: it.note || null });
      map[it.id] = r.id; state.items.push(r);
    }
    for (const d of data.deadlines) {
      if (!map[d.item_id]) continue;
      state.deadlines.push(await store.insert('deadlines', {
        item_id: map[d.item_id], kind: d.kind, title: d.title, due_date: d.due_date, amount: d.amount ?? null,
        recurrence: d.recurrence || 'none', paid: !!d.paid, paid_on: d.paid_on || null, note: d.note || null,
      }));
    }
    sortDeadlines(); closeSheet(); render();
    toast(`Importati ${data.items.length} elementi e ${data.deadlines.length} scadenze ✓`);
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

/* ---------- eventi ---------- */
document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action; const id = el.dataset.id;

  if (a === 'pay') { e.stopPropagation(); markPaid(id); return; }
  switch (a) {
    case 'tab': state.tab = el.dataset.tab; render(); window.scrollTo(0, 0); break;
    case 'filter': state.filter = el.dataset.f; render(); break;
    case 'new-deadline': openDeadlineForm(null, el.dataset.item); break;
    case 'edit-deadline': openDeadlineForm(id); break;
    case 'new-item': openItemForm(null, el.dataset.cat); break;
    case 'edit-item': openItemForm(id); break;
    case 'open-item': openItemDetail(id); break;
    case 'settings': openSettings(); break;
    case 'close-sheet': closeSheet(); break;
    case 'parse-paste': applyPaste($('#dl-form')); break;
    case 'pay-form': closeSheet(); markPaid(id); break;
    case 'reopen-form': closeSheet(); reopen(id); break;
    case 'delete-deadline':
      if (confirm('Eliminare questa scadenza?')) { await deleteDeadline(id); closeSheet(); render(); toast('Eliminata'); }
      break;
    case 'delete-item': {
      const it = byId(state.items, id);
      if (confirm(`Eliminare "${it?.name}" e tutte le sue scadenze? Non si può annullare.`)) { await deleteItem(id); closeSheet(); render(); toast('Eliminato'); }
      break;
    }
    case 'export-ics': exportICS(); break;
    case 'export-json': download('scadenziario-backup.json', 'application/json', JSON.stringify({ items: state.items, deadlines: state.deadlines }, null, 2)); break;
    case 'logout': if (sb) { await sb.auth.signOut(); } closeSheet(); state.user = null; state.items = []; state.deadlines = []; render(); break;
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeSheet();
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
    if (form.id === 'dl-form') await onDeadlineSubmit(form);
    else if (form.id === 'item-form') await onItemSubmit(form);
    else if (form.id === 'login-form') await doLogin(form);
  } finally { if (btn && btn.isConnected) btn.disabled = false; }
});

window.addEventListener('online', () => { state.offline = false; if (MODE === 'cloud' && state.user) loadData(); });
window.addEventListener('offline', () => { state.offline = true; render(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && state.ready) { if (MODE === 'cloud' && state.user && !state.offline) loadData(); else render(); } });

/* ---------- avvio ---------- */
async function doLogin(form) {
  const err = $('#login-err'); err.textContent = '';
  const { data, error } = await sb.auth.signInWithPassword({ email: form.elements.email.value.trim(), password: form.elements.password.value });
  if (error) { err.textContent = 'Email o password non corretti.'; return; }
  state.user = data.user;
  await loadData();
}

async function loadData() {
  try {
    const d = await store.load();
    state.items = d.items; state.deadlines = d.deadlines; sortDeadlines();
    state.loadError = ''; state.offline = false;
  } catch (e) {
    console.error(e);
    const snap = state.user && localStorage.getItem(LS + '.snap.' + state.user.id);
    if (snap) { const d = JSON.parse(snap); state.items = d.items; state.deadlines = d.deadlines; state.offline = true; }
    else state.loadError = 'Non riesco a caricare i dati. Controlla la connessione.';
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
  if (MODE === 'local') {
    state.ready = true;
    await loadData();
    return;
  }
  try {
    await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2');
    sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true } });
  } catch {
    state.ready = true; state.loadError = 'Non riesco a caricare i componenti. Riprova con la connessione attiva.';
    app.innerHTML = `<div class="login"><div class="banner">${esc(state.loadError)}</div></div>`;
    return;
  }
  const { data } = await sb.auth.getSession();
  state.user = data.session?.user || null;
  sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') { state.user = null; render(); } });
  state.ready = true;
  if (state.user) await loadData(); else render();
}

init();

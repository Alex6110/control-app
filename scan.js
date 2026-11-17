/* Lettura dei turni da una foto del prospetto mensile — tutto nel telefono, niente viene inviato.
 *
 * 1. Tocchi i 4 angoli della tabella  -> la foto viene raddrizzata
 * 2. Il programma trova le colonne dei giorni e le righe della tabella
 * 3. Tocchi la riga della persona (si vede il nome)
 * 4. Ogni casella viene letta da una piccola rete neurale (modello in scanmodel.js)
 * 5. Controlli le sigle, correggi i dubbi, e le porti nel calendario
 */
(function () {
  'use strict';
  const CW = 46, CH = 17, FW = 38, FH = 16, TH = 12;      // devono coincidere con l'addestramento (feats.py)
  const WARP_W = 2400;
  const DOUBT = 0.9;                                       // sotto questa sicurezza la casella è «da controllare»

  /* ---------- rete neurale ---------- */
  let net = null;
  function f32(b64) { const s = atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return new Float32Array(u.buffer); }
  function loadNet() {
    if (net) return net;
    const M = window.SCAN_MODEL; if (!M) throw new Error('modello mancante');
    net = { w1: f32(M.w1), b1: f32(M.b1), w2: f32(M.w2), b2: f32(M.b2), nin: M.nin, nh: M.nh, classes: M.classes, nc: M.classes.length };
    return net;
  }
  function classify(x) {
    const n = loadNet(), h = new Float64Array(n.nh);
    for (let j = 0; j < n.nh; j++) h[j] = n.b1[j];
    for (let i = 0; i < n.nin; i++) { const v = x[i]; if (v === 0) continue; const o = i * n.nh; for (let j = 0; j < n.nh; j++) h[j] += v * n.w1[o + j]; }
    for (let j = 0; j < n.nh; j++) if (h[j] < 0) h[j] = 0;
    const o = new Float64Array(n.nc);
    for (let k = 0; k < n.nc; k++) o[k] = n.b2[k];
    for (let j = 0; j < n.nh; j++) { const v = h[j]; if (v === 0) continue; for (let k = 0; k < n.nc; k++) o[k] += v * n.w2[j * n.nc + k]; }
    let mx = -1e9; for (let k = 0; k < n.nc; k++) if (o[k] > mx) mx = o[k];
    let sum = 0; for (let k = 0; k < n.nc; k++) { o[k] = Math.exp(o[k] - mx); sum += o[k]; }
    let best = 0; for (let k = 0; k < n.nc; k++) { o[k] /= sum; if (o[k] > o[best]) best = k; }
    return { code: n.classes[best], p: o[best], probs: o };
  }

  /* ---------- caratteristiche di una casella (come in Python) ---------- */
  const wcache = new Map();
  function wmat(src, dst) {
    const key = src + '_' + dst; if (wcache.has(key)) return wcache.get(key);
    const s = src / dst, rows = [];
    for (let i = 0; i < dst; i++) {
      const a = i * s, b = (i + 1) * s, j0 = Math.floor(a), j1 = Math.min(src, Math.ceil(b)); const w = []; let sum = 0;
      for (let j = j0; j < j1; j++) { const o = Math.max(0, Math.min(b, j + 1) - Math.max(a, j)); w.push(o); sum += o; }
      rows.push({ j0, w: w.map((x) => x / sum) });
    }
    wcache.set(key, rows); return rows;
  }
  function areaResize(a, w, h, ow, oh) {
    const wx = wmat(w, ow), wy = wmat(h, oh), tmp = new Float64Array(h * ow), out = new Float64Array(oh * ow);
    for (let y = 0; y < h; y++) for (let i = 0; i < ow; i++) { const r = wx[i]; let s = 0; for (let k = 0; k < r.w.length; k++) s += a[y * w + r.j0 + k] * r.w[k]; tmp[y * ow + i] = s; }
    for (let j = 0; j < oh; j++) { const r = wy[j]; for (let i = 0; i < ow; i++) { let s = 0; for (let k = 0; k < r.w.length; k++) s += tmp[(r.j0 + k) * ow + i] * r.w[k]; out[j * ow + i] = s; } }
    return out;
  }
  function features(g0, w, h) {
    const g = areaResize(g0, w, h, CW, CH), n = g.length;
    const s = Array.from(g).sort((a, b) => a - b);
    const bg = n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2, dark = s[Math.floor(n * 0.03)], rng = Math.max(bg - dark, 25);
    const d = new Float64Array(n);
    for (let i = 0; i < n; i++) { const v = (bg - g[i]) / rng; d[i] = v < 0 ? 0 : v > 1 ? 1 : v; }
    for (let y = 0; y < CH; y++) { d[y * CW] = 0; d[y * CW + 1] = 0; d[y * CW + CW - 1] = 0; d[y * CW + CW - 2] = 0; }
    for (let x = 0; x < CW; x++) { d[x] = 0; d[(CH - 1) * CW + x] = 0; }
    const m = new Uint8Array(n); for (let i = 0; i < n; i++) m[i] = d[i] > 0.4 ? 1 : 0;
    const colfill = new Float64Array(CW), rowfill = new Float64Array(CH);
    for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) if (m[y * CW + x]) { colfill[x] += 1 / CH; rowfill[y] += 1 / CW; }
    for (let x = 0; x < CW; x++) if (colfill[x] > 0.8) for (let y = 0; y < CH; y++) m[y * CW + x] = 0;
    for (let y = 0; y < CH; y++) if (rowfill[y] > 0.85) for (let x = 0; x < CW; x++) m[y * CW + x] = 0;
    let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1, cnt = 0;
    for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) if (m[y * CW + x]) { cnt++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const out = new Float32Array(FW * FH);
    if (cnt < 12 || y1 - y0 < 3) return out;
    const w2 = x1 - x0 + 1, h2 = y1 - y0 + 1, c = new Float64Array(w2 * h2);
    for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) c[y * w2 + x] = d[(y0 + y) * CW + x0 + x] * m[(y0 + y) * CW + x0 + x];
    const nw = Math.min(FW - 2, Math.max(2, Math.round(w2 * TH / h2)));
    const c2 = areaResize(c, w2, h2, nw, TH), ox = Math.floor((FW - nw) / 2);
    for (let y = 0; y < TH; y++) for (let x = 0; x < nw; x++) out[(2 + y) * FW + ox + x] = c2[y * nw + x];
    return out;
  }

  /* ---------- raddrizzamento ---------- */
  function solve(A, b) {                      // eliminazione di Gauss 8x8
    const n = b.length;
    for (let i = 0; i < n; i++) {
      let p = i; for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
      [A[i], A[p]] = [A[p], A[i]]; [b[i], b[p]] = [b[p], b[i]];
      for (let r = i + 1; r < n; r++) { const f = A[r][i] / A[i][i]; for (let c = i; c < n; c++) A[r][c] -= f * A[i][c]; b[r] -= f * b[i]; }
    }
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) { let s = b[i]; for (let c = i + 1; c < n; c++) s -= A[i][c] * x[c]; x[i] = s / A[i][i]; }
    return x;
  }
  function homography(dst, src) {              // dst (u,v) -> src (x,y)
    const A = [], b = [];
    for (let i = 0; i < 4; i++) {
      const [u, v] = dst[i], [x, y] = src[i];
      A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]); b.push(x);
      A.push([0, 0, 0, u, v, 1, -u * y, -v * y]); b.push(y);
    }
    return solve(A, b);
  }
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  function warpSize() { return [WARP_W, 1180]; }          // stesse proporzioni usate nell'addestramento
  function warpGray(gray, sw, sh, corners) {   // corners: TL, TR, BR, BL in coordinate della foto
    const [W, H] = warpSize();
    const h = homography([[0, 0], [W, 0], [W, H], [0, H]], corners), out = new Uint8Array(W * H);
    for (let v = 0; v < H; v++) for (let u = 0; u < W; u++) {
      const z = h[6] * u + h[7] * v + 1, x = (h[0] * u + h[1] * v + h[2]) / z, y = (h[3] * u + h[4] * v + h[5]) / z;
      if (x < 0 || y < 0 || x >= sw - 1 || y >= sh - 1) { out[v * W + u] = 255; continue; }
      const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, i = y0 * sw + x0;
      out[v * W + u] = (gray[i] * (1 - fx) + gray[i + 1] * fx) * (1 - fy) + (gray[i + sw] * (1 - fx) + gray[i + sw + 1] * fx) * fy;
    }
    return { g: out, W, H };
  }

  /* ---------- linee della tabella ---------- */
  function inkMask(g, W, H) {                  // soglia adattiva (finestra 31, scarto 12)
    const S = W + 1, I = new Float64Array(S * (H + 1));
    for (let y = 0; y < H; y++) { let row = 0; for (let x = 0; x < W; x++) { row += g[y * W + x]; I[(y + 1) * S + x + 1] = I[y * S + x + 1] + row; } }
    const m = new Uint8Array(W * H), r = 15;
    for (let y = 0; y < H; y++) {
      const ya = Math.max(0, y - r), yb = Math.min(H - 1, y + r);
      for (let x = 0; x < W; x++) {
        const xa = Math.max(0, x - r), xb = Math.min(W - 1, x + r);
        const sum = I[(yb + 1) * S + xb + 1] - I[ya * S + xb + 1] - I[(yb + 1) * S + xa] + I[ya * S + xa];
        m[y * W + x] = g[y * W + x] <= sum / ((xb - xa + 1) * (yb - ya + 1)) - 12 ? 1 : 0;
      }
    }
    return m;
  }
  function runs(m, W, H, minLen, vertical) {   // tiene solo i segmenti lunghi (le linee)
    const out = new Uint8Array(W * H), A = vertical ? W : H, B = vertical ? H : W;
    for (let a = 0; a < A; a++) {
      let b = 0;
      while (b < B) {
        const at = (k) => (vertical ? k * W + a : a * W + k);
        if (m[at(b)]) { let e = b; while (e < B && m[at(e)]) e++; if (e - b >= minLen) for (let k = b; k < e; k++) out[at(k)] = 1; b = e; } else b++;
      }
    }
    return out;
  }
  function peaks(prof, thr, gap) {
    const out = []; let cur = null;
    for (let i = 0; i < prof.length; i++) {
      if (prof[i] > thr) { if (cur && i - cur[cur.length - 1] <= gap) cur.push(i); else { cur = [i]; out.push(cur); } }
    }
    return out.map((c) => Math.floor(c.reduce((a, b) => a + b, 0) / c.length));
  }
  function geometry(wg, n) {
    const { g, W, H } = wg, ink = inkMask(g, W, H), v = runs(ink, W, H, 18, true), hm = runs(ink, W, H, 22, false);
    const y0 = Math.round(H * 0.05), y1 = Math.round(H * 0.85), prof = new Float64Array(W);
    for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) prof[x] += v[y * W + x];
    const xs = peaks(prof, (y1 - y0) * 0.10, 3);
    // reticolo regolare: la posizione 'x0' del centro del 1° giorno e la larghezza 'dx' che si appoggiano al maggior numero di linee
    // la 1ª linea dopo le colonne dei nomi (grande spazio vuoto) è il bordo sinistro del giorno 1
    const first = xs.find((x) => x >= 0.17 * W);
    if (first === undefined) throw new Error('non trovo la tabella dei giorni');
    let best = null;
    for (let dx = 0.55 * W / n; dx <= 0.85 * W / n; dx += 0.25) {
      for (let x0 = first + 0.5 * dx - 4; x0 <= first + 0.5 * dx + 4; x0 += 1) {
        let score = 0, err = 0;
        for (let k = 0; k <= n; k++) {
          const e = x0 + (k - 0.5) * dx; let bd = 99; for (let q = 0; q < xs.length; q++) { const d = Math.abs(xs[q] - e); if (d < bd) bd = d; }
          if (bd <= 5) { score++; err += bd; }
        }
        if (!best || score > best.score || (score === best.score && err < best.err)) best = { score, err, x0, dx };
      }
    }
    const bounds = [];
    for (let k = 0; k <= n; k++) {
      const e = best.x0 + (k - 0.5) * best.dx; let b = e, bd = 12;
      for (let q = 0; q < xs.length; q++) { const d = Math.abs(xs[q] - e); if (d < bd) { bd = d; b = xs[q]; } }
      bounds.push(Math.round(b));
    }
    const span = bounds[n] - bounds[0], hp = new Float64Array(H);
    for (let y = 0; y < H; y++) { let s = 0; for (let x = bounds[0]; x < bounds[n]; x++) s += hm[y * W + x]; hp[y] = s; }
    const ys = peaks(hp, span * 0.25, 4);
    return { W, H, g, hm, bounds, ys, fit: best };
  }
  function pickBand(geo, y) {                  // la riga della tabella che contiene il punto y
    const ys = geo.ys;
    for (let i = 0; i < ys.length - 1; i++) if (ys[i] <= y && y < ys[i + 1] && ys[i + 1] - ys[i] >= 12 && ys[i + 1] - ys[i] <= 45) return [ys[i], ys[i + 1]];
    return [Math.round(y - 11), Math.round(y + 11)];
  }
  function snapBand(geo, xl, xr, top, bot, tol) {
    const { hm, W, H } = geo, prof = new Float64Array(H);
    for (let y = Math.max(0, top - tol - 1); y < Math.min(H, bot + tol + 2); y++) { let s = 0; for (let x = xl; x < xr; x++) s += hm[y * W + x]; prof[y] = s; }
    const snap = (yy) => {
      let bi = -1, bv = -1; for (let y = Math.max(0, Math.round(yy) - tol); y <= Math.min(H - 1, Math.round(yy) + tol); y++) if (prof[y] > bv) { bv = prof[y]; bi = y; }
      return bv < (xr - xl) * 0.4 ? Math.round(yy) : bi;
    };
    return [snap(top), snap(bot)];
  }
  /* legge le n caselle di una riga */
  function readRow(geo, band, n) {
    const cells = [], res = [];
    for (let k = 0; k < n; k++) {
      const xl = geo.bounds[k], xr = geo.bounds[k + 1], [a, b] = snapBand(geo, xl + 3, xr - 3, band[0], band[1], 13);
      const x0 = xl + 4, x1 = xr - 3, y0 = a + 3, y1 = b - 2, w = x1 - x0, h = y1 - y0;
      if (w < 8 || h < 6) { cells.push(null); res.push({ code: '-', p: 0, empty: true }); continue; }
      const c = new Float64Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) c[y * w + x] = geo.g[(y0 + y) * geo.W + x0 + x];
      cells.push({ g: c, w, h });
      res.push(classify(features(c, w, h)));
    }
    return { cells, res };
  }
  /* foto -> grigio */
  function toGray(rgba, w, h) { const g = new Uint8Array(w * h); for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = rgba[j] * 0.299 + rgba[j + 1] * 0.587 + rgba[j + 2] * 0.114; return g; }

  /* =================== schermate =================== */
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const CORNERS = ['in alto a sinistra', 'in alto a destra', 'in basso a destra', 'in basso a sinistra'];
  const CORNER_HELP = ['la colonna «Matricola», sopra i nomi', 'la colonna «Totale ore», sopra', 'l\'ultima riga della tabella, a destra', 'l\'ultima riga della tabella, a sinistra'];
  let S = null;

  function open(opts) {
    close();
    S = { opts, step: 'pick', img: null, coarse: [], fine: [], n: opts.n };
    const root = document.createElement('div'); root.id = 'scan'; root.className = 'scan'; document.body.appendChild(root);
    document.body.style.overflow = 'hidden'; render();
  }
  function close() { const r = $('#scan'); if (r) r.remove(); document.body.style.overflow = ''; S = null; }

  function head(title, sub) {
    return `<div class="scan-head"><button class="scan-x" data-sc="close" aria-label="Chiudi">✕</button><div><h2>${esc(title)}</h2>${sub ? `<p>${sub}</p>` : ''}</div></div>`;
  }
  function render() {
    const r = $('#scan'); if (!r || !S) return;
    if (S.step === 'pick') {
      r.innerHTML = head('Leggi dalla foto', 'Scegli la foto del prospetto mensile. La foto resta sul telefono: non viene inviata a nessuno.') + `
        <div class="scan-body">
          <label class="scan-btn big">Scegli o scatta la foto<input id="scan-file" type="file" accept="image/*" hidden></label>
          <p class="scan-hint">Consigli: tutta la tabella dentro la foto, ben illuminata, senza riflessi. Poi toccherai i 4 angoli e la riga della persona.</p>
          <p class="scan-hint" id="scan-msg"></p>
        </div>`;
    } else if (S.step === 'coarse') {
      const i = S.coarse.length;
      r.innerHTML = head(`Angolo ${i + 1} di 4`, `Tocca l'angolo della tabella <b>${CORNERS[i]}</b>: ${CORNER_HELP[i]}.`) + `<div class="scan-body"><canvas id="scan-cv" class="scan-cv"></canvas>${i ? '<button class="scan-btn" data-sc="undo">Annulla l\'ultimo tocco</button>' : ''}</div>`;
      drawCoarse();
    } else if (S.step === 'fine') {
      const i = S.fine.length;
      r.innerHTML = head(`Angolo ${i + 1} di 4, più preciso`, `Ora tocca <b>esattamente</b> l'angolo ${CORNERS[i]}. La croce indica dove avevi toccato.`) + `<div class="scan-body"><canvas id="scan-cv" class="scan-cv"></canvas><button class="scan-btn" data-sc="skipfine">Va bene dov'è la croce</button></div>`;
      drawFine();
    } else if (S.step === 'busy') {
      r.innerHTML = head('Elaboro…', '') + '<div class="scan-body"><p class="scan-hint">Raddrizzo la foto e cerco la tabella…</p></div>';
    } else if (S.step === 'row') {
      r.innerHTML = head('Scegli la riga', 'Scorri e tocca la riga con il <b>nome della persona</b>. Si evidenzia in giallo.') + `<div class="scan-body"><div class="scan-names"><canvas id="scan-cv" class="scan-cv"></canvas></div>
        <div class="scan-bar"><button class="scan-btn" data-sc="redo">Rifai gli angoli</button><button class="scan-btn pri" data-sc="read" ${S.band ? '' : 'disabled'}>Leggi questa riga</button></div></div>`;
      drawNames();
    } else if (S.step === 'result') {
      renderResult(r);
    }
  }

  function drawCoarse() {
    const cv = $('#scan-cv'), im = S.img, k = Math.min(1, 1000 / im.w); cv.width = Math.round(im.w * k); cv.height = Math.round(im.h * k);
    const c = cv.getContext('2d'); c.drawImage(im.canvas, 0, 0, cv.width, cv.height);
    c.lineWidth = 3; c.strokeStyle = '#ffd400'; c.fillStyle = '#ffd400';
    S.coarse.forEach((p, i) => { c.beginPath(); c.arc(p[0] * k, p[1] * k, 9, 0, 7); c.fill(); if (i) { c.beginPath(); c.moveTo(S.coarse[i - 1][0] * k, S.coarse[i - 1][1] * k); c.lineTo(p[0] * k, p[1] * k); c.stroke(); } });
    cv.onclick = (e) => { const b = cv.getBoundingClientRect(); S.coarse.push([(e.clientX - b.left) * cv.width / b.width / k, (e.clientY - b.top) * cv.height / b.height / k]); if (S.coarse.length === 4) { S.step = 'fine'; S.fine = []; } render(); };
  }
  function fineRegion(i) {
    const im = S.img, rw = Math.round(im.w * 0.15), rh = Math.round(rw * 0.75), p = S.coarse[i];
    const x = Math.max(0, Math.min(im.w - rw, Math.round(p[0] - rw / 2))), y = Math.max(0, Math.min(im.h - rh, Math.round(p[1] - rh / 2)));
    return { x, y, w: rw, h: rh };
  }
  function drawFine() {
    const i = S.fine.length, cv = $('#scan-cv'), R = fineRegion(i), z = 2.4; cv.width = Math.round(R.w * z); cv.height = Math.round(R.h * z);
    const c = cv.getContext('2d'); c.drawImage(S.img.canvas, R.x, R.y, R.w, R.h, 0, 0, cv.width, cv.height);
    const px = (S.coarse[i][0] - R.x) * z, py = (S.coarse[i][1] - R.y) * z;
    c.strokeStyle = '#ff2d55'; c.lineWidth = 2; c.beginPath(); c.moveTo(px - 18, py); c.lineTo(px + 18, py); c.moveTo(px, py - 18); c.lineTo(px, py + 18); c.stroke();
    const take = (x, y) => { S.fine.push([x, y]); if (S.fine.length === 4) analyze(); else render(); };
    cv.onclick = (e) => { const b = cv.getBoundingClientRect(); take(R.x + (e.clientX - b.left) * cv.width / b.width / z, R.y + (e.clientY - b.top) * cv.height / b.height / z); };
    S.takeFine = take;
  }

  function analyze() {
    S.step = 'busy'; render();
    setTimeout(() => {
      try {
        const wg = warpGray(S.img.gray, S.img.w, S.img.h, S.fine);
        S.geo = geometry(wg, S.n); S.band = null; S.step = 'row';
      } catch (e) { S.step = 'pick'; S.err = String(e.message || e); }
      render(); if (S && S.err) { const m = $('#scan-msg'); if (m) m.textContent = 'Non riesco a elaborare la foto: ' + S.err; }
    }, 40);
  }

  function drawNames() {
    const cv = $('#scan-cv'), geo = S.geo, x1 = geo.bounds[0], x0 = Math.max(0, x1 - 320), z = 1;
    cv.width = (x1 - x0) * z; cv.height = geo.H;
    const c = cv.getContext('2d'), id = c.createImageData(cv.width, cv.height);
    for (let y = 0; y < geo.H; y++) for (let x = 0; x < cv.width; x++) { const v = geo.g[y * geo.W + x0 + x], o = (y * cv.width + x) * 4; id.data[o] = id.data[o + 1] = id.data[o + 2] = v; id.data[o + 3] = 255; }
    c.putImageData(id, 0, 0);
    c.strokeStyle = 'rgba(0,120,255,.35)'; c.lineWidth = 1; geo.ys.forEach((y) => { c.beginPath(); c.moveTo(0, y + .5); c.lineTo(cv.width, y + .5); c.stroke(); });
    if (S.band) { c.fillStyle = 'rgba(255,212,0,.45)'; c.fillRect(0, S.band[0], cv.width, S.band[1] - S.band[0]); }
    cv.onclick = (e) => { const b = cv.getBoundingClientRect(); S.band = pickBand(geo, (e.clientY - b.top) * cv.height / b.height); S.scrollY = window.scrollY; const keep = $('.scan-names').scrollTop; render(); $('.scan-names').scrollTop = keep; };
  }

  function readNow() {
    S.step = 'busy'; render();
    setTimeout(() => {
      const out = readRow(S.geo, S.band, S.n);
      S.cells = out.cells; S.res = out.res; S.codes = out.res.map((x) => x.code); S.step = 'result'; render();
    }, 40);
  }

  function renderResult(r) {
    const classes = window.SCAN_MODEL.classes, valid = S.opts.valid || [];
    const doubts = S.res.map((x, i) => (x.p < DOUBT ? i + 1 : 0)).filter(Boolean);
    const cell = (x, i) => {
      const w = S.cells[i] ? '<canvas class="scan-th" width="92" height="34" data-i="' + i + '"></canvas>' : '<div class="scan-th empty"></div>';
      const bad = x.p < DOUBT;
      return `<div class="scan-cell ${bad ? 'doubt' : ''}"><span class="d">${String(i + 1).padStart(2, '0')}</span>${w}
        <select data-i="${i}">${classes.map((c) => `<option value="${esc(c)}" ${S.codes[i] === c ? 'selected' : ''}>${c === '-' ? '—' : esc(c)}</option>`).join('')}</select></div>`;
    };
    r.innerHTML = head('Controlla le sigle', doubts.length ? `Da controllare: <b>${doubts.length}</b> casella/e, in giallo (giorni ${doubts.join(', ')}). Confronta l'immagine con la sigla e correggi se serve.` : 'Nessun dubbio, ma controlla lo stesso con la foto.') +
      `<div class="scan-body"><div class="scan-grid">${S.res.map(cell).join('')}</div>
       <div class="scan-bar"><button class="scan-btn" data-sc="back">Cambia riga</button><button class="scan-btn pri" data-sc="use">Usa queste sigle</button></div></div>`;
    r.querySelectorAll('canvas.scan-th').forEach((cv) => {
      const i = +cv.dataset.i, cl = S.cells[i], c = cv.getContext('2d'), id = c.createImageData(cl.w, cl.h);
      for (let k = 0; k < cl.w * cl.h; k++) { const v = cl.g[k]; id.data[k * 4] = id.data[k * 4 + 1] = id.data[k * 4 + 2] = v; id.data[k * 4 + 3] = 255; }
      const t = document.createElement('canvas'); t.width = cl.w; t.height = cl.h; t.getContext('2d').putImageData(id, 0, 0);
      c.imageSmoothingEnabled = true; c.drawImage(t, 0, 0, 92, 34);
    });
  }

  async function loadFile(file) {
    const bmp = await createImageBitmap(file), k = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
    const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
    const c = cv.getContext('2d', { willReadFrequently: true }); c.drawImage(bmp, 0, 0, cv.width, cv.height);
    const d = c.getImageData(0, 0, cv.width, cv.height);
    return { canvas: cv, w: cv.width, h: cv.height, gray: toGray(d.data, cv.width, cv.height) };
  }

  document.addEventListener('change', async (e) => {
    if (!S) return;
    if (e.target.id === 'scan-file' && e.target.files[0]) {
      const m = $('#scan-msg'); if (m) m.textContent = 'Carico la foto…';
      try { S.img = await loadFile(e.target.files[0]); S.coarse = []; S.step = 'coarse'; render(); } catch (err) { if (m) m.textContent = 'Non riesco ad aprire questa foto. Se è in formato HEIC prova a scattarla di nuovo con «Più compatibile» nelle impostazioni della fotocamera.'; }
    }
    if (e.target.matches('.scan-cell select')) { S.codes[+e.target.dataset.i] = e.target.value; e.target.closest('.scan-cell').classList.remove('doubt'); }
  });
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-sc]'); if (!b || !S) return;
    const a = b.dataset.sc;
    if (a === 'close') close();
    else if (a === 'undo') { S.coarse.pop(); render(); }
    else if (a === 'skipfine') { S.takeFine(S.coarse[S.fine.length][0], S.coarse[S.fine.length][1]); }
    else if (a === 'redo') { S.step = 'coarse'; S.coarse = []; S.fine = []; render(); }
    else if (a === 'read') readNow();
    else if (a === 'back') { S.step = 'row'; render(); }
    else if (a === 'use') { const codes = S.codes.slice(); const cb = S.opts.onDone; close(); cb && cb(codes); }
  });

  window.Scan = { open, close, _core: { warpGray, geometry, pickBand, readRow, toGray, features, classify, snapBand, DOUBT } };
})();

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


  /* =================== foglio settimanale: in quale reparto lavora ogni giorno =================== */
  // Si tocca una volta il cognome sul foglio; il programma cerca la stessa scritta (stesso carattere stampato)
  // in tutte le altre caselle dei 7 giorni, confrontando le forme.
  const WK_W = 2000;
  function weekWarp(gray, sw, sh, c) {
    const top = (dist(c[0], c[1]) + dist(c[3], c[2])) / 2, left = (dist(c[0], c[3]) + dist(c[1], c[2])) / 2;
    const W = WK_W, H = Math.max(500, Math.min(1500, Math.round(W * left / top)));
    const h = homography([[0, 0], [W, 0], [W, H], [0, H]], c), out = new Uint8Array(W * H);
    for (let v = 0; v < H; v++) for (let u = 0; u < W; u++) {
      const z = h[6] * u + h[7] * v + 1, x = (h[0] * u + h[1] * v + h[2]) / z, y = (h[3] * u + h[4] * v + h[5]) / z;
      if (x < 0 || y < 0 || x >= sw - 1 || y >= sh - 1) { out[v * W + u] = 255; continue; }
      const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, i = y0 * sw + x0;
      out[v * W + u] = (gray[i] * (1 - fx) + gray[i + 1] * fx) * (1 - fy) + (gray[i + sw] * (1 - fx) + gray[i + sw + 1] * fx) * fy;
    }
    return { g: out, W, H };
  }
  function weekPrep(wg) {
    const { g, W, H } = wg, ink = inkMask(g, W, H);
    // le linee della foto sono un po' storte: allargo di 2 punti prima di cercare i segmenti lunghi
    const dh = new Uint8Array(W * H), dv = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (ink[y * W + x]) { for (let d = -2; d <= 2; d++) { if (x + d >= 0 && x + d < W) dh[y * W + x + d] = 1; if (y + d >= 0 && y + d < H) dv[(y + d) * W + x] = 1; } }
    const v = runs(dh, W, H, 40, true), hm = runs(dv, W, H, 60, false);
    // testo = inchiostro senza le linee della tabella; poi dimezzo la risoluzione (densità 0..1)
    const w2 = W >> 1, h2 = H >> 1, D = new Float32Array(w2 * h2);
    const isLine = (x, y) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < W && yy < H && (v[yy * W + xx] || hm[yy * W + xx])) return true; } return false; };
    for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) {
      let s = 0; for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) { const xx = 2 * x + dx, yy = 2 * y + dy; if (ink[yy * W + xx] && !isLine(xx, yy)) s++; }
      D[y * w2 + x] = s / 4;
    }
    for (let pass = 0; pass < 1; pass++) {   // piccola sfocatura: tollera mezzo punto di spostamento
      const B = new Float32Array(D.length);
      for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) { let s = 0, c = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < w2 && yy < h2) { s += D[yy * w2 + xx]; c++; } } B[y * w2 + x] = s / c; }
      D.set(B);
    }
    // linee verticali (colonne dei giorni) e orizzontali (righe)
    const yA = Math.round(H * 0.12), yB = Math.round(H * 0.45), pv = new Float64Array(W);
    for (let y = yA; y < yB; y++) for (let x = 0; x < W; x++) pv[x] += v[y * W + x];
    const xs = peaks(pv, (yB - yA) * 0.35, 6);
    const ph = new Float64Array(H); for (let y = 0; y < H; y++) { let s = 0; for (let x = 0; x < W; x++) s += hm[y * W + x]; ph[y] = s; }
    const ys = peaks(ph, W * 0.25, 3);
    return { g, W, H, D, w2, h2, xs, ys };
  }
  function weekTemplate(P, tx, ty) {          // tx, ty in coordinate della foto raddrizzata (risoluzione piena)
    const { D, w2, h2 } = P, cx = Math.round(tx / 2), cy = Math.round(ty / 2);
    const colInk = (x, y0, y1) => { let s = 0; for (let y = y0; y <= y1; y++) s += D[y * w2 + x]; return s; };
    const y0 = Math.max(0, cy - 8), y1 = Math.min(h2 - 1, cy + 8);
    let sx = -1; for (let d = 0; d < 40 && sx < 0; d++) for (const x of [cx - d, cx + d]) if (x >= 0 && x < w2 && colInk(x, y0, y1) > 0.2) { sx = x; break; }
    if (sx < 0) return null;
    let xl = sx, xr = sx, gap = 0;
    for (let x = sx; x >= 0 && gap <= 6; x--) { if (colInk(x, y0, y1) > 0.2) { xl = x; gap = 0; } else gap++; }
    gap = 0; for (let x = sx; x < w2 && gap <= 6; x++) { if (colInk(x, y0, y1) > 0.2) { xr = x; gap = 0; } else gap++; }
    const rowInk = (y) => { let s = 0; for (let x = xl; x <= xr; x++) s += D[y * w2 + x]; return s; };
    let sy = -1; for (let d = 0; d < 12 && sy < 0; d++) for (const y of [cy - d, cy + d]) if (y >= 0 && y < h2 && rowInk(y) > 0.5) { sy = y; break; }
    if (sy < 0) return null;
    let yt = sy, yb = sy; gap = 0;
    for (let y = sy; y >= 0 && gap <= 1 && sy - y < 16; y--) { if (rowInk(y) > 0.5) { yt = y; gap = 0; } else gap++; }
    gap = 0; for (let y = sy; y < h2 && gap <= 1 && y - sy < 16; y++) { if (rowInk(y) > 0.5) { yb = y; gap = 0; } else gap++; }
    const w = xr - xl + 1, h = yb - yt + 1; if (w < 12 || h < 4) return null;
    const t = new Float32Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) t[y * w + x] = D[(yt + y) * w2 + xl + x];
    return { t, w, h, x0: xl, y0: yt, D, w2 };
  }
  const GW = 48, GH = 12;
  function ncc(a, b) {
    const n = a.length; let ma = 0, mb = 0; for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; } ma /= n; mb /= n;
    let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; sab += x * y; saa += x * x; sbb += y * y; }
    return saa > 1e-9 && sbb > 1e-9 ? sab / Math.sqrt(saa * sbb) : 0;
  }
  function blobFeat(D, w2, x0, y0, w, h) {      // porta una scritta su una griglia fissa
    const c = new Float64Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) c[y * w + x] = D[(y0 + y) * w2 + x0 + x];
    return areaResize(c, w, h, GW, GH);
  }
  // trova le «parole» (gruppi di lettere) nella zona dei giorni
  function weekWords(P) {
    const { D, w2, h2 } = P, xmin = Math.round((P.xs[0] || 0) / 2) + 3, seen = new Uint8Array(w2 * h2), words = [];
    const on = (x, y) => D[y * w2 + x] > 0.2;
    for (let y = 0; y < h2; y++) for (let x = xmin; x < w2; x++) {
      if (seen[y * w2 + x] || !on(x, y)) continue;
      // riempimento: unisco i punti entro 3 colonne e 1 riga (lettere della stessa parola)
      const st = [[x, y]], pts = []; seen[y * w2 + x] = 1; let x0 = x, x1 = x, y0 = y, y1 = y;
      while (st.length) {
        const [px, py] = st.pop(); pts.push(1);
        if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -3; dx <= 3; dx++) { const nx = px + dx, ny = py + dy; if (nx >= xmin && ny >= 0 && nx < w2 && ny < h2 && !seen[ny * w2 + nx] && on(nx, ny)) { seen[ny * w2 + nx] = 1; st.push([nx, ny]); } }
        if (pts.length > 20000) break;
      }
      const w = x1 - x0 + 1, h = y1 - y0 + 1;
      if (w >= 14 && w <= 110 && h >= 5 && h <= 18) words.push({ x: x0, y: y0, w, h });
    }
    return words;
  }
  function weekMatch(P, T, thr) {              // T: scritta presa dalla foto (x0,y0,w,h) oppure ricordata ({tf, ar})
    const tf = T.tf || blobFeat(P.D, P.w2, T.x0, T.y0, T.w, T.h), ar = T.ar || T.w / T.h, out = [];
    for (const wd of weekWords(P)) {
      const r = (wd.w / wd.h) / ar; if (r < 0.7 || r > 1.4) continue;
      const v = ncc(tf, blobFeat(P.D, P.w2, wd.x, wd.y, wd.w, wd.h));
      if (v >= thr) out.push({ v, xc: (wd.x + wd.w / 2) * 2, yc: (wd.y + wd.h / 2) * 2 });
    }
    return out.sort((a, b) => b.v - a.v);
  }
  function weekDay(P, xc) {                   // colonna del giorno (0 = lunedì …) dalla posizione orizzontale
    const bs = P.xs.filter((x) => x >= 120); if (bs.length === 7) bs.push(P.W - 1);
    const xs = bs.slice(-8); if (xs.length < 8) return -1;
    for (let i = 0; i < 7; i++) if (xc >= xs[i] && xc < xs[i + 1]) return i;
    return -1;
  }
  function weekDayEdges(P) { const bs = P.xs.filter((x) => x >= 120); if (bs.length === 7) bs.push(P.W - 1); return bs.slice(-8); }
  // descrizione compatta di una scritta (per ricordarla alla settimana dopo)
  function tplPack(T) { const tf = blobFeat(T.D, T.w2, T.x0, T.y0, T.w, T.h); return { ar: T.w / T.h, tf: Array.from(tf, (v) => Math.round(Math.min(1, Math.max(0, v)) * 255)) }; }
  function tplUnpack(o) { return { ar: o.ar, tf: Float64Array.from(o.tf, (v) => v / 255) }; }

  /* =================== schermate =================== */
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const CORNERS = ['in alto a sinistra', 'in alto a destra', 'in basso a destra', 'in basso a sinistra'];
  const CORNER_HELP_W = ['la scritta «giorno», in alto a sinistra', 'la colonna «Domenica», in alto a destra', 'l\'ultima riga con i nomi, a destra', 'l\'ultima riga con i nomi, a sinistra'];
  const CORNER_HELP = ['la colonna «Matricola», sopra i nomi', 'la colonna «Totale ore», sopra', 'l\'ultima riga della tabella, a destra', 'l\'ultima riga della tabella, a sinistra'];
  let S = null;

  function open(opts) {
    close();
    S = { opts, mode: opts.mode || 'month', step: 'pick', img: null, coarse: [], fine: [], n: opts.n };
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
      r.innerHTML = head(S.mode === 'week' ? 'Reparti dalla foto settimanale' : 'Leggi dalla foto', S.mode === 'week' ? `Scegli la foto del «Quadro turni settimanali». Cerco i reparti di <b>${esc(S.opts.who)}</b>. La foto resta sul telefono.` : 'Scegli la foto del prospetto mensile. La foto resta sul telefono: non viene inviata a nessuno.') + `
        <div class="scan-body">
          ${S.mode === 'week' ? `<label class="scan-lab">Settimana che inizia lunedì<input type="date" id="scan-monday" value="${esc(S.opts.monday)}"></label>` : ''}
          <label class="scan-btn big">Scegli o scatta la foto<input id="scan-file" type="file" accept="image/*" hidden></label>
          <p class="scan-hint">Consigli: tutta la tabella dentro la foto, ben illuminata, senza riflessi. Poi toccherai i 4 angoli ${S.mode === 'week' ? 'e un cognome' : 'e la riga della persona'}.</p>
          <p class="scan-hint" id="scan-msg"></p>
        </div>`;
    } else if (S.step === 'coarse') {
      const i = S.coarse.length;
      r.innerHTML = head(`Angolo ${i + 1} di 4`, `Tocca l'angolo della tabella <b>${CORNERS[i]}</b>: ${(S.mode === 'week' ? CORNER_HELP_W : CORNER_HELP)[i]}.`) + `<div class="scan-body"><canvas id="scan-cv" class="scan-cv"></canvas>${i ? '<button class="scan-btn" data-sc="undo">Annulla l\'ultimo tocco</button>' : ''}</div>`;
      drawCoarse();
    } else if (S.step === 'fine') {
      const i = S.fine.length;
      r.innerHTML = head(`Angolo ${i + 1} di 4, più preciso`, `Ora tocca <b>esattamente</b> l'angolo ${CORNERS[i]}. La croce indica dove avevi toccato.`) + `<div class="scan-body"><canvas id="scan-cv" class="scan-cv"></canvas><button class="scan-btn" data-sc="skipfine">Va bene dov'è la croce</button></div>`;
      drawFine();
    } else if (S.step === 'wtap') {
      const saved = loadTpl();
      r.innerHTML = head('Tocca un cognome', `Sul foglio tocca <b>una volta</b> il cognome di <b>${esc(S.opts.who)}</b>. Poi cerco lo stesso cognome in tutti i giorni.`) + `<div class="scan-body">
        ${S.msg ? `<p class="scan-hint warn">${esc(S.msg)}</p>` : ''}
        ${saved ? '<button class="scan-btn pri" data-sc="wsaved">Usa il cognome della volta scorsa</button>' : ''}
        <div class="scan-names tall"><canvas id="scan-cv" class="scan-cv"></canvas></div>
        <div class="scan-bar"><button class="scan-btn" data-sc="redo">Rifai gli angoli</button></div></div>`;
      drawWeek();
    } else if (S.step === 'wres') {
      renderWeekResult(r);
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


  /* ---- reparti settimanali: schermate ---- */
  const DEF_REPARTI = ['Smistamento', 'Urgenze', 'Biologia mol.', 'Chimica', 'Coagulazione', 'Ematologia', 'Elettroforesi', 'Microbiologia', 'Sierologia'];
  const lsGet = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* niente memoria: pazienza */ } };
  const loadTpl = () => lsGet('scadTpl_' + (S.opts.tplKey || ''));
  const addDays = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); const t = new Date(y, m - 1, d + n, 12); return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0'); };
  const mondayISO = (iso) => { const [y, m, d] = iso.split('-').map(Number); const t = new Date(y, m - 1, d, 12), k = (t.getDay() + 6) % 7; return addDays(iso, -k); };
  const DAYN = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
  function drawWeek() {
    const cv = $('#scan-cv'), wg = S.wg; cv.width = wg.W; cv.height = wg.H;
    const c = cv.getContext('2d'), id = c.createImageData(wg.W, wg.H);
    for (let i = 0; i < wg.W * wg.H; i++) { const v = wg.g[i]; id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = v; id.data[i * 4 + 3] = 255; }
    c.putImageData(id, 0, 0);
    cv.style.width = '170%';
    cv.onclick = (e) => {
      const b = cv.getBoundingClientRect(), tx = (e.clientX - b.left) * cv.width / b.width, ty = (e.clientY - b.top) * cv.height / b.height;
      const T = weekTemplate(S.P, tx, ty);
      if (!T) { S.msg = 'Lì non vedo nessuna scritta: tocca proprio sopra il cognome.'; render(); return; }
      S.msg = ''; const pk = tplPack(T); lsSet('scadTpl_' + (S.opts.tplKey || ''), pk); runWeek(T);
    };
  }
  function runWeek(T) {
    S.step = 'busy'; render();
    setTimeout(() => {
      const P = S.P, found = weekMatch(P, T, 0.85).map((m) => ({ ...m, day: weekDay(P, m.xc) })).filter((m) => m.day >= 0);
      found.sort((a, b) => a.day - b.day || a.yc - b.yc);
      const mem = lsGet('scadRows') || [];
      found.forEach((m) => { const f = m.yc / P.H; const near = mem.filter((x) => Math.abs(x.f - f) < 0.013).sort((a, b) => Math.abs(a.f - f) - Math.abs(b.f - f))[0]; m.name = near ? near.name : ''; m.known = !!near; });
      S.found = found; S.step = 'wres'; render();
    }, 40);
  }
  function cropCanvas(g, W, x, y, w, h, scale) {
    const cv = document.createElement('canvas'); cv.width = Math.max(4, Math.round(w)); cv.height = Math.max(4, Math.round(h));
    const c = cv.getContext('2d'), id = c.createImageData(cv.width, cv.height);
    for (let yy = 0; yy < cv.height; yy++) for (let xx = 0; xx < cv.width; xx++) { const sx = Math.round(x) + xx, sy = Math.round(y) + yy, v = sx >= 0 && sy >= 0 && sx < W ? g[sy * W + sx] : 255, o = (yy * cv.width + xx) * 4; id.data[o] = id.data[o + 1] = id.data[o + 2] = v; id.data[o + 3] = 255; }
    c.putImageData(id, 0, 0); cv.className = 'scan-wc'; return cv;
  }
  function renderWeekResult(r) {
    const P = S.P, edges = weekDayEdges(P), lab = Math.round(edges[0]) + 6;
    const known = [...new Set([...DEF_REPARTI, ...(S.opts.known || []), ...(lsGet('scadRows') || []).map((x) => x.name).filter(Boolean)])];
    const monday = S.opts.monday;
    const items = S.found.map((m, i) => `<div class="scan-wr" data-i="${i}"><div class="d">${DAYN[m.day]} ${addDays(monday, m.day).slice(8)}/${addDays(monday, m.day).slice(5, 7)}</div>
        <div class="imgs" data-i="${i}"></div>
        <input class="rep-in" data-i="${i}" list="scan-rep" maxlength="40" value="${esc(m.name)}" placeholder="reparto (vuoto = nessuno)"></div>`).join('');
    r.innerHTML = head('Reparti trovati', S.found.length ? `Ho trovato <b>${esc(S.opts.who)}</b> in <b>${S.found.length}</b> punti. A sinistra vedi il nome della riga: scrivi il reparto. Se è una riga di turno (es. «14.00 - 22.00») lascia vuoto.` : 'Non ho trovato quel cognome in nessun giorno.') +
      `<div class="scan-body"><datalist id="scan-rep">${known.map((k) => `<option value="${esc(k)}">`).join('')}</datalist>
        ${items}${S.found.length ? '' : '<p class="scan-hint">Prova a toccare un altro punto dove c\'è il cognome, oppure rifai gli angoli.</p>'}
        <div class="scan-bar"><button class="scan-btn" data-sc="wback">Cambia cognome</button><button class="scan-btn pri" data-sc="wuse">Salva i reparti</button></div></div>`;
    r.querySelectorAll('.imgs').forEach((el) => {
      const m = S.found[+el.dataset.i];
      el.appendChild(cropCanvas(P.g, P.W, 0, m.yc - 26, lab, 52));
      el.appendChild(cropCanvas(P.g, P.W, m.xc - 90, m.yc - 14, 180, 28));
    });
  }

  function analyze() {
    S.step = 'busy'; render();
    setTimeout(() => {
      try {
        if (S.mode === 'week') {
          const wg = weekWarp(S.img.gray, S.img.w, S.img.h, S.fine); S.wg = wg; S.P = weekPrep(wg);
          if (S.P.xs.filter((x) => x >= 120).length < 7) throw new Error('non trovo le colonne dei giorni: rifai gli angoli');
          S.step = 'wtap';
        } else {
          const wg = warpGray(S.img.gray, S.img.w, S.img.h, S.fine);
          S.geo = geometry(wg, S.n); S.band = null; S.step = 'row';
        }
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
    if (e.target.id === 'scan-monday') { const v = e.target.value; if (v) S.opts.monday = mondayISO(v); }
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
    else if (a === 'wsaved') { const o = loadTpl(); if (o) runWeek(tplUnpack(o)); }
    else if (a === 'wback') { S.step = 'wtap'; render(); }
    else if (a === 'wuse') {
      const days = {}, mem = (lsGet('scadRows') || []).slice();
      S.found.forEach((m, i) => { const el = document.querySelector('.rep-in[data-i="' + i + '"]'), name = (el ? el.value : m.name).trim(); const f = m.yc / S.P.H;
        const k = mem.findIndex((x) => Math.abs(x.f - f) < 0.013); if (k >= 0) mem[k] = { f, name }; else mem.push({ f, name });
        if (name) { const iso = addDays(S.opts.monday, m.day); days[iso] = days[iso] && !days[iso].split(' + ').includes(name) ? days[iso] + ' + ' + name : name; } });
      lsSet('scadRows', mem.slice(-60)); const cb = S.opts.onDone, mon = S.opts.monday; close(); cb && cb(days, mon);
    }
    else if (a === 'use') { const codes = S.codes.slice(); const cb = S.opts.onDone; close(); cb && cb(codes); }
  });

  window.Scan = { open, close, _core: { weekWarp, weekPrep, weekTemplate, weekMatch, weekDay, tplPack, tplUnpack, warpGray, geometry, pickBand, readRow, toGray, features, classify, snapBand, DOUBT } };
})();

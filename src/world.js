'use strict';
/* FRACTURE — Secteur Éclipse : géométrie, collisions, lancer de rayons. */
const MAP = 200; // demi-côté (carte 400 × 400 m)
const W = {
  C: 8, cells: new Map(), all: [], stamp: 1, chunks: [], dyn: {},
  key(ix, iz) { return ix * 4096 + iz; },
  insert(o) {
    const C = this.C;
    for (let ix = Math.floor(o.x0 / C); ix <= Math.floor(o.x1 / C); ix++)
      for (let iz = Math.floor(o.z0 / C); iz <= Math.floor(o.z1 / C); iz++) {
        const k = this.key(ix, iz); let a = this.cells.get(k); if (!a) { a = []; this.cells.set(k, a); } a.push(o);
      }
    this.all.push(o);
  },
  addBox(x, z, w, d, h, y0 = 0, tag) { const b = { t: 0, x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, y0, y1: y0 + h, on: true, tag, st: 0 }; this.insert(b); return b; },
  addCyl(x, z, r, h, y0 = 0, tag) { const c = { t: 1, x, z, r, y0, y1: y0 + h, x0: x - r, x1: x + r, z0: z - r, z1: z + r, on: true, tag, st: 0 }; this.insert(c); return c; },
  near(x, z, r, out) {
    out.length = 0; const C = this.C, s = ++this.stamp;
    for (let ix = Math.floor((x - r) / C); ix <= Math.floor((x + r) / C); ix++)
      for (let iz = Math.floor((z - r) / C); iz <= Math.floor((z + r) / C); iz++) {
        const a = this.cells.get(this.key(ix, iz)); if (!a) continue;
        for (const o of a) if (o.st !== s && o.on) { o.st = s; out.push(o); }
      }
    return out;
  },
  _hit: { t: 0, nx: 0, ny: 0, nz: 0, o: null },
  rayObj(o, ox, oy, oz, dx, dy, dz, maxT) {
    if (o.t === 0) {
      let t0 = 0, t1 = maxT, nx = 0, ny = 0, nz = 0;
      const sl = (orr, d, mn, mx, ax) => {
        if (Math.abs(d) < 1e-9) return orr >= mn && orr <= mx;
        let a = (mn - orr) / d, b = (mx - orr) / d, s = -1; if (a > b) { const tt = a; a = b; b = tt; s = 1; }
        if (a > t0) { t0 = a; nx = ny = nz = 0; if (ax === 0) nx = d > 0 ? -1 : 1; else if (ax === 1) ny = d > 0 ? -1 : 1; else nz = d > 0 ? -1 : 1; }
        if (b < t1) t1 = b; return t0 <= t1;
      };
      if (!sl(ox, dx, o.x0, o.x1, 0) || !sl(oy, dy, o.y0, o.y1, 1) || !sl(oz, dz, o.z0, o.z1, 2)) return -1;
      if (t0 <= 1e-4) return -1; // origine à l'intérieur
      this._hit.nx = nx; this._hit.ny = ny; this._hit.nz = nz; return t0;
    } else {
      const fx = ox - o.x, fz = oz - o.z, a = dx * dx + dz * dz, c = fx * fx + fz * fz - o.r * o.r;
      if (c < 0 && oy >= o.y0 && oy <= o.y1) return -1;
      let best = -1;
      if (a > 1e-9) {
        const b = 2 * (fx * dx + fz * dz), disc = b * b - 4 * a * c;
        if (disc >= 0) { const t = (-b - Math.sqrt(disc)) / (2 * a); if (t > 1e-4 && t < maxT) { const y = oy + dy * t; if (y >= o.y0 && y <= o.y1) { best = t; const hx = fx + dx * t, hz = fz + dz * t, l = Math.hypot(hx, hz) || 1; this._hit.nx = hx / l; this._hit.ny = 0; this._hit.nz = hz / l; } } }
      }
      if (best < 0 && oy > o.y1 && dy < 0) { const t = (o.y1 - oy) / dy; if (t > 0 && t < maxT) { const hx = fx + dx * t, hz = fz + dz * t; if (hx * hx + hz * hz <= o.r * o.r) { best = t; this._hit.nx = 0; this._hit.ny = 1; this._hit.nz = 0; } } }
      return best;
    }
  },
  /* rayon (direction normalisée) → {t,nx,ny,nz,o} ou null ; DDA sur la grille */
  raycast(ox, oy, oz, dx, dy, dz, maxT) {
    const C = this.C, s = ++this.stamp; let bestT = maxT, bo = null, bn = [0, 0, 0];
    if (dy < -1e-6) { const t = -oy / dy; if (t > 0 && t < bestT) { bestT = t; bo = 'ground'; bn = [0, 1, 0]; } }
    let ix = Math.floor(ox / C), iz = Math.floor(oz / C);
    const sx = dx > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
    const tdx = Math.abs(dx) > 1e-9 ? C / Math.abs(dx) : Infinity, tdz = Math.abs(dz) > 1e-9 ? C / Math.abs(dz) : Infinity;
    let tmx = Math.abs(dx) > 1e-9 ? ((ix + (dx > 0 ? 1 : 0)) * C - ox) / dx : Infinity;
    let tmz = Math.abs(dz) > 1e-9 ? ((iz + (dz > 0 ? 1 : 0)) * C - oz) / dz : Infinity;
    let tc = 0;
    for (let it = 0; it < 200 && tc <= bestT; it++) {
      const a = this.cells.get(this.key(ix, iz));
      if (a) for (const o of a) {
        if (o.st === s || !o.on) continue; o.st = s;
        const t = this.rayObj(o, ox, oy, oz, dx, dy, dz, bestT);
        if (t > 0 && t < bestT) { bestT = t; bo = o; bn = [this._hit.nx, this._hit.ny, this._hit.nz]; }
      }
      if (tmx < tmz) { tc = tmx; tmx += tdx; ix += sx; } else { tc = tmz; tmz += tdz; iz += sz; }
    }
    if (!bo) return null;
    return { t: bestT, nx: bn[0], ny: bn[1], nz: bn[2], o: bo };
  },
  los(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az, d = Math.hypot(dx, dy, dz); if (d < 0.01) return true;
    const h = this.raycast(ax, ay, az, dx / d, dy / d, dz / d, d - 0.15); return !h;
  },
  _n: [],
  STEP: 0.45,
  /* collisions cercle/obstacles + sol */
  resolve(e) {
    const r = e.r, near = this.near(e.x, e.z, r + 1.5, this._n); e.blockTop = 0; e.blocked = false;
    for (let it = 0; it < 2; it++) for (const o of near) {
      if (o.y1 <= e.y + this.STEP || o.y0 >= e.y + e.h) continue;
      if (o.t === 0) {
        const cx = clamp(e.x, o.x0, o.x1), cz = clamp(e.z, o.z0, o.z1); let dx = e.x - cx, dz = e.z - cz; const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-8) { const d = Math.sqrt(d2), p = r - d; e.x += dx / d * p; e.z += dz / d * p; }
        else { const pl = e.x - o.x0, pr = o.x1 - e.x, pd = e.z - o.z0, pu = o.z1 - e.z, m = Math.min(pl, pr, pd, pu);
          if (m === pl) e.x = o.x0 - r; else if (m === pr) e.x = o.x1 + r; else if (m === pd) e.z = o.z0 - r; else e.z = o.z1 + r; }
      } else {
        const dx = e.x - o.x, dz = e.z - o.z, d = Math.hypot(dx, dz), rr = o.r + r; if (d >= rr) continue;
        if (d > 1e-6) { e.x = o.x + dx / d * rr; e.z = o.z + dz / d * rr; } else e.x += rr;
      }
      e.blocked = true; if (o.y1 > e.blockTop) e.blockTop = o.y1;
    }
    e.x = clamp(e.x, -MAP + 3, MAP - 3); e.z = clamp(e.z, -MAP + 3, MAP - 3);
  },
  groundAt(x, z, y, r) {
    let g = 0; const near = this.near(x, z, r + 0.5, this._n);
    for (const o of near) {
      if (o.y1 > y + this.STEP + 0.05 || o.y1 <= g) continue;
      if (o.t === 0) { const m = r * 0.6; if (x > o.x0 - m && x < o.x1 + m && z > o.z0 - m && z < o.z1 + m) g = o.y1; }
      else if (Math.hypot(x - o.x, z - o.z) < o.r + r * 0.3) g = o.y1;
    }
    return g;
  },
  freeAt(x, z, r) { const near = this.near(x, z, r + 1, this._n); for (const o of near) { if (o.y1 < 0.5) continue; if (o.t === 0) { if (x > o.x0 - r && x < o.x1 + r && z > o.z0 - r && z < o.z1 + r) return false; } else if (Math.hypot(x - o.x, z - o.z) < o.r + r) return false; } return true; },
};

/* ---------- Données du Secteur ---------- */
const AP = { x: 0, z: 150, x0: -28, x1: 28, z0: 128, z1: 172 };
const CENT = { x: 0, z: -140, pvpR: 56 };
const LAB = { x: 162, z: -10, door: { x: 163, z: -10 } };
const PATHS = [
  [[4, 196], [2, 180], [0, 172]],
  [[0, 128], [0, 96], [-40, 72], [-78, 34], [-86, -8], [-74, -48], [-44, -88], [-12, -106], [0, -108]],
  [[0, 96], [42, 76], [70, 40], [74, -6], [70, -50], [40, -92], [12, -106], [0, -108]],
  [[-40, 72], [-45, 100]],
];
function distToPaths(x, z) {
  let best = 1e9;
  for (const p of PATHS) for (let i = 0; i < p.length - 1; i++) {
    const [ax, az] = p[i], [bx, bz] = p[i + 1], vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz;
    const t = clamp(((x - ax) * vx + (z - az) * vz) / l2, 0, 1), d = Math.hypot(x - (ax + vx * t), z - (az + vz * t)); if (d < best) best = d;
  }
  return best;
}
function inAP(x, z, m = 0) { return x > AP.x0 - m && x < AP.x1 + m && z > AP.z0 - m && z < AP.z1 + m; }
function inSafe(x, z) { return inAP(x, z, 6); }
function inCentrale(x, z) { return Math.hypot(x - CENT.x, z - CENT.z) < CENT.pvpR; }
function inLab(x, z) { return Math.hypot(x - LAB.x, z - LAB.z) < 33 || (x > 104 && x < 136 && Math.abs(z + 10) < 7); }
function inMassif(x, z) { return x > -34 && x < 34 && z > -78 && z < 38; }
function zoneAt(x, z) {
  if (inSafe(x, z)) return { id: 'ap', name: "L'Avant-Poste", sub: 'Zone sûre · sans PvP', safe: true };
  if (inCentrale(x, z)) return { id: 'cent', name: 'Centrale Éclipse', sub: 'Zone contestée · PvP actif', pvp: true };
  if (inLab(x, z)) return { id: 'lab', name: 'Laboratoire 07', sub: 'Localisation non répertoriée' };
  if (z > 176) return { id: 'crash', name: 'Site du crash', sub: 'Lisière sud' };
  return { id: 'green', name: 'La Ceinture Verte', sub: x < 0 ? 'Sentier des Ruines' : 'Gorge Cyan' };
}

function noise2(x, z) { // bruit de valeur
  const h = (i, j) => { let n = i * 374761393 + j * 668265263; n = (n ^ (n >>> 13)) * 1274126177; return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  return lerp(lerp(h(ix, iz), h(ix + 1, iz), u), lerp(h(ix, iz + 1), h(ix + 1, iz + 1), u), v);
}
const COL = {
  moss1: hex('#3f5d4c'), moss2: hex('#56755a'), moss3: hex('#2f4a45'), dirt: hex('#7d6c57'), dirt2: hex('#8f7c63'),
  concrete: hex('#8d9099'), concrete2: hex('#a3a6ad'), rock: hex('#5d6170'), rock2: hex('#6f6a72'), trunk: hex('#4a3b3a'),
  leaf: hex('#2f6b63'), leaf2: hex('#3d7f6a'), leaf3: hex('#285a5f'), panel: hex('#d9d3c4'), dark: hex('#1d2b3d'), metal: hex('#59606e'),
  rust: hex('#8a4f3c'), grass: hex('#5f8a5e'),
};
function groundColor(x, z) {
  let c = mix3(COL.moss1, COL.moss2, noise2(x * 0.08, z * 0.08));
  c = mix3(c, COL.moss3, clamp(noise2(x * 0.02 + 50, z * 0.02) * 1.4 - 0.5, 0, 1));
  const dp = distToPaths(x, z); if (dp < 5) c = mix3(COL.dirt, c, clamp((dp - 2) / 3, 0, 1));
  if (inAP(x, z, 2)) c = mix3(COL.concrete, COL.concrete2, noise2(x * 0.3, z * 0.3) * 0.5);
  const dc = Math.hypot(x - CENT.x, z - CENT.z); if (dc < 40) c = mix3(COL.concrete, c, clamp((dc - 34) / 6, 0, 1));
  if (Math.hypot(x - LAB.x, z - LAB.z) < 26) c = mix3(hex('#5b5b6b'), c, clamp((Math.hypot(x - LAB.x, z - LAB.z) - 20) / 6, 0, 1));
  return c;
}

function buildWorld(Q) {
  const rng = mulberry32(7007);
  const CH = 50, NC = (MAP * 2) / CH; // 8×8 tronçons
  const base = [], flora = [];
  for (let i = 0; i < NC * NC; i++) { base.push(new MB()); flora.push(new MB()); }
  const ci = (x, z) => clamp(Math.floor((x + MAP) / CH), 0, NC - 1) + clamp(Math.floor((z + MAP) / CH), 0, NC - 1) * NC;
  const B = (x, z) => base[ci(x, z)], F = (x, z) => flora[ci(x, z)];
  const on = new MB(), off = new MB(); // Centrale : éclairage cyan / secours
  // --- sol
  const S = 8;
  for (let x = -MAP; x < MAP; x += S) for (let z = -MAP; z < MAP; z += S) {
    const mb = B(x + S / 2, z + S / 2);
    const c00 = groundColor(x, z), c10 = groundColor(x + S, z), c11 = groundColor(x + S, z + S), c01 = groundColor(x, z + S);
    const e = 0;
    mb.v(x, 0, z, 0, 1, 0, c00, e); mb.v(x, 0, z + S, 0, 1, 0, c01, e); mb.v(x + S, 0, z + S, 0, 1, 0, c11, e);
    mb.v(x, 0, z, 0, 1, 0, c00, e); mb.v(x + S, 0, z + S, 0, 1, 0, c11, e); mb.v(x + S, 0, z, 0, 1, 0, c10, e);
  }
  const solid = (x, z, w, d, h, c, e = 0, y0 = 0, cTop, tag) => { B(x, z).box(x, y0, z, w, h, d, c, e, 0, cTop); return W.addBox(x, z, w, d, h, y0, tag); };
  const rockAt = (x, z, r, sy = 0.75, col = true, colH) => {
    const c = mix3(COL.rock, COL.rock2, rng()); B(x, z).rock(x, -r * 0.15, z, r, c, rng, sy);
    if (col) W.addCyl(x, z, r * 0.82, colH || Math.max(0.8, r * sy * 0.85));
  };
  const tree = (x, z, s = 1) => {
    const mb = B(x, z), h = 11 * s + rng() * 5 * s, r = 0.9 * s;
    mb.cyl(x, 0, z, r * 1.4, h * 0.35, COL.trunk, 0, 7, r); mb.cyl(x, h * 0.35, z, r, h * 0.65, COL.trunk, 0, 7, r * 0.55);
    // racines
    for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + rng(); mb.box(x + Math.cos(a) * r * 1.4, 0, z + Math.sin(a) * r * 1.4, r * 2.2, 0.5 * s, 0.5 * s, COL.trunk, 0, -a); }
    const lc = [COL.leaf, COL.leaf2, COL.leaf3];
    for (let k = 0; k < 4; k++) { const a = rng() * TAU, d = k ? 2.2 * s : 0; mb.sphere(x + Math.cos(a) * d, h - (k ? 1.5 : 0), z + Math.sin(a) * d, (3.2 + rng() * 1.6) * s, lc[k % 3], 0, 7, 5, 0.7); }
    // fruits lumineux
    const glow = rng() < 0.5 ? PAL.cyan : PAL.violet;
    for (let k = 0; k < 5; k++) { const a = rng() * TAU, d = 2.5 * s + rng() * 2; F(x, z).sphere(x + Math.cos(a) * d, h - 3 - rng() * 2, z + Math.sin(a) * d, 0.28 * s, glow, 1, 5, 3); }
    W.addCyl(x, z, r * 1.25, h);
  };
  const ok = (x, z, m = 6) => !inAP(x, z, 10) && Math.hypot(x - CENT.x, z - CENT.z) > 48 && !inMassif(x, z) && distToPaths(x, z) > m && !(x > 98) && z < 176 && !(Math.abs(x) < 20 && z > 172);

  // --- bordure (falaises)
  for (const [x, z, w, d] of [[0, -MAP - 2, MAP * 2 + 8, 6], [0, MAP + 2, MAP * 2 + 8, 6], [-MAP - 2, 0, 6, MAP * 2 + 8], [MAP + 2, 0, 6, MAP * 2 + 8]]) W.addBox(x, z, w, d, 30);
  for (let t = -MAP; t <= MAP; t += 14) {
    for (const [x, z] of [[t, -MAP + 4], [t, MAP - 4], [-MAP + 4, t], [MAP - 4, t]]) { const r = 9 + rng() * 6; B(x, z).rock(x, -2, z, r, mix3(COL.rock, COL.rock2, rng()), rng, 1.3); }
  }
  // --- massif central « L'Échine »
  for (let x = -26; x <= 26; x += 13) for (let z = -70; z <= 30; z += 12.5) {
    const r = 10 + rng() * 3; B(x, z).rock(x + rng() * 2 - 1, -2, z + rng() * 2 - 1, r, mix3(COL.rock, COL.rock2, rng()), rng, 1.25); W.addCyl(x, z, 8.6, 15);
  }
  // --- paroi est de la gorge (avec la faille du Labo 07)
  for (let z = -170; z <= 110; z += 11) {
    if (z > -22 && z < 2) continue; // faille
    const x = 104 + (rng() - 0.5) * 4, r = 8 + rng() * 3; B(x, z).rock(x, -2, z, r, mix3(COL.rock, COL.rock2, rng()), rng, 1.4); W.addCyl(x, z, 7.4, 16);
  }
  // couloir de la faille
  for (let x = 108; x <= 132; x += 6) { for (const zz of [-19.5, -0.5]) { B(x, zz).rock(x, -1, zz, 5.2, COL.rock2, rng, 1.6); W.addCyl(x, zz, 4.3, 12); } }
  for (const [x, z] of [[104, -24], [104, 4]]) { B(x, z).rock(x, -1, z, 6, COL.rock, rng, 1.5); W.addCyl(x, z, 5.4, 14); }
  // rideau de végétation qui masque l'entrée
  for (let k = 0; k < 14; k++) { const z = -16 + rng() * 12, x = 100 + rng() * 6; F(x, z).sphere(x, 0.6 + rng() * 1.5, z, 0.9 + rng() * 0.8, k % 2 ? COL.leaf2 : COL.leaf, 0, 6, 4, 0.8); }
  for (let k = 0; k < 10; k++) { const z = -15 + rng() * 10, x = 103 + rng() * 3; F(x, z).cyl(x, 2.5 + rng() * 3, z, 0.06, 3 + rng() * 3, PAL.cyan, 1, 4, 0.03, false); }
  // enceinte du Labo 07
  for (let k = 0; k < 26; k++) {
    const a = k / 26 * TAU; if (Math.abs(angDiff(a, PI)) < 0.3) continue; // entrée ouest
    const x = LAB.x + Math.cos(a) * 31, z = LAB.z + Math.sin(a) * 31; if (x > 196) continue;
    B(x, z).rock(x, -2, z, 8, mix3(COL.rock, COL.rock2, rng()), rng, 1.5); W.addCyl(x, z, 6.6, 16);
  }
  // remplissage hors-zone à l'est
  for (let x = 118; x < 196; x += 16) for (let z = -190; z < 190; z += 16) {
    if (Math.hypot(x - LAB.x, z - LAB.z) < 40 || (x < 140 && Math.abs(z + 10) < 14)) continue;
    const r = 9 + rng() * 4; B(x, z).rock(x, -2, z, r, mix3(COL.rock, COL.rock2, rng()), rng, 1.2 + rng() * 0.6); W.addCyl(x, z, r * 0.75, 15);
  }

  // --- Avant-Poste
  const wall = (x, z, w, d) => { solid(x, z, w, d, 3.6, COL.panel, 0, 0, COL.dark); B(x, z).box(x, 0, z, w + 0.06, 0.5, d + 0.06, COL.dark); B(x, z).box(x, 2.6, z, w + 0.08, 0.18, d + 0.08, PAL.orange, 0.9); };
  wall(-16.5, 128, 23, 1.2); wall(16.5, 128, 23, 1.2); wall(-16, 172, 24, 1.2); wall(16, 172, 24, 1.2);
  wall(-28, 150, 1.2, 45.2); wall(28, 150, 1.2, 45.2);
  for (const [x, z] of [[-28, 128], [28, 128], [-28, 172], [28, 172], [-5.4, 128], [5.4, 128], [-4.4, 172], [4.4, 172]]) {
    solid(x, z, 2, 2, 5.2, COL.dark); B(x, z).box(x, 5.2, z, 1.2, 0.4, 1.2, PAL.or, 1);
  }
  const hangar = (x, z) => {
    solid(x, z, 10, 14, 6, COL.panel, 0, 0, COL.metal); const mb = B(x, z);
    mb.box(x, 6, z, 11, 0.5, 15, COL.dark); mb.box(x + (x < 0 ? 5.05 : -5.05), 0, z, 0.2, 4.4, 6, COL.metal); mb.box(x + (x < 0 ? 5.12 : -5.12), 4.5, z, 0.1, 0.25, 6.4, PAL.cyan, 1);
    for (let k = -1; k <= 1; k++) mb.box(x, 3, z + k * 4.6, 10.1, 0.12, 0.3, COL.dark);
  };
  hangar(-21, 141); hangar(21, 141);
  // mobilier (couverture / ambiance)
  for (const [x, z, w, d, h] of [[-4, 158, 1.4, 1.4, 1.1], [4.5, 157, 1.2, 2.4, 0.9], [-15, 168, 3, 1, 1], [15, 168, 3, 1, 1], [-22, 160, 2, 2, 1.4], [23, 163, 1.4, 1.4, 1.4]])
    solid(x, z, w, d, h, COL.metal, 0, 0, COL.dark);
  // stations interactives (géométrie)
  const st = W.dyn.stations = {
    missions: { x: -8, z: 137.2, label: 'Missions', icon: '◆' }, squad: { x: 8, z: 137.2, label: 'Escouades', icon: '✦' },
    inventory: { x: -12, z: 163, label: 'Inventaire', icon: '▣' }, prof: { x: 0, z: 165, label: 'Profession', icon: '◎' },
    save: { x: 12, z: 163, label: 'Sauvegarde', icon: '⬡' }, depot: { x: 21, z: 151, label: 'Dépôt de modules', icon: '⬢' },
  };
  { const mb = B(-8, 137); mb.box(-8, 0, 136.4, 2.2, 1.1, 0.8, COL.dark); mb.box(-8, 1.1, 136.6, 2, 0.06, 0.5, PAL.cyan, 1); W.addBox(-8, 136.4, 2.2, 0.8, 1.1); }
  { const mb = B(8, 137); mb.box(8, 0, 136, 0.3, 3, 0.3, COL.dark); mb.box(6.2, 0, 136, 0.3, 3, 0.3, COL.dark); mb.box(9.8, 0, 136, 0.3, 3, 0.3, COL.dark); W.addBox(8, 136, 4, 0.4, 3); }
  { const mb = B(-12, 163); for (let k = -1; k <= 1; k++) mb.box(-12 + k * 1.1, 0, 164.4, 1, 2.2, 0.8, COL.metal, 0, 0, COL.dark); mb.box(-12, 2.2, 164.4, 3.3, 0.08, 0.82, PAL.or, 1); W.addBox(-12, 164.4, 3.4, 0.8, 2.2); }
  { const mb = B(0, 165); mb.cyl(0, 0, 166, 0.7, 1.2, COL.dark, 0, 8); mb.cyl(0, 1.2, 166, 0.5, 0.08, PAL.violet, 1, 8); W.addCyl(0, 166, 0.7, 1.2); }
  { const mb = B(12, 163); mb.cyl(12, 0, 164.5, 0.9, 0.5, COL.dark, 0, 8); mb.cyl(12, 0.5, 164.5, 0.35, 3, COL.panel, 0, 8); W.addCyl(12, 164.5, 0.9, 3.5); }
  { const mb = B(21, 151); mb.box(21, 0, 151.5, 2.4, 0.9, 1.6, COL.metal, 0, 0, COL.dark); W.addBox(21, 151.5, 2.4, 1.6, 0.9); }
  // pylône indicateur (anneau dynamique)
  { const mb = B(0, 150); mb.cyl(0, 0, 150, 1.4, 0.6, COL.dark, 0, 10); mb.cyl(0, 0.6, 150, 0.35, 8, COL.panel, 0, 8); W.addCyl(0, 150, 1.4, 8); }
  // --- tutoriel : capsule écrasée + poutre
  { const mb = B(8, 190); mb.box(9, 0, 191, 3.2, 2.4, 5, COL.panel, 0, 0.5, COL.dark); mb.box(9.6, 2.2, 192, 1.4, 0.3, 2.4, PAL.orange, 1, 0.5); mb.sphere(7, 0.2, 189, 1.6, COL.dark, 0, 7, 4, 0.5); W.addCyl(9, 191, 2.4, 2.4); }
  solid(3, 184.5, 24, 0.8, 0.85, COL.metal, 0, 0, COL.rust);
  for (const [x, z, r] of [[-12, 186, 3], [-16, 192, 4], [20, 186, 3.4], [24, 193, 4], [-6, 196, 2.5]]) rockAt(x, z, r, 0.8);

  // --- Centrale Éclipse
  const cw = (x, z, w, d) => { solid(x, z, w, d, 5, COL.concrete, 0, 0, COL.dark); B(x, z).box(x, 4.2, z, w + 0.1, 0.25, d + 0.1, COL.dark); on.box(x, 4.4, z, w + 0.14, 0.12, d + 0.14, PAL.cyan, 1); };
  cw(-19, -172, 26, 1.6); cw(19, -172, 26, 1.6); cw(-19, -108, 26, 1.6); cw(19, -108, 26, 1.6);
  cw(-32, -158, 1.6, 28); cw(-32, -122, 1.6, 28); cw(32, -158, 1.6, 28); cw(32, -122, 1.6, 28);
  for (const [x, z] of [[-32, -172], [32, -172], [-32, -108], [32, -108]]) { solid(x, z, 4, 4, 9, COL.dark); on.box(x, 9, z, 2.4, 0.3, 2.4, PAL.cyan, 1); off.box(x, 9, z, 1.2, 0.5, 1.2, PAL.orange, 1); }
  for (const [x, z] of [[-6, -108], [6, -108], [-6, -172], [6, -172], [-32, -145], [-32, -135], [32, -145], [32, -135]]) { solid(x, z, 1.6, 1.6, 6.5, COL.dark); off.box(x, 6.5, z, 0.7, 0.4, 0.7, PAL.orange, 1); on.box(x, 6.5, z, 1.2, 0.2, 1.2, PAL.cyan, 1); }
  // cœur du réacteur
  { const mb = B(0, -140); mb.cyl(0, 0, -140, 6, 3, COL.dark, 0, 16); mb.cyl(0, 3, -140, 3.6, 22, COL.concrete, 0, 12, 2.8); mb.cyl(0, 25, -140, 4.2, 1.2, COL.dark, 0, 12);
    W.addCyl(0, -140, 6, 3); W.addCyl(0, -140, 3.6, 26);
    for (let k = 0; k < 5; k++) { on.cyl(0, 6 + k * 4, -140, 3.75 - k * 0.15, 0.5, PAL.cyan, 1, 16); off.cyl(0, 6 + k * 4, -140, 3.72 - k * 0.15, 0.25, hex('#7a2b25'), 0.6, 12); }
    for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; on.box(Math.cos(a) * 16, 0.02, -140 + Math.sin(a) * 16, 0.5, 0.04, 20, PAL.cyan, 1, -a + PI / 2); }
    // socle du dispositif
    mb.box(0, 0, -131.6, 1.8, 1.1, 1.4, COL.metal, 0, 0, COL.dark); W.addBox(0, -131.6, 1.8, 1.4, 1.1);
  }
  // salles de contrôle (portes verrouillées hors service)
  const doors = W.dyn.doors = [];
  const room = (cx, side, id) => {
    const x0 = cx - 5, x1 = cx + 5, z0 = -147, z1 = -133, t = 0.6, mb = B(cx, -140);
    const wl = (x, z, w, d) => { solid(x, z, w, d, 5, COL.concrete, 0, 0, COL.dark); };
    wl(cx, z0, 10, t); wl(cx, z1, 10, t);
    const outer = side < 0 ? x0 : x1, inner = side < 0 ? x1 : x0;
    wl(outer, -140, t, 14);
    wl(inner, -144.5, t, 5); wl(inner, -135.5, t, 5); // ouverture de 4 m centrée
    mb.box(cx, 5, -140, 10.6, 0.5, 14.6, COL.dark); W.addBox(cx, -140, 10.6, 14.6, 0.5, 5);
    on.box(inner - side * 0.36, 4.1, -140, 0.1, 0.25, 4.6, PAL.cyan, 1); off.box(inner - side * 0.38, 4.2, -140, 0.1, 0.35, 1, PAL.orange, 1);
    const dcol = W.addBox(inner, -140, 0.5, 4, 4.2, 0, 'door');
    doors.push({ id, x: inner, z: -140, w: 0.5, d: 4, h: 4.2, col: dcol, open: 0, want: 0 });
    // intérieur : caisses
    for (const [dx, dz] of [[side * 2.5, -4.5], [side * 2.5, 4.5]]) solid(cx + dx, -140 + dz, 1.4, 1.4, 1.2, COL.metal, 0, 0, PAL.or);
  };
  room(-20, -1, 'west'); room(20, 1, 'east');
  // couvertures de la place
  for (const [x, z, w, d] of [[-12, -122, 6, 1.2], [12, -122, 6, 1.2], [-18, -152, 1.2, 6], [18, -152, 1.2, 6], [0, -158, 7, 1.2], [-8, -116, 1.4, 1.4], [9, -117, 1.4, 1.4], [-24, -128, 1.4, 1.4], [24, -160, 1.4, 1.4], [-5, -164, 1.4, 1.4]])
    solid(x, z, w, d, 1.25, COL.concrete2, 0, 0, COL.dark);
  // conduites extérieures & pylônes
  for (const [x, z] of [[-44, -128], [44, -150], [-40, -180], [38, -104]]) { solid(x, z, 1.4, 1.4, 7, COL.dark); on.box(x, 7, z, 0.9, 0.3, 0.9, PAL.cyan, 1); }

  // --- Labo 07 (bunker)
  { const cx = 170, cz = -10, x0 = cx - 7, x1 = cx + 7, z0 = cz - 6, z1 = cz + 6, t = 0.7;
    const wl = (x, z, w, d) => solid(x, z, w, d, 6, hex('#6c6a78'), 0, 0, COL.dark);
    wl(cx, z0, 14, t); wl(cx, z1, 14, t); wl(x1, cz, t, 12); wl(x0, cz - 4, t, 4); wl(x0, cz + 4, t, 4);
    B(cx, cz).box(cx, 6, cz, 14.8, 0.6, 12.8, COL.dark); W.addBox(cx, cz, 14.8, 12.8, 0.6, 6);
    B(cx, cz).box(x0 - 0.4, 4.4, cz, 0.12, 0.3, 4.4, PAL.violet, 1);
    const dcol = W.addBox(x0, cz, 0.6, 4, 4.4, 0, 'door');
    doors.push({ id: 'lab', x: x0, z: cz, w: 0.6, d: 4, h: 4.4, col: dcol, open: 0, want: 0 });
    // terminal du journal
    B(cx, cz).box(cx + 5, 0, cz, 0.8, 1.2, 1.8, COL.dark); B(cx, cz).box(cx + 4.6, 1.2, cz, 0.06, 0.7, 1.4, PAL.violet, 1); W.addBox(cx + 5, cz, 0.8, 1.8, 1.2);
    // panneau d'indice + vannes
    B(152, -18).box(152, 0, -20, 2.4, 2.2, 0.3, COL.dark); B(152, -18).box(152, 0.6, -19.83, 2, 1.2, 0.05, PAL.violet, 1); W.addBox(152, -20, 2.4, 0.3, 2.2);
    for (const [x, z] of [[146, -22], [149, 3], [141, -8]]) { B(x, z).cyl(x, 0, z, 0.55, 1, COL.metal, 0, 8); W.addCyl(x, z, 0.55, 1); }
    for (const [x, z] of [[160, -15], [160, -5]]) solid(x, z, 1.4, 1.4, 1.2, COL.metal, 0, 0, COL.dark);
  }
  W.dyn.valves = [{ x: 146, z: -22, on: false }, { x: 149, z: 3, on: false }, { x: 141, z: -8, on: false }];
  W.dyn.labLights = [{ x: 158, z: -13.5 }, { x: 158, z: -10 }, { x: 158, z: -6.5 }];

  // --- ruines du sentier ouest
  const ruin = (x, z) => {
    for (let k = 0; k < 5; k++) {
      const vert = rng() < 0.5, w = vert ? 1 : 3 + rng() * 5, d = vert ? 3 + rng() * 5 : 1, h = 1.1 + rng() * 2.8;
      const xx = x + (rng() - 0.5) * 16, zz = z + (rng() - 0.5) * 16; if (distToPaths(xx, zz) < 3.5) continue;
      solid(xx, zz, w, d, h, mix3(COL.panel, COL.concrete, 0.6), 0, 0, COL.moss2); if (rng() < 0.5) B(xx, zz).box(xx, h - 0.4, zz, w + 0.05, 0.1, d + 0.05, PAL.orange, 0.8);
    }
    for (let k = 0; k < 3; k++) { const xx = x + (rng() - 0.5) * 14, zz = z + (rng() - 0.5) * 14; if (distToPaths(xx, zz) < 3) continue; solid(xx, zz, 1.2, 1.2, 1.1, COL.metal, 0, 0, COL.rust); }
  };
  for (const [x, z] of [[-92, 18], [-100, -30], [-64, -72], [-120, 70], [-58, 46], [-140, -60]]) ruin(x, z);
  // gorge : pierres et cristaux
  for (const [x, z] of [[60, 50], [86, 12], [62, -22], [84, -60], [52, -80]]) { for (let k = 0; k < 3; k++) { const xx = x + rng() * 12 - 6, zz = z + rng() * 12 - 6; if (distToPaths(xx, zz) > 3) rockAt(xx, zz, 1 + rng() * 1.4, 0.8); }
    for (let k = 0; k < 4; k++) { const xx = x + rng() * 14 - 7, zz = z + rng() * 14 - 7, h = 1.5 + rng() * 2.5; F(xx, zz).cyl(xx, 0, zz, 0.35, h, k % 2 ? PAL.cyan : PAL.violet, 1, 5, 0.02); } }
  // forêt
  let placed = 0;
  for (let tries = 0; tries < 900 && placed < 95; tries++) {
    const x = -190 + rng() * 285, z = -175 + rng() * 345; if (!ok(x, z, 7)) continue; if (Math.abs(x) < 6 && z > 120) continue;
    tree(x, z, 0.8 + rng() * 0.55); placed++;
  }
  for (let k = 0; k < 70; k++) { const x = -190 + rng() * 290, z = -180 + rng() * 350; if (!ok(x, z, 4)) continue; rockAt(x, z, 0.7 + rng() * 1.6, 0.75); }
  // arbustes, herbes et flore lumineuse (non bloquants)
  for (let k = 0; k < 1700; k++) {
    const x = -195 + rng() * 300, z = -195 + rng() * 390; if (inAP(x, z, 1) || distToPaths(x, z) < 2.2 || inMassif(x, z) || Math.hypot(x - CENT.x, z - CENT.z) < 36) continue;
    const r = rng();
    if (r < 0.7) { const gc = mix3(COL.grass, COL.leaf2, rng()); for (let b = 0; b < 3; b++) { const ox = rng() * 0.5 - 0.25, oz = rng() * 0.5 - 0.25; F(x, z).cyl(x + ox, 0, z + oz, 0.05 + rng() * 0.04, 0.35 + rng() * 0.55, gc, 0, 3, 0.0, false); } }
    else if (r < 0.9) F(x, z).sphere(x, 0.3, z, 0.5 + rng() * 0.6, mix3(COL.leaf, COL.leaf3, rng()), 0, 6, 4, 0.7);
    else F(x, z).sphere(x, 0.15, z, 0.15 + rng() * 0.12, rng() < 0.5 ? PAL.cyan : PAL.violet, 1, 5, 3);
  }

  // finalise les tronçons
  for (let i = 0; i < NC * NC; i++) {
    const cx = -MAP + (i % NC) * CH + CH / 2, cz = -MAP + Math.floor(i / NC) * CH + CH / 2;
    W.chunks.push({ cx, cz, mesh: base[i].count ? R.mesh(base[i]) : null, flora: flora[i].count ? R.mesh(flora[i]) : null });
  }
  W.dyn.centOn = { mesh: R.mesh(on), emi: 1 }; W.dyn.centOff = { mesh: R.mesh(off), emi: 1 };

  // --- points d'intérêt, relais, caches
  W.dyn.pois = [
    { id: 'arche', name: 'Arche fossile', x: -150, z: -100 }, { id: 'nid', name: 'Nid de drones', x: 76, z: 64 },
    { id: 'source', name: 'Source violette', x: -132, z: 30 }, { id: 'epave', name: 'Épave du Vesper-3', x: -80, z: -98 },
    { id: 'observ', name: 'Observatoire effondré', x: -60, z: 128 }, { id: 'racines', name: 'Racines-mères', x: 46, z: 118 },
    { id: 'faille', name: 'Faille scellée', x: 98, z: -10 }, { id: 'echo', name: 'Écho de la Centrale', x: -48, z: -150 },
  ];
  W.dyn.relays = [
    { id: 'r1', x: -120, z: 92 }, { id: 'r2', x: -98, z: -8 }, { id: 'r3', x: -58, z: -64 },
    { id: 'r4', x: 62, z: 88 }, { id: 'r5', x: 82, z: -32 }, { id: 'r6', x: 42, z: -96 },
  ];
  for (const r of W.dyn.relays) { B(r.x, r.z).box(r.x, 0, r.z, 1.2, 0.6, 1.2, COL.dark); B(r.x, r.z).box(r.x, 0.6, r.z, 0.4, 3.4, 0.4, COL.metal); W.addBox(r.x, r.z, 1.2, 1.2, 4); }
  W.dyn.caches = [];
  const cachePos = [[-70, 60], [-110, 40], [-88, -50], [-50, -100], [-150, 10], [-140, 110], [58, 100], [88, 30], [58, -60], [90, -90], [-30, 110], [30, 104], [-170, -140], [-10, -186], [150, -24], [175, 0]];
  for (const [x, z] of cachePos) { if (!W.freeAt(x, z, 1)) continue; W.dyn.caches.push({ x, z, open: false }); W.addBox(x, z, 1.1, 0.8, 0.7); }
  // plateformes
  W.dyn.vesper = { x: -45, z: 100 };
  { const mb = B(-45, 100); mb.cyl(-45, 0, 100, 5, 0.25, COL.dark, 0, 16); mb.cyl(-45, 0.25, 100, 4.4, 0.04, PAL.or, 0.8, 16, 4.4); mb.cyl(-45, 0.27, 100, 4.0, 0.04, COL.dark, 0, 16, 4.0); }
  W.dyn.crash = [{ x: -112, z: -44 }, { x: 80, z: -50 }];
  for (const c of W.dyn.crash) { const mb = B(c.x, c.z); mb.box(c.x + 2, 0, c.z, 3, 1.6, 6, COL.metal, 0, 0.6, COL.dark); mb.box(c.x - 3, 0, c.z + 2, 2.4, 1.1, 2, COL.panel, 0, -0.4); W.addCyl(c.x + 2, c.z, 2.4, 1.6); }
  W.dyn.reconZones = [{ x: -96, z: 44 }, { x: 72, z: 26 }, { x: -60, z: -54 }];

  // points de couverture : faces des petites boîtes
  W.cover = [];
  for (const o of W.all) {
    if (o.t !== 0 || o.y1 < 1.0 || o.y1 > 2.6 || o.y0 > 0.1) continue;
    const cx = (o.x0 + o.x1) / 2, cz = (o.z0 + o.z1) / 2;
    for (const [x, z] of [[o.x0 - 0.8, cz], [o.x1 + 0.8, cz], [cx, o.z0 - 0.8], [cx, o.z1 + 0.8]]) if (W.freeAt(x, z, 0.4)) W.cover.push({ x, z, h: o.y1 });
  }
  W.sky = buildSky();
}

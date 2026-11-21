'use strict';
/* FRACTURE — rendu de la scène. */
const GFX = {
  faible: { scale: 0.55, fogD: 0.0135, flora: false, lights: 2, particles: 0.5 },
  moyen: { scale: 0.75, fogD: 0.0105, flora: true, lights: 3, particles: 1 },
  eleve: { scale: 1.0, fogD: 0.0085, flora: true, lights: 4, particles: 1 },
};
const ENV = { sun: (() => { const v = [-0.55, 0.5, 0.3], l = Math.hypot(...v); return v.map(x => x / l); })(), sunC: [0.98, 0.8, 0.58], sky: [0.42, 0.52, 0.66], gnd: [0.24, 0.25, 0.25], fog: hex('#4a6079'), fogD: 0.0105, maxLights: 3, sky_mesh: null };
const C_DARK = hex('#1d2b3d'), C_METAL = hex('#59606e'), C_RUST = hex('#8a4f3c'), C_DER = hex('#3b3440'), C_DER2 = hex('#4b4250'), C_ASH = hex('#6b6f78');
const NPC_PAL = { body: hex('#c9c2b0'), accent: PAL.or, visor: PAL.or, dark: hex('#243042') };
const PAL_DER = { body: C_DER, accent: C_RUST, visor: PAL.orange, dark: hex('#241f28') };
const PAL_SEN = { body: C_DER2, accent: C_RUST, visor: PAL.orange, dark: hex('#241f28') };
const PAL_ASH = { body: C_ASH, accent: PAL.orange, visor: PAL.orange, dark: hex('#30333a') };
const _rt = M4.create();
function humanoid(a, pal, o = {}) {
  const s = o.s || 1, down = a.downed;
  M4.trs(_rt, a.x, a.y + (down ? 0.22 : 0), a.z, a.yaw, down ? -1.45 : 0, s, s, s);
  const amp = clamp((a.mv || 0) / 4.5, 0, 1), sw = Math.sin(a.walk || 0) * 0.65 * amp, cr = a.crouch > 0.5 ? 0.6 : 1, hip = 0.9 * cr;
  const q = (m, x, y, z, yaw, p, sx, sy, sz, c, e) => R.q(m, x, y, z, yaw, p, sx, sy, sz, c, e || 0, _rt);
  for (const sd of [-1, 1]) { const p = sd * sw, L = 0.9 * cr; q(R.cube, sd * 0.13, hip - L / 2 * Math.cos(p), -L / 2 * Math.sin(p), 0, p, 0.17, L, 0.2, pal.dark); q(R.cube, sd * 0.13, hip - L * 0.5 * Math.cos(p), -L * 0.5 * Math.sin(p) + 0.1, 0, p, 0.15, 0.13, 0.05, pal.body); }
  q(R.cube, 0, hip, 0, 0, 0, 0.38, 0.2, 0.25, pal.dark);
  q(R.cube, 0, hip + 0.33, 0, 0, 0, 0.47, 0.5, 0.29, pal.body);
  q(R.cubeE, 0, hip + 0.42, 0.15, 0, 0, 0.3, 0.05, 0.02, pal.accent, 1.2);
  if (o.trim) q(R.cubeE, 0, hip + 0.1, 0.15, 0, 0, 0.44, 0.03, 0.02, PAL.or, 1.2);
  q(R.cube, 0, hip + 0.34, -0.2, 0, 0, 0.34, 0.42, 0.14, pal.dark);
  if (a.carry) q(R.cubeE, 0, hip + 0.55, -0.33, G.t * 2, 0, 0.26, 0.26, 0.26, a.carry === 'noyau' ? PAL.violet : PAL.cyan, 1.6);
  q(R.cube, 0, hip + 0.76, 0.01, 0, 0, 0.25, 0.27, 0.27, pal.body); q(R.cube, 0, hip + 0.9, -0.01, 0, 0, 0.27, 0.06, 0.29, pal.dark);
  q(R.cube, 0, hip + 0.02, 0.01, 0, 0, 0.42, 0.07, 0.28, pal.dark);
  for (const sd of [-1, 1]) q(R.cube, sd * 0.3, hip + 0.6, 0, 0, 0, 0.2, 0.1, 0.27, pal.accent, 0.25);
  q(R.cubeE, 0, hip + 0.78, 0.14, 0, 0, o.eye ? 0.08 : 0.2, 0.08, 0.02, pal.visor, 1.6);
  const armed = o.armed && !down, ap = armed ? -1.4 + (o.aimP || 0) : 0;
  for (const sd of [-1, 1]) {
    let p = armed ? ap : -sd * sw * 0.8; if (a.emote && G.t < a.emoteT) { if (a.emote === 'Salut' && sd === 1) p = -2.7 + Math.sin(G.t * 12) * 0.25; else if (a.emote === 'Pouce' && sd === 1) p = -1.6; else if (a.emote === 'Danse') p = -2.6 + Math.sin(G.t * 9 + sd * 1.5) * 0.6; }
    const L = 0.62, sy0 = hip + 0.53; q(R.cube, sd * 0.3, sy0 - L / 2 * Math.cos(p), -L / 2 * Math.sin(p), 0, p, 0.13, L, 0.14, pal.body);
  }
  if (!down && !(a.emote && G.t < a.emoteT)) {
    if (armed) { const gp = o.aimP || 0; q(R.cube, 0.12, hip + 0.47 - gp * 0.25, 0.45, 0, gp, 0.08, 0.11, 0.64, C_METAL); q(R.cubeE, 0.12, hip + 0.52 - gp * 0.3, 0.6, 0, gp, 0.03, 0.03, 0.3, pal.accent, 1); }
    else q(R.cube, 0.22, hip + 0.28, 0.2, -0.4, 0.9, 0.08, 0.11, 0.6, C_METAL);
  }
  if (o.growth) { q(R.sphE, 0.24, hip + 0.66, -0.06, 0, 0, 0.2, 0.2, 0.2, PAL.violet, 0.8); q(R.sphE, -0.16, hip + 0.2, -0.16, 0, 0, 0.14, 0.14, 0.14, PAL.violet, 0.8); }
  if (o.shield) q(R.cube, -0.4, hip + 0.38, 0.12, 0, 0, 0.08, 0.7, 0.42, C_RUST);
  if (!down) R.qAlpha(R.discM, a.x, W.groundAt(a.x, a.z, a.y + 0.1, a.r) + 0.03, a.z, 0, 1.0 * s, 1, 1.0 * s, PAL.black, 0.32);
}
function drone(a) {
  const tilt = clamp((a.mv || 0) / 14, 0, 0.35);
  M4.trs(_rt, a.x, a.y, a.z, a.yaw, tilt, 1, 1, 1);
  const q = (m, x, y, z, yaw, p, sx, sy, sz, c, e) => R.q(m, x, y, z, yaw, p, sx, sy, sz, c, e || 0, _rt);
  q(R.sph, 0, 0, 0, 0, 0, 0.95, 0.34, 0.95, C_DARK);
  q(R.ringM, 0, 0, 0, G.t * 3, 0, 1.5, 1, 1.5, PAL.orange, 1.1);
  q(R.sphE, 0, -0.02, 0.36, 0, 0, 0.26, 0.26, 0.26, (a.ai.sigT || 0) > G.t + 7 ? PAL.or : PAL.orange, 2.2);
  for (let k = 0; k < 4; k++) { const an = k / 4 * TAU + PI / 4; q(R.cube, Math.cos(an) * 0.55, 0.08, Math.sin(an) * 0.55, -an, 0, 0.5, 0.05, 0.08, C_METAL); q(R.discM, Math.cos(an) * 0.8, 0.14, Math.sin(an) * 0.8, G.t * 30, 0, 0.42, 1, 0.42, C_METAL); }
  R.qAlpha(R.discM, a.x, 0.04, a.z, 0, 1.2, 1, 1.2, PAL.black, 0.22);
}
function gardien(a) {
  const ai = a.ai; M4.trs(_rt, a.x, a.y, a.z, a.yaw, 0, 1, 1, 1);
  const q = (m, x, y, z, yaw, p, sx, sy, sz, c, e) => R.q(m, x, y, z, yaw, p, sx, sy, sz, c, e || 0, _rt);
  q(R.sph, 0, 0, 0, 0, 0, 2.6, 2.4, 2.6, hex('#2a2440'));
  for (let k = 0; k < 3; k++) q(R.ringM, 0, 0, 0, G.t * (0.6 + k * 0.4) + k, 0.6 + k * 0.7 + Math.sin(G.t + k) * 0.3, 4.2 - k * 0.4, 1, 4.2 - k * 0.4, k === 1 ? PAL.cyan : PAL.violet, 1.2);
  const pulse = 0.6 + Math.sin(G.t * 10) * 0.4;
  q(R.sphE, 0, 0, 1.0, 0, 0, ai.vent ? 1.1 : 0.7, ai.vent ? 1.1 : 0.7, ai.vent ? 1.1 : 0.7, ai.vent ? PAL.cyan : PAL.violet, ai.vent ? 2 + pulse : 0.5);
  if (ai.shield > 0) R.qAdd(R.sphE, a.x, a.y, a.z, 0, 0, 4.6, 4.6, 4.6, [0.05, 0.22 * pulse, 0.22 * pulse]);
  R.qAlpha(R.discM, a.x, 0.04, a.z, 0, 3, 1, 3, PAL.black, 0.3);
}
function deviceDraw(dv) {
  const k = G.mission && G.mission.dur ? G.mission.prog / G.mission.dur : 0;
  R.q(R.cubeE, dv.x, 1.35 + Math.sin(G.t * 3) * 0.05, dv.z, G.t, 0, 0.5, 0.5, 0.5, PAL.cyan, 1.5 + k);
  R.qAdd(R.cylE, dv.x, 1.6 + 5, dv.z, 0, 0, 0.18, 10, 0.18, [0.04, 0.3 * (0.4 + k), 0.28 * (0.4 + k)]);
  R.qAdd(R.ringM, dv.x, 0.06, dv.z, 0, 0, 6, 1, 6, [0.05 * k, 0.3 * k + 0.05, 0.28 * k + 0.05]);
}
function inFront(x, z, far, rad = 2) { const dx = x - R.cam.x, dz = z - R.cam.z, d = Math.hypot(dx, dz); if (d > far) return false; return dx * G.camDir[0] + dz * G.camDir[2] > -rad - 4; }
const STATICS = [];
function renderScene(dt) {
  const Qp = G.q || GFX.moyen; ENV.fogD = Qp.fogD; ENV.maxLights = Qp.lights; ENV.sky_mesh = W.sky;
  const far = 2.1 / Qp.fogD;
  // statiques
  STATICS.length = 0;
  for (const c of W.chunks) {
    const dx = c.cx - R.cam.x, dz = c.cz - R.cam.z, d = Math.hypot(dx, dz);
    if (d - 36 > far) continue; if (dx * G.camDir[0] + dz * G.camDir[2] < -40) continue;
    if (c.mesh) STATICS.push(c); if (Qp.flora && c.flora && d - 36 < far * 0.8) STATICS.push({ mesh: c.flora });
  }
  const k = G.cent.k, flick = 0.75 + Math.sin(G.t * 23) * 0.15 + Math.sin(G.t * 7) * 0.1;
  W.dyn.centOn.emi = 0.04 + 1.5 * k; W.dyn.centOff.emi = (1 - k) * 1.3 * flick; W.dyn.centOff.hidden = k > 0.98;
  STATICS.push(W.dyn.centOn, W.dyn.centOff);
  // lumières
  R.lights.length = 0;
  R.lights.push({ x: 0, y: 7, z: 150, r: 34, c: [0.55, 0.42, 0.28] });
  R.lights.push({ x: 0, y: 12, z: -140, r: 26 + 46 * k, c: [lerp(0.5, 0.15, k) * 1.0, lerp(0.12, 0.8, k), lerp(0.1, 0.78, k)] });
  R.lights.push({ x: 170, y: 4, z: -10, r: 15, c: [0.45, 0.32, 0.7] });
  for (const l of G.light) R.lights.push(l);
  // portes
  for (const d of W.dyn.doors) R.q(R.cube, d.x, d.h / 2 + d.open * (d.h - 0.35), d.z, 0, 0, d.w, d.h, d.d, d.id === 'lab' ? hex('#4a4656') : C_METAL, 0);
  // pylône de l'Avant-Poste
  const pc = G.cent.active ? PAL.cyan : PAL.orange;
  R.q(R.ringM, 0, 7.3, 150, G.t * 0.8, 0, 3.4, 3.4, 3.4, pc, 1.6); R.q(R.ringM, 0, 7.3, 150, -G.t * 1.2, PI / 2, 2.4, 2.4, 2.4, pc, 1.6);
  R.q(R.sphE, 0, 8.4, 150, 0, 0, 0.6, 0.6, 0.6, pc, 2);
  // stations : icônes holographiques
  const S = W.dyn.stations, bob = Math.sin(G.t * 2) * 0.12;
  for (const key of ['missions', 'squad', 'inventory', 'prof', 'save', 'depot']) { const st = S[key]; if (!inFront(st.x, st.z, 70)) continue; R.qAdd(R.cubeE, st.x, 2.7 + bob, st.z - 0.4, G.t, 0.785, 0.32, 0.32, 0.32, key === 'missions' ? [0.9, 0.7, 0.35] : key === 'depot' ? [0.18, 0.75, 0.7] : [0.2, 0.55, 0.55]); }
  R.qAdd(R.cubeE, 8, 1.9, 136.25, 0, 0, 3.3, 1.5, 0.04, [0.04, 0.2, 0.2]); // tableau holo
  humanoid({ x: -8, y: 0, z: 135.3, yaw: 0, mv: 0, walk: 0, carry: null }, NPC_PAL);
  // relais, caches, vannes, terminaux
  for (const r of W.dyn.relays) { if (!inFront(r.x, r.z, far)) continue; const okR = G.save && G.save.relays.includes(r.id); R.q(R.sphE, r.x, 4.15, r.z, 0, 0, 0.45, 0.45, 0.45, okR ? PAL.cyan : PAL.orange, okR ? 2 : (Math.sin(G.t * 17 + r.x) > 0.3 ? 1.5 : 0.2)); }
  for (const c of W.dyn.caches) { if (!inFront(c.x, c.z, far * 0.7)) continue; R.q(R.cube, c.x, 0.3, c.z, 0, 0, 1.1, 0.6, 0.8, C_METAL); if (!c.open) R.q(R.cubeE, c.x, 0.64, c.z, 0, 0, 1.12, 0.08, 0.82, PAL.or, 1.3 + Math.sin(G.t * 3) * 0.3); else R.q(R.cube, c.x, 0.75, c.z - 0.35, 0, -1.1, 1.1, 0.08, 0.8, C_DARK); }
  if (inFront(160, -10, far)) {
    W.dyn.valves.forEach(v => R.q(R.ringM, v.x, 1.15, v.z, G.t * (v.on ? 2 : 0), PI / 2, 0.9, 0.9, 0.9, v.on ? PAL.violet : C_METAL, v.on ? 1.4 : 0.1));
    W.dyn.labLights.forEach((l, i) => { R.q(R.cube, l.x, 1.1, l.z, 0, 0, 0.2, 2.2, 0.2, C_DARK); const lit = G.labL && G.labL[i]; R.q(R.sphE, l.x, 2.4, l.z, 0, 0, 0.32, 0.32, 0.32, lit ? PAL.violet : C_DARK, lit ? 1.1 : 0.05); });
  }
  if (inFront(-23, -140, far)) { R.q(R.cube, -24, 0.6, -140, 0, 0, 0.7, 1.2, 1.6, C_DARK); R.q(R.cubeE, -23.62, 1.0, -140, 0, 0, 0.04, 0.6, 1.3, G.cent.active ? PAL.cyan : C_DARK, G.cent.active ? 1.4 : 0); }
  // mission : balise, zone, objets
  const m = G.mission;
  if (m && m.beacon && !m.dlDone) { const b = m.beacon, d = Math.hypot(G.P.x - b.x, G.P.z - b.z); if (b.seen || d < 14) { R.q(R.cube, b.x, 0.25, b.z, 0.4, 0, 0.5, 0.5, 0.5, C_DARK); R.q(R.sphE, b.x, 0.7, b.z, 0, 0, 0.22, 0.22, 0.22, PAL.orange, Math.sin(G.t * 8) > 0 ? 2.5 : 0.3); } }
  if (m && m.steps[m.stepI] && m.steps[m.stepI].tgt) { const t = m.steps[m.stepI].tgt(); if (t && t.area) R.qAdd(R.ringM, t.x, 0.1, t.z, 0, 0, t.r * 2, 1, t.r * 2, [0.18, 0.12, 0.06]); }
  for (const it of G.items) { if (it.kind === 'noyau') R.q(R.sphE, it.x, 0.5 + Math.sin(G.t * 2) * 0.1, it.z, 0, 0, 0.45, 0.45, 0.45, PAL.violet, 2); else R.q(R.cubeE, it.x, 0.45, it.z, G.t, 0, 0.4, 0.4, 0.4, PAL.cyan, 1.8); R.qAdd(R.cylE, it.x, 3, it.z, 0, 0, 0.2, 6, 0.2, [0.05, 0.2, 0.2]); }
  if (m && m.def.id === 'C' && m.stepId === 'pickup') R.q(R.cubeE, 21, 1.15, 151.5, G.t, 0, 0.38, 0.38, 0.38, PAL.cyan, 1.8);
  // ping
  if (G.ping) R.qAdd(R.cylE, G.ping.x, 4, G.ping.z, 0, 0, 0.25, 8, 0.25, G.ping.kind === 'enemy' ? [0.4, 0.12, 0.06] : [0.06, 0.32, 0.3]);
  for (const p of (NET.peerPings || [])) R.qAdd(R.cylE, p.x, 4, p.z, 0, 0, 0.2, 8, 0.2, [0.25, 0.25, 0.08]);
  // acteurs
  for (const a of G.actors) {
    if (!a.alive || !inFront(a.x, a.z, far)) continue;
    a.walk = (a.walk || 0) + (a.mv || 0) * dt * 2.3;
    if (a.kind === 'player' || a.kind === 'bot') { const isP = a.kind === 'player'; humanoid(a, OUTFITS[a.outfit] || OUTFITS[0], { armed: isP ? (I.fire || G.t - a.lastShot < 0.8 || a.aim) : G.t - a.lastShot < 1.2, aimP: isP ? -G.cam.pitch * 0.8 : 0, trim: isP && G.save.owned.includes('trim') }); }
    else if (a.kind === 'patrol') humanoid(a, PAL_DER, { armed: true, growth: true });
    else if (a.kind === 'sentinel') humanoid(a, PAL_SEN, { armed: true, s: 1.12, shield: true, eye: true });
    else if (a.kind === 'rival') humanoid(a, PAL_ASH, { armed: true });
    else if (a.kind === 'drone') drone(a);
    else if (a.kind === 'gardien') gardien(a);
    else if (a.kind === 'device') deviceDraw(a);
  }
  for (const pr of (NET.remote || [])) { if (!inFront(pr.x, pr.z, far)) continue; pr.walk = (pr.walk || 0) + (pr.mv || 0) * dt * 2.3; humanoid(pr, OUTFITS[pr.outfit] || OUTFITS[0], { armed: false }); }
  // effets
  const PQ = Qp.particles;
  for (const t of G.fx.tr) {
    const dx = t.x1 - t.x0, dy = t.y1 - t.y0, dz = t.z1 - t.z0, l = Math.hypot(dx, dy, dz) || 0.01, k = 1 - t.life / t.max, sl = Math.min(5, l * 0.5);
    const hd = clamp(k * (l + sl), sl, l), mid = hd - sl / 2, mx = t.x0 + dx / l * mid, my = t.y0 + dy / l * mid, mz = t.z0 + dz / l * mid;
    if (Math.hypot(mx - R.cam.x, my - R.cam.y, mz - R.cam.z) < 2.2) continue;
    R.qAdd(R.cubeE, mx, my, mz, Math.atan2(dx, dz), -Math.asin(clamp(dy / l, -1, 1)), t.w, t.w, sl, [t.c[0] * 0.85, t.c[1] * 0.85, t.c[2] * 0.85]); }
  // spores ambiantes (organique)
  if (PQ >= 1) for (let i = 0; i < 28; i++) { const a = i * 2.399, r = 4 + (i * 7.3) % 22, x = R.cam.x + Math.cos(a + G.t * 0.03) * r, z = R.cam.z + Math.sin(a + G.t * 0.03) * r, y = 0.6 + ((i * 3.7 + G.t * 0.25) % 5);
    const c = i % 3 ? [0.05, 0.22, 0.2] : [0.16, 0.1, 0.24]; R.qAdd(R.cubeE, x, y, z, G.t + i, 0.7, 0.06, 0.06, 0.06, c); }
  for (let i = 0; i < G.fx.sp.length; i++) { if (PQ < 1 && i % 2) continue; const s = G.fx.sp[i], f = clamp(s.life * 3, 0, 1); R.qAdd(R.cubeE, s.x, s.y, s.z, 0, 0, 0.07, 0.07, 0.07, [s.c[0] * f, s.c[1] * f, s.c[2] * f]); }
  for (const r of G.fx.rings) { const f = r.life / r.max, rr = lerp(r.r1, r.r0, f); R.qAdd(R.ringM, r.x, r.y, r.z, 0, 0, rr * 2, 1, rr * 2, [r.c[0] * f * 0.6, r.c[1] * f * 0.6, r.c[2] * f * 0.6]); }
  if (G.cent.k > 0.02 && G.cent.k < 0.98) R.qAdd(R.cylE, 0, 60, -140, 0, 0, 3 * G.cent.k, 120, 3 * G.cent.k, [0.05, 0.5 * (1 - G.cent.k) + 0.1, 0.48 * (1 - G.cent.k) + 0.1]);
  R.frame(ENV, STATICS);
}
function updateCamera(dt) {
  const P = G.P, c = G.cam, w = WEAPONS[P.w]; const aim = P.aim && !P.downed && P.alive;
  c.k = lerp(c.k, aim ? 1 : 0, 1 - Math.exp(-dt * 12)); c.pitch = clamp(c.pitch, -0.75, 1.05);
  const dist = lerp(4.25, 1.8, c.k), sh = lerp(0.82, 0.66, c.k), fov = lerp(66, w.zoom, c.k) * PI / 180;
  const cy = Math.cos(c.yaw), sy = Math.sin(c.yaw), cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
  const dir = [sy * cp, -sp, cy * cp], right = [-cy, 0, sy];
  const px = P.x + right[0] * sh, py = P.y + (P.downed ? 0.8 : 1.72), pz = P.z + right[2] * sh;
  const tx = px - dir[0] * dist, ty = py - dir[1] * dist + 0.18, tz = pz - dir[2] * dist;
  let vx = tx - px, vy = ty - py, vz = tz - pz; const vl = Math.hypot(vx, vy, vz); vx /= vl; vy /= vl; vz /= vl;
  const h = W.raycast(px, py, pz, vx, vy, vz, vl + 0.3); let want = h ? Math.max(0.35, h.t - 0.3) : vl;
  c.dist = want < c.dist ? want : lerp(c.dist, want, Math.min(1, dt * 5));
  let ex = px + vx * c.dist, ey = Math.max(0.3, py + vy * c.dist), ez = pz + vz * c.dist;
  G.camPos = [ex, ey, ez]; G.camDir = dir; G.fov = fov;
  R.setCamera(ex, ey, ez, ex + dir[0] * 10, ey + dir[1] * 10, ez + dir[2] * 10, fov, 2.4 / ENV.fogD + 50);
}
function menuCamera(t) {
  const P = G.P; P.yaw = 0.35 + Math.sin(t * 0.35) * 0.55;
  const ex = P.x + 0.5, ez = P.z + 4.4, ey = 1.45, tx = P.x + 1.45, tz = P.z, ty = 1.05;
  const dx = tx - ex, dz = tz - ez, l = Math.hypot(dx, dz); G.camDir = [dx / l, 0, dz / l]; G.camPos = [ex, ey, ez];
  R.setCamera(ex, ey, ez, tx, ty, tz, 0.78, 300);
}

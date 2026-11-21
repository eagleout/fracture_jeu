'use strict';
/* FRACTURE — simulation : personnages, IA, armes, missions, monde persistant. */
const WEAPONS = [
  { id: 'vx7', name: 'VX-7 Ligne', short: 'Fusil polyvalent', dmg: 17, rpm: 540, mag: 30, reload: 1.8, range: 95, fall0: 38, hip: 1.8, ads: 0.5, pellets: 1, auto: true, kick: 0.010, zoom: 50, assist: 4.5, snd: 'rifle' },
  { id: 'brisant', name: 'Brisant SG-4', short: 'Courte portée', dmg: 11, rpm: 85, mag: 6, reload: 2.3, range: 24, fall0: 8, hip: 6.5, ads: 4.6, pellets: 8, auto: false, kick: 0.05, zoom: 58, assist: 6, snd: 'shotgun' },
  { id: 'aiguille', name: 'Aiguille LR', short: 'Fusil de précision', dmg: 82, rpm: 52, mag: 5, reload: 2.6, range: 230, fall0: 160, hip: 4.2, ads: 0, pellets: 1, auto: false, kick: 0.07, zoom: 24, assist: 2, snd: 'sniper' },
];
const ARCH = {
  patrol: { name: 'Patrouilleur', hp: 70, speed: 3.4, sight: 34, dmg: 6, xp: 10, cr: 5 },
  sentinel: { name: 'Sentinelle', hp: 150, speed: 2.8, sight: 40, dmg: 12, xp: 18, cr: 8 },
  drone: { name: 'Drone', hp: 45, speed: 7, sight: 46, dmg: 3, xp: 8, cr: 4 },
  gardien: { name: 'Gardien 07', hp: 1400, speed: 1.5, sight: 30, dmg: 7, xp: 150, cr: 120 },
  rival: { name: 'Cendre', hp: 100, speed: 4, sight: 40, dmg: 7, xp: 25, cr: 12 },
};
const OUTFITS = [
  { name: 'Sable', body: hex('#E9E3D4'), accent: PAL.orange, visor: PAL.cyan, dark: hex('#24344a') },
  { name: 'Abysse', body: hex('#2d4466'), accent: PAL.cyan, visor: PAL.or, dark: hex('#142234') },
  { name: 'Aurore', body: hex('#7d64c4'), accent: PAL.or, visor: PAL.ivoire, dark: hex('#2a2440') },
];
const PROFS = {
  eclaireur: { name: 'Éclaireur', icon: '◈', ability: 'Scan', abilityCd: 18, desc: 'Repère les points d’intérêt, révèle balises et ennemis, accepte les missions de reconnaissance.', perks: ['Scan : révèle ennemis et balises (60 m)', 'Découvre les points d’intérêt', '+8 % de vitesse', 'Réputation d’exploration ×1,5'] },
  ingenieur: { name: 'Ingénieur', icon: '⚙', ability: 'Nano-soin', abilityCd: 24, desc: 'Répare les installations, transporte les modules énergétiques et restaure les infrastructures.', perks: ['Répare relais et dispositifs', 'Installe un module en 3 s (8 s sinon)', 'Porte les modules sans ralentir', 'Nano-soin : +35 PV à l’escouade proche'] },
};
const BOTS = [
  { name: 'Mira', prof: 'eclaireur', outfit: 2, line: 'Mira, éclaireuse. Je couvre les flancs.' },
  { name: 'Kaï', prof: 'ingenieur', outfit: 1, line: 'Kaï, ingénieur. Je garde les machines en vie.' },
  { name: 'Dov', prof: 'eclaireur', outfit: 0, line: 'Dov. Je tire d’abord, je pose les questions après.' },
];
const MSGS = ['Regroupement !', 'Besoin d’aide !', 'Réanimez-moi !', 'Bien joué !', 'En position.', 'Attendez-moi.', 'Merci !', 'Ennemi repéré.'];
const EMOTES = ['Salut', 'Pouce', 'Danse'];

/* ---------------- état global ---------------- */
let UID = 0;
const G = {
  t: 0, paused: true, state: 'boot', actors: [], fx: { tr: [], sp: [], rings: [], floats: [] }, pings: [], feed: [],
  cam: { yaw: PI, pitch: 0.12, k: 0, dist: 3.7 }, camPos: [0, 0, 0], camDir: [0, 0, -1], fov: 1.1,
  P: null, mission: null, save: null, cent: { active: false, since: 0, by: '', k: 0 }, items: [], focus: null, holdT: 0,
  marks: new Map(), lastZone: '', q: null, dbg: { fps: 0 }, ev: (t, d) => { try { UI.onEvent(t, d); } catch (e) { console.error(e); G.lastError = 'ev ' + t + ': ' + (e && e.stack || e); } },
};
const I = { mx: 0, my: 0, run: false, fire: false, firePressed: false, aim: false, jump: false, interact: false, reloadPress: false, ability: false, autoRun: false };

/* ---------------- autorité (serveur simulé) ---------------- */
const AUTH = {
  log: [], tx: 0,
  push(kind, msg) { this.log.unshift({ t: Date.now(), kind, msg }); if (this.log.length > 80) this.log.pop(); },
  canFire(a, w) { return a.alive && !a.downed && a.reload <= 0 && a.fireCd <= 0 && a.ammo[a.w] > 0; },
  damage(src, tgt, amount, why) {
    if (!tgt || !tgt.alive || tgt.downed) return 0;
    if (tgt.faction === 'squad' && inSafe(tgt.x, tgt.z)) return 0;
    if (src && src.faction === tgt.faction) return 0;
    let dmg = amount;
    if (tgt.kind === 'gardien') { if (tgt.ai.shield > 0) dmg = 0; else dmg *= tgt.ai.vent ? 2.2 : 0.5; }
    if (dmg <= 0) { if (src === G.P) G.ev('blocked', tgt); return 0; }
    tgt.hp -= dmg; tgt.lastHurt = G.t; if (src) tgt.ai.aggro = src;
    if (tgt === G.P) G.ev('hurt', { from: src, dmg });
    if (src === G.P) {
      if (tgt.kind !== 'device') this.push('hit', `Tir validé · ${WEAPONS[G.P.w].name} → ${tgt.label} · −${Math.round(dmg)} PV`);
      G.ev('hit', { tgt, dmg, kill: tgt.hp <= 0 });
    }
    if (tgt.hp <= 0) {
      if (tgt.faction === 'squad' && tgt.kind !== 'device') downActor(tgt);
      else killActor(tgt, src);
    }
    return dmg;
  },
  grant(reward, reason) {
    const s = G.save, id = 'TX-' + (++this.tx).toString().padStart(4, '0');
    s.credits += reward.cr || 0; s.xp += reward.xp || 0;
    if (reward.rep) for (const k in reward.rep) s.rep[k] = (s.rep[k] || 0) + reward.rep[k];
    if (reward.med) s.med = Math.min(3, (s.med || 0) + reward.med);
    this.push('reward', `${id} · ${reason} · +${reward.cr || 0} cr, +${reward.xp || 0} XP${reward.rep ? ', réputation ' + Object.entries(reward.rep).map(([k, v]) => `${k === 'expl' ? 'Exploration' : 'Ingénierie'} +${v}`).join(', ') : ''}`);
    const lv = levelOf(s.xp); if (lv > s.lvl) { s.lvl = lv; G.ev('level', lv); }
    queueSave();
  },
  purchase(item) {
    const s = G.save; if (s.credits < item.price) { this.push('refus', `Achat refusé · ${item.name} · crédits insuffisants`); return false; }
    if (item.once && s.owned.includes(item.id)) { this.push('refus', `Achat refusé · ${item.name} · déjà possédé`); return false; }
    if (item.id === 'med' && (s.med || 0) >= 3) { this.push('refus', 'Achat refusé · Kit de soin · limite de 3'); return false; }
    s.credits -= item.price; if (item.id === 'med') s.med = (s.med || 0) + 1; else s.owned.push(item.id);
    this.push('achat', `TX-${(++this.tx).toString().padStart(4, '0')} · ${item.name} · −${item.price} cr`); queueSave(); return true;
  },
  loot(cache) {
    if (cache.open || dist2(G.P.x, G.P.z, cache.x, cache.z) > 3.2) { this.push('refus', 'Ouverture de cache refusée (distance ou déjà ouverte)'); return null; }
    cache.open = true; cache.reopen = G.t + 600; const cr = 30 + Math.floor(Math.random() * 40), med = Math.random() < 0.35 ? 1 : 0;
    this.grant({ cr, xp: 10, med }, 'Cache ouverte'); return { cr, med };
  },
};
const SHOP = [
  { id: 'med', name: 'Kit de soin', price: 60, desc: 'Rend 50 PV. Trois au maximum.' },
  { id: 'rounds', name: 'Munitions renforcées', price: 400, once: true, desc: '+10 % de dégâts au VX-7.' },
  { id: 'trim', name: 'Liseré or (tenue)', price: 300, once: true, desc: 'Liseré doré sur la tenue.' },
];
function levelOf(xp) { return 1 + Math.floor(Math.sqrt(xp / 120)); }

/* ---------------- sauvegarde ---------------- */
function newSave(name, outfit, prof) {
  return { v: 1, name, outfit, prof, credits: 150, xp: 0, lvl: 1, rep: { expl: 0, ing: 0 }, done: {}, pois: [], relays: [], lab: { solved: false, gardien: false, log: false }, med: 1, owned: [], tut: false, blocked: [], created: Date.now(), saved: 0,
    settings: { gfx: 'moyen', fps: 30, sens: 1, aimSens: 0.7, assist: true, autorun: true, leftFire: false, btn: 1, vib: true, vol: 0.7, showFps: false } };
}
let saveTimer = 0;
function queueSave() { saveTimer = 1.5; }
function doSave(reason) {
  if (!G.save) return; G.save.saved = Date.now(); G.save.pos = G.P && G.P.alive ? null : null;
  NET.saveProfile(G.save).then(ok => { if (reason) G.ev('saved', { ok, reason }); });
}

/* ---------------- acteurs ---------------- */
function mkActor(o) {
  return Object.assign({ id: ++UID, x: 0, y: 0, z: 0, vy: 0, yaw: 0, r: 0.42, h: 1.8, hp: 100, maxHp: 100, alive: true, downed: false, faction: 'squad', kind: 'bot', speed: 4,
    walk: 0, mv: 0, fireCd: 0, reload: 0, onGround: true, think: Math.random() * 0.2, ai: {}, crouch: 0, lastHurt: -99, lastShot: -99, label: '', w: 0, ammo: [30, 6, 5], bleed: 0, revive: 0, emote: null }, o);
}
function spawnEnemy(type, x, z, opt = {}) {
  const A = ARCH[type];
  for (let k = 0; k < 12 && !W.freeAt(x, z, 0.6); k++) { x += rnd(-2, 2); z += rnd(-2, 2); }
  const a = mkActor({ kind: type, faction: type === 'rival' ? 'cendre' : 'derive', x, z, hp: A.hp, maxHp: A.hp, speed: A.speed, label: A.name, home: { x, z }, yaw: rnd(0, TAU), spawn: opt.spawn || null, group: opt.group || null, tut: !!opt.tut });
  if (type === 'drone') { a.y = 6; a.h = 0.8; a.r = 0.6; a.ai.alt = rnd(5, 7); }
  if (type === 'gardien') { a.y = 2.8; a.r = 1.7; a.h = 1; a.ai = { phase: 'volley', pt: 2, shots: 0, shield: 0, th: [0.75, 0.5, 0.25], vent: false, orbit: 0 }; }
  if (type === 'sentinel') { a.h = 1.95; a.r = 0.5; }
  if (opt.wp) a.ai.wp = opt.wp, a.ai.wi = 0;
  if (opt.tut) { a.hp = a.maxHp = 45; a.ai.weak = true; }
  if (opt.state) a.ai.state = opt.state;
  if (opt.target) { a.ai.lx = opt.target.x; a.ai.lz = opt.target.z; a.ai.state = 'search'; a.ai.lt = G.t; }
  G.actors.push(a); return a;
}
function spawnBot(i) {
  const b = BOTS[i], P = G.P;
  const a = mkActor({ kind: 'bot', faction: 'squad', name: b.name, label: b.name, prof: b.prof, outfit: b.outfit, botIdx: i, x: P.x + rnd(-2, 2), z: P.z - 2, speed: 4.4, hp: 100, maxHp: 100 });
  a.slot = G.actors.filter(x => x.kind === 'bot').length;
  G.actors.push(a); return a;
}
function squad() { return G.actors.filter(a => a.faction === 'squad' && (a.kind === 'player' || a.kind === 'bot')); }
function downActor(a) {
  a.hp = 0;
  const helpers = squad().filter(m => m !== a && m.alive && !m.downed);
  const peers = NET.squadPeers ? NET.squadPeers().length : 0;
  if (helpers.length || peers) { a.downed = true; a.bleed = a.kind === 'player' ? 30 : 45; a.revive = 0; G.ev('downed', a); if (G.mission) G.mission.downs = (G.mission.downs || 0) + 1; dropCarry(a); }
  else killActor(a, null);
}
function killActor(a, src) {
  a.alive = false; a.downed = false; a.deadT = G.t;
  if (a.kind === 'player') { dropCarry(a); G.ev('dead', a); G.respawnAt = G.t + 3; return; }
  if (a.kind === 'bot') { a.respawnT = G.t + 12; G.ev('botdead', a); return; }
  if (a.kind === 'device') { G.ev('device', a); return; }
  for (let k = 0; k < 14; k++) G.fx.sp.push({ x: a.x, y: a.y + (a.kind === 'drone' || a.kind === 'gardien' ? 0 : 1), z: a.z, vx: rnd(-4, 4), vy: rnd(1, 6), vz: rnd(-4, 4), life: rnd(0.4, 0.9), c: a.kind === 'gardien' ? PAL.violet : PAL.orange });
  if (src && src.faction === 'squad') {
    const A = ARCH[a.kind]; if (src === G.P) { AUTH.grant({ xp: A.xp, cr: A.cr }, `Neutralisation · ${A.name}`); G.ev('kill', a); }
    if (G.mission) G.mission.kills = (G.mission.kills || 0) + 1, G.mission.killsBy = G.mission.killsBy || {}, G.mission.killsBy[a.kind] = (G.mission.killsBy[a.kind] || 0) + 1;
  }
  if (a.spawn) a.spawn.respawn = G.t + 150;
}
function dropCarry(a) { if (a.carry) { G.items.push({ kind: a.carry, x: a.x, z: a.z, y: 0 }); G.ev('drop', a.carry); a.carry = null; } }
function reviveActor(a) { a.downed = false; a.hp = a.maxHp * 0.4; a.bleed = 0; a.revive = 0; G.ev('revived', a); }
function respawnPlayer(where) {
  const P = G.P; const pt = where === 'cent' && G.cent.active ? { x: 0, z: -100 } : { x: 12, z: 159 };
  P.x = pt.x; P.z = pt.z; P.y = 0; P.vy = 0; P.hp = P.maxHp; P.alive = true; P.downed = false; P.ammo = WEAPONS.map(w => w.mag); P.reload = 0;
  G.cam.yaw = PI; G.respawnAt = 0; G.ev('respawn', where);
}

/* ---------------- IA ---------------- */
function hostile(a, b) { return a.faction !== b.faction && !(a.faction === 'squad' && b.faction === 'squad'); }
function eyeY(a) { return a.kind === 'drone' || a.kind === 'gardien' ? a.y : a.y + (a.crouch > 0.5 ? 1.0 : 1.55); }
function chestY(a) { return a.kind === 'drone' || a.kind === 'gardien' ? a.y : a.kind === 'device' ? 0.9 : a.y + (a.downed ? 0.35 : a.crouch > 0.5 ? 0.8 : 1.15); }
function canSee(a, b, fovCheck) {
  const d = Math.hypot(b.x - a.x, b.z - a.z); const sight = ARCH[a.kind] ? ARCH[a.kind].sight : 34;
  if (d > sight) return false;
  if (b.faction === 'squad' && inSafe(b.x, b.z)) return false;
  if (fovCheck && d > 10) { const ang = Math.atan2(b.x - a.x, b.z - a.z); if (Math.abs(angDiff(a.yaw, ang)) > 1.1) return false; }
  return W.los(a.x, eyeY(a), a.z, b.x, chestY(b), b.z);
}
function probe(a, ang, len) { const h = W.raycast(a.x, a.y + 0.6, a.z, Math.sin(ang), 0, Math.cos(ang), len); return !!h; }
function steer(a, tx, tz, spd, dt) {
  const dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz); if (d < 0.4) { a.mv = 0; return true; }
  let ang = Math.atan2(dx, dz);
  if (a.ai.detourT > G.t) ang = a.ai.detour;
  else if (a.kind !== 'drone' && probe(a, ang, Math.min(2.4, d))) {
    const s = a.ai.side || (a.ai.side = Math.random() < 0.5 ? 1 : -1);
    for (const off of [0.6, -0.6, 1.2, -1.2, 1.9, -1.9]) { if (!probe(a, ang + off * s, 2.4)) { ang += off * s; break; } }
  }
  const nx = a.x + Math.sin(ang) * spd * dt, nz = a.z + Math.cos(ang) * spd * dt;
  if (a.faction !== 'squad' && inSafe(nx, nz)) { a.mv = 0; return false; }
  const ox = a.x, oz = a.z; a.x = nx; a.z = nz;
  if (a.kind !== 'drone') W.resolve(a);
  const moved = Math.hypot(a.x - ox, a.z - oz); a.mv = moved / dt;
  a.ai.stuck = (a.ai.stuck || 0) + (moved < spd * dt * 0.3 ? dt : -dt * 0.5); if (a.ai.stuck < 0) a.ai.stuck = 0;
  if (a.ai.stuck > 1.0) { a.ai.stuck = 0; a.ai.detour = ang + (Math.random() < 0.5 ? 1.6 : -1.6); a.ai.detourT = G.t + 1.0; a.ai.side = -(a.ai.side || 1); }
  a.yaw += angDiff(a.yaw, ang) * Math.min(1, dt * 8); return false;
}
function faceTo(a, tx, tz, dt, k = 10) { a.yaw += angDiff(a.yaw, Math.atan2(tx - a.x, tz - a.z)) * Math.min(1, dt * k); }
function tracer(x0, y0, z0, x1, y1, z1, c, w = 0.035) { const l = Math.hypot(x1 - x0, y1 - y0, z1 - z0), life = clamp(l / 260, 0.05, 0.22); G.fx.tr.push({ x0, y0, z0, x1, y1, z1, life, max: life, c, w }); }
function aiShoot(a, t, dmg, acc) {
  const mx = a.x + Math.sin(a.yaw) * 0.5, my = eyeY(a) - (a.kind === 'drone' || a.kind === 'gardien' ? 0.1 : 0.2), mz = a.z + Math.cos(a.yaw) * 0.5;
  const tx = t.x, ty = chestY(t), tz = t.z, d = Math.hypot(tx - mx, ty - my, tz - mz);
  a.lastShot = G.t; G.light && G.light.push({ x: mx, y: my, z: mz, r: 5, c: [0.9, 0.45, 0.25], life: 0.05 });
  const col = a.faction === 'squad' ? PAL.cyan : a.faction === 'cendre' ? PAL.or : PAL.orange;
  const blocked = W.raycast(mx, my, mz, (tx - mx) / d, (ty - my) / d, (tz - mz) / d, d - 0.3);
  if (blocked) { tracer(mx, my, mz, mx + (tx - mx) / d * blocked.t, my + (ty - my) / d * blocked.t, mz + (tz - mz) / d * blocked.t, col); spark(mx + (tx - mx) / d * blocked.t, my + (ty - my) / d * blocked.t, mz + (tz - mz) / d * blocked.t, col); return; }
  const tm = t.kind === 'player' ? Math.min(1, (t.mv || 0) / 6) : 0;
  let p = acc - d * 0.006 - tm * 0.14 - (t.crouch > 0.5 ? 0.12 : 0); if (t.kind === 'device') p = 0.8;
  if (G.P && t === G.P && G.save.settings && G.diff) p *= G.diff;
  if (Math.random() < clamp(p, 0.06, 0.92)) { tracer(mx, my, mz, tx + rnd(-0.1, 0.1), ty, tz + rnd(-0.1, 0.1), col); AUTH.damage(a, t, dmg, 'ai'); }
  else { const j = 0.6 + d * 0.03; tracer(mx, my, mz, tx + rnd(-j, j), ty + rnd(-0.5, j), tz + rnd(-j, j), col); if (t === G.P) G.ev('nearmiss', a); }
  noise(a, 28);
}
function noise(src, r) { for (const e of G.actors) if (e.alive && e.faction !== 'squad' && e !== src && hostile(e, src) && Math.hypot(e.x - src.x, e.z - src.z) < r && !(e.ai.state === 'combat')) { e.ai.lx = src.x; e.ai.lz = src.z; e.ai.lt = G.t; if (e.ai.state !== 'combat') e.ai.state = 'search'; } }
function spark(x, y, z, c) { for (let k = 0; k < 4; k++) G.fx.sp.push({ x, y, z, vx: rnd(-2, 2), vy: rnd(0.5, 3), vz: rnd(-2, 2), life: rnd(0.15, 0.3), c }); }
function nearestHostile(a, maxD, fov) {
  let best = null, bd = maxD;
  for (const b of G.actors) {
    if (!b.alive || !hostile(a, b)) continue; const d = Math.hypot(b.x - a.x, b.z - a.z); if (d >= bd) continue;
    const pen = b.downed ? 12 : 0; if (d + pen >= bd) continue;
    if (canSee(a, b, fov)) { best = b; bd = d + pen; }
  }
  return best;
}
function updateEnemy(a, dt) {
  const A = ARCH[a.kind], ai = a.ai; a.fireCd -= dt;
  if (a.kind === 'gardien') return updateGardien(a, dt);
  ai.th = (ai.th || 0) - dt;
  if (ai.th <= 0) {
    ai.th = 0.2 + Math.random() * 0.08;
    const tgt = ai.passive ? null : nearestHostile(a, A.sight, ai.state !== 'combat');
    if (ai.passive && ai.aggro) ai.passive = false;
    if (tgt) { if (ai.state !== 'combat') { ai.react = G.t + (ai.weak ? 0.9 : 0.45); if (a.kind === 'drone') droneSignal(a, tgt); } ai.state = 'combat'; ai.tgt = tgt; ai.lx = tgt.x; ai.lz = tgt.z; ai.lt = G.t; }
    else if (ai.state === 'combat') { ai.state = 'search'; }
    if (ai.aggro && ai.aggro.alive && ai.state !== 'combat' && Math.hypot(ai.aggro.x - a.x, ai.aggro.z - a.z) < 60) { ai.lx = ai.aggro.x; ai.lz = ai.aggro.z; ai.lt = G.t; ai.state = 'search'; ai.aggro = null; }
    if (ai.state === 'search' && G.t - ai.lt > 9) ai.state = 'return';
    if (ai.goal && ai.state !== 'combat') { ai.state = 'goal'; }
  }
  const tgt = ai.tgt;
  if (a.kind === 'drone') {
    let tx = a.home.x + Math.cos(G.t * 0.3 + a.id) * 8, tz = a.home.z + Math.sin(G.t * 0.3 + a.id) * 8, alt = ai.alt;
    if (ai.state === 'combat' && tgt && tgt.alive) { const ang = G.t * 0.6 + a.id; tx = tgt.x + Math.cos(ang) * 11; tz = tgt.z + Math.sin(ang) * 11; faceTo(a, tgt.x, tgt.z, dt);
      if (a.fireCd <= 0 && G.t > ai.react) { a.fireCd = 0.36; aiShoot(a, tgt, ai.weak ? 1 : A.dmg, 0.4); } }
    else if (ai.state === 'goal' && ai.goal) { const ang = G.t * 0.5 + a.id; tx = ai.goal.x + Math.cos(ang) * 8; tz = ai.goal.z + Math.sin(ang) * 8; const at = ai.goal.attack;
      if (at && at.alive && Math.hypot(at.x - a.x, at.z - a.z) < 14) { faceTo(a, at.x, at.z, dt); if (a.fireCd <= 0) { a.fireCd = 0.5; aiShoot(a, at, A.dmg, 0.8); } } }
    else if (ai.state === 'search') { tx = ai.lx; tz = ai.lz; }
    let top = 0; const near = W.near(a.x, a.z, 3, W._n); for (const o of near) top = Math.max(top, o.y1);
    alt = Math.max(alt, top + 2.2);
    a.y = lerp(a.y, alt + Math.sin(G.t * 2 + a.id) * 0.3, Math.min(1, dt * 2));
    const dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz); if (d > 0.5) { const s = Math.min(A.speed, d * 1.5) * dt; const nx = a.x + dx / d * s, nz = a.z + dz / d * s; if (!inSafe(nx, nz)) { a.x = nx; a.z = nz; } a.mv = s / dt; }
    if (ai.state !== 'combat') a.yaw += angDiff(a.yaw, Math.atan2(dx, dz)) * dt * 3;
    return;
  }
  const spd = A.speed * (ai.state === 'combat' || ai.state === 'search' ? 1.15 : 0.6);
  if (ai.state === 'combat' && tgt && tgt.alive) {
    const d = Math.hypot(tgt.x - a.x, tgt.z - a.z);
    if (a.kind === 'sentinel') {
      // couverture : cache-toi, sors, tire
      if (!ai.cover || G.t > (ai.coverT || 0)) { ai.cover = pickCover(a, tgt); ai.coverT = G.t + 7; }
      ai.cyc = (ai.cyc || 0) + dt; const peek = (ai.cyc % 4.2) > 2.0;
      if (ai.cover && Math.hypot(ai.cover.x - a.x, ai.cover.z - a.z) > 0.6) { steer(a, ai.cover.x, ai.cover.z, A.speed * 1.3, dt); a.crouch = 0; }
      else { a.mv = 0; a.crouch = peek || !ai.cover ? 0 : 1; faceTo(a, tgt.x, tgt.z, dt);
        if ((peek || !ai.cover) && a.fireCd <= 0 && G.t > ai.react && canSee(a, tgt, false)) { a.fireCd = 1.35; aiShoot(a, tgt, ai.weak ? 2 : A.dmg, 0.52); } }
    } else {
      // patrouilleur / rival : distance moyenne, déplacements latéraux, rafales
      ai.sw = ai.sw || 1; if (!ai.swT || G.t > ai.swT) { ai.sw = -ai.sw; ai.swT = G.t + rnd(1.6, 3); }
      let tx = a.x, tz = a.z; const ang = Math.atan2(tgt.x - a.x, tgt.z - a.z);
      if (d > 19) { tx = tgt.x; tz = tgt.z; } else if (d < 8) { tx = a.x - Math.sin(ang) * 4; tz = a.z - Math.cos(ang) * 4; }
      else { tx = a.x + Math.cos(ang) * ai.sw * 3; tz = a.z - Math.sin(ang) * ai.sw * 3; }
      steer(a, tx, tz, spd * 0.75, dt); faceTo(a, tgt.x, tgt.z, dt, 12);
      if (a.fireCd <= 0 && G.t > ai.react) {
        if (!ai.burst) ai.burst = 4;
        if (canSee(a, tgt, false)) { aiShoot(a, tgt, ai.weak ? 2 : A.dmg, a.kind === 'rival' ? 0.46 : 0.42); ai.burst--; a.fireCd = ai.burst > 0 ? 0.13 : rnd(1.1, 1.6); if (ai.burst <= 0) ai.burst = 0; }
        else a.fireCd = 0.4;
      }
    }
    return;
  }
  a.crouch = 0;
  if (ai.state === 'search') { if (steer(a, ai.lx, ai.lz, spd, dt)) { ai.state = 'return'; } return; }
  if (ai.state === 'goal' && ai.goal) { const g = ai.goal; if (Math.hypot(g.x - a.x, g.z - a.z) > (g.r || 6)) steer(a, g.x, g.z, spd, dt); else { a.mv = 0; if (g.attack && g.attack.alive) { faceTo(a, g.attack.x, g.attack.z, dt); if (a.fireCd <= 0 && W.los(a.x, eyeY(a), a.z, g.attack.x, 0.9, g.attack.z)) { a.fireCd = rnd(0.9, 1.4); aiShoot(a, g.attack, A.dmg, 0.8); } } } return; }
  if (ai.wp) { const w = ai.wp[ai.wi]; if (steer(a, w[0], w[1], spd, dt)) ai.wi = (ai.wi + 1) % ai.wp.length; return; }
  if (ai.state === 'return') { if (steer(a, a.home.x, a.home.z, spd, dt)) ai.state = 'idle'; return; }
  a.mv = 0; ai.look = (ai.look || 0) + dt; if (ai.look > 3) { ai.look = 0; ai.ly = rnd(0, TAU); } if (ai.ly != null) a.yaw += angDiff(a.yaw, ai.ly) * dt;
}
function pickCover(a, tgt) {
  let best = null, bs = 1e9;
  for (const c of W.cover) {
    const d = Math.hypot(c.x - a.x, c.z - a.z); if (d > 14) continue;
    if (Math.hypot(c.x - tgt.x, c.z - tgt.z) < 6) continue;
    if (W.los(tgt.x, chestY(tgt), tgt.z, c.x, 0.9, c.z)) continue; // doit masquer la cible
    const s = d + Math.abs(Math.hypot(c.x - tgt.x, c.z - tgt.z) - 18) * 0.3; if (s < bs) { bs = s; best = c; }
  }
  return best;
}
function droneSignal(a, tgt) {
  if ((a.ai.sigT || 0) > G.t) return; a.ai.sigT = G.t + 8;
  G.fx.rings.push({ x: a.x, y: a.y, z: a.z, r0: 0.5, r1: 60, life: 1, max: 1, c: PAL.orange });
  let n = 0; for (const e of G.actors) if (e.alive && e.faction === a.faction && e !== a && Math.hypot(e.x - a.x, e.z - a.z) < 60) { e.ai.lx = tgt.x; e.ai.lz = tgt.z; e.ai.lt = G.t; if (e.ai.state !== 'combat') e.ai.state = 'search'; n++; }
  if (tgt.faction === 'squad') G.ev('signal', { a, n });
}
function updateGardien(a, dt) {
  const ai = a.ai, P = G.P; const c = { x: 170, z: -10 };
  const tgt = nearestHostile(a, 32, false);
  ai.orbit += dt * 0.35; const tx = c.x + Math.cos(ai.orbit) * 3, tz = c.z + Math.sin(ai.orbit) * 2.6;
  a.x = lerp(a.x, tx, dt); a.z = lerp(a.z, tz, dt); a.y = 2.8 + Math.sin(G.t * 1.4) * 0.25;
  if (ai.shield > 0) ai.shield -= dt;
  const f = a.hp / a.maxHp; if (ai.th.length && f < ai.th[0]) { ai.th.shift(); ai.shield = 5; for (let k = 0; k < 2; k++) { const d = spawnEnemy('drone', c.x + rnd(-3, 3), c.z + rnd(-3, 3), { group: 'lab' }); d.y = 3; d.ai.alt = 3.6; d.home = { x: 168, z: -10 }; } G.ev('gardien-shield'); }
  if (!tgt) { ai.vent = false; return; }
  ai.active = true; faceTo(a, tgt.x, tgt.z, dt, 4); ai.pt -= dt;
  if (ai.phase === 'volley') { ai.vent = false; if (ai.pt <= 0 && ai.shield <= 0) { aiShoot(a, tgt, ARCH.gardien.dmg, 0.55); ai.shots++; ai.pt = 0.16; if (ai.shots >= 6) { ai.phase = 'vent'; ai.pt = 2.8; ai.shots = 0; } } }
  else { ai.vent = true; if (ai.pt <= 0) { ai.phase = 'volley'; ai.pt = 0.6; } }
}
function updateBot(a, dt) {
  const P = G.P, ai = a.ai; a.fireCd -= dt;
  if (!a.alive) { if (G.t > a.respawnT) { a.alive = true; a.hp = a.maxHp; a.x = 12 + rnd(-2, 2); a.z = 158; a.y = 0; G.ev('botback', a); } return; }
  if (a.downed) { a.bleed -= dt; a.mv = 0; if (a.bleed <= 0) killActor(a, null); return; }
  if (a.hp < a.maxHp && G.t - a.lastHurt > 6) a.hp = Math.min(a.maxHp, a.hp + 8 * dt);
  // réanimer un coéquipier à terre
  const down = squad().find(m => m !== a && m.downed && Math.hypot(m.x - a.x, m.z - a.z) < 40);
  if (down) {
    if (Math.hypot(down.x - a.x, down.z - a.z) > 1.4) { steer(a, down.x, down.z, a.speed * 1.4, dt); ai.rev = 0; }
    else { a.mv = 0; ai.rev = (ai.rev || 0) + dt; down.revive = ai.rev / 3.5; faceTo(a, down.x, down.z, dt); if (ai.rev >= 3.5) { reviveActor(down); ai.rev = 0; say(a, down === P ? 'Debout, on continue.' : 'Je t’ai relevé.'); } }
    physics(a, dt); return;
  }
  const safe = inSafe(a.x, a.z);
  // cible
  ai.th = (ai.th || 0) - dt;
  if (ai.th <= 0) { ai.th = 0.25; ai.tgt = safe ? null : nearestHostile(a, 32, false); }
  const m = G.mission; let gx, gz, near = 2.2;
  const def = m && m.def.id === 'C' && m.stepId === 'defend' && m.device && m.device.alive;
  if (def) { const ang = a.slot * 2.1 + 0.6; gx = m.device.x + Math.cos(ang) * 5; gz = m.device.z + Math.sin(ang) * 5; near = 1.2;
    if (a.prof === 'ingenieur' && m.device.hp < m.device.maxHp * 0.7 && !ai.tgt) { gx = m.device.x + 1.2; gz = m.device.z + 1.2; if (Math.hypot(gx - a.x, gz - a.z) < 1.6) { m.device.hp = Math.min(m.device.maxHp, m.device.hp + 40 * dt); a.repairing = true; } } }
  else if (G.ping && G.ping.t > G.t - 20 && G.ping.kind === 'move') { gx = G.ping.x + Math.cos(a.slot * 2.1) * 2.5; gz = G.ping.z + Math.sin(a.slot * 2.1) * 2.5; }
  else { const off = [[-2.6, -3.2], [2.6, -3.2], [0, -5.2]][a.slot % 3], cy = Math.cos(P.yaw), sy = Math.sin(P.yaw);
    gx = P.x + off[0] * -cy + off[1] * sy; gz = P.z + off[0] * sy + off[1] * cy; }
  const dl = Math.hypot(P.x - a.x, P.z - a.z);
  // rattrapage hors champ
  if (!def && dl > 55 && P.alive) { const bx = P.x - Math.sin(P.yaw) * 7, bz = P.z - Math.cos(P.yaw) * 7; if (W.freeAt(bx, bz, 0.5)) { a.x = bx; a.z = bz; a.y = P.y; } }
  const tgt = ai.tgt;
  if (tgt && tgt.alive && !tgt.downed) {
    faceTo(a, tgt.x, tgt.z, dt, 10); const dg = Math.hypot(gx - a.x, gz - a.z);
    if (dg > 8) steer(a, gx, gz, a.speed, dt); else { a.mv = 0; }
    if (a.fireCd <= 0) { if (!ai.burst) ai.burst = 3; if (canSee(a, tgt, false)) { aiShoot(a, tgt, 6, 0.42); ai.burst--; a.fireCd = ai.burst > 0 ? 0.15 : rnd(0.7, 1.1); } else a.fireCd = 0.35; }
  } else {
    const dg = Math.hypot(gx - a.x, gz - a.z);
    if (dg > near) steer(a, gx, gz, dg > 8 ? a.speed * 1.45 : a.speed, dt); else { a.mv = 0; if (!def) a.yaw += angDiff(a.yaw, P.yaw) * dt * 2; }
  }
  physics(a, dt);
}
function physics(a, dt) { a.vy -= 15 * dt; a.y += a.vy * dt; const g = W.groundAt(a.x, a.z, a.y, a.r); if (a.y <= g) { a.y = g; a.vy = 0; a.onGround = true; } else a.onGround = a.y - g < 0.05; }
function say(a, text) { G.ev('chat', { from: a.name || a.label, text, bot: true }); }

/* ---------------- joueur ---------------- */
function createPlayer() {
  const s = G.save;
  const P = mkActor({ kind: 'player', faction: 'squad', name: s.name, label: s.name, prof: s.prof, outfit: s.outfit, hp: 100, maxHp: 100, speed: 4.3, ammo: WEAPONS.map(w => w.mag), abil: 0 });
  if (!s.tut) { P.x = 4; P.z = 193; G.cam.yaw = PI; } else { P.x = 12; P.z = 159; G.cam.yaw = PI; }
  P.yaw = G.cam.yaw; G.P = P; G.actors.push(P); return P;
}
function updatePlayer(dt) {
  const P = G.P, w = WEAPONS[P.w], st = G.save.settings;
  P.fireCd -= dt; if (P.abil > 0) P.abil -= dt;
  if (!P.alive) { P.mv = 0; return; }
  if (P.reload > 0) { P.reload -= dt; if (P.reload <= 0) { P.ammo[P.w] = w.mag; G.ev('reloaded'); } }
  if (P.downed) { P.bleed -= dt; if (P.bleed <= 0) { killActor(P, null); return; } }
  if (!P.downed && P.hp < P.maxHp && G.t - P.lastHurt > 6) P.hp = Math.min(P.maxHp, P.hp + 7 * dt);
  // déplacement relatif caméra
  let mx = I.mx, my = I.my; if (I.autoRun && st.autorun) { my = 1; }
  const mag = Math.min(1, Math.hypot(mx, my)); const cy = Math.cos(G.cam.yaw), sy = Math.sin(G.cam.yaw);
  let vx = sy * my + -cy * mx, vz = cy * my + sy * mx; const l = Math.hypot(vx, vz); if (l > 0) { vx /= l; vz /= l; }
  const running = (I.run || mag > 0.92 || I.autoRun) && !P.aim && !P.downed;
  let spd = P.speed * (running ? 1.42 : 1) * mag * (P.prof === 'eclaireur' ? 1.08 : 1) * (P.carry && P.prof !== 'ingenieur' ? 0.86 : 1) * (P.aim ? 0.62 : 1);
  if (P.downed) spd = 1.1 * mag;
  const ox = P.x, oz = P.z; P.x += vx * spd * dt; P.z += vz * spd * dt;
  P.vy -= 15 * dt; P.y += P.vy * dt;
  W.resolve(P);
  const g = W.groundAt(P.x, P.z, P.y, P.r); if (P.y <= g) { P.y = g; P.vy = 0; P.onGround = true; } else P.onGround = P.y - g < 0.05;
  if (P.blocked && P.onGround && mag > 0.3 && !P.downed && P.blockTop - P.y <= 1.2 && P.blockTop - P.y > W.STEP && (G.t - (P.vault || 0)) > 0.45) { P.vy = 5.6; P.vault = G.t; G.ev('vault'); }
  if (I.jump && P.onGround && !P.downed) { P.vy = 5.4; P.onGround = false; }
  I.jump = false;
  P.mv = Math.hypot(P.x - ox, P.z - oz) / dt; P.running = running && P.mv > 3;
  // orientation
  const shooting = I.fire || G.t - P.lastShot < 0.7 || P.aim;
  if (shooting && !P.downed) P.yaw += angDiff(P.yaw, G.cam.yaw) * Math.min(1, dt * 18);
  else if (l > 0) P.yaw += angDiff(P.yaw, Math.atan2(vx, vz)) * Math.min(1, dt * 10);
  // tir
  if (I.reloadPress) { I.reloadPress = false; startReload(); }
  if (I.fire && !P.downed && !inSafe(P.x, P.z)) { if (w.auto || I.firePressed) playerFire(); }
  else if (I.firePressed && inSafe(P.x, P.z)) G.ev('safe-nofire');
  I.firePressed = false;
  if (P.ammo[P.w] <= 0 && P.reload <= 0 && !P.downed) startReload();
  // capacité
  if (I.ability) { I.ability = false; useAbility(); }
  // zone
  const z = zoneAt(P.x, P.z); if (z.id !== G.lastZone) { G.lastZone = z.id; G.ev('zone', z); }
  if (G.t > (P.carryHint || 0) && P.carry) P.carryHint = G.t + 999;
}
function startReload() { const P = G.P, w = WEAPONS[P.w]; if (P.reload > 0 || P.ammo[P.w] >= w.mag || P.downed) return; P.reload = w.reload; G.ev('reload', w); }
function switchWeapon(i) { const P = G.P; if (i === P.w || P.downed) return; P.w = i; P.reload = 0; P.fireCd = 0.25; G.ev('weapon', i); }
const _tmp = {};
function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) { const fx = ox - cx, fy = oy - cy, fz = oz - cz, b = fx * dx + fy * dy + fz * dz, c = fx * fx + fy * fy + fz * fz - r * r, disc = b * b - c; if (disc < 0) return -1; const t = -b - Math.sqrt(disc); return t > 0 ? t : -1; }
function rayActor(a, ox, oy, oz, dx, dy, dz, max) {
  if (a.kind === 'drone') return raySphere(ox, oy, oz, dx, dy, dz, a.x, a.y, a.z, 0.8);
  if (a.kind === 'gardien') return raySphere(ox, oy, oz, dx, dy, dz, a.x, a.y, a.z, 1.75);
  const h = a.kind === 'device' ? 1.6 : a.downed ? 0.6 : a.h * (a.crouch > 0.5 ? 0.6 : 1);
  _tmp.t = 1; _tmp.x = a.x; _tmp.z = a.z; _tmp.r = a.kind === 'sentinel' ? 0.62 : 0.5; _tmp.y0 = a.y; _tmp.y1 = a.y + h;
  return W.rayObj(_tmp, ox, oy, oz, dx, dy, dz, max);
}
function playerFire() {
  const P = G.P, w = WEAPONS[P.w];
  if (!AUTH.canFire(P, w)) return;
  P.fireCd = 60 / w.rpm; P.ammo[P.w]--; P.lastShot = G.t;
  const [cx, cy, cz] = G.camPos, [dx, dy, dz] = G.camDir;
  const ah = W.raycast(cx, cy, cz, dx, dy, dz, w.range + 6); let ax, ay, az;
  const at = ah ? ah.t : w.range + 6; ax = cx + dx * at; ay = cy + dy * at; az = cz + dz * at;
  // assistance : attire le point visé vers l'ennemi le plus proche du réticule
  let best = null, bang = (P.aim ? w.assist * 0.6 : w.assist) * PI / 180;
  if (G.save.settings.assist) for (const e of G.actors) {
    if (!e.alive || !hostile(P, e) || e.kind === 'device') continue;
    const ex = e.x - cx, ey = chestY(e) - cy, ez = e.z - cz, d = Math.hypot(ex, ey, ez); if (d > w.range) continue;
    const ang = Math.acos(clamp((ex * dx + ey * dy + ez * dz) / d, -1, 1)); if (ang < bang && W.los(cx, cy, cz, e.x, chestY(e), e.z)) { bang = ang; best = e; }
  }
  if (best) { const k = 0.6; ax = lerp(ax, best.x, k); ay = lerp(ay, chestY(best), k); az = lerp(az, best.z, k); }
  const right = [-Math.cos(G.cam.yaw), 0, Math.sin(G.cam.yaw)];
  const mx = P.x + right[0] * 0.35 + Math.sin(P.yaw) * 0.6, my = P.y + (P.crouch ? 1.0 : 1.38), mz = P.z + right[2] * 0.35 + Math.cos(P.yaw) * 0.6;
  let bx = ax - mx, by = ay - my, bz = az - mz; const bl = Math.hypot(bx, by, bz); bx /= bl; by /= bl; bz /= bl;
  const spread = (P.aim ? w.ads : w.hip) * (P.mv > 2 ? 1.35 : 1) * (best ? 0.55 : 1) * PI / 180;
  let anyHit = false;
  for (let p = 0; p < w.pellets; p++) {
    const s1 = rnd(-1, 1) * spread, s2 = rnd(-1, 1) * spread;
    let rx = bx + right[0] * s1, ry = by + s2, rz = bz + right[2] * s1; const rl = Math.hypot(rx, ry, rz); rx /= rl; ry /= rl; rz /= rl;
    const wh = W.raycast(mx, my, mz, rx, ry, rz, w.range); let bt = wh ? wh.t : w.range, hitA = null;
    for (const e of G.actors) { if (!e.alive || !hostile(P, e) || e.downed) continue; if (Math.abs(e.x - mx) > bt + 2 || Math.abs(e.z - mz) > bt + 2) continue; const t = rayActor(e, mx, my, mz, rx, ry, rz, bt); if (t > 0 && t < bt) { bt = t; hitA = e; } }
    const hx = mx + rx * bt, hy = my + ry * bt, hz = mz + rz * bt;
    if (p < 3) tracer(mx, my, mz, hx, hy, hz, PAL.cyan, w.id === 'aiguille' ? 0.06 : 0.035);
    if (hitA) {
      let dmg = w.dmg * (w.id === 'vx7' && G.save.owned.includes('rounds') ? 1.1 : 1); if (bt > w.fall0) dmg *= Math.max(0.45, 1 - (bt - w.fall0) / (w.range - w.fall0) * 0.55);
      AUTH.damage(P, hitA, dmg, 'shot'); anyHit = true; spark(hx, hy, hz, PAL.ivoire);
    } else if (wh) spark(hx, hy, hz, [0.8, 0.8, 0.7]);
  }
  G.light.push({ x: mx, y: my, z: mz, r: 7, c: [0.4, 0.9, 0.9], life: 0.05 });
  G.cam.pitch -= w.kick * (P.aim ? 0.6 : 1); G.ev('fire', w);
  noise(P, w.id === 'aiguille' ? 45 : 32);
}
function useAbility() {
  const P = G.P; if (P.abil > 0 || P.downed || !P.alive) return;
  if (P.prof === 'eclaireur') {
    const R0 = 60 + (G.save.rep.expl >= 150 ? 15 : 0); P.abil = PROFS.eclaireur.abilityCd;
    G.fx.rings.push({ x: P.x, y: 0.4, z: P.z, r0: 1, r1: R0, life: 1.2, max: 1.2, c: PAL.cyan });
    let n = 0; for (const e of G.actors) if (e.alive && hostile(P, e) && Math.hypot(e.x - P.x, e.z - P.z) < R0) { G.marks.set(e, G.t + 8); n++; }
    if (G.mission && G.mission.beacon && Math.hypot(G.mission.beacon.x - P.x, G.mission.beacon.z - P.z) < R0) G.mission.beacon.seen = true;
    let found = 0; for (const p of W.dyn.pois) if (!G.save.pois.includes(p.id) && Math.hypot(p.x - P.x, p.z - P.z) < 45) { G.save.pois.push(p.id); found++; AUTH.grant({ cr: 60, xp: 40, rep: { expl: 30 } }, `Point d’intérêt · ${p.name}`); G.ev('poi', p); }
    G.ev('scan', { n, found });
  } else {
    P.abil = PROFS.ingenieur.abilityCd; let n = 0;
    for (const m of squad()) if (m.alive && !m.downed && Math.hypot(m.x - P.x, m.z - P.z) < 9) { m.hp = Math.min(m.maxHp, m.hp + 35); n++; }
    G.fx.rings.push({ x: P.x, y: 0.4, z: P.z, r0: 1, r1: 9, life: 0.8, max: 0.8, c: PAL.or }); G.ev('heal', n);
  }
}
function useMed() { const s = G.save, P = G.P; if (!s.med || P.hp >= P.maxHp || P.downed || !P.alive) return; s.med--; P.hp = Math.min(P.maxHp, P.hp + 50); AUTH.push('objet', 'Kit de soin utilisé · +50 PV'); G.ev('med'); queueSave(); }

/* ---------------- interactions ---------------- */
function interactables() {
  const P = G.P, out = [], s = G.save, m = G.mission;
  if (!P || !P.alive) return out;
  const st = W.dyn.stations;
  if (inAP(P.x, P.z, 2)) {
    out.push({ x: st.missions.x, z: st.missions.z, label: 'Parler à Ilya · Missions', hold: 0, act: () => { if (!s.tut) { s.tut = true; queueSave(); } UI.open('missions'); } });
    out.push({ x: st.squad.x, z: st.squad.z, label: 'Tableau des escouades', hold: 0, act: () => UI.open('squad') });
    out.push({ x: st.inventory.x, z: st.inventory.z + 0.8, label: 'Inventaire & armurerie', hold: 0, act: () => UI.open('inventory') });
    out.push({ x: st.prof.x, z: st.prof.z, label: 'Fiche de profession', hold: 0, act: () => UI.open('prof') });
    out.push({ x: st.save.x, z: st.save.z + 0.6, label: 'Sauvegarder la progression', hold: 0.6, act: () => { doSave('manual'); } });
  }
  for (const c of W.dyn.caches) if (!c.open) out.push({ x: c.x, z: c.z, label: 'Ouvrir la cache', hold: 1.0, act: () => { const r = AUTH.loot(c); if (r) G.ev('loot', r); if (m && m.sec && m.sec.kind === 'cache' && m.zone && Math.hypot(c.x - m.zone.x, c.z - m.zone.z) < 40) m.sec.done = true; } });
  for (const r of W.dyn.relays) if (!s.relays.includes(r.id)) out.push({ x: r.x, z: r.z, label: P.prof === 'ingenieur' ? 'Réparer le relais' : 'Relais endommagé · Ingénieur requis', hold: P.prof === 'ingenieur' ? 3 * (s.rep.ing >= 150 ? 0.75 : 1) : 0, deny: P.prof !== 'ingenieur', act: () => { s.relays.push(r.id); AUTH.grant({ cr: 70, xp: 45, rep: { ing: 35 } }, 'Relais réparé'); G.ev('relay', r); } });
  for (const d of squad()) if (d !== P && d.downed) out.push({ x: d.x, z: d.z, label: `Réanimer ${d.name}`, hold: 3, act: () => reviveActor(d), prog: d });
  for (const it of G.items) out.push({ x: it.x, z: it.z, label: it.kind === 'noyau' ? 'Ramasser le Noyau Vrille' : 'Ramasser le module énergétique', hold: 0.8, act: () => { P.carry = it.kind; G.items.splice(G.items.indexOf(it), 1); G.ev('pickup', it.kind); } });
  // Labo 07
  if (inLab(P.x, P.z)) {
    W.dyn.valves.forEach((v, i) => out.push({ x: v.x, z: v.z, label: `Tourner la vanne ${'ABC'[i]}`, hold: 0.8, act: () => toggleValve(i) }));
    out.push({ x: 152, z: -19.3, label: 'Lire le panneau', hold: 0, act: () => G.ev('panel') });
    if (G.labDead) out.push({ x: 174.4, z: -10, label: 'Consulter le journal du Labo 07', hold: 1.5, act: () => { G.ev('journal'); if (!s.lab.log) { s.lab.log = true; AUTH.grant({ cr: 150, xp: 80, rep: { expl: 40 } }, 'Découverte narrative · Journal 07'); } if (m && m.stepId === 'log') m.next(); } });
  }
  if (G.cent.active && Math.hypot(P.x + 20, P.z + 140) < 7) out.push({ x: -22.5, z: -140, label: 'Terminal de contrôle', hold: 1.5, act: () => { if (m && m.stepId === 'signal') m.next(); else G.ev('terminal'); } });
  if (m && m.interact) for (const it of m.interact()) out.unshift(it);
  return out;
}
function updateFocus(dt) {
  const P = G.P; let best = null, bd = 1e9;
  for (const it of interactables()) { const d = Math.hypot(it.x - P.x, it.z - P.z); if (d < (it.r || 2.3) && d < bd) { bd = d; best = it; } }
  if (best && G.focus && best.label !== G.focus.label) G.holdT = 0;
  G.focus = best;
  if (best && I.interact && !best.deny && !P.downed) {
    if (best.cont) best.cont(dt);
    else { G.holdT += dt; if (G.holdT >= (best.hold || 0)) { G.holdT = 0; I.interact = !!best.repeat; best.act(); if (!best.hold) I.interact = false; } }
  } else if (!I.interact) G.holdT = 0;
}
function toggleValve(i) {
  const T = [[1, 1, 0], [0, 1, 1], [0, 0, 1]]; G.labL = G.labL || [0, 0, 0];
  for (let k = 0; k < 3; k++) if (T[i][k]) G.labL[k] ^= 1; W.dyn.valves[i].on = !W.dyn.valves[i].on;
  G.ev('valve', G.labL.slice());
  if (G.labL.every(v => v) && !G.labOpen) openLab();
}
function openLab() {
  G.labOpen = true; W.dyn.doors.find(d => d.id === 'lab').want = 1; G.ev('labopen');
  if (!G.save.lab.solved) { G.save.lab.solved = true; AUTH.grant({ cr: 100, xp: 60, rep: { expl: 25 } }, 'Énigme du Labo 07'); }
  if (!G.labDead && !G.actors.some(a => a.kind === 'gardien' && a.alive)) { const g = spawnEnemy('gardien', 170, -10, { group: 'lab' }); G.gardien = g; }
  if (G.mission && G.mission.stepId === 'puzzle') G.mission.next();
}
function resetLab() { G.labL = [0, 0, 0]; G.labOpen = false; G.labDead = false; G.gardien = null; W.dyn.valves.forEach(v => v.on = false); W.dyn.doors.find(d => d.id === 'lab').want = 0; for (const a of G.actors) if (a.group === 'lab' && a.kind !== 'sentinel') a.alive = false; }

/* ---------------- missions ---------------- */
const MISSIONS = {
  A: { id: 'A', type: 'Reconnaissance', name: 'Balise muette', dur: '5–8 min', prof: 'eclaireur', squad: 'Solo ou escouade',
    desc: 'Une balise de l’ancien réseau émet encore. Localise-la dans la Ceinture Verte, télécharge ses données et rapporte-les au terminal.',
    reward: { cr: 250, xp: 120, rep: { expl: 40 } } },
  B: { id: 'B', type: 'Extraction', name: 'Noyau Vrille', dur: '8–12 min', prof: null, squad: 'Escouade recommandée',
    desc: 'Un transport s’est écrasé avec un Noyau Vrille. Neutralise les gardiens du site, récupère le noyau et livre-le à la plateforme Vesper.',
    reward: { cr: 400, xp: 200, rep: { expl: 25, ing: 25 } } },
  C: { id: 'C', type: 'Réactivation', name: 'Cœur Éclipse', dur: '10–15 min', prof: 'ingenieur', squad: 'Escouade de 4 recommandée',
    desc: 'Transporte un module énergétique jusqu’à la Centrale Éclipse, en zone contestée, puis défends le dispositif pendant la remise en service. Le résultat modifie le monde pour tous.',
    reward: { cr: 600, xp: 300, rep: { ing: 60 } }, needs: 'off' },
  D: { id: 'D', type: 'Nouvelle mission', name: 'Signal 07', dur: '8–12 min', prof: null, squad: 'Escouade recommandée',
    desc: 'La Centrale réactivée capte un signal venu d’un laboratoire absent des cartes. Remonte sa trace depuis la salle de contrôle ouest.',
    reward: { cr: 800, xp: 400, rep: { expl: 50, ing: 20 } }, needs: 'active' },
};
function missionAvailable(id) { const d = MISSIONS[id]; if (d.needs === 'off' && G.cent.active) return 'La Centrale est déjà réactivée.'; if (d.needs === 'active' && !G.cent.active) return 'Disponible quand la Centrale est réactivée.'; if (G.mission) return 'Une mission est déjà en cours.'; return null; }
function startMission(id) {
  if (missionAvailable(id)) return false;
  const def = MISSIONS[id], m = { def, t0: G.t, stepI: 0, group: [], downs: 0, kills: 0 };
  m.next = () => { m.stepI++; m.stepT = G.t; enterStep(m); };
  G.mission = m; MSETUP[id](m); enterStep(m); G.ev('mstart', def); AUTH.push('mission', `Mission ${def.name} démarrée`);
  return true;
}
function enterStep(m) { const s = m.steps[m.stepI]; if (!s) return completeMission(m); m.stepId = s.id; m.stepT = G.t; if (s.enter) s.enter(m); G.ev('mstep', s); }
function abandonMission() { const m = G.mission; if (!m) return; for (const a of m.group) if (a.alive) a.alive = false; if (m.device) { const i = G.actors.indexOf(m.device); if (i >= 0) G.actors.splice(i, 1); } G.items = G.items.filter(i => !i.mission); if (G.P.carry) G.P.carry = null; G.mission = null; G.ev('mabandon'); AUTH.push('mission', `Mission ${m.def.name} abandonnée`); }
function completeMission(m) {
  const d = m.def, r = JSON.parse(JSON.stringify(d.reward));
  const P = G.P; if (r.rep) { if (P.prof === 'eclaireur' && r.rep.expl) r.rep.expl = Math.round(r.rep.expl * 1.5); if (P.prof === 'ingenieur' && r.rep.ing) r.rep.ing = Math.round(r.rep.ing * 1.5); }
  let secText = null; if (m.sec) { secText = m.sec.text; if (m.sec.done || (m.sec.check && m.sec.check(m))) { r.cr += 80; r.xp += 40; m.sec.ok = true; } }
  AUTH.grant(r, `Mission ${d.name}`); G.save.done[d.id] = (G.save.done[d.id] || 0) + 1;
  if (m.device) { const i = G.actors.indexOf(m.device); if (i >= 0) G.actors.splice(i, 1); }
  G.mission = null; if (d.id === 'C') activateCentrale(); doSave();
  G.ev('mdone', { def: d, r, sec: m.sec, time: G.t - m.t0, downs: m.downs, kills: m.kills });
}
function mGroup(m, type, x, z, opt) { const a = spawnEnemy(type, x, z, Object.assign({ group: 'm' }, opt)); m.group.push(a); return a; }
const MSETUP = {
  A(m) {
    const z = W.dyn.reconZones[Math.floor(Math.random() * 3)]; m.zone = z;
    const a = Math.random() * TAU, d = 8 + Math.random() * 12; let bx = z.x + Math.cos(a) * d, bz = z.z + Math.sin(a) * d;
    for (let k = 0; k < 20 && !W.freeAt(bx, bz, 0.8); k++) { bx += rnd(-3, 3); bz += rnd(-3, 3); }
    m.beacon = { x: bx, z: bz, seen: false };
    m.sec = Math.random() < 0.5 ? { kind: 'drones', text: 'Secondaire : neutraliser 2 drones', check: mm => ((mm.killsBy || {}).drone || 0) >= 2 } : { kind: 'cache', text: 'Secondaire : ouvrir une cache près de la zone' };
    m.steps = [
      { id: 'goto', text: 'Rejoins la zone de recherche', tgt: () => ({ x: z.x, z: z.z, r: 28 }), tick: () => Math.hypot(G.P.x - z.x, G.P.z - z.z) < 28 },
      { id: 'find', text: () => G.P.prof === 'eclaireur' ? 'Localise la balise · utilise ton Scan' : 'Localise la balise · fouille la zone', tgt: () => m.beacon.seen ? { x: m.beacon.x, z: m.beacon.z } : { x: z.x, z: z.z, r: 28, area: true },
        tick: () => { const d = Math.hypot(G.P.x - m.beacon.x, G.P.z - m.beacon.z); if (d < 9 && W.los(G.P.x, 1.5, G.P.z, m.beacon.x, 0.5, m.beacon.z)) m.beacon.seen = true; return m.beacon.seen; } },
      { id: 'dl', text: 'Télécharge les données de la balise', tgt: () => ({ x: m.beacon.x, z: m.beacon.z }), enter: () => {},
        tick: () => m.dlDone },
      { id: 'back', text: 'Transmets les données au terminal de l’Avant-Poste', tgt: () => ({ x: -8, z: 137.5 }), tick: () => m.sent },
    ];
    m.interact = () => {
      const r = [];
      if (m.stepId === 'dl') r.push({ x: m.beacon.x, z: m.beacon.z, label: 'Télécharger les données', hold: 4, act: () => { m.dlDone = true; for (let k = 0; k < 2; k++) mGroup(m, 'drone', m.beacon.x + rnd(-20, 20), m.beacon.z + rnd(-20, 20), { target: G.P }); mGroup(m, 'patrol', m.beacon.x + 22, m.beacon.z + 10, { target: G.P }); G.ev('toast', { t: 'Signal détecté — des drones convergent', c: 'orange' }); } });
      if (m.stepId === 'back') r.push({ x: -8, z: 137.2, label: 'Transmettre les données', hold: 1, r: 2.6, act: () => { m.sent = true; } });
      return r;
    };
  },
  B(m) {
    const c = W.dyn.crash[Math.floor(Math.random() * 2)]; m.site = c;
    m.sec = Math.random() < 0.5 ? { kind: 'nodown', text: 'Secondaire : aucun membre à terre', check: mm => mm.downs === 0 } : { kind: 'fast', text: 'Secondaire : livrer en moins de 7 min', check: mm => G.t - mm.t0 < 420 };
    m.steps = [
      { id: 'goto', text: 'Rejoins le site du crash', tgt: () => ({ x: c.x, z: c.z }), enter: () => {
        mGroup(m, 'sentinel', c.x + 6, c.z + 5); mGroup(m, 'sentinel', c.x - 7, c.z - 4); mGroup(m, 'patrol', c.x + 10, c.z - 8, { wp: [[c.x + 10, c.z - 8], [c.x - 10, c.z - 8], [c.x - 8, c.z + 10]] }); mGroup(m, 'patrol', c.x - 9, c.z + 9); mGroup(m, 'drone', c.x, c.z);
      }, tick: () => Math.hypot(G.P.x - c.x, G.P.z - c.z) < 30 },
      { id: 'clear', text: () => `Neutralise les gardiens du site (${m.group.filter(a => a.alive).length} restants)`, tgt: () => ({ x: c.x, z: c.z }), tick: () => m.group.filter(a => a.alive).length === 0 },
      { id: 'take', text: 'Récupère le Noyau Vrille dans l’épave', tgt: () => ({ x: c.x - 1, z: c.z + 3.5 }), enter: () => { G.items.push({ kind: 'noyau', x: c.x - 1, z: c.z + 3.6, y: 0, mission: true }); }, tick: () => squadCarry('noyau') },
      { id: 'deliver', text: () => squadCarry('noyau') ? 'Livre le Noyau à la plateforme Vesper' : 'Récupère le Noyau tombé', tgt: () => { const it = G.items.find(i => i.kind === 'noyau'); return it && !squadCarry('noyau') ? { x: it.x, z: it.z } : { x: W.dyn.vesper.x, z: W.dyn.vesper.z }; },
        enter: () => { m.waveT = G.t + 18; }, tick: (dt) => {
          if (m.waveT && G.t > m.waveT) { m.waveT = 0; for (let k = 0; k < 3; k++) mGroup(m, k ? 'patrol' : 'drone', c.x + rnd(-12, 12), c.z - 20 + rnd(-5, 5), { target: G.P }); G.ev('toast', { t: 'Des renforts de la Dérive te poursuivent', c: 'orange' }); }
          return G.P.carry === 'noyau' && Math.hypot(G.P.x - W.dyn.vesper.x, G.P.z - W.dyn.vesper.z) < 5; } },
    ];
  },
  C(m) {
    const relays = G.save.relays.length; m.dur = Math.max(64, 120 - relays * 8); m.prog = 0;
    m.sec = { kind: 'device', text: 'Secondaire : dispositif au-dessus de 50 %', check: mm => mm.minHp > 0.5 }; m.minHp = 1;
    const sock = { x: 0, z: -130.2 };
    m.steps = [
      { id: 'pickup', text: 'Récupère le module énergétique au dépôt', tgt: () => ({ x: 21, z: 150.4 }), tick: () => squadCarry('module') },
      { id: 'carry', text: () => squadCarry('module') ? 'Transporte le module jusqu’au socle de la Centrale' : 'Récupère le module tombé', tgt: () => { const it = G.items.find(i => i.kind === 'module'); return it && !squadCarry('module') ? { x: it.x, z: it.z } : sock; }, tick: () => m.installed },
      { id: 'defend', text: () => `Défends le dispositif · remise en service ${Math.floor(m.prog / m.dur * 100)} %`, tgt: () => sock, enter: () => {
        m.device = mkActor({ kind: 'device', faction: 'squad', x: 0, z: -131.6, y: 1.1, hp: 1500, maxHp: 1500, r: 0.9, h: 1.6, label: 'Dispositif' }); G.actors.push(m.device);
        m.waves = [3, 22, 42, 62, 84, 104]; m.cendre = 30; G.ev('toast', { t: 'Remise en service lancée — tiens la position', c: 'cyan' });
      }, tick: (dt) => {
        const dv = m.device; if (!dv.alive) { m.prog = Math.max(0, m.prog - m.dur * 0.3); m.installed = false; m.stepI = 1; G.items.push({ kind: 'module', x: 0.8, z: -129.5, y: 0, mission: true }); G.actors.splice(G.actors.indexOf(dv), 1); m.device = null; enterStep(m); G.ev('toast', { t: 'Surcharge ! Le module a été éjecté — réinstalle-le', c: 'orange' }); return false; }
        m.prog += dt; m.minHp = Math.min(m.minHp, dv.hp / dv.maxHp); const el = G.t - m.stepT, extra = squad().length - 1;
        while (m.waves.length && el > m.waves[0]) { m.waves.shift(); const sp = [[0, -184], [44, -140], [-44, -140], [26, -184], [-26, -184]];
          const n = 2 + Math.min(3, extra); for (let k = 0; k < n; k++) { const p = sp[Math.floor(Math.random() * sp.length)]; const a = mGroup(m, Math.random() < 0.3 ? 'drone' : 'patrol', p[0] + rnd(-4, 4), p[1] + rnd(-4, 4)); a.ai.goal = { x: 0, z: -131, r: 9, attack: dv }; } G.ev('wave'); }
        if (m.cendre && el > m.cendre) { m.cendre = 0; for (let k = 0; k < 3; k++) { const a = mGroup(m, 'rival', -24 + k * 2, -186); a.ai.goal = { x: 0, z: -131, r: 12, attack: dv }; } G.ev('toast', { t: 'L’escouade Cendre conteste la Centrale', c: 'orange' }); }
        return m.prog >= m.dur; } },
    ];
    m.interact = () => {
      const r = [], P = G.P;
      if (m.stepId === 'pickup') r.push({ x: 21, z: 150.4, label: 'Prendre le module énergétique', hold: 1, act: () => { P.carry = 'module'; G.ev('pickup', 'module'); } });
      if (m.stepId === 'carry' && P.carry === 'module') r.push({ x: sock.x, z: sock.z, r: 2.6, label: P.prof === 'ingenieur' ? 'Installer le module (Ingénieur · 3 s)' : 'Installer le module (8 s · plus rapide en Ingénieur)', hold: P.prof === 'ingenieur' ? 3 : 8, act: () => { P.carry = null; m.installed = true; m.next(); } });
      if (m.stepId === 'defend' && m.device && m.device.hp < m.device.maxHp) r.push({ x: sock.x, z: sock.z, r: 2.8, label: P.prof === 'ingenieur' ? 'Réparer le dispositif (maintenir)' : 'Réparation · Ingénieur requis', deny: P.prof !== 'ingenieur', cont: dt => { m.device.hp = Math.min(m.device.maxHp, m.device.hp + 75 * (G.save.rep.ing >= 150 ? 1.25 : 1) * dt); G.repairing = G.t; } });
      return r;
    };
  },
  D(m) {
    resetLab();
    m.steps = [
      { id: 'signal', text: 'Remonte le signal depuis la salle de contrôle ouest', tgt: () => ({ x: -22.5, z: -140 }), tick: () => false },
      { id: 'lab', text: 'Suis le signal jusqu’au Laboratoire 07', tgt: () => ({ x: 150, z: -10 }), enter: () => { G.save.labKnown = true; G.ev('toast', { t: 'Coordonnées du Laboratoire 07 ajoutées à la carte', c: 'violet' }); }, tick: () => Math.hypot(G.P.x - 150, G.P.z + 10) < 16 },
      { id: 'puzzle', text: 'Rétablis les trois flux · examine le panneau et les vannes', tgt: () => ({ x: 152, z: -19 }), tick: () => false },
      { id: 'boss', text: 'Neutralise le Gardien 07', tgt: () => ({ x: 170, z: -10 }), tick: () => G.labDead },
      { id: 'log', text: 'Consulte le journal du Labo 07', tgt: () => ({ x: 174.4, z: -10 }), tick: () => false },
    ];
  },
};
function squadCarry(k) { return G.P.carry === k; }
function updateMission(dt) {
  const m = G.mission; if (!m) return; const s = m.steps[m.stepI]; if (!s) return;
  if (s.tick && s.tick(dt) && m.steps[m.stepI] === s) m.next();
}

/* ---------------- Centrale Éclipse (monde persistant) ---------------- */
const CENT_TTL = 24 * 3600 * 1000;
function applyCentrale(st, live) {
  const was = G.cent.active, active = st.state === 'active' && Date.now() - (st.since || 0) < CENT_TTL;
  G.cent.active = active; G.cent.since = st.since || 0; G.cent.by = st.callsign || ''; G.cent.cycle = st.cycle || 0;
  for (const d of W.dyn.doors) if (d.id !== 'lab') d.want = active ? 1 : 0;
  if (live && was !== active) G.ev('centrale', { active, by: G.cent.by });
  if (!live) G.cent.k = active ? 1 : 0;
}
function activateCentrale() {
  const st = { state: 'active', since: Date.now(), callsign: G.save.name, cycle: (G.cent.cycle || 0) + 1 };
  AUTH.push('monde', `État persistant · Centrale Éclipse → Réactivée (cycle ${st.cycle})`);
  applyCentrale(st, true); NET.setCentrale(st);
}

/* ---------------- monde vivant ---------------- */
const SPAWNS = [
  ['patrol', -84, 22, { wp: [[-84, 22], [-96, 4], [-80, -6], [-70, 14]] }], ['patrol', -92, 34, { wp: [[-92, 34], [-110, 22], [-102, 44]] }], ['sentinel', -96, 16],
  ['sentinel', -102, -28], ['drone', -104, -36], ['patrol', -62, -70, { wp: [[-62, -70], [-46, -84], [-70, -90]] }], ['patrol', -56, -78, { wp: [[-56, -78], [-76, -60]] }],
  ['patrol', 64, 46, { wp: [[64, 46], [80, 30], [58, 24], [50, 52]] }], ['drone', 72, 40], ['patrol', 84, 54, { wp: [[84, 54], [66, 66]] }],
  ['sentinel', 86, -30], ['patrol', 70, -40, { wp: [[70, -40], [86, -58], [60, -62]] }], ['drone', -140, 60], ['patrol', -130, 72, { wp: [[-130, 72], [-150, 52], [-120, 48]] }],
  ['sentinel', -12, -119], ['sentinel', 14, -150], ['sentinel', -20, -160], ['patrol', 0, -118, { wp: [[0, -118], [24, -126], [24, -162], [-24, -164], [-26, -122]] }],
  ['patrol', 20, -165, { wp: [[20, -165], [-10, -166], [-26, -150]] }], ['drone', 8, -128], ['drone', -16, -152],
  ['sentinel', 150, -15, { group: 'lab' }], ['sentinel', 152, 1, { group: 'lab' }],
];
function initSpawns() {
  G.spawns = SPAWNS.map(([type, x, z, o]) => ({ type, x, z, o: o || {}, respawn: 0, a: null }));
  for (const s of G.spawns) { s.a = spawnEnemy(s.type, s.x, s.z, Object.assign({ spawn: s }, s.o)); }
  if (!G.save.tut) { G.tutBot = spawnEnemy('patrol', -6, 180, { wp: [[-6, 180], [9, 179]], tut: true }); G.tutBot.ai.passive = true; G.tut = { step: 0, t: 0, yaw0: G.cam.yaw, turned: 0, x0: G.P.x, z0: G.P.z }; }
}
function updateWorld(dt) {
  for (const s of G.spawns) if (s.respawn && G.t > s.respawn) { if (Math.hypot(G.P.x - s.x, G.P.z - s.z) > 75) { s.respawn = 0; s.a = spawnEnemy(s.type, s.x, s.z, Object.assign({ spawn: s }, s.o)); } else s.respawn = G.t + 20; }
  for (const c of W.dyn.caches) if (c.open && c.reopen && G.t > c.reopen && Math.hypot(G.P.x - c.x, G.P.z - c.z) > 60) { c.open = false; }
  for (const d of W.dyn.doors) { d.open = lerp(d.open, d.want, Math.min(1, dt * 1.4)); d.col.on = d.open < 0.5; }
  G.cent.k = lerp(G.cent.k, G.cent.active ? 1 : 0, Math.min(1, dt * 0.7));
  if (G.cent.active && Date.now() - G.cent.since > CENT_TTL) { const st = { state: 'off', since: Date.now(), callsign: '', cycle: G.cent.cycle }; applyCentrale(st, true); NET.setCentrale(st); AUTH.push('monde', 'Réinitialisation contrôlée · Centrale Éclipse → Hors service (24 h écoulées)'); }
  // Gardien vaincu ?
  if (G.gardien && !G.gardien.alive && !G.labDead) { G.labDead = true; G.save.lab.gardien = true; queueSave(); G.ev('gardien-down'); }
  // escouade Cendre itinérante
  if (!G.mission && inCentrale(G.P.x, G.P.z) && G.t > (G.cendreT || 90)) { G.cendreT = G.t + 240; for (let k = 0; k < 3; k++) { const a = spawnEnemy('rival', -20 + k * 2, -186, { group: 'cendre' }); a.ai.state = 'search'; a.ai.lx = 0; a.ai.lz = -140; a.ai.lt = G.t; } G.ev('toast', { t: 'L’escouade Cendre entre dans la zone contestée', c: 'orange' }); }
  // nettoyage
  if (G.actors.length > 70) G.actors = G.actors.filter(a => a.alive || a.kind === 'bot' || a.kind === 'player' || G.t - a.deadT < 10);
  for (const [e, t] of G.marks) if (t < G.t || !e.alive) G.marks.delete(e);
  if (G.ping && G.t - G.ping.t > 20) G.ping = null;
  if (saveTimer > 0) { saveTimer -= dt; if (saveTimer <= 0) doSave(); }
  // joueurs : bascule à terre
  const P = G.P;
}
function updateFx(dt) {
  const F = G.fx;
  for (const t of F.tr) t.life -= dt; F.tr = F.tr.filter(t => t.life > 0);
  for (const s of F.sp) { s.life -= dt; s.vy -= 9 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt; if (s.y < 0) { s.y = 0; s.vy *= -0.3; } } F.sp = F.sp.filter(s => s.life > 0);
  for (const r of F.rings) r.life -= dt; F.rings = F.rings.filter(r => r.life > 0);
  for (const l of G.light) l.life -= dt; G.light = G.light.filter(l => l.life > 0);
}
G.light = [];

/* ---------------- boucle ---------------- */
function tick(dt) {
  G.t += dt;
  updatePlayer(dt);
  for (const a of G.actors) {
    if (a === G.P) continue;
    if (a.kind === 'bot') updateBot(a, dt);
    else if (a.alive && a.kind !== 'device') { if (Math.hypot(a.x - G.P.x, a.z - G.P.z) < 120 || a.ai.goal) updateEnemy(a, dt); if (a.kind !== 'drone' && a.kind !== 'gardien') physics(a, dt); }
  }
  // réanimation du joueur par un coéquipier humain : non simulée ici ; fin de l'agonie gérée dans updatePlayer
  updateFocus(dt); updateMission(dt); updateTutorial(dt); updateWorld(dt); updateFx(dt);
  if (G.repairing && G.t - G.repairing > 0.2) G.repairing = 0;
}

/* ---------------- tutoriel (15 premières minutes) ---------------- */
const TUT = [
  { text: 'Déplace-toi avec le joystick gauche', sub: 'Pousse à fond pour courir' },
  { text: 'Glisse à droite de l’écran pour orienter la caméra', sub: 'Regarde autour de toi' },
  { text: 'Franchis la poutre au nord', sub: 'Le franchissement est automatique · bouton ⤒ pour sauter' },
  { text: 'Un patrouilleur de la Dérive ! Vise et tire', sub: 'Maintiens ◎ pour viser · le tir est validé par le serveur' },
  { text: 'Rejoins l’Avant-Poste au nord', sub: 'Zone sûre : pas de PvP' },
  { text: 'Parle à Ilya au terminal des missions', sub: 'Choisis ta première mission' },
  { text: 'Forme ton escouade au tableau', sub: 'Jusqu’à 4 opérateurs' },
];
function updateTutorial(dt) {
  const T = G.tut; if (!T) return; const P = G.P;
  if (T.step === 0 && Math.hypot(P.x - T.x0, P.z - T.z0) > 4) T.step = 1;
  if (T.step === 1) { T.turned += Math.abs(angDiff(T.yaw0, G.cam.yaw)); T.yaw0 = G.cam.yaw; if (T.turned > 1.2) T.step = 2; }
  if (T.step <= 2 && P.z < 183.6) T.step = 3;
  if (T.step === 3) { if (G.tutBot) G.tutBot.ai.passive = false; if (!G.tutBot || !G.tutBot.alive) { T.step = 4; if (G.tutBot) G.ev('toast', { t: 'Premier contact maîtrisé', c: 'cyan' }); } }
  if (T.step >= 2 && T.step < 4 && (inAP(P.x, P.z) || !P.alive)) T.step = 4;
  if (T.step === 4 && inAP(P.x, P.z)) T.step = 5;
  if (T.step === 5 && G.save.tut) T.step = 6;
  if (T.step === 6 && (squad().length > 1 || G.mission)) { G.tut = null; G.ev('toast', { t: 'Formation terminée — bonne chasse, opérateur', c: 'cyan' }); return; }
  T.cur = TUT[T.step];
}
function initWorldState() {
  const s = G.save, door = W.dyn.doors.find(d => d.id === 'lab');
  if (s.lab.solved) { G.labOpen = true; G.labL = [1, 1, 1]; W.dyn.valves[0].on = true; W.dyn.valves[2].on = true; door.want = 1; door.open = 1; }
  if (s.lab.gardien) G.labDead = true; else if (s.lab.solved) G.gardien = spawnEnemy('gardien', 170, -10, { group: 'lab' });
}

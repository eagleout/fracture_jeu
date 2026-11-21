'use strict';
/* FRACTURE — interface : contrôles tactiles, HUD, écrans, son. */
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtT = s => `${Math.floor(s / 60)} min ${String(Math.floor(s % 60)).padStart(2, '0')} s`;

/* ---------- son synthétisé ---------- */
const AU = {
  ctx: null, master: null,
  init() { if (this.ctx) return; try { const C = window.AudioContext || window.webkitAudioContext; this.ctx = new C(); this.master = this.ctx.createGain(); this.master.gain.value = G.save ? G.save.settings.vol : 0.7; this.master.connect(this.ctx.destination); this.amb(); } catch (e) { this.ctx = null; } },
  vol(v) { if (this.master) this.master.gain.value = v; },
  noise(dur) { const c = this.ctx, b = c.createBuffer(1, Math.max(1, c.sampleRate * dur), c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; const s = c.createBufferSource(); s.buffer = b; return s; },
  env(node, t, a, d, v) { const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); node.connect(g); g.connect(this.master); return g; },
  tone(f, d, v = 0.15, type = 'sine', f2) { if (!this.ctx) return; const c = this.ctx, t = c.currentTime, o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d); this.env(o, t, 0.005, d, v); o.start(t); o.stop(t + d + 0.05); },
  burst(d, fq, q, v, type = 'bandpass') { if (!this.ctx) return; const c = this.ctx, t = c.currentTime, n = this.noise(d + 0.05), f = c.createBiquadFilter(); f.type = type; f.frequency.value = fq; f.Q.value = q; n.connect(f); this.env(f, t, 0.002, d, v); n.start(t); },
  play(k) {
    if (!this.ctx) return;
    switch (k) {
      case 'rifle': this.burst(0.07, 1900, 0.8, 0.35); this.tone(140, 0.06, 0.18, 'triangle', 70); break;
      case 'shotgun': this.burst(0.22, 800, 0.6, 0.5, 'lowpass'); this.tone(90, 0.15, 0.25, 'triangle', 45); break;
      case 'sniper': this.burst(0.3, 1200, 0.5, 0.45); this.tone(320, 0.35, 0.2, 'sawtooth', 60); break;
      case 'enemy': this.burst(0.05, 2600, 1.2, 0.08); break;
      case 'hit': this.tone(1300, 0.04, 0.12, 'square'); break;
      case 'kill': this.tone(880, 0.09, 0.14); setTimeout(() => this.tone(1320, 0.12, 0.12), 70); break;
      case 'hurt': this.tone(110, 0.12, 0.25, 'sine', 60); break;
      case 'ui': this.tone(660, 0.05, 0.08); break;
      case 'reload': this.burst(0.03, 3000, 2, 0.15); setTimeout(() => this.burst(0.03, 2200, 2, 0.15), 220); break;
      case 'signal': this.tone(600, 0.35, 0.12, 'square', 1250); break;
      case 'scan': this.tone(280, 0.7, 0.1, 'sine', 980); break;
      case 'heal': this.tone(520, 0.3, 0.1, 'sine', 780); break;
      case 'done': [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.25, 0.1), i * 110)); break;
      case 'centrale': [220, 277, 330, 440].forEach((f, i) => setTimeout(() => this.tone(f, 2.2, 0.08, 'sawtooth', f * 2), i * 180)); break;
      case 'valve': this.tone(300, 0.2, 0.12, 'triangle', 420); break;
      case 'alert': this.tone(740, 0.12, 0.12, 'square'); setTimeout(() => this.tone(740, 0.12, 0.12, 'square'), 180); break;
    }
  },
  amb() { const c = this.ctx, n = this.noise(4), f = c.createBiquadFilter(), g = c.createGain(); n.loop = true; f.type = 'lowpass'; f.frequency.value = 380; g.gain.value = 0.035; n.connect(f); f.connect(g); g.connect(this.master); n.start();
    const o = c.createOscillator(), g2 = c.createGain(); o.frequency.value = 55; g2.gain.value = 0.02; o.connect(g2); g2.connect(this.master); o.start(); },
};
const buzz = ms => { try { if (G.save && G.save.settings.vib && navigator.vibrate) navigator.vibrate(ms); } catch (e) { } };

const UI = {
  el: {}, last: {}, toasts: [], hitT: -9, killT: -9, dmgArcs: [], tab: 'missions', bg: null, joy: { id: null }, look: { id: null }, fireId: null,
  init() {
    for (const id of ['hud', 'layer', 'stick', 'meName', 'meSub', 'meIcon', 'hpbar', 'medBtn', 'objK', 'objT', 'objD', 'objBar', 'squadList', 'feed', 'compass', 'zone', 'bossbar', 'toasts', 'mini', 'inst', 'ammo', 'weapons', 'fire', 'aim', 'ability', 'abCd', 'abIcon', 'fireL', 'interact', 'iRing', 'iLabel', 'autoBadge', 'carry', 'downO', 'downT', 'downBar', 'deadO', 'rsAP', 'rsCent', 'vig', 'panel', 'tabs', 'pbody', 'reward', 'rwBox', 'dialog', 'dlgBox', 'wheel', 'wheelBox', 'stickHint', 'rotate']) this.el[id] = $(id);
    this.ov = $('ov'); this.ctx = this.ov.getContext('2d'); this.cc = this.el.compass.getContext('2d'); this.mc = this.el.mini.getContext('2d');
    this.el.weapons.innerHTML = WEAPONS.map((w, i) => `<button class="wslot" data-b="w${i}"><b>${w.mag}/${w.mag}</b><span>${i + 1} · ${esc(w.short)}</span></button>`).join('');
    this.bindControls(); this.bindKeys();
    this.el.rsAP.onclick = () => { respawnPlayer('ap'); AU.play('ui'); };
    this.el.rsCent.onclick = () => { respawnPlayer('cent'); AU.play('ui'); };
    window.addEventListener('resize', () => this.resize()); this.resize();
    $('rotate').classList.add('need');
  },
  resize() { const d = Math.min(window.devicePixelRatio || 1, 2); this.ov.width = innerWidth * d; this.ov.height = innerHeight * d; this.ctx.setTransform(d, 0, 0, d, 0, 0); },
  /* ---------- contrôles ---------- */
  sens(dx) { const st = G.save.settings, P = G.P, w = WEAPONS[P.w]; let k = 0.0058 * st.sens; if (P.aim) k *= st.aimSens * (w.zoom / 66); if (G.assistSlow && st.assist) k *= 0.7; return dx * k; },
  bindControls() {
    const L = this.el.layer, stick = this.el.stick, knob = stick.querySelector('i');
    L.addEventListener('pointerdown', e => {
      if (G.state !== 'play') return; AU.init();
      if (e.pointerType === 'mouse') { if (e.button === 2) { G.P.aim = true; return; } this.look.id = e.pointerId; this.look.x = e.clientX; this.look.y = e.clientY; this.look.mouse = true; try { L.setPointerCapture(e.pointerId); } catch (_) { } return; }
      if (e.clientX < innerWidth * 0.42 && this.joy.id === null) { this.joy = { id: e.pointerId, ox: e.clientX, oy: e.clientY }; stick.style.left = e.clientX + 'px'; stick.style.top = e.clientY + 'px'; stick.classList.remove('hide'); knob.style.transform = ''; if (I.autoRun) { I.autoRun = false; } this.el.stickHint.classList.add('hide'); }
      else if (this.look.id === null) { this.look = { id: e.pointerId, x: e.clientX, y: e.clientY }; }
      try { L.setPointerCapture(e.pointerId); } catch (_) { }
    });
    L.addEventListener('pointermove', e => {
      if (e.pointerId === this.joy.id) {
        const R0 = 52; let dx = e.clientX - this.joy.ox, dy = e.clientY - this.joy.oy; const l = Math.hypot(dx, dy);
        const lock = dy < -R0 * 1.65 && G.save.settings.autorun; stick.classList.toggle('auto', lock); this.joy.lock = lock;
        if (l > R0) { dx = dx / l * R0; dy = dy / l * R0; } knob.style.transform = `translate(${dx}px,${dy}px)`; I.mx = dx / R0; I.my = -dy / R0;
      } else if (e.pointerId === this.look.id) {
        const dx = e.clientX - this.look.x, dy = e.clientY - this.look.y; this.look.x = e.clientX; this.look.y = e.clientY;
        G.cam.yaw -= this.sens(dx); G.cam.pitch += this.sens(dy);
      }
    });
    const end = e => {
      if (e.pointerId === this.joy.id) { if (this.joy.lock) { I.autoRun = true; } this.joy = { id: null }; I.mx = 0; I.my = 0; stick.classList.add('hide'); stick.classList.remove('auto'); }
      if (e.pointerId === this.look.id) this.look = { id: null };
      if (e.pointerType === 'mouse' && e.button === 2) G.P && (G.P.aim = false);
    };
    L.addEventListener('pointerup', end); L.addEventListener('pointercancel', end);
    L.addEventListener('contextmenu', e => e.preventDefault());
    // boutons
    document.querySelectorAll('#hud [data-b]').forEach(b => this.bindBtn(b));
  },
  bindBtn(b) {
    const k = b.dataset.b;
    b.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation(); AU.init(); try { b.setPointerCapture(e.pointerId); } catch (_) { }
      b.classList.add('on'); this.press(k, true, e);
      if (k === 'fire') { this.fireId = e.pointerId; this.fx = e.clientX; this.fy = e.clientY; }
    });
    b.addEventListener('pointermove', e => { if (k === 'fire' && e.pointerId === this.fireId) { const dx = e.clientX - this.fx, dy = e.clientY - this.fy; this.fx = e.clientX; this.fy = e.clientY; G.cam.yaw -= this.sens(dx); G.cam.pitch += this.sens(dy); } });
    const up = e => { b.classList.remove('on'); this.press(k, false, e); if (k === 'fire') this.fireId = null; };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
  },
  press(k, down, e) {
    if (G.state !== 'play') return; const P = G.P;
    if (k === 'fire') { I.fire = down; if (down) I.firePressed = true; return; }
    if (k === 'interact') { I.interact = down; return; }
    if (!down) return;
    if (k === 'aim') { P.aim = !P.aim; this.el.aim.classList.toggle('on', P.aim); }
    else if (k === 'jump') I.jump = true;
    else if (k === 'reload') I.reloadPress = true;
    else if (k === 'ability') I.ability = true;
    else if (k[0] === 'w') switchWeapon(+k[1]);
    else if (k === 'med') useMed();
    else if (k === 'map') this.open('map');
    else if (k === 'menu') this.open(this.tab || 'missions');
    else if (k === 'squadP') this.open('squad');
    else if (k === 'ping') this.doPing();
    else if (k === 'msg') this.wheel('msg');
    else if (k === 'emote') this.wheel('emote');
    else if (k === 'autoOff') I.autoRun = false;
  },
  bindKeys() {
    const keys = {}; this.keys = keys;
    const upd = () => { I.mx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0); I.my = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0); I.run = !!(keys.ShiftLeft || keys.ShiftRight); };
    addEventListener('keydown', e => {
      if (G.state !== 'play' || e.target.tagName === 'INPUT') return; if (e.repeat && !['KeyE', 'KeyF'].includes(e.code)) return; AU.init();
      keys[e.code] = true; upd();
      if (!this.el.panel.classList.contains('hide')) { if (e.code === 'Escape' || e.code === 'Tab') { e.preventDefault(); this.close(); } return; }
      const P = G.P;
      switch (e.code) {
        case 'Space': I.jump = true; e.preventDefault(); break; case 'KeyR': I.reloadPress = true; break; case 'KeyQ': I.ability = true; break;
        case 'Digit1': switchWeapon(0); break; case 'Digit2': switchWeapon(1); break; case 'Digit3': switchWeapon(2); break;
        case 'KeyE': I.interact = true; break; case 'KeyF': if (!I.fire) I.firePressed = true; I.fire = true; break; case 'KeyC': P.aim = !P.aim; break;
        case 'KeyT': this.doPing(); break; case 'KeyM': this.open('map'); break; case 'KeyH': useMed(); break; case 'KeyG': this.wheel('msg'); break;
        case 'Escape': case 'Tab': e.preventDefault(); this.open(this.tab || 'missions'); break;
      }
    });
    addEventListener('keyup', e => { keys[e.code] = false; upd(); if (e.code === 'KeyE') I.interact = false; if (e.code === 'KeyF') I.fire = false; });
    addEventListener('blur', () => { for (const k in keys) keys[k] = false; upd(); I.fire = false; I.interact = false; });
  },
  doPing() {
    const [cx, cy, cz] = G.camPos, [dx, dy, dz] = G.camDir; let best = null, bang = 0.07;
    for (const e of G.actors) { if (!e.alive || e.faction === 'squad') continue; const ex = e.x - cx, ey = chestY(e) - cy, ez = e.z - cz, d = Math.hypot(ex, ey, ez); if (d > 90) continue; const a = Math.acos(clamp((ex * dx + ey * dy + ez * dz) / d, -1, 1)); if (a < bang) { bang = a; best = e; } }
    let p; if (best) p = { x: best.x, z: best.z, kind: 'enemy', t: G.t, label: best.label };
    else { const h = W.raycast(cx, cy, cz, dx, dy, dz, 160); const t = h ? h.t : 60; p = { x: cx + dx * t, z: cz + dz * t, kind: 'move', t: G.t, label: 'Allons ici' }; }
    G.ping = p; NET.sendPing(p); AU.play('ui');
    this.feed(G.save.name, p.kind === 'enemy' ? `Ennemi repéré : ${p.label}` : 'Allons ici.');
    const b = squad().find(a => a.kind === 'bot' && a.alive); if (b) setTimeout(() => say(b, p.kind === 'enemy' ? 'Je l’ai.' : 'Bien reçu, on y va.'), 600);
  },
  wheel(kind) {
    const box = this.el.wheelBox, list = kind === 'msg' ? MSGS : EMOTES;
    box.innerHTML = list.map((m, i) => `<button data-i="${i}">${esc(m)}</button>`).join('') + '<button data-i="-1" style="grid-column:1/-1;opacity:.7">Fermer</button>';
    this.el.wheel.classList.remove('hide');
    box.querySelectorAll('button').forEach(b => b.onclick = () => {
      const i = +b.dataset.i; this.el.wheel.classList.add('hide'); if (i < 0) return; AU.play('ui');
      if (kind === 'msg') { NET.sendMsg(i); this.feed(G.save.name, MSGS[i]); const bot = squad().find(a => a.kind === 'bot' && a.alive); if (bot && Math.random() < 0.8) setTimeout(() => say(bot, ['Je me regroupe.', 'J’arrive !', 'Je viens te relever.', 'Merci, toi aussi.', 'Bien.', 'Je t’attends.', 'Avec plaisir.', 'Je le vois.'][i]), 700); }
      else { G.P.emote = EMOTES[i]; G.P.emoteT = G.t + 2.2; NET.sendEmote(i); }
    });
    this.el.wheel.onclick = e => { if (e.target === this.el.wheel) this.el.wheel.classList.add('hide'); };
  },
  /* ---------- événements ---------- */
  toast(t, c = 'cyan', ms = 3600) { const now = performance.now(); if (this.lastToast === t && now - this.lastToastT < 4000) return; this.lastToast = t; this.lastToastT = now; const d = document.createElement('div'); d.className = 'toast ' + c; d.textContent = t; this.el.toasts.appendChild(d); while (this.el.toasts.children.length > 3) this.el.toasts.firstChild.remove(); setTimeout(() => d.remove(), ms); },
  feed(from, text) { const d = document.createElement('div'); const b = document.createElement('b'); b.textContent = from + ' · '; d.appendChild(b); d.appendChild(document.createTextNode(text)); this.el.feed.appendChild(d); while (this.el.feed.children.length > 5) this.el.feed.firstChild.remove(); setTimeout(() => d.remove(), 7200); G.feed.unshift({ from, text, t: Date.now() }); if (G.feed.length > 40) G.feed.pop(); },
  onEvent(t, d) {
    const P = G.P;
    switch (t) {
      case 'hurt': { AU.play('hurt'); buzz(18); if (d.from) { const ang = Math.atan2(d.from.x - P.x, d.from.z - P.z); this.dmgArcs.push({ ang, t: G.t }); } break; }
      case 'hit': this.hitT = G.t; if (d.kill) { this.killT = G.t; AU.play('kill'); buzz(12); } else AU.play('hit'); break;
      case 'blocked': this.hitT = G.t; this.blockT = G.t; break;
      case 'fire': AU.play(d.snd); if (d.id !== 'vx7') buzz(8); break;
      case 'nearmiss': if (Math.random() < 0.2) AU.play('enemy'); break;
      case 'kill': this.feed('Neutralisé', d.label); break;
      case 'reload': AU.play('reload'); break;
      case 'zone': { const z = this.el.zone; z.innerHTML = `<b>${esc(d.name)}</b>${esc(d.sub)}`; z.className = d.pvp ? 'pvp' : d.safe ? 'safe' : ''; z.style.opacity = 1; clearTimeout(this.zt); this.zt = setTimeout(() => z.style.opacity = 0.55, 4000); if (d.pvp) { this.toast('Zone contestée — les autres escouades peuvent t’attaquer', 'orange'); AU.play('alert'); } if (d.id === 'lab' && !G.save.labSeen) { G.save.labSeen = true; queueSave(); this.toast('Localisation découverte : Laboratoire 07', 'violet'); } break; }
      case 'toast': this.toast(d.t, d.c); break;
      case 'chat': this.feed(d.from, d.text); break;
      case 'signal': AU.play('signal'); if (G.t - (this.sigT || -9) < 6) break; this.sigT = G.t; this.toast(`Un drone signale ta position (${d.n} unité${d.n > 1 ? 's' : ''} alertée${d.n > 1 ? 's' : ''})`, 'orange', 2600); break;
      case 'scan': AU.play('scan'); this.toast(`Scan : ${d.n} hostile${d.n > 1 ? 's' : ''} marqué${d.n > 1 ? 's' : ''}${d.found ? ` · ${d.found} point${d.found > 1 ? 's' : ''} d’intérêt` : ''}`, 'cyan', 2400); break;
      case 'poi': this.toast(`Point d’intérêt découvert : ${d.name} · +30 réputation d’exploration`, 'or'); break;
      case 'heal': AU.play('heal'); this.toast(`Nano-soin : ${d} membre${d > 1 ? 's' : ''} soigné${d > 1 ? 's' : ''}`, 'or', 2000); break;
      case 'relay': AU.play('done'); this.toast('Relais réparé · la remise en service de la Centrale sera plus courte', 'cyan'); break;
      case 'loot': AU.play('ui'); this.toast(`Cache : +${d.cr} crédits${d.med ? ' · +1 kit de soin' : ''}`, 'or', 2400); break;
      case 'downed': if (d === P) { AU.play('hurt'); buzz(60); } else this.toast(`${d.name} est à terre — maintiens Interagir près de lui`, 'orange'); break;
      case 'revived': if (d === P) this.toast('Relevé par un coéquipier', 'cyan'); break;
      case 'dead': buzz(120); break;
      case 'botdead': this.toast(`${d.name} est hors combat · retour à l’Avant-Poste`, 'orange'); break;
      case 'botback': this.toast(`${d.name} a rejoint l’Avant-Poste`, 'cyan', 2000); break;
      case 'respawn': this.toast(d === 'cent' ? 'Réapparition au point sécurisé de la Centrale' : 'Réapparition à l’Avant-Poste', 'cyan'); break;
      case 'pickup': AU.play('ui'); this.toast(d === 'noyau' ? 'Noyau Vrille récupéré' : 'Module énergétique en main', 'cyan', 2200); break;
      case 'drop': this.toast(d === 'noyau' ? 'Le Noyau est tombé au sol' : 'Le module est tombé au sol', 'orange'); break;
      case 'mstart': AU.play('done'); this.toast(`Mission : ${d.name}`, 'or'); { const b = squad().find(a => a.kind === 'bot'); if (b) setTimeout(() => say(b, 'Bien reçu. On y va.'), 800); } this.close(); break;
      case 'mstep': if (G.mission && G.mission.stepI > 0) AU.play('ui'); break;
      case 'mabandon': this.toast('Mission abandonnée', 'orange'); break;
      case 'mdone': AU.play('done'); this.showReward(d); break;
      case 'wave': AU.play('alert'); this.toast('Vague hostile en approche', 'orange', 2000); { const b = squad().find(a => a.kind === 'bot' && a.alive); if (b && Math.random() < 0.5) say(b, 'Contact !'); } break;
      case 'device': break;
      case 'centrale': AU.play('centrale'); this.toast(d.active ? `Centrale Éclipse réactivée${d.by ? ' par ' + d.by : ''} · état enregistré pour toutes les instances` : 'La Centrale Éclipse est de nouveau hors service', d.active ? 'cyan' : 'orange', 6000); break;
      case 'level': AU.play('done'); this.toast(`Rang ${d} atteint`, 'or'); break;
      case 'saved': this.toast(d.ok ? (NET.mode === 'cloud' && !NET.ro ? 'Progression sauvegardée sur ton compte' : 'Progression sauvegardée sur cet appareil') : 'Sauvegarde distante refusée · copie locale conservée', d.ok ? 'cyan' : 'orange', 2400); break;
      case 'safe-nofire': if (G.t - (this.nfT || 0) > 3) { this.nfT = G.t; this.toast('Armes désactivées dans l’Avant-Poste', 'cyan', 1800); } break;
      case 'vault': break;
      case 'valve': AU.play('valve'); break;
      case 'labopen': AU.play('done'); this.toast('Les trois flux brûlent — la porte du bunker s’ouvre', 'violet'); break;
      case 'gardien-shield': AU.play('alert'); this.toast('Le Gardien se protège et appelle des drones', 'violet', 2400); break;
      case 'gardien-down': AU.play('done'); this.toast('Gardien 07 neutralisé · le journal est accessible', 'violet'); break;
      case 'panel': this.dialog('Panneau du Laboratoire 07', '<p class="note" style="font-size:13px;color:var(--ivoire)">« Trois flux alimentent la porte. Chaque vanne en perturbe d’autres. Quand les trois brûlent ensemble, le gardien s’éveille. »</p><p class="note">Observe les trois témoins près de la porte. Une vanne peut être tournée plusieurs fois.</p>'); break;
      case 'journal': this.dialog('Journal 07 · Dr Inès Calder', JOURNAL); break;
      case 'terminal': this.dialog('Terminal de contrôle', '<p class="note" style="font-size:13px;color:var(--ivoire)">Réseau Éclipse en ligne. Un signal faible, d’origine inconnue, provient de l’est de la Gorge Cyan.</p><p class="note">Accepte la mission « Signal 07 » auprès d’Ilya pour remonter sa trace.</p>'); break;
      case 'invite': this.dialog('Invitation d’escouade', `<p class="note" style="font-size:13px;color:var(--ivoire)">${esc(d.name)} t’invite dans son escouade.</p><div style="display:flex;gap:8px;margin-top:12px"><button class="btn pri" id="dAcc">Rejoindre</button><button class="btn" id="dNo">Refuser</button></div>`, () => { $('dAcc').onclick = () => { NET.accept(d.peer); trimBots(); this.closeDialog(); }; $('dNo').onclick = () => this.closeDialog(); }); break;
      case 'instance': this.toast(`Instance ${d.name} rejointe`, 'cyan', 2200); break;
    }
  },
  /* ---------- rendu du HUD ---------- */
  frame(dt) {
    const P = G.P; if (!P) return;
    const c = this.ctx, Wd = innerWidth, Hd = innerHeight; c.clearRect(0, 0, Wd, Hd);
    if (G.state !== 'play') return;
    this.markers(c, Wd, Hd); this.crosshair(c, Wd, Hd);
    this.updInteract();
    this.hudT = (this.hudT || 0) - dt; if (this.hudT <= 0) { this.hudT = 0.1; this.hud(); this.compass(); this.minimap(); }
  },
  set(el, key, v, prop = 'textContent') { if (this.last[key] !== v) { this.last[key] = v; el[prop] = v; } },
  hud() {
    const P = G.P, s = G.save, e = this.el, w = WEAPONS[P.w];
    this.set(e.meName, 'nm', `${s.name} · Rang ${s.lvl}`);
    this.set(e.meSub, 'sub', `${PROFS[s.prof].name} · ${s.credits} cr`);
    this.set(e.meIcon, 'ic', PROFS[s.prof].icon);
    e.hpbar.firstChild.style.width = clamp(P.hp / P.maxHp * 100, 0, 100) + '%'; e.hpbar.classList.toggle('low', P.hp < 35);
    this.set(e.medBtn, 'med', `✚ ${s.med || 0}`);
    // objectif
    const m = G.mission; let k = 'Exploration libre', tx = 'Parle à Ilya à l’Avant-Poste pour une mission', d = '', prog = -1;
    if (m) { const st = m.steps[m.stepI]; k = `${m.def.type} · ${m.def.name}`; tx = st ? (typeof st.text === 'function' ? st.text() : st.text) : '';
      const tg = st && st.tgt && st.tgt(); if (tg) { const dd = Math.hypot(tg.x - P.x, tg.z - P.z); d = tg.area ? (dd < tg.r ? 'Dans la zone de recherche' : `Zone à ${Math.round(dd)} m`) : `${Math.round(dd)} m`; }
      if (m.stepId === 'defend' && m.device) { prog = m.prog / m.dur; d = `Dispositif ${Math.round(m.device.hp / m.device.maxHp * 100)} % · ${Math.ceil(m.dur - m.prog)} s`; }
      if (m.sec) d += (d ? ' · ' : '') + m.sec.text.replace('Secondaire : ', '2ᵉ : ');
    } else if (NET.squadWith && NET.remote.find(r => r.peer === NET.squadWith && r.ob)) { const L = NET.remote.find(r => r.peer === NET.squadWith); k = `Objectif d’escouade · ${L.name}`; tx = L.ob; d = `Chef à ${Math.round(Math.hypot(L.x - P.x, L.z - P.z))} m`; }
    else if (G.tut && G.tut.cur) { k = 'Formation'; tx = G.tut.cur.text; d = G.tut.cur.sub; }
    else if (!inAP(P.x, P.z, 4)) { d = `Avant-Poste à ${Math.round(Math.hypot(P.x, P.z - 150))} m`; }
    this.set(e.objK, 'ok', k); this.set(e.objT, 'ot', tx); this.set(e.objD, 'od', d);
    e.objBar.classList.toggle('hide', prog < 0); if (prog >= 0) e.objBar.firstChild.style.width = (prog * 100) + '%';
    // escouade
    const rows = [];
    for (const a of squad()) { if (a === P) continue; rows.push(`<div class="sq${a.downed || !a.alive ? ' down' : ''}"><span class="dot"></span><span class="n">${esc(a.name)} · ${PROFS[a.prof].name}</span>${!a.alive ? '<span class="hum" style="color:var(--orange)">hors combat</span>' : a.downed ? '<span class="hum" style="color:var(--orange)">à terre</span>' : `<span class="bar"><i style="width:${Math.round(a.hp / a.maxHp * 100)}%"></i></span>`}<span style="color:var(--muted);font-size:10px">${Math.round(Math.hypot(a.x - P.x, a.z - P.z))} m</span></div>`); }
    for (const r of NET.remote) if (r.inSquad) rows.push(`<div class="sq${r.downed ? ' down' : ''}"><span class="dot" style="background:var(--or)"></span><span class="n">${esc(r.name)}</span><span class="hum">joueur</span><span style="color:var(--muted);font-size:10px">${Math.round(Math.hypot(r.x - P.x, r.z - P.z))} m</span></div>`);
    this.set(e.squadList, 'sql', rows.join(''), 'innerHTML');
    // armes
    e.weapons.querySelectorAll('.wslot').forEach((b, i) => { b.classList.toggle('sel', i === P.w); const t = i === P.w && P.reload > 0 ? '↻' : `${P.ammo[i]}/${WEAPONS[i].mag}`; if (b.firstChild.textContent !== t) b.firstChild.textContent = t; });
    const cd = P.abil > 0 ? P.abil / PROFS[s.prof].abilityCd : 0; e.abCd.style.background = cd > 0 ? `conic-gradient(rgba(10,18,30,.72) ${cd * 100}%, transparent 0)` : 'none';
    this.set(e.abIcon, 'abi', s.prof === 'eclaireur' ? '◈' : '✚');
    e.fireL.classList.toggle('hide', !s.settings.leftFire);
    e.aim.classList.toggle('on', !!P.aim);
    e.autoBadge.classList.toggle('hide', !I.autoRun);
    e.carry.classList.toggle('hide', !P.carry); if (P.carry) this.set(e.carry, 'cr', P.carry === 'noyau' ? '⬢ Noyau Vrille transporté' : `⬢ Module énergétique${P.prof === 'ingenieur' ? '' : ' · déplacement ralenti'}`);
    this.set(e.inst, 'in', NET.inst ? `${NET.instName} · ${NET.instCount}/16 en ligne` : (NET.mode === 'cloud' ? 'Monde partagé · sans présence' : 'Mode local'));
    // boss
    const g = G.gardien; const showB = g && g.alive && g.ai.active && Math.hypot(g.x - P.x, g.z - P.z) < 40;
    e.bossbar.classList.toggle('hide', !showB); if (showB) { e.bossbar.querySelector('i').style.width = (g.hp / g.maxHp * 100) + '%'; e.bossbar.firstChild.textContent = g.ai.shield > 0 ? 'Gardien 07 · bouclier' : g.ai.vent ? 'Gardien 07 · noyau exposé' : 'Gardien 07'; }
    // à terre / neutralisé
    e.downO.classList.toggle('hide', !P.downed); if (P.downed) { const helper = squad().find(a => a !== P && a.alive && !a.downed); e.downT.textContent = `${Math.ceil(P.bleed)} s · ${helper ? helper.name + ' arrive pour te relever' : 'attends un coéquipier'}`; e.downBar.style.width = (P.revive * 100) + '%'; }
    e.deadO.classList.toggle('hide', P.alive); if (!P.alive) { const ready = G.t > G.respawnAt; e.rsAP.disabled = !ready; e.rsCent.disabled = !ready; e.rsCent.classList.toggle('hide', !G.cent.active); }
    e.vig.style.opacity = P.downed ? 0.9 : P.hp < 35 ? 0.55 : 0;
    G.assistSlow = false;
  },
  updInteract() {
    const f = G.focus, e = this.el;
    if (!f || !G.P.alive) { e.interact.classList.add('hide'); return; }
    e.interact.classList.remove('hide'); e.interact.classList.toggle('deny', !!f.deny); this.set(e.iLabel, 'il', f.label);
    const p = f.prog ? f.prog.revive * 0 + (G.holdT / (f.hold || 1)) : f.cont ? (G.repairing ? 1 : 0) : (f.hold ? G.holdT / f.hold : 0);
    e.iRing.style.setProperty('--p', Math.round(clamp(p, 0, 1) * 100) + '%');
  },
  P2: { x: 0, y: 0, w: 0 },
  markers(c, Wd, Hd) {
    const P = G.P, pr = this.P2, far = 2.1 / ENV.fogD;
    c.textAlign = 'center'; c.font = '600 11px Inter, system-ui, sans-serif';
    const tag = (x, y, z, text, col, sub) => { if (!R.project(x, y, z, pr)) return null; c.fillStyle = 'rgba(10,18,30,.55)'; const tw = c.measureText(text).width + 10; c.fillRect(pr.x - tw / 2, pr.y - 15, tw, 16); c.fillStyle = col; c.fillText(text, pr.x, pr.y - 3); if (sub != null) { c.fillStyle = 'rgba(255,255,255,.18)'; c.fillRect(pr.x - 18, pr.y + 3, 36, 3); c.fillStyle = col; c.fillRect(pr.x - 18, pr.y + 3, 36 * sub, 3); } return pr; };
    for (const a of squad()) { if (a === P || !a.alive) continue; const d = Math.hypot(a.x - P.x, a.z - P.z); if (d > far) continue; if (a.downed) { tag(a.x, a.y + 1.0, a.z, `✚ ${a.name} · à terre`, '#FF805B'); } else tag(a.x, a.y + 2.15, a.z, a.name, '#39D6CC', a.hp / a.maxHp); }
    for (const r of NET.remote) { if (Math.hypot(r.x - P.x, r.z - P.z) > far) continue; tag(r.x, r.y + 2.15, r.z, (r.downed ? '✚ ' : '') + r.name + (r.guest ? ' · invité' : ''), r.inSquad ? '#F5C66E' : '#F0EDE3'); }
    // ennemis marqués / blessés
    for (const a of G.actors) {
      if (!a.alive || a.faction === 'squad') continue; const d = Math.hypot(a.x - P.x, a.z - P.z); if (d > far) continue;
      const hy = a.kind === 'drone' ? a.y + 0.8 : a.kind === 'gardien' ? a.y + 2.4 : a.y + (a.kind === 'sentinel' ? 2.35 : 2.15);
      const marked = G.marks.has(a), hurt = G.t - a.lastHurt < 3;
      if ((marked || hurt) && R.project(a.x, hy, a.z, pr)) {
        if (marked) { c.fillStyle = '#FF805B'; c.beginPath(); c.moveTo(pr.x - 6, pr.y - 12); c.lineTo(pr.x + 6, pr.y - 12); c.lineTo(pr.x, pr.y - 4); c.fill(); }
        if (hurt && a.kind !== 'gardien') { c.fillStyle = 'rgba(0,0,0,.45)'; c.fillRect(pr.x - 20, pr.y, 40, 4); c.fillStyle = a.faction === 'cendre' ? '#F5C66E' : '#FF805B'; c.fillRect(pr.x - 20, pr.y, 40 * clamp(a.hp / a.maxHp, 0, 1), 4); }
        if (marked && d < 60) { c.fillStyle = 'rgba(255,128,91,.9)'; c.font = '600 10px Inter, sans-serif'; c.fillText(a.faction === 'cendre' ? 'Cendre' : a.label, pr.x, pr.y - 16); c.font = '600 11px Inter, system-ui, sans-serif'; }
      }
    }
    // stations
    if (inAP(P.x, P.z, 6)) for (const k in W.dyn.stations) { const s = W.dyn.stations[k]; const d = Math.hypot(s.x - P.x, s.z - P.z); if (d < 22) tag(s.x, 3.3, s.z, `${s.icon} ${s.label}`, '#F5C66E'); }
    tag(0, 9.6, 150, G.cent.active ? 'Centrale : réactivée' : 'Centrale : hors service', G.cent.active ? '#39D6CC' : '#FF805B');
    // points d'intérêt découverts
    for (const p of W.dyn.pois) if (G.save.pois.includes(p.id) && Math.hypot(p.x - P.x, p.z - P.z) < 90) tag(p.x, 3, p.z, `◇ ${p.name}`, 'rgba(245,198,110,.85)');
    // ping
    if (G.ping) { const p = tag(G.ping.x, 4.5, G.ping.z, `${G.ping.kind === 'enemy' ? '⚠' : '⌖'} ${G.ping.label} · ${Math.round(Math.hypot(G.ping.x - P.x, G.ping.z - P.z))} m`, G.ping.kind === 'enemy' ? '#FF805B' : '#39D6CC'); }
    for (const p of NET.peerPings) tag(p.x, 4.5, p.z, `⌖ ${p.from}`, '#F5C66E');
    // objectif (avec repère hors champ)
    const m = G.mission; let tg = null; if (m) { const st = m.steps[m.stepI]; tg = st && st.tgt && st.tgt(); } else if (G.tut && G.tut.step >= 4) tg = G.tut.step === 4 ? { x: 0, z: 172 } : G.tut.step === 5 ? { x: -8, z: 137.2 } : { x: 8, z: 137.2 };
    if (tg && !(tg.area && Math.hypot(tg.x - P.x, tg.z - P.z) < tg.r)) {
      const d = Math.hypot(tg.x - P.x, tg.z - P.z); const ok = R.project(tg.x, 1.6, tg.z, pr);
      let x = ok ? pr.x : Wd / 2, y = ok ? pr.y : Hd / 2; const off = !ok || x < 40 || x > Wd - 40 || y < 70 || y > Hd - 40;
      if (off) { const rel = angDiff(G.cam.yaw, Math.atan2(tg.x - P.x, tg.z - P.z)); const ex = Wd / 2 - Math.sin(rel) * Wd * 0.42, ey = Hd / 2 - Math.cos(rel) * Hd * 0.38; x = clamp(ex, 40, Wd - 40); y = clamp(ey, 80, Hd - 50); }
      c.save(); c.translate(x, y); c.rotate(PI / 4); c.fillStyle = '#F5C66E'; c.fillRect(-7, -7, 14, 14); c.restore();
      c.fillStyle = '#F5C66E'; c.fillText(`${Math.round(d)} m`, x, y + 22);
    }
  },
  crosshair(c, Wd, Hd) {
    const P = G.P; if (!P.alive) return; const w = WEAPONS[P.w], cx = Wd / 2, cy = Hd / 2;
    // l'ennemi est-il sous le réticule ?
    const [ox, oy, oz] = G.camPos, [dx, dy, dz] = G.camDir; let over = false;
    for (const e of G.actors) { if (!e.alive || e.faction === 'squad') continue; const t = rayActor(e, ox, oy, oz, dx, dy, dz, w.range); if (t > 0) { over = true; break; } }
    G.assistSlow = over;
    const col = over ? '#FF805B' : 'rgba(240,237,227,.92)';
    if (P.aim && w.id === 'aiguille' && G.cam.k > 0.8) {
      const r = Math.min(Wd, Hd) * 0.42; c.fillStyle = 'rgba(4,8,14,.78)'; c.beginPath(); c.rect(0, 0, Wd, Hd); c.arc(cx, cy, r, 0, TAU, true); c.fill();
      c.strokeStyle = 'rgba(57,214,204,.6)'; c.lineWidth = 1.5; c.beginPath(); c.arc(cx, cy, r, 0, TAU); c.stroke();
      c.strokeStyle = col; c.lineWidth = 1; c.beginPath(); c.moveTo(cx - r, cy); c.lineTo(cx - 8, cy); c.moveTo(cx + 8, cy); c.lineTo(cx + r, cy); c.moveTo(cx, cy + 8); c.lineTo(cx, cy + r); c.stroke();
      c.fillStyle = col; c.fillRect(cx - 1.5, cy - 1.5, 3, 3);
    } else {
      const g = 6 + (P.aim ? w.ads : w.hip) * 4 * (P.mv > 2 ? 1.35 : 1);
      c.strokeStyle = col; c.lineWidth = 2; c.lineCap = 'round';
      if (w.id === 'brisant') { c.beginPath(); c.arc(cx, cy, g + 4, 0, TAU); c.stroke(); }
      else { c.beginPath(); c.moveTo(cx - g - 7, cy); c.lineTo(cx - g, cy); c.moveTo(cx + g, cy); c.lineTo(cx + g + 7, cy); c.moveTo(cx, cy - g - 7); c.lineTo(cx, cy - g); c.moveTo(cx, cy + g); c.lineTo(cx, cy + g + 7); c.stroke(); }
      c.fillStyle = col; c.fillRect(cx - 1.5, cy - 1.5, 3, 3);
    }
    if (G.t - this.hitT < 0.16) { const k = G.t - this.killT < 0.25, r = k ? 13 : 10; c.strokeStyle = this.blockT && G.t - this.blockT < 0.2 ? '#9778DB' : k ? '#FF805B' : '#fff'; c.lineWidth = 2.4; c.beginPath(); c.moveTo(cx - r, cy - r); c.lineTo(cx - 4, cy - 4); c.moveTo(cx + r, cy - r); c.lineTo(cx + 4, cy - 4); c.moveTo(cx - r, cy + r); c.lineTo(cx - 4, cy + 4); c.moveTo(cx + r, cy + r); c.lineTo(cx + 4, cy + 4); c.stroke(); }
    // indicateurs de dégâts
    this.dmgArcs = this.dmgArcs.filter(a => G.t - a.t < 1.2);
    for (const a of this.dmgArcs) { const rel = angDiff(G.cam.yaw, a.ang), f = 1 - (G.t - a.t) / 1.2; c.strokeStyle = `rgba(255,90,60,${0.85 * f})`; c.lineWidth = 6; c.beginPath(); const base = -PI / 2 - rel; c.arc(cx, cy, Math.min(Wd, Hd) * 0.2, base - 0.35, base + 0.35); c.stroke(); }
    if (P.reload > 0) { c.strokeStyle = 'rgba(245,198,110,.9)'; c.lineWidth = 3; c.beginPath(); c.arc(cx, cy, 22, -PI / 2, -PI / 2 + TAU * (1 - P.reload / w.reload)); c.stroke(); }
  },
  compass() {
    const c = this.cc, Wc = 420, Hc = 30, h = (PI - G.cam.yaw), P = G.P; c.clearRect(0, 0, Wc, Hc);
    const sc = Wc / (PI * 0.9); c.font = '600 11px Chakra Petch, Inter, sans-serif'; c.textAlign = 'center';
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
    for (let i = 0; i < 24; i++) { const a = i / 24 * TAU, rel = angDiff(h, a), x = Wc / 2 + rel * sc; if (x < 0 || x > Wc) continue;
      if (i % 3 === 0) { c.fillStyle = i === 0 ? '#F5C66E' : 'rgba(240,237,227,.9)'; c.fillText(dirs[i / 3], x, 19); } else { c.fillStyle = 'rgba(240,237,227,.35)'; c.fillRect(x - 0.5, 20, 1, 6); } }
    const mark = (x, z, col, ch) => { const ty = Math.atan2(x - P.x, z - P.z), rel = angDiff(G.cam.yaw, ty), sx = Wc / 2 - rel * sc; if (sx < 6 || sx > Wc - 6) return; c.fillStyle = col; c.fillText(ch, sx, 10); };
    mark(0, 150, '#39D6CC', '⌂'); mark(0, -140, G.cent.active ? '#39D6CC' : '#FF805B', '✦');
    const m = G.mission; if (m) { const st = m.steps[m.stepI], tg = st && st.tgt && st.tgt(); if (tg) mark(tg.x, tg.z, '#F5C66E', '◆'); }
    if (G.ping) mark(G.ping.x, G.ping.z, G.ping.kind === 'enemy' ? '#FF805B' : '#39D6CC', '⌖');
    c.fillStyle = '#F5C66E'; c.fillRect(Wc / 2 - 1, 0, 2, 5);
  },
  buildMapBG() {
    const S = 2, N = MAP * 2 / S, cv = document.createElement('canvas'); cv.width = N; cv.height = N; const x2 = cv.getContext('2d'), img = x2.createImageData(N, N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const x = -MAP + i * S, z = -MAP + j * S, col = groundColor(x, z), o = (j * N + i) * 4; img.data[o] = col[0] * 200; img.data[o + 1] = col[1] * 200; img.data[o + 2] = col[2] * 210; img.data[o + 3] = 255; }
    x2.putImageData(img, 0, 0);
    for (const o of W.all) { if (o.y1 < 0.6) continue; const tall = o.y1 > 8; x2.fillStyle = tall ? 'rgba(40,44,56,.92)' : 'rgba(30,40,52,.7)'; if (o.t === 1) { x2.beginPath(); x2.arc((o.x + MAP) / S, (o.z + MAP) / S, Math.max(0.6, o.r / S), 0, TAU); x2.fill(); } else x2.fillRect((o.x0 + MAP) / S, (o.z0 + MAP) / S, Math.max(0.6, (o.x1 - o.x0) / S), Math.max(0.6, (o.z1 - o.z0) / S)); }
    this.bg = cv; this.bgS = S;
  },
  minimap() {
    const c = this.mc, Sz = 232, P = G.P, px = 1.45 * 2 / this.bgS * this.bgS, R0 = Sz / 2; if (!this.bg) return;
    const ppm = Sz / 160; c.save(); c.clearRect(0, 0, Sz, Sz); c.beginPath(); c.arc(R0, R0, R0 - 1, 0, TAU); c.clip();
    c.fillStyle = '#0d1826'; c.fillRect(0, 0, Sz, Sz);
    const half = 80; c.drawImage(this.bg, (P.x - half + MAP) / this.bgS, (P.z - half + MAP) / this.bgS, 160 / this.bgS, 160 / this.bgS, 0, 0, Sz, Sz);
    const M = (x, z) => [R0 + (x - P.x) * ppm, R0 + (z - P.z) * ppm];
    c.strokeStyle = 'rgba(255,128,91,.55)'; c.lineWidth = 2; c.setLineDash([5, 4]); c.beginPath(); const [cx0, cz0] = M(CENT.x, CENT.z); c.arc(cx0, cz0, CENT.pvpR * ppm, 0, TAU); c.stroke(); c.setLineDash([]);
    for (const a of G.actors) { if (!a.alive) continue; const [x, y] = M(a.x, a.z); if (x < 0 || y < 0 || x > Sz || y > Sz) continue;
      if (a.faction === 'squad' && a.kind === 'bot') { c.fillStyle = '#39D6CC'; c.beginPath(); c.arc(x, y, 4, 0, TAU); c.fill(); }
      else if (a.faction !== 'squad' && (G.marks.has(a) || G.t - a.lastShot < 1.5)) { c.fillStyle = '#FF805B'; c.fillRect(x - 3, y - 3, 6, 6); } }
    for (const r of NET.remote) { const [x, y] = M(r.x, r.z); c.fillStyle = r.inSquad ? '#F5C66E' : '#F0EDE3'; c.beginPath(); c.arc(x, y, 3.5, 0, TAU); c.fill(); }
    const m = G.mission; if (m) { const st = m.steps[m.stepI], tg = st && st.tgt && st.tgt(); if (tg) { let [x, y] = M(tg.x, tg.z); const d = Math.hypot(x - R0, y - R0); if (tg.area) { c.strokeStyle = 'rgba(245,198,110,.8)'; c.beginPath(); c.arc(x, y, tg.r * ppm, 0, TAU); c.stroke(); } if (d > R0 - 10) { x = R0 + (x - R0) / d * (R0 - 10); y = R0 + (y - R0) / d * (R0 - 10); } c.save(); c.translate(x, y); c.rotate(PI / 4); c.fillStyle = '#F5C66E'; c.fillRect(-5, -5, 10, 10); c.restore(); } }
    if (G.ping) { const [x, y] = M(G.ping.x, G.ping.z); c.strokeStyle = '#39D6CC'; c.beginPath(); c.arc(x, y, 6, 0, TAU); c.stroke(); }
    c.save(); c.translate(R0, R0); c.rotate(-(G.cam.yaw - PI)); c.fillStyle = 'rgba(57,214,204,.16)'; c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, 50, -PI / 2 - 0.55, -PI / 2 + 0.55); c.fill(); c.restore();
    c.save(); c.translate(R0, R0); c.rotate(-(G.P.yaw - PI)); c.fillStyle = '#F0EDE3'; c.beginPath(); c.moveTo(0, -9); c.lineTo(6, 7); c.lineTo(0, 3); c.lineTo(-6, 7); c.fill(); c.restore();
    c.restore(); c.fillStyle = '#F5C66E'; c.font = '700 14px Chakra Petch, sans-serif'; c.textAlign = 'center'; c.fillText('N', R0, 16);
  },
  /* ---------- panneaux ---------- */
  TABS: [['map', 'Carte'], ['missions', 'Missions'], ['squad', 'Escouade'], ['inventory', 'Inventaire'], ['prof', 'Profession'], ['journal', 'Journal'], ['settings', 'Paramètres']],
  open(tab) {
    if (G.state !== 'play') return; this.tab = tab; G.paused = !NET.inst; I.fire = false; I.interact = false; I.mx = I.my = 0;
    this.el.panel.classList.remove('hide'); this.el.tabs.innerHTML = this.TABS.map(([k, n]) => `<button data-t="${k}" class="${k === tab ? 'sel' : ''}">${n}</button>`).join('') + '<button class="x" data-t="x">✕</button>';
    this.el.tabs.querySelectorAll('button').forEach(b => b.onclick = () => { AU.play('ui'); if (b.dataset.t === 'x') this.close(); else this.open(b.dataset.t); });
    this.renderTab(tab); AU.play('ui');
  },
  close() { this.el.panel.classList.add('hide'); G.paused = false; },
  near(st, r = 4) { const s = W.dyn.stations[st]; return Math.hypot(G.P.x - s.x, G.P.z - s.z) < r; },
  renderTab(tab) {
    const b = this.el.pbody, s = G.save, P = G.P; b.onclick = null;
    if (tab === 'map') {
      b.innerHTML = `<div class="mapwrap"><canvas id="mapC"></canvas><div class="legend"><h3 style="margin:0 0 6px">Secteur Éclipse</h3>
      <div class="note">${G.cent.active ? 'Centrale <b style="color:var(--cyan)">réactivée</b>' + (G.cent.by ? ' par ' + esc(G.cent.by) : '') + ` · réinitialisation dans ${Math.max(0, Math.round((G.cent.since + CENT_TTL - Date.now()) / 3600000))} h` : 'Centrale <b style="color:var(--orange)">hors service</b>'}</div>
      <div class="lg"><i style="background:#39D6CC"></i>Avant-Poste · zone sûre</div><div class="lg"><i style="background:#FF805B"></i>Zone contestée (PvP)</div><div class="lg"><i style="background:#F5C66E"></i>Objectif</div><div class="lg"><i style="background:#9778DB"></i>Laboratoire 07${s.labKnown || s.labSeen ? '' : ' (inconnu)'}</div>
      <div class="lg"><i style="background:#8ff0e8"></i>Relais réparés ${s.relays.length}/6</div><div class="lg"><i style="background:#c9a75a"></i>Points d’intérêt ${s.pois.length}/8</div><p class="note">Deux itinéraires mènent à la Centrale : le Sentier des Ruines à l’ouest, la Gorge Cyan à l’est.</p></div></div>`;
      requestAnimationFrame(() => this.drawMap($('mapC')));
    } else if (tab === 'missions') {
      const atT = this.near('missions');
      b.innerHTML = `${atT ? '' : '<p class="note" style="margin-top:0">Les missions s’acceptent auprès d’Ilya, au terminal de l’Avant-Poste.</p>'}<div class="grid2">${Object.values(MISSIONS).map(d => { const why = missionAvailable(d.id), cur = G.mission && G.mission.def.id === d.id;
        return `<div class="item${why && !cur ? ' lock' : ''}"><div class="k">${esc(d.type)} · ${esc(d.dur)}</div><h3>${esc(d.name)}</h3><p>${esc(d.desc)}</p>
        <span class="tag g">${d.reward.cr} cr · ${d.reward.xp} XP</span>${d.prof ? `<span class="tag c">Bonus ${PROFS[d.prof].name}</span>` : ''}<span class="tag">${esc(d.squad)}</span>${s.done[d.id] ? `<span class="tag">Terminée ×${s.done[d.id]}</span>` : ''}
        <div style="margin-top:8px">${cur ? '<button class="btn sm warn" data-ab="1">Abandonner</button>' : `<button class="btn sm pri" data-m="${d.id}" ${why || !atT ? 'disabled' : ''}>Accepter</button> <span class="note">${esc(why || (atT ? '' : 'Rends-toi au terminal'))}</span>`}</div></div>`; }).join('')}</div>`;
      b.onclick = e => { const t = e.target; if (t.dataset.m) { if (startMission(t.dataset.m)) this.close(); } if (t.dataset.ab) { abandonMission(); this.renderTab('missions'); } };
    } else if (tab === 'squad') {
      const atB = this.near('squad', 5), mem = squad().filter(a => a.kind === 'bot'), peers = NET.peers(), sp = NET.squadPeers(), total = 1 + mem.length + sp.length;
      b.innerHTML = `<div class="grid2"><div><h3 style="margin-top:0">Ton escouade · ${total}/4</h3>
        <div class="item"><b>${esc(s.name)}</b> · ${PROFS[s.prof].name} <span class="tag c">${NET.squadWith ? 'membre' : 'chef'}</span></div>
        ${mem.map(a => `<div class="item" style="margin-top:6px"><b>${esc(a.name)}</b> · ${PROFS[a.prof].name} <span class="tag">opérateur IA</span> <button class="btn sm" data-rm="${a.botIdx}" style="float:right">Retirer</button></div>`).join('')}
        ${sp.map(p => `<div class="item" style="margin-top:6px"><b>${esc(clean((p.presence || {}).cs) || 'Opérateur')}</b> <span class="tag g">joueur</span>${p.peer === NET.squadWith ? '<span class="tag c">chef</span>' : ''}${p.guest ? '<span class="tag">invité</span>' : ''}</div>`).join('')}
        ${NET.squadWith ? '<button class="btn sm warn" data-leave="1" style="margin-top:8px">Quitter l’escouade</button>' : ''}
        <p class="note">Objectifs partagés, réanimation, pings et états des membres à l’écran. Les opérateurs IA complètent l’escouade quand tes amis ne sont pas connectés.</p></div>
        <div><h3 style="margin-top:0">Opérateurs disponibles</h3>${atB ? '' : '<p class="note">Rends-toi au tableau des escouades de l’Avant-Poste pour recruter des opérateurs IA.</p>'}
        ${BOTS.map((bt, i) => mem.some(a => a.botIdx === i) ? '' : `<div class="item" style="margin-top:6px"><b>${esc(bt.name)}</b> · ${PROFS[bt.prof].name}<p>${esc(bt.line)}</p><button class="btn sm pri" data-inv="${i}" ${!atB || total >= 4 ? 'disabled' : ''}>Inviter</button></div>`).join('')}
        <h3>Joueurs de l’instance</h3>${!NET.inst ? '<p class="note">Présence temps réel indisponible dans cette vue. Partage le lien du prototype pour jouer à plusieurs.</p>' : peers.length ? peers.map(p => { const pr = p.presence || {}, bl = NET.isBlocked(p); return `<div class="item" style="margin-top:6px"><b>${esc(clean(pr.cs) || 'Opérateur')}</b>${p.guest ? ' <span class="tag">invité</span>' : ''} <span class="note">${pr.ms ? 'en mission' : 'libre'}</span><div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">${bl ? `<button class="btn sm" data-unb="${esc(p.peer)}">Débloquer</button>` : `<button class="btn sm pri" data-pinv="${esc(p.peer)}" ${total >= 4 ? 'disabled' : ''}>Inviter</button><button class="btn sm" data-rep="${esc(p.peer)}">Signaler</button><button class="btn sm warn" data-blk="${esc(p.peer)}">Bloquer</button>`}</div></div>`; }).join('') : '<p class="note">Aucun autre joueur dans ton instance pour l’instant.</p>'}</div></div>`;
      b.onclick = e => { const t = e.target, d = t.dataset;
        if (d.inv) { spawnBot(+d.inv); AU.play('ui'); const bt = BOTS[+d.inv]; setTimeout(() => this.feed(bt.name, 'Invitation acceptée. ' + bt.line), 500); this.renderTab('squad'); }
        if (d.rm) { const a = mem.find(x => x.botIdx === +d.rm); G.actors.splice(G.actors.indexOf(a), 1); squad().filter(x => x.kind === 'bot').forEach((x, i) => x.slot = i); this.renderTab('squad'); }
        if (d.pinv) NET.invite(d.pinv);
        if (d.leave) { NET.leaveSquad(); this.renderTab('squad'); }
        if (d.rep) this.reportDialog(peers.find(p => p.peer === d.rep));
        if (d.blk) { const p = peers.find(p => p.peer === d.blk); s.blocked.push(NET.blockedKey(p)); queueSave(); AUTH.push('blocage', `Joueur bloqué · ${clean((p.presence || {}).cs)}`); this.toast('Joueur bloqué : il n’apparaît plus pour toi', 'cyan'); this.renderTab('squad'); }
        if (d.unb) { const p = peers.find(p => p.peer === d.unb); s.blocked = s.blocked.filter(k => k !== NET.blockedKey(p)); queueSave(); this.renderTab('squad'); } };
    } else if (tab === 'inventory') {
      const atL = this.near('inventory', 4);
      b.innerHTML = `<div class="grid2"><div><h3 style="margin-top:0">Équipement</h3>${WEAPONS.map((w, i) => `<div class="item" style="margin-bottom:6px"><div class="k">Arme ${i + 1}</div><b>${esc(w.name)}</b> · ${esc(w.short)}<div class="kv"><span>Dégâts</span><span>${w.dmg}${w.pellets > 1 ? ' × ' + w.pellets : ''}</span></div><div class="kv"><span>Cadence</span><span>${w.rpm} cps/min</span></div><div class="kv"><span>Portée efficace</span><span>${w.fall0} m</span></div><div class="kv"><span>Chargeur</span><span>${w.mag}</span></div></div>`).join('')}</div>
      <div><h3 style="margin-top:0">Ressources</h3><div class="kv"><span>Crédits</span><span>${s.credits}</span></div><div class="kv"><span>Kits de soin</span><span>${s.med || 0} / 3</span></div><div class="kv"><span>Objet de mission</span><span>${P.carry ? (P.carry === 'noyau' ? 'Noyau Vrille' : 'Module énergétique') : '—'}</span></div>
      <h3>Tenue</h3><div class="sw">${OUTFITS.map((o, i) => `<button data-out="${i}" class="${s.outfit === i ? 'sel' : ''}"><i style="background:rgb(${o.body.map(v => v * 255 | 0)})"></i>${o.name}</button>`).join('')}</div>
      <h3>Armurerie ${atL ? '' : '<span class="note">· au casier de l’Avant-Poste</span>'}</h3>${SHOP.map(it => `<div class="item" style="margin-bottom:6px"><b>${esc(it.name)}</b> <span class="tag g">${it.price} cr</span><p>${esc(it.desc)}</p><button class="btn sm pri" data-buy="${it.id}" ${!atL || (it.once && s.owned.includes(it.id)) ? 'disabled' : ''}>${it.once && s.owned.includes(it.id) ? 'Possédé' : 'Acheter'}</button></div>`).join('')}
      <p class="note">Chaque transaction est validée par le serveur avant d’être appliquée (voir Journal).</p></div></div>`;
      b.onclick = e => { const d = e.target.dataset; if (d.out != null) { s.outfit = +d.out; P.outfit = s.outfit; queueSave(); this.renderTab('inventory'); } if (d.buy) { const ok = AUTH.purchase(SHOP.find(x => x.id === d.buy)); this.toast(ok ? 'Achat validé' : 'Achat refusé', ok ? 'cyan' : 'orange', 1800); this.renderTab('inventory'); } };
    } else if (tab === 'prof') {
      const atK = this.near('prof', 4), tier = v => v >= 400 ? 'Expert' : v >= 150 ? 'Confirmé' : 'Recrue';
      b.innerHTML = `<div class="grid2">${Object.entries(PROFS).map(([k, p]) => `<div class="item"><div class="k">${k === s.prof ? 'Profession actuelle' : 'Profession'}</div><h3>${p.icon} ${p.name}</h3><p>${esc(p.desc)}</p>${p.perks.map(x => `<div class="kv"><span>•</span><span style="text-align:right">${esc(x)}</span></div>`).join('')}
        <div style="margin-top:10px">${k === s.prof ? '<span class="tag c">Équipée</span>' : `<button class="btn sm pri" data-pf="${k}" ${atK ? '' : 'disabled'}>Changer</button> ${atK ? '' : '<span class="note">au terminal de profession</span>'}`}</div></div>`).join('')}</div>
        <h3>Réputation</h3><div class="grid2"><div class="item"><b>Exploration</b> · ${tier(s.rep.expl)}<div class="bar"><i style="width:${Math.min(100, s.rep.expl / 4)}%;background:var(--or)"></i></div><p>${s.rep.expl} pts · 150 : scan +15 m · 400 : rang Expert</p></div><div class="item"><b>Ingénierie</b> · ${tier(s.rep.ing)}<div class="bar"><i style="width:${Math.min(100, s.rep.ing / 4)}%;background:var(--cyan)"></i></div><p>${s.rep.ing} pts · 150 : réparation +25 % · 400 : rang Expert</p></div></div>`;
      b.onclick = e => { const d = e.target.dataset; if (d.pf) { s.prof = d.pf; P.prof = d.pf; P.abil = 0; queueSave(); AUTH.push('profil', `Profession → ${PROFS[d.pf].name}`); this.renderTab('prof'); } };
    } else if (tab === 'journal') {
      b.innerHTML = `<div class="grid2"><div><h3 style="margin-top:0">Progression</h3><div class="kv"><span>Rang</span><span>${s.lvl} · ${s.xp} XP</span></div><div class="kv"><span>Missions terminées</span><span>${Object.values(s.done).reduce((a, b) => a + b, 0)}</span></div><div class="kv"><span>Points d’intérêt</span><span>${s.pois.length}/8</span></div><div class="kv"><span>Relais réparés</span><span>${s.relays.length}/6</span></div><div class="kv"><span>Laboratoire 07</span><span>${s.lab.log ? 'journal lu' : s.lab.gardien ? 'Gardien neutralisé' : s.lab.solved ? 'porte ouverte' : (s.labSeen || s.labKnown) ? 'localisé' : 'inconnu'}</span></div>
        <div class="kv"><span>Sauvegarde</span><span>${NET.mode === 'cloud' && !NET.ro ? 'compte (base persistante)' : 'cet appareil'}</span></div>${s.lab.log ? `<h3>Journal 07</h3>${JOURNAL}` : ''}
        <h3>Messages récents</h3><div class="log">${G.feed.slice(0, 20).map(f => `<div><span class="k">${esc(f.from)}</span> · ${esc(f.text)}</div>`).join('') || '—'}</div></div>
        <div><h3 style="margin-top:0">Journal serveur</h3><p class="note">Dégâts, récompenses, achats et état du monde passent par une autorité séparée du client (simulée dans cette version web), qui valide puis journalise.</p><div class="log" style="max-height:340px">${AUTH.log.map(l => `<div><span class="k">${new Date(l.t).toLocaleTimeString('fr-FR')}</span> ${esc(l.kind)} · ${esc(l.msg)}</div>`).join('') || '—'}</div></div></div>`;
    } else if (tab === 'settings') {
      const st = s.settings, seg = (k, opts) => `<div class="seg">${opts.map(([v, n]) => `<button data-k="${k}" data-v="${v}" class="${String(st[k]) === String(v) ? 'sel' : ''}">${n}</button>`).join('')}</div>`, tog = k => `<button class="tog ${st[k] ? 'on' : ''}" data-tog="${k}"></button>`, rng = (k, a, z, step) => `<input type="range" min="${a}" max="${z}" step="${step}" value="${st[k]}" data-rng="${k}">`;
      b.innerHTML = `<div class="grid2"><div><h3 style="margin-top:0">Graphismes</h3><div class="set">Profil${seg('gfx', [['faible', 'Faible'], ['moyen', 'Moyen'], ['eleve', 'Élevé']])}</div><div class="set">Cadence cible${seg('fps', [[30, '30 i/s'], [60, '60 i/s']])}</div><div class="set">Afficher les i/s${tog('showFps')}</div>
        <h3>Commandes tactiles</h3><div class="set">Sensibilité caméra${rng('sens', 0.3, 2, 0.05)}</div><div class="set">Sensibilité en visée${rng('aimSens', 0.3, 1.5, 0.05)}</div><div class="set">Assistance à la visée${tog('assist')}</div><div class="set">Course automatique (joystick vers le haut)${tog('autorun')}</div><div class="set">Bouton de tir à gauche${tog('leftFire')}</div><div class="set">Taille des boutons${rng('btn', 0.85, 1.25, 0.05)}</div><div class="set">Vibrations${tog('vib')}</div><div class="set">Volume${rng('vol', 0, 1, 0.05)}</div></div>
        <div><h3 style="margin-top:0">Compte et données</h3><div class="kv"><span>Indicatif</span><span>${esc(s.name)}</span></div><div class="kv"><span>Stockage</span><span>${NET.mode === 'cloud' ? (NET.ro ? 'lecture seule · copie locale' : 'compte') : 'local'}</span></div><div class="kv"><span>Instance</span><span>${NET.inst ? esc(NET.instName) + ' · ' + NET.instCount + '/16' : '—'}</span></div><div class="kv"><span>Joueurs bloqués</span><span>${s.blocked.length}</span></div>
        <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm" data-act="save">Sauvegarder</button><button class="btn sm" data-act="rules">Règles communautaires</button><button class="btn sm warn" data-act="del">Supprimer mes données</button></div>
        <h3>Outils de test</h3><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm" data-act="cent" id="resetCent">Réinitialiser la Centrale</button></div><p class="note" id="testNote">Réservé au propriétaire du prototype.</p>
        <h3>Commandes clavier</h3><p class="note">ZQSD/WASD déplacer · Maj courir · souris ou glisser : caméra · F tirer · C viser · Espace sauter · R recharger · 1-3 armes · E interagir · Q capacité · T ping · G messages · H soin · M carte · Échap menu</p></div></div>`;
      (async () => { const own = NET.user ? await NET.user.isOwner() : true; const rb = $('resetCent'); if (rb) { rb.disabled = !own; $('testNote').textContent = own ? 'Remet la Centrale hors service pour tous (test du cycle de 24 h).' : 'Réservé au propriétaire du prototype.'; } })();
      b.onclick = e => { const d = e.target.dataset;
        if (d.k) { st[d.k] = d.k === 'fps' ? +d.v : d.v; applySettings(); queueSave(); this.renderTab('settings'); }
        if (d.tog) { st[d.tog] = !st[d.tog]; applySettings(); queueSave(); this.renderTab('settings'); }
        if (d.act === 'save') doSave('manual');
        if (d.act === 'rules') this.dialog('Règles communautaires', RULES);
        if (d.act === 'del') this.dialog('Supprimer mes données', '<p class="note" style="color:var(--ivoire);font-size:13px">Ta progression (indicatif, crédits, réputation, découvertes) sera effacée de ton compte et de cet appareil. Cette action est définitive.</p><div style="display:flex;gap:8px;margin-top:12px"><button class="btn warn" id="dDel">Supprimer définitivement</button><button class="btn" id="dCan">Annuler</button></div>', () => { $('dDel').onclick = async () => { await NET.deleteProfile(); location.reload(); }; $('dCan').onclick = () => this.closeDialog(); });
        if (d.act === 'cent') { const st2 = { state: 'off', since: Date.now(), callsign: '', cycle: G.cent.cycle || 0 }; applyCentrale(st2, true); NET.setCentrale(st2); AUTH.push('monde', 'Réinitialisation manuelle · Centrale Éclipse → Hors service'); this.renderTab('settings'); } };
      b.oninput = e => { const k = e.target.dataset.rng; if (k) { st[k] = +e.target.value; applySettings(); queueSave(); } };
    }
  },
  drawMap(cv) {
    if (!cv) return; const r = cv.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2); cv.width = r.width * d; cv.height = r.height * d; const c = cv.getContext('2d'); c.scale(d, d);
    const S = Math.min(r.width, r.height), ox = (r.width - S) / 2, oy = (r.height - S) / 2, k = S / (MAP * 2), M = (x, z) => [ox + (x + MAP) * k, oy + (z + MAP) * k], s = G.save;
    c.fillStyle = '#0d1826'; c.fillRect(0, 0, r.width, r.height); c.drawImage(this.bg, ox, oy, S, S);
    c.font = '600 12px Inter, sans-serif'; c.textAlign = 'center';
    const lbl = (x, z, t, col) => { const [a, b] = M(x, z); c.fillStyle = 'rgba(10,18,30,.6)'; const w = c.measureText(t).width + 10; c.fillRect(a - w / 2, b - 9, w, 17); c.fillStyle = col; c.fillText(t, a, b + 4); };
    let [a, b] = M(CENT.x, CENT.z); c.strokeStyle = 'rgba(255,128,91,.7)'; c.setLineDash([6, 5]); c.lineWidth = 2; c.beginPath(); c.arc(a, b, CENT.pvpR * k, 0, TAU); c.stroke(); c.setLineDash([]);
    lbl(0, 150, "L'Avant-Poste", '#39D6CC'); lbl(0, -140, 'Centrale Éclipse', G.cent.active ? '#39D6CC' : '#FF805B'); lbl(-95, 10, 'Sentier des Ruines', '#F0EDE3'); lbl(72, 10, 'Gorge Cyan', '#F0EDE3'); lbl(0, -20, "L'Échine", 'rgba(240,237,227,.6)');
    if (s.labKnown || s.labSeen) lbl(162, -10, 'Laboratoire 07', '#9778DB');
    lbl(-45, 100, 'Plateforme Vesper', '#F5C66E');
    for (const p of W.dyn.pois) if (s.pois.includes(p.id)) { const [x, y] = M(p.x, p.z); c.fillStyle = '#c9a75a'; c.fillRect(x - 3, y - 3, 6, 6); }
    for (const r2 of W.dyn.relays) { const [x, y] = M(r2.x, r2.z); c.fillStyle = s.relays.includes(r2.id) ? '#8ff0e8' : 'rgba(255,128,91,.8)'; c.beginPath(); c.arc(x, y, 3.5, 0, TAU); c.fill(); }
    const m = G.mission; if (m) { const st = m.steps[m.stepI], tg = st && st.tgt && st.tgt(); if (tg) { const [x, y] = M(tg.x, tg.z); if (tg.area) { c.strokeStyle = '#F5C66E'; c.beginPath(); c.arc(x, y, tg.r * k, 0, TAU); c.stroke(); } c.save(); c.translate(x, y); c.rotate(PI / 4); c.fillStyle = '#F5C66E'; c.fillRect(-6, -6, 12, 12); c.restore(); } }
    for (const a2 of squad()) { if (a2 === G.P || !a2.alive) continue; const [x, y] = M(a2.x, a2.z); c.fillStyle = '#39D6CC'; c.beginPath(); c.arc(x, y, 4, 0, TAU); c.fill(); }
    for (const r2 of NET.remote) { const [x, y] = M(r2.x, r2.z); c.fillStyle = r2.inSquad ? '#F5C66E' : '#F0EDE3'; c.beginPath(); c.arc(x, y, 3.5, 0, TAU); c.fill(); }
    [a, b] = M(G.P.x, G.P.z); c.save(); c.translate(a, b); c.rotate(-(G.P.yaw - PI)); c.fillStyle = '#fff'; c.beginPath(); c.moveTo(0, -9); c.lineTo(6, 7); c.lineTo(0, 3); c.lineTo(-6, 7); c.fill(); c.restore();
  },
  dialog(title, html, after) { this.el.dlgBox.innerHTML = `<h3 style="margin-top:0">${esc(title)}</h3>${html}${html.includes('btn') ? '' : '<button class="btn" id="dOk" style="margin-top:12px">Fermer</button>'}`; this.el.dialog.classList.remove('hide'); G.paused = !NET.inst; I.fire = false; I.interact = false; const ok = $('dOk'); if (ok) ok.onclick = () => this.closeDialog(); if (after) after(); },
  closeDialog() { this.el.dialog.classList.add('hide'); if (this.el.panel.classList.contains('hide')) G.paused = false; },
  reportDialog(p) {
    if (!p) return; const name = clean((p.presence || {}).cs) || 'Opérateur', reasons = ['Comportement abusif', 'Triche présumée', 'Pseudo inapproprié', 'Anti-jeu', 'Autre'];
    this.dialog(`Signaler ${name}`, `<p class="note">Le signalement est enregistré avec l’instance et l’heure. Il est lisible par l’équipe du prototype.</p><div style="display:grid;gap:6px;margin-top:8px">${reasons.map(r => `<button class="btn sm" data-r="${esc(r)}">${esc(r)}</button>`).join('')}</div><button class="btn" id="dCan" style="margin-top:10px">Annuler</button>`, () => {
      this.el.dlgBox.querySelectorAll('[data-r]').forEach(b => b.onclick = async () => { const res = await NET.report(name, b.dataset.r); this.closeDialog(); this.toast(res === 'ok' ? 'Signalement envoyé' : 'Signalement enregistré sur cet appareil', 'cyan'); });
      $('dCan').onclick = () => this.closeDialog(); });
  },
  showReward(d) {
    const s = G.save, rep = d.r.rep ? Object.entries(d.r.rep).map(([k, v]) => `<div><b>+${v}</b>${k === 'expl' ? 'Exploration' : 'Ingénierie'}</div>`).join('') : '';
    this.el.rwBox.innerHTML = `<div class="logo-sub">Mission accomplie</div><h2>${esc(d.def.name)}</h2><div class="note">${esc(d.def.type)} · ${fmtT(d.time)} · ${d.kills} neutralisation${d.kills > 1 ? 's' : ''} · ${d.downs} mise${d.downs > 1 ? 's' : ''} à terre</div>
      <div class="rw"><div><b>+${d.r.cr}</b>crédits</div><div><b>+${d.r.xp}</b>XP</div>${rep}</div>
      ${d.sec ? `<p class="note">${esc(d.sec.text)} · ${d.sec.ok ? '<b style="color:var(--cyan)">réussi (+80 cr)</b>' : 'non rempli'}</p>` : ''}
      ${d.def.id === 'C' ? '<p style="color:var(--cyan);font-weight:600">La Centrale Éclipse est réactivée pour toutes les instances. Nouvelle mission disponible : « Signal 07 ».</p>' : ''}
      ${d.def.id === 'D' ? '<p style="color:var(--violet);font-weight:600">Le Laboratoire 07 a livré son secret. Le journal est consultable dans ton Journal.</p>' : ''}
      <p class="note">Progression sauvegardée · Rang ${s.lvl} · ${s.credits} crédits</p><button class="btn pri" id="rwOk">Continuer</button>`;
    this.el.reward.classList.remove('hide'); G.paused = !NET.inst; $('rwOk').onclick = () => { this.el.reward.classList.add('hide'); G.paused = false; AU.play('ui'); };
  },
};
function trimBots() { while (1 + squad().filter(a => a.kind === 'bot').length + NET.squadPeers().length > 4) { const b = squad().filter(a => a.kind === 'bot').pop(); if (!b) break; G.actors.splice(G.actors.indexOf(b), 1); } }
function applySettings() {
  const st = G.save.settings; G.q = GFX[st.gfx] || GFX.moyen; document.documentElement.style.setProperty('--bs', st.btn); AU.vol(st.vol); R.resize(G.q.scale);
}
const JOURNAL = `<div class="log" style="font-size:12px;line-height:1.6;max-height:none">J+212 · La Centrale n’a jamais produit d’énergie. Elle écoute. Les flux cyan sont une fréquence, pas un courant.<br>J+219 · La végétation de la Ceinture pousse le long des conduites. Elle répond au signal.<br>J+230 · Nous avons construit le Gardien pour garder la porte fermée. Pas pour empêcher d’entrer : pour empêcher de sortir.<br>J+231 · Si vous lisez ceci, la Centrale est réactivée. Elle vous a entendus.</div>`;
const RULES = `<div class="note" style="font-size:12.5px;line-height:1.6;color:var(--ivoire)">1. Respecte les autres joueurs : pas d’insulte, de harcèlement ni de discrimination.<br>2. Pas de triche, d’exploitation de bug ni de logiciel tiers.<br>3. Pas de pseudo offensant ou trompeur.<br>4. Le PvP n’existe que dans la zone contestée de la Centrale.<br>5. Signale un comportement problématique depuis l’écran d’escouade ; tu peux aussi bloquer un joueur.<br>6. La communication se fait par pings, emotes et messages prédéfinis. Le chat libre ouvrira après la mise en place de la modération.</div>`;

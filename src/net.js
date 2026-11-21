'use strict';
/* FRACTURE — persistance (db), identité (user), présence temps réel (room). Repli local si indisponible. */
const LS_SAVE = 'fracture.save.v1', LS_WORLD = 'fracture.world.v1';
const lsGet = k => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
const lsDel = k => { try { localStorage.removeItem(k); } catch (e) { } };
const clean = (s, n = 14) => String(s || '').replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, '').slice(0, n);
const withTimeout = (p, ms) => Promise.race([p, new Promise(r => setTimeout(() => r(null), ms))]);

const NET = {
  db: null, user: null, room: null, inst: null, uid: null, mode: 'local', ro: false, myPeer: null, instName: '', instCount: 1,
  remote: [], peerPings: [], seenMsg: new Map(), invites: [], squadWith: null, lastSend: 0, worldUnsub: null, worldReady: false,
  async init(onStep) {
    const has = typeof window.claude === 'object' && window.claude && typeof window.claude.use === 'function';
    if (!has) { onStep && onStep('Mode local (hors claude.ai)'); this.loadLocalWorld(); return; }
    onStep && onStep('Connexion au service d’identité…');
    const [db, user, room] = await withTimeout(Promise.all([claude.use('db'), claude.use('user'), claude.use('room')]), 11000) || [null, null, null];
    this.db = db; this.user = user; this.room = room;
    try { this.uid = user ? await user.id() : null; } catch (e) { this.uid = null; }
    if (db) {
      this.mode = 'cloud'; onStep && onStep('Synchronisation de l’état du monde…');
      await new Promise(res => {
        const timer = setTimeout(() => { this.loadLocalWorld(); res(); }, 9000);
        try {
          this.worldUnsub = db.doc('world/centrale').onSnapshot(snap => {
            const d = snap.exists ? snap.data() : { state: 'off', since: 0 };
            if (!this.worldReady) { this.worldReady = true; clearTimeout(timer); applyCentrale(d, false); res(); }
            else applyCentrale(d, true);
            lsSet(LS_WORLD, d);
          }, () => { clearTimeout(timer); this.loadLocalWorld(); res(); });
        } catch (e) { clearTimeout(timer); this.loadLocalWorld(); res(); }
      });
    } else this.loadLocalWorld();
    if (room) this.joinInstance();
  },
  loadLocalWorld() { const d = lsGet(LS_WORLD) || { state: 'off', since: 0 }; applyCentrale(d, false); },
  async loadProfile() {
    if (this.db && this.uid) {
      try { const s = await withTimeout(this.db.doc(`data/users/${this.uid}/save`).get(), 8000); if (s && s.exists) { const d = s.data(); if (d && d.save) return JSON.parse(d.save); } } catch (e) { }
    }
    return lsGet(LS_SAVE);
  },
  _saving: false, _pend: null,
  async saveProfile(save) {
    lsSet(LS_SAVE, save);
    if (!(this.db && this.uid) || this.ro) return true;
    if (this._saving) { this._pend = save; return true; }
    this._saving = true;
    try { await this.db.doc(`data/users/${this.uid}/save`).set({ save: JSON.stringify(save), at: Date.now() }); }
    catch (e) { if (e && e.code === 'invalid_argument') this.ro = true; this._saving = false; return false; }
    this._saving = false; if (this._pend) { const p = this._pend; this._pend = null; return this.saveProfile(p); }
    return true;
  },
  async deleteProfile() {
    lsDel(LS_SAVE);
    if (this.db && this.uid) { try { await this.db.doc(`data/users/${this.uid}/save`).delete(); } catch (e) { return false; } }
    return true;
  },
  async setCentrale(st) {
    lsSet(LS_WORLD, st);
    if (!this.db) return;
    try { await this.db.doc('world/centrale').set(st); } catch (e) { if (e && e.code === 'invalid_argument') { this.worldRO = true; G.ev('toast', { t: 'Ton accès ne permet pas d’écrire l’état partagé : changement local seulement', c: 'orange' }); } }
  },
  async report(target, reason) {
    const item = { target: clean(target, 40), reason: clean(reason, 60), t: Date.now(), inst: this.instName };
    AUTH.push('signalement', `Signalement · ${item.target} · ${item.reason}`);
    if (!(this.db && this.uid)) return 'local';
    try { const ref = this.db.doc(`reports/${this.uid}`); const s = await ref.get(); const items = (s.exists && Array.isArray(s.data().items)) ? s.data().items.slice(-29) : []; items.push(item); await ref.set({ items }); return 'ok'; }
    catch (e) { return 'err'; }
  },
  /* ---- présence temps réel : instance de 16 joueurs ---- */
  async joinInstance() {
    const room = this.room; let lobby = [];
    try {
      room.onPeers(ch => { lobby = ch.peers; const me = ch.peers.find(p => p.sameTab); if (me) this.myPeer = me.peer; });
      await new Promise(r => setTimeout(r, 1800));
      const counts = {}; for (const p of lobby) { const n = p.presence && p.presence.inst; if (n) counts[n] = (counts[n] || 0) + 1; }
      let n = 1; while ((counts[n] || 0) >= 16) n++;
      await room.presence({ inst: n });
      this.inst = await room.join('eclipse-' + n); this.instName = 'eclipse-' + n;
      this.inst.onPeers(ch => { this.instPeers = ch.peers; const me = ch.peers.find(p => p.sameTab); if (me) this.myPeer = me.peer; this.instCount = ch.peers.length; }, () => { this.inst = null; });
      G.ev('instance', { name: this.instName });
    } catch (e) { this.inst = null; }
  },
  peers() { return (this.inst && this.instPeers) ? this.instPeers.filter(p => !p.sameTab && p.kind === 'viewer') : []; },
  blockedKey(p) { return p.by || ('peer:' + p.peer); },
  isBlocked(p) { return G.save && G.save.blocked.includes(this.blockedKey(p)); },
  squadPeers() {
    if (!this.inst || !this.myPeer) return [];
    const ps = this.peers().filter(p => !this.isBlocked(p));
    const leader = this.squadWith || this.myPeer;
    return ps.filter(p => p.peer === leader || (p.presence && p.presence.sq === leader)).slice(0, 3);
  },
  invite(peer) { this.myInv = { to: peer, t: Date.now() }; this.push(true); G.ev('toast', { t: 'Invitation envoyée', c: 'cyan' }); },
  accept(peer) { this.squadWith = peer; this.myAcc = { to: peer, t: Date.now() }; this.push(true); G.ev('toast', { t: 'Tu as rejoint l’escouade', c: 'cyan' }); },
  leaveSquad() { this.squadWith = null; this.push(true); },
  sendMsg(k) { this.myMsg = { k, t: Date.now() }; this.push(true); },
  sendPing(p) { this.myPing = p ? { x: Math.round(p.x), z: Math.round(p.z), k: p.kind, t: Date.now() } : null; this.push(true); },
  sendEmote(k) { this.myEm = { k, t: Date.now() }; this.push(true); },
  push(force) {
    if (!this.inst || !G.P) return; const now = performance.now(); if (!force && now - this.lastSend < 120) return; this.lastSend = now;
    const P = G.P, m = G.mission, st = m && m.steps[m.stepI];
    const pres = { cs: clean(G.save.name), o: G.save.outfit | 0, pr: G.save.prof === 'ingenieur' ? 'i' : 'e', x: Math.round(P.x * 10) / 10, y: Math.round(P.y * 10) / 10, z: Math.round(P.z * 10) / 10, yw: Math.round(P.yaw * 100) / 100,
      mv: Math.round(P.mv * 10) / 10, st: P.alive ? (P.downed ? 'd' : 'a') : 'x', sq: this.squadWith, ms: m ? m.def.id : null, ob: st ? clean(typeof st.text === 'function' ? st.text() : st.text, 60) : null,
      ping: this.myPing || null, msg: this.myMsg || null, em: this.myEm || null, inv: this.myInv || null, acc: this.myAcc || null };
    this.inst.presence(pres).catch(() => { });
  },
  tick(dt) {
    if (!this.inst) { this.remote = []; this.peerPings = []; return; }
    this.push(false);
    const now = Date.now(), out = [], pings = [];
    for (const p of this.peers()) {
      if (this.isBlocked(p)) continue; const s = p.presence || {}; if (typeof s.x !== 'number') continue;
      let r = this._cache && this._cache.get(p.peer); if (!r) { r = { peer: p.peer, x: s.x, y: s.y || 0, z: s.z, yaw: s.yw || 0, walk: 0 }; }
      r.tx = s.x; r.tz = s.z; r.ty = s.y || 0; r.tyaw = s.yw || 0; r.mv = s.mv || 0; r.outfit = (s.o | 0) % 3; r.name = clean(s.cs) || 'Opérateur'; r.prof = s.pr === 'i' ? 'ingenieur' : 'eclaireur';
      r.downed = s.st === 'd'; r.alive = s.st !== 'x'; r.by = p.by; r.guest = p.guest; r.sq = s.sq; r.ob = s.ob; r.ms = s.ms;
      r.x = lerp(r.x, r.tx, Math.min(1, dt * 10)); r.z = lerp(r.z, r.tz, Math.min(1, dt * 10)); r.y = lerp(r.y, r.ty, Math.min(1, dt * 10)); r.yaw += angDiff(r.yaw, r.tyaw) * Math.min(1, dt * 10);
      r.inSquad = this.squadPeers().some(q => q.peer === p.peer);
      if (s.ping && now - s.ping.t < 15000) pings.push({ x: s.ping.x, z: s.ping.z, from: r.name });
      if (s.msg && s.msg.t > (this.seenMsg.get(p.peer + 'm') || 0)) { this.seenMsg.set(p.peer + 'm', s.msg.t); if (now - s.msg.t < 20000 && MSGS[s.msg.k]) G.ev('chat', { from: r.name, text: MSGS[s.msg.k] }); }
      if (s.em && s.em.t > (this.seenMsg.get(p.peer + 'e') || 0)) { this.seenMsg.set(p.peer + 'e', s.em.t); r.emote = EMOTES[s.em.k]; r.emoteT = G.t + 2.2; }
      if (s.inv && s.inv.to === this.myPeer && s.inv.t > (this.seenMsg.get(p.peer + 'i') || 0)) { this.seenMsg.set(p.peer + 'i', s.inv.t); if (now - s.inv.t < 60000) G.ev('invite', { peer: p.peer, name: r.name }); }
      out.push(r);
    }
    this._cache = new Map(out.map(r => [r.peer, r])); this.remote = out.filter(r => r.alive); this.peerPings = pings;
  },
};

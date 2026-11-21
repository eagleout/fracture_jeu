'use strict';
/* FRACTURE — démarrage, écrans d'accueil, boucle principale. */
const T0 = performance.now();
const nextFrame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
async function boot() {
  const stepsEl = $('bootSteps'), bar = $('bootBar').firstChild, step = (t, p) => { stepsEl.textContent = t; bar.style.width = p + '%'; };
  try { R.init($('gl')); } catch (e) {
    console.error(e);
    step(e && e.code === 'nogl' ? 'WebGL est désactivé ou indisponible dans ce navigateur. Essaie Chrome ou Safari à jour, avec l’accélération matérielle activée.' : `Erreur de rendu au démarrage : ${String(e && e.message || e).slice(0, 160)}`, 100); return; }
  UI.init(); R.resize(0.75);
  step('Chargement du Secteur Éclipse…', 18); await nextFrame();
  buildWorld(); step('Préparation de la carte…', 52); await nextFrame();
  UI.buildMapBG(); step('Connexion…', 62); await nextFrame();
  await NET.init(t => step(t, 74));
  step('Chargement de la progression…', 88);
  let sv = null; try { sv = await NET.loadProfile(); } catch (e) { sv = null; }
  if (sv && sv.v !== 1) sv = null;
  G.loaded = sv; step('Prêt', 100);
  G.bootMs = performance.now() - T0;
  setTimeout(showTitle, 250);
  requestAnimationFrame(loop);
}
function previewActor(outfit) { G.preview = mkActor({ kind: 'bot', x: 2, z: 106, y: 0, yaw: 0.35, outfit, name: '', prof: 'eclaireur' }); G.P = G.preview; G.actors = [G.preview]; }
function showTitle() {
  $('boot').classList.add('hide'); $('title').classList.remove('hide'); G.state = 'title';
  const sv = G.loaded; previewActor(sv ? sv.outfit : 0);
  const cont = $('btnContinue');
  if (sv) { cont.textContent = `Continuer · ${clean(sv.name)} (rang ${sv.lvl})`; cont.classList.remove('hide'); } else cont.classList.add('hide');
  $('titleNote').innerHTML = `${NET.mode === 'cloud' ? 'Progression liée à ton compte · état du monde partagé entre joueurs.' : 'Mode local : progression et état du monde enregistrés sur cet appareil.'}<br>Prototype web de démonstration : il valide la boucle de jeu, pas les performances natives Unity.`;
  cont.onclick = () => { AU.init(); startGame(Object.assign(newSave(sv.name, sv.outfit, sv.prof), sv, { settings: Object.assign(newSave('', 0, 'e').settings, sv.settings || {}) })); };
  $('btnNew').onclick = () => { AU.init(); AU.play('ui'); showCreate(); };
  $('btnFull').onclick = () => { const d = document.documentElement; try { const p = (d.requestFullscreen || d.webkitRequestFullscreen).call(d); if (p && p.then) p.then(() => { try { screen.orientation.lock('landscape').catch(() => { }); } catch (e) { } }).catch(() => UI.toast('Plein écran refusé par le navigateur', 'orange')); } catch (e) { UI.toast('Plein écran indisponible ici', 'orange'); } };
}
function showCreate() {
  $('title').classList.add('hide'); $('create').classList.remove('hide'); G.state = 'create';
  let outfit = 0, prof = 'eclaireur';
  const nm = $('cName'); nm.value = G.loaded ? '' : ['Vesper', 'Orion', 'Lyra', 'Sable', 'Nox', 'Iris'][Math.floor(Math.random() * 6)] + '-' + (10 + Math.floor(Math.random() * 89));
  const ro = () => { $('cOutfit').innerHTML = OUTFITS.map((o, i) => `<button data-o="${i}" class="${i === outfit ? 'sel' : ''}"><i style="background:linear-gradient(90deg,rgb(${o.body.map(v => v * 255 | 0)}) 60%,rgb(${o.accent.map(v => v * 255 | 0)}) 60%)"></i>${o.name}</button>`).join('');
    $('cProf').innerHTML = Object.entries(PROFS).map(([k, p]) => `<button class="prof ${k === prof ? 'sel' : ''}" data-p="${k}"><b>${p.icon} ${p.name}</b><p>${esc(p.desc)}</p></button>`).join(''); G.preview.outfit = outfit; };
  ro();
  $('cOutfit').onclick = e => { const b = e.target.closest('[data-o]'); if (b) { outfit = +b.dataset.o; ro(); AU.play('ui'); } };
  $('cProf').onclick = e => { const b = e.target.closest('[data-p]'); if (b) { prof = b.dataset.p; ro(); AU.play('ui'); } };
  $('cGo').onclick = () => { const name = clean(nm.value.trim(), 14) || 'Opérateur'; startGame(newSave(name, outfit, prof)); };
}
function startGame(save) {
  G.save = save; if (!save.blocked) save.blocked = []; if (!save.owned) save.owned = [];
  $('title').classList.add('hide'); $('create').classList.add('hide');
  G.actors = []; G.preview = null; UID = 0; createPlayer(); initSpawns(); initWorldState(); applySettings();
  G.state = 'play'; G.paused = false; G.lastZone = '';
  $('hud').classList.remove('hide'); $('layer').classList.remove('hide');
  G.launchMs = performance.now() - T0;
  AUTH.push('session', `Session ouverte · ${save.name} · lancement ${(G.launchMs / 1000).toFixed(1)} s · ${NET.mode === 'cloud' ? 'base persistante' : 'stockage local'}`);
  doSave(); AU.play('done');
  if (!save.tut) setTimeout(() => UI.toast('Bienvenue dans le Secteur Éclipse. Suis les consignes en haut à gauche.', 'or', 5000), 800);
}
let lastT = performance.now(), fpsAcc = 0, fpsN = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const target = G.save ? G.save.settings.fps : 30; let dt = (now - lastT) / 1000;
  if (target === 30 && dt < 1 / 30 - 0.005) return;
  lastT = now; dt = Math.min(dt, 0.05);
  fpsAcc += dt; fpsN++; if (fpsAcc > 0.5) { G.dbg.fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
  try {
    if (G.state === 'play') {
      if (!G.paused) tick(dt); NET.tick(dt);
      updateCamera(dt); renderScene(dt); UI.frame(dt);
      if (G.save.settings.showFps) { const c = UI.ctx; c.fillStyle = 'rgba(10,18,30,.7)'; c.fillRect(innerWidth / 2 - 40, innerHeight - 26, 80, 18); c.fillStyle = '#39D6CC'; c.font = '600 11px Inter,sans-serif'; c.textAlign = 'center'; c.fillText(`${G.dbg.fps} i/s · ${R.canvas.width}×${R.canvas.height}`, innerWidth / 2, innerHeight - 13); }
    } else if (G.preview) { G.t += dt; menuCamera(now / 1000); renderScene(dt); }
  } catch (e) { console.error(e); G.lastError = String(e && e.stack || e); }
}
document.addEventListener('visibilitychange', () => { if (document.hidden && G.state === 'play') doSave(); });
addEventListener('pagehide', () => { if (G.state === 'play') doSave(); });
window.FX = { G, W, I, NET, AUTH, startMission, MISSIONS, respawnPlayer, spawnEnemy, spawnBot, activateCentrale, applyCentrale, toggleValve, squad, interactables, UI };
boot();

import os, asyncio, pathlib, time
from playwright.async_api import async_playwright
URL = 'file://' + str(pathlib.Path(__file__).resolve().parent.parent / 'dist' / 'index.html')
OUT = pathlib.Path(__file__).resolve().parent / 'shots'; OUT.mkdir(exist_ok=True)
MOCK = r'''
(() => {
  const store = new Map(), subs = new Map();
  const snap = p => ({ exists: store.has(p), id: p.split('/').pop(), data: () => store.get(p), metadata: { fromCache: false, hasPendingWrites: false } });
  const fire = p => (subs.get(p) || []).forEach(f => f(snap(p)));
  const db = { doc: p => ({ path: p, get: async () => snap(p), set: async d => { store.set(p, JSON.parse(JSON.stringify(d))); fire(p); }, delete: async () => { store.delete(p); fire(p); },
    onSnapshot: (fn) => { if (!subs.has(p)) subs.set(p, []); subs.get(p).push(fn); setTimeout(() => fn(snap(p)), 30); return () => {}; } }) };
  window.__store = store;
  const me = { peer: 'me1', by: 'u_test', isMe: true, sameTab: true, kind: 'viewer', guest: false, presence: {}, updatedAt: 0 };
  const fake = { peer: 'pz9', by: 'u_nova', isMe: false, sameTab: false, kind: 'viewer', guest: true, presence: { inst: 1 }, updatedAt: 0 };
  window.__fake = fake;
  const mkRoom = (name) => { const r = { name, _fn: [], peers: () => [me, fake], onPeers(fn) { this._fn.push(fn); setTimeout(() => fn({ peers: [me, fake], joined: [me, fake], left: [], updated: [] }), 10); return () => {}; },
    presence: async p => { me.presence = Object.assign({}, me.presence, p); }, emit: async () => {}, on: () => () => {}, connected: () => true, onConnection: f => { setTimeout(() => f(true), 5); return () => {}; }, leave: async () => {},
    join: async n => { const nr = mkRoom(n); setInterval(() => { fake.presence = Object.assign({}, fake.presence, { cs: 'Nova', o: 1, pr: 'i', x: 4 + Math.sin(Date.now() / 900) * 3, y: 0, z: 150, yw: 3.1, mv: 2, st: 'a' }); nr._fn.forEach(f => f({ peers: [me, fake], joined: [], left: [], updated: [fake] })); }, 200); return nr; } }; return r; };
  const room = mkRoom('lobby');
  window.claude = { use: async n => n === 'db' ? db : n === 'user' ? { id: async () => 'u_test', isOwner: async () => true, canEdit: async () => true } : n === 'room' ? room : null };
})();
'''
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path=os.environ.get('CHROME_PATH') or None, args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        ctx = await b.new_context(viewport={'width': 844, 'height': 390}, device_scale_factor=2, is_mobile=True, has_touch=True)
        p = await ctx.new_page(); errs = []
        p.on('pageerror', lambda e: errs.append(str(e)))
        await ctx.add_init_script(MOCK)
        await p.goto(URL)
        for _ in range(80):
            if await p.evaluate("!document.getElementById('title').classList.contains('hide')"): break
            await asyncio.sleep(0.25)
        print('mode', await p.evaluate('FX.NET.mode'), 'note', await p.evaluate("document.getElementById('titleNote').textContent.slice(0,60)"))
        await p.click('#btnNew'); await asyncio.sleep(0.4); await p.click('#cGo'); await asyncio.sleep(2.5)
        print('inst', await p.evaluate('FX.NET.instName'), 'myPeer', await p.evaluate('FX.NET.myPeer'), 'remote', await p.evaluate('FX.NET.remote.length'))
        print('store keys', await p.evaluate('[...__store.keys()]'))
        await p.evaluate("FX.G.P.x=2; FX.G.P.z=158; FX.G.cam.yaw=3.14")
        await p.evaluate("__fake.presence = Object.assign({}, __fake.presence, {inv:{to:'me1', t: Date.now()}, msg:{k:3, t: Date.now()}})")
        await asyncio.sleep(1.2)
        print('invite dialog', await p.evaluate("!document.getElementById('dialog').classList.contains('hide')"))
        await p.screenshot(path=str(OUT / 'n1_invite.png'))
        if await p.evaluate("!!document.getElementById('dAcc')"): await p.click('#dAcc')
        await asyncio.sleep(0.5)
        print('squadWith', await p.evaluate('FX.NET.squadWith'), 'squadPeers', await p.evaluate('FX.NET.squadPeers().length'), 'my presence sq', await p.evaluate('true'))
        await p.evaluate("FX.UI.open('squad')"); await asyncio.sleep(0.4); await p.screenshot(path=str(OUT / 'n2_squad.png'))
        await p.evaluate('FX.UI.close()')
        await p.evaluate('FX.activateCentrale()'); await asyncio.sleep(0.4)
        print('world doc', await p.evaluate("JSON.stringify(__store.get('world/centrale'))"))
        await p.evaluate("doSave()"); await asyncio.sleep(0.4)
        print('save doc exists', await p.evaluate("__store.has('data/users/u_test/save')"))
        await asyncio.sleep(1); await p.screenshot(path=str(OUT / 'n3_peer.png'))
        print('errors', errs[:5], await p.evaluate('FX.G.lastError||null'))
        await b.close()
asyncio.run(main())

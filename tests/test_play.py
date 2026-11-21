import os, asyncio, json, sys, time, pathlib
from playwright.async_api import async_playwright

URL = 'file://' + str(pathlib.Path(__file__).resolve().parent.parent / 'dist' / 'index.html')
OUT = pathlib.Path(__file__).resolve().parent / 'shots'; OUT.mkdir(exist_ok=True)
ERR = []

async def ev(p, js):
    return await p.evaluate(js)

async def wait(p, js, timeout=20, step=0.25):
    t0 = time.time()
    while time.time() - t0 < timeout:
        if await p.evaluate(js): return True
        await asyncio.sleep(step)
    return False

async def shot(p, name):
    await p.screenshot(path=str(OUT / f'{name}.png'))

async def hold_interact(p, secs, until=None):
    await ev(p, 'FX.I.interact = true')
    if until: await wait(p, until, 25, 0.2)
    else:
        t0 = await ev(p, 'FX.G.t')
        await wait(p, f'FX.G.t - {t0} > {secs}', 30, 0.1)
    await ev(p, 'FX.I.interact = false')

async def tp(p, x, z, yaw=None):
    await ev(p, f'(()=>{{const P=FX.G.P;P.x={x};P.z={z};P.y=0;P.vy=0; {"FX.G.cam.yaw="+str(yaw)+";" if yaw is not None else ""} }})()')
    await asyncio.sleep(0.4)

async def main(fresh=True):
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path=os.environ.get('CHROME_PATH') or None, args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'])
        ctx = await b.new_context(viewport={'width': 844, 'height': 390}, device_scale_factor=2, is_mobile=True, has_touch=True)
        p = await ctx.new_page()
        p.on('console', lambda m: ERR.append(m.text) if m.type == 'error' else None)
        p.on('pageerror', lambda e: ERR.append('PAGEERROR ' + str(e)))
        await p.goto(URL)
        ok = await wait(p, "!document.getElementById('title').classList.contains('hide')", 40)
        print('title shown', ok, 'boot ms', await ev(p, 'Math.round(FX.G.bootMs)'))
        await asyncio.sleep(1.0); await shot(p, '01_title')
        await p.click('#btnNew'); await asyncio.sleep(0.8); await shot(p, '02_create')
        await p.click('#cGo'); await asyncio.sleep(1.5)
        print('state', await ev(p, 'FX.G.state'), 'launch ms', await ev(p, 'Math.round(FX.G.launchMs)'))
        await shot(p, '03_spawn')
        # déplacement + franchissement de la poutre
        z0 = await ev(p, 'FX.G.P.z')
        await ev(p, 'FX.I.my = 1'); await wait(p, 'FX.G.P.z < 189', 20); await ev(p, 'FX.I.my = 0')
        z1 = await ev(p, 'FX.G.P.z'); print('moved north', round(z0 - z1, 2), 'tut step', await ev(p, 'FX.G.tut && FX.G.tut.step'))
        await ev(p, 'FX.G.cam.yaw += 1.4'); await asyncio.sleep(0.3); await ev(p, 'FX.G.cam.yaw -= 1.4')
        await ev(p, 'FX.I.my = 1'); await wait(p, 'FX.G.P.z < 182', 25); await ev(p, 'FX.I.my = 0')
        print('fps early', await ev(p, 'FX.G.dbg.fps'))
        print('after beam z', round(await ev(p, 'FX.G.P.z'), 2), 'y', await ev(p, 'FX.G.P.y'), 'tut', await ev(p, 'FX.G.tut && FX.G.tut.step'))
        await shot(p, '04_tutorial')
        # combat : viser le patrouilleur et tirer
        for i in range(30):
            alive = await ev(p, 'FX.G.tutBot && FX.G.tutBot.alive')
            if not alive: break
            await ev(p, '''(()=>{const P=FX.G.P,b=FX.G.tutBot;const c=FX.G.camPos;const dx=b.x-c[0],dz=b.z-c[2],dy=(b.y+1.15)-c[1];FX.G.cam.yaw=Math.atan2(dx,dz);FX.G.cam.pitch=-Math.atan2(dy,Math.hypot(dx,dz));FX.I.fire=true;})()''')
            await asyncio.sleep(0.35)
            if i == 3: await shot(p, '05_combat')
        await ev(p, 'FX.I.fire=false')
        print('tut bot alive', await ev(p, 'FX.G.tutBot.alive'), 'hp', await ev(p, 'FX.G.tutBot.hp'), 'player hp', await ev(p, 'Math.round(FX.G.P.hp)'), 'credits', await ev(p, 'FX.G.save.credits'))
        # Avant-Poste
        await tp(p, 0, 160, 3.14159); await asyncio.sleep(1)
        await tp(p, -8, 138.3, 3.14159)
        print('focus', await ev(p, 'FX.G.focus && FX.G.focus.label'))
        await hold_interact(p, 0.3); await asyncio.sleep(0.5)
        await shot(p, '06_missions_panel')
        print('panel open', await ev(p, "!document.getElementById('panel').classList.contains('hide')"))
        # accepter la mission A depuis le panneau
        await p.click('[data-m="A"]'); await asyncio.sleep(0.5)
        print('mission', await ev(p, 'FX.G.mission && FX.G.mission.def.id'), 'step', await ev(p, 'FX.G.mission.stepId'))
        # escouade : recruter 2 IA
        await tp(p, 8, 138.0, 3.14159)
        await ev(p, "FX.UI.open('squad')"); await asyncio.sleep(0.3)
        await p.click('[data-inv="0"]'); await asyncio.sleep(0.3); await p.click('[data-inv="1"]'); await asyncio.sleep(0.3)
        await shot(p, '07_squad'); await ev(p, 'FX.UI.close()')
        print('squad size', await ev(p, 'FX.squad().length'))
        # Mission A
        zx, zz = await ev(p, '[FX.G.mission.zone.x, FX.G.mission.zone.z]')
        await tp(p, zx, zz + 5); await asyncio.sleep(0.6)
        print('A step', await ev(p, 'FX.G.mission.stepId'))
        await ev(p, 'FX.G.mission.beacon.seen=true'); await asyncio.sleep(0.4)
        bx, bz = await ev(p, '[FX.G.mission.beacon.x, FX.G.mission.beacon.z]')
        await tp(p, bx + 1.2, bz + 0.5); await asyncio.sleep(0.3)
        print('A step', await ev(p, 'FX.G.mission.stepId'), 'focus', await ev(p, 'FX.G.focus && FX.G.focus.label'))
        await hold_interact(p, 4.5, 'FX.G.mission.stepId!=="dl"'); await asyncio.sleep(0.5)
        print('A step after dl', await ev(p, 'FX.G.mission.stepId'))
        await shot(p, '08_missionA_field')
        await tp(p, -8, 138.3, 3.14159)
        await hold_interact(p, 1.4, 'FX.G.mission===null'); await asyncio.sleep(0.8)
        print('A done?', await ev(p, 'FX.G.mission'), 'reward shown', await ev(p, "!document.getElementById('reward').classList.contains('hide')"))
        print('ERR so far', ERR[:5], await ev(p, 'FX.G.lastError||null'))
        await shot(p, '09_reward')
        await p.click('#rwOk'); await asyncio.sleep(0.3)
        # Mission B
        await ev(p, "FX.startMission('B')"); await asyncio.sleep(0.3)
        cx, cz = await ev(p, '[FX.G.mission.site.x, FX.G.mission.site.z]')
        await tp(p, cx + 14, cz + 14); await asyncio.sleep(0.6)
        print('B step', await ev(p, 'FX.G.mission.stepId'), 'group', await ev(p, 'FX.G.mission.group.length'))
        await shot(p, '10_missionB_fight')
        await ev(p, 'FX.G.mission.group.forEach(a=>FX.AUTH.damage(FX.G.P,a,9999))'); await asyncio.sleep(0.6)
        print('B step', await ev(p, 'FX.G.mission.stepId'))
        ix, iz = await ev(p, "(()=>{const it=FX.G.items.find(i=>i.kind==='noyau');return [it.x,it.z]})()")
        await tp(p, ix + 1.0, iz + 1.0); await hold_interact(p, 1.2); await asyncio.sleep(0.4)
        print('B carry', await ev(p, 'FX.G.P.carry'), 'step', await ev(p, 'FX.G.mission.stepId'))
        await tp(p, -45, 100); await asyncio.sleep(0.8)
        print('B done', await ev(p, 'FX.G.mission === null'))
        await p.click('#rwOk'); await asyncio.sleep(0.3)
        # Mission C
        await ev(p, "FX.startMission('C')"); await tp(p, 21, 150.0, 3.14159)
        print('C focus', await ev(p, 'FX.G.focus && FX.G.focus.label'))
        await hold_interact(p, 1.3); await asyncio.sleep(0.3)
        print('C carry', await ev(p, 'FX.G.P.carry'), 'step', await ev(p, 'FX.G.mission.stepId'))
        await tp(p, 0, -129.9, 3.14159); await asyncio.sleep(0.3)
        print('C focus', await ev(p, 'FX.G.focus && FX.G.focus.label'))
        await hold_interact(p, 8.6, 'FX.G.mission.stepId==="defend"'); await asyncio.sleep(0.4)
        print('C step', await ev(p, 'FX.G.mission.stepId'))
        await wait(p, 'FX.G.t - FX.G.mission.stepT > 8', 60)
        await shot(p, '11_defense')
        print('device hp', await ev(p, 'FX.G.mission.device && Math.round(FX.G.mission.device.hp)'), 'actors', await ev(p, 'FX.G.actors.filter(a=>a.alive).length'))
        await ev(p, 'FX.G.mission.prog = FX.G.mission.dur - 0.5'); await asyncio.sleep(1.5)
        print('C done', await ev(p, 'FX.G.mission === null'), 'centrale', await ev(p, 'FX.G.cent.active'))
        await p.click('#rwOk'); await asyncio.sleep(3.5)
        await tp(p, 0, -100, 3.14159); await ev(p, 'FX.G.cam.pitch=-0.05'); await asyncio.sleep(2.5)
        await shot(p, '12_centrale_active')
        print('doors', await ev(p, 'FX.W.dyn.doors.map(d=>d.id+":"+d.open.toFixed(2)).join(",")'))
        print('ls world', await ev(p, "localStorage.getItem('fracture.world.v1')"))
        # Mission D
        await ev(p, 'FX.G.actors.filter(a=>a.faction!=="squad").forEach(a=>a.alive=false)')
        await ev(p, "FX.startMission('D')"); await tp(p, -21, -140, -1.57); await asyncio.sleep(0.4)
        print('D focus', await ev(p, 'FX.G.focus && FX.G.focus.label'))
        await hold_interact(p, 1.8); await asyncio.sleep(0.4)
        print('D step', await ev(p, 'FX.G.mission.stepId'))
        await tp(p, 150, -10, 1.57); await asyncio.sleep(0.6)
        print('D step', await ev(p, 'FX.G.mission.stepId'))
        await shot(p, '13_lab')
        await ev(p, 'FX.toggleValve(0); FX.toggleValve(2)'); await asyncio.sleep(0.5)
        print('D step', await ev(p, 'FX.G.mission.stepId'), 'gardien', await ev(p, '!!(FX.G.gardien && FX.G.gardien.alive)'))
        await tp(p, 160, -10, 1.57); await asyncio.sleep(2.0)
        await shot(p, '14_gardien')
        await ev(p, 'FX.G.gardien.ai.shield=0; FX.G.gardien.ai.vent=true; FX.AUTH.damage(FX.G.P, FX.G.gardien, 99999)'); await asyncio.sleep(0.6)
        print('D step', await ev(p, 'FX.G.mission && FX.G.mission.stepId'))
        await tp(p, 173.2, -10, 1.57); await hold_interact(p, 1.8); await asyncio.sleep(0.6)
        print('D done', await ev(p, 'FX.G.mission === null'), 'dialog', await ev(p, "!document.getElementById('dialog').classList.contains('hide')"))
        await shot(p, '15_journal')
        # fermer dialogues
        await ev(p, "document.getElementById('dialog').classList.add('hide'); document.getElementById('reward').classList.add('hide'); FX.G.paused=false")
        await ev(p, "FX.UI.open('map')"); await asyncio.sleep(0.6); await shot(p, '16_map')
        await ev(p, "FX.UI.open('journal')"); await asyncio.sleep(0.3); await shot(p, '17_journal_tab')
        await ev(p, "FX.UI.open('settings')"); await asyncio.sleep(0.3); await shot(p, '18_settings')
        await ev(p, "FX.UI.open('inventory')"); await asyncio.sleep(0.3); await shot(p, '19_inventory')
        await ev(p, 'FX.UI.close()')
        # sauvegarde et rechargement
        await ev(p, 'doSave()'); await asyncio.sleep(0.5)
        save = await ev(p, "JSON.parse(localStorage.getItem('fracture.save.v1'))")
        print('saved credits', save['credits'], 'xp', save['xp'], 'done', save['done'], 'lab', save['lab'])
        # perf : rester immobile et mesurer
        await tp(p, 0, 120, 3.14159); await asyncio.sleep(3)
        print('fps (swiftshader)', await ev(p, 'FX.G.dbg.fps'))
        await shot(p, '20_green_belt')
        await p.reload()
        ok = await wait(p, "!document.getElementById('title').classList.contains('hide')", 40)
        print('reload title', ok, 'continue text', await ev(p, "document.getElementById('btnContinue').textContent"), 'centrale after reload', await ev(p, 'FX.G.cent.active'))
        await p.click('#btnContinue'); await asyncio.sleep(1.5)
        print('resumed at', await ev(p, '[Math.round(FX.G.P.x),Math.round(FX.G.P.z)]'), 'credits', await ev(p, 'FX.G.save.credits'), 'lab door', await ev(p, 'FX.W.dyn.doors.find(d=>d.id==="lab").open'))
        await shot(p, '21_resumed')
        print('lastError', await ev(p, 'FX.G.lastError || null'))
        print('ERRORS', ERR[:10])
        await b.close()

asyncio.run(main())

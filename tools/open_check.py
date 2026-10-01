# Browser check for opening and closing the watch, plus frame sequences of both motions.
# Usage: python3 tools/open_check.py OUTDIR
import sys, json, base64, pathlib
from playwright.sync_api import sync_playwright
url = (pathlib.Path(__file__).resolve().parent.parent / 'dist/index.html').as_uri()
out = pathlib.Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
FRAMES = [0, 0.175, 0.35, 0.525, 0.7, 0.875, 1.05, 1.225, 1.4]

def save(pg, name):
    d = pg.evaluate('() => window.__watch.renderStill()')
    (out / name).write_bytes(base64.b64decode(d.split(',', 1)[1]))

# Deterministic frame sequence: stop the loop and step the opening by fixed time steps.
SEQ = '''async ([goal, t]) => { const W = window.__watch; W.setOpen(goal === 1); return null; }'''
R = {'checks': {}, 'errors': [], 'requests': []}
def ok(name, cond, info): R['checks'][name] = {'pass': bool(cond), 'info': info}

with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    for label, vp, mobile in [('desktop', {'width': 1440, 'height': 900}, False), ('phone', {'width': 390, 'height': 844}, True)]:
        ctx = b.new_context(viewport=vp, is_mobile=mobile, has_touch=mobile, device_scale_factor=1)
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: R['errors'].append(f'{label}: {e}'))
        pg.on('request', lambda r: R['requests'].append(r.url) if not r.url.startswith(('file:', 'data:', 'blob:')) else None)
        pg.goto(url); pg.wait_for_function('() => window.__watch', timeout=20000)
        pg.evaluate('() => { window.__watchNoAdapt = true; }')
        pg.wait_for_timeout(600)
        st = lambda: pg.evaluate('() => { const W = window.__watch; return { open: W.state.open, goal: W.state.openGoal, front: W.wc.front.visible, lid: W.wc.lid.visible, movement: W.mv.root.visible, btn: document.querySelector("[data-open]").textContent, pressed: document.querySelector("[data-open]").getAttribute("aria-pressed"), explode: W.state.explode, togglesHidden: document.querySelector("[data-toggles]").hidden, cam: W.camera.position.toArray().map(v => +v.toFixed(2)) }; }')
        s0 = st()
        ok(f'{label}_starts_closed', s0['open'] == 0 and s0['front'] and s0['lid'] and not s0['movement'] and s0['btn'] == 'Open the watch', s0)
        # Real interaction: tap/click the button with the loop running.
        btn = pg.locator('[data-figure="movement"] [data-open]')
        (btn.tap() if mobile else btn.click())
        pg.wait_for_function('() => window.__watch.state.open > 0', timeout=30000); mid = st()
        pg.wait_for_function('() => window.__watch.state.open === 1', timeout=30000); pg.evaluate('() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))'); s1 = st()
        ok(f'{label}_open_animates_then_settles', 0 < mid['open'] < 1 and s1['open'] == 1 and not s1['front'] and not s1['lid'] and s1['movement'] and s1['btn'] == 'Close the watch', {'mid': mid, 'end': s1})
        save(pg, f'{label}-open.png')
        # Explode while open.
        pg.evaluate("() => { const i = document.querySelector('[data-explode]'); i.value = 0.6; i.dispatchEvent(new Event('input')); }")
        pg.wait_for_timeout(500); s2 = st()
        ok(f'{label}_explode_while_open', abs(s2['explode'] - 0.6) < 1e-9 and s2['open'] == 1, s2)
        save(pg, f'{label}-open-explode.png')
        pg.evaluate("() => { const i = document.querySelector('[data-explode]'); i.value = 0; i.dispatchEvent(new Event('input')); }")
        # Parts toggles while open.
        pl = pg.locator('[data-figure="movement"] [data-parts]'); (pl.tap() if mobile else pl.click())
        pg.wait_for_timeout(200)
        tg = pg.evaluate('() => { const W = window.__watch; const c = document.querySelector("[data-part=cock]"); c.click(); const off = !W.mv.parts.cock.group?.visible; const vis = (() => { let v = null; try { v = W.mv.parts.cock.objects ? W.mv.parts.cock.objects.every(o => !o.visible) : null; } catch (e) {} return v; })(); c.click(); return { listShown: !document.querySelector("[data-toggles]").hidden, toggles: document.querySelectorAll("[data-part]").length, cockChecked: c.checked }; }')
        pg.locator('[data-part=pallet]').click(); pg.wait_for_timeout(500); mode = pg.evaluate('() => window.__watch.machine.state.mode'); pg.locator('[data-part=pallet]').click()
        ok(f'{label}_toggles_while_open', tg['listShown'] and tg['toggles'] == 15 and tg['cockChecked'] and mode == 'runaway', {**tg, 'palletOffMode': mode})
        # Orbit while open.
        # The toggle clicks can scroll the page, so bring the canvas back into view first. Phones use a real touch drag.
        cv = pg.locator('[data-figure="movement"] canvas').first; cv.scroll_into_view_if_needed(); pg.wait_for_timeout(200)
        c0 = st()['cam']; box = cv.bounding_box(); x = box['x'] + box['width'] / 2; y = box['y'] + box['height'] / 2
        if mobile:
            cdp = ctx.new_cdp_session(pg)
            cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x, 'y': y}]})
            for i in range(1, 8): cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': x + 15 * i, 'y': y + 3 * i}]})
            cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
        else:
            pg.mouse.move(x, y); pg.mouse.down(); pg.mouse.move(x + 120, y + 30, steps=6); pg.mouse.up()
        pg.wait_for_timeout(400); c1 = st()['cam']
        ok(f'{label}_orbit_while_open', c0 != c1, {'before': c0, 'after': c1})
        # Close: parts list hides, layers come together, dial returns.
        (btn.tap() if mobile else btn.click())
        pg.wait_for_function('() => window.__watch.state.open === 0', timeout=30000); pg.evaluate('() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))'); s3 = st()
        ok(f'{label}_close', s3['open'] == 0 and s3['front'] and s3['lid'] and not s3['movement'] and s3['togglesHidden'] and s3['explode'] == 0 and s3['btn'] == 'Open the watch', s3)
        save(pg, f'{label}-closed-again.png')
        # Parts button on a closed watch opens it rather than showing switches for hidden parts.
        (pl.tap() if mobile else pl.click()); pg.wait_for_function('() => window.__watch.state.open === 1', timeout=30000); pg.evaluate('() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))'); s4 = st()
        ok(f'{label}_parts_on_closed_opens', s4['goal'] == 1 and s4['open'] == 1 and not s4['togglesHidden'], s4)
        if label == 'desktop':
            # Frame sequences, stepped at fixed 0.15 s.
            pg.evaluate('() => { window.__watch.stop(); const W = window.__watch; W.setOpen(false); W.applyOpen(5); W.camera.position.copy(W.VIEWS.closed.home); W.controls.target.copy(W.VIEWS.closed.target); }')
            pg.evaluate('() => { const W = window.__watch; W.setOpen(true); }')
            prev = 0
            for i, t in enumerate(FRAMES):
                pg.evaluate(f'() => window.__watch.applyOpen({t - prev})'); prev = t
                save(pg, f'seq-open-{i}.png')
            pg.evaluate('() => window.__watch.setOpen(false)'); prev = 0
            for i, t in enumerate(FRAMES):
                pg.evaluate(f'() => window.__watch.applyOpen({t - prev})'); prev = t
                save(pg, f'seq-close-{i}.png')
        ctx.close()
    # Reduced motion: one click jumps to the end state.
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce')
    pg = ctx.new_page(); pg.on('pageerror', lambda e: R['errors'].append(f'reduced: {e}'))
    pg.goto(url); pg.wait_for_function('() => window.__watch', timeout=20000)
    pg.locator('[data-open]').click()
    v = pg.evaluate('() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(window.__watch.state.open))))')
    ok('reduced_motion_jumps', v == 1, v)
    ctx.close(); b.close()
R['pass'] = all(c['pass'] for c in R['checks'].values()) and not R['errors'] and not R['requests']
(out / 'browser_check.json').write_text(json.dumps(R, indent=1))
print(json.dumps({k: v['pass'] for k, v in R['checks'].items()}), 'errors', R['errors'][:3], 'requests', R['requests'][:3], 'PASS' if R['pass'] else 'FAIL')

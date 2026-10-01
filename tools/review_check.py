# Review check: open the fresh dist/index.html from file:// on desktop (mouse) and phone (touch),
# log every non-local request and page error, exercise the movement controls and every figure,
# and measure the frame interval. Usage: python3 tools/review_check.py OUT_DIR
import sys, json, pathlib, hashlib
from playwright.sync_api import sync_playwright
root = pathlib.Path(__file__).resolve().parent.parent
out = pathlib.Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
dist = root / 'dist/index.html'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
SIG = """k => { const c = document.querySelector(`[data-figure="${k}"] canvas`); const g = c.getContext('2d'); const d = g.getImageData(0,0,c.width,c.height).data; let n=0,h=0; for (let i=0;i<d.length;i+=16){ if(d[i+3]>0){n++; h=(h*31+d[i]+d[i+1]*7+d[i+2]*13)%1000000007;} } return [n,h]; }"""
FIG = {
    'spring': '[data-wind]', 'gears': '[data-pinion]', 'escapement': '[data-figure=escapement] [data-scrub]',
    'balance': '[data-inertia]', 'motion': '[data-figure=motion] [data-speed]',
}
report = {'sha256': hashlib.sha256(dist.read_bytes()).hexdigest(), 'url': dist.as_uri(), 'runs': []}
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    for name, W, H, touch in [('desktop', 1440, 900, False), ('phone', 390, 844, True)]:
        ctx = b.new_context(viewport={'width': W, 'height': H}, device_scale_factor=2 if touch else 1, is_mobile=touch, has_touch=touch)
        pg = ctx.new_page()
        r = {'view': name, 'touch': touch, 'errors': [], 'console_errors': [], 'requests': [], 'figures': {}}
        pg.on('pageerror', lambda e: r['errors'].append(str(e)))
        pg.on('console', lambda m: m.type == 'error' and r['console_errors'].append(m.text))
        pg.on('request', lambda q: (not q.url.startswith(('file:', 'data:', 'blob:'))) and r['requests'].append(q.url))
        pg.goto(dist.as_uri(), wait_until='load')
        pg.wait_for_function('() => window.__watch && window.__figures', timeout=30000)
        pg.wait_for_timeout(2500)
        fm = pg.evaluate('() => window.__watch.frameMs.slice(-60)')
        r['frame_ms_js_median'] = sorted(fm)[len(fm) // 2] if fm else None
        r['raf_fps'] = pg.evaluate('''() => new Promise(res => { let n = 0; const t0 = performance.now();
            const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(n * 1000 / (performance.now() - t0)); };
            requestAnimationFrame(f); })''')
        r['quality'] = pg.evaluate('() => window.__watch.quality')
        mv = '[data-figure=movement]'
        tap = (lambda s: pg.tap(s)) if touch else (lambda s: pg.click(s))
        t0 = pg.evaluate('() => window.__watch.state.t ?? null')
        tap(f'{mv} [data-play]'); pg.wait_for_timeout(200)
        r['paused_after_tap'] = not pg.evaluate('() => window.__watch.state.playing')
        tap(f'{mv} [data-play]'); pg.wait_for_timeout(200)
        r['playing_after_second_tap'] = pg.evaluate('() => window.__watch.state.playing')
        tap(f'{mv} [data-parts]'); pg.wait_for_timeout(200)
        r['parts_open'] = pg.evaluate('() => !document.querySelector("[data-toggles]").hidden')
        n_toggles = pg.locator('[data-toggles] input, [data-toggles] button').count()
        r['part_toggles'] = n_toggles
        box = pg.locator(f'{mv} .stage').bounding_box()
        cx, cy = box['x'] + box['width'] / 2, box['y'] + box['height'] / 2
        cam0 = pg.evaluate('() => window.__watch.camera.position.toArray()')
        pg.locator(f'{mv} .stage').scroll_into_view_if_needed()
        box = pg.locator(f'{mv} .stage').bounding_box()
        cx, cy = box['x'] + box['width'] / 2, box['y'] + box['height'] / 2
        if touch:
            cdp = ctx.new_cdp_session(pg)
            cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': cx, 'y': cy}]})
            for i in range(1, 9):
                cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': cx + 12 * i, 'y': cy + 4 * i}]})
            cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
        else:
            pg.mouse.move(cx, cy); pg.mouse.down()
            for i in range(1, 9): pg.mouse.move(cx + 12 * i, cy + 4 * i)
            pg.mouse.up()
        pg.wait_for_timeout(400)
        cam1 = pg.evaluate('() => window.__watch.camera.position.toArray()')
        r['orbit_moved_camera'] = cam0 != cam1
        pg.screenshot(path=str(out / f'{name}-movement.png'))
        for k, sel in FIG.items():
            fig = pg.locator(f'[data-figure="{k}"]'); fig.scroll_into_view_if_needed(); pg.wait_for_timeout(500)
            before = pg.evaluate(SIG, k)
            el = pg.locator(sel)
            mn, mx = float(el.get_attribute('min') or 0), float(el.get_attribute('max') or 1)
            pg.evaluate('([s, v]) => { const i = document.querySelector(s); i.value = v; i.dispatchEvent(new Event("input", {bubbles: true})); }', [sel, mn + (mx - mn) * 0.8])
            pg.wait_for_timeout(700)
            after = pg.evaluate(SIG, k)
            r['figures'][k] = {'painted': after[0], 'changed': before != after}
        fig = pg.locator('[data-figure=runaway]'); fig.scroll_into_view_if_needed(); pg.wait_for_timeout(400)
        before = pg.evaluate(SIG, 'runaway'); tap('[data-release]'); pg.wait_for_timeout(800)
        r['figures']['runaway'] = {'painted': pg.evaluate(SIG, 'runaway')[0], 'changed': before != pg.evaluate(SIG, 'runaway')}
        pg.screenshot(path=str(out / f'{name}-runaway.png'))
        r['overflow'] = pg.evaluate('() => document.documentElement.scrollWidth - innerWidth')
        r['pass'] = (not r['errors'] and not r['requests'] and r['overflow'] <= 0 and r['paused_after_tap'] and r['playing_after_second_tap']
                     and r['parts_open'] and r['part_toggles'] > 0 and r['orbit_moved_camera'] and all(f['painted'] > 0 and f['changed'] for f in r['figures'].values()))
        report['runs'].append(r)
        ctx.close()
    b.close()
report['pass'] = all(r['pass'] for r in report['runs'])
(out / 'browser-review.json').write_text(json.dumps(report, indent=1))
print(json.dumps(report, indent=1))

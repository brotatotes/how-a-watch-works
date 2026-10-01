# Diagnostic: does a one-finger touch drag orbit the main figure on a phone, closed and open?
# Usage: python3 tools/touch_orbit_diag.py
import json, pathlib
from playwright.sync_api import sync_playwright
url = (pathlib.Path(__file__).resolve().parent.parent / 'dist/index.html').as_uri()
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
R = {}
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(url); pg.wait_for_function('() => window.__watch', timeout=20000)
    cdp = ctx.new_cdp_session(pg)
    cam = lambda: pg.evaluate('() => window.__watch.camera.position.toArray().map(v => +v.toFixed(2))')
    def drag(tag):
        c = pg.locator('[data-figure="movement"] canvas').first
        c.scroll_into_view_if_needed(); pg.wait_for_timeout(200)
        bb = c.bounding_box(); x = bb['x'] + bb['width'] / 2; y = bb['y'] + bb['height'] / 2
        hit = pg.evaluate(f'() => {{ const e = document.elementFromPoint({x}, {y}); return e ? e.tagName + "." + e.className : null; }}')
        c0 = cam()
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x, 'y': y}]})
        for i in range(1, 8):
            cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': x + 15 * i, 'y': y + 3 * i}]})
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
        pg.wait_for_timeout(400); c1 = cam()
        # Mouse drag for comparison.
        pg.mouse.move(x, y); pg.mouse.down(); pg.mouse.move(x + 120, y + 30, steps=6); pg.mouse.up(); pg.wait_for_timeout(400); c2 = cam()
        R[tag] = {'box': bb, 'hit': hit, 'before': c0, 'afterTouch': c1, 'touchMoved': c0 != c1, 'afterMouse': c2, 'mouseMoved': c1 != c2}
    drag('closed')
    pg.locator('[data-figure="movement"] [data-open]').tap()
    pg.wait_for_function('() => window.__watch.state.open === 1', timeout=30000)
    drag('open')
    pl = pg.locator('[data-figure="movement"] [data-parts]'); pl.tap(); pg.wait_for_timeout(300)
    drag('open_parts_shown')
    R['errors'] = errs
    b.close()
print(json.dumps(R, indent=1))

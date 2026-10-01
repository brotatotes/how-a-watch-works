# Screenshots dist/index.html at desktop and phone and records page errors and
# network requests. Usage: python3 tools/shoot.py OUTDIR [--explode 0.6] [--wait 2500] [--only phone] [--no-page]
# Writes OUTDIR/check-<viewport><tag>.json as each viewport finishes.
import json, sys, time, pathlib, argparse
from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser()
ap.add_argument('out')
ap.add_argument('--explode', type=float, default=None)
ap.add_argument('--wait', type=int, default=2500)
ap.add_argument('--tag', default='')
ap.add_argument('--only', choices=['desktop', 'phone'], default=None)
ap.add_argument('--no-page', action='store_true')
a = ap.parse_args()
root = pathlib.Path(__file__).resolve().parent.parent
url = (root / 'dist/index.html').as_uri()
out = pathlib.Path(a.out); out.mkdir(parents=True, exist_ok=True)
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
report = {'url': 'file://dist/index.html', 'viewports': []}
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    for name, vp, mobile in [('desktop', (1440, 900), False), ('phone', (390, 844), True)]:
        if a.only and name != a.only:
            continue
        ctx = b.new_context(viewport={'width': vp[0], 'height': vp[1]}, device_scale_factor=1, is_mobile=mobile, has_touch=mobile)
        pg = ctx.new_page()
        errs, reqs, cons = [], [], []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: cons.append(m.type + ': ' + m.text) if m.type in ('error', 'warning') else None)
        pg.on('request', lambda r: reqs.append(r.url[:80]))
        pg.goto(url)
        pg.wait_for_timeout(a.wait)
        fig = pg.locator('[data-figure="movement"] canvas').first
        fig.scroll_into_view_if_needed()
        if a.explode is not None:
            pg.evaluate(f"""() => {{ const i = document.querySelector('[data-explode]'); i.value = {a.explode}; i.dispatchEvent(new Event('input')); }}""")
            pg.wait_for_timeout(400)
        # Pixel stats of the canvas.
        stats = pg.evaluate("""() => { const c = document.querySelector('[data-figure=movement] canvas');
          const t = document.createElement('canvas'); t.width = 64; t.height = 40; const x = t.getContext('2d');
          x.drawImage(c, 0, 0, 64, 40); const d = x.getImageData(0, 0, 64, 40).data; let n = 0, s = new Set();
          for (let i = 0; i < d.length; i += 4) { if (d[i+3] > 0) n++; s.add((d[i]>>4)+','+(d[i+1]>>4)+','+(d[i+2]>>4)); }
          return { opaque: n, colours: s.size, overflowX: document.documentElement.scrollWidth > innerWidth }; }""")
        # Orbit drag responds: compare pixels before and after a drag.
        box = fig.bounding_box()
        before = fig.screenshot()
        pg.mouse.move(box['x'] + box['width'] * 0.5, box['y'] + box['height'] * 0.5)
        pg.mouse.down(); pg.mouse.move(box['x'] + box['width'] * 0.7, box['y'] + box['height'] * 0.45, steps=6); pg.mouse.up()
        pg.wait_for_timeout(600)
        after = fig.screenshot()
        shot = out / f'movement-{name}{a.tag}.png'
        pg.evaluate("() => { const w = window.__watch; if (w) { w.camera.position.set(-14, -40, 50); } }")
        pg.wait_for_timeout(500)
        fig.screenshot(path=str(shot))
        if not a.no_page:
            pg.screenshot(path=str(out / f'page-{name}{a.tag}.png'))
        report['viewports'].append({'name': name, 'size': vp, 'pageErrors': errs, 'console': cons[:10],
            'nonFileRequests': [r for r in reqs if not r.startswith('file:') and not r.startswith('data:')],
            'canvas': stats, 'orbitChangedPixels': before != after, 'screenshot': str(shot)})
        (out / f'check-{name}{a.tag}.json').write_text(json.dumps(report['viewports'][-1], indent=1))
        ctx.close()
    b.close()
print(json.dumps(report, indent=1))

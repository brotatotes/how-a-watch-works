# Render several stills in one page load, each after a JS tweak, for lighting diagnosis.
# Usage: python3 tools/diagshot.py OUTPREFIX 'label=js' ['label=js' ...]
import sys, time, pathlib, base64
from playwright.sync_api import sync_playwright
prefix = sys.argv[1]
variants = [a.split('=', 1) for a in sys.argv[2:]]
url = (pathlib.Path(__file__).resolve().parent.parent / 'dist/index.html').as_uri()
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
t0 = time.time()
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    pg = b.new_page(viewport={'width': 1440, 'height': 900})
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(url, wait_until='domcontentloaded')
    pg.wait_for_function('() => window.__watch', timeout=20000)
    pg.wait_for_timeout(500)
    pg.evaluate('() => window.__watch.stop()')
    for label, js in variants:
        pg.evaluate('js => { const W = window.__watch; new Function("W", js)(W); }', js)
        data = pg.evaluate('() => window.__watch.renderStill()')
        pathlib.Path(f'{prefix}-{label}.png').write_bytes(base64.b64decode(data.split(',', 1)[1]))
        print(f'{time.time()-t0:5.1f} {label}', flush=True)
    print('errors', errs)
    b.close()

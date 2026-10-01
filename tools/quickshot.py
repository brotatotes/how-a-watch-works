# Fast single screenshot with timing, for iteration under swiftshader.
# Usage: python3 tools/quickshot.py OUT.png [W H] [--explode E] [--cam=x,y,z]  (use = for negative values)
import sys, time, pathlib, json
from playwright.sync_api import sync_playwright
args = sys.argv[1:]
out = args[0]
W, H = (int(args[1]), int(args[2])) if len(args) > 2 and args[1].isdigit() else (1440, 900)
opt = {}
for i, a in enumerate(args):
    if a.startswith('--') and '=' in a:
        k, v = a[2:].split('=', 1); opt[k] = v
    elif a.startswith('--'):
        opt[a[2:]] = args[i + 1]
t0 = time.time()
lg = lambda s: print(f'{time.time()-t0:6.1f} {s}', flush=True)
url = (pathlib.Path(__file__).resolve().parent.parent / 'dist/index.html').as_uri()
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    mobile = W < 600
    pg = b.new_page(viewport={'width': W, 'height': H}, device_scale_factor=2 if mobile else 1, is_mobile=mobile, has_touch=mobile)
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(url, wait_until='domcontentloaded')
    pg.wait_for_function('() => window.__watch', timeout=20000)
    lg('ready')
    if 'explode' in opt:
        pg.evaluate("e => { const i = document.querySelector('[data-explode]'); i.value = e; i.dispatchEvent(new Event('input')); }", float(opt['explode']))
    if 'cam' in opt:
        pg.evaluate("c => window.__watch.camera.position.set(...c)", [float(v) for v in opt['cam'].split(',')])
    pg.wait_for_timeout(800)
    fm = pg.evaluate('() => { const f = window.__watch.frameMs; window.__watch.stop(); return f.slice(); }')
    lg('frames %d, mean %.0f ms' % (len(fm), sum(fm) / max(1, len(fm))))
    import base64
    data = pg.evaluate('() => window.__watch.renderStill()')
    pathlib.Path(out).write_bytes(base64.b64decode(data.split(',', 1)[1]))
    lg('still written')
    pg.screenshot(path=out.replace('.png', '-page.png'), timeout=60000)
    lg('page shot')
    print(json.dumps({'errors': errs}))
    b.close()

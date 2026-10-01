# Screenshot selected 2D figures at a viewport, after optional scrub values.
# Usage: python3 tools/figshot.py OUTDIR W H
import sys, pathlib, json
from playwright.sync_api import sync_playwright
out = pathlib.Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
W, H = int(sys.argv[2]), int(sys.argv[3])
url = (pathlib.Path(__file__).resolve().parent.parent / 'dist/index.html').as_uri()
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
res = {'viewport': [W, H], 'errors': [], 'shots': []}
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    mobile = W < 600
    pg = b.new_page(viewport={'width': W, 'height': H}, device_scale_factor=2 if mobile else 1, is_mobile=mobile, has_touch=mobile)
    pg.on('pageerror', lambda e: res['errors'].append(str(e)))
    pg.goto(url, wait_until='domcontentloaded')
    pg.wait_for_function('() => window.__figures', timeout=20000)
    pg.evaluate('() => window.__watch && window.__watch.stop && window.__watch.stop()')
    for v in ['0.1', '0.3', '0.45', '0.5', '0.55', '0.62', '0.9']:
        el = pg.locator('[data-figure=escapement]')
        el.scroll_into_view_if_needed()
        pg.evaluate("v => { const i=document.querySelector('[data-figure=escapement] [data-scrub]'); i.value=v; i.dispatchEvent(new Event('input')); }", v)
        pg.wait_for_timeout(250)
        phase = pg.inner_text('[data-figure=escapement] [data-phase-out]')
        f = out / f'escapement-{v}.png'; el.screenshot(path=str(f))
        res['shots'].append({'fig': 'escapement', 'scrub': v, 'phase': phase, 'contactFix': pg.get_attribute('[data-figure=escapement]', 'data-contact-fix'), 'file': f.name})
    for name, click in [('runaway', '[data-figure=runaway] [data-release]'), ('motion', None)]:
        el = pg.locator(f'[data-figure={name}]')
        el.scroll_into_view_if_needed()
        if click: pg.click(click)
        pg.wait_for_timeout(700)
        f = out / f'{name}.png'; el.screenshot(path=str(f))
        res['shots'].append({'fig': name, 'file': f.name})
    b.close()
print(json.dumps(res))
(out / 'figshot.json').write_text(json.dumps(res, indent=1))

import sys, json, pathlib, time
from playwright.sync_api import sync_playwright
root = pathlib.Path(__file__).resolve().parent.parent
out = pathlib.Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
W, H = int(sys.argv[2]), int(sys.argv[3])
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
res = {'viewport': [W, H], 'figures': {}, 'errors': [], 'console_errors': [], 'requests': []}
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    mobile = W < 600
    pg = b.new_page(viewport={'width': W, 'height': H}, device_scale_factor=2 if mobile else 1, is_mobile=mobile, has_touch=mobile)
    pg.on('pageerror', lambda e: res['errors'].append(str(e)))
    pg.on('console', lambda m: m.type == 'error' and res['console_errors'].append(m.text))
    pg.on('request', lambda r: (not r.url.startswith('file:') and not r.url.startswith('data:')) and res['requests'].append(r.url))
    pg.goto((root / 'dist/index.html').as_uri(), wait_until='domcontentloaded')
    pg.wait_for_function('() => window.__watch && window.__figures', timeout=30000)
    pg.evaluate('() => window.__watch.stop()')
    res['overflow'] = pg.evaluate('() => document.documentElement.scrollWidth - innerWidth')
    SIG = """k => { const c = document.querySelector(`[data-figure="${k}"] canvas`); const g = c.getContext('2d'); const d = g.getImageData(0,0,c.width,c.height).data; let n=0,h=0; for (let i=0;i<d.length;i+=16){ if(d[i+3]>0){n++; h=(h*31+d[i]+d[i+1]*7+d[i+2]*13)%1000000007;} } return [n,h]; }"""
    actions = {
        'spring': "() => { const i=document.querySelector('[data-wind]'); i.value=0.1; i.dispatchEvent(new Event('input')); }",
        'gears': "() => { const i=document.querySelector('[data-pinion]'); i.value=7; i.dispatchEvent(new Event('input')); }",
        'runaway': "() => document.querySelector('[data-release]').click()",
        'escapement': "() => { const i=document.querySelector('[data-figure=escapement] [data-scrub]'); i.value=0.5; i.dispatchEvent(new Event('input')); }",
        'balance': "() => { const i=document.querySelector('[data-inertia]'); i.value=2; i.dispatchEvent(new Event('input')); }",
        'motion': "() => { const i=document.querySelector('[data-figure=motion] [data-speed]'); i.value=1; i.dispatchEvent(new Event('input')); }",
    }
    for k, act in actions.items():
        fig = pg.locator(f'[data-figure="{k}"]')
        fig.scroll_into_view_if_needed()
        pg.wait_for_timeout(700)
        before = pg.evaluate(SIG, k)
        pg.evaluate(act)
        pg.wait_for_timeout(900)
        after = pg.evaluate(SIG, k)
        extra = {}
        if k == 'escapement':
            extra['phase_at_0.5'] = pg.inner_text('[data-figure=escapement] [data-phase-out]')
        bb = fig.bounding_box()
        pg.screenshot(path=str(out / f'{k}.png'), clip={'x': 0, 'y': bb['y'] if False else 0, 'width': W, 'height': H}, timeout=60000)
        res['figures'][k] = {'painted_before': before[0], 'painted_after': after[0], 'changed': before != after, **extra}
    res['h2'] = pg.evaluate("() => [...document.querySelectorAll('h2')].map(h => h.textContent)")
    b.close()
res['pass'] = not res['errors'] and not res['requests'] and res['overflow'] <= 0 and all(f['painted_after'] > 0 and f['changed'] for f in res['figures'].values())
(out / 'browser-check.json').write_text(json.dumps(res, indent=1))
print(json.dumps(res, indent=1))

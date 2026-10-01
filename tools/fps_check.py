# Frame-rate check for the main figure, closed and open, on desktop, phone portrait and phone landscape
# (touch emulation on phones). Opens dist/index.html from file:// and records page errors and requests.
# Usage: python3 tools/fps_check.py OUT.json
import sys, json, pathlib
from playwright.sync_api import sync_playwright
root = pathlib.Path(__file__).resolve().parent.parent
url = (root / 'dist/index.html').as_uri()
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
FPS = '''() => new Promise(res => { let n = 0; const t0 = performance.now();
  const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(n * 1000 / (performance.now() - t0)); };
  requestAnimationFrame(f); })'''
MS = '() => { const a = window.__watch.frameMs.slice(-30).slice().sort((x, y) => x - y); return a.length ? a[a.length >> 1] : null; }'
report = {'url': url, 'runs': []}
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    for name, W, H, touch in [('desktop', 1440, 900, False), ('phone-portrait', 390, 844, True), ('phone-landscape', 844, 390, True)]:
        ctx = b.new_context(viewport={'width': W, 'height': H}, device_scale_factor=2 if touch else 1, is_mobile=touch, has_touch=touch)
        pg = ctx.new_page()
        r = {'view': name, 'touch': touch, 'errors': [], 'requests': []}
        pg.on('pageerror', lambda e: r['errors'].append(str(e)))
        pg.on('request', lambda q: (not q.url.startswith(('file:', 'data:', 'blob:'))) and r['requests'].append(q.url))
        pg.goto(url, wait_until='load')
        pg.wait_for_function('() => window.__watch', timeout=30000)
        pg.locator('[data-figure=movement] .stage').scroll_into_view_if_needed()
        pg.wait_for_timeout(2500)
        r['closed'] = {'raf_fps': round(pg.evaluate(FPS), 1), 'js_ms_median': pg.evaluate(MS), 'open': pg.evaluate('() => window.__watch.state.open')}
        btn = pg.locator('[data-figure=movement] [data-open]')
        (btn.tap() if touch else btn.click())
        pg.wait_for_function('() => window.__watch.state.open === 1', timeout=30000)
        pg.wait_for_timeout(1500)
        r['open'] = {'raf_fps': round(pg.evaluate(FPS), 1), 'js_ms_median': pg.evaluate(MS), 'open': pg.evaluate('() => window.__watch.state.open')}
        r['quality_ratio'] = pg.evaluate('() => window.__watch.quality.ratio')
        r['pass'] = not r['errors'] and not r['requests'] and r['closed']['open'] == 0 and r['open']['open'] == 1
        report['runs'].append(r)
        ctx.close()
    b.close()
report['pass'] = all(r['pass'] for r in report['runs'])
pathlib.Path(sys.argv[1]).write_text(json.dumps(report, indent=1))
print(json.dumps(report, indent=1))

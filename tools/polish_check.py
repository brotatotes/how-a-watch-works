# Polish check: desktop, phone portrait and phone landscape, plus reduced motion and the sound toggle.
# Usage: python3 tools/polish_check.py OUT_DIR
import sys, json, pathlib, base64
from playwright.sync_api import sync_playwright
root = pathlib.Path(__file__).resolve().parent.parent
out = pathlib.Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']
url = (root / 'dist/index.html').as_uri()
views = [('desktop', 1440, 900, False), ('phone-portrait', 390, 844, True), ('phone-landscape', 844, 390, True)]
report = {'runs': []}
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    for name, W, H, mobile in views:
        for reduced in (False, True):
            if reduced and name != 'desktop':
                continue
            ctx = b.new_context(viewport={'width': W, 'height': H}, device_scale_factor=2 if mobile else 1, is_mobile=mobile, has_touch=mobile,
                                reduced_motion='reduce' if reduced else 'no-preference')
            pg = ctx.new_page()
            r = {'view': name, 'reduced': reduced, 'errors': [], 'requests': []}
            pg.on('pageerror', lambda e: r['errors'].append(str(e)))
            pg.on('request', lambda q: (not q.url.startswith(('file:', 'data:', 'blob:'))) and r['requests'].append(q.url))
            pg.goto(url, wait_until='domcontentloaded')
            pg.wait_for_function('() => window.__watch && window.__figures', timeout=30000)
            pg.wait_for_timeout(600)
            r['overflow'] = pg.evaluate('() => document.documentElement.scrollWidth - innerWidth')
            r['playing'] = pg.evaluate('() => window.__watch.state.playing')
            r['sound_initial'] = pg.evaluate('() => window.__watch.sound.on')
            r['audio_ctx_before_click'] = pg.evaluate('() => !!window.__watch.sound.ctx')
            stage = pg.locator('[data-figure=movement] .stage').bounding_box()
            r['stage_box'] = stage
            r['stage_fits_viewport'] = stage['height'] <= H and stage['width'] <= W
            # With the stage scrolled to the top of the screen, the buttons and the first slider must
            # also be on screen, and the three slider tracks must share the same left and right edges.
            r['layout'] = pg.evaluate('''() => {
              const f = document.querySelector('[data-figure=movement]');
              f.querySelector('.stage').scrollIntoView({block: 'start'});
              const b = (e) => e.getBoundingClientRect();
              const sl = [...f.querySelectorAll('.panel input[type=range]')].map(b);
              const btns = b(f.querySelector('.btns'));
              const panel = b(f.querySelector('.panel'));
              return { btnsBottom: btns.bottom, firstSliderBottom: sl[0].bottom, panelBottom: panel.bottom, vh: innerHeight,
                       trackLefts: sl.map(r => Math.round(r.left)), trackRights: sl.map(r => Math.round(r.right)) };
            }''')
            L = r['layout']
            r['controls_with_stage'] = L['btnsBottom'] <= L['vh'] + 1 and L['firstSliderBottom'] <= L['vh'] + 1
            r['tracks_aligned'] = (name == 'desktop') or (max(L['trackLefts']) - min(L['trackLefts']) <= 1 and max(L['trackRights']) - min(L['trackRights']) <= 1)
            pg.evaluate('() => scrollTo(0, 0)')
            if not reduced:
                t0 = pg.evaluate('() => window.__watch.machine.t')
                pg.click('[data-sound]')
                pg.wait_for_timeout(1500)
                r['sound_after_click'] = pg.evaluate('() => [window.__watch.sound.on, window.__watch.sound.ctx && window.__watch.sound.ctx.state]')
                r['sound_label'] = pg.inner_text('[data-sound]')
                r['time_advanced'] = pg.evaluate('() => window.__watch.machine.t') - t0
                r['quality'] = pg.evaluate('() => ({...window.__watch.quality})')
                pg.click('[data-sound]')
                r['sound_after_second_click'] = pg.evaluate('() => window.__watch.sound.on')
            else:
                t0 = pg.evaluate('() => window.__watch.machine.t')
                pg.wait_for_timeout(1200)
                r['time_advanced'] = pg.evaluate('() => window.__watch.machine.t') - t0
                r['play_label'] = pg.inner_text('[data-play]')
            pg.evaluate('() => window.__watch.stop()')
            data = pg.evaluate('() => window.__watch.renderStill()')
            tag = name + ('-reduced' if reduced else '')
            (out / f'{tag}-still.png').write_bytes(base64.b64decode(data.split(',', 1)[1]))
            pg.screenshot(path=str(out / f'{tag}-page.png'), timeout=60000)
            pg.evaluate("() => document.querySelector('[data-figure=movement] .stage').scrollIntoView({block: 'start'})")
            pg.wait_for_timeout(300)
            pg.screenshot(path=str(out / f'{tag}-figure.png'), timeout=60000)
            report['runs'].append(r)
            ctx.close()
    b.close()
ok = True
for r in report['runs']:
    good = not r['errors'] and not r['requests'] and r['overflow'] <= 0 and r['stage_fits_viewport'] and r['controls_with_stage'] and r['tracks_aligned'] and r['sound_initial'] is False and not r['audio_ctx_before_click']
    if r['reduced']:
        good = good and r['playing'] is False and r['time_advanced'] == 0
    else:
        good = good and r['sound_after_click'][0] is True and r['sound_after_second_click'] is False and r['time_advanced'] > 0
    r['pass'] = good
    ok = ok and good
report['pass'] = ok
(out / 'browser-check.json').write_text(json.dumps(report, indent=1))
print(json.dumps(report, indent=1))

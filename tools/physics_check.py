# Browser check for the ticking mechanism: scrub, speed, part removal, hands and errors.
# Usage: python3 tools/physics_check.py OUT.json [SHOT_PREFIX]
import json, sys, pathlib
from playwright.sync_api import sync_playwright
root = pathlib.Path(__file__).resolve().parent.parent
url = (root / 'dist/index.html').as_uri()
out = pathlib.Path(sys.argv[1]); shots = sys.argv[2] if len(sys.argv) > 2 else None
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
R = {'url': 'file://dist/index.html', 'checks': {}, 'errors': [], 'requests': []}
def ok(name, cond, detail):
    R['checks'][name] = {'pass': bool(cond), 'detail': detail}
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=1)
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: R['errors'].append(str(e)))
    pg.on('request', lambda r: R['requests'].append(r.url[:60]) if not r.url.startswith(('file:', 'data:', 'blob:')) else None)
    pg.goto(url); pg.wait_for_timeout(1500)
    J = lambda s: pg.evaluate(s)
    # Element screenshots wait for stability, which never comes while the figure animates.
    def shot(path):
        bb = pg.locator('[data-figure=movement]').bounding_box()
        pg.screenshot(path=path, clip=bb, timeout=60000)
    # Real-time rate: escape wheel advances ~72 deg/s while playing at speed 1.
    # Headless SwiftShader renders ~1 fps, so measure the page's machine over 10 sim seconds.
    fr0 = J('__watch.frameMs.length'); pg.wait_for_timeout(2000)
    rate = J('(() => { const m = __watch.machine; const a = m.state.escape, t = m.t; m.seek(t + 10); const r = (m.state.escape - a) / 10; m.seek(t); return r; })()')
    ok('escape_rate_72_deg_per_sim_s', abs(rate - 72) < 72 / 60 * 1.01, {'rate': rate, 'framesIn2s': J('__watch.frameMs.length') - fr0})
    # Scrub: pauses and seeks; escape angle changes with scrub value and is reproducible.
    def scrub(v):
        J(f"() => {{ const s = document.querySelector('[data-scrub]'); s.focus(); s.value = {v}; s.dispatchEvent(new Event('input')); }}")
        pg.wait_for_timeout(120)
        return J('({t: __watch.machine.t, e: __watch.machine.state.escape, ph: __watch.machine.state.phase, playing: __watch.state.playing, status: document.querySelector("[data-status]").textContent, fork: __watch.machine.state.fork, bal: __watch.machine.state.balance})')
    s1 = scrub(0.1); s2 = scrub(1.1); s3 = scrub(0.1)
    ok('scrub_pauses_and_seeks', (not s1['playing']) and abs(s2['e'] - s1['e'] - 72) < 13 and s3['e'] == s1['e'], {'s1': s1, 's2': s2, 's3': s3})
    if shots: shot(path=f'{shots}-scrubbed.png')
    # Phases visible via scrub across one beat.
    phases = []
    # Beat 1 spans 0.0784-0.0926 s: unlock 1.8 ms, impulse 8.4 ms, drop 4 ms. Slider step is 0.5 ms.
    for i in range(0, 40):
        st = scrub(round(0.075 + i * 0.0005, 5))
        if not phases or phases[-1] != st['ph']: phases.append(st['ph'])
    ok('scrub_reveals_escapement_phases', {'lock', 'unlock', 'impulse', 'drop'} <= set(phases), phases)
    # Slow speed: 1/100.
    J("() => { const s = document.querySelector('[data-speed]'); s.value = 1; s.dispatchEvent(new Event('input')); document.querySelector('[data-play]').click(); document.activeElement.blur(); }")
    t0 = J('__watch.machine.t'); pg.wait_for_timeout(2000); t1 = J('__watch.machine.t')
    ok('speed_one_hundredth', 0 < (t1 - t0) < 0.05, {'simDtOver2s': t1 - t0, 'label': J('document.querySelector("[data-speed-out]").textContent')})
    J("() => { const s = document.querySelector('[data-speed]'); s.value = 0; s.dispatchEvent(new Event('input')); }")
    # Part removal failure modes.
    def toggle(part, on):
        J(f"() => {{ const c = document.querySelector('[data-part={part}]'); if (c.checked !== {str(on).lower()}) c.click(); }}")
        pg.wait_for_timeout(700)
        J('__watch.renderStill()'); pg.wait_for_timeout(1500)
        return J('({mode: __watch.machine.state.mode, e: __watch.machine.state.escape, status: document.querySelector("[data-status]").textContent})')
    e0 = J('__watch.machine.state.escape'); r = toggle('pallet', False)
    J('__watch.machine.step(1)')
    pg.wait_for_function("document.querySelector('[data-status]').textContent.includes('Pallet')", timeout=20000)
    r['status'] = J('document.querySelector("[data-status]").textContent'); r2 = J('__watch.machine.state.escape')
    if shots: shot(path=f'{shots}-runaway.png')
    ok('pallet_removed_runaway', r['mode'] == 'runaway' and r2 - e0 > 360, {'mode': r['mode'], 'escapeGain': r2 - e0, 'status': r['status']})
    back = toggle('pallet', True)
    ok('pallet_restored_running', back['mode'] == 'running', back)
    u = toggle('barrel', False); u2 = J('__watch.machine.state.escape'); pg.wait_for_timeout(800); u3 = J('__watch.machine.state.escape')
    ok('mainspring_removed_stops', u['mode'] == 'unpowered' and u3 == u2, {'mode': u['mode'], 'status': u['status'], 'escapeDelta': u3 - u2})
    toggle('barrel', True)
    j = toggle('balance', False); j2 = J('__watch.machine.state.escape'); pg.wait_for_timeout(800); j3 = J('__watch.machine.state.escape')
    ok('balance_removed_jams', j['mode'] == 'jammed' and j3 == j2, {'mode': j['mode'], 'status': j['status']})
    toggle('balance', True)
    # Hands: seconds hand = fourth wheel at 6 deg per sim second.
    h = J('(() => { const m = __watch.machine; const a = m.state.hands.seconds; m.seek(m.t + 10); const b = m.state.hands.seconds; return {a, b, perSec: (b - a) / 10}; })()')
    ok('seconds_hand_6deg_per_s', abs(h['perSec'] - 6) < 0.2, h)
    # The 2D corner dial was replaced by the 3D hands on the closed watch (watch-cover update).
    hands3d = J("(() => { const g = __watch.wc.groups; return { visible: __watch.wc.front.visible !== undefined, hasHands: !!(g.hourG && g.minG && g.secG), noDial: !document.querySelector('[data-dial]') }; })()")
    ok('hands_3d_present', hands3d['hasHands'] and hands3d['noDial'], hands3d)
    if shots: shot(path=f'{shots}-running.png')
    b.close()
R['pass'] = all(c['pass'] for c in R['checks'].values()) and not R['errors'] and not R['requests']
out.write_text(json.dumps(R, indent=1))
print(json.dumps({k: v['pass'] for k, v in R['checks'].items()}), 'errors', R['errors'][:3], 'requests', R['requests'][:3], 'PASS' if R['pass'] else 'FAIL')

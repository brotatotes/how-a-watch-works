# Browser check that the 3D hands follow the simulation: running, slowed, scrubbed, and with parts removed.
# Usage: python3 tools/hands_check.py OUT.json
import sys, json, pathlib
from playwright.sync_api import sync_playwright
url = (pathlib.Path(__file__).resolve().parent.parent / 'dist/index.html').as_uri()
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
JS = '''async () => {
  const W = window.__watch; const g = W.wc.groups; const D = 180 / Math.PI;
  // The drawn rotation is wrapped, so also keep the simulation's unwrapped seconds angle and check
  // that the drawn hand agrees with it modulo a full turn (the runaway train can pass 180 deg per frame).
  const read = () => { const hs = W.machine.state.hands; const s = g.secG.rotation.z * D;
    const lag = ((s - (W.wc.groups.secG.userData.rot0 ?? 0) + hs.seconds) % 360 + 360) % 360;
    return { t: W.machine.t, h: g.hourG.rotation.z * D, m: g.minG.rotation.z * D, s, simSec: hs.seconds, agree: Math.min(lag, 360 - lag) < 0.01 }; };
  W.wc.groups.secG.userData.rot0 = g.secG.rotation.z * D + W.machine.state.hands.seconds;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const frames = (n) => new Promise(r => { const f = () => (--n <= 0 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
  // Software WebGL frames can take hundreds of ms, so every read waits for fresh frames first.
  const wait = async (ms) => { await sleep(ms); await frames(3); };
  const res = {};
  const a = read(); await wait(1500); const b = read();
  res.running = { simDt: b.t - a.t, secDeg: b.s - a.s, minDeg: b.m - a.m, hourDeg: b.h - a.h };
  const sp = document.querySelector('[data-speed]'); sp.value = 1; sp.dispatchEvent(new Event('input'));
  const c = read(); await wait(1500); const d = read();
  res.slow = { speed: W.state.speed, simDt: d.t - c.t, secDeg: d.s - c.s };
  sp.value = 0; sp.dispatchEvent(new Event('input'));
  const sc = document.querySelector('[data-scrub]'); const e0 = read();
  sc.value = 0.05; sc.dispatchEvent(new Event('input')); await wait(200); const e1 = read();
  sc.value = 1.95; sc.dispatchEvent(new Event('input')); await wait(200); const e2 = read();
  res.scrub = { playing: W.state.playing, t1: e1.t, t2: e2.t, secDeg: e2.s - e1.s };
  document.querySelector('[data-play]').click();
  const cb = (n) => document.querySelector(`[data-part="${n}"]`);
  cb('barrel').click(); await wait(400); const f0 = read(); await wait(1500); const f1 = read();
  res.noMainspring = { mode: W.machine.state.mode, secDeg: f1.s - f0.s, minDeg: f1.m - f0.m };
  cb('barrel').click(); cb('pallet').click(); await wait(300); const r0 = read(); await wait(1000); const r1 = read();
  res.noPallet = { mode: W.machine.state.mode, simSecDeg: r1.simSec - r0.simSec, simDt: r1.t - r0.t, drawnAgrees: r0.agree && r1.agree };
  res.agreeAll = [a, b, c, d, e1, e2, f0, f1, r0, r1].every(x => x.agree);
  cb('pallet').click();
  return res;
}'''
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    pg = b.new_page(viewport={'width': 1440, 'height': 900})
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(url); pg.wait_for_function('() => window.__watch', timeout=20000)
    pg.evaluate('() => { window.__watchNoAdapt = true; }')
    r = pg.evaluate(JS)
    r['pageErrors'] = errs
    run, slow, sc, nm, npal = r['running'], r['slow'], r['scrub'], r['noMainspring'], r['noPallet']
    # rotation.z is counter-clockwise, so clockwise hand motion is negative. Seconds: 6 deg per sim second.
    r['checks'] = {
        'secondsTrackSim': abs(-run['secDeg'] - 6 * run['simDt']) < 1.5 and run['simDt'] > 0.3,
        'hourMinuteRatio12': abs(run['minDeg']) > 0 and abs(run['minDeg'] / run['hourDeg'] - 12) < 0.5 if run['hourDeg'] else False,
        'slowSpeedSlowsHands': slow['speed'] < 0.02 and abs(slow['secDeg']) < 0.2,
        'scrubMovesHands': (not sc['playing']) and abs(sc['secDeg']) > 5,
        'noMainspringFrozen': nm['mode'] == 'unpowered' and abs(nm['secDeg']) < 1e-6 and abs(nm['minDeg']) < 1e-6,
        'noPalletRunaway': npal['mode'] == 'runaway' and abs(npal['simSecDeg']) > 30 and npal['drawnAgrees'],
        'drawnSecondsMatchSim': r['agreeAll'],
        'noPageErrors': not errs,
    }
    r['passed'] = all(r['checks'].values())
    pathlib.Path(sys.argv[1]).write_text(json.dumps(r, indent=2))
    print(json.dumps(r['checks']), r['passed'])
    b.close()

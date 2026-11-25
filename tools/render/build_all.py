"""Render every ice cream image used by the site. Usage: python3 build_all.py [stage|products|all]
Outputs WebP files into ../../public/assets/images. Pure numpy/scipy/PIL: no network, no third-party assets."""
import sys, os, time, json
sys.path.insert(0, os.path.dirname(__file__))
from scenes import *
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'assets', 'images')
W, H, SS = 736, 920, 1.5
# slug: (factory, theme, moody theme, floor y, moody focus offset, alt text)
P = {
 'salted-caramel': (lambda: cone_scene('caramel'), 'warm', 'cocoa', None, 1.4, 'Waffle cone topped with a scoop of salted caramel ice cream'),
 'pistachio-dream': (lambda: cone_scene('pistachio'), 'pista', 'wine', None, 1.4, 'Waffle cone topped with a scoop of pistachio ice cream'),
 'cookies-and-cream': (lambda: cup_scene(['cookies', 'cookies']), 'blush', 'cocoa', -2.1, 0.5, 'Two scoops of cookies and cream ice cream in a SCOOPÉ cup'),
 'vanilla-family-tub': (lambda: tub_scene('vanilla'), 'warm', 'cocoa', -1.4, 0.2, 'Open SCOOPÉ tub of vanilla ice cream with a scoop on top'),
 'chocolate-lovers-tub': (lambda: tub_scene('chocolate'), 'peach', 'wine', -1.4, 0.2, 'Open SCOOPÉ tub of chocolate ice cream with a scoop on top'),
 'strawberry-collection': (lambda: tub_scene('strawberry'), 'blush', 'cocoa', -1.4, 0.2, 'Open SCOOPÉ tub of strawberry ice cream with a scoop on top'),
 'berry-dream': (lambda: sundae_scene(['strawberry', 'vanilla', 'strawberry'], '#7A1F4B'), 'blush', 'wine', -2.37, 0.9, 'Strawberry and vanilla sundae with berry sauce, cream and a cherry'),
 'chocolate-obsession': (lambda: sundae_scene(['chocolate', 'vanilla', 'chocolate'], '#2B160E', chunks=True), 'warm', 'cocoa', -2.37, 0.9, 'Chocolate and vanilla sundae with chocolate sauce, brownie pieces, cream and a cherry'),
 'pistachio-indulgence': (lambda: sundae_scene(['pistachio', 'vanilla', 'pistachio'], None, nuts=True), 'pista', 'cocoa', -2.37, 0.9, 'Pistachio and vanilla sundae with chopped pistachios, cream and a cherry'),
 'the-sweet-box': (lambda: box_scene('#DCA1A0', '#E8B7B5', '#783D45'), 'warm', 'wine', -1.5, 0.3, 'Pink SCOOPÉ gift box tied with a wine-coloured ribbon'),
 'celebration-collection': (lambda: box_scene('#783D45', '#8A4A53', '#DCA1A0'), 'blush', 'cocoa', -1.5, 0.3, 'Wine-coloured SCOOPÉ gift box tied with a pink ribbon'),
 'the-scoope-experience': (lambda: box_scene('#382822', '#46332B', '#D8BDA2'), 'warm', 'wine', -1.5, 0.3, 'Dark cocoa SCOOPÉ gift box tied with a biscuit-coloured ribbon'),
}
# tighter framing for the main view so the product fills the card (fov multiplier)
ZOOM = {'cookies-and-cream': 0.88, 'vanilla-family-tub': 0.86, 'chocolate-lovers-tub': 0.86, 'strawberry-collection': 0.86, 'berry-dream': 0.8, 'chocolate-obsession': 0.8, 'pistachio-indulgence': 0.8, 'the-sweet-box': 0.8, 'celebration-collection': 0.8, 'the-scoope-experience': 0.8}
STAGE = ['vanilla', 'chocolate', 'strawberry', 'caramel', 'cookies', 'pistachio']
os.makedirs(OUT, exist_ok=True)
def save(im, name, q=86): im.save(os.path.join(OUT, name), 'WEBP', quality=q, method=5); print('wrote', name, flush=True)
mode = sys.argv[1] if len(sys.argv) > 1 else 'all'
only = set(sys.argv[2].split(',')) if len(sys.argv) > 2 else None
meta = {}
t0 = time.time()
if mode in ('stage', 'all'):
    for f in STAGE:
        sc, eye, tgt, fov = cone_scene(f); out, a, sh, ss = render(sc, 600, 750, eye, tgt, fov, ss=2)
        save(finish_rgba(out, a, ss, 600, 750), f'stage-{f}.webp', 90); print(f, round(time.time() - t0), 's', flush=True)
if mode in ('products', 'all', 'main'):
    for slug, (fac, th, th2, floor, dy, alt) in P.items():
        meta[slug] = alt
        if only and slug not in only: continue
        sc, eye, tgt, fov = fac()
        out, a, sh, ss = render(sc, W, H, eye, tgt, fov * ZOOM.get(slug, 1.0), ss=SS, floor=floor)
        save(finish(out, a, sh, ss, W, H, THEMES[th], seed=3), f'product-{slug}.webp')
        if mode == 'main': continue
        sc, eye, tgt, fov = fac(); eye = eye * v3(0.8, 1.0, 1.0)
        out, a, sh, ss = render(sc, W, H, eye, tgt + v3(0, dy, 0), fov * (0.62 if dy > 1 else 0.74), ss=SS, floor=floor)
        save(finish(out, a, sh, ss, W, H, THEMES[th2], seed=5), f'product-{slug}-close.webp')
        print(slug, round(time.time() - t0), 's', flush=True)
json.dump(meta, open('/tmp/render_alts.json', 'w'))
print('ALL DONE', round(time.time() - t0), 's', flush=True)

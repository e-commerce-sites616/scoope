import sys, time; sys.path.insert(0, '.')
from scenes import *
from PIL import Image, ImageDraw
J = {
 'cone-caramel': (lambda: cone_scene('caramel'), 'warm'),
 'cup-cookies': (lambda: cup_scene(['cookies', 'vanilla']), 'blush'),
 'cone-pistachio': (lambda: cone_scene('pistachio'), 'pista'),
 'tub-vanilla': (lambda: tub_scene('vanilla'), 'warm'),
 'tub-choc': (lambda: tub_scene('chocolate'), 'peach'),
 'tub-straw': (lambda: tub_scene('strawberry'), 'blush'),
 'sundae-berry': (lambda: sundae_scene(['strawberry', 'vanilla', 'strawberry'], '#7A1F4B', cream=True), 'blush'),
 'sundae-choc': (lambda: sundae_scene(['chocolate', 'vanilla', 'chocolate'], '#2B160E', chunks=True), 'warm'),
 'sundae-pista': (lambda: sundae_scene(['pistachio', 'vanilla', 'pistachio'], None, nuts=True), 'pista'),
 'box-sweet': (lambda: box_scene('#DCA1A0', '#E8B7B5', '#783D45'), 'warm'),
 'box-cel': (lambda: box_scene('#783D45', '#8A4A53', '#DCA1A0'), 'blush'),
 'box-exp': (lambda: box_scene('#382822', '#46332B', '#D8BDA2'), 'warm'),
}
FL_Y = {'cup': -1.55, 'tub': -1.4, 'box': -1.5, 'sundae': -2.37}
W, H = int(sys.argv[2]) if len(sys.argv)>2 else 260, int(sys.argv[3]) if len(sys.argv)>3 else 325; names = [n for n in J if (sys.argv[1]=='all' or n.startswith(sys.argv[1]))]; cols = 6 if sys.argv[1]=='all' else 3
S = Image.new('RGB', (cols * W, ((len(names) + cols - 1) // cols) * (H + 16)), 'white'); d = ImageDraw.Draw(S)
t0 = time.time()
for i, n in enumerate(names):
    t1 = time.time(); sc, eye, tgt, fov = J[n][0](); out, a, sh, ss = render(sc, W, H, eye, tgt, fov, ss=1, floor=FL_Y.get(n.split('-')[0]))
    im = finish(out, a, sh, ss, W, H, THEMES[J[n][1]]); S.paste(im, ((i % cols) * W, (i // cols) * (H + 16) + 16)); d.text(((i % cols) * W + 4, (i // cols) * (H + 16) + 2), n, fill='black')
    print(n, round(time.time() - t1, 1), 's', flush=True)
S.save('/tmp/sheet.png' if sys.argv[1]=='all' else '/tmp/sheet_%s.png' % sys.argv[1]); print('total', round(time.time() - t0))

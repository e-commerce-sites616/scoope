import sys, time; sys.path.insert(0, '.')
from parts import *
t0 = time.time()
sc = Scene(); sc.bound = (v3(0, -0.9, 0), 3.6)
sc.add('cone', cone_sdf(0.0), cone_mat)
sc.add('scoop', scoop_sdf((0, 0.72, 0)), flavour_mat('strawberry'))
W, H = 420, 525
eye = v3(2.2, 1.6, 12.5); tgt = v3(0, -0.85, 0)
out, a, sh, ss = render(sc, W, H, eye, tgt, 27, ss=1, floor=None)
finish(out, a, sh, ss, W, H, ('#F3E9DB', '#E7D6C0')).save('/tmp/t_cone.png')
print('done', round(time.time() - t0, 1), 's')

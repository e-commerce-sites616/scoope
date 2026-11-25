import numpy as np
from parts import *

def rot(P, axis, deg):
    a = np.radians(deg); c, s = np.cos(a), np.sin(a); Q = P.copy()
    i, j = {'x': (1, 2), 'y': (2, 0), 'z': (0, 1)}[axis]
    Q[:, i] = c * P[:, i] - s * P[:, j]; Q[:, j] = s * P[:, i] + c * P[:, j]; return Q

def sauce(base, centre_y, colour, drop=0.55, freq=7, gloss=90):
    """wrap a material so the top of the scoop is coated in glossy sauce with drips"""
    col = hexc(colour)
    def m(P, n):
        M = base(P, n); th = np.arctan2(P[:, 2], P[:, 0])
        drip = np.clip(np.sin(th * freq + 1.3 * np.sin(th * 3.0)) * 0.5 + 0.5, 0, 1) ** 1.6
        edge = centre_y + 0.55 - drop * drip - 0.12 * np.sin(th * 2.0)
        mask = smooth(-0.025, 0.025, P[:, 1] - edge)
        M['albedo'] = M['albedo'] * (1 - mask[:, None]) + col[None] * mask[:, None]
        M['spec'] = M['spec'] * (1 - mask) + 0.9 * mask; M['gloss'] = np.where(mask > 0.5, gloss, M['gloss']); return M
    return m

def solid(hexcol, spec=0.2, gloss=30, sss=0.1, rim=0.08, speckle=0.0):
    c = hexc(hexcol)
    def m(P, n):
        a = np.tile(c, (P.shape[0], 1))
        if speckle: a = a * (1 + (vnoise(P * 30) - 0.5)[:, None] * speckle)
        return dict(albedo=a, spec=spec, gloss=gloss, sss=sss, rim=rim)
    return m

# ---------- scene builders: each returns (scene, eye, target, fov) ----------
def cone_scene(flavour, tilt=0.0, scoops=1, extra=None):
    sc = Scene(); sc.bound = (v3(0, -0.8, 0), 3.9)
    sc.add('cone', cone_sdf(0.0), cone_mat)
    for i in range(scoops):
        sc.add(f'scoop{i}', scoop_sdf((0, 0.72 + i * 1.45, 0), 1.0 if i == 0 else 0.95, skirt=(i == 0)), flavour_mat(flavour if i == 0 else extra or flavour))
    return sc, v3(2.2 + tilt, 1.2, 14.5), v3(0, -0.8 + (scoops - 1) * 0.7, 0), 24.5 + 8.5 * (scoops - 1)

def cup_scene(flavours, crumbs=None):
    sc = Scene(); sc.bound = (v3(0, -0.2, 0), 3.2)
    def cup(P):
        d = sd_cone_capped(P, -2.1, 2.1, 0.72, 1.0); return smin(d, sd_torus(P, v3(0, 0, 0), 0.99, 0.05), 0.04)
    def cmat(P, n):
        a = np.tile(hexc('#F6EFE3'), (P.shape[0], 1)); band = smooth(-1.45, -1.35, P[:, 1]) * smooth(-0.6, -0.7, P[:, 1])
        a = a * (1 - band[:, None]) + hexc('#783D45')[None] * band[:, None]; return dict(albedo=a, spec=0.25, gloss=40, sss=0.15, rim=0.08)
    sc.add('cup', cup, cmat)
    pos = [(-0.52, 0.58, 0.05), (0.52, 0.58, -0.05)] if len(flavours) > 1 else [(0, 0.6, 0)]
    for (x, y, z), f in zip(pos, flavours): sc.add('s' + f + str(x), scoop_sdf((x, y, z), 0.8 if len(flavours) > 1 else 1.0), flavour_mat(f))
    return sc, v3(2.5, 3.2, 12.2), v3(0, -0.45, 0), 27

def tub_scene(flavour, band='#783D45', topping=None):
    sc = Scene(); sc.bound = (v3(0, -0.3, 0), 3.5)
    def body(P):
        d = sd_cone_capped(P, -1.4, 1.4, 1.3, 1.46); d = smin(d, sd_torus(P, v3(0, 0, 0), 1.46, 0.07), 0.04)
        return smax(d, -sd_cyl(P, v3(0, 0.1, 0), 1.34, 0.45), 0.03)          # hollow top so the ice cream shows
    def bmat(P, n):
        a = np.tile(hexc('#F6EFE3'), (P.shape[0], 1)); b = smooth(-1.05, -0.95, P[:, 1]) * smooth(-0.35, -0.45, P[:, 1])
        a = a * (1 - b[:, None]) + hexc(band)[None] * b[:, None]
        return dict(albedo=a, spec=0.22, gloss=36, sss=0.15, rim=0.08)
    sc.add('tub', body, bmat)
    def dome(P):
        d = smax(sd_sphere(P, v3(0, -1.55, 0), 1.5), np.linalg.norm(P[:, [0, 2]], axis=1) - 1.33, 0.05)
        d = smax(d, -(P[:, 1] + 0.75), 0.05)                                  # only the part inside the open top
        return d - 0.03 * bump(P, 2.0) - 0.012 * np.sin(np.arctan2(P[:, 2], P[:, 0]) * 7 + np.linalg.norm(P[:, [0, 2]], axis=1) * 9)
    sc.add('dome', dome, flavour_mat(flavour))
    sc.add('scoop', scoop_sdf((0.1, 0.7, 0.05), 0.95), flavour_mat(flavour))
    return sc, v3(2.8, 4.4, 12.8), v3(0, -0.15, 0), 24

def sundae_scene(flavours, sauce_col, sauce_flav=None, chunks=False, cream=True, nuts=False):
    sc = Scene(); sc.bound = (v3(0, 0.2, 0), 3.8)
    def dish(P):
        bowl = smax(sd_sphere(P, v3(0, 0.1, 0), 1.42), P[:, 1] - 0.25, 0.03)
        stem = sd_cyl(P, v3(0, -1.75, 0), 0.17, 0.5, 0.02); foot = sd_cyl(P, v3(0, -2.3, 0), 0.8, 0.07, 0.05)
        d = smin(smin(bowl, stem, 0.25), foot, 0.2); return smin(d, sd_torus(P, v3(0, 0.25, 0), 1.385, 0.05), 0.03)
    def dmat(P, n):
        a = np.tile(hexc('#F6EFE3'), (P.shape[0], 1)); b = smooth(-0.05, 0.02, P[:, 1]) * smooth(0.32, 0.26, P[:, 1])
        a = a * (1 - b[:, None]) + hexc('#783D45')[None] * b[:, None]; return dict(albedo=a, spec=0.5, gloss=80, sss=0.1, rim=0.12)
    sc.add('dish', dish, dmat)
    f0, f1, f2 = (flavours + [flavours[-1]] * 3)[:3]
    sc.add('a', scoop_sdf((-0.72, 0.55, 0.1), 0.76, True), flavour_mat(f0))
    sc.add('b', scoop_sdf((0.72, 0.55, -0.05), 0.76, True), flavour_mat(f1))
    top = flavour_mat(f2)
    sc.add('c', scoop_sdf((0.0, 1.38, 0.0), 0.84, False), sauce(top, 1.38, sauce_col) if sauce_col else top)
    top_y = 2.0
    if cream:
        def swirl(P):
            d = sd_sphere(P, v3(0, 2.0, 0), 0.5)
            for k, (y, r) in enumerate([(2.32, 0.38), (2.58, 0.24)]): d = smin(d, sd_sphere(P, v3(0.03 * k, y, 0), r), 0.2)
            return d - 0.015 * np.sin(np.arctan2(P[:, 2], P[:, 0]) * 6 + P[:, 1] * 14)
        sc.add('cream', swirl, solid('#FBF6EC', 0.3, 40, 0.35)); top_y = 2.82
    def cherry(P): return sd_sphere(P, v3(0.0, top_y + 0.02, 0.0), 0.21)
    sc.add('cherry', cherry, solid('#A3162B', 0.9, 120, 0.1, 0.2))
    if chunks:
        for i, (x, y, z) in enumerate([(1.0, 0.25, 0.55), (-1.05, 0.28, 0.4), (0.15, 0.3, 1.05), (-0.3, 0.3, -1.0)]):
            sc.add(f'br{i}', (lambda P, x=x, y=y, z=z, i=i: sd_rbox(rot(P - v3(x, y, z), 'y', 20 + i * 30), v3(0, 0, 0), v3(0.2, 0.15, 0.2), 0.04)), solid('#3A2218', 0.3, 40, 0.1, 0.1, 0.6))
    if nuts:
        rng = np.random.default_rng(4)
        for i in range(9):
            a = rng.uniform(0, 6.28); r = rng.uniform(0.2, 0.7); y = 0
            sc.add(f'n{i}', (lambda P, a=a, r=r, y=y: sd_sphere(P * v3(1, 1.7, 1) - v3(r * np.cos(a), (1.38 + 0.84 * np.sqrt(max(0, 1 - (r / 0.84) ** 2)) * 0.95) * 1.7, r * np.sin(a)), v3(0, 0, 0), 0.075)), solid('#7C9A3E', 0.3, 30, 0.1))
    return sc, v3(2.6, 3.4, 12.8), v3(0, 0.25, 0), 33

def box_scene(body, lid, ribbon):
    sc = Scene(); sc.bound = (v3(0, -0.1, 0), 3.2)
    sc.add('body', lambda P: sd_rbox(P, v3(0, -0.6, 0), v3(1.5, 0.9, 1.5), 0.1), solid(body, 0.35, 50, 0.15, 0.1, 0.25))
    sc.add('lid', lambda P: sd_rbox(P, v3(0, 0.55, 0), v3(1.62, 0.3, 1.62), 0.1), solid(lid, 0.35, 50, 0.15, 0.1, 0.25))
    sc.add('r1', lambda P: sd_rbox(P, v3(0, -0.15, 0), v3(0.22, 1.2, 1.66), 0.04), solid(ribbon, 0.6, 70, 0.1, 0.15))
    sc.add('r2', lambda P: sd_rbox(P, v3(0, -0.15, 0), v3(1.66, 1.2, 0.22), 0.04), solid(ribbon, 0.6, 70, 0.1, 0.15))
    for sgn in (-1, 1):
        sc.add(f'bow{sgn}', (lambda P, s=sgn: sd_torus(rot(P - v3(0.5 * s, 1.15, 0), 'z', -s * 40), v3(0, 0, 0), 0.5, 0.13) * 0.9), solid(ribbon, 0.6, 70, 0.1, 0.15))
    sc.add('knot', lambda P: sd_sphere(P, v3(0, 1.0, 0), 0.22), solid(ribbon, 0.6, 70, 0.1, 0.15))
    return sc, v3(3.0, 4.2, 12.5), v3(0, 0.1, 0), 33

THEMES = {  # backdrop gradient (top, bottom)
 'warm': ('#F6EEE1', '#E8D8C2'), 'blush': ('#F8E6E3', '#EBC9C6'), 'pista': ('#EDF0DD', '#D6DDBF'),
 'wine': ('#8E5A61', '#6A333B'), 'cocoa': ('#5A4036', '#33231D'), 'peach': ('#FBE7D6', '#F0C9A8'),
}

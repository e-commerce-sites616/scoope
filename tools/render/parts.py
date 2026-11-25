import numpy as np
from core import *

# ---------- flavours: albedo(P) -> linear rgb ----------
FL = {
 'vanilla':  dict(base='#EFDDB0', alt='#F7EBCB', gloss=26, spec=0.18),
 'chocolate': dict(base='#4A2A1B', alt='#5E3624', gloss=48, spec=0.38),
 'strawberry': dict(base='#E9929A', alt='#F2B0B4', gloss=30, spec=0.22),
 'caramel': dict(base='#A96A32', alt='#C48544', gloss=40, spec=0.30),
 'cookies': dict(base='#ECE3D2', alt='#F6EFE1', gloss=26, spec=0.18),
 'pistachio': dict(base='#9DB267', alt='#B5C682', gloss=30, spec=0.20),
 'berry': dict(base='#8F4A86', alt='#A9629E', gloss=32, spec=0.24),
}
def flavour_albedo(name, P):
    f = FL[name]; b, a = hexc(f['base']), hexc(f['alt'])
    n1 = fbm(P * 2.6 + 3.1, 3); col = b[None] * (1 - n1[:, None]) + a[None] * n1[:, None]
    micro = (vnoise(P * 38) - 0.5)[:, None] * 0.10; col = col * (1 + micro)
    if name == 'vanilla':
        sp = smooth(0.80, 0.86, vnoise(P * 46 + 7)); col = col * (1 - sp[:, None] * 0.72) + hexc('#3B2616')[None] * sp[:, None] * 0.7
    elif name == 'chocolate':
        fl = smooth(0.74, 0.8, vnoise(P * 20 + 11)); col = col * (1 + fl[:, None] * 0.5)
    elif name == 'strawberry':
        bits = smooth(0.80, 0.84, vnoise(P * 21 + 5)); col = col * (1 - bits[:, None] * 0.8) + hexc('#B8323F')[None] * bits[:, None] * 0.8
    elif name == 'caramel':
        rib = 1 - smooth(0.0, 0.045, np.abs(fbm(P * 1.5 + 9, 2) - 0.5)); col = col * (1 - rib[:, None] * 0.45) + hexc('#8A4A1C')[None] * rib[:, None] * 0.45
        salt = smooth(0.84, 0.88, vnoise(P * 52 + 2)); col = col + salt[:, None] * 0.7
    elif name == 'cookies':
        ck = smooth(0.62, 0.68, fbm(P * 7.5 + 4, 2)) * smooth(0.45, 0.6, vnoise(P * 13)); col = col * (1 - ck[:, None] * 0.93) + hexc('#1F1512')[None] * ck[:, None] * 0.93
    elif name == 'pistachio':
        dk = smooth(0.70, 0.76, vnoise(P * 17 + 8)); lt = smooth(0.80, 0.85, vnoise(P * 24 + 3))
        col = col * (1 - dk[:, None] * 0.35) + hexc('#5E7A33')[None] * dk[:, None] * 0.35; col = col + lt[:, None] * hexc('#D8D49A')[None] * 0.35
    return np.clip(col, 0, 1.4)

def flavour_mat(name):
    f = FL[name]
    return lambda P, n: dict(albedo=flavour_albedo(name, P), spec=f['spec'], gloss=f['gloss'], sss=0.42, rim=0.10)

# ---------- shapes ----------
def sd_sphere(P, c, r): return np.linalg.norm(P - c, axis=1) - r
def sd_cone_capped(P, base_y, h, r_bot, r_top):
    """cone frustum along +y from base_y to base_y+h (iq capped cone, shifted)"""
    q = np.stack([np.linalg.norm(P[:, [0, 2]], axis=1), P[:, 1] - base_y - h / 2], 1)
    k1 = np.array([r_top, h / 2], F); k2 = np.array([r_top - r_bot, h], F)      # = 2 * half-height
    ca = np.stack([q[:, 0] - np.minimum(q[:, 0], np.where(q[:, 1] < 0, r_bot, r_top)), np.abs(q[:, 1]) - h / 2], 1)
    cb = q - k1 + k2 * clamp(((k1 - q) @ k2) / (k2 @ k2))[:, None]
    s = np.where((cb[:, 0] < 0) & (ca[:, 1] < 0), -1.0, 1.0).astype(F)
    return s * np.sqrt(np.minimum((ca ** 2).sum(1), (cb ** 2).sum(1)))
def sd_cyl(P, c, r, h, rr=0.0):
    d = np.stack([np.linalg.norm((P - c)[:, [0, 2]], axis=1) - r + rr, np.abs(P[:, 1] - c[1]) - h + rr], 1)
    return np.minimum(np.maximum(d[:, 0], d[:, 1]), 0) + np.linalg.norm(np.maximum(d, 0), axis=1) - rr
def sd_torus(P, c, R, r):
    q = P - c; return np.sqrt((np.linalg.norm(q[:, [0, 2]], axis=1) - R) ** 2 + q[:, 1] ** 2) - r
def sd_rbox(P, c, b, r):
    q = np.abs(P - c) - b + r; return np.linalg.norm(np.maximum(q, 0), axis=1) + np.minimum(np.max(q, axis=1), 0) - r

# ---------- waffle cone ----------
def waffle(P):
    th = np.arctan2(P[:, 2], P[:, 0]); y = P[:, 1]
    a = np.sin(th * 9 + y * 5.5); b = np.sin(th * 9 - y * 5.5)
    return 1 - np.minimum(smooth(0.0, 0.55, np.abs(a)), smooth(0.0, 0.55, np.abs(b)))   # 1 on the ridges (grid lines)
def cone_sdf(top_y=0.0, h=3.3, r_top=0.98):
    def f(P):
        d = sd_cone_capped(P, top_y - h + 0.12, h - 0.12, 0.13, r_top)
        d = smin(d, sd_sphere(P, v3(0, top_y - h + 0.15, 0), 0.14), 0.05)       # rounded tip the marcher can resolve
        return d - 0.028 * waffle(P) * smooth(0.5, 1.6, (P[:, 1] - (top_y - h)) + 0.4) - 0.006 * bump(P, 4)
    return f
def cone_mat(P, n):
    w = waffle(P); nz = fbm(P * 5 + 2, 2)
    base = hexc('#C98F4B')[None] * (1 - nz[:, None] * 0.35) + hexc('#E4B772')[None] * nz[:, None] * 0.35
    col = base * (0.62 + 0.55 * w[:, None]); edge = smooth(-0.1, 0.35, P[:, 1])[:, None]; col = col * (1 - 0.28 * edge)
    return dict(albedo=col, spec=0.10, gloss=12, sss=0.2, rim=0.05)

# ---------- scoop: sphere + ruffled skirt, scooped texture ----------
def scoop_sdf(c, r=1.0, skirt=True):
    c = np.asarray(c, F)
    def f(P):
        q = P - c
        ridge = 0.016 * np.sin(q[:, 1] * 15 + 2.4 * bump(P, 1.3)) * smooth(0.2, -0.8, q[:, 1])
        d = np.linalg.norm(q, axis=1) - r - 0.034 * bump(P, 1.15) - 0.010 * bump(P * 2.7 + 1.0) - ridge
        if skirt:
            th = np.arctan2(q[:, 2], q[:, 0]); R = r * 1.03 + 0.07 * np.sin(th * 13 + 3 * bump(P, 0.9)) + 0.03 * np.sin(th * 29)
            ring = np.sqrt((np.linalg.norm(q[:, [0, 2]], axis=1) - R) ** 2 + (q[:, 1] + r * 0.62) ** 2) - r * 0.2
            d = smin(d, ring, 0.18)
        return d
    return f

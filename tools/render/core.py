"""Tiny software raymarcher used to render the SCOOPÉ product images (dev tool, not part of the site runtime).
Signed-distance-field scenes, soft shadows, ambient occlusion, wrapped diffuse (fake subsurface), numpy only."""
import numpy as np
from scipy.ndimage import gaussian_filter
from PIL import Image

F = np.float32
def v3(*a): return np.array(a, dtype=F)
def norm(a): return a / np.maximum(np.linalg.norm(a, axis=-1, keepdims=True), 1e-8)
def srgb2lin(c): return np.power(np.asarray(c, dtype=F), 2.2)
def hexc(h): return srgb2lin([int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)])
def smin(a, b, k):
    h = np.maximum(k - np.abs(a - b), 0) / k
    return np.minimum(a, b) - h * h * k * 0.25
def smax(a, b, k): return -smin(-a, -b, k)
def clamp(x, a=0, b=1): return np.clip(x, a, b)
def smooth(a, b, x): t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t)

# ---- cheap trig noise for geometry (fast) ----
def bump(P, s=1.0):
    x, y, z = P[:, 0] * s, P[:, 1] * s, P[:, 2] * s
    return (np.sin(2.1 * x + 1.3 * y) * np.sin(1.7 * y - 2.3 * z) + np.sin(3.7 * z + 0.9 * x) * np.sin(2.9 * x + 3.1 * y + 1.1 * z)) * 0.5 \
        + 0.5 * np.sin(5.3 * x + 4.1 * z) * np.sin(4.7 * y - 3.9 * x + 2.0 * z)

# ---- hash value noise for albedo (only evaluated at hit points) ----
def _h(ix, iy, iz):
    h = (ix * 374761393 + iy * 668265263 + iz * 1442695041) & 0xFFFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((h ^ (h >> 16)) & 0xFFFF).astype(F) / 65535.0
def vnoise(P):
    i = np.floor(P); f = (P - i).astype(F); u = f * f * (3 - 2 * f); i = i.astype(np.int64)
    ix, iy, iz = i[:, 0], i[:, 1], i[:, 2]
    def c(dx, dy, dz): return _h(ix + dx, iy + dy, iz + dz)
    x00 = c(0, 0, 0) * (1 - u[:, 0]) + c(1, 0, 0) * u[:, 0]; x10 = c(0, 1, 0) * (1 - u[:, 0]) + c(1, 1, 0) * u[:, 0]
    x01 = c(0, 0, 1) * (1 - u[:, 0]) + c(1, 0, 1) * u[:, 0]; x11 = c(0, 1, 1) * (1 - u[:, 0]) + c(1, 1, 1) * u[:, 0]
    return (x00 * (1 - u[:, 1]) + x10 * u[:, 1]) * (1 - u[:, 2]) + (x01 * (1 - u[:, 1]) + x11 * u[:, 1]) * u[:, 2]
def fbm(P, o=3):
    s, a, t = 1.0, 0.5, 0
    for _ in range(o): t = t + a * vnoise(P * s); s *= 2.03; a *= 0.5
    return t / (1 - 0.5 ** o)

class Scene:
    """objects: list of (name, sdf(P)->d, material(P, n)->dict(albedo, spec, rough, gloss, sss))"""
    def __init__(self): self.objs = []; self.bound = (v3(0, 0, 0), 4.0)
    def add(self, name, sdf, mat): self.objs.append((name, sdf, mat))
    def dist(self, P):
        d = self.objs[0][1](P)
        for _, f, _m in self.objs[1:]: d = np.minimum(d, f(P))
        return d
    def which(self, P):
        ds = np.stack([f(P) for _, f, _m in self.objs]); return np.argmin(ds, axis=0)

def camera(W, H, eye, target, fov_deg):
    fwd = norm(target - eye); right = norm(np.cross(fwd, v3(0, 1, 0))); up = np.cross(right, fwd)
    t = np.tan(np.radians(fov_deg) / 2); ys, xs = np.mgrid[0:H, 0:W].astype(F)
    u = (xs + 0.5) / W * 2 - 1; v = 1 - (ys + 0.5) / H * 2
    d = fwd[None, None, :] + u[..., None] * (W / H) * t * right + v[..., None] * t * up
    return norm(d.reshape(-1, 3)), eye

def march(sc, ro, rd, tmin, tmax, steps=90):
    N = rd.shape[0]; t = np.full(N, tmin, F); hit = np.zeros(N, bool); act = np.arange(N)
    for _ in range(steps):
        if act.size == 0: break
        P = ro + rd[act] * t[act, None]; d = sc.dist(P)
        h = d < 0.0015 * t[act]; hit[act[h]] = True
        t[act] += d * 0.8
        keep = (~h) & (t[act] < tmax); act = act[keep]
    return t, hit

def softshadow(sc, P, L, k=10, steps=26, tmax=7.0):
    res = np.ones(P.shape[0], F); t = np.full(P.shape[0], 0.06, F); act = np.arange(P.shape[0])
    for _ in range(steps):
        if act.size == 0: break
        d = sc.dist(P[act] + L * t[act, None]); res[act] = np.minimum(res[act], k * d / t[act])
        t[act] += clamp(d, 0.03, 0.6); act = act[(t[act] < tmax) & (res[act] > 0.001)]
    return clamp(res)

def ao(sc, P, n):
    occ = np.zeros(P.shape[0], F)
    for i, h in enumerate((0.05, 0.12, 0.25, 0.45, 0.8)): occ += (h - sc.dist(P + n * h)) * (0.55 ** i)
    return clamp(1 - 1.4 * occ)

def normal(sc, P, e=0.003):
    k = np.array([[1, -1, -1], [-1, -1, 1], [-1, 1, -1], [1, 1, 1]], F)
    return norm(sum(k[i] * sc.dist(P + k[i] * e)[:, None] for i in range(4)))

KEY = norm(v3(-0.55, 0.85, 0.65)); FILL = norm(v3(0.85, 0.15, 0.5)); RIM = norm(v3(0.35, 0.45, -0.85))

def shade(sc, P, n, rd, ground=None):
    idx = sc.which(P); N = P.shape[0]; col = np.zeros((N, 3), F)
    sh = softshadow(sc, P + n * 0.01, KEY); occ = ao(sc, P, n)
    V = -rd
    for i, (_, _f, mat) in enumerate(sc.objs):
        m = idx == i
        if not m.any(): continue
        M = mat(P[m], n[m]); a = M['albedo']; nn = n[m]; vv = V[m]
        w = M.get('sss', 0.3)
        kd = clamp((nn @ KEY + w) / (1 + w)); kd = kd * (0.25 + 0.75 * sh[m])
        kf = clamp((nn @ FILL + w) / (1 + w)); kr = clamp(nn @ RIM)
        amb = (0.55 + 0.45 * (nn[:, 1:2] * 0.5 + 0.5)) * occ[m][:, None] * 0.42
        lit = (kd[:, None] * v3(1.0, 0.93, 0.84) * 1.15 + kf[:, None] * v3(0.34, 0.40, 0.52) * 0.55 + kr[:, None] * v3(0.5, 0.5, 0.55) * 0.35 + amb)
        c = a * lit + (a ** 2) * (clamp(w) * 0.55) * (kd + 0.3)[:, None]          # colour bleed under the surface
        hv = norm(KEY + vv); sp = np.power(clamp((nn * hv).sum(1)), M.get('gloss', 30)) * M.get('spec', 0.25) * (0.2 + 0.8 * sh[m])
        fr = np.power(1 - clamp((nn * vv).sum(1)), 3) * M.get('rim', 0.12) * occ[m]
        hr = norm(RIM + vv); sp += np.power(clamp((nn * hr).sum(1)), M.get('gloss', 30) * 0.7) * M.get('spec', 0.25) * 0.4
        col[m] = c + (sp + fr)[:, None] * v3(1, 0.97, 0.93)
    return col

def tonemap(c):
    c = c * 1.05; c = c / (1 + 0.18 * c); return np.power(clamp(c), 1 / 2.2)

def render(sc, W, H, eye, target, fov, ss=2, floor=None, bg=('#F3E9DB', '#E7D6C0')):
    """returns (rgba float image in sRGB 0-1, shape H,W,4). floor: y of an invisible shadow-catching plane or None"""
    w, h = int(round(W * ss)), int(round(H * ss))
    rd, ro = camera(w, h, eye, target, fov)
    c0, R = sc.bound
    oc = ro - c0; b = rd @ oc; c = oc @ oc - R * R; disc = b * b - c
    cand = disc > 0; sq = np.sqrt(np.maximum(disc, 0)); tmin = np.where(cand, -b - sq, 0).astype(F); tmax = np.where(cand, -b + sq, 0).astype(F)
    img = np.zeros((h * w, 3), F); alpha = np.zeros(h * w, F)
    ids_all = np.nonzero(cand)[0]
    CH = 90_000                                          # rays per chunk: bounds peak memory
    for k in range(0, ids_all.size, CH):
        ids = ids_all[k:k + CH]; rds = rd[ids]
        tt, hh = march(sc, ro, rds, tmin[ids].min(), tmax[ids].max())
        if not hh.any(): continue
        P = ro + rds[hh] * tt[hh, None]; n = normal(sc, P)
        col = shade(sc, P, n, rds[hh])
        sel = ids[hh]; img[sel] = col; alpha[sel] = 1
    img = img.reshape(h, w, 3); alpha = alpha.reshape(h, w)
    # shadow-catcher floor (soft contact shadow), no horizon
    shadow = np.zeros((h, w), F)
    if floor is not None:
        miss = np.nonzero((alpha.reshape(-1) == 0) & (rd[:, 1] < -1e-3))[0]
        tf = (floor - ro[1]) / rd[miss, 1]; ok = tf > 0; miss = miss[ok]; tf = tf[ok]
        for k in range(0, miss.size, CH):
            m_ = miss[k:k + CH]; t_ = tf[k:k + CH]
            Pf = ro + rd[m_] * t_[:, None]
            d = np.linalg.norm(Pf[:, [0, 2]] - c0[[0, 2]], axis=1)
            sh = softshadow(sc, Pf + v3(0, 0.02, 0), KEY, k=6, steps=30, tmax=9.0)
            contact = np.exp(-np.maximum(sc.dist(Pf), 0) * 2.6) * 0.55
            shadow.reshape(-1)[m_] = clamp((1 - sh) * 0.55 + contact) * smooth(7.0, 2.0, d)
    out = tonemap(img)
    return out.reshape(h, w, 3), alpha, shadow, ss

def finish(out, alpha, shadow, ss, W, H, bg, grain=0.012, seed=1):
    """composite on a backdrop gradient with the baked shadow, downsample, add a little bloom + grain"""
    rng = np.random.default_rng(seed)
    h, w = alpha.shape
    ys = np.linspace(0, 1, h, dtype=F)[:, None]; xs = np.linspace(-1, 1, w, dtype=F)[None, :]
    top, bot = hexc(bg[0]) ** (1 / 2.2), hexc(bg[1]) ** (1 / 2.2)
    base = top[None, None, :] * (1 - ys[..., None]) + bot[None, None, :] * ys[..., None]
    vig = 1 - 0.10 * (xs ** 2 + (ys - 0.5) ** 2 * 1.2); base = base * vig[..., None]
    base = base * (1 - shadow[..., None] * 0.42)
    a = alpha[..., None]
    comp = out * a + base * (1 - a)
    im = Image.fromarray((clamp(comp) * 255).astype(np.uint8)).resize((W, H), Image.LANCZOS)
    arr = np.asarray(im).astype(F) / 255
    glow = gaussian_filter(np.maximum(arr - 0.82, 0), sigma=(W / 55, W / 55, 0)); arr = arr + glow * 0.55
    arr = arr + rng.normal(0, grain, arr.shape).astype(F)
    return Image.fromarray((clamp(arr) * 255).astype(np.uint8))

def finish_rgba(out, alpha, ss, W, H):
    h, w = alpha.shape
    rgb = Image.fromarray((clamp(out) * 255).astype(np.uint8)).resize((W, H), Image.LANCZOS)
    a = Image.fromarray((alpha * 255).astype(np.uint8)).resize((W, H), Image.LANCZOS)
    rgb.putalpha(a); return rgb

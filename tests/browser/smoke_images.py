# Optional browser test for the rendered imagery: flavour-wheel crossfade, product gallery, shop grid.
# NOT a project dependency: needs `pip install playwright && playwright install chromium`.
import subprocess, time, os, shutil, tempfile
from playwright.sync_api import sync_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
DATA = os.path.join(tempfile.gettempdir(), 'scoope-smoke-img'); shutil.rmtree(DATA, ignore_errors=True)
srv = subprocess.Popen(['node', 'src/server/index.js'], cwd=ROOT, env=dict(os.environ, PORT='3590', DATA_DIR=DATA), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.8); B = 'http://127.0.0.1:3590'; res = []; errs = []
def ok(n, c, x=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + (' ' + str(x) if x != '' else ''))
try:
  with sync_playwright() as p:
    br = p.chromium.launch(); pg = br.new_page(viewport={'width': 1280, 'height': 800})
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None); pg.on('pageerror', lambda e: errs.append(str(e)))
    # ---- flavour wheel stage
    pg.goto(B + '/'); pg.evaluate("document.querySelector('.flavours').scrollIntoView({behavior:'instant'})"); pg.wait_for_timeout(1800)
    ok('6 stage renders loaded', pg.evaluate("[...document.querySelectorAll('.stage img')].every(i=>i.complete&&i.naturalWidth>0)"))
    names = ['Vanilla Bean', 'Belgian Chocolate', 'Strawberry Bliss', 'Salted Caramel', 'Cookies & Cream', 'Pistachio Dream']
    keys = ['vanilla', 'chocolate', 'strawberry', 'caramel', 'cookies', 'pistachio']
    for i, k in enumerate(keys):
        pg.hover(f'.flavour-list li:nth-child({i+1}) a'); pg.wait_for_timeout(250)
        on = pg.evaluate("[...document.querySelectorAll('.stage img.is-on')].map(i=>i.dataset.stage)")
        ok(f'hover {names[i]} shows only the {k} scoop', on == [k] and pg.inner_text('[data-flavour-name]') == names[i], on)
    same = pg.evaluate("(()=>{const r=[...document.querySelectorAll('.stage img')];return r.every(x=>x.offsetLeft===r[0].offsetLeft&&x.offsetTop===r[0].offsetTop&&x.offsetWidth===r[0].offsetWidth&&x.offsetHeight===r[0].offsetHeight)})()")
    ok('every scoop image sits in exactly the same place (the cone never moves)', same)
    pg.hover('.flavour-list li:nth-child(3) a'); pg.wait_for_timeout(700); pg.screenshot(path='/tmp/i-stage.png')
    # ---- shop grid: every product has a real image
    pg.goto(B + '/shop'); pg.wait_for_selector('.card')
    for y in range(0, 4200, 500): pg.evaluate(f"window.scrollTo({{top:{y},behavior:'instant'}})"); pg.wait_for_timeout(250)
    pg.wait_for_timeout(1200)
    n = pg.evaluate("document.querySelectorAll('.card img.is-loaded').length")
    ok('all 20 shop cards show a real image', n == 20, n)
    pg.evaluate("window.scrollTo({top:0,behavior:'instant'})"); pg.wait_for_timeout(500); pg.screenshot(path='/tmp/i-shop.png')
    # ---- product gallery with a real close-up
    pg.goto(B + '/product/berry-dream'); pg.wait_for_selector('.gallery__main img.is-loaded'); pg.wait_for_timeout(400)
    ok('rendered product shows 2 gallery views', pg.locator('.thumb').count() == 2, pg.locator('.thumb').count())
    a = pg.get_attribute('.gallery__main img', 'src'); pg.click('.thumb:nth-child(2)'); pg.wait_for_timeout(800)
    b = pg.get_attribute('.gallery__main img', 'src')
    ok('second view swaps in the close-up render', a.endswith('product-berry-dream.webp') and b.endswith('product-berry-dream-close.webp'), (a, b))
    ok('pressed state follows the view', pg.get_attribute('.thumb:nth-child(2)', 'aria-pressed') == 'true' and pg.get_attribute('.thumb:nth-child(1)', 'aria-pressed') == 'false')
    ok('close-up image actually loaded', pg.evaluate("document.querySelector('.gallery__main img').naturalWidth>0"))
    pg.screenshot(path='/tmp/i-pdp.png')
    pg.goto(B + '/product/vanilla-bean'); pg.wait_for_selector('.gallery__main img.is-loaded'); pg.wait_for_timeout(300)
    ok('photo-only product hides the pointless thumbnails', pg.evaluate("getComputedStyle(document.querySelector('.gallery__thumbs')).display") == 'none')
    pg.goto(B + '/product/the-sweet-box'); pg.wait_for_selector('.gallery__main img.is-loaded'); ok('gift box shows its render', pg.evaluate("document.querySelector('.gallery__main img').naturalWidth>0"))
    # ---- cart thumbnail uses the new image
    pg.click('.buy__add'); pg.wait_for_selector('.drawer.is-open .cline img.is-loaded', timeout=5000); ok('cart drawer thumbnail uses the render', True)
    # ---- mobile
    m = br.new_page(viewport={'width': 390, 'height': 844}); m.goto(B + '/'); m.wait_for_timeout(800)
    ok('no horizontal overflow on mobile home', m.evaluate("document.documentElement.scrollWidth<=innerWidth"))
    m.goto(B + '/product/berry-dream'); m.wait_for_selector('.gallery__main img.is-loaded'); ok('no overflow on mobile product page', m.evaluate("document.documentElement.scrollWidth<=innerWidth"))
    br.close()
finally: srv.terminate()
bad = [e for e in errs if 'fonts/' not in e]
print('console errors:', bad[:5]); print(f'{sum(res)}/{len(res)} passed')

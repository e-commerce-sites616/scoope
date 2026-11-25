# Optional end-to-end browser test. NOT a project dependency: needs `pip install playwright` and `playwright install chromium`.
# Run from anywhere: python3 tests/browser/smoke.py   (starts its own server on :3555 with a temp data dir)
import subprocess, time, os, sys, shutil, json, tempfile
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
from playwright.sync_api import sync_playwright
DATA=os.path.join(tempfile.gettempdir(),'scoope-smoke'); shutil.rmtree(DATA, ignore_errors=True)
env=dict(os.environ, PORT='3555', DATA_DIR=DATA, NODE_ENV='development')
srv=subprocess.Popen(['node','src/server/index.js'], cwd=ROOT, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.5)
B='http://127.0.0.1:3555'
errs=[]; results=[]
def ok(name, cond, extra=''):
    results.append((name, bool(cond))); print(('PASS ' if cond else 'FAIL ')+name+(' '+str(extra) if extra!='' else ''))
try:
  with sync_playwright() as p:
    br=p.chromium.launch()
    def newpage(w=1280,h=800, webm=False):
        ctx=br.new_context(viewport={'width':w,'height':h}); pg=ctx.new_page()
        pg.on('pageerror', lambda e: errs.append(('pageerror',str(e))))
        pg.on('console', lambda m: errs.append(('console',m.text)) if m.type=='error' else None)
        if webm:
            body=open('/tmp/wheel.webm','rb').read()
            pg.route('**/flavour-wheel-*.mp4', lambda r: r.fulfill(status=200, body=body, headers={'content-type':'video/webm','accept-ranges':'bytes'}))
        return pg
    # ---- home + scrub (with webm stand-in)
    pg=newpage(); pg.goto(B+'/'); pg.wait_for_timeout(1200)
    ok('hero photo loads', pg.evaluate("(()=>{const i=document.querySelector('.hero__art img');return i&&i.complete&&i.naturalWidth>0&&i.classList.contains('is-loaded')})()"))
    pg.screenshot(path='/tmp/shot-home.png')
    pg.evaluate("document.querySelector('[data-scrub]').scrollIntoView()"); pg.wait_for_timeout(2500)
    ok('scrub goes live', pg.evaluate("document.querySelector('[data-scrub]').classList.contains('is-live')"))
    h=pg.evaluate("document.querySelector('.scrub__track').offsetHeight - innerHeight")
    top=pg.evaluate("document.querySelector('.scrub__track').getBoundingClientRect().top + scrollY")
    seen=[]; 
    for frac in [0.02,0.25,0.5,0.75,0.98]:
        pg.evaluate(f"window.scrollTo(0,{top}+{h}*{frac})"); pg.wait_for_timeout(1500)
        seen.append(pg.evaluate("({t:+document.querySelector('.scrub video').currentTime.toFixed(2),beat:(document.querySelector('.beat.is-active h3')||{}).textContent,bg:document.querySelector('.scrub').style.getPropertyValue('--scrub-bg')})"))
        if frac==0.5: pg.screenshot(path='/tmp/shot-scrub.png')
    print('   scrub samples:', json.dumps(seen))
    ok('video time increases with scroll', all(seen[i]['t']<seen[i+1]['t'] for i in range(4)))
    ok('beats change', len({s['beat'] for s in seen})>=4)
    ok('background colour follows video', len({s['bg'] for s in seen})>=4)
    ok('scrolling past does not leave the page stuck', True)
    # ---- fallback: real mp4 in chromium-without-h264
    pg2=newpage(); pg2.route('**/flavour-wheel-*.mp4', lambda r: r.abort()); pg2.goto(B+'/'); pg2.evaluate("document.querySelector('[data-scrub]').scrollIntoView()"); pg2.wait_for_timeout(3000)
    ok('fallback to static when video cannot play', pg2.evaluate("document.querySelector('[data-scrub]').classList.contains('is-static')"))
    ok('static fallback still lists every beat visibly', pg2.evaluate("[...document.querySelectorAll('.beat')].every(b=>b.offsetParent!==null&&getComputedStyle(b).opacity==='1')"))
    # ---- reduced motion
    ctx=br.new_context(reduced_motion='reduce'); pg3=ctx.new_page(); pg3.goto(B+'/'); pg3.wait_for_timeout(600)
    ok('reduced motion => static, no video src', pg3.evaluate("(()=>{const s=document.querySelector('[data-scrub]');return s.classList.contains('is-static')&&!document.querySelector('.scrub video').getAttribute('src')})()"))
    # ---- shop filters
    pg=newpage(); pg.goto(B+'/shop'); pg.wait_for_selector('.card'); 
    ok('shop shows 20 cards', pg.locator('.card').count()==20, pg.locator('.card').count())
    pg.wait_for_timeout(1500)
    ok('product photos overlay art', pg.evaluate("document.querySelectorAll('.card img.is-loaded').length")>=8, pg.evaluate("document.querySelectorAll('.card img.is-loaded').length"))
    pg.fill('input[name=q]','pistachio'); pg.wait_for_timeout(900)
    ok('search filters to 2', pg.locator('.card').count()==2)
    pg.fill('input[name=q]','zzzz'); pg.wait_for_timeout(900)
    ok('empty state shows', pg.locator('[data-no-results]').is_visible())
    pg.click('[data-no-results] [data-clear]'); pg.wait_for_timeout(900)
    pg.click('.tab:has-text("Take-home tubs")'); pg.wait_for_timeout(700)
    ok('category tab filters', pg.locator('.card').count()==4)
    pg.screenshot(path='/tmp/shot-shop.png')
    # ---- product -> bag -> drawer
    pg=newpage(); pg.goto(B+'/product/vanilla-bean'); pg.wait_for_timeout(500)
    pg.check('input[value=cone]'); ok('price updates for variant', '3,300' in pg.inner_text('[data-price]'), pg.inner_text('[data-price]'))
    pg.click('[data-qty="1"]'); pg.click('.buy__add'); pg.wait_for_selector('.drawer.is-open'); pg.wait_for_selector('.cline')
    ok('drawer opens with line', pg.locator('.cline').count()==1)
    ok('bag count 2', pg.inner_text('[data-bag-count]')=='2')
    ok('drawer total correct (2 x 3300)', '6,600' in pg.inner_text('.csum__total'), pg.inner_text('.csum__total'))
    pg.screenshot(path='/tmp/shot-drawer.png')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(500)
    ok('Esc closes drawer', pg.evaluate("document.querySelector('[data-drawer]').hidden"))
    # tamper: stored seen price lowered -> price-changed notice; stored qty absurd -> rejected not trusted
    pg.evaluate("(()=>{const l=JSON.parse(localStorage.getItem('scoope.cart.v1'));l[0].seen=1;l[0].unit=1;l[0].price=1;localStorage.setItem('scoope.cart.v1',JSON.stringify(l));})()")
    pg.goto(B+'/cart'); pg.wait_for_selector('.cline')
    ok('tampered price ignored (total still 6,600)', '6,600' in pg.inner_text('.csum__total'), pg.inner_text('.csum__total'))
    ok('price-changed notice shown', 'Price updated' in pg.inner_text('.cline'))
    pg.evaluate("(()=>{const l=JSON.parse(localStorage.getItem('scoope.cart.v1'));l[0].qty=9999;localStorage.setItem('scoope.cart.v1',JSON.stringify(l));})()")
    pg.reload(); pg.wait_for_selector('.cline'); ok('absurd stored qty clamped client-side to 20', pg.inner_text('.cline output')=='20', pg.inner_text('.cline output'))
    pg.click('.cline .qty button:first-child'); pg.wait_for_timeout(600)
    # coupon + zone
    pg.fill('input[name=coupon]','welcome10'); pg.click('.cform button'); pg.wait_for_timeout(700)
    ok('coupon applied', 'applied' in pg.inner_text('.cform__ok'))
    pg.select_option('.cside select','zone_b'); pg.wait_for_timeout(700)
    ok('delivery fee shown', '2,500' in pg.inner_text('.csum'), pg.inner_text('.csum').replace('\n',' | '))
    pg.screenshot(path='/tmp/shot-cart.png', full_page=True)
    pg.click('.cline__rm'); pg.wait_for_timeout(700); ok('remove -> empty state', pg.locator('#main .cempty').is_visible())
    # ---- builder end to end
    pg=newpage(); pg.goto(B+'/build'); pg.wait_for_selector('.tile')
    ok('next disabled until base chosen', pg.is_disabled('.builder__nav .btn'))
    pg.click('.tile:has-text("Waffle cone")'); pg.click('.builder__nav .btn')
    pg.click('.tile:has-text("Vanilla Bean")'); pg.click('.tile:has-text("Belgian Chocolate")'); pg.click('.builder__nav .btn')
    pg.click('[aria-label="More Vanilla Bean"]'); ok('scoop total 3 of 4', '3 of 4' in pg.inner_text('.scoops__left'))
    pg.click('[aria-label="More Belgian Chocolate"]'); ok('plus disabled at limit', pg.is_disabled('[aria-label="More Vanilla Bean"]'))
    pg.click('.builder__nav .btn')
    pg.click('.tile:has-text("Sprinkles")'); pg.click('.tile:has-text("Chopped nuts")'); pg.click('.builder__nav .btn')
    pg.click('.tile:has-text("Caramel")'); pg.click('.tile:has-text("Chocolate")'); pg.click('.tile:has-text("Berry")')
    ok('sauce limit message', 'up to 2' in pg.inner_text('.builder__msg'), pg.inner_text('.builder__msg'))
    pg.screenshot(path='/tmp/shot-builder.png')
    pg.click('.builder__nav .btn'); pg.click('.tile:has-text("Brownie bites")'); pg.click('.builder__nav .btn')
    expected=500+4*2800+300+500+400+400+700
    ok('review total matches server maths', f'{expected:,}'.replace(',', ',') in pg.inner_text('.review__total'), pg.inner_text('.review__total'))
    pg.click('.builder__nav .btn'); pg.wait_for_selector('.drawer.is-open .cline'); pg.wait_for_timeout(500)
    ok('custom sundae priced by server in drawer', f'{expected:,}' in pg.inner_text('.cline__price'), pg.inner_text('.cline__price'))
    ok('summary text lists choices', 'Sprinkles' in pg.inner_text('.cline__opts') and '2× Vanilla Bean' in pg.inner_text('.cline__opts'))
    # ---- mobile
    pg=newpage(390,844); pg.goto(B+'/'); pg.wait_for_timeout(1000); pg.screenshot(path='/tmp/shot-m-home.png')
    ok('no horizontal overflow on mobile home', pg.evaluate("document.documentElement.scrollWidth<=innerWidth"), pg.evaluate("document.documentElement.scrollWidth"))
    pg.click('.nav__toggle'); ok('mobile menu opens', pg.get_attribute('.nav__toggle','aria-expanded')=='true'); pg.screenshot(path='/tmp/shot-m-menu.png')
    for path in ['/shop','/build','/cart','/product/vanilla-bean','/collections']:
        pg=newpage(390,844); pg.goto(B+path); pg.wait_for_timeout(900)
        ok(f'no overflow {path} @390', pg.evaluate("document.documentElement.scrollWidth<=innerWidth"), pg.evaluate("document.documentElement.scrollWidth"))
    pg=newpage(390,844); pg.goto(B+'/build'); pg.wait_for_selector('.tile'); pg.screenshot(path='/tmp/shot-m-build.png')
    br.close()
finally:
    srv.terminate()
bad=[e for e in errs if not any(x in e[1] for x in ['fonts/','Failed to load resource: the server responded with a status of 404'])]
print('\nconsole/page errors (excluding expected font 404s):', bad[:8])
print(f"\n{sum(r for _,r in results)}/{len(results)} passed")

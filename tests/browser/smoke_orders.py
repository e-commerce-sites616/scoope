# Optional end-to-end browser test for accounts, checkout, payment, tracking, rewards, gifts, reviews, motion.
# NOT a project dependency: needs `pip install playwright` and `playwright install chromium`.
# Run: python3 tests/browser/smoke_orders.py   (starts its own server on :3560 with a temp data dir)
import subprocess, time, os, shutil, tempfile
from playwright.sync_api import sync_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
DATA = os.path.join(tempfile.gettempdir(), 'scoope-smoke5'); shutil.rmtree(DATA, ignore_errors=True)
env = dict(os.environ, PORT='3560', DATA_DIR=DATA, NODE_ENV='development', DEMO_ORDER_PACE_SECONDS='3')
srv = subprocess.Popen(['node', 'src/server/index.js'], cwd=ROOT, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.5)
B = 'http://127.0.0.1:3560'
errs = []; results = []
def ok(name, cond, extra=''):
    results.append(bool(cond)); print(('PASS ' if cond else 'FAIL ') + name + (' ' + str(extra) if extra != '' else ''))
def fill_checkout(pg, name='Ada Obi', email='ada@example.com', area='Yaba'):
    pg.fill('input[name=name]', name); pg.fill('input[name=email]', email); pg.fill('input[name=phone]', '0801 234 5678')
    pg.select_option('select[name=area]', area); pg.fill('input[name=line1]', '12 Test Street, Yaba')
try:
  with sync_playwright() as p:
    br = p.chromium.launch()
    def newpage(w=1280, h=800, **kw):
        ctx = br.new_context(viewport={'width': w, 'height': h}, **kw); pg = ctx.new_page()
        pg.on('pageerror', lambda e: errs.append(('pageerror', str(e))))
        pg.on('console', lambda m: errs.append(('console', m.text)) if m.type == 'error' else None)
        return pg
    # ---------- guest: bag -> checkout -> failed pay -> success -> track -> cancel is blocked after prep
    g = newpage(); g.goto(B + '/product/belgian-chocolate'); g.wait_for_selector('.buy__add')
    g.click('[data-qty="1"]'); g.click('.buy__add'); g.wait_for_selector('.drawer.is-open .cline'); g.wait_for_timeout(500)
    g.click('.csum__go'); g.wait_for_url('**/checkout'); g.wait_for_selector('.cform2')
    ok('checkout shows the demo banner', 'No real money is collected' in g.inner_text('.demo-banner'))
    ok('place order disabled until an area is chosen', g.is_disabled('button[type=submit].csum__go'))
    fill_checkout(g); g.wait_for_timeout(700)
    ok('delivery fee appears from area (Zone B)', '2,500' in g.inner_text('.csum'), g.inner_text('.csum').replace('\n', ' | '))
    ok('total = 2 x 3,200 + 2,500', '8,900' in g.inner_text('.csum__total'), g.inner_text('.csum__total'))
    g.click('button[type=submit].csum__go'); g.wait_for_url('**/pay/**'); g.wait_for_selector('.paybox')
    ok('bag emptied after order placed', g.inner_text('[data-bag-count]') == '0')
    ok('pay page labelled as demonstration', 'No real payment is collected' in g.inner_text('.demo-banner'))
    ok('hold countdown shown', 'held for' in g.inner_text('.paybox__clock'))
    g.click('text=Simulate a declined payment'); g.wait_for_timeout(800)
    ok('declined payment shows message + attempts', 'declined' in g.inner_text('.form__msg') and '4 attempts' in g.inner_text('.form__msg'), g.inner_text('.form__msg'))
    g.click('text=Simulate successful payment'); g.wait_for_url('**/track/**'); g.wait_for_selector('.timeline')
    ok('success animation present', g.locator('.trk__win svg').count() == 1)
    ok('status shows payment confirmed', 'Payment confirmed' in g.inner_text('.chip') or 'confirmed' in g.inner_text('.chip').lower(), g.inner_text('.chip'))
    ok('timeline has all 7 steps', g.locator('.timeline li').count() == 7)
    ok('track page tells guest to keep the link', 'Keep this page link' in g.inner_text('.trk__main'))
    track_url = g.url
    # other browser context (no cookies) can open by token but NOT by reference
    other = newpage(); other.goto(track_url.split('?')[0]); other.wait_for_selector('.timeline'); ok('token link works in a fresh browser', True)
    ref = other.inner_text('.trk__ref').split(' ')[1]
    other.goto(B + '/track/' + ref); other.wait_for_selector('.cempty'); ok('reference alone does not open the order', "couldn't find" in other.inner_text('.cempty'))
    g.wait_for_timeout(11000); g.reload(); g.wait_for_selector('.timeline')
    ok('status advanced by simulation', g.locator('.timeline li.is-done').count() >= 3, g.locator('.timeline li.is-done').count())
    g.screenshot(path='/tmp/s5-track.png', full_page=True)
    # cancel path on a fresh unpaid order
    g.goto(B + '/product/vanilla-bean'); g.click('[data-qty="1"]'); g.click('.buy__add'); g.wait_for_selector('.drawer.is-open .cline'); g.wait_for_timeout(400)
    g.goto(B + '/checkout'); g.wait_for_selector('.cform2'); fill_checkout(g); g.wait_for_timeout(600); g.click('button[type=submit].csum__go'); g.wait_for_url('**/pay/**')
    g.goto(g.url.replace('/pay/', '/track/')); g.wait_for_selector('.timeline')
    ok('unpaid order offers Pay now and Cancel', g.locator('text=Pay now').count() == 1 and g.locator('text=Cancel this order').count() == 1)
    g.click('text=Cancel this order'); g.click('text=Yes, cancel it'); g.wait_for_selector('.chip--cancelled'); ok('order cancelled', 'cancelled' in g.inner_text('.trk__title').lower())

    # ---------- member: register in the UI (new split sign-in design)
    m = newpage(); m.goto(B + '/account'); m.wait_for_selector('.authcard')
    ok('signed-out account shows the split sign-in layout', m.locator('.authpanel').count() == 1 and m.locator('.seg__btn').count() == 2)
    ok('panel headline + real perks shown', 'Welcome back' in m.inner_text('.authpanel__title') and m.locator('.perk').count() == 3)
    m.screenshot(path='/tmp/auth-login.png')
    m.click('.aform__go'); ok('empty submit shows inline errors and focuses the first bad field', 'valid email' in m.inner_text('.afield__err') and m.evaluate("document.activeElement.name") == 'email', m.inner_text('.authcard')[:80])
    m.fill('input[name=email]', 'nobody@example.com'); m.fill('input[name=password]', 'wrong-pass-123'); m.click('.aform__go'); m.wait_for_selector('.aform__alert:not(:empty)')
    ok('wrong credentials: friendly alert, no field leak', 'do not match' in m.inner_text('.aform__alert'))
    ok('password reveal toggles', m.get_attribute('input[name=password]', 'type') == 'password'); m.click('.afield__eye'); ok('password revealed', m.get_attribute('input[name=password]', 'type') == 'text' and m.get_attribute('.afield__eye', 'aria-pressed') == 'true')
    m.click('#tab-register'); m.wait_for_selector('input[name=name]'); ok('switched to Create account (tab state + url hash)', m.get_attribute('#tab-register', 'aria-selected') == 'true' and m.url.endswith('#register'))
    m.fill('input[name=password]', 'abc'); ok('strength meter reacts (too short)', m.get_attribute('.meter', 'data-level') == '1' and 'Too short' in m.inner_text('.meter'))
    m.fill('input[name=password]', 'Correct-Horse-9!x'); ok('strength meter reacts (strong)', m.get_attribute('.meter', 'data-level') == '4', m.get_attribute('.meter', 'data-level'))
    m.screenshot(path='/tmp/auth-register.png')
    m.fill('input[name=name]', 'Bola Eze'); m.fill('input[name=email]', 'bola@example.com'); m.fill('input[name=password]', 'correct-horse-9')
    m.click('.aform__go')
    ok('registered and signed in', 'Bola' in m.inner_text('.acct__hello'))
    ok('session cookie is HttpOnly (not readable by scripts)', m.evaluate("document.cookie.includes('sid=')") is False)
    m.goto(B + '/product/belgian-chocolate'); m.wait_for_selector('.buy__add'); 
    for _ in range(9): m.click('[data-qty="1"]')
    m.click('.buy__add'); m.wait_for_selector('.drawer.is-open .cline'); m.wait_for_timeout(400); m.goto(B + '/checkout'); m.wait_for_selector('.cform2')
    ok('checkout prefilled from account', m.input_value('input[name=email]') == 'bola@example.com')
    m.select_option('select[name=area]', 'Ikoyi'); m.fill('input[name=line1]', '5 Palm Avenue'); m.fill('input[name=phone]', '08098765432'); m.wait_for_timeout(700)
    m.click('button[type=submit].csum__go'); m.wait_for_url('**/pay/**'); m.click('text=Simulate successful payment'); m.wait_for_url('**/track/**'); m.wait_for_selector('.timeline')
    ok('points earned shown on order', 'reward points' in m.inner_text('.trk__main'), m.inner_text('.trk__main')[-80:])
    m.goto(B + '/account#rewards'); m.wait_for_selector('.rewards__bal'); bal = int(m.inner_text('.rewards__bal'))
    ok('rewards balance = floor(32,000/100)', bal == 320, bal)
    m.goto(B + '/account#orders'); m.wait_for_selector('.olist__ref'); ok('order history lists the order', m.locator('.olist__row').count() == 1)
    m.click('.olist__ref'); m.wait_for_selector('.timeline'); ok('owner opens order by reference', True)
    m.goto(B + '/account#addresses'); m.wait_for_selector('text=Add an address'); m.fill('input[name=line1]', '9 Marina Road'); m.select_option('select[name=area]', 'Ikoyi'); m.click('text=Save address'); m.wait_for_selector('text=9 Marina Road'); ok('saved address added', True)
    m.goto(B + '/product/belgian-chocolate'); m.click('.buy__add'); m.wait_for_selector('.drawer.is-open .cline'); m.wait_for_timeout(300); m.goto(B + '/checkout'); m.wait_for_selector('.cform2')
    m.select_option('.fs select:not([name=area])', index=1); m.wait_for_timeout(600)
    ok('saved address fills the form', m.input_value('input[name=line1]') == '9 Marina Road')
    m.goto(B + '/product/belgian-chocolate'); m.wait_for_selector('[data-reviews] .rv__form')
    m.fill('textarea[name=body]', 'Deep, dark and not too sweet. Superb.'); m.click('text=Post review'); m.wait_for_selector('.rv__item')
    ok('review posted and marked verified purchase', 'Verified purchase' in m.inner_text('.rv__by'), m.inner_text('.rv__by'))
    ok('review shows short name, no email', 'bola@' not in m.inner_text('.reviews') and 'Bola E.' in m.inner_text('.rv__by'))
    m.screenshot(path='/tmp/s5-pdp.png')
    # redeem points
    m.goto(B + '/product/belgian-chocolate'); 
    for _ in range(9): m.click('[data-qty="1"]')
    m.click('.buy__add'); m.wait_for_selector('.drawer.is-open .cline'); m.wait_for_timeout(300); m.goto(B + '/checkout'); m.wait_for_selector('.pts .check')
    m.select_option('select[name=area]', 'Ikoyi'); m.wait_for_timeout(600); m.check('.pts input'); m.wait_for_timeout(700)
    ok('points redemption reduces the total', 'Rewards' in m.inner_text('.csum') and '−₦' in m.inner_text('.csum'), m.inner_text('.csum').replace('\n', ' | ')[:160])
    m.goto(B + '/account'); m.click('text=Sign out'); m.wait_for_selector('.authcard'); ok('sign out works', m.locator('.authcard').count() == 1)
    m.goto(B + '/account'); m.wait_for_selector('.authcard'); m.fill('input[name=email]', 'bola@example.com'); m.fill('input[name=password]', 'correct-horse-9'); m.click('.aform__go'); m.wait_for_selector('.acct__hello'); ok('sign in works again after sign out', 'Bola' in m.inner_text('.acct__hello'))
    m.goto(B + '/account?next=/shop'); m.click('text=Sign out'); m.wait_for_selector('.authcard')
    m.goto(B + '/account?next=/shop'); m.fill('input[name=email]', 'bola@example.com'); m.fill('input[name=password]', 'correct-horse-9'); m.click('.aform__go'); m.wait_for_url('**/shop'); ok('?next= returns you where you came from', True)
    m.goto(B + '/account?next=//evil.example'); m.fill('input[name=email]', 'bola@example.com'); m.fill('input[name=password]', 'correct-horse-9'); m.click('.aform__go'); m.wait_for_selector('.acct__hello'); ok('unsafe ?next= is ignored (no open redirect)', m.url.startswith(B + '/account'))

    # ---------- gift
    gp = newpage(); gp.goto(B + '/gift'); gp.wait_for_selector('.giftopt'); gp.fill('input[name=recipient]', 'Chidi'); gp.fill('textarea[name=message]', 'Happy birthday!'); gp.click('text=Add gift to bag'); gp.wait_for_selector('.drawer.is-open .cline'); gp.wait_for_timeout(400)
    gp.goto(B + '/checkout'); gp.wait_for_selector('.cform2'); ok('gift prefilled at checkout', gp.is_checked('input[name=isGift]') and gp.input_value('input[name=recipient]') == 'Chidi')
    fill_checkout(gp, area='Ikoyi'); gp.wait_for_timeout(700); gp.click('button[type=submit].csum__go'); gp.wait_for_url('**/pay/**'); gp.click('text=Simulate successful payment'); gp.wait_for_url('**/track/**'); gp.wait_for_selector('.cside')
    ok('order marked as a gift', 'For Chidi' in gp.inner_text('.cside') and 'Happy birthday' in gp.inner_text('.cside'))

    # ---------- home sections, newsletter, motion
    h = newpage(); h.goto(B + '/'); h.wait_for_timeout(800)
    for sel in ['.strip', '.season', '.best', '.quotes', '.news']: ok(f'home has {sel}', h.locator(sel).count() == 1)
    h.evaluate("document.querySelector('.best').scrollIntoView({behavior:'instant'})"); h.wait_for_timeout(1200)
    ok('scroll reveal triggers', h.evaluate("document.querySelector('.best').classList.contains('is-in')"))
    h.evaluate("window.scrollTo({top:400,behavior:'instant'})"); h.wait_for_timeout(300); a = h.evaluate("getComputedStyle(document.querySelector('.hero__art img')).getPropertyValue('--py')")
    h.evaluate("window.scrollTo({top:0,behavior:'instant'})"); h.wait_for_timeout(300); b2 = h.evaluate("getComputedStyle(document.querySelector('.hero__art img')).getPropertyValue('--py')")
    ok('parallax responds to scroll', a != b2, f'{a!r} vs {b2!r}')
    h.evaluate("document.querySelector('.news').scrollIntoView({behavior:'instant'})"); h.wait_for_timeout(1200)
    h.fill('.news input[name=email]', 'fan@example.com'); h.click('.news button'); h.wait_for_timeout(500); ok('consent required', 'tick the box' in h.inner_text('[data-news-msg]'), h.inner_text('[data-news-msg]'))
    h.check('.news input[name=consent]'); h.click('.news button'); h.wait_for_selector('[data-news-msg] a'); ok('newsletter subscribed with unsubscribe link', 'subscribed' in h.inner_text('[data-news-msg]'))
    link = h.get_attribute('[data-news-msg] a', 'href'); h.goto(B + link); h.wait_for_selector('text=Unsubscribe'); h.click('button:has-text("Unsubscribe")'); h.wait_for_selector('text=You are unsubscribed'); ok('unsubscribe works', True)
    h.goto(B + '/'); h.evaluate("window.scrollTo({top:1100,behavior:'instant'})"); h.wait_for_timeout(500); h.screenshot(path='/tmp/s5-home-mid.png')
    h.evaluate("document.querySelector('.season').scrollIntoView({behavior:'instant'})"); h.wait_for_timeout(1800); h.screenshot(path='/tmp/s5-season.png')
    rm = br.new_context(reduced_motion='reduce'); r = rm.new_page(); r.goto(B + '/'); r.wait_for_timeout(600)
    ok('reduced motion: sections visible without reveal', r.evaluate("getComputedStyle(document.querySelector('.best')).opacity") == '1')
    c = newpage(); c.goto(B + '/contact'); c.wait_for_selector('[data-contact]'); c.fill('input[name=name]', 'Ada'); c.fill('input[name=email]', 'ada@example.com'); c.fill('textarea[name=message]', 'A flavour idea for you all'); c.click('text=Send message'); c.wait_for_selector('[data-contact-msg][data-state=ok]'); ok('contact form sends', True)
    for path in ['/our-story', '/privacy', '/terms', '/delivery-and-refunds']:
        d = newpage(); d.goto(B + path); ok(f'{path} renders content', d.locator('.doc h2').count() >= 2)
    # ---------- mobile
    for path in ['/account', '/checkout', '/gift', '/contact', '/our-story', '/']:
        mm = newpage(390, 844); mm.goto(B + path); mm.wait_for_timeout(700)
        ok(f'no overflow {path} @390', mm.evaluate("document.documentElement.scrollWidth<=innerWidth"), mm.evaluate("document.documentElement.scrollWidth"))
    mm = newpage(390, 844); mm.goto(B + '/pay/xxxxxxxxxxxxxxxxxxxxxxxx'); mm.wait_for_timeout(600); ok('bad pay link handled gracefully', "couldn't find" in mm.inner_text('.cempty'))
    br.close()
finally:
    srv.terminate()
bad = [e for e in errs if not any(x in e[1] for x in ['fonts/', 'status of 404', 'status of 401', 'status of 402', 'status of 409'])]
print('\nunexpected console/page errors:', bad[:8]); print(f"\n{sum(results)}/{len(results)} passed")

# SCOOPÉ

*A little moment of indulgence.* A fictional premium ice cream store, built to look and behave like a real commercial shop. **Zero npm dependencies**: vanilla HTML, CSS and JavaScript on a native Node.js server, deployable to Render from GitHub.

> **It is a demonstration.** No real payment is ever collected, nothing is made or delivered, and order progress is a timed simulation. This is stated in the shop itself (announcement bar, checkout, payment page, order page, footer, policies).

## What it does

- **Storefront:** editorial homepage (hero, flavour index with live scoop, scroll-scrubbed flavour-wheel video, collections, Flavour of the Month, bestsellers, testimonials, newsletter), shop with live search/filter/sort, product pages (server-rendered, JSON-LD, reviews), collections, gift page, story, contact, policies, custom 404, sitemap, robots.
- **Build Your Own Sundae:** 7 steps, live illustrated preview, price updates instantly, edit from the bag.
- **Bag and checkout:** drawer and page, coupon, delivery areas and fees, rewards redemption, gift option, guest checkout or account checkout. The server re-prices everything; the browser only ever sends IDs and quantities.
- **Demo payment:** simulated success or decline, transaction reference, payment records, retry limits, duplicate-order protection, 30-minute stock hold. Payment sits behind a provider interface (`src/server/services/payments.js`) so a real provider can replace the demo one without touching checkout.
- **Orders:** secure tracking link (secret token, stored hashed), order timeline, cancel before preparation (simulated refund, stock and points restored), automatic status progression (confirmed, preparing, out for delivery, delivered).
- **Accounts:** a split-layout sign-in / create-account page (inline validation, show/hide password, password-strength meter, `?next=` return path), profile, change password, saved addresses, order history, **SCOOPÉ Rewards** (1 point per ₦100, 100 points = ₦500 off, capped at half the order).
- **Extras:** reviews with verified-purchase badge, newsletter with consent and unsubscribe, contact form.

## Run locally

Requires Node.js 20+. No install step.

```bash
npm start        # http://localhost:3000
npm run dev      # restart on change
npm test         # 75 server tests (node:test, no framework)
npm run test:browser   # optional: end-to-end Chromium tests (see below)
```

## Deploy to Render (GitHub + Render only)

1. Push this folder to a GitHub repository.
2. In Render: **New → Blueprint**, pick the repo (it reads `render.yaml`), or create a **Web Service** manually:
   - Runtime **Node**, build command *(empty or `echo ok`)*, start command `node src/server/index.js`, health check path `/api/health`.
3. Set environment variables:
   | Variable | Value |
   |---|---|
   | `NODE_ENV` | `production` |
   | `SITE_URL` | your public URL, e.g. `https://scoope.onrender.com` (used for canonical links and sitemap) |
   | `DATA_DIR` | `/var/data` (the disk mount path, see next step) |
   | `DEMO_ORDER_PACE_SECONDS` | optional, default `45` |
4. **Persistent data:** add a **Disk** to the service, mounted at `/var/data`, then set `DATA_DIR=/var/data`. Persistent disks need a paid instance type. On a free instance, skip the disk: the app works, but **all accounts and orders are lost on every restart or deploy**, and `/api/health` reports `"mode": "temporary-demo"` (the server also logs a warning at start-up).
5. Deploy. Open `/api/health` to confirm `status: ok`. Run **one instance only** (see limits below).

No secrets are required: there are no API keys, no payment keys, and no admin password. Nothing sensitive is committed (`.gitignore` excludes `.env` and `data/*.json`).

## Data storage

JSON files, one per collection, in `DATA_DIR` (users, sessions, products, inventory, orders, payments, rewards, reviews, addresses, subscribers, coupons, delivery zones, settings, messages).

- Writes are serialised per collection and replaced atomically (temp file, fsync, rename); data is validated before it is written; a backup is kept at most once a minute (last 10 retained in `DATA_DIR/backups`); a corrupt file is quarantined as `*.corrupt-<time>.json` and restored from the newest valid backup. In-flight writes finish before shutdown.
- **Limits, stated plainly:** there are no transactions across files. An order touches inventory, rewards, orders and payments, and the code uses compensating steps (reserve, then release on failure) rather than true atomicity. Run **a single instance**; two instances would overwrite each other. This is right for a demo, not for a real shop.
- **No admin dashboard** (deliberately out of scope). To change prices, stock, delivery zones, coupons, settings or the seasonal campaign, stop the app, edit the JSON in `DATA_DIR` (or `src/server/models/seed.js` before first run), and start it again. Stock only goes down as orders are paid; delete `DATA_DIR/inventory.json` to reset it from the seed.

## Security summary

Passwords: scrypt with a unique salt. Sessions: 256-bit random token in an HttpOnly, SameSite=Lax cookie (Secure in production); only its hash is stored; fresh session on every login; password change signs out other devices. CSRF token required on every state-changing request made with a session, plus Origin checking. Rate limits on login, registration, orders, payment, reviews, newsletter and contact. Request bodies capped at 32 KB. Order tracking uses an unguessable token (stored hashed); a bare reference only works for the signed-in owner; unknown and forbidden orders look identical (no IDOR). Prices, stock, coupons, delivery fees and points are all recomputed server-side. Strict CSP (no inline scripts or styles), nosniff, frame denial, HSTS in production. All user-supplied text is escaped; JSON-LD is escaped against `</script>` break-out.

Not provided: email or SMS (no mail service is used, so no password reset, no receipts), real payments, real delivery.

## Testing

- `npm test`: 77 server tests covering storage and recovery, catalogue, pricing (including tampering), accounts and sessions, CSRF, rate limits, orders, stock races, payments, cancellation and expiry, rewards, reviews, newsletter, pages and static serving (including HTTP Range).
- `npm run test:browser` (optional): Chromium end-to-end checks (`tests/browser/*.py`, 124 checks) covering the scroll video (and its fallbacks), shop filters, bag, builder, checkout, payment, tracking, the sign-in flow, gifts, reviews, motion, the rendered imagery (flavour wheel and product gallery), and mobile overflow. These need `pip install playwright && playwright install chromium`, which is **not** a project dependency.

## Media and fonts

- **Supplied photos and video** came from the project owner (see `docs/ASSETS.md`). **Their licences are unknown.** Fine for a private portfolio; confirm rights or replace them before any public launch.
- **Rendered images (original work, no licence concerns):** the 12 products without a suitable photo, a close-up second view for each, and the six flavour-wheel cutouts (one fixed waffle cone, six scoops) were made with a small software 3D renderer in `tools/render/` (Python + numpy/scipy/Pillow, **development only, not part of the site**). They are procedural 3D renders, not photographs. Re-run with `npm run render` (about 20 minutes on one core); output goes to `public/assets/images` and the manifest is updated.
- **Fonts** are self-hosted from `public/fonts` (SIL OFL licences included): DM Sans (as specified) and **Crimson Text as a stand-in** for Cormorant Garamond, whose file was not available. Cormorant is used automatically if installed on the visitor's machine; to switch to it, add its WOFF file and a `url()` to the `@font-face` in `src/client/styles/tokens.css`. The ₦ sign is not in either bundled font, so browsers draw it from a system font.
- The sundae builder's live preview and the in-bag thumbnails of custom sundaes are still flat vector drawings, not renders.

## Project layout

```
src/server/   config, routes (one guarded router), controllers, services (pricing, orders, auth, store...), middleware, models (schema, seed)
src/client/   pages (templates), components (header, footer, logo, drawer), modules (ES modules), styles
public/       assets (images, videos, manifest), fonts
tests/        node:test suites + optional browser tests
docs/         ASSETS.md (media provenance and licensing)
tools/render/ the 3D image renderer (dev only; see Media)
```

## Scope note

Built in stages. Delivered: foundation, data layer, storefront, cart and builder, accounts/checkout/payment/orders, and the motion and extras layer. **Not built, by decision:** an admin dashboard, and a final hardening and audit pass (formal threat-model document, exhaustive test matrix).

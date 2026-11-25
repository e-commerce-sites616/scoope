# Assets: provenance, processing and licensing

## IMPORTANT: licensing is unverified
Every image and video here was supplied by the project owner from Pinterest/social media/stock-preview
sources. Original creators and licences are **unknown**. They are fine for a private portfolio demo but
**confirm rights (or replace them) before any public launch.** The manifest marks each with
`"license": "unverified"`. `verified: true` in the manifest only means the file exists and loads.

## What was used
| Manifest id | Used for | Notes |
|---|---|---|
| hero-main | Homepage hero | Vanilla/chocolate scoops in milk splash |
| product-vanilla-bean, -belgian-chocolate, -strawberry-bliss | Classic scoops | |
| product-classic-waffle-cone, -double-scoop, -triple-scoop | Cones | double-scoop source is only 480 px wide |
| product-signature-mixed-tub | Mixed tub | Photo is a cup, not a tub |
| product-caramel-crunch | Sundae | Photo is a banana split |
| flavour-wheel (video) | Homepage scroll section | see below |

Products with no matching clean photo (Salted Caramel, Cookies & Cream, Pistachio Dream, the other tubs,
Berry Dream, Chocolate Obsession, Pistachio Indulgence, all gifts) use generated illustrations
(`src/client/modules/art.js`). Two supplied photos (brownie sundae, banana scoops) were only 236 px wide and
would look blurry, so they were left out: supply higher-resolution originals to use them.

## What was deliberately not used
Branded or text-baked material: Milma, Kriko, Lakeview, fro-chi, Icebay, Maison Vanilla, Russian-text popsicle,
poster layouts with copy, annotated scoop tower, an image with a fake checkerboard "transparent" background,
a 1139x360 cone banner (too small), and a video template with "logo" and "Follow us" placeholders.
Unused clips of interest (clean, brand-free) if wanted later: strawberry cone with flying fruit, vanilla scooping
sequence (trim before its ad end-card), chocolate cone explosion.

## Processing
- Images: converted to WebP (q82), native size, named by manifest id.
- Flavour-wheel video: trimmed to 0-16.6 s (drops the "We are OPEN!" end card), audio removed, H.264,
  keyframe every 6 frames (smooth seeking). 540x960 (3.6 MB) desktop, 360x640 (1.9 MB) mobile, plus a poster
  and `flavour-wheel-palette.json` (average colour every 0.5 s, drives the section background).
- The video contains baked-in generic text ("What is your FAVORITE ice cream", "FLAVOR ..."). Scroll beats map to
  its flavours: Cookies, Pistachio, Strawberry, Chocolate, Caramel, Blueberry/Raspberry.
- Raw originals are not in the repo (the original zip is ~25 MB).

## Fonts
DM Sans (variable) and Crimson Text were converted to subsetted WOFF from the system's open-licence (SIL OFL) copies; licence texts are in `public/fonts/`. Crimson Text stands in for Cormorant Garamond, which was not available.

## Rendered images (project-owned)
`tools/render/` renders the following with a small signed-distance-field raymarcher (numpy/scipy/Pillow; lighting, soft shadows, ambient occlusion, textured scoops, waffle-lattice cone). No third-party imagery is used or traced.
- `product-<slug>.webp` and `product-<slug>-close.webp` (736x920) for: salted-caramel, cookies-and-cream, pistachio-dream, vanilla-family-tub, chocolate-lovers-tub, strawberry-collection, berry-dream, chocolate-obsession, pistachio-indulgence, the-sweet-box, celebration-collection, the-scoope-experience.
- `stage-<flavour>.webp` (600x750, transparent): the same cone with a vanilla, chocolate, strawberry, caramel, cookies-and-cream or pistachio scoop, used by the homepage flavour wheel.
These are 3D renders, not photographs. The manifest marks them `license: project-owned`.

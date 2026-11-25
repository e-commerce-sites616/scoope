"""After build_all.py: register the rendered images in the asset manifest (project-owned, original work)."""
import json, os, sys
root = os.path.join(os.path.dirname(__file__), '..', '..')
mp = os.path.join(root, 'public/assets/manifest/assets.json')
m = json.load(open(mp)); alts = json.load(open('/tmp/render_alts.json'))
SRC = 'Rendered for this project with tools/render (procedural 3D, original work, no third-party material)'
by = {i['id']: i for i in m['images']}
def put(id, section, alt, w, h):
    e = by.get(id) or {'id': id}; by[id] = e
    e.update(section=section, url=f'/assets/images/{id}.webp', alt=alt, width=w, height=h, source=SRC, license='project-owned', verified=False, status='local-unchecked')
    if e not in m['images']: m['images'].append(e)
for slug, alt in alts.items():
    put(f'product-{slug}', 'products', alt, 736, 920); put(f'product-{slug}-close', 'products', alt + ' (close-up)', 736, 920)
for f in ['vanilla', 'chocolate', 'strawberry', 'caramel', 'cookies', 'pistachio']:
    put(f'stage-{f}', 'home-flavour-stage', f'{f} scoop on a waffle cone (rendered, transparent background)', 600, 750)
json.dump(m, open(mp, 'w'), indent=2); open(mp, 'a').write('\n'); print('manifest updated:', len(m['images']), 'images')

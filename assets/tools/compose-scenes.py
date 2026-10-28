"""Compose the scenario strips from the approved layers: a background, a Juan pose and an
optional prop. Poses are never mirrored (the bracelet stays on Juan's right wrist).

Run from the repository root: python assets/tools/compose-scenes.py <jobs.json> <out-dir>
Each job places layers in background pixels (1536x1024) and crops a band of the strip's ratio.
"""
import json, sys
from pathlib import Path
from PIL import Image

def compose(job):
    bg = Image.open(job['background']).convert('RGBA')
    for layer in job['layers']:
        im = Image.open(layer['src']).convert('RGBA')
        im = im.crop(im.getchannel('A').getbbox())
        h = layer['height']
        im = im.resize((round(im.width * h / im.height), h), Image.LANCZOS)
        # x is the layer's centre; bottom is where its lower edge sits (it may run off the frame).
        canvas = Image.new('RGBA', bg.size)
        canvas.paste(im, (round(layer['x'] - im.width / 2), layer['bottom'] - h))
        bg = Image.alpha_composite(bg, canvas)
    x, y, w = job['crop']
    ratio = job.get('ratio', 350 / 110)
    band = bg.crop((x, y, x + w, y + round(w / ratio)))
    return band.resize(tuple(job['size']), Image.LANCZOS).convert('RGB')

if __name__ == '__main__':
    jobs = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
    out = Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True)
    for job in jobs:
        compose(job).save(out / f"{job['id']}.png", optimize=True)
        print(job['id'])

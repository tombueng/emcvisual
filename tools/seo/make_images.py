#!/usr/bin/env python3
"""Social preview (og-image.png, 1200x630) and apple-touch-icon.png for the web app.

    python3 tools/seo/make_images.py

Source: docs/images/app-demo.png (written by the Playwright smoke test, e2e/output/demo.png).
The viewport part of the screenshot is cropped, a caption strip is added at the bottom.
"""
import os
import subprocess

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = os.path.join(ROOT, 'docs', 'images', 'app-demo.png')
OUT = os.path.join(ROOT, 'public', 'og-image.png')
ICON = os.path.join(ROOT, 'public', 'apple-touch-icon.png')
FONT = '/usr/share/fonts/truetype/ibm-plex/IBMPlexSansVar-Roman.ttf'

W, H, STRIP = 1200, 630, 118
CAPTION = 'EMC / EMI near-field simulator for KiCad PCBs'
SUB = 'See and hear the field of your board in the browser: probe, spectrum, CISPR 32, layout hints'


def font(size, weight):
    f = ImageFont.truetype(FONT, size)
    try:
        f.set_variation_by_axes([weight])
    except Exception:
        pass
    return f


def main():
    shot = Image.open(SRC).convert('RGB')
    # 3D viewport of the 1440x900 screenshot (between the side panels, above the analyzer)
    view = shot.crop((300, 46, 1170, 680))
    target_h = H - STRIP
    scale = max(W / view.width, target_h / view.height)
    view = view.resize((round(view.width * scale), round(view.height * scale)), Image.LANCZOS)
    left = (view.width - W) // 2
    top = (view.height - target_h) // 2
    view = view.crop((left, top, left + W, top + target_h))

    img = Image.new('RGB', (W, H), (14, 22, 32))
    img.paste(view, (0, 0))
    d = ImageDraw.Draw(img)
    d.rectangle((0, H - STRIP, W, H), fill=(22, 32, 43))
    d.rectangle((0, H - STRIP, W, H - STRIP + 3), fill=(242, 163, 58))
    d.text((40, H - STRIP + 22), CAPTION, font=font(40, 600), fill=(223, 231, 239))
    d.text((40, H - STRIP + 74), SUB, font=font(22, 400), fill=(141, 160, 179))
    img.save(OUT, optimize=True)
    subprocess.run(['rsvg-convert', '-w', '180', '-h', '180', os.path.join(ROOT, 'public', 'favicon.svg'), '-o', ICON], check=True)
    print(f'wrote {os.path.relpath(OUT, ROOT)} and {os.path.relpath(ICON, ROOT)}')


if __name__ == '__main__':
    main()

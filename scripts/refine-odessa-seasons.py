#!/usr/bin/env python3
"""Replace the blurry guide-hero variants with one sharp openly licensed Odesa Opera photo, seasonally treated.
Conservatively changes assets/seasons/*.jpg only, with attribution.
"""
from pathlib import Path
import urllib.request, io, random
from PIL import Image, ImageOps, ImageEnhance, ImageDraw, ImageFilter

root=Path(__file__).resolve().parents[1]
out=root/'assets'/'seasons'
out.mkdir(parents=True,exist_ok=True)
url='https://upload.wikimedia.org/wikipedia/commons/2/25/%D0%91%D1%83%D0%B4%D0%B8%D0%BD%D0%BE%D0%BA_%D1%82%D0%B5%D0%B0%D1%82%D1%80%D1%83_%D0%BE%D0%BF%D0%B5%D1%80%D0%B8_%D1%82%D0%B0_%D0%B1%D0%B0%D0%BB%D0%B5%D1%82%D1%83%2C_%D0%9E%D0%B4%D0%B5%D1%81%D0%B0_DJI_0023.jpg'
req=urllib.request.Request(url,headers={'User-Agent':'OdessaOnlineGuide/1.0 (city-guide; image attribution retained)'})
with urllib.request.urlopen(req,timeout=35) as response:
    raw=response.read(6000000)
base=Image.open(io.BytesIO(raw)).convert('RGB')
if min(base.size)<1200:raise SystemExit('Source was unexpectedly small; aborting without changing photos')
# Show an authentic wide city panorama, rather than upscaling a low-res embedded thumbnail.
base=ImageOps.fit(base,(1280,925),method=Image.Resampling.LANCZOS,centering=(.50,.52))
base=base.filter(ImageFilter.UnsharpMask(radius=1.3,percent=110,threshold=4))
for name in ('spring','summer','autumn','winter'):
    im=base.copy()
    if name=='spring':
        im=ImageEnhance.Color(im).enhance(1.14)
        tint=(250,231,238);strength=.11
    elif name=='summer':
        im=ImageEnhance.Color(im).enhance(1.24)
        im=ImageEnhance.Brightness(im).enhance(1.11)
        tint=(226,241,255);strength=.08
    elif name=='autumn':
        im=ImageEnhance.Color(im).enhance(1.26)
        im=ImageEnhance.Contrast(im).enhance(1.08)
        tint=(255,214,164);strength=.16
    else:
        im=ImageEnhance.Color(im).enhance(.78)
        im=ImageEnhance.Contrast(im).enhance(1.09)
        tint=(188,216,251);strength=.27
    im=Image.blend(im,Image.new('RGB',im.size,tint),strength)
    # Restrained photographic ambience; animated weather will be rendered on top in CSS.
    if name=='winter':
        layer=Image.new('RGBA',im.size,(0,0,0,0));d=ImageDraw.Draw(layer);rng=random.Random(237)
        for _ in range(130):
            x=rng.randrange(im.width);y=rng.randrange(im.height);r=rng.randrange(1,4)
            d.ellipse((x-r,y-r,x+r,y+r),fill=(252,252,255,rng.randrange(42,120)))
        layer=layer.filter(ImageFilter.GaussianBlur(.6))
        im=Image.alpha_composite(im.convert('RGBA'),layer).convert('RGB')
    im.save(out/(name+'.jpg'),quality=88,subsampling=0,optimize=True,progressive=True)
    print(name,(out/(name+'.jpg')).stat().st_size)

(out/'SOURCE.md').write_text(
    'Seasonal hero photograph: Konstantin Brizhnichenko, '
    '[Odessa Opera and Ballet Theater, Odesa, 2019]'
    '(https://commons.wikimedia.org/wiki/File:%D0%91%D1%83%D0%B4%D0%B8%D0%BD%D0%BE%D0%BA_%D1%82%D0%B5%D0%B0%D1%82%D1%80%D1%83_%D0%BE%D0%BF%D0%B5%D1%80%D0%B8_%D1%82%D0%B0_%D0%B1%D0%B0%D0%BB%D0%B5%D1%82%D1%83%2C_%D0%9E%D0%B4%D0%B5%D1%81%D0%B0_DJI_0023.jpg).\n'
    'Source and derivative seasonal edits are available under '
    '[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). '
    'Changes: cropped, resized, color-graded; winter snow ambience.\n',
    encoding='utf-8')

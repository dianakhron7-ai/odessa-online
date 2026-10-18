#!/usr/bin/env python3
"""Build self-contained seasonal Odessa homepage images, with independent city scenes."""
from pathlib import Path
from PIL import Image, ImageOps, ImageEnhance, ImageFilter, ImageDraw
import io, json, re, base64, urllib.parse, urllib.request, random
root=Path(__file__).resolve().parents[1]
html=(root/"index.html").read_text(encoding="utf-8")
match=re.search(r'const PHOTO_DATA=(\{.*?\});\s*\n',html,re.S)
if not match: raise RuntimeError("PHOTO_DATA unavailable; refusing to change site")
data=json.loads(match.group(1))
output=root/"assets/seasons"
cards=output/"cards"
cards.mkdir(parents=True,exist_ok=True)
def source_from_site(key):
    return Image.open(io.BytesIO(base64.b64decode(data[key].split(",",1)[1]))).convert("RGB")
def commons_file(name):
    # Download high-resolution real photographs of Odesa Opera; no external assets at runtime.
    url="https://commons.wikimedia.org/wiki/Special:Redirect/file/"+urllib.parse.quote(name)+"?width=1400"
    request=urllib.request.Request(url,headers={"User-Agent":"OdessaOnlineGuideBot/1.0 (city-guide-image-attribution; contact on GitHub)","Accept":"image/avif,image/webp,image/jpeg,image/*;q=0.8"})
    with urllib.request.urlopen(request,timeout=40) as response:
        body=response.read(11000000)
    image=Image.open(io.BytesIO(body)).convert("RGB")
    if min(image.size)<450:raise ValueError("Low resolution for "+name)
    return image
sources={
 "winter":"Odesa Opera winter.jpg",
 "spring":"Odesa - Opera theatre.jpg",
 "summer":"Odesa National opera Theatre.jpg",
 "autumn":"Odesa Opera DSC 3220 51-101-1424.jpg"
}
photos={}
for season,filename in sources.items():
    try:
        photos[season]=commons_file(filename)
        print(season,"Commons image:",photos[season].size,filename)
    except Exception as exc:
        raise RuntimeError("Cannot load approved high-quality "+season+" photo: "+str(exc))
def render(src,size,season,seed,hero=False):
    img=ImageOps.fit(src,size,method=Image.Resampling.LANCZOS,centering=(.52,.47))
    if season=="summer":
        img=ImageEnhance.Color(img).enhance(1.15)
        img=ImageEnhance.Brightness(img).enhance(1.06)
    elif season=="spring":
        img=ImageEnhance.Color(img).enhance(1.13)
        img=Image.blend(img,Image.new("RGB",size,(252,223,233)),.10)
    elif season=="autumn":
        img=ImageEnhance.Color(img).enhance(1.22)
        img=Image.blend(img,Image.new("RGB",size,(251,167,66)),.15)
    elif season=="winter":
        img=ImageEnhance.Color(img).enhance(.84)
        img=Image.blend(img,Image.new("RGB",size,(178,211,242)),.21)
    # Subtle photographic atmosphere, not giant emoji or blurry scaling.
    if season=="winter":
        layer=Image.new("RGBA",size,(0,0,0,0));paint=ImageDraw.Draw(layer)
        rng=random.Random("snow-"+seed);w,h=size
        for _ in range(int(w*h/2500)):
            r=rng.choice((1,1,2,2,3))
            x=rng.randrange(w);y=rng.randrange(h)
            paint.ellipse((x-r,y-r,x+r,y+r),fill=(242,250,255,rng.randint(28,125)))
        img=Image.alpha_composite(img.convert("RGBA"),layer).convert("RGB")
    img=img.filter(ImageFilter.UnsharpMask(radius=1.1,percent=110,threshold=3))
    return img
for season,image in photos.items():
    render(image,(1152,760),season,season,True).save(output/(season+".jpg"),quality=87,optimize=True,progressive=True)
# Category photographs are independent. Each season has its own tram/medical imagery.
# Use only source images visually verified to show a real Odessa tram.
# Prior t14/t13 were medical photographs, wrongly assigned to Transport.
tram={"winter":"c1","spring":"t1","summer":"t1","autumn":"c1"}
med={"winter":"m10","spring":"m8","summer":"m0","autumn":"m5"}
for season in sources:
    for kind,keys in (("transport",tram),("medicine",med)):
        img=render(source_from_site(keys[season]),(720,495),season,kind+"-"+season)
        img.save(cards/(season+"-"+kind+".jpg"),quality=88,optimize=True,progressive=True)
credits="Seasonal photographic Odesa Opera backgrounds, processed/cropped for Odessa Online.\n\n"
for season,filename in sources.items():
    credits+=f"- {season}: Wikimedia Commons, [File:{filename}](https://commons.wikimedia.org/wiki/File:{urllib.parse.quote(filename.replace(' ','_'))}). Attribution and original licence are on the file page.\n"
credits+="\nTransport and medicine card photographs are adapted from existing original media embedded in the Odessa Online guide.\n"
(output/"CREDITS.md").write_text(credits,encoding="utf-8")
for path in output.rglob("*.jpg"):
    assert path.stat().st_size>25000 and Image.open(path).verify() is None
print("Created 12 seasonal images: four high-quality backgrounds, eight category photos.")

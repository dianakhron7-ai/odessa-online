#!/usr/bin/env python3
"""Prepare genuine high-resolution Odesa backgrounds plus seasonal card variants."""
from pathlib import Path
from PIL import Image, ImageOps, ImageEnhance, ImageFilter, ImageDraw
import re,base64,io,hashlib,urllib.parse,urllib.request,random,time,json

root=Path(__file__).resolve().parents[1]
html=(root/'index.html').read_text(encoding='utf-8')
m=re.search(r'const PHOTO_DATA=(\{.*?\});',html,re.S)
if not m:raise SystemExit('Could not find embedded images')
photos=json.loads(m.group(1))
out=root/'assets/seasons'
out.mkdir(parents=True,exist_ok=True)

# Actual photographs of the Odesa Opera Theatre from Wikimedia Commons.
# Source credits are in assets/seasons/SOURCES.md. None are the fictional AI mockup.
filenames={
 'autumn':'Оперный театр в Одессе. Фото 1.jpg',
 'spring':'Odesa National opera Theatre.jpg',
 'summer':'Odesa-Building of the Odesa Opera Theatre in 2024.jpg',
 'winter':'Odessa Opera and Ballet Theater.jpg',
}
tones={'autumn':(251,210,142),'spring':(247,222,231),'summer':(228,244,255),'winter':(210,228,247)}

def download_commons(name):
 normalized=name.replace(' ','_')
 digest=hashlib.md5(normalized.encode('utf-8')).hexdigest()
 base='https://upload.wikimedia.org/wikipedia/commons/'+digest[0]+'/'+digest[:2]+'/'+urllib.parse.quote(normalized,safe='()')
 alternative='https://commons.wikimedia.org/wiki/Special:Redirect/file/'+urllib.parse.quote(normalized)
 last=None
 for url in (base,alternative):
  try:
   req=urllib.request.Request(url,headers={'User-Agent':'OdessaOnlineGuideBot/1.0 (community Odesa city guide; contact via GitHub)'})
   with urllib.request.urlopen(req,timeout=50) as res:
    data=res.read(12_000_000)
   image=Image.open(io.BytesIO(data)).convert('RGB')
   if image.width<1000 or image.height<650:raise ValueError('Image too small')
   print('Downloaded',name,image.size,len(data))
   return image
  except Exception as e:
   last=e
   print('Retry source:',str(e)[:180])
 raise RuntimeError('Cannot fetch sharp Opera image '+name+': '+str(last))

def tone(img,season,amount):
 t=Image.new('RGB',img.size,tones[season])
 return Image.blend(img,t,amount)

def light_particles(image,season,seed):
 rng=random.Random(seed)
 overlay=Image.new('RGBA',image.size,(0,0,0,0))
 d=ImageDraw.Draw(overlay)
 w,h=image.size
 if season=='winter':
  for i in range(105):
   x=rng.randrange(w);y=rng.randrange(h);r=rng.randint(1,3)
   d.ellipse((x-r,y-r,x+r,y+r),fill=(255,255,255,rng.randint(45,115)))
 elif season=='spring':
  for i in range(20):
   x=rng.randrange(w);y=rng.randrange(h);r=rng.randint(2,5)
   d.ellipse((x-r,y-r//2,x+r,y+r//2),fill=(255,189,205,rng.randint(35,75)))
 elif season=='autumn':
  for i in range(26):
   x=rng.randrange(w);y=rng.randrange(h);r=rng.randint(2,5)
   d.ellipse((x-r,y-r//2,x+r,y+r//2),fill=(229,138,55,rng.randint(25,60)))
 return Image.alpha_composite(image.convert('RGBA'),overlay).convert('RGB')

for season,name in filenames.items():
 photo=download_commons(name)
 photo=ImageOps.fit(photo,(1400,850),method=Image.Resampling.LANCZOS,centering=(.5,.51))
 photo=ImageEnhance.Contrast(photo).enhance(1.08)
 photo=ImageEnhance.Color(photo).enhance(1.16 if season in ('autumn','summer') else .98)
 photo=tone(photo,season,.22 if season=='winter' else .10)
 photo=light_particles(photo,season,'opera-'+season)
 photo=photo.filter(ImageFilter.UnsharpMask(radius=1.2,percent=125,threshold=3))
 photo.save(out/(season+'.jpg'),'JPEG',quality=89,progressive=True,optimize=True)

# Separate card backgrounds; preserve the approved tram / modern hospital thematic images.
for key,label in (('t1','transport'),('m1','medicine')):
 photo=Image.open(io.BytesIO(base64.b64decode(photos[key].split(',',1)[1]))).convert('RGB')
 for season in filenames:
  image=ImageOps.fit(photo,(760,650),method=Image.Resampling.LANCZOS,centering=(.5,.48))
  image=ImageEnhance.Contrast(image).enhance(1.08)
  image=tone(image,season,.29 if season=='winter' else (.16 if season=='autumn' else .12))
  image=light_particles(image,season,label+'-'+season)
  image=image.filter(ImageFilter.UnsharpMask(radius=1.1,percent=130,threshold=2))
  image.save(out/(season+'-'+label+'.jpg'),'JPEG',quality=87,progressive=True,optimize=True)
print('✅ All season hero and category images generated')

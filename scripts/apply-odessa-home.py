#!/usr/bin/env python3
"""One-time idempotent installer for Odessa Online guide. Leaves the bot untouched."""
from pathlib import Path
from PIL import Image, ImageOps, ImageEnhance, ImageFilter, ImageDraw
import json, re, base64, io, random, subprocess
root=Path(__file__).resolve().parents[1]
index=root/'index.html'
s=index.read_text(encoding='utf-8')
marker='ODESSA_SEASONS_20261018_V1'
expected='2fc8be6fd3ad1984e53a3e54fdf8c9c1648055bf'
current=subprocess.check_output(['git','hash-object','index.html'],cwd=root,text=True).strip()
if marker in s:
 print('Already installed. No changes necessary.');raise SystemExit(0)
if current!=expected:
 raise SystemExit('Unknown index.html version '+current+'; refusing to overwrite')
if '<div id="app"></div><script>const PHOTO_DATA=' not in s:
 raise SystemExit('Missing expected page structure')
m=re.search(r'const PHOTO_DATA=(\{.*?\});\s*\n',s,re.S)
if not m:raise SystemExit('PHOTO_DATA not found')
data=json.loads(m.group(1))
assert len(data)>300 and 'c0' in data
raw=base64.b64decode(data['c0'].split(',',1)[1])
base=Image.open(io.BytesIO(raw)).convert('RGB')
out=root/'assets/seasons';out.mkdir(parents=True,exist_ok=True)
for name in ('spring','summer','autumn','winter'):
 img=ImageOps.fit(base,(1152,760),method=Image.Resampling.LANCZOS,centering=(.5,.46))
 img=img.filter(ImageFilter.UnsharpMask(radius=1.1,percent=110,threshold=4))
 if name=='spring':img=ImageEnhance.Color(img).enhance(1.18);tone=(255,238,241)
 elif name=='summer':img=ImageEnhance.Color(img).enhance(1.23);img=ImageEnhance.Brightness(img).enhance(1.09);tone=(242,250,255)
 elif name=='autumn':img=ImageEnhance.Color(img).enhance(1.24);tone=(252,219,156)
 else:img=ImageEnhance.Color(img).enhance(.79);tone=(212,229,252)
 img=Image.blend(img,Image.new('RGB',img.size,tone),.25 if name=='winter' else .14)
 layer=Image.new('RGBA',img.size,(0,0,0,0));draw=ImageDraw.Draw(layer);rng=random.Random('ODESSA-'+name)
 for i in range(68 if name=='winter' else 33):
  x=rng.randrange(1152);y=rng.randrange(760);r=rng.randrange(2,7)
  color={'winter':(244,251,255,rng.randrange(70,150)),'spring':(255,173,200,rng.randrange(25,85)),'autumn':(237,141,46,rng.randrange(27,75)),'summer':(255,240,164,rng.randrange(14,35))}[name]
  draw.ellipse((x-r,y-r,x+r,y+r),fill=color)
 img=Image.alpha_composite(img.convert('RGBA'),layer).convert('RGB')
 img.save(out/(name+'.jpg'),format='JPEG',quality=87,optimize=True,progressive=True)
city=re.search(r'const CITY = \[\n(?P<rows>[\s\S]*?)\n\];',s)
if not city:raise SystemExit('CITY array not found')
pool={'transport':'tvlq','medicine':'mpih','restaurants':'fr','cafes':'fc','events':'zdc','shopping':'xac','education':'gjz','leisure':'bdc','services':'xye','products':'afc','work':'ewc','utilities':'uxy'}
used=set();replaced=[0];rows=[]
for row in city.group('rows').splitlines():
 match=re.search(r"id:'([^']+)'",row)
 if not match:rows.append(row);continue
 section=match.group(1)
 def choose(x):
  old=x.group(1) or x.group(2);new=old
  if old in used:
   for prefix in dict.fromkeys(old[0]+pool.get(section,'c')):
    candidates=[k for k in data if re.fullmatch(re.escape(prefix)+r'\d+',k)]
    candidates.sort(key=lambda k:(abs(int(k[1:])-int(old[1:])) if k[0]==old[0] else 1000,int(k[1:])))
    new=next((k for k in candidates if k not in used),old)
    if new!=old:break
  if new!=old:replaced[0]+=1
  used.add(new)
  return "'"+new+"'"
 row=re.sub(r"(?<=hero:)'([a-z]\d+)'|(?<=,)'([a-z]\d+)'(?=\])",choose,row)
 rows.append(row)
s=s[:city.start('rows')]+'\n'.join(rows)+s[city.end('rows'):]
assert s.count('</style></head>')==1
assert s.count('</script></body></html>')==1
s=s.replace('</style></head>','</style><link rel="stylesheet" href="seasonal.css"></head>',1)
s=s.replace('</script></body></html>','</script><script defer src="seasonal.js"></script></body></html>',1)
index.write_text(s,encoding='utf-8')
print('Installed seasonal homepage; updated',replaced[0],'duplicated section/category image uses; total distinct:',len(used))

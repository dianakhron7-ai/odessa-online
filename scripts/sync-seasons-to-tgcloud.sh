#!/usr/bin/env bash
# Sync only the existing mini-app static directory. No tgcloud modules or bot processes are changed.
set -Eeuo pipefail
cd "$HOME/OdessaOnlineGuideBot" || { echo '❌ Папка справочника не найдена'; exit 1; }
test -f dist/index.html || { echo '❌ Не найден dist/index.html'; exit 1; }
test -d tgcloud || { echo '❌ Не найден проект Telegram Cloud'; exit 1; }
command -v python >/dev/null && command -v node >/dev/null && command -v curl >/dev/null || { echo '❌ Необходимы Python, Node и curl'; exit 1; }
BASE='https://raw.githubusercontent.com/dianakhron7-ai/odessa-online/main'
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/assets/seasons/cards" "$WORK/tgcloud/endpoints" "$WORK/assets/seasons/cards"
echo '=== Загрузка оформления из GitHub ==='
for file in seasonal.js seasonal.css assets/seasons/autumn.jpg assets/seasons/winter.jpg assets/seasons/spring.jpg assets/seasons/summer.jpg assets/seasons/cards/autumn-transport.jpg assets/seasons/cards/autumn-medicine.jpg assets/seasons/cards/spring-transport.jpg assets/seasons/cards/spring-medicine.jpg assets/seasons/cards/summer-transport.jpg assets/seasons/cards/summer-medicine.jpg assets/seasons/cards/winter-transport.jpg assets/seasons/cards/winter-medicine.jpg; do
  curl --fail --location --silent --show-error --retry 2 --max-time 90 "$BASE/$file" --output "$WORK/$file" || { echo "❌ Ошибка загрузки: $file, файлы не изменены"; exit 1; }
done
node --check "$WORK/tgcloud/endpoints/odessaGuideViews.js" || { echo '❌ Ошибка облачного счётчика, файлы не изменены'; exit 1; }
node --check "$WORK/seasonal.js" || { echo '❌ Ошибка в JavaScript, файлы не изменены'; exit 1; }
python - "$WORK" <<'PY'
from pathlib import Path
import sys,re
w=Path(sys.argv[1])
for season in 'autumn winter spring summer'.split():
 for suffix in ['', '-transport', '-medicine']:
  path=(w/'assets/seasons'/(season+'.jpg')) if not suffix else (w/'assets/seasons/cards'/(season+suffix+'.jpg'))
  b=path.read_bytes()
  assert b.startswith(b'\xff\xd8') and len(b)>10000,'Invalid image '+str(path)
for image in (w/'assets/seasons/cards').glob('*.jpg'):
 assert image.read_bytes().startswith(b'\xff\xd8') and image.stat().st_size>5000,'Invalid '+str(image)
assert len(list((w/'assets/seasons/cards').glob('*.jpg')))==8
for name in ('seasonal.js','seasonal.css'):
 assert (w/name).stat().st_size>300,'Invalid file '+name
text=Path('dist/index.html').read_text(encoding='utf-8')
for token in ('<div id="app">','home-content','hero-title','const PHOTO_DATA=','const CITY = [','</head>','</body>'):
 if token not in text:raise SystemExit('❌ Другая версия справочника ('+token+'). Файлы не изменены.')
if '<link rel="stylesheet" href="seasonal.css">' not in text:
 text=text.replace('</head>','<link rel="stylesheet" href="seasonal.css"></head>',1)
if '<script defer src="seasonal.js"></script>' not in text:
 text=text.replace('</body>','<script defer src="seasonal.js"></script></body>',1)
m=re.search(r'const CITY = \[\n(?P<rows>[\s\S]*?)\n\];',text)
if not m:raise SystemExit('❌ Разделы имеют другую структуру. Файлы не изменены.')
available=set(re.findall(r'"([a-z]\d+)":"data:image/',text[:m.start()]))
if len(available)<150:raise SystemExit('❌ Список изображений отличается. Файлы не изменены.')
used=set()
fixed=[0]
rows=[]
for line in m.group('rows').splitlines():
 item=re.search(r"id:'([^']+)'",line)
 if not item:
  rows.append(line)
  continue
 section=item.group(1)
 def swap(match):
  old=match.group(1) or match.group(2)
  new=old
  if old in used:
   topic={'transport':'t','medicine':'m','restaurants':'f','education':'g','shopping':'x','services':'x','utilities':'u'}.get(section,old[0])
   free=[k for k in available if k not in used]
   if not free:raise ValueError('Not enough images')
   def rank(k):
    prefixes=list(dict.fromkeys([old[0],topic,'c','f','m','x','t','a','z','g','b','e','u']))
    return (prefixes.index(k[0]) if k[0] in prefixes else 99,abs(int(k[1:])-int(old[1:])),k)
   new=min(free,key=rank)
   fixed[0]+=1
  used.add(new)
  return "'"+new+"'"
 rows.append(re.sub(r"(?<=hero:)'([a-z]\d+)'|(?<=,)'([a-z]\d+)'(?=\])",swap,line))
assert len(used)>30, 'Too few images'
text=text[:m.start('rows')]+'\n'.join(rows)+text[m.end('rows'):]
(w/'index.html').write_text(text,encoding='utf-8')
print('✅ Оформление подготовлено. Заменено повторяющихся карточек:',fixed[0])
PY
BACKUP="$HOME/odessa-guide-before-seasonal-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP"
cp -p dist/index.html "$BACKUP/index.html"
echo "✅ Резервная копия: $BACKUP/index.html"
mkdir -p dist/assets/seasons/cards/cards
cp "$WORK/index.html" dist/index.html
cp "$WORK/seasonal.js" dist/seasonal.js
cp "$WORK/seasonal.css" dist/seasonal.css
cp "$WORK/assets/seasons/"*.jpg dist/assets/seasons/
cp "$WORK/assets/seasons/cards/"*.jpg dist/assets/seasons/cards/
cp "$WORK/assets/seasons/cards/"*.jpg dist/assets/seasons/cards/
cp "$WORK/assets/seasons/cards/"*.jpg dist/assets/seasons/cards/
echo '=== Обновление только файлов справочника в Telegram Cloud ==='
if npx tgcloud push dist/; then
 echo '✅ Сезонные фотографии и карточки загружены.'
 if [ -f tgcloud/endpoints/odessaGuideViews.js ]; then
   cp -p tgcloud/endpoints/odessaGuideViews.js "$BACKUP/odessaGuideViews.js"
 fi
 cp "$WORK/tgcloud/endpoints/odessaGuideViews.js" tgcloud/endpoints/odessaGuideViews.js
 if npx tgcloud push tgcloud/endpoints/odessaGuideViews.js; then
   echo '✅ Счётчик посещений подключён в Telegram Cloud.'
 else
   echo '⚠️ Счётчик не удалось подключить, но страница справочника обновлена.'
 fi
 echo '✅ ГОТОВО! Закрой и заново открой справочник в Telegram.'
else
 cp -p "$BACKUP/index.html" dist/index.html
 echo '❌ Обновление Cloud не прошло. Прежний index.html восстановлен. Бот и процессы не изменялись.'
 exit 1
fi

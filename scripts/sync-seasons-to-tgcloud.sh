#!/usr/bin/env bash
# Odessa Online: refresh the existing Telegram Cloud web guide only.
# Does not modify Telegram Bot endpoints, radar, electricity or news processes.
set -Eeuo pipefail
cd "$HOME/OdessaOnlineGuideBot" || { echo '❌ Папка справочника не найдена'; exit 1; }
test -f dist/index.html || { echo '❌ Не найден dist/index.html'; exit 1; }
test -d tgcloud || { echo '❌ Не найден проект Telegram Cloud'; exit 1; }
for tool in node python curl; do command -v "$tool" >/dev/null || { echo "❌ Не найден $tool"; exit 1; }; done
BASE='https://raw.githubusercontent.com/dianakhron7-ai/odessa-online/main'
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/assets/seasons/cards"
echo '=== Загружаю 4 сезона и 8 тематических изображений ==='
for file in \
  seasonal.js seasonal.css \
  assets/seasons/autumn.jpg assets/seasons/winter.jpg assets/seasons/spring.jpg assets/seasons/summer.jpg \
  assets/seasons/cards/autumn-transport.jpg assets/seasons/cards/autumn-medicine.jpg \
  assets/seasons/cards/spring-transport.jpg assets/seasons/cards/spring-medicine.jpg \
  assets/seasons/cards/summer-transport.jpg assets/seasons/cards/summer-medicine.jpg \
  assets/seasons/cards/winter-transport.jpg assets/seasons/cards/winter-medicine.jpg; do
  curl --fail --location --silent --show-error --retry 2 --max-time 60 "$BASE/$file" -o "$WORK/$file" || {
    echo "❌ Не удалось скачать $file. Ничего не установлено."; exit 1;
  }
done
node --check "$WORK/seasonal.js" || { echo '❌ Ошибка JavaScript; ничего не установлено'; exit 1; }
python - "$WORK" <<'PY'
from pathlib import Path
import sys
w=Path(sys.argv[1])
for season in ('spring','summer','autumn','winter'):
 for file in [w/'assets/seasons'/f'{season}.jpg', w/'assets/seasons/cards'/f'{season}-transport.jpg', w/'assets/seasons/cards'/f'{season}-medicine.jpg']:
  b=file.read_bytes()
  assert len(b)>15000 and b[:2]==b'\xff\xd8',f'Изображение повреждено: {file}'
text=Path('dist/index.html').read_text(encoding='utf-8')
for token in ('<div id="app">','home-content','hero-title','const PHOTO_DATA=','const CITY = [','</head>','</body>'):
 assert token in text, 'Справочник отличается, ничего не меняю: '+token
if '<link rel="stylesheet" href="seasonal.css">' not in text:
 text=text.replace('</head>','<link rel="stylesheet" href="seasonal.css"></head>',1)
if '<script defer src="seasonal.js"></script>' not in text:
 text=text.replace('</body>','<script defer src="seasonal.js"></script></body>',1)
(w/'index.html').write_text(text,encoding='utf-8')
print('✅ Все 12 изображений и страница проверены.')
PY
BACKUP="$HOME/odessa-guide-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP"
cp -p dist/index.html "$BACKUP/index.html"
mkdir -p dist/assets/seasons/cards
cp "$WORK/index.html" dist/index.html
cp "$WORK/seasonal.js" dist/seasonal.js
cp "$WORK/seasonal.css" dist/seasonal.css
cp "$WORK/assets/seasons/"*.jpg dist/assets/seasons/
cp "$WORK/assets/seasons/cards/"*.jpg dist/assets/seasons/cards/
echo "✅ Резервная копия главной страницы: $BACKUP/index.html"
echo '=== Публикую только файлы сайта ==='
if npx tgcloud push dist/; then
 echo '✅ ГОТОВО: сезонные фотографии, новые карточки и глазик опубликованы.'
 echo 'Закрой и заново открой справочник в Telegram.'
else
 cp -p "$BACKUP/index.html" dist/index.html
 echo '❌ Облачная публикация не прошла. Прежняя страница восстановлена.'
 exit 1
fi

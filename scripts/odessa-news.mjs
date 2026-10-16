import fs from 'node:fs';
import path from 'node:path';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '-1004426768141';
const STATE_PATH = process.env.STATE_PATH || 'data/odessa-news-state.json';

const SOURCES = [
  'odessa_infonews',
  'odesacityofficial',
  'suspilneodesa',
];

const MAX_AGE_MS = 80 * 60 * 1000;
const KEEP_STATE_MS = 36 * 60 * 60 * 1000;
const MAX_PER_RUN = 2;

const STRONG_RE = /(вибух|взрыв|пожеж|пожар|дтп|аварі|авари|обстріл|обстрел|атак|влучан|попадан|руйнув|разруш|загин|погиб|поран|ранен|постраждал|пострад|затриман|задержан|викрил|выявил|хабар|взятк|стрілян|стрельб|вбив|убий|обвал|евакуац|эвакуац|врятув|спас|масов|массов|перекрит|перекрыт|без\s+світла|без\s+света|без\s+води|без\s+воды|аварійн|аварийн|шахрай|мошенн|напад|підпал|поджог|зруйн|поврежден|пошкоджен|обвал|обруш|знесл|снесл)/i;
const CITY_RE = /(\bодес[аиуі]\b|\bодесс[аеуы]\b|в\s+одесі|в\s+одессе|одеськ(?:ий|а|ому|ого)|одесск(?:ий|ая|ом|ого)|молдаванк|таїров|таиров|пересип|пересып|аркаді|аркади|черемуш|фонтан|котовськ|котовск|приморськ(?:ий)?\s+район|приморск(?:ий)?\s+район|київськ(?:ий)?\s+район|киевск(?:ий)?\s+район|хаджибейськ|хаджибейск|пересипськ|пересыпск|дерибас|ланжерон|отрад|французьк|французск|слободк|ближн(?:і|ие)\s+мельниц|центр\s+одес)/i;
const OUTSIDE_RE = /(ізмаїл|измаил|білгород[-\s]?дністров|белгород[-\s]?днестр|чорноморськ|черноморск|подільськ|подольск|роздільн|раздельн|березів|березов|ар[-\s]?циз|рені\b|рени\b|кілія|килия|болград|татарбунар|доброслав|южн(?:е|ий)|південн|овiдiопол|овидиопол|заток|сарат|теплодар|біляїв|беляев|вилков|кодим|балта|ананьїв|ананьев|любашів|любашев|савран|маяк(?:и|ах)|курисов)/i;
const AD_RE = /(реклам|промокод|розіграш|розыгрыш|знижк|скидк|купити|купить|донат|збір\s*(?:коштів|грошей)|сбор\s*(?:средств|денег)|підтримайте\s+канал|поддержите\s+канал)/i;
const PROFANITY_RE = /(ху[йеёяи]|пизд|еба[тн]|ёба|бля[дт]|сук[аи])/i;
const ALERT_NOISE_RE = /(повітряна\s+тривога|воздушная\s+тревога|відбій\s+(?:повітряної\s+)?тривоги|отбой\s+(?:воздушной\s+)?тревоги|бпла\s+(?:на|в\s+напрямку)|ракета\s+(?:курс|на)|балістик.*(?:курс|загроза)|баллистик.*(?:курс|угроза))/i;
const SERVICE_LINE_RE = /(прислать\s+новость|надіслати\s+новину|предложить\s+новость|підписат|подписат|сайт\s*\||youtube|instagram|tiktok|facebook|whatsapp|viber|радар\s+угроз|радар\s+загроз|з\s+питань\s+реклами|по\s+вопросам\s+рекламы|співпрац|сотрудничеств)/i;

const STOP = new Set([
  'одеса','одесса','одесі','одессе','одеси','одессы','місто','город','сьогодні','сегодня','також','также','було','было','після','после','через','який','который','вона','вони','они','для','про','при','что','щоб','это','цей','этот','його','его','її','ее','буде','будет','уже','вже','тому','тогда','повідомив','сообщил','повідомили','сообщили'
]);

function decodeHtml(value = '') {
  let s = String(value)
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '');

  s = s.replace(/&#(x[0-9a-f]+|\d+);/gi, (_, code) => {
    const n = code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code);
    return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
  });

  const named = { nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' };
  s = s.replace(/&(nbsp|amp|quot|apos|lt|gt);/gi, (_, key) => named[key.toLowerCase()] || '');
  return s.replace(/\u200b|\u200c|\u200d|\ufeff/g, '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n\s*\n\s*\n+/g, '\n\n').trim();
}

function cleanPost(raw = '') {
  const lines = decodeHtml(raw)
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean)
    .filter(line => !SERVICE_LINE_RE.test(line))
    .filter(line => !/https?:\/\/\S+/i.test(line))
    .filter(line => !/^@\w+$/i.test(line));

  return lines
    .join('\n')
    .replace(/(?:👉|➡️|⬇️|✅)\s*@\w+/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function safePhoto(value = '') {
  try {
    const url = new URL(String(value).trim());
    if (url.protocol !== 'https:') return null;
    if (!/(?:^|\.)telesco\.pe$|(?:^|\.)cdn-telegram\.org$/i.test(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function parseTelegramPage(html, channel) {
  const out = [];
  const blocks = String(html || '').split(/(?=<div\b[^>]*data-post=)/i);

  for (const block of blocks) {
    const post = block.match(/data-post="([^"/]+)\/(\d+)"/i);
    if (!post || post[1].toLowerCase() !== channel.toLowerCase()) continue;

    const raw = block.match(/<div\b[^>]*class="[^"]*tgme_widget_message_text\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1] || '';
    const stamp = block.match(/<time\b[^>]*datetime="([^"]+)"/i)?.[1] || '';
    const photoRaw = block.match(/class="[^"]*tgme_widget_message_photo_wrap\b[^\n]*?background-image:\s*url\(['"]([^'"]+)['"]\)/i)?.[1] || '';

    const text = cleanPost(raw);
    const date = Date.parse(stamp);
    if (!text || !Number.isFinite(date)) continue;

    out.push({
      channel,
      id: Number(post[2]),
      date,
      text,
      image: safePhoto(decodeHtml(photoRaw)),
    });
  }

  return out;
}

function isOdesaCity(item) {
  if (CITY_RE.test(item.text)) return true;
  if (OUTSIDE_RE.test(item.text)) return false;
  if (item.channel === 'odesacityofficial') return true;
  if (item.channel === 'odessa_infonews' && /\b(?:вул\.?|улиц[аеы]?|просп(?:ект|\.)|пров\.?|пер\.?|площа|площадь)\s+/i.test(item.text)) return true;
  return false;
}

function isStrong(item) {
  if (!STRONG_RE.test(item.text)) return false;
  if (AD_RE.test(item.text) || PROFANITY_RE.test(item.text)) return false;
  if (ALERT_NOISE_RE.test(item.text) && item.text.length < 240) return false;
  return isOdesaCity(item);
}

function tokens(text = '') {
  return new Set((String(text).toLowerCase().match(/[а-яіїєґa-z0-9]{4,}/gi) || []).filter(w => !STOP.has(w)));
}

function similar(a, b) {
  const A = tokens(a);
  const B = tokens(b);
  if (A.size < 4 || B.size < 4) return false;
  let common = 0;
  for (const w of A) if (B.has(w)) common++;
  return common >= 4 && common / Math.min(A.size, B.size) >= 0.58;
}

function escapeHtml(value = '') {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function iconFor(text = '') {
  if (/(вибух|взрыв|обстріл|обстрел|атак|влучан|попадан|пошкоджен|поврежден)/i.test(text)) return '🚨';
  if (/(пожеж|пожар|підпал|поджог)/i.test(text)) return '🔥';
  if (/(дтп|аварі|авари)/i.test(text)) return '🚗';
  if (/(затриман|задержан|викрил|хабар|взятк|шахрай|мошенн|напад|стрілян|стрельб)/i.test(text)) return '🚔';
  if (/(без\s+світла|без\s+света|без\s+води|без\s+воды|аварійн|аварийн)/i.test(text)) return '⚡';
  if (/(врятув|спас|евакуац|эвакуац)/i.test(text)) return '🆘';
  return '⚠️';
}

function headline(text = '') {
  const oneLine = String(text).replace(/\s+/g, ' ').trim();
  const first = (oneLine.split(/(?<=[.!?])\s+/)[0] || oneLine).replace(/^[^\p{L}\p{N}]+/u, '').trim();
  return first.length > 110 ? `${first.slice(0, 107).trimEnd()}…` : first;
}

function body(text = '', head = '') {
  const normalizedHead = head.replace(/…$/, '').trim();
  let rest = String(text).trim();
  if (normalizedHead && rest.replace(/\s+/g, ' ').startsWith(normalizedHead)) {
    const idx = rest.indexOf(normalizedHead);
    if (idx >= 0) rest = rest.slice(idx + normalizedHead.length).replace(/^[\s.!?:;—–-]+/, '').trim();
  }
  if (!rest) return '';
  return rest.length > 650 ? `${rest.slice(0, 647).trimEnd()}…` : rest;
}

function captionFor(item) {
  const icon = iconFor(item.text);
  const head = headline(item.text);
  const rest = body(item.text, head);
  let caption = `${icon} <b>ОДЕССА | ВАЖНО</b>\n\n<b>${escapeHtml(head)}</b>`;
  if (rest) caption += `\n\n${escapeHtml(rest)}`;
  caption += '\n\n⚓️ <b>ОДЕССА Online</b>';
  return caption.length > 1010 ? `${caption.slice(0, 1007)}…` : caption;
}

function readState() {
  try {
    const data = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    return { sent: Array.isArray(data.sent) ? data.sent : [] };
  } catch {
    return { sent: [] };
  }
}

function writeState(state) {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

async function telegramCall(method, options = {}) {
  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.description || `Telegram ${method}: HTTP ${response.status}`);
  return data.result;
}

async function sendText(caption) {
  return telegramCall('sendMessage', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text: caption,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });
}

async function sendPhoto(item, caption) {
  if (!item.image) return sendText(caption);

  try {
    const imageResponse = await fetch(item.image, {
      headers: {
        'user-agent': 'Mozilla/5.0',
        referer: 'https://t.me/',
      },
    });
    if (!imageResponse.ok) throw new Error(`image HTTP ${imageResponse.status}`);
    const type = imageResponse.headers.get('content-type') || 'image/jpeg';
    if (!type.startsWith('image/')) throw new Error(`not an image: ${type}`);
    const bytes = await imageResponse.arrayBuffer();
    const form = new FormData();
    form.set('chat_id', CHAT_ID);
    form.set('caption', caption);
    form.set('parse_mode', 'HTML');
    form.set('photo', new Blob([bytes], { type }), type.includes('png') ? 'news.png' : 'news.jpg');
    return telegramCall('sendPhoto', { method: 'POST', body: form });
  } catch (downloadError) {
    try {
      return telegramCall('sendPhoto', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: CHAT_ID, photo: item.image, caption, parse_mode: 'HTML' }),
      });
    } catch {
      console.warn(`Photo failed for ${item.channel}/${item.id}: ${downloadError.message}`);
      return sendText(caption);
    }
  }
}

async function loadSource(channel) {
  const response = await fetch(`https://t.me/s/${channel}`, {
    headers: {
      accept: 'text/html,application/xhtml+xml',
      'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/129 Safari/537.36',
    },
  });
  if (!response.ok) throw new Error(`${channel}: HTTP ${response.status}`);
  return parseTelegramPage(await response.text(), channel);
}

async function main() {
  if (!BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN is missing');

  const now = Date.now();
  const state = readState();
  state.sent = state.sent.filter(x => Number(x.ts) >= now - KEEP_STATE_MS).slice(-120);

  const candidates = [];
  const issues = [];

  for (const channel of SOURCES) {
    try {
      const items = await loadSource(channel);
      for (const item of items) {
        if (item.date < now - MAX_AGE_MS || item.date > now + 5 * 60 * 1000) continue;
        if (!isStrong(item)) continue;
        candidates.push(item);
      }
    } catch (error) {
      issues.push(String(error?.message || error));
    }
  }

  candidates.sort((a, b) => b.date - a.date);
  const sentThisRun = [];

  for (const item of candidates) {
    if (sentThisRun.length >= MAX_PER_RUN) break;
    const key = `${item.channel}:${item.id}`;
    if (state.sent.some(x => x.key === key)) continue;
    if (state.sent.some(x => similar(x.text, item.text))) continue;
    if (sentThisRun.some(x => similar(x.text, item.text))) continue;

    const caption = captionFor(item);
    const message = await sendPhoto(item, caption);
    const record = { key, ts: now, text: item.text.slice(0, 500), messageId: message?.message_id || null };
    state.sent.push(record);
    sentThisRun.push({ ...record, channel: item.channel, id: item.id });
  }

  state.sent = state.sent.filter(x => Number(x.ts) >= now - KEEP_STATE_MS).slice(-120);
  writeState(state);

  console.log(JSON.stringify({
    ok: true,
    checkedSources: SOURCES,
    candidates: candidates.length,
    sent: sentThisRun.map(({ channel, id, messageId }) => ({ channel, id, messageId })),
    issues,
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

import fs from 'node:fs';
import path from 'node:path';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '-1004426768141';
const SOURCES = (process.env.ALERT_SOURCES || 'odessagolovna')
  .split(',')
  .map(s => s.trim().replace(/^@/, ''))
  .filter(Boolean);
const STATE_PATH = process.env.ALERT_STATE_PATH || 'data/odessa-alert-state.json';
const CHECK_INTERVAL_MS = Number(process.env.CHECK_INTERVAL_MS || 10000);
const RUN_FOR_MS = Number(process.env.RUN_FOR_MS || 3540000);
const RECENT_KEEP_MS = 2 * 60 * 60 * 1000;
const CONTEXT_MS = 45 * 60 * 1000;

if (!BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN is missing');

const REGION_RE = /(?:одес[аиуыі]|одеськ|одесск|одещин|таїров|таиров|черемуш|аркаді|аркади|фонтан|молдаванк|пересип|пересып|котовськ|котовск|чорноморськ|черноморск|білгород[-\s]?дністров|белгород[-\s]?днестр|подільськ|подольск|роздільн|раздельн|березів|березов|ар[-\s]?циз|рені\b|рени\b|кілія|килия|болград|татарбунар|доброслав|південн|южн(?:е|ий)|овiдiопол|овидиопол|заток|сарат|теплодар|біляїв|беляев|вилков|кодим|балта|ананьїв|ананьев|любашів|любашев|савран|маяк(?:и|ах)|курисов)/i;
const ALERT_RE = /(повітряна\s+тривога|воздушн(?:ая|ой)\s+тревог|\bтривога\b|\bтревога\b)/i;
const CLEAR_RE = /(\bвідбій\b|\bотбой\b)/i;
const THREAT_RE = /(шахед|shahed|бпла|дрон|ракета|ракетн|балістик|баллистик|каб\b|керован.*авіабомб|управляем.*авиабомб|реактивн|крилат.*ракет|крылат.*ракет|міг-?31|миг-?31)/i;
const LIVE_CUE_RE = /(загроз|угроз|ціл(?:ь|і|ей)|цел(?:ь|и|ей)|курс|напрям|направлен|рухає|рухают|движ|лет(?:ить|ят|ит)?|прямує|прямують|йде|ид[её]т|в\s+сторон|у\s+бік|на\s+одес|до\s+одес|над\s+одес|в\s+район|увага|внимание|пуск|зліт|взл[её]т|заходить|наближа|приближа|мор[ея]|узбереж|побереж)/i;
const AD_RE = /(реклам|промокод|розіграш|розыгрыш|знижк|скидк|купити|купить|продаж|продам|ваканс|партнер|спонсор)/i;
const COLLECTION_RE = /(донат|збір\s*(?:коштів|грошей)?|сбор\s*(?:средств|денег)?|monobank|privat24|paypal|банка|банку|карт[аы]\s+бан|реквізит|реквизит)/i;
const QUESTION_RE = /(опитуван|опрос|питання|вопрос|підкажіть|подскажите|ваша\s+думка|ваше\s+мнение|хто\s+знає|кто\s+знает|як\s+ви\s+думаєте|как\s+вы\s+думаете)/i;
const NEWS_RE = /(новин|новост|загин|погиб|поран|ранен|постраждал|пострад|наслідк|последств|внаслідок|в\s+результат|пошкоджен|поврежден|зруйн|разруш|знищен|уничтожен|дснс|поліці|полици|суд|затриман|задержан|рятувальник|спасател|ліквідувал|ликвидировал|комунальник|коммунальник|дтп|аварі[яї]|авари[яи]|пожеж|пожар)/i;
const SERVICE_RE = /(змінив.*фото|изменил.*фото|змінив.*назв|изменил.*назв|joined the group|left the group|channel title)/i;
const PROMO_RE = /(підписат|подписат|youtube|instagram|tiktok|facebook|whatsapp|viber|з\s+питань\s+реклами|по\s+вопросам\s+рекламы|співпрац|сотрудничеств|основний\s+тг|основной\s+тг)/i;

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
  return s
    .replace(/&(nbsp|amp|quot|apos|lt|gt);/gi, (_, key) => named[key.toLowerCase()] || '')
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
}

function cleanPost(raw = '') {
  return decodeHtml(raw)
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => !PROMO_RE.test(line))
    .filter(line => !/https?:\/\/\S+|t\.me\/\S+/i.test(line))
    .filter(line => !/^@\w+$/i.test(line))
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

function parseTelegramPage(html, source) {
  const out = [];
  const blocks = String(html || '').split(/(?=<div\b[^>]*data-post=)/i);

  for (const block of blocks) {
    const post = block.match(/data-post="([^"/]+)\/(\d+)"/i);
    if (!post || post[1].toLowerCase() !== source.toLowerCase()) continue;

    const raw = block.match(/<div\b[^>]*class="[^"]*tgme_widget_message_text\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1] || '';
    const stamp = block.match(/<time\b[^>]*datetime="([^"]+)"/i)?.[1] || '';
    const photoRaw = block.match(/class="[^"]*tgme_widget_message_photo_wrap\b[^\n]*?background-image:\s*url\(['"]([^'"]+)['"]\)/i)?.[1] || '';
    const text = cleanPost(raw);
    const date = Date.parse(stamp);

    if (!text || !Number.isFinite(date)) continue;
    out.push({ source, id: Number(post[2]), date, text, image: safePhoto(decodeHtml(photoRaw)) });
  }

  return out.sort((a, b) => a.id - b.id);
}

function defaultState() {
  return {
    initializedBySource: {},
    lastIdBySource: {},
    contextUntilBySource: {},
    lastStatus: null,
    recentSent: [],
  };
}

function readState() {
  try {
    const data = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    return {
      ...defaultState(),
      initializedBySource: data.initializedBySource && typeof data.initializedBySource === 'object' ? data.initializedBySource : {},
      lastIdBySource: data.lastIdBySource && typeof data.lastIdBySource === 'object' ? data.lastIdBySource : {},
      contextUntilBySource: data.contextUntilBySource && typeof data.contextUntilBySource === 'object' ? data.contextUntilBySource : {},
      lastStatus: data.lastStatus === 'alert' || data.lastStatus === 'clear' ? data.lastStatus : null,
      recentSent: Array.isArray(data.recentSent) ? data.recentSent : [],
    };
  } catch {
    return defaultState();
  }
}

function writeState(state) {
  state.recentSent = (state.recentSent || [])
    .filter(x => Date.now() - Number(x.at || 0) <= RECENT_KEEP_MS)
    .slice(-120);
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function kindOf(text) {
  if (CLEAR_RE.test(text)) return 'clear';
  if (ALERT_RE.test(text)) return 'alert';
  if (THREAT_RE.test(text)) return 'threat';
  return null;
}

function isBlocked(text) {
  return AD_RE.test(text)
    || COLLECTION_RE.test(text)
    || QUESTION_RE.test(text)
    || SERVICE_RE.test(text)
    || NEWS_RE.test(text);
}

function isRadarPost(item, state) {
  const { text, source } = item;
  const kind = kindOf(text);
  if (!kind || isBlocked(text)) return false;

  const regional = REGION_RE.test(text);
  const contextActive = Number(state.contextUntilBySource[source] || 0) >= Date.now();

  if (kind === 'alert' || kind === 'clear') {
    return regional || /област|район/i.test(text);
  }

  return THREAT_RE.test(text)
    && LIVE_CUE_RE.test(text)
    && (regional || contextActive);
}

function normalizeText(text = '') {
  return String(text)
    .toLowerCase()
    .replace(/одеса|одесса/g, 'odesa')
    .replace(/повітряна\s+тривога|воздушная\s+тревога/g, 'alert')
    .replace(/відбій|отбой/g, 'clear')
    .replace(/шахед|shahed|бпла|дрон/g, 'drone')
    .replace(/балістик\w*|баллистик\w*/g, 'ballistic')
    .replace(/ракета|ракетн\w*/g, 'missile')
    .replace(/[^a-zа-яіїєґ0-9]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSet(text = '') {
  const stop = new Set(['odesa','alert','увага','внимание','зараз','сейчас','будь','ласка','пожалуйста','повідомляють','сообщают','рухається','движется']);
  return new Set(normalizeText(text).split(' ').filter(w => w.length >= 3 && !stop.has(w)));
}

function textVerySimilar(a, b) {
  const A = tokenSet(a);
  const B = tokenSet(b);
  if (!A.size || !B.size) return normalizeText(a) === normalizeText(b);
  let common = 0;
  for (const w of A) if (B.has(w)) common++;
  return common >= 3 && common / Math.min(A.size, B.size) >= 0.72;
}

function duplicateReason(item, state) {
  const recent = (state.recentSent || []).filter(x => Date.now() - Number(x.at || 0) <= RECENT_KEEP_MS);
  if (recent.some(x => x.source === item.source && Number(x.id) === item.id)) return 'same-source-id';
  if (recent.some(x => textVerySimilar(x.text || '', item.text))) return 'similar-text';
  return null;
}

function escapeHtml(value = '') {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ODESSA_TRANSIT_BOW_BACKUP_V1
function transitBowForDisplay(text) {
  let result=String(text||'');
  const edits=[];
  for (const m of result.matchAll(/транз[иі]т[\p{L}]*/giu)) {
    const at=m.index+m[0].length;
    const next=/^[ \t]*(🏹|✈️|✈|🛩️|🛩|🛫|🛬)/u.exec(result.slice(at));
    if(next?.[1]==='🏹')continue;
    edits.push({at,length:next?next[0].length:0});
  }
  for(const e of edits.reverse())result=result.slice(0,e.at)+' 🏹'+result.slice(e.at+e.length);
  return result;
}

function copiedCaption(item) {
  let text = escapeHtml(transitBowForDisplay(item.text));
  if (text.length > 930) text = `${text.slice(0, 927).trimEnd()}…`;
  return `${text}\n\n⚓️ <b>ОДЕССА Online</b>`;
}

async function telegramCall(method, payload) {
  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.description || `Telegram ${method}: HTTP ${response.status}`);
  return data.result;
}

async function sendCopied(item) {
  const caption = copiedCaption(item);
  if (item.image) {
    try {
      return await telegramCall('sendPhoto', {
        chat_id: CHAT_ID,
        photo: item.image,
        caption,
        parse_mode: 'HTML',
      });
    } catch (error) {
      console.error(JSON.stringify({ photoFallback: true, source: item.source, sourceId: item.id, error: String(error?.message || error) }));
    }
  }
  return telegramCall('sendMessage', {
    chat_id: CHAT_ID,
    text: caption,
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
  });
}

async function fetchItems(source) {
  const response = await fetch(`https://t.me/s/${source}`, {
    headers: { Accept: 'text/html', 'User-Agent': 'Mozilla/5.0 OdessaOnlineAlertBackup/5.0' },
  });
  if (!response.ok) throw new Error(`${source}: HTTP ${response.status}`);
  return parseTelegramPage(await response.text(), source);
}

async function scanOnce(state) {
  const candidates = [];
  const issues = [];
  let changed = false;

  for (const source of SOURCES) {
    try {
      const items = await fetchItems(source);
      if (!items.length) continue;
      const newest = items.at(-1).id;

      if (!state.initializedBySource[source]) {
        state.initializedBySource[source] = true;
        state.lastIdBySource[source] = newest;
        const recentRadar = [...items].reverse().find(item => Date.now() - item.date <= CONTEXT_MS && isRadarPost(item, state));
        state.contextUntilBySource[source] = recentRadar && kindOf(recentRadar.text) !== 'clear' ? Date.now() + CONTEXT_MS : 0;
        changed = true;
        console.log(JSON.stringify({ baseline: newest, source, contextActive: state.contextUntilBySource[source] > Date.now() }));
        continue;
      }

      const lastId = Number(state.lastIdBySource[source] || 0);
      for (const item of items) if (item.id > lastId) candidates.push(item);
      if (newest > lastId) {
        state.lastIdBySource[source] = newest;
        changed = true;
      }
    } catch (error) {
      issues.push(String(error?.message || error));
    }
  }

  candidates.sort((a, b) => a.date - b.date || a.id - b.id);

  let sent = 0;
  for (const item of candidates) {
    if (!isRadarPost(item, state)) {
      console.log(JSON.stringify({ skippedNonRadar: true, source: item.source, sourceId: item.id }));
      continue;
    }

    const duplicate = duplicateReason(item, state);
    if (duplicate) {
      console.log(JSON.stringify({ skippedDuplicate: true, reason: duplicate, source: item.source, sourceId: item.id }));
      continue;
    }

    const result = await sendCopied(item);
    const kind = kindOf(item.text);
    console.log(JSON.stringify({ sent: true, source: item.source, sourceId: item.id, kind, messageId: result?.message_id || null, hasPhoto: Boolean(item.image) }));

    if (kind === 'clear') state.contextUntilBySource[item.source] = 0;
    else state.contextUntilBySource[item.source] = Date.now() + CONTEXT_MS;
    if (kind === 'alert' || kind === 'clear') state.lastStatus = kind;
    state.recentSent.push({ at: Date.now(), source: item.source, id: item.id, kind, text: item.text });
    changed = true;
    sent++;
  }

  if (changed) writeState(state);
  return { checkedSources: SOURCES.length, candidates: candidates.length, sent, issues };
}

const state = readState();
const started = Date.now();
let cycles = 0;
let sentTotal = 0;

while (Date.now() - started < RUN_FOR_MS) {
  try {
    const result = await scanOnce(state);
    cycles++;
    sentTotal += result.sent || 0;
    if (result.issues?.length) console.error(JSON.stringify({ issues: result.issues }));
  } catch (error) {
    console.error(JSON.stringify({ error: String(error?.message || error), cycle: cycles + 1 }));
  }

  const remaining = RUN_FOR_MS - (Date.now() - started);
  if (remaining <= 0) break;
  await new Promise(resolve => setTimeout(resolve, Math.min(CHECK_INTERVAL_MS, remaining)));
}

console.log(JSON.stringify({
  ok: true,
  radarOnly: true,
  sources: SOURCES,
  intervalMs: CHECK_INTERVAL_MS,
  cycles,
  sentTotal,
  lastIdBySource: state.lastIdBySource,
}));

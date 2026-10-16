import fs from 'node:fs';
import path from 'node:path';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '-1004426768141';
const SOURCES = (process.env.ALERT_SOURCES || 'trevoga_odessa_novini_novosti,odessa_inform,odessagolovna')
  .split(',')
  .map(s => s.trim().replace(/^@/, ''))
  .filter(Boolean);
const STATE_PATH = process.env.ALERT_STATE_PATH || 'data/odessa-alert-state.json';
const CHECK_INTERVAL_MS = Number(process.env.CHECK_INTERVAL_MS || 20000);
const RUN_FOR_MS = Number(process.env.RUN_FOR_MS || 3540000);
const RECENT_KEEP_MS = 2 * 60 * 60 * 1000;

if (!BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN is missing');

const CITY_RE = /(?:^|[^а-яіїєґa-z])(одеса|одесс[ауы]|м\.?\s*одеса|г\.?\s*одесса|таїров|таиров|черемуш|аркаді|аркади|фонтан|молдаванк|пересип|пересып|котовськ|котовск|черноморк|чорноморк|совіньйон|совиньон|центр\s+одес|київськ(?:ий)?\s+район|киевск(?:ий)?\s+район|приморськ(?:ий)?\s+район|приморск(?:ий)?\s+район|хаджибейськ(?:ий)?\s+район|хаджибейск(?:ий)?\s+район|пересипськ(?:ий)?\s+район|пересыпск(?:ий)?\s+район)(?:$|[^а-яіїєґa-z])/i;
const ALERT_RE = /(повітряна\s+тривога|воздушн(?:ая|ой)\s+тревог|тривога\s+в\s+одесі|тревога\s+в\s+одессе)/i;
const CLEAR_RE = /(відбій(?:\s+повітряної)?\s+тривоги|отбой(?:\s+воздушной)?\s+тревоги|відбій\b|отбой\b)/i;
const THREAT_RE = /(шахед|shahed|бпла|дрон|ракета|ракетн|балістик|баллистик|каб\b|керован.*авіабомб|управляем.*авиабомб|реактивн|крилат.*ракет|крылат.*ракет)/i;
const AD_RE = /(реклам|промокод|розіграш|розыгрыш|донат|збір\s*(?:коштів|грошей)|сбор\s*(?:средств|денег)|підписуй|подписыв|підтримайте\s+канал|поддержите\s+канал|monobank|privat24|paypal)/i;
const SERVICE_RE = /(змінив.*фото|изменил.*фото|змінив.*назв|изменил.*назв|joined the group|left the group|channel title)/i;
const SOURCE_PROMO_RE = /(моніторинг\s+одеса|мониторинг\s+одесса|підписат|подписат|сайт\s*\||youtube|instagram|tiktok|facebook|whatsapp|viber|з\s+питань\s+реклами|по\s+вопросам\s+рекламы|співпрац|сотрудничеств)/i;

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
    .filter(line => !SOURCE_PROMO_RE.test(line))
    .filter(line => !/https?:\/\/\S+/i.test(line))
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
    out.push({
      source,
      id: Number(post[2]),
      date,
      text,
      image: safePhoto(decodeHtml(photoRaw)),
    });
  }

  return out.sort((a, b) => a.id - b.id);
}

function defaultState() {
  return {
    initializedBySource: {},
    lastIdBySource: {},
    lastStatus: null,
    recentSent: [],
  };
}

function readState() {
  try {
    const data = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    const state = defaultState();
    state.initializedBySource = data.initializedBySource && typeof data.initializedBySource === 'object' ? data.initializedBySource : {};
    state.lastIdBySource = data.lastIdBySource && typeof data.lastIdBySource === 'object' ? data.lastIdBySource : {};
    state.lastStatus = data.lastStatus === 'alert' || data.lastStatus === 'clear' ? data.lastStatus : null;
    state.recentSent = Array.isArray(data.recentSent) ? data.recentSent : [];

    // Compatibility with the old single-source state.
    if (data.initialized && Number(data.lastId || 0) > 0) {
      const legacySource = 'trevoga_odessa_novini_novosti';
      state.initializedBySource[legacySource] = true;
      state.lastIdBySource[legacySource] = Number(data.lastId);
    }

    return state;
  } catch {
    return defaultState();
  }
}

function writeState(state) {
  state.recentSent = (state.recentSent || []).filter(x => Date.now() - Number(x.at || 0) <= RECENT_KEEP_MS).slice(-100);
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function kindOf(text) {
  if (CLEAR_RE.test(text)) return 'clear';
  if (THREAT_RE.test(text)) return 'threat';
  if (ALERT_RE.test(text)) return 'alert';
  return null;
}

function threatType(text) {
  if (/(шахед|shahed|бпла|дрон)/i.test(text)) return 'drone';
  if (/балістик|баллистик/i.test(text)) return 'ballistic';
  if (/каб\b|авіабомб|авиабомб/i.test(text)) return 'airbomb';
  if (/реактивн/i.test(text)) return 'reactive';
  if (/ракета|ракетн|крилат.*ракет|крылат.*ракет/i.test(text)) return 'missile';
  return null;
}

function factSet(text) {
  const t = String(text).toLowerCase();
  const facts = new Set();
  const type = threatType(t);
  if (type) facts.add(`type:${type}`);

  const patterns = [
    ['loc:tairova', /таїров|таиров/],
    ['loc:cheremushki', /черемуш/],
    ['loc:arkadia', /аркаді|аркади/],
    ['loc:fontan', /фонтан/],
    ['loc:moldavanka', /молдаванк/],
    ['loc:peresyp', /пересип|пересып/],
    ['loc:kotovskogo', /котовськ|котовск/],
    ['loc:chernomorka', /черноморк|чорноморк/],
    ['loc:sovinyon', /совіньйон|совиньон/],
    ['loc:center', /центр\s+одес|центр\s+города/],
    ['dir:sea', /з\s+моря|с\s+моря|від\s+моря|от\s+моря|над\s+морем/],
    ['dir:north', /північ|север/],
    ['dir:south', /південь|юг/],
    ['dir:east', /схід|восток/],
    ['dir:west', /захід|запад/],
  ];

  for (const [key, re] of patterns) if (re.test(t)) facts.add(key);

  const count = t.match(/\b([1-9]\d?)\s*(?:бпла|шахед(?:и|ів|ов)?|дрон(?:и|ів|ов)?|ракет(?:и|ы)?)/i)?.[1];
  if (count) facts.add(`count:${count}`);
  if (/груп(?:а|ою|ой|и)\s+(?:бпла|шахед|дрон)/i.test(t)) facts.add('count:group');
  if (/(декілька|несколько)\s+(?:бпла|шахед|дрон|ракет)/i.test(t)) facts.add('count:several');

  return facts;
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
  const stop = new Set(['odesa','alert','увага','внимание','зараз','сейчас','будь','ласка','пожалуйста','уважно','уважно','повідомляють','сообщают','рухається','движется']);
  return new Set(normalizeText(text).split(' ').filter(w => w.length >= 3 && !stop.has(w)));
}

function textVerySimilar(a, b) {
  const A = tokenSet(a);
  const B = tokenSet(b);
  if (!A.size || !B.size) return false;
  let common = 0;
  for (const w of A) if (B.has(w)) common++;
  return common >= 3 && common / Math.min(A.size, B.size) >= 0.72;
}

function isSubsetOf(setA, setB) {
  for (const value of setA) if (!setB.has(value)) return false;
  return true;
}

function duplicateReason(item, kind, state) {
  const now = Date.now();
  const currentFacts = factSet(item.text);
  const currentType = threatType(item.text);

  for (const prev of state.recentSent || []) {
    const age = now - Number(prev.at || 0);
    if (age < 0 || age > RECENT_KEEP_MS) continue;

    if ((kind === 'alert' || kind === 'clear') && prev.kind === kind && age <= 30 * 60 * 1000) {
      return 'same-status';
    }

    if (normalizeText(prev.text) === normalizeText(item.text)) return 'same-text';
    if (textVerySimilar(prev.text, item.text)) return 'very-similar';

    if (kind === 'threat' && prev.kind === 'threat' && age <= 45 * 60 * 1000) {
      const prevType = threatType(prev.text);
      if (currentType && prevType === currentType) {
        const prevFacts = factSet(prev.text);
        const currentDetails = new Set([...currentFacts].filter(x => !x.startsWith('type:')));
        const prevDetails = new Set([...prevFacts].filter(x => !x.startsWith('type:')));

        // If the new message adds no new direction/location/count detail, treat it as a duplicate.
        if (currentDetails.size === 0 && prevDetails.size === 0) return 'same-threat-generic';
        if (currentDetails.size > 0 && isSubsetOf(currentDetails, prevDetails)) return 'same-threat-no-new-facts';
      }
    }
  }

  return null;
}

function escapeHtml(value = '') {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function copiedCaption(item) {
  let text = escapeHtml(item.text);
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
    headers: { Accept: 'text/html', 'User-Agent': 'Mozilla/5.0 OdessaOnlineAlertBot/3.0' },
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
        changed = true;
        console.log(JSON.stringify({ baseline: newest, source }));
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
    const kind = kindOf(item.text);

    if (!CITY_RE.test(item.text) || !kind || AD_RE.test(item.text) || SERVICE_RE.test(item.text)) continue;

    const duplicate = duplicateReason(item, kind, state);
    if (duplicate) {
      console.log(JSON.stringify({ skippedDuplicate: true, reason: duplicate, source: item.source, sourceId: item.id }));
      continue;
    }

    const result = await sendCopied(item);
    console.log(JSON.stringify({ sent: true, source: item.source, sourceId: item.id, kind, messageId: result?.message_id || null, copied: true, hasPhoto: Boolean(item.image) }));

    if (kind === 'alert' || kind === 'clear') state.lastStatus = kind;
    state.recentSent.push({
      at: Date.now(),
      source: item.source,
      id: item.id,
      kind,
      text: item.text,
    });
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

console.log(JSON.stringify({ ok: true, copiedFromSources: true, sources: SOURCES, intervalMs: CHECK_INTERVAL_MS, cycles, sentTotal, lastIdBySource: state.lastIdBySource }));

import fs from 'node:fs';
import path from 'node:path';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '-1004426768141';
const SOURCE = process.env.ALERT_SOURCE || 'trevoga_odessa_novini_novosti';
const STATE_PATH = process.env.ALERT_STATE_PATH || 'data/odessa-alert-state.json';
const CHECK_INTERVAL_MS = Number(process.env.CHECK_INTERVAL_MS || 20000);
const RUN_FOR_MS = Number(process.env.RUN_FOR_MS || 840000);

if (!BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN is missing');

const CITY_RE = /(?:^|[^а-яіїєґa-z])(одеса|одесс[ауы]|м\.?\s*одеса|г\.?\s*одесса)(?:$|[^а-яіїєґa-z])/i;
const ALERT_RE = /(повітряна\s+тривога|воздушн(?:ая|ой)\s+тревог|тривога\s+в\s+одесі|тревога\s+в\s+одессе)/i;
const CLEAR_RE = /(відбій(?:\s+повітряної)?\s+тривоги|отбой(?:\s+воздушной)?\s+тревоги|відбій\b|отбой\b)/i;
const THREAT_RE = /(шахед|shahed|бпла|дрон|ракета|ракетн|балістик|баллистик|каб\b|керован.*авіабомб|управляем.*авиабомб|реактивн|крилат.*ракет|крылат.*ракет)/i;
const AD_RE = /(реклам|промокод|розіграш|розыгрыш|донат|збір\s*(?:коштів|грошей)|сбор\s*(?:средств|денег)|підписуй|подписыв|підтримайте\s+канал|поддержите\s+канал)/i;
const SERVICE_RE = /(змінив.*фото|изменил.*фото|змінив.*назв|изменил.*назв|joined the group|left the group|channel title)/i;

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
    .filter(line => !/https?:\/\/\S+/i.test(line))
    .filter(line => !/^@\w+$/i.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseTelegramPage(html) {
  const out = [];
  const blocks = String(html || '').split(/(?=<div\b[^>]*data-post=)/i);
  for (const block of blocks) {
    const post = block.match(/data-post="([^"/]+)\/(\d+)"/i);
    if (!post || post[1].toLowerCase() !== SOURCE.toLowerCase()) continue;
    const raw = block.match(/<div\b[^>]*class="[^"]*tgme_widget_message_text\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1] || '';
    const stamp = block.match(/<time\b[^>]*datetime="([^"]+)"/i)?.[1] || '';
    const text = cleanPost(raw);
    const date = Date.parse(stamp);
    if (!text || !Number.isFinite(date)) continue;
    out.push({ id: Number(post[2]), date, text });
  }
  return out.sort((a, b) => a.id - b.id);
}

function readState() {
  try {
    const data = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    return {
      initialized: Boolean(data.initialized),
      lastId: Number(data.lastId || 0),
      lastStatus: data.lastStatus === 'alert' || data.lastStatus === 'clear' ? data.lastStatus : null,
    };
  } catch {
    return { initialized: false, lastId: 0, lastStatus: null };
  }
}

function writeState(state) {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function kindOf(text) {
  if (CLEAR_RE.test(text)) return 'clear';
  if (ALERT_RE.test(text)) return 'alert';
  if (THREAT_RE.test(text)) return 'threat';
  return null;
}

function threatName(text) {
  if (/(шахед|shahed)/i.test(text)) return 'Шахед';
  if (/бпла|дрон/i.test(text)) return 'БПЛА';
  if (/балістик|баллистик/i.test(text)) return 'баллистическая угроза';
  if (/каб\b|авіабомб|авиабомб/i.test(text)) return 'авиационная угроза';
  if (/реактивн/i.test(text)) return 'реактивная угроза';
  if (/ракета|ракетн/i.test(text)) return 'ракета';
  return null;
}

function escapeHtml(value = '') {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function postTime(ms) {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Kyiv',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(ms));
}

function compactDetails(text = '') {
  const lines = String(text)
    .split('\n')
    .map(x => x.trim())
    .filter(Boolean)
    .filter(x => !ALERT_RE.test(x) && !CLEAR_RE.test(x));
  const result = lines.join(' ').replace(/\s+/g, ' ').trim();
  return result.length > 240 ? `${result.slice(0, 237).trimEnd()}…` : result;
}

function formatMessage(item, kind) {
  const time = postTime(item.date);
  const threat = threatName(item.text);

  if (kind === 'clear') {
    return `🟢 <b>ОТБОЙ ВОЗДУШНОЙ ТРЕВОГИ</b>\n\n<b>ОДЕССА</b>\n🕒 ${time}\n\n⚓️ <b>ОДЕССА Online</b>`;
  }

  if (kind === 'alert') {
    let text = `🔴 <b>ВНИМАНИЕ</b>\n\n<b>ОДЕССА — ВОЗДУШНАЯ ТРЕВОГА</b>`;
    if (threat) text += `\n🚨 Угроза: <b>${escapeHtml(threat)}</b>`;
    text += `\n🕒 ${time}\n\n⚓️ <b>ОДЕССА Online</b>`;
    return text;
  }

  const details = compactDetails(item.text);
  let text = `🔴 <b>ВНИМАНИЕ | ОДЕССА</b>`;
  if (threat) text += `\n\n🚨 Угроза: <b>${escapeHtml(threat)}</b>`;
  if (details) text += `\n${escapeHtml(details)}`;
  text += `\n🕒 ${time}\n\n⚓️ <b>ОДЕССА Online</b>`;
  return text;
}

async function telegramSend(text) {
  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text,
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.description || `Telegram HTTP ${response.status}`);
  return data.result;
}

async function fetchItems() {
  const response = await fetch(`https://t.me/s/${SOURCE}`, {
    headers: { Accept: 'text/html', 'User-Agent': 'Mozilla/5.0 OdessaOnlineAlertBot/1.0' },
  });
  if (!response.ok) throw new Error(`Source HTTP ${response.status}`);
  return parseTelegramPage(await response.text());
}

async function scanOnce(state) {
  const items = await fetchItems();
  if (!items.length) return { checked: 0, sent: 0 };

  const newest = items.at(-1).id;
  if (!state.initialized) {
    state.initialized = true;
    state.lastId = newest;
    writeState(state);
    console.log(JSON.stringify({ baseline: newest, source: SOURCE }));
    return { checked: items.length, sent: 0, baseline: newest };
  }

  let sent = 0;
  for (const item of items.filter(x => x.id > state.lastId)) {
    const text = item.text;
    const kind = kindOf(text);

    if (!CITY_RE.test(text) || !kind || AD_RE.test(text) || SERVICE_RE.test(text)) {
      state.lastId = item.id;
      writeState(state);
      continue;
    }

    if ((kind === 'alert' && state.lastStatus === 'alert') || (kind === 'clear' && state.lastStatus === 'clear')) {
      state.lastId = item.id;
      writeState(state);
      continue;
    }

    const message = formatMessage(item, kind);
    const result = await telegramSend(message);
    console.log(JSON.stringify({ sent: true, sourceId: item.id, kind, messageId: result?.message_id || null }));

    if (kind === 'alert' || kind === 'clear') state.lastStatus = kind;
    state.lastId = item.id;
    writeState(state);
    sent++;
  }

  return { checked: items.length, sent };
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
  } catch (error) {
    console.error(JSON.stringify({ error: String(error?.message || error), cycle: cycles + 1 }));
  }

  const remaining = RUN_FOR_MS - (Date.now() - started);
  if (remaining <= 0) break;
  await new Promise(resolve => setTimeout(resolve, Math.min(CHECK_INTERVAL_MS, remaining)));
}

console.log(JSON.stringify({ ok: true, source: SOURCE, intervalMs: CHECK_INTERVAL_MS, cycles, sentTotal, lastId: state.lastId }));

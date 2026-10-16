import fs from 'node:fs';
import path from 'node:path';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT = process.env.TELEGRAM_CHAT_ID || '-1004426768141';
const SOURCE = (process.env.ALERT_SOURCE || 'odessa_inform').replace(/^@/, '');
const STATE = process.env.ALERT_STATE_PATH || 'data/odessa-alert-state.json';
const INTERVAL = Number(process.env.CHECK_INTERVAL_MS || 20000);
const RUN_FOR = Number(process.env.RUN_FOR_MS || 86400000);
const CONTEXT_MS = 45 * 60 * 1000;
if (!TOKEN) throw new Error('TELEGRAM_BOT_TOKEN is missing');

const BASE = /(повітряна\s+тривога|воздушн(?:ая|ой)\s+тревог|\bтривога\b|\bтревога\b|\bвідбій\b|\bотбой\b|шахед|shahed|бпла|дрон|дронов|ракета|ракетн|балістик|баллистик|каб\b|авіабомб|авиабомб)/i;
const FOLLOW = /(нові\s+вже\s+летять|новые\s+уже\s+летят|летять|летят|летить|летит|руха|движ|курс|напрям|направлен|пряму|йдуть|идут|заход|наближа|приближа|повернув|повернул|розвернув|развернул|у\s+морі|в\s+морі|в\s+море|у\s+море|з\s+моря|с\s+моря|над\s+морем|ціл(?:ь|і|ей)|цел(?:ь|и|ей)|група|группа|пуск|зліт|взл[её]т|\b\d{1,2}\s*~|\b\d{1,2}\s*(?:шт|од\.?|ціл|цел))/i;
const STOP = /(реклам|промокод|розіграш|розыгрыш|донат|збір\s*(?:коштів|грошей)|сбор\s*(?:средств|денег)|monobank|privat24|paypal|підписуй|подписыв|новин|новост|загин|погиб|поран|ранен|постраждал|пострад|наслідк|последств|пошкоджен|поврежден|дснс|поліці|полици|суд|затриман|задержан|нафтогаз|депутат|уряд|правительств|економ|эконом|ваканс|магазин|продаж|купити|купить)/i;
const PROMO = /(підписат|подписат|youtube|instagram|tiktok|facebook|whatsapp|viber|реклам|співпрац|сотрудничеств|основний\s+тг|основной\s+тг)/i;
const CLEAR = /(\bвідбій\b|\bотбой\b)/i;

function decode(v='') {
  return String(v)
    .replace(/<br\s*\/?>/gi,'\n').replace(/<\/p>/gi,'\n').replace(/<\/div>/gi,'\n')
    .replace(/<[^>]+>/g,'')
    .replace(/&#(x[0-9a-f]+|\d+);/gi,(_,c)=>String.fromCodePoint(c[0].toLowerCase()==='x'?parseInt(c.slice(1),16):Number(c)))
    .replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&apos;/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>')
    .replace(/[\u200b-\u200d\ufeff]/g,'').replace(/\r/g,'').trim();
}

function clean(raw='') {
  return decode(raw).split('\n').map(x=>x.trim()).filter(Boolean)
    .filter(x=>!PROMO.test(x) && !/https?:\/\/\S+/i.test(x) && !/^@\w+$/.test(x))
    .join('\n').trim();
}

function parse(html) {
  const out=[];
  for (const block of String(html).split(/(?=<div\b[^>]*data-post=)/i)) {
    const p=block.match(/data-post="([^"/]+)\/(\d+)"/i);
    if(!p || p[1].toLowerCase() !== SOURCE.toLowerCase()) continue;
    const raw=block.match(/<div\b[^>]*class="[^"]*tgme_widget_message_text\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1]||'';
    const stamp=block.match(/<time\b[^>]*datetime="([^"]+)"/i)?.[1]||'';
    const text=clean(raw), date=Date.parse(stamp);
    if(text && Number.isFinite(date)) out.push({id:Number(p[2]),date,text});
  }
  return out.sort((a,b)=>a.id-b.id);
}

function load() {
  try { const s=JSON.parse(fs.readFileSync(STATE,'utf8')); return {ready:!!s.ready,lastId:Number(s.lastId||0),activeUntil:Number(s.activeUntil||0),recent:Array.isArray(s.recent)?s.recent:[],source:s.source||''}; }
  catch { return {ready:false,lastId:0,activeUntil:0,recent:[],source:''}; }
}
function save(s) { s.source=SOURCE; fs.mkdirSync(path.dirname(STATE),{recursive:true}); s.recent=s.recent.filter(x=>Date.now()-x.at<7200000).slice(-60); fs.writeFileSync(STATE,JSON.stringify(s,null,2)); }
function norm(t='') { return t.toLowerCase().replace(/[^a-zа-яіїєґ0-9~]+/gi,' ').replace(/\s+/g,' ').trim(); }
function wanted(text,s) {
  if(STOP.test(text)) return false;
  if(BASE.test(text)) return true;
  return Date.now()<=s.activeUntil && FOLLOW.test(text) && text.length<=260;
}
function duplicate(text,s) { const n=norm(text); return s.recent.some(x=>Date.now()-x.at<1800000 && norm(x.text)===n); }
function esc(t='') { return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

async function send(text) {
  const r=await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:CHAT,text:`${esc(text)}\n\n⚓️ <b>ОДЕССА Online</b>`,parse_mode:'HTML',link_preview_options:{is_disabled:true}})});
  const d=await r.json().catch(()=>({})); if(!r.ok||d.ok===false) throw new Error(d.description||`Telegram HTTP ${r.status}`); return d.result;
}

async function cycle(s) {
  const r=await fetch(`https://t.me/s/${SOURCE}`,{headers:{Accept:'text/html','User-Agent':'Mozilla/5.0 OdessaOnlineRadar/1.2'}});
  if(!r.ok) throw new Error(`source HTTP ${r.status}`);
  const items=parse(await r.text()); if(!items.length) return;
  const newest=items.at(-1).id;

  if(s.source && s.source !== SOURCE){s.ready=false;s.lastId=0;s.activeUntil=0;s.recent=[];}

  if(!s.ready){
    s.ready=true;
    s.lastId=newest;
    const recentBase=[...items].reverse().find(x=>Date.now()-x.date<=CONTEXT_MS && BASE.test(x.text) && !STOP.test(x.text));
    s.activeUntil=recentBase && !CLEAR.test(recentBase.text) ? Date.now()+CONTEXT_MS : 0;
    save(s);
    console.log(JSON.stringify({baseline:newest,source:SOURCE,contextActive:s.activeUntil>Date.now()}));
    return;
  }

  for(const it of items.filter(x=>x.id>s.lastId)) {
    s.lastId=it.id;
    if(!wanted(it.text,s)){console.log(JSON.stringify({skip:true,id:it.id,text:it.text.slice(0,100)}));save(s);continue;}
    if(duplicate(it.text,s)){console.log(JSON.stringify({duplicate:true,id:it.id}));save(s);continue;}
    const m=await send(it.text); console.log(JSON.stringify({sent:true,source:SOURCE,id:it.id,messageId:m?.message_id||null,text:it.text}));
    s.activeUntil=CLEAR.test(it.text)?0:Date.now()+CONTEXT_MS;
    s.recent.push({at:Date.now(),text:it.text}); save(s);
  }
}

const s=load(), start=Date.now();
while(Date.now()-start<RUN_FOR){try{await cycle(s);}catch(e){console.error(JSON.stringify({error:String(e?.message||e),source:SOURCE}));}const left=RUN_FOR-(Date.now()-start);if(left<=0)break;await new Promise(r=>setTimeout(r,Math.min(INTERVAL,left)));}

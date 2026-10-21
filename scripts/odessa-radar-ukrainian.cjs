'use strict';
// ODESSA Online — install Ukrainian translation for incoming Russian radar posts.
// Patches only the cloud outgoing-message preparation; does not touch state/cursors/workers.
// Translations are best-effort and never block publication on translator failure.
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const cp=require('node:child_process');
const vm=require('node:vm');

const root=path.join(os.homedir(),'OdessaOnlineGuideBot');
const rel='tgcloud/endpoints/odessaLive.js';
const file=path.join(root,rel);
const marker='ODESSA_RADAR_UK_V1';
const helper=String.raw`
// ODESSA_RADAR_UK_V1 — outgoing radar texts only. Keep original when translation fails.
const odessaRadarUkCacheV1=new Map();
function odessaRadarUkIsAlertV1(text){
 const s=String(text||'');
 // Do not translate electricity posts, comments, ads, or regular news.
 if(/(?:відключен|отключен|електроенерг|электроэнерг|електропостач|электроснабж|світла|света|графік|график|дтек|дтэк|черг[аи]|очеред[ьи]|повідомленн[яе]\s+про\s+світло)/i.test(s))return false;
 return /(?:тривог|тревог|відб[іо]й|отбой|шахед|shahed|бпл[а]?|дрон|ракет|баліст|баллист|каб\b|вибух|взрыв|пуск|виліт|вылет|заліта|залета|руха|движ|летят|летит|летить|курс|напрям|направлен|крутит|кружит|маневр|ман[её]вр|транзит|транзіт|ппо|пво|загроз|угроз|ціл[ьиі]|цел[ьи]|північ|север|півден|юг|південь|восток|запад|мор[яеюі]|област|район|одесс|одес|аркад|пересып|пересип|фонтан|таиров|таїров|берез[оиі]|подольск|подільськ|болград|изм[ааи]ил|ізмаїл|поверн|разворот|сирен|чисто\s+в\s+небе)/i.test(s);
}
function odessaRadarUkNeedsTranslateV1(text){
 // Skip already-Ukrainian radar posts unless they also have clear Russian words.
 const s=String(text||'').replace(/(?:⚓️?\s*)?ОДЕССА\s+Online/gi,'');
 if(/[ыэъё]/i.test(s))return true;
 if(/(?:воздушн|тревог|отбой|внимани|опасност|шахеды|ракеты|взрыв|самолет|пока|снова|север|запад|восток|южн|движет|движут|летят|летит|направлен|в\s+сторон|с\s+моря|в\s+области|одесс[ауые]|приближа|отмен|разворот|скоро|предварител|две\s+цел|цель\s+курс)/i.test(s))return true;
 if(/[іїєґ]/i.test(s))return false;
 return /[а-я]/i.test(s);
}
async function odessaRadarUkRemoteV1(text){
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),1800);
 try{
  const url='https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=uk&dt=t&q='+encodeURIComponent(text);
  const response=await fetch(url,{signal:controller.signal,headers:{accept:'application/json'}});
  if(!response.ok)throw Error('HTTP '+response.status);
  const data=await response.json();
  const result=Array.isArray(data?.[0])?data[0].map(part=>part?.[0]||'').join(''):'';
  if(!result.trim())throw Error('Empty translation');
  if(result.length>Math.max(100,text.length*2.5))throw Error('Oversized translation');
  // Preserve numbers (including course bearings/times/quantities).
  const nums=t=>[...String(t).matchAll(/\d+(?:[.:]\d+)*/g)].map(x=>x[0]).sort().join('|');
  if(nums(text)!==nums(result))throw Error('Numbers changed by translation');
  return result;
 }finally{clearTimeout(timeout);}
}
async function odessaTranslateRadarV1(prepared,key){
 const original=prepared?.[key];
 if(typeof original!=='string'||!odessaRadarUkIsAlertV1(original)||!odessaRadarUkNeedsTranslateV1(original))return prepared;
 // Keep the project's signature intact: translate only the radar message body.
 const footerMatch=/((?:\n|^)[ \t]*(?:⚓️[ \t]*)?(?:ОДЕССА|ОДЕСА)[ \t]+Online[ \t]*)$/iu.exec(original);
 const footer=footerMatch?footerMatch[1]:'';
 const body=footer?original.slice(0,-footer.length):original;
 if(!body.trim()||body.length>2500||/<\/?[a-z][^>]*>/i.test(body))return prepared;
 let translated=odessaRadarUkCacheV1.get(body);
 if(!translated){
  try{
   translated=await odessaRadarUkRemoteV1(body);
   if(odessaRadarUkCacheV1.size>160)odessaRadarUkCacheV1.clear();
   odessaRadarUkCacheV1.set(body,translated);
  }catch(e){
   console.warn('ODESSA_RADAR_UK_TRANSLATION_FAILED',String(e?.message||e));
   return prepared; // A real-time alert must never be lost or delayed indefinitely.
  }
 }
 const text=translated.replace(/\s+$/,'')+footer;
 if(!text.trim()||text.length>(key==='caption'?1024:4096))return prepared;
 const out={...prepared,[key]:text};
 // Entity offsets are UTF-16. The original body changed length, so remap footer
 // entities and discard body entities with invalid positions.
 const ek=key==='caption'?'caption_entities':'entities';
 if(Array.isArray(out[ek])){
  const oldEnd=body.length;
  const delta=translated.replace(/\s+$/,'').length-oldEnd;
  const kept=out[ek].filter(e=>Number.isInteger(e?.offset)&&Number.isInteger(e?.length)&&e.offset>=oldEnd && e.offset+e.length<=original.length)
                    .map(e=>({...e,offset:e.offset+delta}));
  if(kept.length)out[ek]=kept;else delete out[ek];
 }
 return out;
}
`;
function run(cmd,args){
 const result=cp.spawnSync(cmd,args,{cwd:root,encoding:'utf8',timeout:180000,maxBuffer:5000000});
 if(result.stdout)process.stdout.write(result.stdout);
 if(result.stderr)process.stderr.write(result.stderr);
 if(result.error||result.status!==0)throw Error('Команда завершилась с ошибкой: '+cmd+' '+args.join(' '));
}
function patched(source){
 if(source.includes(marker))return source;
 const start=source.indexOf('async function odessaPrepareArgs(');
 const end=source.indexOf('async function odessaSendEmoji(',start);
 if(start<0||end<start)throw Error('Не найден совместимый обработчик Telegram Cloud. Код не изменён.');
 const section=source.slice(start,end);
 const matches=[...section.matchAll(/return\s+(odessaTransitBowV1\(prepared\s*,\s*key\)|prepared)\s*;/g)];
 const last=matches.at(-1);
 if(!last)throw Error('Не удалось найти точку отправки. Код не изменён.');
 const pos=last.index;
 const replacement='return await odessaTranslateRadarV1('+last[1]+',key);';
 return source.slice(0,start)+helper+'\n'+section.slice(0,pos)+replacement+section.slice(pos+last[0].length)+source.slice(end);
}
async function test(){
 let remoteCalls=0;
 const context={
  AbortController,URL,console,setTimeout,clearTimeout,
  fetch:async url=>{remoteCalls++;const q=new URL(url).searchParams.get('q');
   let translation=q.replace('Воздушная тревога в Одессе','Повітряна тривога в Одесі')
                    .replace('Ракеты курсом на Одессу','Ракети курсом на Одесу')
                    .replace('Снова транзит через север области','Знову транзит через північ області');
   return {ok:true,json:async()=>[[[translation,q,null,null,0]]]};
  }
 };
 const transform=vm.runInNewContext(helper+'\nodessaTranslateRadarV1',context);
 const one=await transform({text:'🚨 Воздушная тревога в Одессе\n⚓️ ОДЕССА Online',entities:[{type:'bold',offset:33,length:13}]},'text');
 if(!one.text.includes('Повітряна тривога в Одесі')||!one.text.endsWith('ОДЕССА Online'))throw Error('Тест тревоги не прошёл');
 const two=await transform({caption:'Ракеты курсом на Одессу 2'},'caption');
 if(!two.caption.includes('Ракети курсом на Одесу 2'))throw Error('Тест ракеты не прошёл');
 const before=remoteCalls;
 const three=await transform({text:'Внимание: отключения света. График ДТЕК'},'text');
 if(three.text!=='Внимание: отключения света. График ДТЕК'||remoteCalls!==before)throw Error('Тест сохранения сообщений об электричестве не прошёл');
 const four=await transform({text:'Знову транзит через північ області 🏹'},'text');
 if(four.text!=='Знову транзит через північ області 🏹')throw Error('Тест готового украинского текста не прошёл');
 const five=await transform({text:'Снова транзит через север области 🏹'},'text');
 if(!five.text.includes('Знову транзит через північ області 🏹'))throw Error('Тест транзита не прошёл');
 const fails=vm.runInNewContext(helper+'\nodessaTranslateRadarV1',{...context,fetch:async()=>{throw Error('Offline');}});
 const original='🚨 Воздушная тревога в Одессе';
 const fallback=await fails({text:original},'text');
 if(fallback.text!==original)throw Error('Тест безопасной отправки при отсутствии перевода не прошёл');
}
async function main(){
 if(!fs.existsSync(file))throw Error('Не найдена папка Telegram Cloud в Termux: '+rel);
 await test();
 const before=fs.readFileSync(file,'utf8');
 const after=patched(before);
 if(after===before){console.log('✅ Перевод тревог уже установлен.');return;}
 const tmp=file+'.ua-check.js';
 try{fs.writeFileSync(tmp,after);run(process.execPath,['--check',tmp]);}
 finally{fs.rmSync(tmp,{force:true});}
 const backup=file+'.backup-ua-'+Date.now();
 fs.copyFileSync(file,backup);
 fs.writeFileSync(file,after);
 try{run('npx',['tgcloud','push',rel]);}
 catch(e){fs.copyFileSync(backup,file);throw e;}
 console.log('✅ Перевод русскоязычных радарных сообщений на украинский подключён.');
 console.log('✅ Бот, состояние сообщений и электричество не изменены.');
 console.log('✅ Резервная копия: '+backup);
 console.log('ℹ️ При временной недоступности переводчика публикуется оригинал, чтобы не пропустить тревогу.');
}
main().catch(e=>{console.error('❌ '+String(e.message||e));process.exitCode=1;});
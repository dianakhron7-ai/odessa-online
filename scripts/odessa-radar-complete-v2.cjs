'use strict';
// ODESSA Online: preserve every operational radar update, including short counts and corrections.
// Installer only. It does not reset channel cursors, replay history or change the selected source.
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const cp=require('node:child_process');
const vm=require('node:vm');
const root=path.join(os.homedir(),'OdessaOnlineGuideBot');
const marker='ODESSA_RADAR_COMPLETE_V2_20261022';
const helper=String.raw`
// ODESSA_RADAR_COMPLETE_V2_20261022
function odessaRadarCompleteV2(text) {
  const s=String(text||'').replace(/[\u200B-\u200D\uFEFF]/g,'').trim();
  if(!s || s.length>1300) return false;
  // Radar only. Never accept money collections, promotions, regular news or power schedules.
  if(/реклам|промокод|розыгрыш|розіграш|донат|збір\s+(?:кошт|грошей)|сбор\s+(?:средств|денег)|monobank|монобанк|privat24|підписуй|подписыв|прайс|ваканс|продам|куплю|знижк|скидк|https?:\/\/|t\.me\/|tiktok|instagram|погода|курс\s+валют|графік\s+(?:світла|відключ)|график\s+(?:света|отключ)|дтек|дтэк/i.test(s)) return false;
  if(/внаслідок|унаслідок|последств|постраждал|пострадав|загиб|погиб|поранен|ранен|пошкоджен|поврежден|міністр|министр|депутат|політик|политик|змінив\s+(?:фото|назву)|изменил\s+(?:фото|название)/i.test(s)) return false;
  // Named threats, flight directions, alerts, launches, explosions and short follow-ups.
  if(/повітрян|воздушн|тривог|тревог|відбій|отбой|шахед|shahed|бпла|бпл\b|бпл[аи]|бпЛА|БпЛА|дрон|орлан(?:-10)?|бандерол|ракет|баліст|баллист|реактив|пуск|виліт|вылет|заліта|залета|лет[яіи]|літа|летит|летять|руха|движ|курс|напрям|направлен|маневр|ман[её]вр|транзит|транзіт|ппо|пво|вибух|взрыв|дорозвід|доразвед|розвідк|разведк|ціл[ьеі]|цел[ьяи]|збит|сбит|знищен[ао]\s+ціл|сбита\s+цель/i.test(s)) return true;
  // Radar captions without an explicit type of aircraft (all are seen in the source).
  if(/^(?:[\s🟢🟡🔴⚠️❗️✅-]*)(?:мінус|минус|так\s+заходят|так\s+заходять|далі\s+в\s+бік|дальше\s+в\s+сторону)[\s.!❗️✅-]*$/iu.test(s)) return true;
  // 5 на Вилково, 7х на Килию, 1х курсом на Балту, Вилкове/Ліски 1х.
  const countToPlace=/^\s*[\d]+\s*[xх×]?\s*(?:(?:курсом|у\s+напрямку|в\s+напрямку|в\s+сторону|у\s+бік)\s+)?(?:на|у|в|до|к|біля)\s+[\p{L}]/iu.test(s);
  const placeCount=/^\s*[\p{L}][\p{L}\s./-]{2,65}\s+[\d]+\s*[xх×](?:\s|$)/iu.test(s);
  const shortMap=/^(?:на\s+)?(?:вилков|вилкове|кіл[ія]|кил[ияи]|ліск[иаі]|лиск[иа]|приморськ|приморск|балта|ізмаїл|измаил|ши[рр]я[єе]в|анань[їиь]|любашів|любашев|березів|одес|одесс|нерубай|кубанк|августів|августов|шевченков|утконосов|усатов|іллінк|ильинк)[\p{L}\s/,.0-9xх×-]*$/iu.test(s);
  return countToPlace || placeCount || shortMap;
}
`;
const uaHelper=String.raw`
// ODESSA_RADAR_COMPLETE_V2_20261022 — fix common Russian alert texts even if
// the online Ukrainian translation service cannot be reached.
function odessaRadarOfflineUaV2(prepared,key) {
  const src=prepared?.[key];
  if(typeof src!=='string'||!odessaRadarCompleteV2(src))return prepared;
  let s=src;
  s=s.replace(/ОТБОЙ ВОЗДУШНОЙ ТРЕВОГИ/gi,'ВІДБІЙ ПОВІТРЯНОЇ ТРИВОГИ')
     .replace(/ОБЪЯВЛЕНА ВОЗДУШНАЯ ТРЕВОГА/gi,'ОГОЛОШЕНО ПОВІТРЯНУ ТРИВОГУ')
     .replace(/ВОЗДУШНАЯ ТРЕВОГА/gi,'ПОВІТРЯНА ТРИВОГА')
     .replace(/\bВЗРЫВЫ\b/gi,'ВИБУХИ')
     .replace(/\bВЗРЫВ\b/gi,'ВИБУХ')
     .replace(/\bМинус\b/gi,'Мінус')
     .replace(/\bТак заходят\b/gi,'Так заходять')
     .replace(/(\d+)\s*[xх×]?\s+на\s+Вилково\b/giu,'$1 у напрямку Вилкового')
     .replace(/(\d+)\s*[xх×]?\s+на\s+Килию\b/giu,'$1 у напрямку Кілії');
  if(s===src)return prepared;
  const out={...prepared,[key]:s};
  // Earlier message formatting offsets cannot be used after text length changes.
  delete out[key==='caption'?'caption_entities':'entities'];
  return out;
}
`;
function execute(cmd,args,opts={}){
 const r=cp.spawnSync(cmd,args,{cwd:root,encoding:'utf8',timeout:180000,maxBuffer:4_000_000,...opts});
 if(r.stdout)process.stdout.write(r.stdout);
 if(r.stderr)process.stderr.write(r.stderr);
 if(r.error||r.status!==0)throw Error('Ошибка '+cmd+': '+(r.error?.message||r.status));
 return r.stdout||'';
}
function processes(){
 const r=cp.spawnSync('pgrep',['-f','node odessa-live[.]cjs$'],{encoding:'utf8'});
 if(r.status===1)return [];
 if(r.error||r.status!==0)throw Error('Не удалось проверить процессы радара');
 return r.stdout.split(/\s+/).map(Number).filter(Number.isInteger);
}
function patchFilter(source){
 if(source.includes(marker))return source;
 const re=/((?:export\s+)?function\s+(?:isAlertPost|radarOperational)\s*\(\s*text\s*\)\s*\{)/g;
 const matches=[...source.matchAll(re)];
 if(!matches.length)return null;
 const body=source.replace(re,m=>m+'\n if(odessaRadarCompleteV2(text))return true;');
 const first=body.search(/(?:export\s+)?function\s+(?:isAlertPost|radarOperational)\s*\(\s*text\s*\)\s*\{/);
 return body.slice(0,first)+helper+'\n'+body.slice(first);
}
function patchCloudTranslation(source){
 if(!source.includes(marker))return source;
 if(source.includes('function odessaRadarOfflineUaV2('))return source;
 const start=source.indexOf('async function odessaPrepareArgs(');
 const end=source.indexOf('async function odessaSendEmoji(',start);
 if(start<0||end<=start)throw Error('Нет поддерживаемой точки подготовки сообщений Telegram Cloud');
 const section=source.slice(start,end);
 const returns=[...section.matchAll(/return\s+([^;\n]+)\s*;/g)];
 const last=returns.at(-1);
 if(!last)throw Error('Не найдена точка отправки в Telegram Cloud');
 const original=last[1].trim();
 if(!/^(?:await\s+odessaTranslateRadarV1\(|odessaTransitBowV1\(|prepared\b)/.test(original))
  throw Error('Неподдерживаемый формат подготовки отправки; ничего не изменено');
 const replacement='return odessaRadarOfflineUaV2('+original+',key);';
 return source.slice(0,start)+uaHelper+'\n'+section.slice(0,last.index)+replacement+section.slice(last.index+last[0].length)+source.slice(end);
}
function checkModule(text,ext,name){
 const file=path.join(root,name+'.radar-v2-check.'+ext);
 try{fs.writeFileSync(file,text);execute(process.execPath,['--check',file],{timeout:20000});}
 finally{try{fs.unlinkSync(file)}catch{}}
}
function runTests(){
 const f=vm.runInNewContext(helper+'\nodessaRadarCompleteV2');
 const yes=['5 на Вилково','7х на Килию','Вилкове 2х','Вилкове/Ліски 1х','1х курсом на Балту','Орлан тут ☝️','Орлан-10 цим курсом','Дорозвідка','Утконосовка ВЗРЫВЫ 💥','Минус','Реактив через Березівський район. Транзит','На юг области летят БПЛА'];
 const no=['Реклама! Скидки на все','Донат на збір коштів','В Одессе пострадали двое людей','График отключения света ДТЕК','Новые вакансии в Одессе'];
 for(const s of yes)if(!f(s))throw Error('Тест не пропускает: '+s);
 for(const s of no)if(f(s))throw Error('Тест пропускает запрещённое: '+s);
 const translate=vm.runInNewContext(helper+uaHelper+'\nodessaRadarOfflineUaV2');
 const txt=translate({text:'⚠️ ОБЪЯВЛЕНА ВОЗДУШНАЯ ТРЕВОГА ❗'},'text').text;
 if(!txt.includes('ОГОЛОШЕНО ПОВІТРЯНУ ТРИВОГУ'))throw Error('Тест украинского языка не пройден');
}
function launch(){
 const log=fs.openSync(path.join(root,'odessa-live.log'),'a');
 try{const p=cp.spawn(process.execPath,['odessa-live.cjs'],{cwd:root,detached:true,stdio:['ignore',log,log]});p.unref();return p.pid}
 finally{fs.closeSync(log)}
}
async function main(){
 if(!fs.existsSync(root))throw Error('Не найдена папка ~/OdessaOnlineGuideBot');
 const worker=path.join(root,'odessa-live.cjs');
 if(!fs.existsSync(worker))throw Error('Не найден odessa-live.cjs');
 runTests();
 const targets=[
  ['odessa-live-policy.mjs','local'],['odessa-radar-filter.mjs','local'],
  ['tgcloud/endpoints/odessaLive.js','cloud'],['tgcloud/lib/odessaRadarFilter.js','cloud']
 ];
 const found=[],edits=[];
 for(const [rel,type] of targets){
  const file=path.join(root,rel);
  if(!fs.existsSync(file))continue;
  const before=fs.readFileSync(file,'utf8');
  let after=patchFilter(before);
  if(after===null)continue;
  if(type==='cloud'&&rel==='tgcloud/endpoints/odessaLive.js')after=patchCloudTranslation(after);
  checkModule(after,'mjs','odessa-temp-'+type);
  found.push({rel,type});
  if(after!==before)edits.push({rel,type,file,before,after});
 }
 if(!found.some(x=>x.type==='local')||!found.some(x=>x.type==='cloud'))
  throw Error('Фильтры локального и облачного радара не найдены. Ничего не изменено.');
 const cloudEndpoint=path.join(root,'tgcloud/endpoints/odessaLive.js');
 if(!fs.existsSync(cloudEndpoint))throw Error('Не найден облачный обработчик радара');
 const policy=path.join(root,'odessa-live-policy.mjs');
 if(fs.existsSync(policy)){
  const match=fs.readFileSync(policy,'utf8').match(/export\s+const\s+CHANNEL\s*=\s*['"]([^'"]+)['"]/);
  if(match)console.log('ℹ️ Сейчас выбран источник: @'+match[1]+'. Источник не меняем.');
 }
 if(!edits.length){console.log('✅ Исправление уже установлено. История сообщений сохранена.');return;}
 const previous=processes();
 if(previous.length>1)throw Error('Запущено несколько радаров. Не меняю их автоматически.');
 const backups=path.join(root,'backups','radar-complete-v2-'+Date.now());
 fs.mkdirSync(backups,{recursive:true});
 for(const item of edits){const target=path.join(backups,item.rel);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,item.before);}
 function restore(){for(const x of edits)fs.copyFileSync(path.join(backups,x.rel),x.file)}
 console.log('✅ Проверки пройдены. Резервная копия: '+backups);
 try{
  for(const x of edits){const temp=x.file+'.radar-v2-new';fs.writeFileSync(temp,x.after);fs.renameSync(temp,x.file)}
  for(const x of edits.filter(x=>x.type==='cloud'))execute('npx',['tgcloud','push',x.rel]);
 }catch(e){restore();throw Error('Обновление остановлено, локальные файлы восстановлены: '+e.message)}
 if(previous.length===1){
  try{process.kill(previous[0],'SIGTERM')}catch(e){if(e.code!=='ESRCH')throw e}
  await new Promise(resolve=>setTimeout(resolve,3500));
  if(processes().length)throw Error('Старый процесс ещё работает — второй не запускаю');
 }
 if(!processes().length) {
  const lock=path.join(root,'odessa-live.lock');
  if(fs.existsSync(lock)){try{const saved=Number(fs.readFileSync(lock,'utf8'));if(Number.isInteger(saved)&&saved>1){process.kill(saved,0);throw Error('Радар запущен под другим именем; второй не запускаю')}}catch(e){if(e.code!=='ESRCH')throw e}}
  launch();await new Promise(resolve=>setTimeout(resolve,4500));
 }
 if(!processes().length)throw Error('Радар не запустился. Пришлите последние строки odessa-live.log');
 console.log('✅ Радар работает с расширенным фильтром.');
 console.log('✅ Короткие оперативные сообщения больше не блокируются этим фильтром.');
 console.log('✅ Источник, сохранённый курсор, новости, свет, комментарии не изменены.');
 console.log('ℹ️ Перевод на украинский: типовые фразы исправляются без интернета, остальные — прежним переводчиком.');
}
main().catch(e=>{console.error('❌ '+String(e.message||e));process.exitCode=1});

'use strict';
// ODESSA Online — accept every non-news/non-ad/non-fundraiser source radar post.
// The current channel, cursors, existing comments, power worker and news setting remain untouched.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const cp=require('node:child_process'),vm=require('node:vm');
const root=path.join(os.homedir(),'OdessaOnlineGuideBot');
const marker='ODESSA_RADAR_ALL_EXCEPT_V3_20261022';
const common=String.raw`
 // ODESSA_RADAR_ALL_EXCEPT_V3_20261022
 function odessaRadarCleanSourceV3(input) {
  return String(input||'').replace(/[\u200B-\u200D\uFEFF]/g,'').split(/\r?\n/)
   .filter(line=>{
    const t=line.trim();
    return !/^(?:(?:⚓️?|📡|👉|➡️)\s*)?(?:(?:ОДЕССА|ОДЕСА|ODESA|ODESSA)\s+(?:ИНФО|ІНФО|INFO)(?:\s+LIVE)?(?:\s*[-—–|]\s*радар\s+Одеса)?|(?:Одеськ|Одесск)\S*\s+(?:Інфо|Инфо)|@(?:odessa_inform|odessagolovna)|(?:https?:\/\/)?t\.me\/(?:odessa_inform|odessagolovna)\S*)\s*$/iu.test(t)
     && !/^(?:(?:👉|➡️|💬)\s*)?(?:подписывайтесь|подписаться|підписуйтеся|підписатися|підписатись|наш(?:\s+основной)?\s+канал|наш\s+тг|наш\s+telegram|основний\s+тг)\b.*$/iu.test(t);
   })
   .map(line=>line.replace(/https?:\/\/(?:t\.me|telegram\.me)\/\S+/giu,'').replace(/(?<![\p{L}\d_])@(?:odessa_inform|odessagolovna)\b/giu,'').trimEnd())
   .join('\n').replace(/\n{3,}/g,'\n\n').trim();
 }
 function odessaRadarAllExceptV3(input) {
  const s=odessaRadarCleanSourceV3(input);
  if(!s||s.length>30000)return false;
  // Explicitly blocked: fundraising, ads and links, service/system messages.
  if(/реклам|промокод|розіграш|розыгрыш|донат|донат[ыи]|збір\s*(?:коштів|грошей|на\s+зсу)|сбор\s*(?:средств|денег|на\s+всу)|monobank|монобанк|privat24|paypal|банківськ\S*\s+карт|банковск\S*\s+карт|реквізит|реквизит|підтримайте\s+канал|поддержите\s+канал|boost|premium|спонсор|партнерськ|партнёрск|купити|купить|продам|знижк|скидк|ваканс|оренда|аренда|прайс|акці[яїю]|акци[яию]|підписуй|подписыв|посилання\s+для\s+реєстрац|ссылка\s+для\s+регистрац/i.test(s))return false;
  if(/змінив.{0,40}(?:фото|назв|опис)|изменил.{0,40}(?:фото|назв|опис)|channel\s+(?:photo|title|description)\s+(?:updated|changed)|joined\s+the\s+group|left\s+the\s+group/i.test(s))return false;
  // Regular news and aftermath, not immediate radar status or an explosion warning.
  if(/новин(?:и|а|ы)\s+(?:дня|міста|города)|новост(?:и|ь)\s+(?:дня|города)|внаслідок|унаслідок|наслідки|последств|постраждал|пострадав|загиб|погиб|поранен|ранен|пошкоджен|поврежден|зруйнован|разрушен|відкрили\s+криміналь|возбудили\s+уголовн|правоохоронц|правоохранител|затримал|задержал|суд\s+виніс|суд\s+вынес|політик|политик|президент|депутат|міністр|министр|міська\s+рада|городской\s+совет|дтп|аварі[яї]|авария|погод[аыі]|прогноз\s+погод|курс\s+валют|гороскоп|концерт|фестиваль|матч|футбол|відключенн[яі]\s+світла|отключени[яе]\s+света|графік\s+відключен|график\s+отключен|дтек|дтэк/i.test(s))return false;
  return true; // Everything else in the selected radar channel is operational.
 }
`;
const outbound=String.raw`
 // ODESSA_RADAR_ALL_EXCEPT_V3_20261022 — delete text source attribution but keep own footer.
 function odessaRadarStripSourceV3(prepared,key) {
  const original=prepared?.[key];
  if(typeof original!=='string')return prepared;
  const body=odessaRadarCleanSourceV3(original);
  if(!body||body===original)return prepared;
  const out={...prepared,[key]:body};
  delete out[key==='caption'?'caption_entities':'entities'];
  return out;
 }
`;
function exec(cmd,args,options={}){
 const r=cp.spawnSync(cmd,args,{cwd:root,encoding:'utf8',timeout:180000,maxBuffer:5_000_000,...options});
 if(r.stdout)process.stdout.write(r.stdout);
 if(r.stderr)process.stderr.write(r.stderr);
 if(r.error||r.status!==0)throw Error([cmd,...args].join(' ')+': '+String(r.error?.message||r.status));
}
function processes(){
 const r=cp.spawnSync('pgrep',['-f','node odessa-live[.]cjs$'],{encoding:'utf8'});
 if(r.status===1)return[];
 if(r.error||r.status!==0)throw Error('Не удалось проверить процесс радара');
 return String(r.stdout||'').trim().split(/\s+/).filter(Boolean).map(Number).filter(pid=>Number.isInteger(pid)&&pid>1);
}
function patchFilter(source,func){
 if(source.includes(marker))return source;
 const re=new RegExp('((?:export\\s+)?function\\s+'+func+'\\s*\\(\\s*text\\s*\\)\\s*\\{)');
 const match=re.exec(source);
 if(!match)return null;
 const before=source.slice(0,match.index),after=source.slice(match.index).replace(re,'$1\n return odessaRadarAllExceptV3(text);');
 return before+common+'\n'+after;
}
function patchOutgoing(source){
 if(!source.includes(marker))throw Error('В облачном обработчике нет нового фильтра');
 if(source.includes('function odessaRadarStripSourceV3('))return source;
 const start=source.indexOf('async function odessaPrepareArgs('),end=source.indexOf('async function odessaSendEmoji(',start);
 if(start<0||end<start)throw Error('Не найдена точка подготовки радарных сообщений');
 const section=source.slice(start,end);
 const returns=[...section.matchAll(/return\s+([^;\n]+)\s*;/g)];
 const last=returns.at(-1);
 if(!last)throw Error('В подготовке отправки не найден return');
 const expression=last[1].trim();
 if(!/^(?:odessaRadarOfflineUaV2\(|await\s+odessaTranslateRadarV1\(|odessaTransitBowV1\(|prepared\b)/.test(expression))
  throw Error('Неизвестный формат подготовки отправки, файлы не изменены');
 return source.slice(0,start)+outbound+'\n'+section.slice(0,last.index)
      +'return odessaRadarStripSourceV3('+expression+',key);'
      +section.slice(last.index+last[0].length)+source.slice(end);
}
function syntax(s,name){
 const temp=path.join(root,name+'.radar-v3-check.mjs');
 try{fs.writeFileSync(temp,s);exec(process.execPath,['--check',temp],{timeout:30000})}
 finally{try{fs.unlinkSync(temp)}catch{}}
}
function tests(){
 const ops=vm.runInNewContext(common+'\n({clean:odessaRadarCleanSourceV3,ok:odessaRadarAllExceptV3})');
 const yes=[
  '5 на Вилково','7х на Килию','Вилкове/Ліски 1х','Минус','Орлан тут ☝️',
  'Так заходят','Дорозвідка','Утконосовка ВЗРЫВЫ 💥','Реактив через Березівський район. Транзит',
  '🔴 Объявлена воздушная тревога','✅ ОТБОЙ ВОЗДУШНОЙ ТРЕВОГИ',
  'Пока всё тихо','На юг области в сторону Измаила заходят'
 ];
 const no=['Реклама и скидки на услуги','Сбор средств на ВСУ','Збір коштів на ЗСУ',
  'В Одессе пострадали двое людей','Новости дня: событие в городе','График отключения света ДТЕК',
  'Изменил фото канала','Вакансия в Одессе'];
 for(const s of yes)if(!ops.ok(s))throw Error('Пропуск оперативного сообщения: '+s);
 for(const s of no)if(ops.ok(s))throw Error('Пропускается запрещённое сообщение: '+s);
 const linked='5 на Вилково\nОДЕССА ИНФО LIVE - радар Одеса\nhttps://t.me/odessa_inform/15';
 if(ops.clean(linked)!=='5 на Вилково')throw Error('Источник не удалён');
 if(!ops.ok(linked))throw Error('Оперативное сообщение со ссылкой не прошло');
 return ops;
}
function launch(){
 const log=fs.openSync(path.join(root,'odessa-live.log'),'a');
 try{const p=cp.spawn(process.execPath,['odessa-live.cjs'],{cwd:root,detached:true,stdio:['ignore',log,log]});p.unref();}
 finally{fs.closeSync(log)}
}
async function main(){
 if(!fs.existsSync(path.join(root,'odessa-live.cjs')))throw Error('Не найден работающий проект бота');
 const ops=tests();
 const files=[
  ['odessa-live-policy.mjs','isAlertPost','local'],
  ['odessa-radar-filter.mjs','radarOperational','local'],
  ['tgcloud/endpoints/odessaLive.js','isAlertPost','cloud'],
  ['tgcloud/lib/odessaRadarFilter.js','radarOperational','cloud']
 ];
 const updated=[],recognized=[];
 for(const [rel,name,group] of files){
  const file=path.join(root,rel);
  if(!fs.existsSync(file))continue;
  const original=fs.readFileSync(file,'utf8');
  let content=patchFilter(original,name);
  if(content===null)continue;
  if(rel==='tgcloud/endpoints/odessaLive.js')content=patchOutgoing(content);
  syntax(content,'odessa-copy-'+group);
  recognized.push({rel,group});
  if(content!==original)updated.push({rel,group,file,original,content});
 }
 if(!recognized.some(x=>x.group==='local')||!recognized.some(x=>x.group==='cloud'))throw Error('Не найдены совместимые фильтры, ничего не меняем');
 // Multiple live publishers can duplicate alerts. Stop safely rather than risk a second.
 const existing=processes();
 if(existing.length>1)throw Error('Работает несколько радаров: установка остановлена');
 const backup=path.join(root,'backups','radar-all-except-v3-'+Date.now());
 if(!updated.length){console.log('✅ Правило уже установлено. Радар не перезапускаю.');return}
 fs.mkdirSync(backup,{recursive:true});
 for(const x of updated){const dest=path.join(backup,x.rel);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,x.original)}
 const restore=()=>{for(const x of updated)fs.copyFileSync(path.join(backup,x.rel),x.file)};
 try{
  for(const x of updated){const temp=x.file+'.radar-v3-new';fs.writeFileSync(temp,x.content);fs.renameSync(temp,x.file)}
  for(const x of updated.filter(x=>x.group==='cloud'))exec('npx',['tgcloud','push',x.rel]);
 }catch(e){restore();throw Error('Публикация не завершена. Локальные файлы восстановлены: '+e.message)}
 if(existing.length===1){
  try{process.kill(existing[0],'SIGTERM')}catch(e){if(e.code!=='ESRCH')throw e}
  await new Promise(r=>setTimeout(r,3500));
  if(processes().length)throw Error('Старый радар не остановился, второй не запускаем');
 }
 if(!processes().length){
  const lock=path.join(root,'odessa-live.lock');
  if(fs.existsSync(lock)){
   const old=Number(fs.readFileSync(lock,'utf8'));
   if(Number.isInteger(old)&&old>1){
    try{process.kill(old,0);throw Error('Запущен ещё один радар — не запускаю новый')}
    catch(e){if(e.code!=='ESRCH')throw e}
   }
  }
  launch();
  await new Promise(r=>setTimeout(r,4500));
 }
 if(!processes().length)throw Error('Радар не поднялся, проверьте odessa-live.log');
 console.log('✅ Радар запущен. Все сообщения источника, кроме новостей, сборов, рекламы и служебных объявлений, разрешены фильтром.');
 console.log('✅ Источники и ссылки удаляются из текста (не из нарисованных поверх фото водяных знаков).');
 console.log('✅ Электричество, новости, курсор обработанных сообщений и комментарии не изменены.');
 console.log('⚠️ Если вложение недоступно в Telegram или другие правила публикации блокируют пост, его пересылка не гарантируется.');
}
main().catch(e=>{console.error('❌ '+String(e.message||e));process.exitCode=1});

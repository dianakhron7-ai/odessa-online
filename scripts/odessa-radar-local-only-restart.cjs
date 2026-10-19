'use strict';
// Only Termux-local radar filters are modified. Never push, fetch or edit tgcloud files or other workers.
const fs=require('fs'), path=require('path'),os=require('os'),cp=require('child_process');
const {pathToFileURL}=require('url');
const root=path.join(os.homedir(),'OdessaOnlineGuideBot');
const marker='ODESSA_FULL_RADAR_20261019_V1';
const rule="\n // ODESSA_FULL_RADAR_20261019_V1\n // Оперативные сообщения радара: тревога, отбой, транзит, движения, районы, короткие уточнения.\n const radarReport=String(text||'').replace(/[\\u200B-\\u200D\\uFEFF]/g,'').trim();\n if(radarReport && radarReport.length<=1000\n   && !/реклам|промокод|розыгрыш|розіграш|донат|збір\\s+кошт|сбор\\s+средств|монобанк|monobank|privat24|підписуй|подписыв|https?:\\/\\/|t\\.me\\/|прайс|ваканс|продам|куплю|акци[яї]|супермаркет|погода|курс валют|гороскоп|концерт|фестиваль/i.test(radarReport)\n   && !/внаслідок|унаслідок|наслідки|последств|постраждал|пострадав|загиб|погиб|поранен|ранен|поврежден|пошкоджен|міністр|министр|депутат|політик|политик/i.test(radarReport)){\n   const urgent=/повітрян|воздушн|тривог|тревог|відбій|отбой|відмен[аы]|скасуван|бпл|бпла|шахед|дрон|ракет|баліст|баллист|реактив|авіац|авиац|міг[- ]?31|миг[- ]?31|пуск|виліт|вылет|заліта|залета|лети(?:т|ть|м)|летят|руха|движ|курс(?:ом|у|а|$)|напрям|направлен|маневр|ман[её]вр|транзи[тт]|транзіт|перехоп|перехват|вибух|взрыв|ппо|пво|чисто|розвідк|разведк|укритт|укрыт|ціль|цель|обстр[іе]л|прил[іе]т|доразвед|дорозвід|загроз|угроз|небезпек|опасност|скорост|швидкост|поворот|розворот|разворот/i.test(radarReport);\n   const shortDirection=radarReport.length<=165 && /^(?:пока|поки|снова|знову|ще|через|у бік|в бік|в сторону|на|направление|напрямок|рух|курс)\\b/i.test(radarReport);\n   const localities=/(?:одес|област|район|мор[еяі]|аркад|черемуш|пересип|крыжанов|крижанів|центр|молдаван|буг[ао]ев|буг[ао]їв|бел[яі]ев|біл[яі]їв|та[їи]ров|черномор|чорномор|фонтан|пос[еі]л|кот[оі]в|доброслав|балта|под[іо]ль|берез[іе]в|лиман|совин|совін|теремк|солон|усатов|лиманк|зато[кц]|ізма[їи]л|измаил)/i.test(radarReport);\n   const barePlaces=radarReport.length<=100 && localities && !/[.!?]{2}|https?:/i.test(radarReport) && /^[А-Яа-яІіЇїЄєҐґ0-9,\\s;:—–.-]+$/u.test(radarReport);\n   if(urgent||(shortDirection&&localities)||barePlaces)return true;\n }\n";
const targets=['odessa-live-policy.mjs','odessa-radar-filter.mjs'];
function run(cmd,args){
 const r=cp.spawnSync(cmd,args,{cwd:root,encoding:'utf8',timeout:30000});
 if(r.error||r.status!==0)throw Error([cmd,...args].join(' ')+': '+(r.stderr||r.error?.message||r.status));
 return r.stdout||'';
}
function radarPids(){
 const r=cp.spawnSync('pgrep',['-f','node odessa-live[.]cjs$'],{cwd:root,encoding:'utf8'});
 if(r.status===1)return [];
 if(r.status!==0)throw Error('Невозможно проверить радар: '+(r.stderr||r.status));
 return r.stdout.trim().split(/\s+/).filter(Boolean).map(Number);
}
async function checkFilter(filename,example){
 const m=await import(pathToFileURL(path.join(root,filename)).href+'?test='+Date.now());
 const fn=m.isAlertPost||m.radarOperational;
 if(typeof fn!=='function')return null;
 return Boolean(fn(example));
}
async function main(){
 if(!fs.existsSync(root))throw Error('Папка бота не найдена');
 const edits=[],backups=[];
 for(const filename of targets){
  const file=path.join(root,filename);
  if(!fs.existsSync(file))continue;
  const before=fs.readFileSync(file,'utf8');
  const pattern=/((?:export\s+)?function\s+(?:isAlertPost|radarOperational)\s*\(\s*text\s*\)\s*\{)/g;
  const found=[...before.matchAll(pattern)];
  if(found.length<1)continue;
  const after=before.includes(marker)?before:before.replace(pattern,(_,start)=>start+rule);
  const probe=file+'.local-radar-check.mjs';
  fs.writeFileSync(probe,after);
  try{run(process.execPath,['--check',probe]);}
  finally{try{fs.unlinkSync(probe)}catch{}}
  edits.push({filename,file,before,after,changed:before!==after});
 }
 if(!edits.length)throw Error('Не найдены функции местного радара. Ничего не меняю.');
 const backup=path.join(root,'radar-local-before-'+new Date().toISOString().replace(/\D/g,'').slice(0,14));
 fs.mkdirSync(backup,{recursive:true});
 const changed=edits.filter(x=>x.changed);
 for(const x of changed){
  const destination=path.join(backup,x.filename);
  fs.copyFileSync(x.file,destination);
  backups.push({path:x.file,backup:destination});
  fs.writeFileSync(x.file,x.after);
 }
 async function restore(){for(const x of backups)fs.copyFileSync(x.backup,x.path);}
 try{
  const cases=['Снова транзит через север области будет','Пока крутится в море','Повітряна тривога в Березівському районі','✅ОТБОЙ ВОЗДУШНОЙ ТРЕВОГИ'];
  for(const x of edits){
   for(const example of cases){
    const accepted=await checkFilter(x.filename,example);
    if(accepted===false)throw Error('Фильтр '+x.filename+' не пропускает сообщение: '+example);
   }
  }
 }catch(e){await restore();throw e;}
 console.log('✅ Местные фильтры проверены. Резервная копия: '+backup);
 if(!changed.length){console.log('✅ Фильтры уже обновлены; радар не трогаю.');return;}
 const old=radarPids();
 if(old.length>1)throw Error('Несколько процессов радара. Не перезапускаю автоматически.');
 if(old.length===1)try{process.kill(old[0],'SIGTERM')}catch(e){if(e.code!=='ESRCH')throw e}
 await new Promise(r=>setTimeout(r,4500));
 if(radarPids().length)throw Error('Старый радар ещё работает. Второй запуск отменён.');
 const lock=path.join(root,'odessa-live.lock');
 if(fs.existsSync(lock)){const stale=lock+'.before-'+Date.now();fs.renameSync(lock,stale);console.log('Старый lock сохранён: '+stale);}
 function launch(){
  const log=fs.openSync(path.join(root,'odessa-live.log'),'a');
  const p=cp.spawn(process.execPath,['odessa-live.cjs'],{cwd:root,detached:true,stdio:['ignore',log,log]});
  p.unref();fs.closeSync(log);
  return p.pid;
 }
 const pid=launch();
 await new Promise(r=>setTimeout(r,4500));
 if(!radarPids().length){
  console.error('❌ Новый радар не запустился. Восстанавливаю прежние фильтры.');
  await restore();
  if(radarPids().length)throw Error('Радар уже запустился, второй не запускаю');
  if(fs.existsSync(lock))fs.renameSync(lock,lock+'.failed-'+Date.now());
  const pidOld=launch();
  await new Promise(r=>setTimeout(r,4500));
  console.log(radarPids().length?'✅ Старый радар восстановлен: '+pidOld:'⚠️ Радар не запустился, проверьте журнал');
  throw Error('Новое правило не запустилось; исправление отменено.');
 }
 console.log('✅ РАДАР РАБОТАЕТ С НОВЫМ ФИЛЬТРОМ. PID '+pid);
 console.log('✅ Облачный фильтр не изменялся. Новости и свет не тронуты. Старые посты не повторяем.');
}
main().catch(e=>{console.error('❌ '+e.message);process.exitCode=1;});

// ODESSA_RADAR_TRANSIT_INSTALLER_V1
// Narrowly allow short radar transit updates through both local and cloud filters.
// All old cursor/state files are left unchanged; no replays.
'use strict';
const fs=require('fs');
const os=require('os');
const path=require('path');
const cp=require('child_process');
const {pathToFileURL}=require('url');
const root=path.join(os.homedir(),'OdessaOnlineGuideBot');
const marker='ODESSA_ALLOW_TRANSIT_20261019_V1';
const insert=[
 '',
 ' // '+marker,
 ' // Короткие сообщения о транзите из радарного источника — не формальная тревога.',
 ' const odessaTransit=String(text||"").replace(/[\u200B-\u200D\uFEFF]/g,"").trim();',
 ' if(odessaTransit.length>0&&odessaTransit.length<=350',
 '   &&/транзит|транзіт/i.test(odessaTransit)',
 '   &&/област|район|одес|север|північ|юг|півден|бпл|дрон|шахед|ракети|ракет/i.test(odessaTransit)',
 String.raw`   &&!/реклам|донат|збір|сбор|промокод|https?:\/\/|t\.me\/|підпиш|подпиш|купить|продам/i.test(odessaTransit)) return true;`,
 ''
].join('\n');
const plans=[
 {rel:'odessa-live-policy.mjs',target:'local'},
 {rel:'odessa-radar-filter.mjs',target:'local'},
 {rel:'tgcloud/endpoints/odessaLive.js',target:'cloud'},
 {rel:'tgcloud/lib/odessaRadarFilter.js',target:'cloud'},
];
function run(cmd,args,opts={}){
 const out=cp.spawnSync(cmd,args,{cwd:root,encoding:'utf8',timeout:180000,maxBuffer:5000000,...opts});
 if(out.stdout)process.stdout.write(out.stdout);
 if(out.stderr)process.stderr.write(out.stderr);
 if(out.error||out.status!==0)throw Error('Команда не прошла: '+cmd+' '+args.join(' ')+' ('+(out.error?.message||out.status)+')');
 return (out.stdout||'').trim();
}
function running(){
 const r=cp.spawnSync('pgrep',['-f','node odessa-live[.]cjs$'],{encoding:'utf8'});
 if(r.status===1)return [];
 if(r.status!==0)throw Error('Не удалось проверить процесс радара');
 return r.stdout.trim().split(/\s+/).map(Number).filter(n=>Number.isInteger(n)&&n>0&&n!==process.pid);
}
async function main(){
 if(!fs.existsSync(root))throw Error('Папка OdessaOnlineGuideBot не найдена');
 const modified=[],existing=[];
 for(const p of plans){
  const file=path.join(root,p.rel);
  if(!fs.existsSync(file))continue;
  const before=fs.readFileSync(file,'utf8');
  const pattern=/((?:export\s+)?function\s+(?:isAlertPost|radarOperational)\s*\(\s*text\s*\)\s*\{)/g;
  const after=before.includes(marker)?before:before.replace(pattern,(m)=>m+insert);
  existing.push({...p,file});
  if(after===before)continue;
  const extension=path.extname(file);
  const temp=file+'.transit-check'+extension;
  try{
   fs.writeFileSync(temp,after);
   run(process.execPath,['--check',temp]);
  }finally{try{fs.unlinkSync(temp);}catch{}}
  modified.push({...p,file,before,after});
 }
 const all=[...existing.map(x=>({target:x.target,rel:x.rel,source:fs.readFileSync(x.file,'utf8')})),...modified.map(x=>({target:x.target,rel:x.rel,source:x.after}))];
 for(const type of ['local','cloud']){
  if(!all.some(x=>x.target===type&&(x.source.includes(marker)||modified.some(m=>m.rel===x.rel))))
   throw Error('Не найден совместимый фильтр '+type+'. Ничего не изменено; пришлите скриншот.');
 }
 console.log('✅ Найдены локальный и облачный фильтры радара.');
 if(!modified.length){console.log('✅ Правило транзита уже установлено. Перезапуск не нужен.');return;}
 const backups=path.join(root,'radar-transit-backup-'+new Date().toISOString().replace(/[-:.TZ]/g,'').slice(0,14));
 fs.mkdirSync(backups,{recursive:true});
 for(const m of modified){
  const b=path.join(backups,m.rel);
  fs.mkdirSync(path.dirname(b),{recursive:true});
  fs.copyFileSync(m.file,b);
 }
 console.log('✅ Резервная копия: '+backups);
 // Check saved cursor exists and do not modify it.
 const state=path.join(root,'odessa-live-state.json');
 const cursorPresent=fs.existsSync(state);
 for(const m of modified){
  const tmp=m.file+'.transit-new';
  fs.writeFileSync(tmp,m.after);
  fs.renameSync(tmp,m.file);
 }
 try{
  const local=await import(pathToFileURL(path.join(root,'odessa-live-policy.mjs')).href+'?transitfix=1');
  if(typeof local.isAlertPost==='function'&&!local.isAlertPost('Снова транзит через север области будет'))
   throw Error('Проверка: местный фильтр не пропускает транзит');
  if(fs.existsSync(path.join(root,'odessa-radar-filter.mjs'))){
   const other=await import(pathToFileURL(path.join(root,'odessa-radar-filter.mjs')).href+'?transitfix=1');
   if(typeof other.radarOperational==='function'&&!other.radarOperational('Снова транзит через север области будет'))
    throw Error('Проверка: вспомогательный фильтр не пропускает транзит');
  }
  console.log('✅ Фраза «Снова транзит через север области будет» проходит новые правила.');
  for(const m of modified.filter(x=>x.target==='cloud'))run('npx',['tgcloud','push',m.rel]);
  console.log('✅ Правило опубликовано в Telegram Cloud.');
 }catch(e){
  for(const m of modified){try{fs.copyFileSync(path.join(backups,m.rel),m.file);}catch{}}
  throw e;
 }
 if(cursorPresent&&!fs.existsSync(state))throw Error('Файл состояния радара исчез во время обновления. Перезапуск остановлен.');
 const pids=running();
 for(const pid of pids)try{process.kill(pid,'SIGTERM');}catch(e){if(e.code!=='ESRCH')throw e;}
 if(pids.length)run('sleep',['2']);
 if(running().length)throw Error('Старый радар не остановился. Не запускаю второй экземпляр.');
 const log=fs.openSync(path.join(root,'odessa-live.log'),'a');
 const child=cp.spawn(process.execPath,['odessa-live.cjs'],{cwd:root,detached:true,stdio:['ignore',log,log]});
 child.unref();fs.closeSync(log);
 run('sleep',['3']);
 if(!running().length)throw Error('Радар не запустился. Проверьте odessa-live.log');
 console.log('✅ Радар запущен с новым фильтром. Новости и свет не изменялись.');
 console.log('ℹ️ Старые сообщения не пересылаются; новые транзиты должны проходить.');
}
main().catch(e=>{console.error('❌ Исправление не завершено:',e.message);process.exitCode=1;});

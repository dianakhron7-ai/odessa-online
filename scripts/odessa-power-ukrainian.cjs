'use strict';
// Enable Ukrainian translation of power-outage updates in the already installed news/radar translator.
// Safely patches the outgoing odessaLive Cloud handler only. No worker restart or cursor reset.
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const cp=require('node:child_process');
const vm=require('node:vm');
const root=path.join(os.homedir(),'OdessaOnlineGuideBot');
const rel='tgcloud/endpoints/odessaLive.js';
const file=path.join(root,rel);
const marker='ODESSA_COPIED_POWER_UK_V1';
const isStart='function odessaRadarUkIsAlertV1(text){';
const needsStart='function odessaRadarUkNeedsTranslateV1(text){';
const remoteStart='async function odessaRadarUkRemoteV1(text){';
const newPredicate=[
 '// '+marker+' — include power messages in the existing translation.',
 isStart,
 " const s=String(text||'');",
 ' if(!s.trim())return false;',
 ' // Comment notifications are not copied news or power updates.',
 ' if(/^\\s*💬\\s*(?:Новый комментарий|Новый ответ|Новий коментар|Нова відповідь)/i.test(s))return false;',
 ' return true;',
 '}',
 ''
].join('\n');
const additionalRussianPowerWords=' if(/(?:отключен|включен|электро|электрич|электроснабж|света|свету|дали свет|нет свет|без свет|график|дтэк|очеред|групп|аварийн|экстренн|планов[а-я]*\\s+отключ|обесточ|восстанов|ремонтн|подач[аиу]\\s+свет|потребител|возобнов)/i.test(s))return true;';
function run(cmd,args){
 const r=cp.spawnSync(cmd,args,{cwd:root,encoding:'utf8',timeout:180000,maxBuffer:5000000});
 if(r.stdout)process.stdout.write(r.stdout);
 if(r.stderr)process.stderr.write(r.stderr);
 if(r.error||r.status!==0)throw Error('Команда завершилась с ошибкой: '+cmd+' '+args.join(' '));
}
function patched(before){
 if(before.includes(marker))return before;
 if(!before.includes('ODESSA_RADAR_UK_V1')||!before.includes('ODESSA_COPIED_NEWS_UK_V1'))
  throw Error('Сначала установите перевод тревог и новостей. Ничего не изменено.');
 const start=before.indexOf(isStart),middle=before.indexOf(needsStart,start),end=before.indexOf(remoteStart,middle);
 if(start<0||middle<=start||end<=middle)throw Error('Версия переводчика не совпадает. Ничего не изменено.');
 const needs=before.slice(middle,end);
 const needle='if(/[ыэъё]/i.test(s))return true;';
 if(!needs.includes(needle))throw Error('Точка проверки русского языка не найдена. Ничего не изменено.');
 const nextNeeds=needs.replace(needle,needle+'\n'+additionalRussianPowerWords);
 return before.slice(0,start)+newPredicate+'\n'+nextNeeds+before.slice(end);
}
function test(after){
 const start=after.indexOf(isStart),end=after.indexOf(remoteStart,start);
 if(start<0||end<=start)throw Error('Проверка новых правил невозможна.');
 const f=vm.runInNewContext(after.slice(start,end)+'\n({eligible:odessaRadarUkIsAlertV1,needs:odessaRadarUkNeedsTranslateV1})');
 const examples=[
  ['⚡ График отключения света. Группа 1.1: с 08:00 до 12:00',true,true],
  ['⚡ Графік відключення світла. Група 1.1: з 08:00 до 12:00',true,false],
  ['⚡ Графік світла: группа 2.2 отримала живлення',true,true],
  ['ДТЭК: света пока нет, очередь 3.1',true,true],
  ['📰 Новости Одессы',true,true],
  ['🚨 Воздушная тревога в Одессе',true,true],
  ['💬 Новый комментарий к публикации',false,false],
  ['',false,false]
 ];
 for(const [s,eligible,needs] of examples){
  if(f.eligible(s)!==eligible)throw Error('Проверка категории не прошла: '+s);
  if(eligible&&f.needs(s)!==needs)throw Error('Проверка языка не прошла: '+s);
 }
 if(!after.includes('return await odessaTranslateRadarV1('))
  throw Error('Не найден общий обработчик отправки, ничего не изменено.');
}
try{
 if(!fs.existsSync(file))throw Error('Не найдена папка Telegram Cloud в Termux.');
 const before=fs.readFileSync(file,'utf8'),after=patched(before);
 test(after);
 if(after===before){console.log('✅ Перевод сообщений об электричестве уже установлен.');process.exit(0);}
 const tmp=file+'.power-uk-check.js';
 try{fs.writeFileSync(tmp,after);run(process.execPath,['--check',tmp]);}
 finally{fs.rmSync(tmp,{force:true});}
 const backup=file+'.backup-power-uk-'+Date.now();
 fs.copyFileSync(file,backup);
 fs.writeFileSync(file,after);
 try{run('npx',['tgcloud','push',rel]);}
 catch(e){fs.copyFileSync(backup,file);throw e;}
 console.log('✅ Перевод сообщений об электричестве на украинский подключён.');
 console.log('✅ Перевод тревог и новостей сохранён.');
 console.log('✅ Источники, графики, бот и история не изменены.');
 console.log('✅ Резервная копия: '+backup);
 console.log('ℹ️ При сбое переводчика исходные сообщения не пропускаются.');
}catch(e){console.error('❌ '+String(e?.message||e));process.exitCode=1;}

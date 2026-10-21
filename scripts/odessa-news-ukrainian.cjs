'use strict';
// Enable Ukrainian translation of copied news in the existing cloud outgoing handler.
// Does not change sources, message selection, cursor, publishing processes or power posts.
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const cp=require('node:child_process');
const vm=require('node:vm');
const root=path.join(os.homedir(),'OdessaOnlineGuideBot');
const rel='tgcloud/endpoints/odessaLive.js';
const file=path.join(root,rel);
const marker='ODESSA_COPIED_NEWS_UK_V1';
const originalStart='function odessaRadarUkIsAlertV1(text){';
const originalEnd='function odessaRadarUkNeedsTranslateV1(text){';
const replacement=[
 '// '+marker+' — the existing translator now covers copied news.',
 'function odessaRadarUkIsAlertV1(text){',
 " const s=String(text||'');",
 ' if(!s.trim())return false;',
 ' // Leave electricity posts and comment notifications untouched.',
 ' if(/(?:відключен|отключен|електроенерг|электроэнерг|електропостач|электроснабж|світла|света|графік|график|дтек|дтэк|черг[аи]|очеред[ьи])/i.test(s))return false;',
 ' if(/^\s*💬\s*(?:Новый комментарий|Новый ответ|Новий коментар|Нова відповідь)/i.test(s))return false;',
 ' return true;',
 '}',
 ''
].join('\n');
function run(cmd,args){
 const r=cp.spawnSync(cmd,args,{cwd:root,encoding:'utf8',timeout:180000,maxBuffer:5e6});
 if(r.stdout)process.stdout.write(r.stdout);
 if(r.stderr)process.stderr.write(r.stderr);
 if(r.error||r.status!==0)throw new Error('Команда завершилась с ошибкой: '+cmd+' '+args.join(' '));
}
function patched(before){
 if(before.includes(marker))return before;
 if(!before.includes('ODESSA_RADAR_UK_V1'))throw new Error('Сначала установите украинский перевод тревог.');
 const start=before.indexOf(originalStart),end=before.indexOf(originalEnd,start+originalStart.length);
 if(start<0||end<start||!before.slice(start,end).includes('regular news'))
  throw new Error('Версия переводчика не совпадает: ничего не изменено.');
 return before.slice(0,start)+replacement+'\n'+before.slice(end);
}
function test(after){
 const start=after.indexOf(originalStart),end=after.indexOf(originalEnd,start);
 if(start<0||end<start)throw new Error('Невозможно проверить перевод.');
 const f=vm.runInNewContext(after.slice(start,end)+'\nodessaRadarUkIsAlertV1');
 for(const [s,expected] of [
  ['📰 В Одессе сообщили о новых событиях',true],
  ['🚨 Воздушная тревога в Одессе',true],
  ['Снова транзит через север области 🏹',true],
  ['График отключения света от ДТЕК',false],
  ['',false]
 ])if(f(s)!==expected)throw new Error('Тест не пройден: '+s);
 if(!after.includes('odessaTranslateRadarV1('))throw new Error('Обработчик перевода не найден.');
}
try{
 if(!fs.existsSync(file))throw new Error('Не найдена папка Telegram Cloud в Termux.');
 const before=fs.readFileSync(file,'utf8'),after=patched(before);
 test(after);
 if(before===after){console.log('✅ Перевод новостей уже установлен.');process.exit(0);}
 const temp=file+'.news-uk-check.js';
 try{fs.writeFileSync(temp,after);run(process.execPath,['--check',temp]);}
 finally{fs.rmSync(temp,{force:true});}
 const backup=file+'.backup-news-uk-'+Date.now();
 fs.copyFileSync(file,backup);
 fs.writeFileSync(file,after);
 try{run('npx',['tgcloud','push',rel]);}
 catch(e){fs.copyFileSync(backup,file);throw e;}
 console.log('✅ Перевод русскоязычных новостей и тревог на украинский подключён.');
 console.log('✅ Источники, публикации, сообщения об электричестве и история не изменены.');
 console.log('✅ Резервная копия: '+backup);
 console.log('ℹ️ При недоступности переводчика исходный текст сохраняется.');
}catch(e){console.error('❌ '+String(e.message||e));process.exitCode=1;}

#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),os=require('os'),cp=require('child_process');
const root=path.join(os.homedir(),'OdessaOnlineGuideBot');
const endpoint='tgcloud/endpoints/odessaRadarExpiry.js';
const local='odessa-radar-expiry.cjs';
const cloudCode=`// ODESSA_OWNER_DISABLED_AUTO_DELETE_20261119
export async function scheduleRadarExpiry(){return {disabled:true};}
export default async function(){const result={disabled:true,deleted:0};console.log('ODESSA_AUTO_DELETE_DISABLED');return result;}
`;
const localCode=`// ODESSA_OWNER_DISABLED_AUTO_DELETE_20261119
exports.create=()=>({tick(){return {disabled:true,deleted:0};}});
`;
const backup=path.join(root,'backups','autodelete-off-'+Date.now());
function pids(pattern){const r=cp.spawnSync('pgrep',['-f',pattern],{encoding:'utf8'});if(r.status===1)return [];if(r.status!==0)throw Error('Не удалось проверить процессы');return r.stdout.trim().split(/\s+/).filter(x=>/^\d+$/.test(x)).map(Number);}
async function stop(list){for(const pid of list)try{process.kill(pid,'SIGTERM');}catch(e){if(e.code!=='ESRCH')throw e;}for(let n=0;n<50;n++){if(!list.some(pid=>{try{process.kill(pid,0);return true;}catch{return false;}}))return;await new Promise(r=>setTimeout(r,100));}throw Error('Процесс ещё останавливается. Повтори установку.');}
function cli(args){const r=cp.spawnSync(process.execPath,[path.join(root,'node_modules/.bin/tgcloud'),...args],{cwd:root,encoding:'utf8',timeout:45000,maxBuffer:2000000});if(r.stdout)process.stdout.write(r.stdout);if(r.stderr)process.stderr.write(r.stderr);if(r.error||r.status!==0)throw Error('TGCloud не подтвердил отключение в облаке: '+(r.error?.code||r.signal||r.status));return r.stdout||'';}
(async()=>{
 if(!fs.existsSync(path.join(root,'odessa-live.cjs')))throw Error('Не найдена папка работающего бота');
 fs.mkdirSync(backup,{recursive:true,mode:0o700});
 for(const rel of [endpoint,local]){const file=path.join(root,rel);if(fs.existsSync(file))fs.copyFileSync(file,path.join(backup,path.basename(rel)));}
 const workers=pids('node odessa-live[.]cjs$');
 await stop([...new Set([...pids('[t]gcloud run endpoints/odessaRadarExpiry'),...workers])]);
 fs.writeFileSync(path.join(root,local),localCode);
 fs.mkdirSync(path.dirname(path.join(root,endpoint)),{recursive:true});
 fs.writeFileSync(path.join(root,endpoint),cloudCode);
 console.log('Локальный обработчик удаления отключён. Резервная копия: '+backup);
 let remoteError;
 try{
  cli(['push',endpoint]);
  const output=cli(['run','endpoints/odessaRadarExpiry','{}']);
  if(!output.includes('ODESSA_AUTO_DELETE_DISABLED'))throw Error('Нет подтверждения новой версии обработчика');
  console.log('ПОДТВЕРЖДЕНО: облачный обработчик не удаляет сообщения и не планирует удаления.');
 }catch(e){remoteError=e;}
 // Restart only the worker which was running before installation.
 if(workers.length){
  cp.spawnSync('termux-wake-lock',[],{stdio:'ignore'});
  const log=fs.openSync(path.join(root,'odessa-live.log'),'a',0o600);
  const child=cp.spawn(process.execPath,['odessa-live.cjs'],{cwd:root,detached:true,stdio:['ignore',log,log]});fs.closeSync(log);
  child.on('error',e=>{console.error('Ошибка запуска копирования: '+e.message);process.exitCode=1;});child.unref();console.log('Копирование перезапущено.');
 }
 if(remoteError){console.error('ВНИМАНИЕ: локальное удаление отключено, но облачное отключение НЕ подтверждено. '+remoteError.message);process.exitCode=1;return;}
 console.log('ГОТОВО: автоудаление радарных сообщений отключено локально и в облаке.');
})().catch(e=>{console.error(e.message);process.exitCode=1;});

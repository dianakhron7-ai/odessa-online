#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),os=require('os'),cp=require('child_process');
const root=path.join(os.homedir(),'OdessaOnlineGuideBot');
const lib='tgcloud/lib/odessaGroupComments.js',endpoint='tgcloud/endpoints/odessaRemoveCommentButtons.js';
const endpointCode="import {api,db,EndpointError} from 'sdk';\nimport {sql} from 'sdk/db';\nimport {commentsMarkup} from '../lib/odessaGroupComments.js';\nconst GROUP=-1004426768141;\nexport default async function(input,ctx){\n if(ctx?.initData||ctx?.update)throw new EndpointError('Только служебный запуск');\n const prefix='oc3:root:'+GROUP+':',cursor=String(input?.cursor||'');\n if(cursor&&!cursor.startsWith(prefix))throw new EndpointError('Неверная позиция');\n const rows=await db.all(sql`SELECT key,value FROM odessa_settings WHERE key LIKE ${prefix+'%'} AND key > ${cursor} ORDER BY key LIMIT 15`);\n let changed=0;const failed=[];\n for(const row of rows){\n  let post;try{post=JSON.parse(row.value);}catch{failed.push({key:row.key,error:'invalid record'});continue;}\n  const id=Number(post.holder);if(!Number.isSafeInteger(id)||id<1)continue;\n  try{await api.editMessageReplyMarkup({chat_id:GROUP,message_id:id,reply_markup:commentsMarkup(post.base||{})});changed++;}\n  catch(e){const message=String(e.description||e.message||e);if(!/message is not modified|message to edit not found/i.test(message))failed.push({id,error:message.slice(0,180)});}\n }\n const result={scanned:rows.length,changed,failed,cursor:rows.length===15?rows.at(-1).key:null};\n console.log('NO_COMMENTS_RESULT:'+JSON.stringify(result));return result;\n}\n";
const file=path.join(root,lib),before=fs.readFileSync(file,'utf8');
const replacement="export function commentsMarkup(base={inline_keyboard:[]},count=0,root=null){\n // ODESSA_COMMENT_BUTTON_DISABLED_V1\n return clean(base);\n}\n";
const pattern=/export function commentsMarkup\([^]*?\n}\n/;
if(!pattern.test(before))throw Error('Не найдена функция кнопки. Изменения не внесены.');
const after=before.replace(pattern,replacement);
const backup=path.join(root,'backups','no-comment-button-'+Date.now());fs.mkdirSync(backup,{recursive:true,mode:0o700});
fs.copyFileSync(file,path.join(backup,'odessaGroupComments.js'));
if(fs.existsSync(path.join(root,endpoint)))fs.copyFileSync(path.join(root,endpoint),path.join(backup,'odessaRemoveCommentButtons.js'));
// Check as ESM even when the project package defaults to CommonJS.
for(const [name,text] of [['library',after],['endpoint',endpointCode]]){
 const temp=path.join(backup,name+'.mjs');fs.writeFileSync(temp,text);
 const result=cp.spawnSync(process.execPath,['--check',temp],{encoding:'utf8'});
 if(result.status!==0)throw Error('Ошибка проверки '+name+': '+result.stderr);
 fs.unlinkSync(temp);
}
fs.writeFileSync(file,after);fs.writeFileSync(path.join(root,endpoint),endpointCode);
function cli(args){
 const r=cp.spawnSync(process.execPath,[path.join(root,'node_modules/.bin/tgcloud'),...args],{cwd:root,encoding:'utf8',timeout:60000,maxBuffer:2000000});
 if(r.stdout)process.stdout.write(r.stdout);if(r.stderr)process.stderr.write(r.stderr);
 if(r.error||r.status!==0)throw Error('TGCloud не подтвердил изменение: '+(r.error?.code||r.signal||r.status));
 return (r.stdout||'').replace(/\x1b\[[0-9;]*m/g,'');
}
try{
 cli(['push',lib]);cli(['push',endpoint]);
 console.log('Добавление кнопки «Комментарии» отключено. Убираю кнопки из ранее зарегистрированных публикаций.');
 let cursor='',scanned=0,changed=0,failed=0,finished=false;
 for(let page=0;page<2000;page++){
  const out=cli(['run','endpoints/odessaRemoveCommentButtons',JSON.stringify({cursor})]);
  const line=out.split('\n').find(x=>x.includes('NO_COMMENTS_RESULT:'));
  if(!line)throw Error('Нет подтверждения удаления старых кнопок.');
  const data=JSON.parse(line.slice(line.indexOf('NO_COMMENTS_RESULT:')+19,line.lastIndexOf('}')+1));
  scanned+=data.scanned;changed+=data.changed;failed+=data.failed.length;
  if(!data.cursor){finished=true;break;}
  if(data.cursor===cursor)throw Error('Позиция проверки не изменилась');cursor=data.cursor;
 }
 if(!finished)throw Error('Не все старые публикации проверены; повтори запуск.');
 console.log('ГОТОВО: кнопка «Комментарии» отключена. Проверено: '+scanned+', обновлено: '+changed+', ошибок: '+failed+'.');
 if(failed){console.log('Часть старых кнопок снять не удалось — ошибки указаны выше. Повторный запуск безопасен.');process.exitCode=1;}
 console.log('Тексты публикаций не удалялись. Резервная копия: '+backup);
}catch(e){console.error('Установка завершена не полностью: '+e.message+' Резервная копия: '+backup);process.exitCode=1;}

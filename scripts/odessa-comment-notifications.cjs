'use strict';
// Odessa Online - group notification after every new comment or reply.
// Changes ONLY tgcloud/lib/odessaGroupComments.js and publishes only that file.
const fs=require('fs'),path=require('path'),os=require('os'),cp=require('child_process');
const root=path.join(os.homedir(),'OdessaOnlineGuideBot');
const relative='tgcloud/lib/odessaGroupComments.js';
const filename=path.join(root,relative);
const marker='ODESSA_COMMENT_NOTIFICATIONS_V1';
const helper="// ODESSA_COMMENT_NOTIFICATIONS_V1\nasync function odessaNotifyComment(root,comment) {\n const original=await getSetting(key('root',GROUP,root));\n const topic=String(original?.text||'').replace(/\\s+/g,' ').trim();\n const shortTopic=Array.from(topic).slice(0,95).join('');\n const topicPart=topic?'\\n📌 Публикация: '+shortTopic+(Array.from(topic).length>95?'…':''):'';\n const fullBody=Array.from(String(comment.body||''));\n const preview=fullBody.slice(0,240).join('')+(fullBody.length>240?'…':'');\n const person=String(comment.author||'Участник').replace(/[\\r\\n]+/g,' ').slice(0,90);\n const header=comment.replyTo?'💬 Новый ответ на комментарий':'💬 Новый комментарий к публикации';\n const text=header+topicPart+'\\n👤 '+person+':\\n«'+preview+'»';\n const message=await api.sendMessage({\n  chat_id:GROUP,text,\n  link_preview_options:{is_disabled:true},\n  reply_markup:{inline_keyboard:[[{text:'💬 Открыть комментарии',url:link(root)}]]}\n });\n return (message?.result||message)?.message_id||null;\n}\n";
const replacement="const justSaved=await claim(itemKey,record);\n if(!justSaved)return {saved:true,id:itemKey};\n await setSetting(rate,Date.now());\n await refresh(root);\n try{\n  const notificationMessageId=await odessaNotifyComment(root,record);\n  if(notificationMessageId)await setSetting(itemKey,{...record,notificationMessageId});\n }catch(error){console.error('ODESSA_COMMENT_NOTIFICATION_FAILED',String(error?.description||error?.message||error));}\n return {saved:true,id:itemKey};";
const deleteReplacement=" if(c.notificationMessageId){\n  try{await api.deleteMessage({chat_id:GROUP,message_id:c.notificationMessageId});}\n  catch(e){console.error('ODESSA_COMMENT_NOTIFICATION_DELETE_FAILED',String(e?.description||e?.message||e));}\n }\n await refresh(root);return {deleted:true,id};";
function command(file,args) {
 const run=cp.spawnSync(file,args,{cwd:root,encoding:'utf8',timeout:180000,maxBuffer:2000000});
 if(run.stdout)process.stdout.write(run.stdout);
 if(run.stderr)process.stderr.write(run.stderr);
 if(run.error||run.status!==0)throw Error(file+' '+args.join(' ')+' завершился с ошибкой '+(run.error?.message||run.status));
 return run.stdout||'';
}
function patch(before) {
 if(before.includes(marker))return before;
 for(const required of ['export async function writeComment(', 'async function claim(', 'const GROUP=', 'const link=', 'await refresh(root);', "import {api"]) {
  if(!before.includes(required))throw Error('Файл комментариев имеет другую структуру: '+required+'. Ничего не изменено.');
 }
 const start=before.indexOf('export async function writeComment(');
 const end=before.indexOf('\nexport async function ',start+35);
 if(start<0||end<0)throw Error('Не могу безопасно выделить функцию добавления комментария');
 const section=before.slice(start,end);
 const pattern=/await\s+claim\(\s*itemKey\s*,\s*record\s*\)\s*;\s*await\s+setSetting\(\s*rate\s*,\s*Date\.now\(\)\s*\)\s*;\s*await\s+refresh\(\s*root\s*\)\s*;\s*return\s+\{\s*saved\s*:\s*true\s*,\s*id\s*:\s*itemKey\s*\}\s*;/;
 if(!pattern.test(section))throw Error('Не найдено сохранение комментария нужной версии. Ничего не изменено.');
 const updated=section.replace(pattern,()=>replacement);
 if(updated===section)throw Error('Замена обработчика не удалась');
 let result=before.slice(0,start)+updated+before.slice(end);
 const delStart=result.indexOf('export async function deleteComment(');
 const delEnd=result.indexOf('\nexport async function ',delStart+35);
 if(delStart>=0 && delEnd>delStart) {
  const section=result.slice(delStart,delEnd);
  const anchor=' await refresh(root);return {deleted:true,id};';
  if(!section.includes(anchor))throw Error('Функция удаления отличается, прекращаю обновление.');
  result=result.slice(0,delStart)+section.replace(anchor,()=>deleteReplacement)+result.slice(delEnd);
 }
 const insertAt=result.indexOf('export async function writeComment(');
 if(insertAt<0)throw Error('Не удалось найти место добавления уведомления');
 return result.slice(0,insertAt)+helper+'\n'+result.slice(insertAt);
}
function main() {
 if(!fs.existsSync(filename))throw Error('Файл комментариев не найден. Не изменяю ничего.');
 const before=fs.readFileSync(filename,'utf8');
 const after=patch(before);
 if(before===after){console.log('✅ Уведомления уже установлены локально.');return;}
 const tmp=filename+'.notify-check.mjs';
 try{fs.writeFileSync(tmp,after);command(process.execPath,['--check',tmp]);}
 finally{try{fs.unlinkSync(tmp)}catch{}}
 const backup=filename+'.before-notify-'+new Date().toISOString().replace(/\D/g,'').slice(0,14);
 fs.copyFileSync(filename,backup);
 fs.writeFileSync(filename,after);
 console.log('✅ Резервная копия: '+backup);
 console.log('=== Публикую только библиотеку комментариев ===');
 try{
  command('npx',['tgcloud','push',relative]);
  console.log('✅ УВЕДОМЛЕНИЯ В ГРУППЕ ВКЛЮЧЕНЫ.');
  console.log('Один новый комментарий или ответ — одно уведомление с кнопкой.');
 }catch(e){
  console.error('⚠️ Загрузка не подтверждена. Не повторяйте команду до проверки состояния облака.');
  console.error('⚠️ Локальный файл изменён, предыдущая версия сохранена в резервной копии.');
  process.exitCode=1;
 }
}
try{main()}catch(e){console.error('❌ '+e.message);process.exitCode=1}

'use strict';
// ODESSA private notifications: opt-in through the existing Comments Mini App.
// Only comment library, one new endpoint, and two copies of comment Mini App HTML.
const fs=require('fs'),path=require('path'),os=require('os'),cp=require('child_process');
const root=path.join(os.homedir(),'OdessaOnlineGuideBot');
const libRel='tgcloud/lib/odessaGroupComments.js';
const endpointRel='tgcloud/endpoints/odessaCommentsNotifyToggle.js';
const marker='ODESSA_COMMENT_PRIVATE_NOTIFY_V2';
function stop(s){throw Error(s)}
function command(file,args){const p=cp.spawnSync(file,args,{cwd:root,encoding:'utf8',maxBuffer:2000000,timeout:180000});if(p.stdout)process.stdout.write(p.stdout);if(p.stderr)process.stderr.write(p.stderr);return p;}
function checkJs(source,name){const temp=path.join(root,'.odessa-'+name+'.mjs');try{fs.writeFileSync(temp,source);const p=command(process.execPath,['--check',temp]);if(p.status!==0)stop('Проверка синтаксиса не прошла: '+name);}finally{try{fs.unlinkSync(temp)}catch{}}}
function patchLib(source){
 if(source.includes(marker))return source;
 const start=source.indexOf('async function odessaNotifyComment(');
 const end=source.indexOf('\nexport async function writeComment(',start);
 if(!source.includes('ODESSA_COMMENT_NOTIFICATIONS_V1')||start<0||end<0)stop('Файл комментариев не соответствует последней версии. Ничего не меняю.');
 if(!source.slice(start,end).includes('chat_id:GROUP'))stop('Не найдено прежнее уведомление группы.');
 const helper=`// ${marker}\n// Only Telegram users who enabled direct messages receive these notifications.\nexport async function commentNotifyPreference(input,ctx){\n const {user}=await access(ctx);\n const k=key('notify',GROUP,user.id);\n const saved=await getSetting(k);\n if(input?.op==='status')return {enabled:!!saved?.enabled};\n if(input?.op==='disable'){await setSetting(k,{enabled:false,userId:Number(user.id),at:Date.now()});return {enabled:false};}\n if(input?.op!=='enable')throw new EndpointError('Неверная команда уведомлений.');\n // Telegram itself verifies that this user allowed this bot to write privately.\n try{await api.sendMessage({chat_id:Number(user.id),text:'🔔 Уведомления о комментариях ОДЕССА Online включены!\\n\\nКогда кто-то оставит комментарий под публикацией, вы получите личное уведомление со ссылкой на обсуждение.'});}\n catch(e){console.error('ODESSA_NOTIFY_PERMISSION',String(e?.description||e?.message||e));throw new EndpointError('Telegram пока не разрешает отправлять вам сообщения. Нажмите «Разрешить уведомления» в окне Telegram и попробуйте снова.');}\n await setSetting(k,{enabled:true,userId:Number(user.id),at:Date.now()});return {enabled:true};\n}\nasync function odessaNotifyComment(root,comment){\n const prefix=key('notify',GROUP)+':';\n const original=await getSetting(key('root',GROUP,root));\n const topic=String(original?.text||'').replace(/\\s+/g,' ').trim();\n const shortTopic=Array.from(topic).slice(0,80).join('');\n const bodyChars=Array.from(String(comment.body||''));\n const preview=bodyChars.slice(0,280).join('')+(bodyChars.length>280?'…':'');\n const person=String(comment.author||'Участник').replace(/[\\r\\n]/g,' ').slice(0,90);\n const title=comment.replyTo?'💬 Новый ответ в обсуждении':'💬 Новый комментарий';\n const text=title+(topic?'\\n📌 '+shortTopic+(topic.length>80?'…':''):'')+'\\n👤 '+person+': «'+preview+'»';\n const markup={inline_keyboard:[[{text:'💬 Открыть комментарии',url:link(root)}]]};\n let cursor='',count=0;\n // Bounded batches protect this public bot from Telegram rate limits/timeouts.\n for(let page=0;page<20;page++){\n  const rows=cursor
   ? await db.all(sql\`SELECT key,value FROM odessa_settings WHERE key LIKE \${prefix+'%'} AND key > \${cursor} ORDER BY key LIMIT 25\`)
   : await db.all(sql\`SELECT key,value FROM odessa_settings WHERE key LIKE \${prefix+'%'} ORDER BY key LIMIT 25\`);
  if(!rows.length)break;\n  cursor=rows[rows.length-1].key;\n  for(let j=0;j<rows.length;j+=5){\n   await Promise.all(rows.slice(j,j+5).map(async row=>{\n    let sub;try{sub=JSON.parse(row.value);}catch{return;}\n    const userId=Number(sub?.userId);\n    if(!sub?.enabled||!Number.isSafeInteger(userId)||userId<=0||userId===Number(comment.userId))return;\n    try{await api.sendMessage({chat_id:userId,text,link_preview_options:{is_disabled:true},reply_markup:markup});count++;}\n    catch(e){const reason=String(e?.description||e?.message||e);console.error('ODESSA_COMMENT_DM_FAILED',userId,reason);if(/blocked|forbidden|chat not found|deactivated/i.test(reason))try{await setSetting(row.key,{...sub,enabled:false,disabledAt:Date.now()});}catch{}}\n   }));\n  }\n  if(rows.length<25)break;\n }\n return null; // no group posts or message IDs to delete\n}\n`;
 // Encode JS SQL template expressions without losing literal syntax in the installer.
 const safeHelper=helper;
 return source.slice(0,start)+safeHelper+source.slice(end);
}
function patchHtml(source){
 if(source.includes(marker))return source;
 if(!source.includes('<h1>💬 Комментарии</h1>')||!source.includes("function call(name,input)")||!source.includes("if(tg){tg.ready()"))stop('Окно комментариев отличается от ожидаемой версии. Ничего не меняю.');
 const head='<h1>💬 Комментарии</h1>';
 const panel='<h1>💬 Комментарии</h1><div class="notify-panel"><button type="button" id="notifyToggle" disabled>🔔 Уведомления</button><span id="notifyHint">Загрузка настроек…</span></div>';
 let out=source.replace(head,panel);
 out=out.replace('</style>','\n.notify-panel{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:10px 0 0}.notify-panel button{background:var(--card);border:1px solid #8996a34c;border-radius:10px;padding:8px 11px;font-size:14px;font-weight:650}.notify-panel span{font-size:12px;color:var(--muted);flex:1;min-width:160px}.notify-panel button:disabled{opacity:.65}\n</style>');
 const js=`\n// ${marker}\nlet commentsNotifyEnabled=false;\nasync function refreshNotify(){\n try{const x=await call('odessaCommentsNotifyToggle',{op:'status'});commentsNotifyEnabled=!!x.enabled;\n  $('notifyToggle').textContent=commentsNotifyEnabled?'🔕 Отключить уведомления':'🔔 Получать уведомления';\n  $('notifyHint').textContent=commentsNotifyEnabled?'Новые комментарии будут приходить в личные сообщения Telegram.':'Включите один раз: Telegram спросит ваше разрешение.';\n  $('notifyToggle').disabled=false;\n }catch(e){$('notifyHint').textContent='Не удалось проверить уведомления: '+e.message;$('notifyToggle').disabled=false;}\n}\n$('notifyToggle').onclick=async()=>{\n const btn=$('notifyToggle');btn.disabled=true;\n try{\n  if(!commentsNotifyEnabled){\n   if(tg?.initDataUnsafe?.user?.allows_write_to_pm!==true){\n    if(typeof tg?.requestWriteAccess!=='function')throw Error('В этой версии Telegram запрос недоступен. Обновите Telegram и откройте комментарии снова.');\n    const granted=await new Promise(resolve=>{let done=false;const finish=v=>{if(!done){done=true;resolve(!!v);}};setTimeout(()=>finish(false),15000);try{tg.requestWriteAccess(finish);}catch{finish(false);}});\n    if(!granted){$('notifyHint').textContent='Нужно разрешить личные сообщения от бота в окне Telegram.';return;}\n   }\n   await call('odessaCommentsNotifyToggle',{op:'enable'});\n  }else await call('odessaCommentsNotifyToggle',{op:'disable'});\n  await refreshNotify();\n }catch(e){$('notifyHint').textContent=e.message||'Не получилось изменить уведомления.';}\n finally{btn.disabled=false;}\n};\n`;
 const anchor="if(tg){tg.ready()";
 out=out.replace(anchor,js+anchor);
 const loadAnchor='root=Number(match[1]);load();';
 if(!out.includes(loadAnchor))stop('Невозможно включить настройку для нужного поста.');
 out=out.replace(loadAnchor,'root=Number(match[1]);load();refreshNotify();');
 return out;
}
function getStaticSource(){const config=path.join(root,'tgcloud.jsonc');if(!fs.existsSync(config))stop('Нет tgcloud.jsonc');const data=fs.readFileSync(config,'utf8');const hit=/"static"\s*:\s*\{[\s\S]*?"source"\s*:\s*"([^"\\]+)"/.exec(data);if(!hit)stop('Не найдена папка статического Mini App в настройках.');const dir=path.resolve(root,hit[1]);if(dir===root||!dir.startsWith(root+path.sep)||dir.includes('/tgcloud/'))stop('Некорректная папка приложения.');return {dir,rel:path.relative(root,dir)};}
function main(){
 const libFile=path.join(root,libRel),endpointFile=path.join(root,endpointRel);
 if(!fs.existsSync(libFile))stop('Исходный файл комментариев не найден.');
 const {dir,rel}=getStaticSource(),htmlFile=path.join(dir,'comments.html'),rootHtml=path.join(root,'odessa-comments.html');
 if(!fs.existsSync(htmlFile))stop('Файл Mini App не найден: '+path.relative(root,htmlFile));
 if(fs.existsSync(endpointFile)&&!fs.readFileSync(endpointFile,'utf8').includes(marker))stop('Уже существует другой обработчик уведомлений.');
 const beforeLib=fs.readFileSync(libFile,'utf8'),afterLib=patchLib(beforeLib);
 const beforeHtml=fs.readFileSync(htmlFile,'utf8'),afterHtml=patchHtml(beforeHtml);
 const endpoint=`// ${marker}\nimport {commentNotifyPreference} from '../lib/odessaGroupComments.js';\nexport default commentNotifyPreference;\n`;
 checkJs(afterLib,'comment-lib');checkJs(endpoint,'comment-endpoint');
 const scr=/<script>([\s\S]*?)<\/script>/.exec(afterHtml);if(!scr)stop('JavaScript окна комментариев не найден');checkJs(scr[1],'comment-ui');
 if(!afterLib.includes(marker)||!afterHtml.includes(marker))stop('Неполное изменение.');
 const stamp=new Date().toISOString().replace(/\D/g,'').slice(0,14);
 const backup=path.join(root,'odessa-comments-private-backup-'+stamp);fs.mkdirSync(backup,{recursive:true});
 const entries=[[libFile,afterLib],[endpointFile,endpoint],[htmlFile,afterHtml]];
 if(fs.existsSync(rootHtml))entries.push([rootHtml,patchHtml(fs.readFileSync(rootHtml,'utf8'))]);
 for(const [f] of entries)if(fs.existsSync(f)){const destination=path.join(backup,path.relative(root,f).replaceAll('/','__'));fs.copyFileSync(f,destination);}
 for(const [f,s] of entries){fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,s);}
 console.log('✅ Код подготовлен. Резервные копии:',backup);
 console.log('✅ Групповые объявления о комментариях отключены в новой версии.');
 console.log('✅ Добавлена кнопка разрешения личных уведомлений.');
 console.log('Отправляю только файлы комментариев и их мини-приложение.');
 const p=command('npx',['tgcloud','push',libRel,endpointRel,rel+'/']);
 if(p.status===0){console.log('✅ Отправка завершена. Теперь проверьте кнопку «Комментарии» в Telegram.');return;}
 console.log('⚠️ Команда публикации завершилась ошибкой. На Termux известна ошибка сохранения состояния даже ПОСЛЕ успешной отправки. Не запускайте установку повторно до проверки!');
 console.log('Для проверки кода: npx tgcloud fetch && grep -n '+marker+' .tgcloud/remote/lib/odessaGroupComments.js');
 process.exitCode=1;
}
try{main();}catch(e){console.error('❌ '+e.message);process.exitCode=1;}

'use strict';
// ODESSA Online: safely install the transit bow in outgoing cloud messages.
// The main Termux publisher remains active, no state/cursor is reset.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process'),vm=require('node:vm');
const root=path.join(os.homedir(),'OdessaOnlineGuideBot');
const rel='tgcloud/endpoints/odessaLive.js',file=path.join(root,rel);
const marker='ODESSA_TRANSIT_BOW_V1';
const helper="\n// ODESSA_TRANSIT_BOW_V1 — change only transit descriptions.\nfunction odessaTransitBowV1(prepared, key) {\n const original=prepared?.[key];\n if(typeof original!=='string'||!/транз[иі]т/i.test(original))return prepared;\n const fixes=[];\n for(const m of original.matchAll(/транз[иі]т[\\p{L}]*/giu)){\n  const at=m.index+m[0].length;\n  const next=/^[ \\t]*(🏹|✈️|✈|🛩️|🛩|🛫|🛬)/u.exec(original.slice(at));\n  if(next?.[1]==='🏹')continue;\n  fixes.push({at,len:next?next[0].length:0,text:' 🏹'});\n }\n if(!fixes.length)return prepared;\n const entityKey=key==='caption'?'caption_entities':'entities';\n const out={...prepared};\n let text=original,entities=Array.isArray(out[entityKey])?out[entityKey].map(e=>({...e})):[];\n for(const fix of fixes.reverse()){\n  const a=fix.at,b=a+fix.len,delta=fix.text.length-fix.len;\n  text=text.slice(0,a)+fix.text+text.slice(b);\n  entities=entities.flatMap(e=>{\n   const start=e.offset,end=start+e.length;\n   if(!Number.isInteger(start)||!Number.isInteger(e.length))return[e];\n   if(e.type==='custom_emoji'&&start<b&&end>a)return[];\n   const s=start<a?start:start>=b?start+delta:a;\n   const t=end<=a?end:end>=b?end+delta:a+fix.text.length;\n   return t>s?[{...e,offset:s,length:t-s}]:[];\n  });\n }\n out[key]=text;\n if(entities.length)out[entityKey]=entities;else delete out[entityKey];\n return out;\n}";
function run(command,args){
 const r=cp.spawnSync(command,args,{cwd:root,encoding:'utf8',timeout:180000});
 if(r.stdout)process.stdout.write(r.stdout);
 if(r.stderr)process.stderr.write(r.stderr);
 if(r.error||r.status!==0)throw Error('Команда не прошла: '+command+' '+args.join(' '));
}
function patched(before){
 if(before.includes(marker))return before;
 const start=before.indexOf('async function odessaPrepareArgs(');
 const end=before.indexOf('async function odessaSendEmoji(',start);
 if(start<0||end<start)throw Error('Не найден совместимый обработчик Telegram Cloud');
 const section=before.slice(start,end),at=section.lastIndexOf('return prepared;');
 if(at<0)throw Error('Невозможно найти возврат подготовленного сообщения');
 return before.slice(0,start)+helper+'\n'+section.slice(0,at)+'return odessaTransitBowV1(prepared,key);'+section.slice(at+'return prepared;'.length)+before.slice(end);
}
function test(source){
 const a=source.indexOf('function odessaTransitBowV1('),b=source.indexOf('\nasync function odessaPrepareArgs(',a);
 if(a<0||b<a)throw Error('Встроенная проверка не прошла');
 const fn=vm.runInNewContext(source.slice(a,b)+'\nodessaTransitBowV1');
 for(const [oldText,newText] of [
 ['Транзитні ✈️','Транзитні 🏹'],
 ['Транзит через район','Транзит 🏹 через район'],
 ['Транзитні 🏹','Транзитні 🏹'],
 ['✅ ВІДБІЙ ТРИВОГИ','✅ ВІДБІЙ ТРИВОГИ'],
 ['Ракета ✈️','Ракета ✈️']
 ])if(fn({text:oldText},'text').text!==newText)throw Error('Не прошёл тест: '+oldText);
 const result=fn({text:'Транзитні ✈️',entities:[{type:'custom_emoji',offset:10,length:2,custom_emoji_id:'123'}]},'text');
 if(result.entities?.some(e=>e.type==='custom_emoji'))throw Error('Неправильное сохранение исходного эмодзи');
}
try{
 if(!fs.existsSync(file))throw Error('Не найдена папка бота в Termux: '+rel);
 const before=fs.readFileSync(file,'utf8'),after=patched(before);
 test(after);
 if(after===before){console.log('✅ Значок 🏹 уже настроен.');process.exit(0);}
 const tmp=file+'.transit-check.js',backup=file+'.backup-'+Date.now();
 fs.writeFileSync(tmp,after);
 try{run(process.execPath,['--check',tmp]);}finally{fs.rmSync(tmp,{force:true});}
 fs.copyFileSync(file,backup);fs.writeFileSync(file,after);
 try{run('npx',['tgcloud','push',rel]);}
 catch(e){fs.copyFileSync(backup,file);throw e;}
 console.log('✅ Готово: новые сообщения о транзите получают 🏹.');
 console.log('✅ Тревоги, отбой, комментарии и сохранённые состояния не затронуты.');
 console.log('✅ Копия до изменения: '+backup);
}catch(e){console.error('❌ '+e.message);process.exitCode=1;}

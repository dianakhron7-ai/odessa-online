/* Odessa Online: high resolution seasonal photo, live weather, view counter. */
(() => {
'use strict';
const month=Number(new Intl.DateTimeFormat('en-US',{timeZone:'Europe/Kyiv',month:'numeric'}).format(new Date()));
const season=[12,1,2].includes(month)?'winter':[3,4,5].includes(month)?'spring':[6,7,8].includes(month)?'summer':'autumn';
let counted=false;
function getVisitor(){
 try {
  const key='odessa-online:viewer-id-v2';
  let id=localStorage.getItem(key);
  if(/^[0-9a-f]{32}$/.test(id||''))return id;
  const bytes=new Uint8Array(16);
  crypto.getRandomValues(bytes);
  id=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
  localStorage.setItem(key,id);
  return id;
 } catch{return null;}
}
function showViews(badge){
 if(counted)return;
 const serverless=window.Telegram?.WebApp?.Serverless;
 if(typeof serverless?.call!=='function')return;
 const visitor=getVisitor();
 if(!visitor)return;
 counted=true;
 try {
  serverless.call('odessaGuideViews',{visitor},(error,result)=>{
   const value=Number((result?.result||result)?.count);
   const number=badge.querySelector('.odessa-view-number');
   if(number&&!error&&Number.isSafeInteger(value)&&value>=0)number.textContent=new Intl.NumberFormat('ru-RU').format(value);
  });
 } catch {counted=false;}
}
function update(){
 const home=document.querySelector('.home-content');
 const hero=home?.previousElementSibling;
 if(!hero?.classList?.contains('hero'))return;
 if(!hero.classList.contains('odessa-seasonal')){
  hero.classList.add('odessa-seasonal','season-'+season);
  hero.style.setProperty('--atlas','url("assets/seasons/'+season+'.jpg")');
  const fx=document.createElement('div');fx.className='odessa-season-fx';fx.setAttribute('aria-hidden','true');hero.appendChild(fx);
  const wx=document.createElement('div');wx.className='odessa-weather-fx';wx.setAttribute('aria-hidden','true');hero.appendChild(wx);
  const badge=document.createElement('div');badge.className='odessa-views';
  badge.title='Количество уникальных браузеров и устройств, открывших справочник через Telegram. Не точное число людей.';
  badge.innerHTML='<svg class="odessa-eye" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.7-7 10-7 10 7 10 7-3.7 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg><span>Просмотрено: <b class="odessa-view-number">—</b></span>';
  hero.appendChild(badge);
  showViews(badge);
  for(const [id,type] of [['transport','transport'],['medicine','medicine']]){
   const card=home.querySelector('.tile[data-sid="'+id+'"]');
   if(card){
    card.classList.add('odessa-season-tile');
    card.style.setProperty('--atlas','url("assets/seasons/cards/'+season+'-'+type+'.jpg")');
   }
  }
 }
 const t=document.getElementById('home-weather')?.textContent?.toLowerCase()||'';
 const code=typeof weatherCache!=='undefined'&&weatherCache?Number(weatherCache.code):NaN;
 const rain=/дожд|ливень|осадк|гроза/.test(t)||(code>=51&&code<=67)||(code>=80&&code<=82)||code>=95;
 const snow=/снег|сніг/.test(t)||(code>=71&&code<=77)||(code>=85&&code<=86);
 hero.classList.toggle('odessa-rain',rain);
 hero.classList.toggle('odessa-snow',snow);
}
const app=document.getElementById('app');
if(!app)return;
const observer=new MutationObserver(update);
observer.observe(app,{childList:true,subtree:true,characterData:true});
update();
})();

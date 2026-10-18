/* Odessa Online | seasonal homepage + genuine visitor count (per browser installation). */
(() => {
'use strict';
const month=Number(new Intl.DateTimeFormat('en-US',{timeZone:'Europe/Kyiv',month:'numeric'}).format(new Date()));
const season=[12,1,2].includes(month)?'winter':[3,4,5].includes(month)?'spring':[6,7,8].includes(month)?'summer':'autumn';
const viewsBadgeUrl='https://hits.sh/app8562123476.tgcloud.ai/odessa-online.svg?style=flat&label='+encodeURIComponent('Просмотрено')+'&labelColor=102b3c&color=102b3c';
function update(){
 const home=document.querySelector('.home-content');
 const hero=home?.previousElementSibling;
 if(!hero?.classList?.contains('hero'))return;
 if(!hero.classList.contains('odessa-seasonal')){
  hero.classList.add('odessa-seasonal','season-'+season);
  hero.style.setProperty('--atlas','url("assets/seasons/'+season+'.jpg")');
  const fx=document.createElement('div');fx.className='odessa-season-fx';fx.setAttribute('aria-hidden','true');hero.appendChild(fx);
  const wx=document.createElement('div');wx.className='odessa-weather-fx';wx.setAttribute('aria-hidden','true');hero.appendChild(wx);
  const badge=document.createElement('div');badge.className='odessa-views';badge.title='Счётчик просмотров справочника. Не является точным числом разных людей.';
  badge.innerHTML='<svg class="odessa-eye" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.7-7 10-7 10 7 10 7-3.7 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg><img class="odessa-visit-badge" alt="Просмотрено" loading="eager">';
  hero.appendChild(badge);badge.querySelector('img').src=viewsBadgeUrl;
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
const watcher=new MutationObserver(update);
watcher.observe(app,{childList:true,subtree:true,characterData:true});
update();
})();

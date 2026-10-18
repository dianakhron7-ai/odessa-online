/* ODESSA_SEASONS_20261018_V1; additive enhancement for Odessa Online homepage. */
(() => {
'use strict';
const month=Number(new Intl.DateTimeFormat('en-US',{timeZone:'Europe/Kyiv',month:'numeric'}).format(new Date()));
const season=[12,1,2].includes(month)?'winter':[3,4,5].includes(month)?'spring':[6,7,8].includes(month)?'summer':'autumn';
const viewsUrl='https://hits.dwyl.com/dianakhron7-ai/odessa-online-guide.svg?show=unique&style=flat&color=e9bd77';
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
  badge.title='Количество посещений по данным внешнего счётчика. Число не является точным количеством разных людей.';
  badge.innerHTML='<span class="odessa-eye" aria-hidden="true">◉</span><img alt="Посещения справочника" loading="eager">';
  badge.querySelector('img').src=viewsUrl;
  hero.appendChild(badge);
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
const watch=new MutationObserver(()=>update());
watch.observe(app,{childList:true,subtree:true,characterData:true});
update();
})();
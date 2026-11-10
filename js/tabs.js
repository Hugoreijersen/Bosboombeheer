// De Bosboom — de menubalk onderin: Huis, Praktisch, DeeldeDuit, Statistieken (en Radio, alleen op het huisaccount).
// Een module kan tabHooks[naam] zetten: die draait elke keer dat het tabblad opengaat.
const tabHooks={};
const TABS=["huis","praktisch","duit","stats","radio"];
function showTab(name){
  if(!TABS.includes(name))name="huis";
  document.querySelectorAll(".view").forEach(v=>v.hidden=v.dataset.view!==name);
  document.querySelectorAll(".tabbar [data-tab]").forEach(b=>b.setAttribute("aria-current",b.dataset.tab===name?"page":"false"));
  window.scrollTo(0,0);
  if(location.hash.slice(1)!==name)history.replaceState(null,"","#"+name);
  try{localStorage.setItem("bosboom-tab",name);}catch(e){}
  if(tabHooks[name])tabHooks[name]();
}
document.querySelectorAll(".tabbar [data-tab]").forEach(b=>b.addEventListener("click",()=>showTab(b.dataset.tab)));
window.addEventListener("hashchange",()=>showTab(location.hash.slice(1)));
showTab(location.hash.slice(1)||(()=>{try{return localStorage.getItem("bosboom-tab");}catch(e){return null;}})()||"huis");

// Pop-up (geen browser-dialoog: die blokkeert de kiosk). modal.open(html, bind) / modal.close()
const modal=(()=>{
  const el=document.getElementById("modal"),card=el.querySelector(".modal-card");
  const close=()=>{el.hidden=true;card.innerHTML="";};
  el.addEventListener("click",e=>{if(e.target===el)close();});
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!el.hidden)close();});
  return {open(html,bind){card.innerHTML=html;el.hidden=false;if(bind)bind(card);const f=card.querySelector("input,button");if(f)f.focus();},close};
})();

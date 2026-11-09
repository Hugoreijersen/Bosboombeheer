// De Bosboom — schermstand: "kiosk" (het gedeelde touchscreen) of "telefoon" (je eigen telefoon).
// De keuze geldt per apparaat (localStorage). De Pi opent de app met ?kiosk=1 en staat dan vanzelf op kiosk.
// Kiosk: alles groter om op te tikken, geen uitlogknop, scherm blijft aan, en na een paar minuten
// niets doen gaat hij terug naar Huis (pop-up dicht), zodat het scherm er altijd netjes bij staat.
const scherm=(()=>{
  const KEY="bosboom-scherm", IDLE_MS=3*60*1000;
  const get=k=>{try{return localStorage.getItem(k);}catch(e){return null;}};
  const set=(k,v)=>{try{localStorage.setItem(k,v);}catch(e){}};
  const q=new URLSearchParams(location.search);
  if(q.has("kiosk"))set(KEY,q.get("kiosk")==="0"?"telefoon":"kiosk");
  let mode=get(KEY)==="kiosk"?"kiosk":"telefoon";

  let idleTimer=null, wake=null;
  const backHome=()=>{ if(typeof modal!=="undefined")modal.close(); if(location.hash.slice(1)!=="huis"&&!typing())showTab("huis"); };
  const poke=()=>{ clearTimeout(idleTimer); if(mode==="kiosk")idleTimer=setTimeout(backHome,IDLE_MS); };
  ["pointerdown","keydown","scroll"].forEach(ev=>addEventListener(ev,poke,{passive:true}));
  async function keepAwake(){
    if(mode!=="kiosk"||!("wakeLock" in navigator)||document.hidden)return;
    try{ wake=await navigator.wakeLock.request("screen"); }catch(e){}
  }
  document.addEventListener("visibilitychange",keepAwake);

  function apply(){
    document.documentElement.classList.toggle("kiosk",mode==="kiosk");
    const out=document.getElementById("logoutBtn"); if(out&&typeof myResidentId!=="undefined"&&(myResidentId||isHuis))out.hidden=mode==="kiosk";
    document.querySelectorAll("#schermPick [data-m]").forEach(b=>b.setAttribute("aria-pressed",b.dataset.m===mode));
    poke();
    if(typeof refreshFooters==="function")refreshFooters();   // kookkosten-veld wel/niet
    if(mode==="kiosk")keepAwake(); else if(wake){wake.release().catch(()=>{});wake=null;}
  }
  document.querySelectorAll("#schermPick [data-m]").forEach(b=>b.addEventListener("click",()=>{mode=b.dataset.m;set(KEY,mode);apply();}));
  apply();
  return {get kiosk(){return mode==="kiosk";},apply};
})();

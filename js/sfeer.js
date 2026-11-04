// De Bosboom — thema, seizoenen, weer en vallende deeltjes.
/* theme */
const tb=document.getElementById("themeBtn"),mq=window.matchMedia("(prefers-color-scheme: dark)");
const isDark=()=>(document.documentElement.getAttribute("data-theme")||(mq.matches?"dark":"light"))==="dark";
const setIcon=()=>tb.textContent=isDark()?"☀️":"🌙";
tb.addEventListener("click",()=>{document.documentElement.setAttribute("data-theme",isDark()?"light":"dark");setIcon();});
setIcon();
/* ---- seizoenen + weer ---- */
const seasonPick=document.getElementById("seasonPick");
// Live weer via Open-Meteo (gratis, geen sleutel nodig) — Delft.
let wxData=null; // {t, icon, desc, days:[[label,temp,icon],...]}
function wmo(code){
  const m={0:["☀️","Onbewolkt"],1:["🌤️","Overwegend helder"],2:["⛅","Half bewolkt"],3:["☁️","Bewolkt"],
    45:["🌫️","Mist"],48:["🌫️","Mist"],51:["🌦️","Motregen"],53:["🌦️","Motregen"],55:["🌦️","Motregen"],
    56:["🌧️","IJzel"],57:["🌧️","IJzel"],61:["🌧️","Regen"],63:["🌧️","Regen"],65:["🌧️","Zware regen"],
    66:["🌧️","IJzel"],67:["🌧️","IJzel"],71:["🌨️","Sneeuw"],73:["🌨️","Sneeuw"],75:["🌨️","Zware sneeuw"],
    77:["🌨️","Sneeuwkorrels"],80:["🌦️","Buien"],81:["🌦️","Buien"],82:["🌧️","Zware buien"],
    85:["🌨️","Sneeuwbuien"],86:["🌨️","Sneeuwbuien"],95:["⛈️","Onweer"],96:["⛈️","Onweer"],99:["⛈️","Onweer"]};
  return m[code]||["🌡️","—"];
}
function renderWeather(){const el=document.getElementById("weather");if(!el)return;
  if(!wxData){el.innerHTML=`<div class="wx-now"><span class="wx-icon">🌡️</span><div><div class="wx-desc">Weer laden…</div></div></div>`;return;}
  el.innerHTML=`<div class="wx-now"><span class="wx-icon">${wxData.icon}</span><div><div class="wx-temp">${wxData.t}°</div><div class="wx-desc">${wxData.desc} · Delft</div></div></div>
    <div class="wx-days">${wxData.days.map(([d,t,ic])=>`<div class="wx-day"><span>${d}</span><span class="i">${ic}</span><b>${t}°</b></div>`).join("")}</div>`;}
async function loadWeather(){
  try{
    const url="https://api.open-meteo.com/v1/forecast?latitude=52.0116&longitude=4.3571&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max&timezone=Europe%2FAmsterdam&forecast_days=4";
    const r=await fetch(url); const j=await r.json();
    const cur=wmo(j.current.weather_code);
    const days=[];
    for(let i=1;i<=3 && i<j.daily.time.length;i++){
      const dt=new Date(j.daily.time[i]+"T12:00:00");
      days.push([days0[dt.getDay()], Math.round(j.daily.temperature_2m_max[i]), wmo(j.daily.weather_code[i])[0]]);
    }
    wxData={t:Math.round(j.current.temperature_2m), icon:cur[0], desc:cur[1], days};
  }catch(e){ wxData={t:"–", icon:"🌡️", desc:"Weer niet beschikbaar", days:[]}; }
  renderWeather();
}
const days0=["zo","ma","di","wo","do","vr","za"];

/* vallende deeltjes */
const fx=document.getElementById("fx"),fxc=fx.getContext("2d");
const dpr=Math.min(2,window.devicePixelRatio||1),reduceMo=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let parts=[],fxRun=false;
// Geen vallende deeltjes op de kiosk: een Pi 3 moet dan 60x per seconde het hele scherm opnieuw tekenen.
const still=()=>reduceMo||(typeof scherm!=="undefined"&&scherm.kiosk);
function fxResize(){fx.width=innerWidth*dpr;fx.height=innerHeight*dpr;fxc.setTransform(dpr,0,0,dpr,0,0);}
const PARTS={
  herfst:{n:22,shape:"leaf",sway:1.1,vy:[.5,1.3],r:[4,8],col:["#c67a2e","#b45436","#9c5a2d","#c2a23f"]},
  winter:{n:46,shape:"snow",sway:.7,vy:[.5,1.2],r:[1.5,3.5],col:["#ffffff","#eaf2f6"]},
  lente:{n:18,shape:"petal",sway:1.2,vy:[.4,1],r:[3,6],col:["#f4c6d6","#f8d7e2","#ffffff"]},
};
const rnd=(a,b)=>a+Math.random()*(b-a);
const spawn=(c,init)=>({x:Math.random()*innerWidth,y:init?Math.random()*innerHeight:-15,r:rnd(c.r[0],c.r[1]),vy:rnd(c.vy[0],c.vy[1]),rot:Math.random()*6.28,vr:(Math.random()-.5)*.05,ph:Math.random()*6.28,col:c.col[(Math.random()*c.col.length)|0]});
function mkParts(){const c=PARTS[season];parts=c?Array.from({length:c.n},()=>spawn(c,true)):[];}
function drawPart(p,c){fxc.save();fxc.translate(p.x,p.y);fxc.rotate(p.rot);fxc.globalAlpha=.85;fxc.fillStyle=p.col;
  if(c.shape==="snow"){fxc.beginPath();fxc.arc(0,0,p.r,0,6.3);fxc.fill();}
  else if(c.shape==="petal"){fxc.beginPath();fxc.ellipse(0,0,p.r,p.r*.55,0,0,6.3);fxc.fill();}
  else{fxc.beginPath();fxc.ellipse(0,0,p.r,p.r*.6,0,0,6.3);fxc.fill();fxc.globalAlpha=.5;fxc.strokeStyle=p.col;fxc.lineWidth=.8;fxc.beginPath();fxc.moveTo(-p.r,0);fxc.lineTo(p.r,0);fxc.stroke();}
  fxc.restore();}
function fxTick(){const c=PARTS[season];fxc.clearRect(0,0,innerWidth,innerHeight);
  if(c)parts.forEach(p=>{p.ph+=.02;p.x+=Math.sin(p.ph)*c.sway;p.y+=p.vy;p.rot+=p.vr;if(p.y>innerHeight+20)Object.assign(p,spawn(c,false));drawPart(p,c);});
  if(still()){fxRun=false;fxc.clearRect(0,0,innerWidth,innerHeight);return;}
  if(fxRun)requestAnimationFrame(fxTick);}
function startFx(){fxResize();mkParts();if(still()){fxc.clearRect(0,0,innerWidth,innerHeight);return;}if(!fxRun){fxRun=true;requestAnimationFrame(fxTick);}}
window.addEventListener("resize",fxResize);

function applySeason(){document.documentElement.dataset.season=season;
  seasonPick.querySelectorAll("button").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.s===season)));
  renderTrees();renderWeather();mkParts();if(still())fxc.clearRect(0,0,innerWidth,innerHeight);}
seasonPick.querySelectorAll("button").forEach(b=>b.addEventListener("click",()=>{season=b.dataset.s;applySeason();}));
renderWeather();startFx();applySeason();
loadWeather(); setInterval(loadWeather, 30*60*1000);   // live weer + elke 30 min verversen

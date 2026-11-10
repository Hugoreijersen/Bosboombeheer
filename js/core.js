// De Bosboom — gedeelde basis: bewoners, datums, state en kleine hulpjes. Wordt als eerste geladen.
const people=[{name:"Iep",tree:"iep",color:"var(--iep)"},{name:"Berk",tree:"berk",color:"var(--berk)"},{name:"Eik",tree:"eik",color:"var(--eik)"}];
const order=["Iep","Berk","Eik"];
const nextTurn=n=>order[(order.indexOf(n)+1)%order.length];
const colorOf=n=>people.find(p=>p.name===n)?.color||"var(--muted)";
const MON=["jan","feb","mrt","apr","mei","jun","jul","aug","sep","okt","nov","dec"];
const days=["zo","ma","di","wo","do","vr","za"];
const dayFull=["Zondag","Maandag","Dinsdag","Woensdag","Donderdag","Vrijdag","Zaterdag"];
// Echte datum van vandaag (lokale tijd, op middernacht gezet).
const TODAY=(()=>{const d=new Date();d.setHours(0,0,0,0);return d;})();
const todayIdx=TODAY.getDay();                       // 0=zo ... 6=za
const SUN0=(()=>{const d=new Date(TODAY);d.setDate(d.getDate()-todayIdx);return d;})(); // zondag van deze week
const weekDateOff=(i,off)=>{const d=new Date(SUN0);d.setDate(SUN0.getDate()+off*7+i);return d;};
const fmt=d=>d.getDate()+" "+MON[d.getMonth()];
const pad=n=>String(n).padStart(2,"0");
const toInput=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const fromInput=s=>{const[a,b,c]=s.split("-").map(Number);return new Date(a,b-1,c);};
const INTERVAL={"wekelijks":{d:7},"2-wekelijks":{d:14},"maandelijks":{m:1}};
const addInterval=(dt,r)=>{const d=new Date(dt);const iv=INTERVAL[r];if(iv.d)d.setDate(d.getDate()+iv.d);if(iv.m)d.setMonth(d.getMonth()+iv.m);return d;};
const esc=s=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/"/g,"&quot;");
function isoWeek(date){const d=new Date(Date.UTC(date.getFullYear(),date.getMonth(),date.getDate()));const day=(d.getUTCDay()+6)%7;d.setUTCDate(d.getUTCDate()-day+3);const f=new Date(Date.UTC(d.getUTCFullYear(),0,4));const fd=(f.getUTCDay()+6)%7;f.setUTCDate(f.getUTCDate()-fd+3);return 1+Math.round((d-f)/6048e5);}

function blankWeek(){const mk=()=>({Iep:Array(7).fill(""),Berk:Array(7).fill(""),Eik:Array(7).fill("")});
  const z=()=>({Iep:Array(7).fill(0),Berk:Array(7).fill(0),Eik:Array(7).fill(0)});
  return {status:mk(),guests:z(),dayNotes:Array.from({length:7},()=>[])};}
// Lege stand; wordt gevuld vanuit de database na inloggen (zie app.js).
const state={
  home:{Iep:true,Berk:true,Eik:true,Mandarijn:false},
  away:{Iep:"",Berk:"",Eik:"",Mandarijn:""},
  weeks:{},
  chores:[],
  shopping:[],
  recipes:[],
  quotes:[],
  plans:{},
  choreLog:[],   // wie deed wat (nieuwste eerst), voor de geschiedenis bij schoonmaak
};
let myResidentId=null;  // welke boom ben ik (na inloggen)
let isHuis=false;       // ingelogd met het huisaccount (gedeeld scherm, van niemand)
const HUIS="Huis";
const myName=()=>isHuis?HUIS:myResidentId?personOf(myResidentId).name:"";
const W=off=>{const k=String(off);if(!state.weeks[k])state.weeks[k]=blankWeek();return state.weeks[k];};
let weekOffset=0, selectedDay=todayIdx;
let season=(()=>{const m=new Date().getMonth();return m>=2&&m<=4?"lente":m>=5&&m<=7?"zomer":m>=8&&m<=10?"herfst":"winter";})();

const eats=(wk,n,d)=>wk.status[n][d]==="eet"||wk.status[n][d]==="kookt";
const covers=(wk,n,d)=>eats(wk,n,d)?1+(wk.guests[n][d]||0):0;
const totalDay=(wk,d)=>people.reduce((s,p)=>s+covers(wk,p.name,d),0);
const guestsDay=(wk,d)=>people.reduce((s,p)=>s+(eats(wk,p.name,d)?(wk.guests[p.name][d]||0):0),0);
const cooksDay=(wk,d)=>people.filter(p=>wk.status[p.name][d]==="kookt").map(p=>p.name);

const DAY=86400000;
const nameToId=n=>n.toLowerCase();
const idToName=id=>({iep:"Iep",berk:"Berk",eik:"Eik"}[id]||id);
const residentIds=people.map(p=>nameToId(p.name));
const personOf=id=>people.find(p=>nameToId(p.name)===id)||{name:id,color:"var(--muted)",tree:"eik"};
const dotHTML=id=>`<span class="dot" style="background:${personOf(id).color}"></span>`;
const whoOptions=sel=>people.map(p=>{const id=nameToId(p.name);return `<option value="${id}" ${id===sel?"selected":""}>${p.name}</option>`;}).join("");

// Tijd: "19:00" op een datum (lokale tijd). Eindtijd vóór begintijd = de volgende dag (kring tot 01:00).
const atTime=(dateStr,hhmm)=>{const d=fromInput(dateStr);const[h,m]=hhmm.split(":").map(Number);d.setHours(h,m,0,0);return d;};
function timeRange(dateStr,from,to){const a=atTime(dateStr,from),b=atTime(dateStr,to);if(b<=a)b.setDate(b.getDate()+1);return [a,b];}
const hm=d=>pad(d.getHours())+":"+pad(d.getMinutes());
function dayLabel(d){const x=new Date(d);x.setHours(0,0,0,0);const diff=Math.round((x-TODAY)/DAY);
  return diff===0?"vandaag":diff===1?"morgen":diff===-1?"gisteren":`${days[x.getDay()]} ${fmt(x)}`;}
const typing=()=>document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);

// Meldingen
const ERR={
  huis_geclaimd:"Het huis is dan al geclaimd voor een kring.",
  dib_bezet:"Dat is dan al gedibst.",overlap:"Dat botst met iets dat er al staat.",
  kring_niet_aansluiten:"Bij een kring kun je niet aansluiten.",
  tijd_ongeldig:"Die tijden kloppen niet.",te_lang:"Dat is te lang.",
  al_afgerekend:"Die is al afgerekend.",niets_af_te_rekenen:"Er staat niets open.",
  al_betaald:"Er is al iets betaald, dus terugdraaien kan niet meer.",
  item_niet_actief:"Dat drankje staat niet meer op de lijst.",geen_deelnemers:"Kies wie er meedoen.",
  geen_toegang:"Dat mag niet.",
  niet_jouw_opmerking:"Je kunt alleen je eigen opmerkingen bewerken.",geen_boom:"Kies eerst je boom.",
};
const errText=e=>ERR[e&&e.code]||("Er ging iets mis: "+((e&&e.message)||e));
let toastTimer=null;
function toast(msg,kind){let el=document.getElementById("toast");if(!el){el=document.createElement("div");el.id="toast";el.setAttribute("role","status");document.body.appendChild(el);}
  el.textContent=msg;el.className="toast "+(kind||"");el.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.hidden=true,4000);}
const showError=e=>{console.warn(e);toast(errText(e),"err");};

// Modules (Agenda, Dibs, ...) melden zich hier aan. app.js laadt, tekent en volgt ze live.
//   {name, tables:[...], load: async()=>{}, render: ()=>{}}
const modules=[];
const registerModule=m=>modules.push(m);

// Wissen zonder pop-up (die blokkeert de kiosk): eerste tik vraagt "Zeker?", tweede tik wist.
function confirmTap(btn,action){
  if(btn.dataset.armed){action();return;}
  btn.dataset.armed="1";const old=btn.innerHTML;btn.innerHTML="Zeker?";btn.classList.add("armed");
  setTimeout(()=>{if(btn.isConnected){delete btn.dataset.armed;btn.innerHTML=old;btn.classList.remove("armed");}},3000);
}

// Bewerken op de plek: de rij wordt invoervelden met Opslaan/Annuleren.
// fields: [{value,ph,max}], het eerste veld is verplicht. onSave(waarden) slaat op; rerender tekent de lijst opnieuw.
function editInPlace(row,fields,onSave,rerender){
  row.classList.add("editing");
  row.innerHTML=`<div class="edit-row">${fields.map(f=>`<input class="txt" type="text" maxlength="${f.max||500}" placeholder="${esc(f.ph||"")}" value="${esc(f.value||"")}">`).join("")}<button class="formbtn" data-save>Opslaan</button><button class="ghostbtn" data-cancel>Annuleren</button></div>`;
  const ins=[...row.querySelectorAll("input")];
  const save=()=>{const vals=ins.map(i=>i.value.trim());if(!vals[0])return;onSave(vals);rerender();};
  row.querySelector("[data-save]").addEventListener("click",save);
  row.querySelector("[data-cancel]").addEventListener("click",rerender);
  ins.forEach(i=>i.addEventListener("keydown",e=>{if(e.key==="Enter")save();if(e.key==="Escape")rerender();}));
  ins[0].focus();const n=ins[0].value.length;ins[0].setSelectionRange(n,n);
}

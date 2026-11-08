// De Bosboom — eten: dag-editor en weekoverzicht.
/* editor */
function ctx(where){return where==="day"?{off:0,d:todayIdx}:{off:weekOffset,d:selectedDay};}
function editorHTML(where){const{off,d}=ctx(where);const wk=W(off);
  const dateLbl = where==="day" ? `Vandaag · ${dayFull[weekDateOff(d,off).getDay()].toLowerCase()} ${fmt(weekDateOff(d,off))}` : `${dayFull[weekDateOff(d,off).getDay()]} ${fmt(weekDateOff(d,off))}`;
  let h=`<div class="ed-date">${dateLbl}</div>`;
  people.forEach(p=>{const st=wk.status[p.name][d],g=wk.guests[p.name][d]||0,canG=st==="eet"||st==="kookt";
    h+=`<div class="er"><span class="dot" style="background:${p.color}"></span><span class="er-name">${p.name}</span>
      <span class="stbtns"><button data-st="eet" aria-pressed="${st==="eet"}">Eet mee</button><button data-st="kookt" aria-pressed="${st==="kookt"}">Kookt</button><button data-st="niet" aria-pressed="${st==="niet"}">Anders</button></span>
      <span class="gwrap">gasten <input class="gnum" type="number" min="0" inputmode="numeric" value="${g}" ${canG?"":"disabled"} data-p="${p.name}"></span></div>`;});
  h+=`<div class="note-add"><input class="txt" id="nq-${where}" type="text" placeholder="Opmerking…" style="flex:2"><button class="formbtn" id="nqadd-${where}">Toevoegen</button></div>`;
  h+=`<div class="ed-foot" id="ft-${where}"></div>`;
  return h;}
function footHTML(where){const{off,d}=ctx(where);const wk=W(off);const t=totalDay(wk,d),g=guestsDay(wk,d),ks=cooksDay(wk,d);
  const notes=(wk.dayNotes[d]||[]).map((nt,ix)=>`<span class="note"><span class="nt"><b style="color:${colorOf(nt.by)}">${esc(nt.by)}:</b> ${esc(nt.text)}</span>${nt.by===myName()?`<button class="note-x" data-editnote="${ix}" aria-label="Bewerk">✎</button>`:""}<button class="note-x" data-delnote="${ix}" aria-label="Verwijder">✕</button></span>`).join("");
  return `<div class="foot-sum"><b>${t}</b> aan tafel${g?` (incl. ${g} ${g===1?"gast":"gasten"})`:""} · ${ks.length?`<span class="cooks">${ks.join(" & ")}</span> ${ks.length>1?"koken":"kookt"}`:"nog geen kok"}${where==="day"?` · deadline 17:00`:""}</div>${cookCost.footHTML(off,d,ks)}${notes}`;}
function hostOf(where){return where==="day"?document.getElementById("paneDay"):document.getElementById("edWeekHost");}
function renderEditor(where){const c=hostOf(where);if(!c)return;c.innerHTML=editorHTML(where);document.getElementById("ft-"+where).innerHTML=footHTML(where);bindEditor(where,c);bindFoot(where);}
function bindFoot(where){const el=document.getElementById("ft-"+where);if(!el)return;cookCost.bind(el,where);el.querySelectorAll("[data-delnote]").forEach(b=>b.addEventListener("click",()=>{const{off,d}=ctx(where);const arr=W(off).dayNotes[d];const nt=arr[+b.dataset.delnote];if(nt)persistNoteDel(nt.id);arr.splice(+b.dataset.delnote,1);refreshFooters();}));
  el.querySelectorAll("[data-editnote]").forEach(b=>b.addEventListener("click",()=>{const{off,d}=ctx(where);const nt=W(off).dayNotes[d][+b.dataset.editnote];if(!nt)return;
    editInPlace(b.closest(".note"),[{value:nt.text,ph:"Opmerking…",max:500}],([t])=>{nt.text=t;persistNoteEdit(nt.id,t);},refreshFooters);}));}
function refreshFooters(){["day","week"].forEach(w=>{const el=document.getElementById("ft-"+w);if(el){el.innerHTML=footHTML(w);bindFoot(w);}});}
function bindEditor(where,container){const g=()=>ctx(where);
  container.querySelectorAll(".stbtns").forEach((grp,idx)=>{const name=people[idx].name;
    grp.querySelectorAll("button").forEach(btn=>btn.addEventListener("click",()=>{const{off,d}=g();const wk=W(off);
      wk.status[name][d]=wk.status[name][d]===btn.dataset.st?"":btn.dataset.st;changed(where,"status");persistMeal(name,off,d);}));});
  container.querySelectorAll(".gnum").forEach(inp=>inp.addEventListener("input",()=>{const{off,d}=g();let v=parseInt(inp.value,10);if(isNaN(v)||v<0)v=0;W(off).guests[inp.dataset.p][d]=v;changed(where,"guest");persistMeal(inp.dataset.p,off,d);}));
  const addBtn=document.getElementById("nqadd-"+where),txt=document.getElementById("nq-"+where);
  const doAdd=async()=>{const v=txt.value.trim();if(!v)return;const{off,d}=g();const author=myName();if(!author)return;const note={text:v,by:author};W(off).dayNotes[d].push(note);txt.value="";refreshFooters();note.id=await persistNoteAdd(off,d,author,v);};
  if(addBtn){addBtn.addEventListener("click",doAdd);txt.addEventListener("keydown",e=>{if(e.key==="Enter")doAdd();});}}
function sameView(a,b){return a.off===b.off&&a.d===b.d;}
function changed(where,kind){const cur=ctx(where);
  if(cur.off===weekOffset){people.forEach(p=>updateCell(p.name,cur.d));}
  if(kind==="status")renderEditor(where);
  const other=where==="day"?"week":"day";const oc=ctx(other),oh=hostOf(other);
  const otherVisible=other==="day"?!document.getElementById("paneDay").hidden:!paneWeek.hidden;
  if(oh&&otherVisible&&sameView(cur,oc))renderEditor(other);
  refreshFooters();}

/* week pane */
const paneWeek=document.getElementById("paneWeek");
function cellHTML(name,i){const wk=W(weekOffset),st=wk.status[name][i],g=wk.guests[name][i]||0;
  const label=st==="kookt"?"🍳":st==="eet"?String(1+g):st==="niet"?"–":"·";
  return `<button class="wk-cell" data-p="${name}" data-i="${i}" data-st="${st}" title="${name} ${days[i]}">${label}</button>`;}
function updateCell(name,i){const el=paneWeek.querySelector(`.wk-cell[data-p="${name}"][data-i="${i}"]`);if(!el)return;
  const wk=W(weekOffset),st=wk.status[name][i],g=wk.guests[name][i]||0;el.dataset.st=st;el.textContent=st==="kookt"?"🍳":st==="eet"?String(1+g):st==="niet"?"–":"·";}
function buildWeek(){const wn=isoWeek(weekDateOff(1,weekOffset));const range=`${fmt(weekDateOff(0,weekOffset))} – ${fmt(weekDateOff(6,weekOffset))}`;
  let g=`<div class="wknav"><button class="navbtn" id="wkPrev" aria-label="Vorige week">‹</button><div class="lbl">Week ${wn}<small>${range}</small></div><button class="navbtn" id="wkNext" aria-label="Volgende week">›</button></div>`;
  g+=`<div class="weekscroll"><div class="weekgrid"><div></div>`;
  days.forEach((d,i)=>{const isToday=weekOffset===0&&i===todayIdx;g+=`<button class="wk-h ${isToday?"today":""}" data-day="${i}" aria-selected="${i===selectedDay}">${d}<span class="dnum">${weekDateOff(i,weekOffset).getDate()}</span></button>`;});
  people.forEach(p=>{g+=`<div class="wk-rowlabel"><span class="dot" style="background:${p.color}"></span>${p.name}</div>`;days.forEach((_,i)=>g+=cellHTML(p.name,i));});
  g+=`</div></div><div class="wk-detail" id="edWeekHost"></div>`;
  paneWeek.innerHTML=g;
  document.getElementById("wkPrev").addEventListener("click",()=>{weekOffset--;buildWeek();});
  document.getElementById("wkNext").addEventListener("click",()=>{weekOffset++;buildWeek();});
  const markSel=()=>{paneWeek.querySelectorAll(".wk-h").forEach(x=>x.setAttribute("aria-selected",String(+x.dataset.day===selectedDay)));
    paneWeek.querySelectorAll(".wk-cell").forEach(x=>x.classList.toggle("selcol",+x.dataset.i===selectedDay));};
  const selectDay=i=>{selectedDay=i;markSel();renderEditor("week");};
  paneWeek.querySelectorAll(".wk-h[data-day]").forEach(h=>h.addEventListener("click",()=>selectDay(+h.dataset.day)));
  paneWeek.querySelectorAll(".wk-cell").forEach(c=>c.addEventListener("click",()=>selectDay(+c.dataset.i)));
  markSel();renderEditor("week");}

const segDay=document.getElementById("segDay"),segWeek=document.getElementById("segWeek"),etenTitle=document.getElementById("etenTitle");
function showPane(which){const day=which==="day";segDay.setAttribute("aria-selected",String(day));segWeek.setAttribute("aria-selected",String(!day));
  document.getElementById("paneDay").hidden=!day;paneWeek.hidden=day;etenTitle.textContent=day?"Vandaag":"Weekoverzicht";
  if(day)renderEditor("day");else buildWeek();}
segDay.addEventListener("click",()=>showPane("day"));
segWeek.addEventListener("click",()=>showPane("week"));
renderEditor("day");

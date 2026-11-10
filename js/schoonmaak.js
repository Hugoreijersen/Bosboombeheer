// De Bosboom — schoonmaakrooster, met geschiedenis (wie deed wat).
/* chores */
const choresEl=document.getElementById("chores");
let choreHistOpen=false;
const lastOf=c=>state.choreLog.find(l=>l.chore===c.id);
const byHTML=n=>`<span class="dot" style="background:${colorOf(n)}"></span>${esc(n)}`;
function choreHistHTML(){
  const rows=state.choreLog.slice(0,30).map(l=>`<div class="chist-row"><span class="chist-d">${days[l.at.getDay()]} ${fmt(l.at)}</span><span class="chist-t">${esc(l.task)}</span><span class="chist-by">${byHTML(l.by)}</span></div>`).join("");
  return `<div class="chist">${rows||`<div class="chist-row"><span class="chist-t" style="color:var(--muted)">Nog niets gedaan.</span></div>`}</div>`;}
function renderChores(){
  const list=state.chores.map((c,i)=>{const next=addInterval(c.last,c.ritme),due=next<=TODAY,l=lastOf(c);
  return `<div class="chore"><div class="chore-l"><div class="chore-task"><span class="dot" style="background:${colorOf(c.who)}"></span>${esc(c.task)}</div>
    <div class="chore-sub">${c.ritme} · laatst ${fmt(c.last)}${l?` door ${esc(l.by)}`:""} · volgende <b class="${due?"due":""}">${due?"nu":fmt(next)}</b></div></div>
    <div class="chore-ctl"><select class="sel" data-i="${i}" data-f="who">${order.map(v=>`<option ${v===c.who?"selected":""}>${v}</option>`).join("")}</select>
    <input class="date" type="date" data-i="${i}" data-f="last" value="${toInput(c.last)}">
    <button class="done-btn" data-done="${i}">Klaar</button></div></div>`;}).join("");
  choresEl.innerHTML=list+`<button class="addbtn" id="choreHistBtn" aria-expanded="${choreHistOpen}">${choreHistOpen?"Verberg geschiedenis":"Geschiedenis"}</button>${choreHistOpen?choreHistHTML():""}`;
  choresEl.querySelector("#choreHistBtn").addEventListener("click",()=>{choreHistOpen=!choreHistOpen;renderChores();});
  choresEl.querySelectorAll("[data-f]").forEach(el=>el.addEventListener("change",e=>{const i=+e.target.dataset.i,f=e.target.dataset.f;const c=state.chores[i];
    if(f==="last"){c.last=fromInput(e.target.value);persistChore(c.id,{last_done:toInput(c.last)});}else{c[f]=e.target.value;persistChore(c.id,{who:c.who});}renderChores();}));
  // "Klaar" staat op jouw naam (de server dwingt dat af); daarna is de volgende na jou aan de beurt.
  // Op het huisaccount (gedeeld scherm) telt het voor wie er aan de beurt was.
  choresEl.querySelectorAll("[data-done]").forEach(b=>b.addEventListener("click",()=>{const c=state.chores[+b.dataset.done];
    const doer=isHuis?c.who:myName();if(!doer)return;
    logChore(c,doer);state.choreLog.unshift({chore:c.id,task:c.task,by:doer,at:new Date(TODAY)});
    c.last=new Date(TODAY);c.who=nextTurn(doer);persistChore(c.id,{last_done:toInput(c.last),who:c.who});renderChores();}));}
renderChores();

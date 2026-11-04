// De Bosboom — schoonmaakrooster.
/* chores */
const choresEl=document.getElementById("chores");
function renderChores(){choresEl.innerHTML=state.chores.map((c,i)=>{const next=addInterval(c.last,c.ritme),due=next<=TODAY;
  return `<div class="chore"><div class="chore-l"><div class="chore-task"><span class="dot" style="background:${colorOf(c.who)}"></span>${esc(c.task)}</div>
    <div class="chore-sub">${c.ritme} · laatst ${fmt(c.last)} · volgende <b class="${due?"due":""}">${due?"nu":fmt(next)}</b></div></div>
    <div class="chore-ctl"><select class="sel" data-i="${i}" data-f="who">${order.map(v=>`<option ${v===c.who?"selected":""}>${v}</option>`).join("")}</select>
    <input class="date" type="date" data-i="${i}" data-f="last" value="${toInput(c.last)}">
    <button class="done-btn" data-done="${i}">Klaar</button></div></div>`;}).join("");
  choresEl.querySelectorAll("[data-f]").forEach(el=>el.addEventListener("change",e=>{const i=+e.target.dataset.i,f=e.target.dataset.f;const c=state.chores[i];
    if(f==="last"){c.last=fromInput(e.target.value);persistChore(c.id,{last_done:toInput(c.last)});}else{c[f]=e.target.value;persistChore(c.id,{who:c.who});}renderChores();}));
  choresEl.querySelectorAll("[data-done]").forEach(b=>b.addEventListener("click",()=>{const i=+b.dataset.done;const c=state.chores[i];logChore(c,c.who);c.last=new Date(TODAY);c.who=nextTurn(c.who);persistChore(c.id,{last_done:toInput(c.last),who:c.who});renderChores();}));}
renderChores();

// De Bosboom — opslaan, inladen en live bijwerken. Praat alleen via db.* (js/db.js).

// --- wie is thuis ---
async function persistHome(name){
  await db.update("residents",{id:nameToId(name)},{is_home:state.home[name],away_label:state.home[name]?"":(state.away[name]||"")}).catch(showError);
}
async function persistPartner(name){ await db.update("residents",{id:nameToId(name)},{partner_home:!!state.partner[name]}).catch(showError); }
async function persistAway(name,label){ await db.update("residents",{id:nameToId(name)},{away_label:label}).catch(showError); }

// --- eten, schoonmaak, lijsten ---
const mealKey=(off,d)=>toInput(weekDateOff(d,off));
async function persistMeal(name,off,d){
  const wk=W(off);
  await db.upsert("meals",{day:mealKey(off,d),resident_id:nameToId(name),status:wk.status[name][d]||"",guests:wk.guests[name][d]||0},["day","resident_id"]).catch(showError);
}
const idOrNull=p=>p.then(r=>r?r.id:null).catch(e=>{showError(e);return null;});
const persistNoteAdd=(off,d,author,text)=>idOrNull(db.insert("day_notes",{day:mealKey(off,d),author,text}));
async function persistNoteDel(id){ if(id) await db.remove("day_notes",{id}).catch(showError); }
async function persistChore(id,fields){ await db.update("chores",{id},fields).catch(showError); }
// Elke "Klaar" komt in het logboek, zodat de statistieken weten wie er schoonmaakte.
async function logChore(c,doneBy){ await db.insert("chore_log",{chore_id:c.id,task:c.task,done_by:nameToId(doneBy),done_at:toInput(TODAY)}).catch(showError); }
const persistShopAdd=text=>idOrNull(db.insert("shopping",{text}));
async function persistShopToggle(id,done){ if(id) await db.update("shopping",{id},{done}).catch(showError); }
async function persistShopDel(id){ if(id) await db.remove("shopping",{id}).catch(showError); }
const persistRecipeAdd=r0=>idOrNull(db.insert("recipes",{title:r0.title,time_min:r0.time?parseInt(r0.time,10):null,ingredients:r0.ing,steps:r0.steps}));
async function persistRecipeDel(id){ if(id) await db.remove("recipes",{id}).catch(showError); }
const persistQuoteAdd=(text,author)=>idOrNull(db.insert("quotes",{text,author}));
async function persistQuoteDel(id){ if(id) await db.remove("quotes",{id}).catch(showError); }

// --- alles inladen ---
function applyResidents(rows){ rows.forEach(r=>{const nm=idToName(r.id);state.home[nm]=r.is_home;state.away[nm]=r.away_label||"";state.partner[nm]=!!r.partner_home;}); }
async function loadAll(){
  const [res,meals,notes,ch,sh,rec,q]=await Promise.all([
    db.list("residents",{order:"sort"}),
    db.list("meals"),
    db.list("day_notes",{order:"created_at"}),
    db.list("chores",{order:"sort"}),
    db.list("shopping",{order:"created_at"}),
    db.list("recipes",{order:"created_at"}),
    db.list("quotes",{order:"created_at",desc:true}),
    ...modules.map(m=>m.load().catch(e=>console.warn(m.name,e))),
  ]);
  applyResidents(res);
  state.weeks={};
  const place=(dstr)=>{const d=fromInput(dstr);const td=Math.round((d-SUN0)/DAY);const off=Math.floor(td/7);return {wk:W(off),di:td-off*7};};
  meals.forEach(m=>{const{wk,di}=place(m.day);if(di<0||di>6)return;wk.status[idToName(m.resident_id)][di]=m.status||"";wk.guests[idToName(m.resident_id)][di]=m.guests||0;});
  notes.forEach(n=>{const{wk,di}=place(n.day);if(di<0||di>6)return;wk.dayNotes[di].push({text:n.text,by:n.author,id:n.id});});
  state.chores=ch.map(c=>({id:c.id,task:c.task,ritme:c.ritme,who:c.who,last:fromInput(c.last_done)}));
  state.shopping=sh.map(s=>({id:s.id,text:s.text,done:s.done}));
  state.recipes=rec.map(r=>({id:r.id,title:r.title,time:r.time_min==null?"":String(r.time_min),ing:r.ingredients||[],steps:r.steps||""}));
  state.quotes=q.map(x=>({id:x.id,text:x.text,by:x.author,date:fmt(new Date(x.created_at))}));
}

function renderAll(){
  renderTrees(); if(!paneWeek.hidden) buildWeek(); else renderEditor("day");
  renderChores(); renderShop(); renderRecipes(); renderQuotes(); renderQOTD();
  modules.forEach(m=>{try{m.render();}catch(e){console.error(m.name,e);}});
}

// --- live: wijzigingen van anderen binnenhalen ---
// Tijdens typen wachten we even, zodat je invoer niet weggegooid wordt.
let syncTimer=null;
function syncFromDb(){ clearTimeout(syncTimer); syncTimer=setTimeout(async()=>{ if(typing()) return syncFromDb(); await loadAll(); renderAll(); },300); }
async function reloadResidents(){
  if(typing() && document.activeElement.classList.contains("away")) return;
  applyResidents(await db.list("residents",{order:"sort"})); renderTrees();
}
function subscribeLive(){
  db.subscribe("residents",reloadResidents);
  const tables=new Set(["meals","day_notes","chores","shopping","recipes","quotes"]);
  modules.forEach(m=>(m.tables||[]).forEach(t=>tables.add(t)));
  tables.forEach(t=>db.subscribe(t,syncFromDb));
}

// Elke minuut opnieuw tekenen: "in gebruik tot 21:30" en "vanavond" blijven zo kloppen.
setInterval(()=>{ if(!typing()) modules.forEach(m=>{try{m.render();}catch(e){}}); },60000);

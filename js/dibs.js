// De Bosboom — Dibs. Gedeelde spullen (wasmachine, droger, ...) claimen: nu meteen of later.
// Eén ding kan nooit twee keer tegelijk geclaimd zijn (rules.checkDib, en de server controleert het ook).
(()=>{
  const el=document.getElementById("dibs");
  const S={items:[],claims:[],open:null,who:null,manage:false};
  const DUR=[["30 min",30],["1 uur",60],["2 uur",120],["3 uur",180]];

  async function load(){
    const since=new Date(Date.now()-3600e3).toISOString();
    [S.items,S.claims]=await Promise.all([
      db.list("dib_items",{order:["sort","created_at"]}),
      db.list("dib_claims",{where:{ends_at:{gt:since}},order:"starts_at"}),
    ]);
  }
  const later=item=>S.claims.filter(c=>c.item_id===item.id&&new Date(c.starts_at)>new Date());

  function rowHTML(it){
    const cur=rules.dibNow(S.claims,it.id,new Date()),next=later(it);
    const status=cur?`<span class="pill rust">bezet</span>`:`<span class="pill moss">vrij</span>`;
    const now=cur?`<div class="row-sub dib-claim">${dotHTML(cur.resident_id)}<b>${personOf(cur.resident_id).name}</b> tot ${hm(new Date(cur.ends_at))}${cur.note?" · "+esc(cur.note):""}</div>`:"";
    const lat=next.map(c=>`<div class="row-sub dib-claim">Later: ${dayLabel(new Date(c.starts_at))} ${hm(new Date(c.starts_at))}–${hm(new Date(c.ends_at))} · ${dotHTML(c.resident_id)}${personOf(c.resident_id).name}${c.note?" · "+esc(c.note):""} <button class="linkbtn rust" data-cancel="${c.id}">annuleren</button></div>`).join("");
    const btn=cur?`<button class="btn amber" data-done="${cur.id}">Klaar</button>`:`<button class="btn" data-open="${it.id}" aria-expanded="${S.open===it.id}">${S.open===it.id?"Sluit":"Dibs!"}</button>`;
    return `<div class="row"><span class="icon">${esc(it.icon||"📦")}</span><div class="row-main"><div class="row-title">${esc(it.name)} ${status}</div>${now}${lat}</div><div class="row-end">${btn}</div></div>
      ${S.open===it.id?panelHTML(it,!!cur):""}`;
  }
  function panelHTML(it,busy){
    const d=toInput(TODAY),t=hm(new Date(Math.ceil(Date.now()/9e5)*9e5));
    return `<div class="panel">
      <div class="chips" aria-label="Voor wie">${people.map(p=>{const id=nameToId(p.name);return `<button class="chip" data-who="${id}" aria-pressed="${S.who===id}">${dotHTML(id)}${p.name}</button>`;}).join("")}</div>
      ${busy?"":`<div class="actions"><span class="row-sub" style="margin:0">Nu, voor</span>${DUR.map(([l,m])=>`<button class="chip" data-now="${m}">${l}</button>`).join("")}</div>`}
      <div class="fgrid">
        <label class="field">Later op<input class="date" type="date" id="dDate" value="${d}"></label>
        <label class="field">Van<input class="date" type="time" id="dFrom" value="${t}"></label>
        <label class="field">Tot<input class="date" type="time" id="dTo" value=""></label>
        <label class="field">Waarvoor<input class="txt" id="dNote" maxlength="60" placeholder="Optioneel"></label>
      </div>
      <div class="form-err" id="dErr" hidden></div>
      <div class="actions"><button class="formbtn" id="dSave">Reserveer</button></div></div>`;
  }
  function manageHTML(){
    return `<div class="panel">${S.items.map(it=>`<div class="actions"><span class="icon">${esc(it.icon||"📦")}</span><span style="flex:1;font-weight:700">${esc(it.name)}</span><button class="iconbtn" data-delitem="${it.id}" aria-label="Verwijder ${esc(it.name)}">✕</button></div>`).join("")}
      <div class="actions"><input class="txt" id="iIcon" maxlength="4" placeholder="🧺" style="width:56px;text-align:center"><input class="txt" id="iName" maxlength="30" placeholder="Nieuw ding, bv. droger" style="flex:1;min-width:140px"><button class="formbtn" id="iAdd">Toevoegen</button></div></div>`;
  }

  // render(true) = na een eigen actie; zonder true (live/klok) wachten we als je hier aan het typen bent.
  function render(force){
    if(!force&&(S.open||S.manage)&&el.contains(document.activeElement))return;
    el.innerHTML=(S.items.length?S.items.map(rowHTML).join(""):`<div class="empty">Nog niks om te dibsen. Voeg de wasmachine toe.</div>`)
      +(S.manage?manageHTML():"")+`<button class="addbtn" id="dManage">${S.manage?"Klaar met beheren":"Dingen beheren"}</button>`;
    el.querySelectorAll("[data-open]").forEach(b=>b.addEventListener("click",()=>{S.open=S.open===b.dataset.open?null:b.dataset.open;S.who=myResidentId||residentIds[0];render(true);}));
    el.querySelectorAll("[data-who]").forEach(b=>b.addEventListener("click",()=>{S.who=b.dataset.who;el.querySelectorAll("[data-who]").forEach(x=>x.setAttribute("aria-pressed",String(x===b)));}));
    el.querySelectorAll("[data-now]").forEach(b=>b.addEventListener("click",()=>{const a=new Date();a.setSeconds(0,0);claim(a,new Date(a.getTime()+b.dataset.now*60e3),null);}));
    el.querySelectorAll("[data-done]").forEach(b=>b.addEventListener("click",()=>finish(b.dataset.done)));
    el.querySelectorAll("[data-cancel]").forEach(b=>b.addEventListener("click",()=>confirmTap(b,()=>cancel(b.dataset.cancel))));
    el.querySelectorAll("[data-delitem]").forEach(b=>b.addEventListener("click",()=>confirmTap(b,()=>delItem(b.dataset.delitem))));
    el.querySelector("#dManage").addEventListener("click",()=>{S.manage=!S.manage;render(true);});
    const save=el.querySelector("#dSave");
    if(save)save.addEventListener("click",()=>{const v=id=>el.querySelector(id).value;
      if(!v("#dDate")||!v("#dFrom")||!v("#dTo"))return err("Kies een dag, van en tot.");
      const [a,b]=timeRange(v("#dDate"),v("#dFrom"),v("#dTo"));claim(a,b,v("#dNote").trim()||null);});
    const iAdd=el.querySelector("#iAdd");
    if(iAdd){iAdd.addEventListener("click",addItem);el.querySelector("#iName").addEventListener("keydown",e=>{if(e.key==="Enter")addItem();});}
  }
  const err=m=>{const e=el.querySelector("#dErr");if(e){e.textContent=m;e.hidden=!m;}else toast(m,"err");};

  async function claim(a,b,note){
    const c={item_id:S.open,resident_id:S.who||myResidentId,starts_at:a.toISOString(),ends_at:b.toISOString(),note};
    const chk=rules.checkDib(S.claims,c);
    if(chk){const x=chk.claim;return err(chk.code==="dib_bezet"
      ?`${personOf(x.resident_id).name} heeft hem dan al: ${dayLabel(new Date(x.starts_at))} ${hm(new Date(x.starts_at))}–${hm(new Date(x.ends_at))}.`:errText(chk));}
    try{await db.insert("dib_claims",c);const it=S.items.find(i=>i.id===S.open);S.open=null;await load();render(true);
      toast(`${it?it.name:"Gedibst"}: ${personOf(c.resident_id).name} tot ${hm(b)}.`);}
    catch(e){err(errText(e));}
  }
  async function finish(id){try{await db.update("dib_claims",{id},{ends_at:new Date().toISOString()});await load();render(true);}catch(e){showError(e);}}
  async function cancel(id){try{await db.remove("dib_claims",{id});S.claims=S.claims.filter(c=>c.id!==id);render(true);}catch(e){showError(e);}}
  async function addItem(){const name=el.querySelector("#iName").value.trim();if(!name)return;const icon=el.querySelector("#iIcon").value.trim()||"📦";
    try{await db.insert("dib_items",{name,icon,sort:S.items.length});await load();render(true);}catch(e){showError(e);}}
  async function delItem(id){try{await db.remove("dib_items",{id});await load();render(true);}catch(e){showError(e);}}

  registerModule({name:"dibs",tables:["dib_items","dib_claims"],load,render});
})();

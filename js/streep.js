// De Bosboom — Streeplijst. Eén tik = één streep (drankje/snack) voor een boom, tegen een vaste prijs.
// Iedereen mag voor iedereen strepen, zoals een turflijst op de koelkast. Een vergissing haal je weg
// met "ongedaan". Afrekenen boekt de open strepen als uitgaven in DeeldeDuit (server-functie).
// De server zet de prijs vast op het moment van strepen en houdt de voorraad bij.
(()=>{
  const el=document.getElementById("streep");
  const S={items:[],marks:[],manage:false,payer:null,bump:null};

  async function load(){
    [S.items,S.marks]=await Promise.all([
      db.list("turf_items",{order:["sort","created_at"]}),
      db.list("turf_marks",{where:{settlement_id:null},order:"created_at"}),
    ]);
  }
  const active=()=>S.items.filter(i=>i.active);
  const itemOf=id=>S.items.find(i=>i.id===id)||{name:"?",icon:"❔",price_cents:0};
  const count=(who,item)=>S.marks.filter(m=>m.resident_id===who&&m.item_id===item).length;

  function gridHTML(){
    const its=active();
    if(!its.length)return `<div class="empty">Nog geen drankjes. Voeg ze toe onder Beheren.</div>`;
    const tot=rules.turfTotals(S.marks);
    return `<div class="turf">${people.map(p=>{const id=nameToId(p.name);
      return `<div class="turf-row"><span class="turf-who">${dotHTML(id)}${p.name}</span>
        <div class="turf-btns">${its.map(it=>`<button class="tap ${S.bump===id+it.id?"bump":""}" data-tap="${it.id}" data-who="${id}" aria-label="Streep ${esc(it.name)} voor ${p.name}" title="${esc(it.name)} · ${rules.euro(it.price_cents)}"><span class="i">${esc(it.icon||"🍺")}</span>${count(id,it.id)}</button>`).join("")}</div>
        <span class="turf-total">${rules.euro(tot[id]||0)}</span></div>`;}).join("")}</div>`;
  }
  function lastHTML(){
    const last=[...S.marks].sort((a,b)=>a.created_at<b.created_at?1:-1).slice(0,3);
    const low=active().filter(i=>i.stock!=null&&i.stock<=3);
    if(!last.length&&!low.length)return "";
    return `<div class="turf-last">${last.length?"Laatst:":""} ${last.map(m=>{const it=itemOf(m.item_id);
      return `<span>${dotHTML(m.resident_id)}<b>${personOf(m.resident_id).name}</b> ${esc(it.icon)} ${hm(new Date(m.created_at))} <button class="linkbtn rust" data-undo="${m.id}">ongedaan</button></span>`;}).join(" · ")}
      ${low.map(i=>`<span class="pill rust">${esc(i.icon)} ${esc(i.name)}: nog ${Math.max(0,i.stock)}</span>`).join(" ")}</div>`;
  }
  function manageHTML(){
    const open=S.marks.reduce((s,m)=>s+m.price_cents,0);
    return `<div class="panel">
      ${S.items.map(it=>`<div class="item-edit ${it.active?"":"off"}" data-item="${it.id}">
        <input class="txt" data-f="icon" maxlength="4" value="${esc(it.icon||"")}" aria-label="Icoon" style="text-align:center">
        <input class="txt" data-f="name" maxlength="30" value="${esc(it.name)}" aria-label="Naam">
        <input class="txt" data-f="price" inputmode="decimal" value="${rules.euro(it.price_cents).replace("€ ","")}" aria-label="Prijs in euro">
        <input class="txt stock" data-f="stock" inputmode="numeric" value="${it.stock==null?"":it.stock}" placeholder="voorraad" aria-label="Voorraad (leeg = niet bijhouden)">
        <button class="linkbtn" data-toggle="${it.id}">${it.active?"verbergen":"tonen"}</button></div>`).join("")}
      <div class="item-edit"><input class="txt" id="tIcon" maxlength="4" placeholder="🍺" style="text-align:center"><input class="txt" id="tName" maxlength="30" placeholder="Nieuw: bv. Bier"><input class="txt" id="tPrice" inputmode="decimal" placeholder="0,80"><input class="txt stock" id="tStock" inputmode="numeric" placeholder="voorraad"><button class="btn" id="tAdd">+</button></div>
      <div class="row-sub" style="margin:0">Prijs aanpassen geldt voor nieuwe strepen; oude strepen houden hun prijs. Voorraad leeg laten = niet bijhouden.</div>
      <div class="actions" style="border-top:1px dashed var(--line);padding-top:12px">
        <span>Open: <b class="money">${rules.euro(open)}</b>. Wie kocht de drank?</span>
        <select class="sel" id="tPayer">${whoOptions(S.payer||myResidentId)}</select>
        <button class="btn solid" id="tSettle" ${open?"":"disabled"}>Afrekenen via DeeldeDuit</button></div>
    </div>`;
  }

  function render(force){
    if(!force&&S.manage&&el.contains(document.activeElement)&&typing())return;
    el.innerHTML=gridHTML()+lastHTML()+(S.manage?manageHTML():"")+`<button class="addbtn" id="tManage">${S.manage?"Klaar met beheren":"Beheren en afrekenen"}</button>`;
    el.querySelectorAll("[data-tap]").forEach(b=>b.addEventListener("click",()=>tap(b.dataset.tap,b.dataset.who)));
    el.querySelectorAll("[data-undo]").forEach(b=>b.addEventListener("click",()=>undo(b.dataset.undo)));
    el.querySelector("#tManage").addEventListener("click",()=>{S.manage=!S.manage;render(true);});
    if(!S.manage)return;
    el.querySelectorAll("[data-item] [data-f]").forEach(inp=>inp.addEventListener("change",()=>editItem(inp.closest("[data-item]").dataset.item,inp.dataset.f,inp.value)));
    el.querySelectorAll("[data-toggle]").forEach(b=>b.addEventListener("click",()=>{const it=S.items.find(i=>i.id===b.dataset.toggle);editItem(it.id,"active",!it.active);}));
    el.querySelector("#tAdd").addEventListener("click",addItem);
    el.querySelector("#tPayer").addEventListener("change",e=>S.payer=e.target.value);
    el.querySelector("#tSettle").addEventListener("click",e=>confirmTap(e.currentTarget,settle));
  }

  async function tap(itemId,who){
    const it=itemOf(itemId),tmp={id:"tmp"+Math.random(),item_id:itemId,resident_id:who,price_cents:it.price_cents,created_at:new Date().toISOString()};
    S.marks.push(tmp);S.bump=who+itemId;render(true);setTimeout(()=>{S.bump=null;},400);
    try{const row=await db.insert("turf_marks",{item_id:itemId,resident_id:who});Object.assign(tmp,row);}
    catch(e){S.marks=S.marks.filter(m=>m!==tmp);render(true);showError(e);}
  }
  async function undo(id){
    const m=S.marks.find(x=>x.id===id);if(!m||id.startsWith("tmp"))return;
    S.marks=S.marks.filter(x=>x!==m);render(true);
    try{await db.remove("turf_marks",{id});}catch(e){S.marks.push(m);render(true);showError(e);}
  }
  async function editItem(id,f,v){
    const fields={};
    if(f==="price"){const c=v.trim()===""||v.trim()==="0"?0:rules.parseEuro(v);if(c==null)return toast("Prijs klopt niet, bv. 0,80","err");fields.price_cents=c;}
    else if(f==="stock"){fields.stock=v.trim()===""?null:parseInt(v,10);if(Number.isNaN(fields.stock))return toast("Voorraad is een getal","err");}
    else if(f==="name"){if(!v.trim())return;fields.name=v.trim();}
    else if(f==="icon")fields.icon=v.trim()||"🍺";
    else fields[f]=v;
    try{await db.update("turf_items",{id},fields);await load();render(true);}catch(e){showError(e);}
  }
  async function addItem(){
    const v=id=>el.querySelector(id).value.trim(),name=v("#tName");if(!name)return;
    const price=v("#tPrice")===""?0:rules.parseEuro(v("#tPrice"));if(price==null)return toast("Prijs klopt niet, bv. 0,80","err");
    const stock=v("#tStock")===""?null:parseInt(v("#tStock"),10);
    try{await db.insert("turf_items",{name,icon:v("#tIcon")||"🍺",price_cents:price,stock:Number.isNaN(stock)?null:stock,active:true,sort:S.items.length});await load();render(true);}
    catch(e){showError(e);}
  }
  async function settle(){
    const payer=S.payer||el.querySelector("#tPayer").value;
    try{await db.call("turf_afrekenen",{p_payer:payer});await load();render(true);
      toast(`Afgerekend: de strepen staan nu in DeeldeDuit, ${personOf(payer).name} krijgt het terug.`);}
    catch(e){showError(e);}
  }

  registerModule({name:"streep",tables:["turf_items","turf_marks"],load,render});
})();

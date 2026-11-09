// De Bosboom — DeeldeDuit: kosten delen en verrekenen.
// Een uitgave (of iets wat je ontving) wordt verdeeld over wie meedoen, met aandelen (1×, 2×, ...).
// Alles in hele centen; het rekenwerk staat in rules.js zodat elk scherm hetzelfde ziet.
// Afrekenen en "betaald" zetten gaan via server-functies, zodat niemand een afrekening kan vervalsen.
(()=>{
  const el=document.getElementById("duit"),sub=document.getElementById("duitSub");
  const S={open:[],shares:[],settlements:[],transfers:[],form:null,preview:false};

  async function load(){
    const [open,sets]=await Promise.all([
      db.list("expenses",{where:{settlement_id:null},order:["spent_on","created_at"],desc:true}),
      db.list("settlements",{order:"created_at",desc:true,limit:12}),
    ]);
    const [shares,transfers]=await Promise.all([
      open.length?db.list("expense_shares",{where:{expense_id:open.map(e=>e.id)}}):[],
      sets.length?db.list("settlement_transfers",{where:{settlement_id:sets.map(s=>s.id)}}):[],
    ]);
    Object.assign(S,{open,shares,settlements:sets,transfers});
  }
  const sharesOf=e=>S.shares.filter(s=>s.expense_id===e.id);
  const balances=()=>rules.balances(S.open.map(e=>({...e,shares:sharesOf(e)})),residentIds);
  const blankForm=()=>({id:null,desc:"",amount:"",payer:myResidentId||residentIds[0],kind:"betaald",date:toInput(TODAY),shares:Object.fromEntries(residentIds.map(id=>[id,1]))});
  const money=(c,signed)=>`<span class="money ${c>0?"pos":c<0?"neg":""}">${rules.euro(c,signed)}</span>`;

  function balHTML(){
    const bal=balances(),plan=rules.settle(bal);
    return `<div class="card"><div class="bal">${people.map(p=>{const id=nameToId(p.name),v=bal[id]||0;
      return `<div class="bal-cell"><span class="row-title">${dotHTML(id)}${p.name}</span>${money(v,true)}<span class="lbl">${v>0?"krijgt terug":v<0?"moet betalen":"quitte"}</span></div>`;}).join("")}</div>
      ${S.open.length?`<div class="panel">${S.preview
        ?`<div class="row-sub" style="margin:0">Zo wordt het verrekend:</div>${plan.map(t=>`<div class="transfer">${dotHTML(t.from_id)}<b>${personOf(t.from_id).name}</b> → ${dotHTML(t.to_id)}<b>${personOf(t.to_id).name}</b> ${money(t.amount_cents)}</div>`).join("")||"<div>Niemand hoeft iets over te maken.</div>"}
          <div class="actions"><button class="btn solid" id="xSettle">Afrekenen</button><button class="ghostbtn" id="xNoSettle">Nog niet</button></div>`
        :`<div class="actions"><span class="row-sub" style="margin:0;flex:1">${S.open.length} open ${S.open.length===1?"uitgave":"uitgaven"}</span><button class="btn" id="xPreview">Afrekenen…</button></div>`}</div>`:""}</div>`;
  }
  function formHTML(){const f=S.form;
    return `<div class="card"><div class="panel" style="background:transparent">
      <div class="chips">${[["betaald","Betaald"],["ontvangen","Ontvangen (bv. borg terug)"]].map(([k,l])=>`<button class="chip" data-kind="${k}" aria-pressed="${f.kind===k}">${l}</button>`).join("")}</div>
      <div class="fgrid">
        <label class="field wide">Omschrijving<input class="txt" id="xDesc" maxlength="80" value="${esc(f.desc)}" placeholder="Bv. boodschappen AH"></label>
        <label class="field">Bedrag (€)<input class="txt" id="xAmt" inputmode="decimal" value="${esc(f.amount)}" placeholder="0,00"></label>
        <label class="field">${f.kind==="betaald"?"Betaald door":"Ontvangen door"}<select class="sel" id="xPayer">${whoOptions(f.payer)}</select></label>
        <label class="field">Datum<input class="date" type="date" id="xDate" value="${f.date}"></label>
      </div>
      <div class="field">Wie doen mee<div class="chips">${people.map(p=>{const id=nameToId(p.name),n=f.shares[id]||0;
        return `<span class="share"><button class="chip" data-part="${id}" aria-pressed="${n>0}">${dotHTML(id)}${p.name}</button>${n>0?`<span class="n">${n}×</span><button class="step" data-more="${id}" aria-label="Meer aandelen voor ${p.name}">+</button>${n>1?`<button class="step" data-less="${id}" aria-label="Minder">−</button>`:""}`:""}</span>`;}).join("")}</div></div>
      <div class="form-err" id="xErr" hidden></div>
      <div class="actions"><button class="formbtn" id="xSave">${f.id?"Bijwerken":"Toevoegen"}</button>${f.id?`<button class="ghostbtn" id="xCancel">Annuleren</button>`:""}</div>
    </div></div>`;}
  function listHTML(){
    if(!S.open.length)return `<div class="card"><div class="empty">Geen open uitgaven. Alles is verrekend.</div></div>`;
    return `<div class="card">${S.open.map(e=>{const sh=sharesOf(e);
      const who=residentIds.filter(id=>sh.some(s=>s.resident_id===id)).map(id=>{const n=sh.find(s=>s.resident_id===id).shares;return personOf(id).name+(n>1?` ${n}×`:"");}).join(", ");
      return `<div class="row"><div class="row-main" data-edit="${e.id}" style="cursor:pointer"><div class="row-title">${esc(e.description)} ${e.kind==="ontvangen"?`<span class="pill amber">ontvangen</span>`:""}</div>
        <div class="row-sub">${dotHTML(e.payer)}${personOf(e.payer).name} ${e.kind==="ontvangen"?"ontving":"betaalde"} · ${dayLabel(fromInput(e.spent_on))} · voor ${who}</div></div>
        <span class="money">${rules.euro(e.amount_cents)}</span><button class="iconbtn" data-del="${e.id}" aria-label="Verwijder">✕</button></div>`;}).join("")}</div>`;
  }
  function historyHTML(){
    if(!S.settlements.length)return "";
    return `<h3 class="duit-h">Afrekeningen</h3><div class="card">${S.settlements.map(s=>{const tr=S.transfers.filter(t=>t.settlement_id===s.id);const anyPaid=tr.some(t=>t.paid_at);
      return `<div class="row" style="align-items:flex-start"><div class="row-main"><div class="row-title">${dayLabel(new Date(s.created_at))} ${tr.length&&tr.every(t=>t.paid_at)?`<span class="pill moss">alles betaald</span>`:""}</div>
        ${tr.map(t=>`<div class="transfer ${t.paid_at?"paid":""}" style="margin-top:6px">${dotHTML(t.from_id)}${personOf(t.from_id).name} → ${dotHTML(t.to_id)}${personOf(t.to_id).name} ${money(t.amount_cents)}
          <button class="chip" data-paid="${t.id}" aria-pressed="${!!t.paid_at}">${t.paid_at?"✓ betaald":"betaald?"}</button></div>`).join("")||`<div class="row-sub">Niemand hoefde iets over te maken.</div>`}</div>
        ${anyPaid?"":`<button class="linkbtn rust" data-undo="${s.id}">terugdraaien</button>`}</div>`;}).join("")}</div>`;
  }

  function renderSub(){
    // Het huisaccount is niemand: dan wat er in het hele huis nog openstaat.
    const me=myResidentId,v=me?(balances()[me]||0):0;
    const owe=S.transfers.filter(t=>!t.paid_at&&(isHuis||t.from_id===me)).reduce((s,t)=>s+t.amount_cents,0);
    sub.className="view-sub "+(owe||v<0?"neg":v>0?"pos":"");
    document.getElementById("duitBadge").hidden=!(owe||v<0);
    sub.textContent=owe?`Nog over te maken: ${rules.euro(owe)}`:v>0?`Jij krijgt ${rules.euro(v)}`:v<0?`Jij betaalt ${rules.euro(-v)}`:"Alles verrekend";
  }
  function render(force){
    renderSub();
    if(!force&&el.contains(document.activeElement)&&typing())return;
    if(!S.form)S.form=blankForm();
    else if(el.querySelector("#xDesc"))keepForm();
    el.innerHTML=balHTML()+`<h3 class="duit-h">${S.form.id?"Uitgave bewerken":"Nieuwe uitgave"}</h3>`+formHTML()+`<h3 class="duit-h">Open uitgaven</h3>`+listHTML()+historyHTML();
    bind();
  }
  function keepForm(){const f=S.form,v=id=>el.querySelector(id).value;Object.assign(f,{desc:v("#xDesc"),amount:v("#xAmt"),payer:v("#xPayer"),date:v("#xDate")});}
  const reform=fn=>()=>{keepForm();fn();render(true);};
  function bind(){
    const on=(sel,fn)=>el.querySelectorAll(sel).forEach(b=>b.addEventListener("click",()=>fn(b)));
    on("[data-kind]",b=>reform(()=>S.form.kind=b.dataset.kind)());
    on("[data-part]",b=>reform(()=>{const id=b.dataset.part;S.form.shares[id]=S.form.shares[id]?0:1;})());
    on("[data-more]",b=>reform(()=>{const id=b.dataset.more;S.form.shares[id]=Math.min(20,(S.form.shares[id]||0)+1);})());
    on("[data-less]",b=>reform(()=>{const id=b.dataset.less;S.form.shares[id]=Math.max(1,S.form.shares[id]-1);})());
    on("[data-edit]",b=>edit(b.dataset.edit));
    on("[data-del]",b=>confirmTap(b,()=>del(b.dataset.del)));
    on("[data-paid]",b=>paid(b.dataset.paid,b.getAttribute("aria-pressed")!=="true"));
    on("[data-undo]",b=>confirmTap(b,()=>undo(b.dataset.undo)));
    on("#xPreview",()=>{S.preview=true;render(true);});
    on("#xNoSettle",()=>{S.preview=false;render(true);});
    on("#xSettle",settle);
    on("#xSave",save);
    on("#xCancel",()=>{S.form=blankForm();render(true);});
  }
  const err=m=>{const e=el.querySelector("#xErr");e.textContent=m;e.hidden=!m;};

  function edit(id){const e=S.open.find(x=>x.id===id);if(!e)return;
    S.form={id,desc:e.description,amount:rules.euro(e.amount_cents).replace("€ ",""),payer:e.payer,kind:e.kind,date:e.spent_on,
      shares:Object.fromEntries(residentIds.map(r=>[r,(sharesOf(e).find(s=>s.resident_id===r)||{}).shares||0]))};
    render(true);el.querySelector("#xDesc").focus();}
  async function save(){
    keepForm();const f=S.form,amt=rules.parseEuro(f.amount);
    if(!f.desc.trim())return err("Waar was het voor?");
    if(!amt)return err("Vul een bedrag in, bv. 12,50.");
    const parts=residentIds.filter(id=>f.shares[id]>0).map(id=>({resident_id:id,shares:f.shares[id]}));
    if(!parts.length)return err(errText({code:"geen_deelnemers"}));
    try{await db.call("save_expense",{p_id:f.id,p_description:f.desc.trim(),p_amount_cents:amt,p_kind:f.kind,p_payer:f.payer,p_spent_on:f.date||toInput(TODAY),p_shares:parts});
      const was=f.id;S.form=blankForm();await load();render(true);toast(was?"Bijgewerkt.":"Toegevoegd.");}
    catch(e){err(errText(e));}
  }
  async function del(id){try{await db.remove("expenses",{id});if(S.form&&S.form.id===id)S.form=blankForm();await load();render(true);}catch(e){showError(e);}}
  async function settle(){try{await db.call("settle_expenses",{});S.preview=false;await load();render(true);toast("Afgerekend. Zet een overboeking op betaald zodra het geld binnen is.");}catch(e){showError(e);}}
  async function paid(id,on){try{await db.call("mark_transfer_paid",{p_transfer:id,p_paid:on});await load();render(true);}catch(e){showError(e);}}
  async function undo(id){try{await db.call("undo_settlement",{p_settlement:id});await load();render(true);}catch(e){showError(e);}}

  tabHooks.duit=async()=>{render(true);await load();render(true);};
  registerModule({name:"duit",tables:["expenses","expense_shares","settlements","settlement_transfers"],load,render});
})();

// De Bosboom — Agenda. Een KRING claimt het huis: er kan niets anders naast gepland worden
// en niemand kan zich aanmelden. Een HUISAVOND of ACTIVITEIT is open: iedereen kan erbij.
// De regels staan in rules.checkEvent / rules.canJoin; de server controleert ze nog een keer.
(()=>{
  const el=document.getElementById("agenda"),banner=document.getElementById("kringBanner");
  const S={events:[],rsvp:[],form:null};
  const KIND={kring:{t:"Kring",pill:`<span class="pill amber">🔒 huis bezet</span>`},
              huisavond:{t:"Huisavond",pill:`<span class="pill moss">iedereen welkom</span>`},
              activiteit:{t:"Activiteit",pill:`<span class="pill">activiteit</span>`}};
  const CYCLE={"":"ja",ja:"misschien",misschien:"nee",nee:""};
  const ST_LBL={ja:"✓",misschien:"· misschien",nee:"· niet","":"· ?"};

  async function load(){
    const since=new Date(Date.now()-6*3600e3).toISOString();
    S.events=await db.list("events",{where:{ends_at:{gt:since}},order:"starts_at"});
    S.rsvp=S.events.length?await db.list("event_rsvp",{where:{event_id:S.events.map(e=>e.id)}}):[];
  }
  const upcoming=()=>S.events.filter(e=>new Date(e.ends_at)>new Date());
  const rsvpOf=(ev,id)=>(S.rsvp.find(r=>r.event_id===ev.id&&r.resident_id===id)||{}).status||"";
  const when=ev=>{const a=new Date(ev.starts_at),b=new Date(ev.ends_at);return `${hm(a)}–${hm(b)}`;};

  function rowHTML(ev){
    const a=new Date(ev.starts_at),k=KIND[ev.kind]||KIND.activiteit,host=personOf(ev.host);
    const going=residentIds.filter(id=>id===ev.host||rsvpOf(ev,id)==="ja").length;
    const sub=ev.kind==="kring"?`${when(ev)} · ${dotHTML(ev.host)} <b>${host.name}</b> heeft het huis`
      :`${when(ev)} · ${dotHTML(ev.host)} ${host.name} organiseert · <b>${going}</b> erbij`;
    const rsvp=rules.canJoin(ev)?`<div class="rsvp">${people.map(p=>{const id=nameToId(p.name);
      if(id===ev.host)return `<span class="chip host" data-st="ja">${dotHTML(id)}${p.name} ✓</span>`;
      const st=rsvpOf(ev,id);return `<button class="chip" data-rsvp="${ev.id}" data-who="${id}" data-st="${st}" aria-label="${p.name}: ${st||"nog niet"}">${dotHTML(id)}${p.name} ${ST_LBL[st]}</button>`;}).join("")}</div>`:"";
    return `<div class="row" style="align-items:flex-start">
      <div class="ev-date ${ev.kind==="kring"?"kring":""}"><div class="d">${days[a.getDay()]}</div><div class="n">${a.getDate()}</div><div class="d">${MON[a.getMonth()]}</div></div>
      <div class="row-main"><div class="row-title">${esc(ev.title)} ${k.pill}</div><div class="row-sub">${sub}</div>
        ${ev.note?`<div class="ev-note">${esc(ev.note)}</div>`:""}${rsvp}</div>
      <button class="iconbtn" data-del="${ev.id}" aria-label="Verwijder">✕</button></div>`;
  }

  function formHTML(){const f=S.form;
    return `<div class="panel" id="evForm">
      <div class="chips" role="radiogroup" aria-label="Soort">${Object.keys(KIND).map(k=>`<button class="chip ${k==="kring"?"kring":""}" data-kind="${k}" aria-pressed="${f.kind===k}">${KIND[k].t}</button>`).join("")}</div>
      <div class="row-sub" style="margin:0">${f.kind==="kring"?"Een kring claimt het hele huis. Er kan dan niets anders gepland worden, en anderen kunnen niet aansluiten.":"Iedereen kan aangeven of hij erbij is."}</div>
      <div class="fgrid">
        <label class="field wide">Wat<input class="txt" id="evTitle" maxlength="60" value="${esc(f.title)}" placeholder="${f.kind==="kring"?"Kring van "+personOf(f.host).name:f.kind==="huisavond"?"Huisavond":"Bv. pubquiz"}"></label>
        <label class="field">Datum<input class="date" type="date" id="evDate" value="${f.date}"></label>
        <label class="field">Van<input class="date" type="time" id="evFrom" value="${f.from}"></label>
        <label class="field">Tot<input class="date" type="time" id="evTo" value="${f.to}"></label>
        <label class="field">${f.kind==="kring"?"Wie claimt":"Wie organiseert"}<select class="sel" id="evHost">${whoOptions(f.host)}</select></label>
        <label class="field wide">Notitie<input class="txt" id="evNote" maxlength="300" value="${esc(f.note)}" placeholder="Optioneel"></label>
      </div>
      <div class="form-err" id="evErr" hidden></div>
      <div class="actions"><button class="formbtn" id="evSave">Opslaan</button><button class="ghostbtn" id="evCancel">Annuleren</button></div>
    </div>`;}

  function render(){
    if(S.form&&el.querySelector("#evTitle"))keepForm();   // live-update tijdens invullen: niets kwijtraken
    const list=upcoming();
    el.innerHTML=(list.length?list.map(rowHTML).join(""):`<div class="empty">Nog niks gepland. Plan een kring of een huisavond.</div>`)
      +(S.form?formHTML():`<button class="addbtn" id="evAdd">+ Plannen</button>`);
    renderBanner();
    el.querySelectorAll("[data-del]").forEach(b=>b.addEventListener("click",()=>confirmTap(b,()=>del(b.dataset.del))));
    el.querySelectorAll("[data-rsvp]").forEach(b=>b.addEventListener("click",()=>setRsvp(b.dataset.rsvp,b.dataset.who)));
    const add=el.querySelector("#evAdd");
    if(add)add.addEventListener("click",()=>{S.form={kind:"huisavond",title:"",date:toInput(TODAY),from:"19:00",to:"23:00",host:myResidentId||residentIds[0],note:""};render();el.querySelector("#evTitle").focus();});
    if(S.form)bindForm();
  }
  function keepForm(){const f=S.form,v=id=>el.querySelector(id).value;
    Object.assign(f,{title:v("#evTitle"),date:v("#evDate"),from:v("#evFrom"),to:v("#evTo"),host:v("#evHost"),note:v("#evNote")});}
  function bindForm(){
    el.querySelectorAll("[data-kind]").forEach(b=>b.addEventListener("click",()=>{keepForm();const k=b.dataset.kind;
      if(k==="kring"&&S.form.to==="23:00")S.form.to="01:00";
      S.form.kind=k;render();}));
    el.querySelector("#evHost").addEventListener("change",()=>{keepForm();render();});
    el.querySelector("#evCancel").addEventListener("click",()=>{S.form=null;render();});
    el.querySelector("#evSave").addEventListener("click",save);
  }
  const errBox=m=>{const e=el.querySelector("#evErr");e.textContent=m;e.hidden=!m;};

  async function save(){
    keepForm();const f=S.form;
    if(!f.date||!f.from||!f.to)return errBox("Vul datum en tijden in.");
    const [a,b]=timeRange(f.date,f.from,f.to);
    const title=f.title.trim()||(f.kind==="kring"?"Kring van "+personOf(f.host).name:KIND[f.kind].t);
    const ev={title,kind:f.kind,host:f.host,starts_at:a.toISOString(),ends_at:b.toISOString(),note:f.note.trim()||null};
    const chk=rules.checkEvent(S.events,ev);
    if(chk){const x=chk.event;return errBox(chk.code==="huis_geclaimd"
      ?(x.kind==="kring"?`Het huis is dan al geclaimd: ${x.title}, ${dayLabel(new Date(x.starts_at))} ${when(x)}.`
                        :`Er staat dan al iets gepland (${x.title}, ${when(x)}). Een kring heeft het huis voor zich alleen.`)
      :errText(chk));}
    el.querySelector("#evSave").disabled=true;
    try{await db.insert("events",ev);S.form=null;await load();render();toast(f.kind==="kring"?"Kring gepland. Het huis is van jou.":"Gepland!");}
    catch(e){errBox(errText(e));el.querySelector("#evSave").disabled=false;}
  }
  async function del(id){try{await db.remove("events",{id});S.events=S.events.filter(e=>e.id!==id);render();}catch(e){showError(e);}}
  async function setRsvp(evId,who){
    const ev=S.events.find(e=>e.id===evId);if(!ev||!rules.canJoin(ev))return;
    const next=CYCLE[rsvpOf(ev,who)];
    S.rsvp=S.rsvp.filter(r=>!(r.event_id===evId&&r.resident_id===who));
    if(next)S.rsvp.push({event_id:evId,resident_id:who,status:next});
    render();
    try{ if(next)await db.upsert("event_rsvp",{event_id:evId,resident_id:who,status:next},["event_id","resident_id"]);
         else await db.remove("event_rsvp",{event_id:evId,resident_id:who}); }
    catch(e){showError(e);await load();render();}
  }

  // Bovenaan het startscherm: is het huis vandaag (of nu) geclaimd?
  function renderBanner(){
    const now=new Date(),end=new Date(TODAY);end.setDate(end.getDate()+1);end.setHours(6);
    const k=S.events.find(e=>e.kind==="kring"&&new Date(e.ends_at)>now&&new Date(e.starts_at)<end);
    if(!k){banner.hidden=true;return;}
    const a=new Date(k.starts_at),b=new Date(k.ends_at),nu=a<=now;
    banner.innerHTML=`<span class="big">🔒</span><div><b>${nu?"Nu":a.getHours()>=17?"Vanavond":"Vandaag"}: ${esc(k.title)}</b><br>${nu?"tot "+hm(b):hm(a)+"–"+hm(b)} · het huis is van ${personOf(k.host).name}.</div>`;
    banner.hidden=false;
  }

  registerModule({name:"agenda",tables:["events","event_rsvp"],load,render});
})();

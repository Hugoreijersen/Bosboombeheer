// De Bosboom — Statistieken. Telt wat er al in de database staat: eten, schoonmaak (logboek),
// strepen, uitgaven, dibs en activiteiten. Geen eigen tabellen; alles wordt hier opgeteld.
(()=>{
  const el=document.getElementById("stats"),seg=document.getElementById("statPeriod");
  let period="maand",seq=0;
  const MONTHS=["januari","februari","maart","april","mei","juni","juli","augustus","september","oktober","november","december"];

  function since(){const d=new Date(TODAY);
    if(period==="week")return new Date(SUN0);
    if(period==="maand"){d.setDate(1);return d;}
    d.setMonth(0,1);return d;}
  const label=()=>period==="week"?"deze week":period==="maand"?MONTHS[TODAY.getMonth()]:String(TODAY.getFullYear());

  // tel per bewoner; weight bepaalt hoeveel een rij telt
  function tally(rows,key,weight){const out={};residentIds.forEach(id=>out[id]=0);
    rows.forEach(r=>{const id=typeof key==="function"?key(r):r[key];if(id in out)out[id]+=weight?weight(r):1;});return out;}
  const safe=p=>p.catch(()=>[]);   // tabel nog niet aangemaakt? Dan telt die gewoon als 0.

  async function load(){
    const my=++seq,from=since(),fromDay=toInput(from),fromTs=from.toISOString(),now=new Date().toISOString();
    el.innerHTML=`<div class="card"><div class="empty">Tellen…</div></div>`;
    const [meals,log,marks,exp,claims,evs]=await Promise.all([
      safe(db.list("meals",{where:{day:{gte:fromDay,lte:toInput(TODAY)}}})),
      safe(db.list("chore_log",{where:{done_at:{gte:fromDay}}})),
      safe(db.list("turf_marks",{where:{created_at:{gte:fromTs}}})),
      safe(db.list("expenses",{where:{spent_on:{gte:fromDay},kind:"betaald"}})),
      safe(db.list("dib_claims",{where:{starts_at:{gte:fromTs,lte:now}}})),
      safe(db.list("events",{where:{starts_at:{gte:fromTs,lte:now}}})),
    ]);
    if(my!==seq)return;
    const eats=m=>m.status==="eet"||m.status==="kookt";
    const M=[
      {k:"gekookt",t:"Gekookt",v:tally(meals.filter(m=>m.status==="kookt"),"resident_id")},
      {k:"gegeten",t:"Meegegeten",v:tally(meals.filter(eats),"resident_id")},
      {k:"gasten",t:"Gasten meegenomen",v:tally(meals.filter(eats),"resident_id",m=>m.guests||0)},
      {k:"schoon",t:"Schoongemaakt",v:tally(log,"done_by")},
      {k:"streep",t:"Streepjes",v:tally(marks,"resident_id")},
      {k:"geld",t:"Voorgeschoten",v:tally(exp,"payer",e=>e.amount_cents),euro:true},
      {k:"dibs",t:"Dibs",v:tally(claims,"resident_id")},
      {k:"host",t:"Georganiseerd",v:tally(evs,"host")},
    ];
    render(M);
  }

  function top(m){let best=null;residentIds.forEach(id=>{if(m.v[id]>0&&(!best||m.v[id]>m.v[best]))best=id;});return best;}
  // Getekende icoontjes (in de stijl van de menubalk): een schep voor wie het bos bijhoudt, een gieter voor de dorstigste boom.
  const ICON={
    schep:`<svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true"><g transform="rotate(32 16 16)">
      <path d="M11 3.2h10" stroke="#7a5233" stroke-width="2.6" stroke-linecap="round"/><rect x="14.7" y="3" width="2.6" height="15" rx="1" fill="#a8754a"/>
      <path d="M10 17.5h12v6.5c0 3.8-2.7 6.5-6 6.5s-6-2.7-6-6.5z" fill="#8f9aa3"/><path d="M10 17.5h12v2H10z" fill="#6f7a83"/>
      <path d="M12.3 21v3.4c0 2.2 1.4 3.8 3.2 4.2" fill="none" stroke="#c6d0d8" stroke-width="1.3" stroke-linecap="round"/></g></svg>`,
    gieter:`<svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
      <path d="M9 12h12l-1.4 13.2a2 2 0 0 1-2 1.8h-5.2a2 2 0 0 1-2-1.8z" fill="#4f9a5c"/><path d="M9 12h12l-.3 3H9.3z" fill="#3f8a4e"/>
      <path d="M11 12c0-4 8-4 8 0" fill="none" stroke="#3f7d4e" stroke-width="2" stroke-linecap="round"/>
      <path d="M20.4 17.5l6-6.5" stroke="#4f9a5c" stroke-width="2.4" stroke-linecap="round"/><rect x="25.2" y="8.6" width="4" height="3" rx="1" transform="rotate(-45 27.2 10.1)" fill="#3f7d4e"/>
      <g fill="#6fb7e0"><circle cx="29" cy="14" r="1"/><circle cx="30" cy="17.2" r=".9"/><circle cx="27.6" cy="16.6" r=".8"/></g>
      <path d="M9.4 16.5c-3 0-4.5 2-4.5 4.2" fill="none" stroke="#3f7d4e" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  };
  function render(M){
    const by=k=>M.find(m=>m.k===k);
    const hl=[["🍳","Chef van "+label(),by("gekookt")],[ICON.schep,"Boswachter",by("schoon")],[ICON.gieter,"Dorstigste boom",by("streep")]]
      .map(([ic,t,m])=>{const b=top(m);return `<div class="card hl"><span class="big">${ic}</span><div><div class="t">${t}</div><div class="v">${b?`${personOf(b).name} · ${m.v[b]}×`:"nog niemand"}</div></div></div>`;}).join("");
    const cards=M.map(m=>{const max=Math.max(1,...residentIds.map(id=>m.v[id]));const sum=residentIds.reduce((s,id)=>s+m.v[id],0);
      return `<div class="card metric"><h3><span>${m.t}</span><span>${m.euro?rules.euro(sum):sum}</span></h3>${people.map(p=>{const id=nameToId(p.name),v=m.v[id];
        return `<div class="metric-row"><span class="nm">${p.name}</span><div class="track"><div class="fill" style="width:${Math.round(v/max*100)}%;background:${p.color}"></div></div><span class="v">${m.euro?rules.euro(v):v}</span></div>`;}).join("")}</div>`;}).join("");
    el.innerHTML=`<div class="highlights">${hl}</div><div class="stat-grid">${cards}</div>`;
  }

  seg.querySelectorAll("button").forEach(b=>b.addEventListener("click",()=>{period=b.dataset.p;
    seg.querySelectorAll("button").forEach(x=>x.setAttribute("aria-selected",String(x===b)));load();}));
  tabHooks.stats=load;
})();

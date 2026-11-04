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
  function render(M){
    const by=k=>M.find(m=>m.k===k);
    const hl=[["🍳","Chef van "+label(),by("gekookt")],["🧽","Poetskampioen",by("schoon")],["🍺","Dorstigste boom",by("streep")]]
      .map(([ic,t,m])=>{const b=top(m);return `<div class="card hl"><span class="big">${ic}</span><div><div class="t">${t}</div><div class="v">${b?`${personOf(b).name} · ${m.v[b]}×`:"nog niemand"}</div></div></div>`;}).join("");
    const cards=M.map(m=>{const max=Math.max(1,...residentIds.map(id=>m.v[id]));const sum=residentIds.reduce((s,id)=>s+m.v[id],0);
      return `<div class="card metric"><h3><span>${m.t}</span><span>${m.euro?rules.euro(sum):sum}</span></h3>${people.map(p=>{const id=nameToId(p.name),v=m.v[id];
        return `<div class="metric-row"><span class="nm">${p.name}</span><div class="track"><div class="fill" style="width:${Math.round(v/max*100)}%;background:${p.color}"></div></div><span class="v">${m.euro?rules.euro(v):v}</span></div>`;}).join("")}</div>`;}).join("");
    el.innerHTML=`<div class="highlights">${hl}</div><div class="stat-grid">${cards}</div>`;
  }

  seg.querySelectorAll("button").forEach(b=>b.addEventListener("click",()=>{period=b.dataset.p;
    seg.querySelectorAll("button").forEach(x=>x.setAttribute("aria-selected",String(x===b)));load();}));
  document.getElementById("openStats").addEventListener("click",()=>openPage("page-stats"));
  pageHooks["page-stats"]=load;
})();

// De Bosboom — boodschappen van wie kookte. Kiest een boom "Kookt", dan komt onder het eten een
// veldje voor wat de boodschappen kostten (niet op het kiosk-scherm). Dat wordt één uitgave in DeeldeDuit: betaald door de kok, verdeeld over
// wie die dag meeeet (gasten tellen mee bij wie ze meenam). Per dag en kok is er één uitgave (meal_day).
const cookCost=(()=>{
  let rows=[];                                       // uitgaven met meal_day, de laatste 2 maanden
  const key=(day,payer)=>day+"|"+payer;
  let byKey={};
  async function load(){
    const since=new Date(TODAY);since.setDate(since.getDate()-60);
    rows=await db.list("expenses",{where:{meal_day:{gte:toInput(since)}}});
    byKey={};rows.forEach(e=>byKey[key(e.meal_day,e.payer)]=e);
  }
  const find=(day,cookId)=>byKey[key(day,cookId)]||null;

  // Wie eten er mee, en met hoeveel aandelen (1 + gasten)?
  function eaters(off,d){const wk=W(off);
    return people.filter(p=>eats(wk,p.name,d)).map(p=>({resident_id:nameToId(p.name),shares:1+(wk.guests[p.name][d]||0)}));}

  // In de voettekst van het eten: per kok een veldje voor het bedrag (geen pop-up).
  // Op het kiosk-scherm niet: dat vult iedereen op zijn eigen telefoon in.
  let editing=null;                                  // "dag|kok" die nu bewerkt wordt
  function footHTML(off,d,cooks){
    if(!cooks.length||scherm.kiosk)return "";
    const day=toInput(weekDateOff(d,off));
    return `<div class="cook-costs">${cooks.map(n=>{const id=nameToId(n),e=find(day,id),k=key(day,id);
      if(e&&editing!==k)return `<div class="cc-row"><span>🧾 Boodschappen ${n}: <b class="money">${rules.euro(e.amount_cents)}</b></span>${e.settlement_id?`<small class="muted">afgerekend</small>`:`<button class="linkbtn" data-ccedit="${n}">wijzig</button>`}</div>`;
      return `<div class="cc-row"><label for="cc-${id}-${d}">🧾 Boodschappen ${n}</label><input class="txt cc-amt" id="cc-${id}-${d}" data-ccamt="${n}" inputmode="decimal" placeholder="€ 0,00" value="${e?rules.euro(e.amount_cents).replace("€ ",""):""}"><button class="btn solid" data-ccsave="${n}">${e?"Opslaan":"In DeeldeDuit"}</button>${e?`<button class="linkbtn rust" data-ccdel="${n}">weghalen</button>`:""}</div>`;}).join("")}</div>`;
  }
  function bind(el,where){
    const at=n=>{const{off,d}=ctx(where);return {off,d,id:nameToId(n),date:weekDateOff(d,off)};};
    el.querySelectorAll("[data-ccedit]").forEach(b=>b.addEventListener("click",()=>{const a=at(b.dataset.ccedit);editing=key(toInput(a.date),a.id);refreshFooters();}));
    el.querySelectorAll("[data-ccsave]").forEach(b=>{const n=b.dataset.ccsave,inp=el.querySelector(`[data-ccamt="${n}"]`);
      const go=()=>save(n,at(n),inp,b);b.addEventListener("click",go);inp.addEventListener("keydown",e=>{if(e.key==="Enter")go();});});
    el.querySelectorAll("[data-ccdel]").forEach(b=>b.addEventListener("click",()=>{const a=at(b.dataset.ccdel),e=find(toInput(a.date),a.id);
      confirmTap(b,async()=>{try{await db.remove("expenses",{id:e.id});editing=null;await load();refreshFooters();}catch(x){showError(x);}});}));
  }
  async function save(name,{off,d,id,date},inp,btn){
    const day=toInput(date),existing=find(day,id),amt=rules.parseEuro(inp.value),parts=eaters(off,d);
    if(!amt)return toast("Vul een bedrag in, bv. 23,40.","err");
    if(!parts.length)return toast(errText({code:"geen_deelnemers"}),"err");
    btn.disabled=true;
    try{await db.call("save_expense",{p_id:existing?existing.id:null,p_description:`Eten ${days[date.getDay()]} ${fmt(date)} (${name} kookte)`,
        p_amount_cents:amt,p_kind:"betaald",p_payer:id,p_spent_on:day,p_shares:parts,p_meal_day:day});
      editing=null;await load();refreshFooters();toast(`${rules.euro(amt)} staat in DeeldeDuit.`);}
    catch(e){showError(e);btn.disabled=false;}
  }

  registerModule({name:"kookkosten",tables:[],load,render:()=>{}});
  return {footHTML,bind};
})();

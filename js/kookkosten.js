// De Bosboom — boodschappen van wie kookte. Kiest een boom "Kookt", dan vraagt een pop-up wat de
// boodschappen kostten. Dat wordt één uitgave in DeeldeDuit: betaald door de kok, verdeeld over
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

  // In de voettekst van het eten: per kok het bedrag, of een knop om het in te vullen.
  function footHTML(off,d,cooks){
    if(!cooks.length)return "";
    const day=toInput(weekDateOff(d,off));
    return `<div class="cook-costs">${cooks.map(n=>{const e=find(day,nameToId(n));
      return `<button class="chip" data-cookcost="${n}">🧾 ${e?`${n}: ${rules.euro(e.amount_cents)}`:`Boodschappen van ${n}?`}</button>`;}).join("")}</div>`;
  }
  function bind(el,where){el.querySelectorAll("[data-cookcost]").forEach(b=>b.addEventListener("click",()=>{const{off,d}=ctx(where);ask(b.dataset.cookcost,off,d);}));}

  function ask(name,off,d){
    const cookId=nameToId(name),date=weekDateOff(d,off),day=toInput(date),existing=find(day,cookId);
    const settled=existing&&existing.settlement_id;
    const parts=eaters(off,d);
    const preview=amt=>{if(!amt||!parts.length)return "";const sp=rules.splitCents(amt,parts.map(p=>({id:p.resident_id,shares:p.shares})));
      return parts.map(p=>`<div><span>${dotHTML(p.resident_id)}${personOf(p.resident_id).name}${p.shares>1?` <small>(+${p.shares-1} ${p.shares===2?"gast":"gasten"})</small>`:""}</span><b class="money">${rules.euro(sp[p.resident_id])}</b></div>`).join("");};
    const start=existing?rules.euro(existing.amount_cents).replace("€ ",""):"";
    modal.open(`<h3>🍳 ${name} kookt ${dayLabel(date)}</h3>
      <p>${settled?"Deze boodschappen zijn al afgerekend in DeeldeDuit.":"Wat kostten de boodschappen? Het komt in DeeldeDuit, verdeeld over wie meeeet."}</p>
      <input class="txt big-input" id="ccAmt" inputmode="decimal" placeholder="€ 0,00" value="${start}" ${settled?"disabled":""}>
      <div class="split-list" id="ccSplit">${preview(rules.parseEuro(start))}</div>
      ${parts.length?"":`<p class="form-err">Er eet nog niemand mee op deze dag.</p>`}
      <div class="form-err" id="ccErr" hidden></div>
      <div class="actions">${settled?`<button class="formbtn" id="ccLater">Sluiten</button>`:
        `<button class="formbtn" id="ccSave">${existing?"Bijwerken":"In DeeldeDuit"}</button><button class="ghostbtn" id="ccLater">${existing?"Annuleren":"Later"}</button>${existing?`<button class="linkbtn rust" id="ccDel">weghalen</button>`:""}`}</div>`,
    card=>{
      const amtEl=card.querySelector("#ccAmt"),err=m=>{const e=card.querySelector("#ccErr");e.textContent=m;e.hidden=!m;};
      amtEl.addEventListener("input",()=>card.querySelector("#ccSplit").innerHTML=preview(rules.parseEuro(amtEl.value)));
      card.querySelector("#ccLater").addEventListener("click",modal.close);
      const save=card.querySelector("#ccSave");
      if(save){const go=async()=>{const amt=rules.parseEuro(amtEl.value);
          if(!amt)return err("Vul een bedrag in, bv. 23,40.");
          if(!parts.length)return err(errText({code:"geen_deelnemers"}));
          save.disabled=true;
          try{await db.call("save_expense",{p_id:existing?existing.id:null,p_description:`Eten ${days[date.getDay()]} ${fmt(date)} (${name} kookte)`,
              p_amount_cents:amt,p_kind:"betaald",p_payer:cookId,p_spent_on:day,p_shares:parts,p_meal_day:day});
            modal.close();await load();refreshFooters();toast(`${rules.euro(amt)} staat in DeeldeDuit.`);}
          catch(e){err(errText(e));save.disabled=false;}};
        save.addEventListener("click",go);amtEl.addEventListener("keydown",e=>{if(e.key==="Enter")go();});}
      const del=card.querySelector("#ccDel");
      if(del)del.addEventListener("click",()=>confirmTap(del,async()=>{try{await db.remove("expenses",{id:existing.id});modal.close();await load();refreshFooters();}catch(e){err(errText(e));}}));
    });
  }

  registerModule({name:"kookkosten",tables:[],load,render:()=>{}});
  return {footHTML,bind,ask};
})();

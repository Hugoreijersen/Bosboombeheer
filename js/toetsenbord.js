// De Bosboom — schermtoetsenbord voor de kiosk (het touchscreen heeft geen toetsenbord).
// Alleen in kiosk-stand (zie scherm.js). Tik je in een tekstveld, dan schuift onderin een
// toetsenbord omhoog; tik je ergens anders, dan gaat het weer weg. Werkt in elke browser,
// los van wat het besturingssysteem kan.
const toetsenbord=(()=>{
  const TEXT_TYPES=["text","email","password","search","tel","url","number"];
  const LAYOUTS={
    abc:[["q","w","e","r","t","y","u","i","o","p"],["a","s","d","f","g","h","j","k","l"],["⇧","z","x","c","v","b","n","m","⌫"],["123","@",",","␣",".","⏎","⌄"]],
    sym:[["1","2","3","4","5","6","7","8","9","0"],["-","/",":",";","(",")","€","&","\"","'"],["#","+","=","!","?","%","é","ë","⌫"],["abc","@",",","␣",".","⏎","⌄"]],
    num:[["1","2","3"],["4","5","6"],["7","8","9"],[",","0","⌫"],["⌄","⏎"]],
  };
  const LABEL={"⇧":"Hoofdletter","⌫":"Wissen","␣":"Spatie","⏎":"Enter","⌄":"Toetsenbord dicht","123":"Cijfers en tekens","abc":"Letters"};
  let el=null, target=null, layout="abc", shift=false, start="", typed=false;

  const wanted=t=>t&&((t.tagName==="TEXTAREA")||(t.tagName==="INPUT"&&TEXT_TYPES.includes((t.type||"text").toLowerCase())))&&!t.readOnly&&!t.disabled;
  const numeric=t=>t.type==="number"||/^(numeric|decimal|tel)$/.test(t.dataset.kbMode??t.getAttribute("inputmode")??"");
  const on=()=>typeof scherm!=="undefined"&&scherm.kiosk;

  function build(){
    el=document.createElement("div");
    el.className="kb"; el.hidden=true; el.setAttribute("role","group"); el.setAttribute("aria-label","Schermtoetsenbord");
    // Knoppen nemen de focus niet over: het tekstveld blijft actief.
    el.addEventListener("pointerdown",e=>{e.preventDefault();const b=e.target.closest("button");if(b)press(b.dataset.k);});
    el.addEventListener("click",e=>e.preventDefault());
    document.body.appendChild(el);
  }
  function render(){
    const rows=LAYOUTS[layout];
    el.classList.toggle("kb-num",layout==="num");
    el.innerHTML=rows.map(r=>`<div class="kb-row">${r.map(k=>{
      const shown=k.length===1&&shift?k.toUpperCase():k;
      const cls=["kb-k"]; if(k==="␣")cls.push("kb-space"); if(k.length>1||"⇧⌫⏎⌄".includes(k))cls.push("kb-fn");
      if(k==="⇧"&&shift)cls.push("on"); if(k==="⏎")cls.push("kb-enter");
      return `<button type="button" class="${cls.join(" ")}" data-k="${k.replace(/"/g,"&quot;")}"${LABEL[k]?` aria-label="${LABEL[k]}"`:""}>${k==="␣"?"spatie":shown.replace(/</g,"&lt;")}</button>`;
    }).join("")}</div>`).join("");
  }

  // Tekst invoegen of wissen op de plek van de cursor (velden zonder cursor: aan het eind).
  function edit(insert){
    const t=target; if(!t)return;
    let s=null,e=null;
    try{ s=t.selectionStart; e=t.selectionEnd; }catch(_){}
    if(s==null||e==null){ // email/number hebben geen cursorpositie
      t.value=insert===null?t.value.slice(0,-1):t.value+insert;
    }else if(insert===null){
      if(s===e&&s>0)t.setRangeText("",s-1,e,"end"); else if(s!==e)t.setRangeText("",s,e,"end");
    }else t.setRangeText(insert,s,e,"end");
    typed=true;
    t.dispatchEvent(new Event("input",{bubbles:true}));
  }
  function press(k){
    if(!target)return;
    if(k==="⇧"){shift=!shift;render();return;}
    if(k==="123"){layout="sym";render();return;}
    if(k==="abc"){layout="abc";render();return;}
    if(k==="⌄"){target.blur();hide();return;}  // blur → focusout → commit
    if(k==="⌫"){edit(null);return;}
    if(k==="⏎"){
      if(target.tagName==="TEXTAREA"){edit("\n");return;}
      const t=target;
      t.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",code:"Enter",bubbles:true}));
      t.dispatchEvent(new KeyboardEvent("keyup",{key:"Enter",code:"Enter",bubbles:true}));
      return;
    }
    edit(k==="␣"?" ":(shift?k.toUpperCase():k));
    if(shift){shift=false;render();}
  }
  function show(t){
    if(!el)build();
    if(target!==t){target=t;start=t.value;typed=false;}
    layout=numeric(t)?"num":"abc";
    // Hoofdletter aan het begin van een leeg tekstveld (niet bij e-mail of wachtwoord)
    shift=layout==="abc"&&!t.value&&!/^(email|password|url)$/.test(t.type);
    render(); el.hidden=false;
    document.documentElement.classList.add("kb-open");
    setTimeout(()=>t.scrollIntoView({block:"center"}),50);
  }
  function hide(){
    target=null; if(el)el.hidden=true;
    document.documentElement.classList.remove("kb-open");
  }

  document.addEventListener("focusin",e=>{
    const t=e.target;
    if(!on()||!wanted(t))return;
    // Onthoud het oorspronkelijke soort toetsenbord, en voorkom een tweede (systeem)toetsenbord
    if(t.dataset.kbMode===undefined)t.dataset.kbMode=t.getAttribute("inputmode")||"";
    t.setAttribute("inputmode","none");
    show(t);
  });
  // Een programmatische wijziging geeft bij het verlaten van het veld geen "change";
  // die sturen we zelf, want veel velden slaan pas op bij "change".
  function commit(t){
    if(t&&typed&&t.value!==start)t.dispatchEvent(new Event("change",{bubbles:true}));
    typed=false;
  }
  document.addEventListener("focusout",e=>{
    if(e.target===target)commit(target);
    // Even wachten: springt de focus naar een ander tekstveld, dan blijft het toetsenbord staan.
    setTimeout(()=>{ if(!wanted(document.activeElement)||!on())hide(); },60);
  });
  return {hide};
})();

// De Bosboom — "Wie is thuis?": de drie bomen.
function tree(kind,c,season){
  const trunk = kind==="eik" ? `<path d="M26 74 Q25 60 29 47 L35 47 Q39 60 38 74 Z" fill="var(--bark)"/>`
    : kind==="iep" ? `<path d="M30 74 L30 45 Q30 41 24 35" stroke="var(--bark)" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M34 74 L34 45 Q34 41 40 35" stroke="var(--bark)" stroke-width="3" fill="none" stroke-linecap="round"/><rect x="30.5" y="44" width="3" height="30" fill="var(--bark)"/>`
    : `<path d="M30 74 Q30 48 31.2 28 L32.8 28 Q34 48 34 74 Z" fill="var(--birch-bark)" stroke="rgba(90,74,56,.25)" stroke-width="1"/><g stroke="#6b5844" stroke-width="1.5" opacity=".55" stroke-linecap="round"><line x1="30.4" y1="40" x2="33.6" y2="40"/><line x1="30.6" y1="52" x2="33.2" y2="52"/><line x1="31" y1="63" x2="34" y2="63"/></g>`;
  const canopy = kind==="eik" ? `<g fill="${c}"><circle cx="32" cy="29" r="19"/><circle cx="15" cy="37" r="12"/><circle cx="49" cy="37" r="12"/><circle cx="23" cy="19" r="11"/><circle cx="41" cy="19" r="11"/></g>`
    : kind==="iep" ? `<g fill="${c}"><circle cx="32" cy="19" r="13"/><circle cx="18" cy="24" r="10"/><circle cx="46" cy="24" r="10"/><circle cx="26" cy="35" r="8"/><circle cx="38" cy="35" r="8"/></g>`
    : `<g fill="${c}"><ellipse cx="32" cy="22" rx="11" ry="15"/><circle cx="32" cy="9" r="8"/><circle cx="22" cy="27" r="6.5" opacity=".85"/><circle cx="42" cy="27" r="6.5" opacity=".85"/></g>`;
  let content;
  if(season==="winter"){
    const branches = kind==="eik" ? `<path d="M32 47 L20 30 M20 30 L12 24 M20 30 L22 18 M32 47 L44 30 M44 30 L52 24 M44 30 L42 18 M32 47 L32 22"/>`
      : kind==="iep" ? `<path d="M32 40 L22 22 M22 22 L16 14 M32 40 L42 22 M42 22 L48 14 M32 40 L32 12"/>`
      : `<path d="M32 28 L25 14 M32 28 L39 14 M32 28 L32 7 M32 20 L24 16 M32 20 L40 16"/>`;
    const snow = `<g fill="#ffffff"><circle cx="20" cy="29" r="2.4"/><circle cx="44" cy="29" r="2.4"/><circle cx="32" cy="16" r="2.4"/></g><ellipse cx="32" cy="73" rx="17" ry="3" fill="#ffffff" opacity=".92"/>`;
    content = `${trunk}<g stroke="var(--bark)" stroke-width="2.3" fill="none" stroke-linecap="round">${branches}</g>${snow}`;
  } else if(season==="lente"){
    content = `${trunk}${canopy}<g fill="#f4c6d6"><circle cx="22" cy="20" r="2.4"/><circle cx="41" cy="22" r="2.4"/><circle cx="32" cy="13" r="2.4"/><circle cx="28" cy="31" r="2"/><circle cx="38" cy="30" r="2"/></g>`;
  } else { content = `${trunk}${canopy}`; }
  return `<svg width="58" height="68" viewBox="0 0 64 76" aria-hidden="true">${content}</svg>`;}

const treesEl=document.getElementById("trees");
function toggleHome(name){ if(state.home[name]){state.home[name]=false;state.away[name]="";} else {state.home[name]=true;} renderTrees(); persistHome(name); }
function renderTrees(){
  treesEl.innerHTML="";
  people.forEach(p=>{const card=document.createElement("div");card.className="tree-card";card.dataset.home=String(state.home[p.name]);
    card.setAttribute("role","button");card.tabIndex=0;card.setAttribute("aria-pressed",String(state.home[p.name]));
    card.innerHTML=`${tree(p.tree,p.color,season)}<span class="tree-name">${p.name}</span>`;
    card.addEventListener("click",()=>toggleHome(p.name));
    card.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();toggleHome(p.name);}});
    if(state.home[p.name]){const pill=document.createElement("span");pill.className="status-pill";pill.textContent="thuis";card.appendChild(pill);}
    else{const inp=document.createElement("input");inp.className="away";inp.type="text";inp.placeholder="weg";inp.value=state.away[p.name]||"";
      ["click","mousedown","keydown"].forEach(ev=>inp.addEventListener(ev,e=>e.stopPropagation()));
      inp.addEventListener("input",()=>state.away[p.name]=inp.value);
      inp.addEventListener("change",()=>persistAway(p.name,inp.value));card.appendChild(inp);}
    treesEl.appendChild(card);});
}
renderTrees();

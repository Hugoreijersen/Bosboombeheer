// De Bosboom — boodschappen, recepten en quotes.
/* boodschappen */
const shopList=document.getElementById("shopList");
function renderShop(){shopList.innerHTML=state.shopping.map((s,i)=>`<div class="litem ${s.done?"done":""}"><input class="chk" type="checkbox" data-i="${i}" ${s.done?"checked":""}><span class="txt2">${esc(s.text)}</span><button class="iconbtn" data-del="${i}" aria-label="Verwijder">✕</button></div>`).join("")||`<div class="litem"><span class="txt2" style="color:var(--muted)">Lijst is leeg.</span></div>`;
  shopList.querySelectorAll(".chk").forEach(c=>c.addEventListener("change",()=>{const s=state.shopping[+c.dataset.i];s.done=c.checked;persistShopToggle(s.id,s.done);renderShop();}));
  shopList.querySelectorAll("[data-del]").forEach(b=>b.addEventListener("click",()=>{const s=state.shopping[+b.dataset.del];persistShopDel(s.id);state.shopping.splice(+b.dataset.del,1);renderShop();}));}
async function addShop(){const el=document.getElementById("shopInput"),v=el.value.trim();if(!v)return;const item={text:v,done:false};state.shopping.push(item);el.value="";renderShop();item.id=await persistShopAdd(v);}
document.getElementById("shopAdd").addEventListener("click",addShop);
document.getElementById("shopInput").addEventListener("keydown",e=>{if(e.key==="Enter")addShop();});
renderShop();

/* recepten */
const recipeList=document.getElementById("recipeList"),recipeForm=document.getElementById("recipeForm");
function renderRecipes(){recipeList.innerHTML=state.recipes.map((r,i)=>`<details class="recipe"><summary>${esc(r.title)} ${r.time?`<span class="time">⏱ ${esc(r.time)} min</span>`:""}<span class="chev">›</span></summary>
  <div class="recipe-body"><div><h4>Ingrediënten</h4><ul>${r.ing.map(x=>`<li>${esc(x)}</li>`).join("")}</ul></div>
  <div><h4>Bereidingswijze</h4><div class="steps">${esc(r.steps)}</div></div>
  <button class="iconbtn recipe-del" data-del="${i}" aria-label="Verwijder">✕</button></div></details>`).join("")||`<div class="litem"><span class="txt2" style="color:var(--muted)">Nog geen recepten.</span></div>`;
  recipeList.querySelectorAll("[data-del]").forEach(b=>b.addEventListener("click",()=>{const r=state.recipes[+b.dataset.del];persistRecipeDel(r.id);state.recipes.splice(+b.dataset.del,1);renderRecipes();}));}
document.getElementById("addRecipe").addEventListener("click",()=>{recipeForm.hidden=false;document.getElementById("rfTitle").focus();});
document.getElementById("rfCancel").addEventListener("click",()=>{recipeForm.hidden=true;clearRf();});
document.getElementById("rfSave").addEventListener("click",()=>{const t=document.getElementById("rfTitle").value.trim();if(!t)return;
  const time=document.getElementById("rfTime").value.trim().replace(/[^0-9]/g,"");
  const ing=document.getElementById("rfIng").value.split("\n").map(x=>x.trim()).filter(Boolean);
  const steps=document.getElementById("rfSteps").value.trim();
  const item={title:t,time,ing,steps};state.recipes.push(item);clearRf();recipeForm.hidden=true;renderRecipes();persistRecipeAdd(item).then(id=>{item.id=id;});});
function clearRf(){["rfTitle","rfTime","rfIng","rfSteps"].forEach(id=>document.getElementById(id).value="");}
renderRecipes();

/* quotes (met datum) */
const quoteList=document.getElementById("quoteList"),qotd=document.getElementById("qotd");
const qIndex=()=>state.quotes.length?((TODAY.getDate()+TODAY.getMonth()*31)%state.quotes.length):-1;
function renderQOTD(){const i=qIndex();qotd.innerHTML=i<0?`<div class="qotd-empty">Nog geen quotes — voeg er een toe.</div>`:
  `<blockquote class="qotd">“${esc(state.quotes[i].text)}”<span class="by">— ${esc(state.quotes[i].by||"onbekend")}${state.quotes[i].date?` · ${esc(state.quotes[i].date)}`:""}</span></blockquote>`;}
function renderQuotes(){quoteList.innerHTML=state.quotes.map((q,i)=>`<div class="litem quote"><span class="txt2">“${esc(q.text)}”<span class="by">— ${esc(q.by||"onbekend")}${q.date?` · ${esc(q.date)}`:""}</span></span><button class="iconbtn" data-del="${i}" aria-label="Verwijder">✕</button></div>`).join("")||`<div class="litem"><span class="txt2" style="color:var(--muted)">Nog geen quotes.</span></div>`;
  quoteList.querySelectorAll("[data-del]").forEach(b=>b.addEventListener("click",()=>{const q=state.quotes[+b.dataset.del];persistQuoteDel(q.id);state.quotes.splice(+b.dataset.del,1);renderQuotes();renderQOTD();}));}
async function addQuote(){const t=document.getElementById("qText").value.trim();if(!t)return;const by=document.getElementById("qBy").value.trim();
  const item={text:t,by,date:fmt(TODAY)};state.quotes.unshift(item);document.getElementById("qText").value="";document.getElementById("qBy").value="";renderQuotes();renderQOTD();item.id=await persistQuoteAdd(t,by);}
document.getElementById("qAdd").addEventListener("click",addQuote);
document.getElementById("qText").addEventListener("keydown",e=>{if(e.key==="Enter")addQuote();});
const histWrap=document.getElementById("histWrap"),toggleHist=document.getElementById("toggleHist");
toggleHist.addEventListener("click",()=>{histWrap.hidden=!histWrap.hidden;toggleHist.textContent=histWrap.hidden?"Alle quotes":"Verberg geschiedenis";});
renderQuotes();renderQOTD();

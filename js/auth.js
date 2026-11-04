// De Bosboom — login, boom claimen, wachtwoord herstellen. Start de app; wordt als laatste geladen.
/* ---- Login / account / boom-claim ---- */
const authEl=document.getElementById("auth");
const elLogin=document.getElementById("authLogin"), elClaim=document.getElementById("authClaim");
const emailEl=document.getElementById("authEmail"), passEl=document.getElementById("authPass");
const errEl=document.getElementById("authErr"), goEl=document.getElementById("authGo"),
      switchEl=document.getElementById("authSwitch"), titleEl=document.getElementById("authTitle");
let authMode="in";
const showErr=m=>{errEl.classList.remove("ok");errEl.textContent=m||"";errEl.hidden=!m;};
function transErr(m){ if(/Invalid login/i.test(m))return "E-mail of wachtwoord klopt niet."; if(/already registered/i.test(m))return "Dit e-mailadres heeft al een account."; if(/at least 6/i.test(m))return "Wachtwoord: minstens 6 tekens."; if(/Email not confirmed/i.test(m))return "Bevestig eerst je e-mail (check je mail)."; return m; }
switchEl.addEventListener("click",()=>{authMode=authMode==="in"?"up":"in";
  titleEl.textContent=authMode==="in"?"Inloggen":"Account maken";
  goEl.textContent=authMode==="in"?"Inloggen":"Account maken";
  switchEl.textContent=authMode==="in"?"Nog geen account? Maak er een":"Al een account? Inloggen";
  passEl.autocomplete=authMode==="in"?"current-password":"new-password";showErr("");});
goEl.addEventListener("click",doAuth);
passEl.addEventListener("keydown",e=>{if(e.key==="Enter")doAuth();});
async function doAuth(){
  showErr(""); goEl.disabled=true;
  const email=emailEl.value.trim(), pass=passEl.value;
  if(!email||!pass){showErr("Vul e-mail en wachtwoord in.");goEl.disabled=false;return;}
  try{
    const user=authMode==="up" ? await db.auth.signUp(email,pass) : await db.auth.signIn(email,pass);
    if(!user){showErr("Account aangemaakt. Check je mail om te bevestigen, log daarna in.");authMode="in";goEl.disabled=false;return;}
    await afterLogin();
  }catch(e){showErr(e.code==="login"?transErr(e.message):"Er ging iets mis: "+e.message);goEl.disabled=false;}
}
async function afterLogin(){
  const user=await db.auth.user();
  const [prof]=await db.list("profiles",{where:{id:user.id}});
  if(prof&&prof.resident_id){ myResidentId=prof.resident_id; await startApp(); }
  else { await showClaim(); }
}
async function showClaim(){
  elLogin.hidden=true; elClaim.hidden=false;
  const taken=await db.list("profiles");
  const used=new Set(taken.map(r=>r.resident_id).filter(Boolean));
  const host=document.getElementById("claimTrees"); host.innerHTML="";
  people.forEach(p=>{const id=nameToId(p.name);const b=document.createElement("button");b.className="claim-tree";b.disabled=used.has(id);
    b.innerHTML=`${tree(p.tree,p.color,season)}<span>${p.name}</span>`;
    b.addEventListener("click",async()=>{
      const user=await db.auth.user();
      try{ await db.upsert("profiles",{id:user.id,resident_id:id},["id"]); }
      catch(e){showErr("Die boom is net geclaimd — kies een andere.");showClaim();return;}
      myResidentId=id; await startApp();
    });
    host.appendChild(b);});
}
async function startApp(){ await loadAll(); renderAll(); subscribeLive(); authEl.hidden=true; document.getElementById("logoutBtn").hidden=false; }

/* ---- Wachtwoord vergeten / opnieuw instellen ---- */
const forgotEl=document.getElementById("authForgot");
forgotEl.addEventListener("click",async()=>{
  const email=emailEl.value.trim();
  if(!email){showErr("Vul eerst je e-mail in, dan sturen we een resetlink.");return;}
  try{ await db.auth.resetPassword(email); }catch(e){showErr(transErr(e.message));return;}
  errEl.classList.add("ok");errEl.hidden=false;errEl.textContent="Resetlink verstuurd — check je mail.";
});
// Als iemand via de resetlink terugkomt: nieuw wachtwoord laten instellen.
const recoverPanel=document.getElementById("authRecover"), recoverPass=document.getElementById("recoverPass"),
      recoverErr=document.getElementById("recoverErr"), recoverGo=document.getElementById("recoverGo");
db.auth.onRecovery(()=>{ authEl.hidden=false; elLogin.hidden=true; elClaim.hidden=true; recoverPanel.hidden=false; });
recoverGo.addEventListener("click",async()=>{
  const pass=recoverPass.value;
  if(!pass||pass.length<6){recoverErr.hidden=false;recoverErr.textContent="Minstens 6 tekens.";return;}
  try{ await db.auth.setPassword(pass); }catch(e){recoverErr.hidden=false;recoverErr.textContent=transErr(e.message);return;}
  recoverPanel.hidden=true; await afterLogin();
});
// Uitloggen
document.getElementById("logoutBtn").addEventListener("click",async()=>{ await db.auth.signOut(); location.reload(); });

// Al ingelogd? Sla login over.
(async function(){ try{ if(await db.auth.user()) await afterLogin(); }catch(e){ showErr("Verbinding mislukt: "+e.message); } })();

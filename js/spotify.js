// De Bosboom — Spotify-afstandsbediening in het Radio-tabblad (alleen het huisaccount).
// De Pi speelt zelf geen Spotify (te zwaar, en Spotify laat het niet toe). Dit is een afstandsbediening:
// je ziet wat er speelt en bedient een speaker die zelf Spotify kan, zoals de Google Nest.
// De server praat met Spotify (pb_hooks/spotify_lib.js); hier staat alleen het scherm.
// Koppelen doe je één keer via https (berkeikiep.nl), want Spotify stuurt je alleen daarheen terug.
const spotify=(()=>{
  const SCOPES="user-read-playback-state user-modify-playback-state user-read-currently-playing playlist-read-private playlist-read-collaborative";
  const KEY="bosboom-spotify", POLL_MS=5000;
  const REDIRECT=location.origin+"/";
  const canLink=location.protocol==="https:"||location.hostname==="127.0.0.1";
  let st=null, lists=null, target="", busy=false, failed=false;

  const host=()=>document.getElementById("spotify");
  const visible=()=>isHuis&&!document.hidden&&!document.querySelector('[data-view="radio"]').hidden;
  const b64=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
  const rnd=n=>{const a=new Uint8Array(n);crypto.getRandomValues(a);return b64(a);};

  async function refresh(){
    if(!isHuis)return;
    try{ st=await db.call("spotify/state"); failed=false; }
    catch(e){ if(e.code==="spotify_opnieuw_koppelen"&&st)st=Object.assign({},st,{connected:false,player:null,devices:[]}); else failed=true; }
    if(st&&st.connected&&!lists) lists=await db.call("spotify/playlists").catch(()=>null);
    if(st&&!st.connected) lists=null;
    render();
  }
  async function cmd(action,extra){
    if(busy)return; busy=true;
    try{
      await db.call("spotify/cmd",Object.assign({action},extra||{}));
      if(action==="play"||action==="transfer")radio.stop();   // niet twee dingen door elkaar
    }catch(e){showError(e);}
    busy=false; setTimeout(refresh,700);   // Spotify heeft even nodig voor de nieuwe stand klopt
  }
  // De radio gaat aan: Spotify op pauze (als het speelt). Lukt het niet, dan is dat niet erg.
  function yieldToRadio(){ if(st&&st.player&&st.player.is_playing){ st.player.is_playing=false; db.call("spotify/cmd",{action:"pause"}).catch(()=>{}); render(); } }

  // --- koppelen (één keer) ---
  async function startLogin(){
    const verifier=rnd(48), state=rnd(12);
    const hash=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(verifier)));
    try{sessionStorage.setItem(KEY,JSON.stringify({verifier,state}));}catch(e){}
    location.href="https://accounts.spotify.com/authorize?"+new URLSearchParams({client_id:st.client_id,response_type:"code",
      redirect_uri:REDIRECT,code_challenge_method:"S256",code_challenge:b64(hash),state,scope:SCOPES});
  }
  // Terug van Spotify (…/?code=…&state=…): de code naar de server, en de adresbalk weer netjes.
  let returned=false;
  async function finishLogin(){
    if(returned||!isHuis)return; returned=true;
    const p=new URLSearchParams(location.search);
    if(!p.has("state")||!(p.has("code")||p.has("error")))return;
    let saved=null; try{saved=JSON.parse(sessionStorage.getItem(KEY));sessionStorage.removeItem(KEY);}catch(e){}
    history.replaceState(null,"",location.pathname+"#radio");
    if(!saved||saved.state!==p.get("state"))return;
    if(p.has("error")){toast("Spotify is niet gekoppeld.","err");}
    else{
      try{ await db.call("spotify/connect",{code:p.get("code"),verifier:saved.verifier,redirect_uri:REDIRECT}); toast("Spotify is gekoppeld."); }
      catch(e){showError(e);}
    }
    showTab("radio");
  }

  function render(){
    const el=host(); if(!el)return;
    if(!isHuis){el.innerHTML="";return;}
    if(typing()&&el.contains(document.activeElement))return;   // niet onder je vingers wegtekenen
    if(!st){ el.innerHTML=`<div class="empty">${failed?"Spotify reageert nu niet.":"Laden…"}</div>`; return; }
    if(!st.connected){
      if(!canLink){ el.innerHTML=`<div class="empty">Koppel Spotify één keer vanaf een telefoon of laptop: ga naar <b>berkeikiep.nl</b>, log in met het huisaccount en open Radio.</div>`; return; }
      el.innerHTML=`<div class="panel">
          <label class="field">Client ID van je Spotify-app<input class="txt" id="spId" type="text" autocomplete="off" spellcheck="false" maxlength="64" value="${esc(st.client_id||"")}" placeholder="32 tekens"></label>
          <div class="row-sub">Maak de app op developer.spotify.com/dashboard, met als Redirect URI: <b>${esc(REDIRECT)}</b></div>
          <div class="actions"><button class="btn solid" data-link>Koppelen met Spotify</button></div>
        </div>`;
      el.querySelector("[data-link]").addEventListener("click",async()=>{
        const id=el.querySelector("#spId").value.trim();
        try{ await db.call("spotify/config",{client_id:id}); st.client_id=id; await startLogin(); }catch(e){showError(e);}
      });
      return;
    }
    const p=st.player, devs=st.devices||[];
    if(!devs.some(d=>d.id===target)) target=(devs.find(d=>d.active)||devs[0]||{id:""}).id;
    const vol=p&&p.volume!=null?p.volume:null;
    const now=p&&p.title?`<span class="radio-name">${esc(p.title)}</span><span class="row-sub">${esc([p.artist,p.device_name].filter(Boolean).join(" · "))}</span>`
                        :`<span class="radio-name muted">Er speelt niets</span><span class="row-sub">Kies een afspeellijst, of start muziek in de Spotify-app</span>`;
    el.innerHTML=`<div class="sp-top"><div class="radio-now">${now}</div>
        <div class="sp-ctl"><button class="btn" data-a="prev" aria-label="Vorige">◀◀</button>
          <button class="btn solid" data-a="${p&&p.is_playing?"pause":"play"}" aria-label="${p&&p.is_playing?"Pauze":"Speel"}">${p&&p.is_playing?"❚❚":"▶"}</button>
          <button class="btn" data-a="next" aria-label="Volgende">▶▶</button></div></div>
      ${vol==null?"":`<div class="radio-vol sp-pad"><button class="btn" data-v="-10" aria-label="Zachter" ${vol<=0?"disabled":""}>−</button>
          <span class="radio-volbar" aria-label="Volume ${vol}%"><i style="width:${vol}%"></i></span>
          <button class="btn" data-v="10" aria-label="Harder" ${vol>=100?"disabled":""}>+</button></div>`}
      <div class="sp-sec">Speaker</div>
      ${devs.length?`<div class="chips sp-pad">${devs.map(d=>`<button class="chip" data-d="${esc(d.id)}" aria-pressed="${d.id===target}">${esc(d.name)}</button>`).join("")}</div>`
                   :`<div class="empty">Spotify ziet nu geen speaker. Start één keer muziek op de speaker vanuit de Spotify-app; daarna kun je hem hier bedienen.</div>`}
      ${lists&&lists.length?`<div class="sp-sec">Afspeellijsten</div><div class="sp-lists">${lists.map((l,i)=>`<button class="sp-list" data-l="${i}">${esc(l.name)}</button>`).join("")}</div>`:""}
      <div class="sp-foot"><button class="linkbtn rust" data-off>Ontkoppelen</button></div>`;
    el.querySelectorAll("[data-a]").forEach(b=>b.addEventListener("click",()=>cmd(b.dataset.a,b.dataset.a==="play"&&!p&&target?{device_id:target}:{})));
    el.querySelectorAll("[data-v]").forEach(b=>b.addEventListener("click",()=>cmd("volume",{percent:Math.max(0,Math.min(100,vol+Number(b.dataset.v)))})));
    el.querySelectorAll("[data-d]").forEach(b=>b.addEventListener("click",()=>{ target=b.dataset.d; const d=devs.find(x=>x.id===target); if(d&&!d.active)cmd("transfer",{device_id:target}); else render(); }));
    el.querySelectorAll("[data-l]").forEach(b=>b.addEventListener("click",()=>cmd("play",Object.assign({uri:lists[Number(b.dataset.l)].uri},target?{device_id:target}:{}))));
    const off=el.querySelector("[data-off]");
    off.addEventListener("click",()=>confirmTap(off,async()=>{ await db.call("spotify/disconnect").catch(showError); lists=null; refresh(); }));
  }

  // Alleen bijwerken zolang het Radio-tabblad openstaat (de Pi heeft weinig over).
  setInterval(()=>{ if(visible()&&st&&st.connected&&!busy)refresh(); },POLL_MS);
  const openRadio=tabHooks.radio;
  tabHooks.radio=()=>{ openRadio(); if(isHuis)refresh(); };
  registerModule({name:"spotify",tables:[],load:finishLogin,render});
  return {refresh,yieldToRadio};
})();

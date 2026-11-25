// De Bosboom — Radio: internetradio en podcasts op de speaker van het gedeelde scherm.
// Alleen zichtbaar met het huisaccount (het scherm in huis). Het geluid komt uit het apparaat
// waarop je tikt: op de Pi is dat de speaker die daar als standaard-uitgang staat (bluetooth).
// Eén <audio>-element voor de hele app, dus het geluid speelt door als je naar een ander tabblad gaat.
// Podcasts: de Pi haalt de RSS-feed op (pb_hooks/podcast_lib.js), de mp3 speelt de browser zelf.
const radio=(()=>{
  const TALK=[
    {id:"radio1",name:"NPO Radio 1",url:"https://icecast.omroep.nl/radio1-bb-mp3"},
    {id:"bnr",name:"BNR Nieuwsradio",url:"https://playerservices.streamtheworld.com/api/livestream-redirect/BNR_NIEUWSRADIOAAC.aac"},
  ];
  const MUSIC=[
    {id:"radio2",name:"NPO Radio 2",url:"https://icecast.omroep.nl/radio2-bb-mp3"},
    {id:"3fm",name:"NPO 3FM",url:"https://icecast.omroep.nl/3fm-bb-mp3"},
    {id:"klassiek",name:"NPO Klassiek",url:"https://icecast.omroep.nl/radio4-bb-mp3"},
    {id:"radio5",name:"NPO Radio 5",url:"https://icecast.omroep.nl/radio5-bb-mp3"},
    {id:"funx",name:"FunX",url:"https://icecast.omroep.nl/funx-bb-mp3"},
    {id:"qmusic",name:"Qmusic",url:"https://stream.qmusic.nl/qmusic/mp3"},
    {id:"538",name:"Radio 538",url:"https://playerservices.streamtheworld.com/api/livestream-redirect/RADIO538.mp3"},
    {id:"sky",name:"Sky Radio",url:"https://playerservices.streamtheworld.com/api/livestream-redirect/SKYRADIO.mp3"},
    {id:"radio10",name:"Radio 10",url:"https://playerservices.streamtheworld.com/api/livestream-redirect/RADIO10.mp3"},
    {id:"veronica",name:"Veronica",url:"https://playerservices.streamtheworld.com/api/livestream-redirect/VERONICA.mp3"},
    {id:"100nl",name:"100% NL",url:"https://stream.100p.nl/100pctnl.mp3"},
  ];
  const STATIONS=TALK.concat(MUSIC);
  // Dezelfde id's als in pb_hooks/podcast_lib.js (FEEDS).
  const PODCASTS=[
    {id:"sven-op-1",name:"Sven op 1"},
    {id:"oog-op-morgen",name:"Met het Oog op Morgen"},
    {id:"nooit-meer-slapen",name:"Nooit meer slapen"},
  ];
  const VOL_KEY="bosboom-radio-vol", POS_KEY="bosboom-podcast-pos", STEP=0.1, MAX_RETRY=5, SKIP=30;
  const audio=new Audio(); audio.preload="none";
  try{const v=parseFloat(localStorage.getItem(VOL_KEY));if(v>=0&&v<=1)audio.volume=v;}catch(e){}
  // current: {id,name,url,live} of voor een aflevering ook {pod,ep}.  status: uit | laden | speelt | pauze
  let current=null, status="uit", retries=0, retryTimer=null, resumeAt=0;
  let openPod=null, feeds={}, feedBusy=false;   // podcastlijst die open staat, opgehaalde feeds

  // --- waar was je gebleven (per aflevering, alleen op dit apparaat) ---
  function positions(){ try{return JSON.parse(localStorage.getItem(POS_KEY))||{};}catch(e){return {};} }
  function savePos(){
    if(!current||current.live||!audio.duration)return;
    const p=positions(), t=audio.currentTime;
    if(t<15||t>audio.duration-30)delete p[current.url]; else p[current.url]=Math.floor(t);
    const keys=Object.keys(p); if(keys.length>30)delete p[keys[0]];
    try{localStorage.setItem(POS_KEY,JSON.stringify(p));}catch(e){}
  }

  function start(){
    clearTimeout(retryTimer);
    status="laden"; audio.src=current.url;
    if(!current.live&&resumeAt)audio.currentTime=resumeAt;
    audio.play().catch(e=>{ if(e&&e.name==="AbortError")return; lost(); });
    render();
  }
  function begin(item){
    savePos(); current=item; retries=0; resumeAt=item.live?0:(positions()[item.url]||0);
    start(); if(typeof spotify!=="undefined")spotify.yieldToRadio();
  }
  function play(id){ const s=STATIONS.find(s=>s.id===id); if(s)begin(Object.assign({live:true},s)); }
  function playEpisode(podId,i){
    const pod=PODCASTS.find(p=>p.id===podId), ep=feeds[podId]&&feeds[podId].episodes[i];
    if(pod&&ep)begin({id:podId+"#"+i,name:pod.name,ep:ep.title,url:ep.url,live:false,pod:podId});
  }
  function stop(){
    if(!current&&status==="uit")return;
    savePos(); clearTimeout(retryTimer); current=null; status="uit";
    audio.pause(); audio.removeAttribute("src"); audio.load();   // stopt ook het downloaden van de stream
    render();
  }
  function toggle(){
    if(!current)return;
    if(status==="pauze"){ status="laden"; audio.play().catch(()=>lost()); }
    else{ audio.pause(); status="pauze"; savePos(); }
    render();
  }
  function skip(sec){
    if(!current||current.live||!audio.duration)return;
    audio.currentTime=Math.min(audio.duration-1,Math.max(0,audio.currentTime+sec)); tick();
  }
  // Een stream valt wel eens weg (wifi, zender). Een paar keer zelf opnieuw proberen, dan pas opgeven.
  function lost(){
    if(!current)return;
    clearTimeout(retryTimer);
    if(retries>=MAX_RETRY){ const n=current.name; stop(); render(); toast(n+" doet het nu niet.","err"); return; }
    if(!current.live&&audio.currentTime)resumeAt=audio.currentTime;   // aflevering: verder waar hij was
    retries++; status="laden"; render();
    retryTimer=setTimeout(()=>{ if(current)start(); },3000*retries);
  }
  audio.addEventListener("playing",()=>{ status="speelt"; retries=0; render(); });
  audio.addEventListener("waiting",()=>{ if(current&&status!=="pauze"){status="laden";render();} });
  audio.addEventListener("error",()=>{ if(current)lost(); });
  // Een livestream die "klaar" is, is weggevallen. Een aflevering die klaar is, is gewoon uit.
  audio.addEventListener("ended",()=>{ if(!current)return; if(current.live)lost(); else{ resumeAt=0; audio.currentTime=0; savePos(); stop(); } });
  audio.addEventListener("timeupdate",tick);
  setInterval(()=>{ if(current&&!current.live&&status==="speelt")savePos(); },15000);

  function setVol(d){
    audio.volume=Math.min(1,Math.max(0,Math.round((audio.volume+d)*10)/10));
    try{localStorage.setItem(VOL_KEY,String(audio.volume));}catch(e){}
    render();
  }

  // --- podcasts ---
  async function openPodcast(id){
    openPod=id; render();
    const f=feeds[id];
    if(f&&Date.now()-f.at<10*60*1000)return;
    feedBusy=true; render();
    try{ feeds[id]=Object.assign({at:Date.now()},await db.call("podcast/"+id)); }
    catch(e){ if(!f)openPod=null; showError(e); }
    feedBusy=false; render();
  }

  const clock=s=>{ s=Math.max(0,Math.floor(s||0)); const h=Math.floor(s/3600), m=Math.floor(s/60)%60, x=String(s%60).padStart(2,"0"); return h?`${h}:${String(m).padStart(2,"0")}:${x}`:`${m}:${x}`; };
  const day=iso=>{ if(!iso)return ""; const d=new Date(iso); return d.toLocaleDateString("nl-NL",{weekday:"short",day:"numeric",month:"short"}); };
  // Alleen de tijd en de balk bijwerken (niet alles opnieuw tekenen: de Pi is traag).
  function tick(){
    const el=document.getElementById("radioTime"); if(!el||!current||current.live)return;
    const d=audio.duration||0, t=audio.currentTime||0;
    el.textContent=d?`${clock(t)} / ${clock(d)}`:clock(t);
    const bar=document.getElementById("radioProg"); if(bar)bar.style.width=(d?Math.min(100,t/d*100):0)+"%";
  }

  function render(){
    const tab=document.querySelector('.tabbar [data-tab="radio"]'), host=document.getElementById("radio");
    if(!tab||!host)return;
    tab.hidden=!isHuis;
    document.getElementById("radioBadge").hidden=!current;
    if(!isHuis){ if(current)stop(); host.innerHTML=""; return; }
    const pct=Math.round(audio.volume*100);
    const sub=status==="pauze"?"Gepauzeerd":status==="speelt"?(current&&current.live?"Speelt nu":""):"Verbinden…";
    const now=current?`<div class="radio-now"><span class="radio-name">${esc(current.name)}</span>
          ${current.ep?`<span class="radio-ep">${esc(current.ep)}</span>`:""}<span class="row-sub">${sub}${current.live?"":` <span id="radioTime"></span>`}</span></div>`
                     :`<div class="radio-now"><span class="radio-name muted">Radio staat uit</span><span class="row-sub">Tik op een zender of podcast</span></div>`;
    const seek=current&&!current.live?`<div class="radio-seek">
          <button class="btn" data-skip="-1" aria-label="${SKIP} seconden terug">−${SKIP}s</button>
          <button class="btn solid" data-toggle>${status==="pauze"?"▶ Verder":"❚❚ Pauze"}</button>
          <button class="btn" data-skip="1" aria-label="${SKIP} seconden vooruit">+${SKIP}s</button>
          <span class="radio-volbar radio-prog"><i id="radioProg" style="width:0"></i></span></div>`:"";
    const tiles=list=>`<div class="radio-grid">${list.map(s=>`<button class="radio-tile" data-st="${s.id}" aria-pressed="${!!current&&current.id===s.id}">${esc(s.name)}</button>`).join("")}</div>`;
    let pods;
    if(openPod){
      const pod=PODCASTS.find(p=>p.id===openPod), f=feeds[openPod];
      const eps=f?f.episodes.map((ep,i)=>{
        const on=!!current&&current.url===ep.url, pos=positions()[ep.url];
        return `<button class="radio-ep-row" data-ep="${i}" aria-pressed="${on}"><span class="radio-ep-title">${esc(ep.title)}</span>
          <span class="row-sub">${esc(day(ep.date))}${ep.min?` · ${ep.min} min`:""}${pos?` · nog ${Math.max(1,ep.min-Math.round(pos/60))} min`:""}</span></button>`;
      }).join(""):"";
      pods=`<div class="radio-pod-head"><button class="btn" data-back>← Podcasts</button><span class="radio-name">${esc(pod.name)}</span></div>
        ${f?`<div class="radio-eps">${eps}</div>`:`<div class="empty">${feedBusy?"Afleveringen laden…":""}</div>`}`;
    }else{
      pods=`<div class="radio-grid">${PODCASTS.map(p=>`<button class="radio-tile" data-pod="${p.id}" aria-pressed="${!!current&&current.pod===p.id}">${esc(p.name)}</button>`).join("")}</div>`;
    }
    host.innerHTML=`<div class="card radio-player">${now}
        <button class="btn solid radio-stop" data-stop ${current?"":"disabled"}>■ Stop</button>${seek}
        <div class="radio-vol"><button class="btn" data-vol="-1" aria-label="Zachter" ${pct<=0?"disabled":""}>−</button>
          <span class="radio-volbar" aria-label="Volume ${pct}%"><i style="width:${pct}%"></i></span>
          <button class="btn" data-vol="1" aria-label="Harder" ${pct>=100?"disabled":""}>+</button></div>
      </div>
      <h3 class="radio-h">Praatradio</h3>${tiles(TALK)}
      <h3 class="radio-h">Podcasts</h3>${pods}
      <h3 class="radio-h">Muziek</h3>${tiles(MUSIC)}`;
    host.querySelector("[data-stop]").addEventListener("click",stop);
    host.querySelectorAll("[data-vol]").forEach(b=>b.addEventListener("click",()=>setVol(STEP*Number(b.dataset.vol))));
    host.querySelectorAll("[data-skip]").forEach(b=>b.addEventListener("click",()=>skip(SKIP*Number(b.dataset.skip))));
    host.querySelectorAll("[data-toggle]").forEach(b=>b.addEventListener("click",toggle));
    host.querySelectorAll("[data-st]").forEach(b=>b.addEventListener("click",()=>{ if(current&&current.id===b.dataset.st)stop(); else play(b.dataset.st); }));
    host.querySelectorAll("[data-pod]").forEach(b=>b.addEventListener("click",()=>openPodcast(b.dataset.pod)));
    host.querySelectorAll("[data-back]").forEach(b=>b.addEventListener("click",()=>{ openPod=null; render(); }));
    host.querySelectorAll("[data-ep]").forEach(b=>b.addEventListener("click",()=>{
      const ep=feeds[openPod].episodes[Number(b.dataset.ep)];
      if(current&&current.url===ep.url)toggle(); else playEpisode(openPod,Number(b.dataset.ep));
    }));
    tick();
  }
  // Alleen het huisaccount mag hier komen (ook via #radio in de adresbalk).
  tabHooks.radio=()=>{ if(!isHuis){showTab("huis");return;} render(); };
  registerModule({name:"radio",tables:[],load:async()=>{},render});
  return {play,stop,render,STATIONS,PODCASTS};
})();

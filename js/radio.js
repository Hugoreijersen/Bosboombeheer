// De Bosboom — Radio: internetradio op de speaker van het gedeelde scherm.
// Alleen zichtbaar met het huisaccount (het scherm in huis). Het geluid komt uit het apparaat
// waarop je tikt: op de Pi is dat de speaker die daar als standaard-uitgang staat (bluetooth).
// Eén <audio>-element voor de hele app, dus de muziek speelt door als je naar een ander tabblad gaat.
const radio=(()=>{
  const STATIONS=[
    {id:"radio1",name:"NPO Radio 1",url:"https://icecast.omroep.nl/radio1-bb-mp3"},
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
  const VOL_KEY="bosboom-radio-vol", STEP=0.1, MAX_RETRY=5;
  const audio=new Audio(); audio.preload="none";
  try{const v=parseFloat(localStorage.getItem(VOL_KEY));if(v>=0&&v<=1)audio.volume=v;}catch(e){}
  let current=null, status="uit", retries=0, retryTimer=null;   // status: uit | laden | speelt | fout

  function start(){
    clearTimeout(retryTimer);
    status="laden"; audio.src=current.url;
    audio.play().catch(e=>{ if(e&&e.name==="AbortError")return; lost(); });
    render();
  }
  function play(id){ current=STATIONS.find(s=>s.id===id)||null; retries=0; if(current)start(); }
  function stop(){
    clearTimeout(retryTimer); current=null; status="uit";
    audio.pause(); audio.removeAttribute("src"); audio.load();   // stopt ook het downloaden van de stream
    render();
  }
  // Een stream valt wel eens weg (wifi, zender). Een paar keer zelf opnieuw proberen, dan pas opgeven.
  function lost(){
    if(!current)return;
    clearTimeout(retryTimer);
    if(retries>=MAX_RETRY){ const n=current.name; stop(); status="fout"; render(); toast(n+" doet het nu niet.","err"); return; }
    retries++; status="laden"; render();
    retryTimer=setTimeout(()=>{ if(current)start(); },3000*retries);
  }
  audio.addEventListener("playing",()=>{ status="speelt"; retries=0; render(); });
  audio.addEventListener("waiting",()=>{ if(current){status="laden";render();} });
  audio.addEventListener("error",()=>{ if(current)lost(); });
  audio.addEventListener("ended",()=>{ if(current)lost(); });

  function setVol(d){
    audio.volume=Math.min(1,Math.max(0,Math.round((audio.volume+d)*10)/10));
    try{localStorage.setItem(VOL_KEY,String(audio.volume));}catch(e){}
    render();
  }

  function render(){
    const tab=document.querySelector('.tabbar [data-tab="radio"]'), host=document.getElementById("radio");
    if(!tab||!host)return;
    tab.hidden=!isHuis;
    document.getElementById("radioBadge").hidden=!current;
    if(!isHuis){ if(current)stop(); host.innerHTML=""; return; }
    const pct=Math.round(audio.volume*100);
    const now=current?`<div class="radio-now"><span class="radio-name">${esc(current.name)}</span><span class="row-sub">${status==="speelt"?"Speelt nu":"Verbinden…"}</span></div>`
                     :`<div class="radio-now"><span class="radio-name muted">Radio staat uit</span><span class="row-sub">Tik op een zender</span></div>`;
    host.innerHTML=`<div class="card radio-player">${now}
        <button class="btn solid radio-stop" data-stop ${current?"":"disabled"}>■ Stop</button>
        <div class="radio-vol"><button class="btn" data-vol="-1" aria-label="Zachter" ${pct<=0?"disabled":""}>−</button>
          <span class="radio-volbar" aria-label="Volume ${pct}%"><i style="width:${pct}%"></i></span>
          <button class="btn" data-vol="1" aria-label="Harder" ${pct>=100?"disabled":""}>+</button></div>
      </div>
      <div class="radio-grid">${STATIONS.map(s=>`<button class="radio-tile" data-st="${s.id}" aria-pressed="${!!current&&current.id===s.id}">${esc(s.name)}</button>`).join("")}</div>`;
    host.querySelector("[data-stop]").addEventListener("click",stop);
    host.querySelectorAll("[data-vol]").forEach(b=>b.addEventListener("click",()=>setVol(STEP*Number(b.dataset.vol))));
    host.querySelectorAll("[data-st]").forEach(b=>b.addEventListener("click",()=>{ if(current&&current.id===b.dataset.st)stop(); else play(b.dataset.st); }));
  }
  // Alleen het huisaccount mag hier komen (ook via #radio in de adresbalk).
  tabHooks.radio=()=>{ if(!isHuis){showTab("huis");return;} render(); };
  registerModule({name:"radio",tables:[],load:async()=>{},render});
  return {play,stop,render,STATIONS};
})();

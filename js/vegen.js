// De Bosboom — vegen om te scrollen op de kiosk.
// Het touchscreen van de Pi meldt zich als muis: slepen selecteert dan tekst in plaats van te
// scrollen. Hier maken we van slepen met de "muis" weer scrollen (met een beetje uitloop),
// alleen in kiosk-stand. Echte touch (telefoon) scrolt al vanzelf en blijft ongemoeid.
(()=>{
  const MOVE=8;              // pixels voordat een tik een veeg wordt
  const SKIP="input,textarea,select,.kb,[data-novegen]";
  const on=()=>typeof scherm!=="undefined"&&scherm.kiosk;
  let d=null, fling=0, eatClick=false;

  function scroller(t,axis){
    for(let el=t;el&&el!==document.documentElement;el=el.parentElement){
      if(el===document.body)break;
      const cs=getComputedStyle(el);
      if(axis==="y"&&/(auto|scroll)/.test(cs.overflowY)&&el.scrollHeight>el.clientHeight+1)return el;
      if(axis==="x"&&/(auto|scroll)/.test(cs.overflowX)&&el.scrollWidth>el.clientWidth+1)return el;
    }
    return axis==="y"?document.scrollingElement:null;
  }

  document.addEventListener("pointerdown",e=>{
    cancelAnimationFrame(fling);
    if(!on()||e.pointerType!=="mouse"||e.button!==0||e.target.closest(SKIP)){d=null;return;}
    d={x:e.clientX,y:e.clientY,t:e.target,el:null,axis:null,lastY:e.clientY,lastX:e.clientX,lastT:e.timeStamp,v:0};
  },true);

  document.addEventListener("pointermove",e=>{
    if(!d||!(e.buttons&1))return;
    const dx=e.clientX-d.x, dy=e.clientY-d.y;
    if(!d.axis){
      if(Math.max(Math.abs(dx),Math.abs(dy))<MOVE)return;
      d.axis=Math.abs(dy)>=Math.abs(dx)?"y":"x";
      d.el=scroller(d.t,d.axis)||(d.axis==="x"?scroller(d.t,"y"):null);
      if(d.el&&d.axis==="x"&&!(d.el.scrollWidth>d.el.clientWidth+1))d.axis="y";
      if(!d.el){d=null;return;}
      d.start=d.axis==="y"?d.el.scrollTop:d.el.scrollLeft;
      window.getSelection()?.removeAllRanges();
    }
    e.preventDefault();
    const pos=d.axis==="y"?e.clientY:e.clientX, last=d.axis==="y"?d.lastY:d.lastX;
    const dt=Math.max(1,e.timeStamp-d.lastT);
    d.v=(pos-last)/dt;                       // px per ms, voor de uitloop
    d.lastY=e.clientY; d.lastX=e.clientX; d.lastT=e.timeStamp;
    if(d.axis==="y")d.el.scrollTop=d.start-dy; else d.el.scrollLeft=d.start-dx;
  },{capture:true,passive:false});

  document.addEventListener("pointerup",e=>{
    if(!d)return;
    if(d.axis){
      eatClick=true; setTimeout(()=>{eatClick=false;},0);   // een veeg is geen tik
      // uitloop: nog even doorscrollen en langzaam stoppen
      const el=d.el, axis=d.axis; let v=-d.v*16;        // px per frame
      if(e.timeStamp-d.lastT>80)v=0;                     // stilgehouden voor loslaten
      const step=()=>{ if(Math.abs(v)<0.5)return;
        if(axis==="y")el.scrollTop+=v; else el.scrollLeft+=v;
        v*=0.92; fling=requestAnimationFrame(step); };
      fling=requestAnimationFrame(step);
    }
    d=null;
  },true);

  document.addEventListener("click",e=>{ if(eatClick){e.preventDefault();e.stopPropagation();eatClick=false;} },true);
  // Geen tekst of plaatjes meeslepen
  document.addEventListener("dragstart",e=>{ if(on())e.preventDefault(); },true);
})();

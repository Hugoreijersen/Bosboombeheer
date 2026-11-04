// De Bosboom — pagina's die over het startscherm schuiven (Statistieken, DeeldeDuit).
// Een module kan pageHooks[id] zetten: die draait elke keer dat de pagina opengaat.
const pageHooks={};
function openPage(id){document.getElementById(id).hidden=false;window.scrollTo(0,0);if(pageHooks[id])pageHooks[id]();}
function closePages(){document.querySelectorAll(".page").forEach(p=>p.hidden=true);}
document.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",()=>{b.closest(".page").hidden=true;}));
document.addEventListener("keydown",e=>{if(e.key==="Escape")closePages();});

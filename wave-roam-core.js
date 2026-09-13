const FALLBACKS=[
  {name:"PICK POCKET RADIO",city:"BERLIN",country:"GERMANY",tags:"INDEPENDENT / CULTURE / RADIO",lat:52.52,lon:13.405,url:"https://radio.pickpocketradio.org/stream.mp3",uuid:"PICK_POCKET_RADIO"},
  {name:"CASHMERE RADIO",city:"BERLIN",country:"GERMANY",tags:"EXPERIMENTAL / RADIO ART / COMMUNITY",lat:52.52,lon:13.405,url:"https://cashmereradio.out.airtime.pro/cashmereradio_b"}
];

const HOSTS=[
  "https://de1.api.radio-browser.info",
  "https://nl1.api.radio-browser.info",
  "https://at1.api.radio-browser.info",
  "https://fi1.api.radio-browser.info"
];

const TAGS=[
  "experimental","experimental","experimental",
  "sound art","sound art","radio art","radio art",
  "electroacoustic","electroacoustic","field recording","field recording",
  "noise","noise","drone","avant-garde","sound collage","industrial",
  "freeform","free radio","community radio","shortwave",
  "improvisation","experimental music","contemporary music","art radio",
  "independent","underground","ambient","electronic"
];

const EXPERIMENTAL_SIGNAL_RE=/(experimental|sound[ -]?art|radio[ -]?art|electroacoustic|electro-acoustic|field[ -]?record|noise|drone|avant[ -]?garde|sound[ -]?collage|industrial|freeform|free[ -]?radio|community[ -]?radio|shortwave|improvis|contemporary|art[ -]?radio|underground|ambient|electronic|diy|noncommercial|non-commercial|artist)/i;

const SEEN_KEY="wave_roam_seen_v1";
function loadSeen(){
  try{const a=JSON.parse(localStorage.getItem(SEEN_KEY)||"[]");return new Set(Array.isArray(a)?a:[])}catch(e){return new Set()}
}
function saveSeen(){
  try{const arr=[...seenGlobal].slice(-1500);localStorage.setItem(SEEN_KEY,JSON.stringify(arr))}catch(e){}
}
const seenGlobal=loadSeen();
const LAST100_KEY="wave_roam_last100_v1";
function loadLast100(){
  try{const a=JSON.parse(localStorage.getItem(LAST100_KEY)||"[]");return Array.isArray(a)?a.slice(-100):[]}catch(e){return []}
}
let last100=loadLast100();
function rememberStation(id){
  if(!id)return;
  last100=last100.filter(x=>x!==id);last100.push(id);last100=last100.slice(-100);
  try{localStorage.setItem(LAST100_KEY,JSON.stringify(last100))}catch(e){}
}
function heardWithinLast100(id){return !!id&&last100.includes(id)}
const ROUTES_KEY="wave_roam_routes_v1";
function loadRoutes(){
  try{const a=JSON.parse(localStorage.getItem(ROUTES_KEY)||"[]");return Array.isArray(a)?a:[]}catch(e){return []}
}
let previousRoutes=loadRoutes();
let routeSignature=[];
function saveRoute(){
  if(routeSignature.length<2)return;
  previousRoutes.push(routeSignature.join(">"));previousRoutes=previousRoutes.slice(-80);
  try{localStorage.setItem(ROUTES_KEY,JSON.stringify(previousRoutes))}catch(e){}
}
function routePrefixAlreadyUsed(candidateId){const proposed=[...routeSignature,candidateId].join(">");return previousRoutes.some(r=>r.startsWith(proposed))}

const playBtn=document.getElementById("playBtn");
const nextBtn=document.getElementById("nextBtn");
const stopBtn=document.getElementById("stopBtn");
const printBtn=document.getElementById("printBtn");
const liveLed=document.getElementById("liveLed");
const liveText=document.getElementById("liveText");
const fullscreenBtn=document.getElementById("fullscreenBtn");
const A=document.getElementById("audioA");
const B=document.getElementById("audioB");

let active=A,standby=B;
let started=false,startedAt=0,travelTimer=null,moveTimer=null;
let nextStation=null,currentStation=null;
let preparingNext=false;
let changingStation=false;
let history=[],recent=new Set();
let completedAfterLinz=0;
let pickPocketPlayed=false;
let journeyLog=[];
let stationEnteredAt=null;
let paused=false;
let pausedAt=0;
let totalPausedMs=0;
let journeySeed="";
let tagDeck=[];
let postcardRequestId=0;
let stationActivationId=0;

function newJourneySeed(){
  const bytes=new Uint32Array(4);crypto.getRandomValues(bytes);journeySeed=[...bytes].map(n=>n.toString(36)).join("-");
  tagDeck=[...TAGS];for(let i=tagDeck.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[tagDeck[i],tagDeck[j]]=[tagDeck[j],tagDeck[i]]}
}
function setState(mode){liveLed.className="led"+(mode==="loading"?" loading":mode==="ok"?" ok":mode==="err"?" err":"");liveText.textContent=mode==="loading"?"LOAD":mode==="ok"?"LIVE":mode==="err"?"ERROR":"READY"}
function fmt(ms){const s=Math.max(0,Math.floor(ms/1000));return `${String(Math.floor(s/3600)).padStart(2,"0")}:${String(Math.floor((s%3600)/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`}
function tick(){if(!started)return;const now=paused?pausedAt:Date.now();document.getElementById("travelClock").textContent=fmt(now-startedAt-totalPausedMs)}
function xy(lat,lon){return [((Number(lon)+180)/360)*620,((90-Number(lat))/180)*310]}
function drawRoute(){
  if(!history.length)return;
  const valid=history.filter(s=>Number.isFinite(Number(s.lat))&&Number.isFinite(Number(s.lon)));if(!valid.length)return;
  const pts=valid.map(s=>xy(s.lat,s.lon));let d=`M${pts[0][0]} ${pts[0][1]}`;
  for(let i=1;i<pts.length;i++){const [x,y]=pts[i],[px,py]=pts[i-1];d+=` Q${(px+x)/2} ${Math.min(py,y)-18} ${x} ${y}`}
  document.getElementById("routePath").setAttribute("d",d);
  document.getElementById("nodes").innerHTML=pts.slice(0,-1).map(([x,y])=>`<circle class="node" cx="${x}" cy="${y}" r="3"/>`).join("");
  const [x,y]=pts.at(-1),dot=document.getElementById("currentDot");dot.setAttribute("cx",x);dot.setAttribute("cy",y);dot.setAttribute("r","7");dot.style.opacity="0";
  requestAnimationFrame(()=>requestAnimationFrame(()=>{dot.style.transition="opacity .25s ease";dot.style.opacity="1"}));
  const lab=document.getElementById("mapLabel");lab.textContent=(currentStation?.city||currentStation?.country||"SIGNAL").toUpperCase();lab.setAttribute("x",Math.min(545,x+10));lab.setAttribute("y",Math.min(298,Math.max(16,y-8)));
}
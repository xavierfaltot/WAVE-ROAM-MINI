async function postcard(st, activationId){
  const requestId=++postcardRequestId;
  const place=(st.city||st.country||"world").trim();
  const img=document.getElementById("placeImage");
  img.removeAttribute("src");
  img.style.opacity=".18";
  const queries=[
    `${place} landscape people wide`,`${place} countryside people landscape`,`${place} river coast people panorama`,`${place} mountains landscape people`,`${place} rural life people wide`,`${place} street life people panoramic`,`${place} market people landscape`,`${place} public space people wide`
  ];
  async function searchOne(query){
    try{
      const q=encodeURIComponent(query);
      const url="https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch="+q+"&gsrnamespace=6&gsrlimit=8&prop=imageinfo&iiprop=url|size&iiurlwidth=1600&format=json&origin=*";
      const r=await fetch(url,{cache:"no-store"});if(!r.ok)return [];
      const j=await r.json(),pages=Object.values(j.query?.pages||{});
      return pages.flatMap(page=>{
        const info=page.imageinfo?.[0];if(!info?.thumburl)return [];
        const w=Number(info.width||0),h=Number(info.height||0),ratio=h?w/h:0;if(ratio&&ratio<1.25)return [];
        let score=0;if(ratio>=1.45&&ratio<=2.4)score+=7;else if(ratio>=1.25)score+=3;if(w>=1600)score+=2;
        const title=(page.title||"").toLowerCase();
        if(/landscape|panorama|view|valley|mountain|river|lake|coast|beach|harbour|harbor|countryside|rural|village|forest|desert|field/.test(title))score+=5;
        if(/people|person|crowd|worker|fisher|farmer|market|festival|street life|children|family|pedestrian|locals/.test(title))score+=6;
        if(/street|square|market|neighborhood|neighbourhood|public space|city/.test(title))score+=2;
        if(/logo|map|flag|coat|diagram|icon|portrait|statue|museum object|coin|stamp|emblem|interior|building facade|façade/.test(title))score-=12;
        score+=Math.random()*2;return [{url:info.thumburl,score,title:page.title||""}];
      });
    }catch(e){return []}
  }
  const results=await Promise.all(queries.map(searchOne));
  if(requestId!==postcardRequestId||activationId!==stationActivationId)return;
  const candidates=results.flat().sort((a,b)=>b.score-a.score),pic=candidates[0];
  if(pic){
    img.onload=()=>{if(requestId!==postcardRequestId||activationId!==stationActivationId)return;img.style.opacity="1"};
    img.src=pic.url;st.imageUrl=pic.url;st.imageTitle=pic.title||"";
    const currentLog=journeyLog[journeyLog.length-1];
    if(currentLog&&activationId===stationActivationId&&stationKey(activeStationForLog())===stationKey(st)){currentLog.imageUrl=pic.url;currentLog.imageTitle=pic.title||""}
  }else img.style.opacity=".08";
}
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
function durationText(ms){const total=Math.max(0,Math.round(Number(ms||0)/1000)),h=Math.floor(total/3600),m=Math.floor((total%3600)/60),sec=total%60;return h?`${h} h ${String(m).padStart(2,"0")} min`:`${m} min ${String(sec).padStart(2,"0")} sec`}
function closeLogEntry(){if(!journeyLog.length||!stationEnteredAt)return;const e=journeyLog[journeyLog.length-1];if(!e.endedAt){e.endedAt=Date.now();e.listenedMs=Math.max(0,e.endedAt-e.startedAt)}stationEnteredAt=null}
function logStation(st){
  closeLogEntry();stationEnteredAt=Date.now();journeyLog.push({index:journeyLog.length+1,name:st.name||"UNKNOWN RADIO",city:st.city||"",country:st.country||"",tags:stationDescription(st),url:st.url||"",homepage:st.homepage||"",codec:st.codec||"",bitrate:Number(st.bitrate||0),lat:Number(st.lat),lon:Number(st.lon),imageUrl:st.imageUrl||"",imageTitle:st.imageTitle||"",startedAt:stationEnteredAt,endedAt:null,listenedMs:0});
}
function snapshotJourney(){const now=paused&&pausedAt?pausedAt:Date.now();return journeyLog.map((entry,i)=>{const e={...entry,index:i+1};if(!e.endedAt)e.listenedMs=Math.max(0,now-e.startedAt);return e})}
function finalRouteSVG(entries){
  const geo=entries.filter(e=>Number.isFinite(Number(e.lat))&&Number.isFinite(Number(e.lon)));if(!geo.length)return `<div class="emptyMap">NO GEO DATA</div>`;
  const W=920,H=460,project=(lat,lon)=>[((Number(lon)+180)/360)*W,((90-Number(lat))/180)*H],pts=geo.map(e=>project(e.lat,e.lon));
  let route=`M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;for(let i=1;i<pts.length;i++){const [x,y]=pts[i],[px,py]=pts[i-1];route+=` Q ${((px+x)/2).toFixed(1)} ${(Math.min(py,y)-22).toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`}
  const dots=pts.map(([x,y],i)=>`<circle class="${i===pts.length-1?"last":"node"}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${i===pts.length-1?8:5}"/>`).join("");
  const labels=geo.map((e,i)=>{const [x,y]=pts[i];return `<text x="${Math.min(W-140,x+9).toFixed(1)}" y="${Math.max(18,y-9).toFixed(1)}">${esc((e.city||e.country||"?").toUpperCase())}</text>`}).join("");
  return `<svg class="finalMap" viewBox="0 0 ${W} ${H}"><image href="https://upload.wikimedia.org/wikipedia/commons/9/9f/BlankMap-World-Equirectangular.svg" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="none" opacity=".25"/><path class="route" d="${route}"/>${dots}${labels}</svg>`;
}
function buildJourneyDocument(){
  const entries=snapshotJourney(),end=paused&&pausedAt?pausedAt:Date.now(),total=startedAt?Math.max(0,end-startedAt-totalPausedMs):entries.reduce((a,e)=>a+Number(e.listenedMs||0),0),routeText=entries.map(e=>esc(e.city||e.country||"?")).join(" → ");
  const historyHTML=entries.map((e,i)=>`<article><div class="num">${String(i+1).padStart(2,"0")}</div><div class="entry">${e.imageUrl?`<div class="journeyImage"><img src="${esc(e.imageUrl)}" alt="${esc(e.city||e.country)}"></div>`:""}${e.imageTitle?`<div class="caption">${esc(String(e.imageTitle).replace(/^File:/,""))}</div>`:""}<h2>${esc(e.name)}</h2><div class="place">${esc([e.city,e.country].filter(Boolean).join(", "))}</div><p>${esc(e.tags||"LIVE RADIO SIGNAL")}</p><div class="meta">LISTENED · ${durationText(e.listenedMs)}</div>${e.url?`<a href="${esc(e.url)}">${esc(e.url)}</a>`:""}</div></article>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>WAVE ROAM — JOURNEY LOG</title><style>*{box-sizing:border-box}body{margin:0;background:#090909;color:#ded8ca;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}main{width:min(980px,92vw);margin:48px auto 90px}header{border-bottom:3px solid #d23c31;padding-bottom:25px;margin-bottom:32px}.kicker{font-size:11px;letter-spacing:.18em;color:#d88b10}h1{font-size:clamp(34px,7vw,76px);margin:8px 0 13px;line-height:.9}.summary{font-size:12px;line-height:1.7;color:#8c8c86}.routeSection{margin:30px 0 46px}.routeSection h3{font-size:10px;letter-spacing:.16em;color:#d88b10}.finalMap{display:block;width:100%;height:auto;border:1px solid #292929;background:#0a0c0a}.finalMap .route{fill:none;stroke:#d88b10;stroke-width:3}.finalMap .node{fill:#d8cfc0}.finalMap .last{fill:#d23c31}.finalMap text{fill:#a9aea7;font-size:9px}.emptyMap{height:180px;display:grid;place-items:center;border:1px solid #292929;color:#555}article{display:grid;grid-template-columns:62px 1fr;gap:18px;padding:26px 0;border-bottom:1px solid #292929}.num{font-size:22px;color:#d23c31}.entry h2{margin:0 0 5px;font-size:22px}.place{font-size:12px;color:#d88b10;text-transform:uppercase}p{font-size:11px;color:#9a9a94;text-transform:uppercase}.meta{font-size:10px;color:#6f746d;margin:12px 0 7px}a{font-size:10px;color:#b8cdb6;word-break:break-all}.journeyImage{height:315px;overflow:hidden;background:#111;margin-bottom:17px}.journeyImage img{width:100%;height:100%;object-fit:cover}.caption{font-size:8px;color:#555;margin:-10px 0 16px;text-transform:uppercase}footer{margin-top:38px;color:#555;font-size:9px}@media print{body{background:#fff;color:#111}main{width:100%;margin:0}header,.routeSection,article{break-inside:avoid}article{page-break-inside:avoid}.entry h2{color:#111}.place{color:#945600}a{color:#333}}</style></head><body><main><header><div class="kicker">WAVE ROAM MINI · JOURNEY LOG</div><h1>LINZ → ?</h1><div class="summary">START · ${new Date(startedAt||Date.now()).toLocaleString()}<br>TRAVEL TIME · ${durationText(total)}<br>RADIOS HEARD · ${entries.length}<br>JOURNEY ID · ${esc(journeySeed)}<br>ROUTE · ${routeText}</div></header><section class="routeSection"><h3>FINAL ROUTE MAP</h3>${finalRouteSVG(entries)}</section><section>${historyHTML||"<p>NO RADIO LOGGED.</p>"}</section><footer>WAVE ROAM MINI · AUTOMATIC RADIO JOURNEY · 100-STATION MEMORY</footer></main></body></html>`;
}
function exportJourneyDocument(){if(!journeyLog.length)return;const html=buildJourneyDocument(),blob=new Blob([html],{type:"text/html;charset=utf-8"}),url=URL.createObjectURL(blob),a=document.createElement("a"),stamp=new Date().toISOString().slice(0,19).replace(/[:T]/g,"-");a.href=url;a.download=`WAVE-ROAM-JOURNEY-${stamp}.html`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000)}
function stationDescription(st){const parts=[],tags=String(st.tags||"").split(",").map(x=>x.trim()).filter(Boolean);if(tags.length)parts.push(tags.slice(0,4).join(" · "));if(st.codec)parts.push(String(st.codec).toUpperCase());if(st.bitrate)parts.push(`${st.bitrate} KBPS`);return(parts.join(" / ")||"LIVE RADIO SIGNAL").toUpperCase()}
function activeStationForLog(){return active?._stationMeta||currentStation}
function stationKey(st){return String(st?.uuid||st?.url||st?.name||"")+"|"+String(st?.city||"")+"|"+String(st?.country||"")}
function syncActiveStationUI(st){
  if(!st)return;const key=stationKey(st),oldKey=stationKey(currentStation);
  if(key&&key===oldKey){const place=((st.city||"")+(st.city&&st.country?", ":"")+(st.country||"")).toUpperCase();document.getElementById("stationName").textContent=(st.name||"UNKNOWN RADIO").toUpperCase();document.getElementById("location").textContent=place;document.getElementById("tags").textContent=stationDescription(st);document.getElementById("postTitle").textContent=(st.city||st.country||"WORLD").toUpperCase();document.getElementById("postStation").textContent=(st.name||"UNKNOWN RADIO").toUpperCase();document.getElementById("postCity").textContent=place;return}
  showStation(st);
}
function showStation(st){
  stationActivationId++;const activationId=stationActivationId;currentStation={...st};const activeStation=currentStation;logStation(activeStation);
  const place=((activeStation.city||"")+(activeStation.city&&activeStation.country?", ":"")+(activeStation.country||"")).toUpperCase();
  document.getElementById("stationName").textContent=(activeStation.name||"UNKNOWN RADIO").toUpperCase();document.body.dataset.activeStream=activeStation.url||"";document.getElementById("location").textContent=place;document.getElementById("tags").textContent=stationDescription(activeStation);
  const streamLink=document.getElementById("streamLink");if(activeStation.url){streamLink.href=activeStation.url;streamLink.textContent="STREAM · "+activeStation.url;streamLink.title=activeStation.url}else{streamLink.removeAttribute("href");streamLink.textContent="STREAM · UNAVAILABLE";streamLink.removeAttribute("title")}
  document.getElementById("postTitle").textContent=(activeStation.city||activeStation.country||"WORLD").toUpperCase();document.getElementById("postStation").textContent=(activeStation.name||"UNKNOWN RADIO").toUpperCase();document.getElementById("postCity").textContent=place;
  document.getElementById("mapLabel").textContent=(activeStation.city||activeStation.country||"SIGNAL").toUpperCase();history.push({...activeStation});if(history.length>1200)history.shift();drawRoute();postcard(activeStation,activationId);
}
function preRoll(el,url,timeout=12000){
  return new Promise(async resolve=>{let done=false,timer=null;const finish=v=>{if(done)return;done=true;clearTimeout(timer);cleanup();resolve(v)},good=()=>setTimeout(()=>finish(true),700),bad=()=>finish(false),cleanup=()=>{el.removeEventListener("playing",good);el.removeEventListener("timeupdate",good);el.removeEventListener("error",bad);el.removeEventListener("stalled",bad)};el.addEventListener("playing",good,{once:true});el.addEventListener("timeupdate",good,{once:true});el.addEventListener("error",bad,{once:true});el.addEventListener("stalled",bad,{once:true});try{el.pause();el.src=url;el.preload="auto";el.muted=true;el.volume=0;el.load();await el.play()}catch(e){finish(false);return}timer=setTimeout(()=>finish(false),timeout)});
}
async function radioBrowser(path){for(const host of [...HOSTS].sort(()=>Math.random()-.5)){try{const sep=path.includes("?")?"&":"?",r=await fetch(host+path+sep+"_="+Date.now()+"_"+Math.random(),{cache:"no-store"});if(r.ok)return await r.json()}catch(e){}}return []}
async function findRadioFRO(){
  const qs=new URLSearchParams({name:"Radio FRO",country:"Austria",hidebroken:"true",limit:"20"}),list=await radioBrowser("/json/stations/search?"+qs.toString()),sorted=list.sort((a,b)=>Number(b.lastcheckok||0)-Number(a.lastcheckok||0));
  for(const s of sorted){const u=(s.url_resolved||s.url||"").trim();if(!u.startsWith("https://"))continue;active.src=u;active._stationMeta={name:s.name||"RADIO FRO",city:"LINZ",country:"AUSTRIA",tags:(s.tags||"FREE RADIO,COMMUNITY,CULTURE").split(",").slice(0,3).join(" / "),lat:48.3069,lon:14.2858,url:u,uuid:s.stationuuid,codec:s.codec||"",bitrate:Number(s.bitrate||0),homepage:s.homepage||""};active.muted=false;active.volume=1;try{await active.play()}catch(e){continue}return{...active._stationMeta}}
  return null;
}
async function candidates(strictExperimental=true){
  const tag=tagDeck.length?tagDeck.shift():TAGS[Math.floor(Math.random()*TAGS.length)],qs=new URLSearchParams({tag,hidebroken:"true",order:"random",limit:"35"}),list=await radioBrowser("/json/stations/search?"+qs.toString());
  return list.filter(s=>{const u=(s.url_resolved||s.url||"").trim(),hay=((s.name||"")+" "+(s.tags||"")).toLowerCase(),commercial=/\b(top ?40|hits?|chart|commercial|mainstream|hot ac|adult contemporary)\b/.test(hay),codec=(s.codec||"").toUpperCase(),id=s.stationuuid||u||(s.name+"|"+s.country),sameCountry=currentStation&&s.country&&currentStation.country&&String(s.country).toLowerCase()===String(currentStation.country).toLowerCase(),samePlace=currentStation&&s.state&&currentStation.city&&String(s.state).toLowerCase()===String(currentStation.city).toLowerCase(),experimentalEnough=EXPERIMENTAL_SIGNAL_RE.test(hay),lat=Number(s.geo_lat),lon=Number(s.geo_long),geoOK=Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180&&!(Math.abs(lat)<0.01&&Math.abs(lon)<0.01);return u.startsWith("https://")&&Number(s.lastcheckok||0)===1&&(!strictExperimental||experimentalEnough)&&geoOK&&!recent.has(id)&&!heardWithinLast100(id)&&!routePrefixAlreadyUsed(id)&&!samePlace&&!sameCountry&&Number(s.bitrate||0)>=32&&(!codec||/MP3|AAC|AAC\+/.test(codec))&&!commercial});
}
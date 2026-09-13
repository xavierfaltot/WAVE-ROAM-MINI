let linzHoldUntil=0;
let linzHoldRemaining=720000;
function linzOpeningLocked(){return completedAfterLinz===0 && linzHoldUntil>0 && Date.now()<linzHoldUntil}

async function prepareNext(){
  if(preparingNext||changingStation||!started)return;preparingNext=true;
  try{
    nextStation=null;
    if(completedAfterLinz>=4&&!pickPocketPlayed){
      const pp={...FALLBACKS[0]};document.getElementById("nextRadioName").textContent="PICK POCKET RADIO";document.getElementById("nextRadioPlace").textContent="BERLIN, GERMANY";document.getElementById("nextSignal").textContent="PRELOADING — BERLIN";
      if(await preRoll(standby,pp.url,12000)){nextStation={...pp,editorialPickPocket:true};standby._stationMeta={...nextStation};document.getElementById("nextSignal").textContent="READY — BERLIN";return}
    }
    document.getElementById("nextRadioName").textContent="SCANNING";document.getElementById("nextRadioPlace").textContent="NEW SIGNAL";document.getElementById("nextSignal").textContent="SCANNING";
    for(let round=0;round<7;round++){
      const list=await candidates(round<6);for(let i=list.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[list[i],list[j]]=[list[j],list[i]]}
      for(const st of list.slice(0,10)){
        const u=st.url_resolved||st.url,id=st.stationuuid||u||(st.name+"|"+st.country);
        if(await preRoll(standby,u,12000)){
          nextStation={name:st.name||"UNKNOWN RADIO",city:st.state||st.country||"",country:st.country||st.countrycode||"",tags:(st.tags||"EXPERIMENTAL RADIO").split(",").slice(0,5).join(","),lat:Number(st.geo_lat),lon:Number(st.geo_long),url:u,uuid:id,codec:st.codec||"",bitrate:Number(st.bitrate||0),homepage:st.homepage||""};
          standby._stationMeta={...nextStation};document.getElementById("nextRadioName").textContent=nextStation.name.toUpperCase();document.getElementById("nextRadioPlace").textContent=((nextStation.city||"")+(nextStation.city&&nextStation.country?", ":"")+(nextStation.country||"")).toUpperCase();document.getElementById("nextSignal").textContent="READY — "+(nextStation.city||nextStation.country||"SIGNAL").toUpperCase();return;
        }
      }
    }
    document.getElementById("nextRadioName").textContent="SEARCHING";document.getElementById("nextRadioPlace").textContent="CURRENT RADIO KEEPS PLAYING";document.getElementById("nextSignal").textContent="SEARCHING";
    setTimeout(()=>{if(started&&!paused&&!nextStation&&!changingStation)prepareNext()},5000);
  }finally{preparingNext=false}
}

function scheduleNext(){
  clearTimeout(moveTimer);if(!started||paused)return;
  let ms;
  if(completedAfterLinz===0 && linzHoldUntil>0){
    ms=Math.max(1000,linzHoldUntil-Date.now());
  }else{
    ms=Math.random()<.10?180000+Math.random()*60000:300000+Math.random()*180000;
  }
  moveTimer=setTimeout(()=>changeStation(false),ms);
}

async function seamlessSwap(){
  standby.muted=false;standby.volume=0;if(standby.paused)await standby.play();
  const steps=8;for(let i=1;i<=steps;i++){standby.volume=i/steps;active.volume=Math.max(0,1-i/steps);await new Promise(r=>setTimeout(r,35))}
  await new Promise(r=>setTimeout(r,80));active.pause();active.removeAttribute("src");active._stationMeta=null;active.load();active.volume=1;active.muted=false;standby.volume=1;
}

async function changeStation(manual=false){
  if(!started||paused||changingStation)return;
  if(!manual&&linzOpeningLocked()){scheduleNext();return}
  if(!nextStation)await prepareNext();if(!nextStation)return;changingStation=true;
  const target={...(standby._stationMeta||nextStation)},targetSrc=standby.currentSrc||standby.src||target.url||"";setState("loading");
  try{
    await seamlessSwap();const old=active;active=standby;standby=old;target.url=targetSrc||target.url;active._stationMeta={...target};
    if(target.uuid){recent.add(target.uuid);routeSignature.push(target.uuid)}
    if(target.editorialPickPocket){pickPocketPlayed=true;rememberStation(target.uuid||target.url||"PICK_POCKET_RADIO")}else{completedAfterLinz++;rememberStation(target.uuid||target.url||target.name)}
    nextStation=null;syncActiveStationUI(active._stationMeta);setState("ok");
  }catch(e){setState("err");if(active.paused){try{active.muted=false;active.volume=1;await active.play()}catch(_){}}nextStation=null}finally{changingStation=false}
  prepareNext();scheduleNext();
}

function stopJourney(){if(!started)return;clearTimeout(moveTimer);clearInterval(travelTimer);A.pause();B.pause();closeLogEntry();saveRoute();started=false;paused=false;linzHoldUntil=0;linzHoldRemaining=720000;playBtn.classList.remove("running");document.getElementById("travelClock").textContent="00:00:00";setState("")}

function printJourney(){
  if(!journeyLog.length)return;const html=buildJourneyDocument(),old=document.getElementById("waveRoamPrintFrame");if(old)old.remove();
  const frame=document.createElement("iframe");frame.id="waveRoamPrintFrame";frame.setAttribute("aria-hidden","true");Object.assign(frame.style,{position:"fixed",right:"0",bottom:"0",width:"1px",height:"1px",border:"0",opacity:"0",pointerEvents:"none"});document.body.appendChild(frame);
  const doc=frame.contentDocument||frame.contentWindow.document;doc.open();doc.write(html);doc.close();setTimeout(()=>{try{frame.contentWindow.focus();frame.contentWindow.print()}catch(e){exportJourneyDocument()}},1200);
}

function pauseResume(){
  if(!started)return;
  if(!paused){
    if(completedAfterLinz===0&&linzHoldUntil>0)linzHoldRemaining=Math.max(0,linzHoldUntil-Date.now());
    paused=true;pausedAt=Date.now();active.pause();if(standby&&!standby.paused)standby.pause();clearTimeout(moveTimer);playBtn.classList.remove("running");setState("");liveText.textContent="PAUSE";tick();return
  }
  paused=false;totalPausedMs+=Date.now()-pausedAt;
  if(completedAfterLinz===0&&linzHoldRemaining>0)linzHoldUntil=Date.now()+linzHoldRemaining;
  active.muted=false;active.volume=1;active.play().then(()=>{playBtn.classList.add("running");setState("ok");if(nextStation&&standby.src){standby.muted=true;standby.volume=0;standby.play().catch(()=>{nextStation=null;prepareNext()})}scheduleNext();tick()}).catch(()=>setState("err"));
}

async function startTrip(){
  if(started){pauseResume();return}setState("loading");let first=await findRadioFRO();
  if(!first){for(const f of FALLBACKS){active.src=f.url;active._stationMeta={...f};try{await active.play();first={...f};break}catch(e){}}}else{active.muted=false;active.volume=1}
  if(!first){setState("err");return}
  started=true;startedAt=Date.now();paused=false;pausedAt=0;totalPausedMs=0;journeyLog=[];stationEnteredAt=null;routeSignature=[];newJourneySeed();completedAfterLinz=0;pickPocketPlayed=false;playBtn.classList.add("running");active._stationMeta={...first};syncActiveStationUI(active._stationMeta);
  linzHoldRemaining=720000;linzHoldUntil=Date.now()+linzHoldRemaining;
  if(first.uuid){recent.add(first.uuid);routeSignature.push("LINZ_RADIO_FRO")}else routeSignature.push("LINZ_RADIO_FRO");
  setState("ok");tick();travelTimer=setInterval(tick,1000);standby.pause();standby.muted=true;standby.volume=0;prepareNext();scheduleNext();
}

playBtn.addEventListener("click",startTrip);stopBtn.addEventListener("click",stopJourney);printBtn.addEventListener("click",printJourney);nextBtn.addEventListener("click",async()=>{if(!started||paused)return;clearTimeout(moveTimer);if(!nextStation){document.getElementById("nextRadioName").textContent="SCANNING";document.getElementById("nextRadioPlace").textContent="CURRENT RADIO KEEPS PLAYING";await prepareNext()}if(nextStation)await changeStation(true)});
function hardSyncFromPlayingElement(el){if(el!==active||!el._stationMeta)return;syncActiveStationUI(el._stationMeta)}
A.addEventListener("playing",()=>hardSyncFromPlayingElement(A));B.addEventListener("playing",()=>hardSyncFromPlayingElement(B));A.addEventListener("error",()=>{if(A===active)setState("err")});B.addEventListener("error",()=>{if(B===active)setState("err")});
fullscreenBtn.addEventListener("click",async()=>{try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen();else await document.exitFullscreen()}catch(e){}});document.addEventListener("fullscreenchange",()=>document.body.classList.toggle("fullscreen-mode",!!document.fullscreenElement));
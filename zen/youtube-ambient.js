(() => {
  if (window.__lumenYouTubeAmbient) return;
  window.__lumenYouTubeAmbient = true;
  const root = document.documentElement;
  const defaults = { ytAmbientEnabled:true, ytAmbientIntensity:86, ytAmbientBlur:64, ytAmbientReach:320, ytAmbientEdge:14, ytAmbientFade:56, ytAmbientBrightness:105, ytAmbientContrast:112, ytAmbientSaturation:170, ytAmbientFlicker:34, ytAmbientFps:30, ytAmbientResolution:192, ytAmbientTop:100, ytAmbientRight:100, ytAmbientBottom:100, ytAmbientLeft:100 };
  const groups = [
    ["광원", [["ytAmbientIntensity","밝기",0,100,"%"],["ytAmbientReach","확산 거리",0,1000,"px"],["ytAmbientBlur","블러",0,160,"px"],["ytAmbientEdge","가장자리 샘플",2,40,"%"],["ytAmbientFade","감쇠 시작",10,95,"%"]]],
    ["색상 필터", [["ytAmbientBrightness","광원 밝기",40,180,"%"],["ytAmbientContrast","콘트라스트",50,200,"%"],["ytAmbientSaturation","채도",0,300,"%"]]],
    ["방향", [["ytAmbientTop","위",0,100,"%"],["ytAmbientRight","오른쪽",0,100,"%"],["ytAmbientBottom","아래",0,100,"%"],["ytAmbientLeft","왼쪽",0,100,"%"]]],
    ["품질과 동기화", [["ytAmbientFlicker","깜빡임 감소",0,90,"%"],["ytAmbientFps","최대 FPS",10,60,""],["ytAmbientResolution","내부 해상도",64,512,"px"]]]
  ];
  const allControls = groups.flatMap(([, controls]) => controls);
  const host = document.createElement("div"); host.className = "lg-yt-ambient-host"; host.hidden = true;
  const projectors = {};
  for (const direction of ["top","right","bottom","left"]) {
    const canvas = document.createElement("canvas"); canvas.className = "lg-yt-projector"; canvas.dataset.direction = direction; canvas.setAttribute("aria-hidden","true"); host.append(canvas);
    projectors[direction] = { canvas, context:canvas.getContext("2d", { alpha:false, desynchronized:true }) };
  }
  const toggle = document.createElement("button"); toggle.className = "lg-yt-toggle"; toggle.type = "button"; toggle.textContent = "◐ 주변광"; toggle.title = "YouTube 주변광 설정"; toggle.setAttribute("aria-label","YouTube 주변광 설정"); toggle.setAttribute("aria-expanded","false");
  const panel = document.createElement("section"); panel.className = "lg-yt-panel"; panel.hidden = true;
  panel.innerHTML = groups.map(([title,controls],i) => `<details ${i===0?"open":""}><summary>${title}</summary><div class="lg-yt-controls">${controls.map(([key,label,min,max]) => `<label>${label}<output data-output="${key}"></output><input data-setting="${key}" type="range" min="${min}" max="${max}"></label>`).join("")}</div></details>`).join("");
  document.documentElement.append(host); document.body.append(toggle,panel);
  let settings={...defaults}, video=null, playerSurface=null, videoFrameId=0, animationFrameId=0, lastDraw=0, bindTimer=0;
  const isVideoPage=()=>location.pathname==="/watch"||location.pathname.startsWith("/shorts/")||location.pathname.startsWith("/embed/");
  const findActiveVideo=()=>{
    if(location.pathname.startsWith("/shorts/")){
      const marked=document.querySelector("ytd-reel-video-renderer[is-active] video,ytd-reel-video-renderer[active] video"); if(marked)return marked;
      return Array.from(document.querySelectorAll("#shorts-player video,ytd-reel-video-renderer video")).find(item=>{const r=item.getBoundingClientRect();return item.offsetParent&&r.top+r.height/2>0&&r.top+r.height/2<innerHeight&&!item.paused;})||null;
    }
    return document.querySelector("video.html5-main-video");
  };
  const applySettings=next=>{
    settings={...defaults,...next};
    const vars={"--lg-yt-intensity":settings.ytAmbientIntensity/100,"--lg-yt-blur":`${settings.ytAmbientBlur}px`,"--lg-yt-reach":`${settings.ytAmbientReach}px`,"--lg-yt-fade":`${settings.ytAmbientFade}%`,"--lg-yt-brightness":`${settings.ytAmbientBrightness}%`,"--lg-yt-contrast":`${settings.ytAmbientContrast}%`,"--lg-yt-saturation":`${settings.ytAmbientSaturation}%`,"--lg-yt-top":settings.ytAmbientTop/100,"--lg-yt-right":settings.ytAmbientRight/100,"--lg-yt-bottom":settings.ytAmbientBottom/100,"--lg-yt-left":settings.ytAmbientLeft/100};
    for(const [name,value] of Object.entries(vars))root.style.setProperty(name,value);
    toggle.dataset.enabled=String(settings.ytAmbientEnabled); host.hidden=!settings.ytAmbientEnabled||!video||!playerSurface;
    for(const [key,,, ,suffix] of allControls){panel.querySelector(`[data-setting="${key}"]`).value=settings[key];panel.querySelector(`[data-output="${key}"]`).value=`${settings[key]}${suffix}`;}
  };
  const resizeProjectors=()=>{
    if(!video?.videoWidth||!video?.videoHeight)return;
    const resolution=settings.ytAmbientResolution, aspect=video.videoWidth/video.videoHeight, edge=Math.max(2,Math.round(resolution*settings.ytAmbientEdge/100));
    for(const d of ["top","bottom"]){const c=projectors[d].canvas;if(c.width!==resolution)c.width=resolution;if(c.height!==edge)c.height=edge;}
    const verticalHeight=Math.max(32,Math.round(resolution/aspect));
    for(const d of ["left","right"]){const c=projectors[d].canvas;if(c.width!==edge)c.width=edge;if(c.height!==verticalHeight)c.height=verticalHeight;}
  };
  const draw=now=>{
    if(!settings.ytAmbientEnabled||!video||document.hidden||video.readyState<2||now-lastDraw<1000/settings.ytAmbientFps)return; lastDraw=now; resizeProjectors();
    const w=video.videoWidth,h=video.videoHeight,ex=Math.max(2,Math.round(w*settings.ytAmbientEdge/100)),ey=Math.max(2,Math.round(h*settings.ytAmbientEdge/100)),alpha=Math.max(.1,1-settings.ytAmbientFlicker/100);
    const sources={top:[0,0,w,ey],bottom:[0,h-ey,w,ey],left:[0,0,ex,h],right:[w-ex,0,ex,h]};
    try{for(const [direction,item] of Object.entries(projectors)){const [sx,sy,sw,sh]=sources[direction];item.context.globalAlpha=alpha;item.context.drawImage(video,sx,sy,sw,sh,0,0,item.canvas.width,item.canvas.height);item.context.globalAlpha=1;}}catch{}
  };
  const stopRenderer=()=>{if(videoFrameId&&video?.cancelVideoFrameCallback)video.cancelVideoFrameCallback(videoFrameId);cancelAnimationFrame(animationFrameId);videoFrameId=0;animationFrameId=0;};
  const scheduleRenderer=()=>{stopRenderer();if(!video)return;if(video.requestVideoFrameCallback){const onFrame=now=>{draw(now);videoFrameId=video.requestVideoFrameCallback(onFrame);};videoFrameId=video.requestVideoFrameCallback(onFrame);}else{const onFrame=now=>{draw(now);animationFrameId=requestAnimationFrame(onFrame);};animationFrameId=requestAnimationFrame(onFrame);}};
  const bindVideo=()=>{
    const active=isVideoPage();root.dataset.lgYtMode=location.pathname.startsWith("/shorts/")?"shorts":"watch";toggle.hidden=!active;if(!active)panel.hidden=true;
    const candidate=active?findActiveVideo():null;if(candidate===video)return;stopRenderer();playerSurface?.classList.remove("lg-yt-player-surface");video=candidate;
    const watch=video?.closest("ytd-watch-flexy");playerSurface=video?.closest("#shorts-player")||video?.closest("ytd-reel-video-renderer")||watch?.querySelector("#player")||watch?.querySelector("#player-container-outer")||video?.closest("ytd-player,.html5-video-player")||null;
    if(playerSurface){playerSurface.classList.add("lg-yt-player-surface");playerSurface.append(host);}applySettings(settings);scheduleRenderer();
  };
  const scheduleBind=()=>{clearTimeout(bindTimer);bindTimer=setTimeout(bindVideo,120);};
  toggle.addEventListener("click",async event=>{if(event.shiftKey){settings.ytAmbientEnabled=!settings.ytAmbientEnabled;await LumenAPI.storage.local.set({ytAmbientEnabled:settings.ytAmbientEnabled});applySettings(settings);return;}panel.hidden=!panel.hidden;toggle.setAttribute("aria-expanded",String(!panel.hidden));});
  panel.addEventListener("input",async event=>{const key=event.target.dataset.setting;if(!key)return;settings[key]=Number(event.target.value);applySettings(settings);draw(performance.now());await LumenAPI.storage.local.set({[key]:settings[key]});});
  document.addEventListener("keydown",event=>{if(event.altKey&&event.shiftKey&&event.key.toLowerCase()==="l"&&isVideoPage()){event.preventDefault();panel.hidden=!panel.hidden;toggle.setAttribute("aria-expanded",String(!panel.hidden));}});
  LumenAPI.storage.local.get({...defaults,ytAmbientRendererVersion:0}).then(async stored=>{if(stored.ytAmbientRendererVersion<1){stored={...stored,...defaults,ytAmbientRendererVersion:1};await LumenAPI.storage.local.set(stored);}applySettings(stored);bindVideo();});
  new MutationObserver(scheduleBind).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:["is-active","active"]});
  document.addEventListener("yt-navigate-finish",scheduleBind);document.addEventListener("yt-page-data-updated",scheduleBind);
})();

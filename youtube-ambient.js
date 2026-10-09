(() => {
  if (window.__lumenYouTubeAmbient) return;
  window.__lumenYouTubeAmbient = true;

  const defaults = { ytAmbientEnabled: true, ytAmbientIntensity: 92, ytAmbientBlur: 76, ytAmbientReach: 110, ytAmbientSpread: 132, ytAmbientSaturation: 190 };
  const root = document.documentElement;
  const host = document.createElement("div");
  const canvas = document.createElement("canvas");
  const bloom = document.createElement("div");
  const edge = document.createElement("div");
  const toggle = document.createElement("button");
  const panel = document.createElement("section");
  const sampleCanvas = document.createElement("canvas");
  const sampleContext = sampleCanvas.getContext("2d", { willReadFrequently: true });
  const context = canvas.getContext("2d", { alpha: false, desynchronized: true });

  host.className = "lg-yt-ambient-host";
  canvas.className = "lg-yt-ambient-frame";
  bloom.className = "lg-yt-ambient-bloom";
  edge.className = "lg-yt-ambient-edge";
  toggle.className = "lg-yt-toggle";
  toggle.type = "button";
  toggle.textContent = "◐ 주변광";
  toggle.title = "YouTube 주변광 설정";
  toggle.setAttribute("aria-label", "YouTube 주변광 설정");
  toggle.setAttribute("aria-expanded", "false");
  panel.className = "lg-yt-panel";
  panel.hidden = true;
  host.append(canvas, bloom, edge);

  const controls = [
    ["ytAmbientIntensity", "밝기", 0, 100, "%"],
    ["ytAmbientBlur", "빛 번짐", 24, 100, "px"],
    ["ytAmbientReach", "적용 범위", 0, 240, "px"],
    ["ytAmbientSpread", "광원 배율", 80, 200, "%"],
    ["ytAmbientSaturation", "채도", 80, 220, "%"]
  ];
  panel.innerHTML = controls.map(([key, label, min, max]) =>
    `<label>${label}<output data-output="${key}"></output><input data-setting="${key}" type="range" min="${min}" max="${max}"></label>`
  ).join("");
  document.documentElement.append(host);
  document.body.append(toggle, panel);

  let settings = { ...defaults };
  let video = null;
  let playerSurface = null;
  let frameRequest = 0;
  let lastPaint = 0;
  let sampledColors = true;
  let observerTimer = 0;

  const applySettings = (next) => {
    settings = { ...defaults, ...next };
    root.style.setProperty("--lg-yt-intensity", settings.ytAmbientIntensity / 100);
    root.style.setProperty("--lg-yt-blur", `${settings.ytAmbientBlur}px`);
    root.style.setProperty("--lg-yt-shadow-blur", `${Math.round(settings.ytAmbientBlur * 1.25)}px`);
    root.style.setProperty("--lg-yt-shadow-blur-strong", `${Math.round(settings.ytAmbientBlur * 1.4)}px`);
    root.style.setProperty("--lg-yt-reach", `${settings.ytAmbientReach}px`);
    root.style.setProperty("--lg-yt-bloom-reach", `${Math.round(settings.ytAmbientReach * .72)}px`);
    root.style.setProperty("--lg-yt-edge-reach", `${Math.round(settings.ytAmbientReach * .18)}px`);
    root.style.setProperty("--lg-yt-spread", settings.ytAmbientSpread / 100);
    root.style.setProperty("--lg-yt-player-spread", 1 + (settings.ytAmbientSpread / 100 - 1) * .48);
    root.style.setProperty("--lg-yt-saturation", `${settings.ytAmbientSaturation}%`);
    toggle.dataset.enabled = String(settings.ytAmbientEnabled);
    host.hidden = !settings.ytAmbientEnabled || !video;
    for (const [key, , , , suffix] of controls) {
      const input = panel.querySelector(`[data-setting="${key}"]`);
      const output = panel.querySelector(`[data-output="${key}"]`);
      input.value = settings[key];
      output.value = `${settings[key]}${suffix}`;
    }
  };

  const isVideoPage = () => location.pathname === "/watch" || location.pathname.startsWith("/shorts/") || location.pathname.startsWith("/embed/");

  const averageStrip = (data, width, height, x0, x1) => {
    let r = 0, g = 0, b = 0, count = 0;
    for (let y = 1; y < height; y += 2) {
      for (let x = x0; x < x1; x += 2) {
        const i = (y * width + x) * 4;
        r += data[i]; g += data[i + 1]; b += data[i + 2]; count++;
      }
    }
    return `${Math.round(r / count)} ${Math.round(g / count)} ${Math.round(b / count)}`;
  };

  const sampleEdges = () => {
    if (!sampledColors || !video || video.readyState < 2) return;
    try {
      sampleCanvas.width = 24; sampleCanvas.height = 14;
      sampleContext.drawImage(video, 0, 0, 24, 14);
      const pixels = sampleContext.getImageData(0, 0, 24, 14).data;
      host.style.setProperty("--lg-yt-left", averageStrip(pixels, 24, 14, 0, 7));
      host.style.setProperty("--lg-yt-center", averageStrip(pixels, 24, 14, 7, 17));
      host.style.setProperty("--lg-yt-right", averageStrip(pixels, 24, 14, 17, 24));
    } catch {
      sampledColors = false;
    }
  };

  const paint = (time) => {
    frameRequest = requestAnimationFrame(paint);
    if (!settings.ytAmbientEnabled || !video || document.hidden || video.readyState < 2 || time - lastPaint < 50) return;
    lastPaint = time;
    const width = 128;
    const height = 72;
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    try {
      context.drawImage(video, 0, 0, width, height);
      if (Math.round(time / 50) % 5 === 0) sampleEdges();
    } catch { /* The next decoded frame will retry automatically. */ }
  };

  const bindVideo = () => {
    const activePage = isVideoPage();
    root.dataset.lgYtWatch = String(activePage);
    toggle.hidden = !activePage;
    if (!activePage) panel.hidden = true;
    const candidate = activePage ? document.querySelector("video.html5-main-video, #shorts-player video") : null;
    if (candidate === video) return;
    playerSurface?.classList.remove("lg-yt-player-surface");
    video = candidate;
    const watchPage = video?.closest("ytd-watch-flexy");
    playerSurface = watchPage?.querySelector("#player-container-outer")
      || watchPage?.querySelector("#full-bleed-container")
      || video?.closest("#shorts-player, ytd-player, .html5-video-player")
      || null;
    if (playerSurface) {
      playerSurface.classList.add("lg-yt-player-surface");
      playerSurface.append(host);
    }
    sampledColors = true;
    host.hidden = !settings.ytAmbientEnabled || !video || !playerSurface;
  };

  const scheduleBind = () => {
    clearTimeout(observerTimer);
    observerTimer = setTimeout(bindVideo, 180);
  };

  toggle.addEventListener("click", async (event) => {
    if (event.shiftKey) {
      settings.ytAmbientEnabled = !settings.ytAmbientEnabled;
      await chrome.storage.local.set({ ytAmbientEnabled: settings.ytAmbientEnabled });
      applySettings(settings);
      return;
    }
    panel.hidden = !panel.hidden;
    toggle.setAttribute("aria-expanded", String(!panel.hidden));
  });

  panel.addEventListener("input", async (event) => {
    const key = event.target.dataset.setting;
    if (!key) return;
    settings[key] = Number(event.target.value);
    applySettings(settings);
    await chrome.storage.local.set({ [key]: settings[key] });
  });

  document.addEventListener("keydown", (event) => {
    if (event.altKey && event.shiftKey && event.key.toLowerCase() === "l" && isVideoPage()) {
      event.preventDefault();
      panel.hidden = !panel.hidden;
      toggle.setAttribute("aria-expanded", String(!panel.hidden));
    }
  });

  chrome.storage.local.get({ ...defaults, ytAmbientSettingsVersion: 0 }).then(async (stored) => {
    if (stored.ytAmbientSettingsVersion < 2) {
      stored = { ...stored, ...defaults, ytAmbientSettingsVersion: 2 };
      await chrome.storage.local.set(stored);
    }
    if (stored.ytAmbientSettingsVersion < 3) {
      stored.ytAmbientEnabled = true;
      stored.ytAmbientSettingsVersion = 3;
      await chrome.storage.local.set({ ytAmbientEnabled: true, ytAmbientSettingsVersion: 3 });
    }
    applySettings(stored);
    bindVideo();
    cancelAnimationFrame(frameRequest);
    frameRequest = requestAnimationFrame(paint);
  });

  new MutationObserver(scheduleBind).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener("yt-navigate-finish", scheduleBind);
  document.addEventListener("fullscreenchange", scheduleBind);
})();

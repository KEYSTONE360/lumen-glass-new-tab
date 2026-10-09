(() => {
  if (window.__lumenYouTubeAmbient) return;
  window.__lumenYouTubeAmbient = true;

  const defaults = { ytAmbientEnabled: true, ytAmbientIntensity: 92, ytAmbientBlur: 76, ytAmbientSpread: 132, ytAmbientSaturation: 190 };
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
  toggle.textContent = "◐";
  toggle.title = "YouTube 주변광 설정";
  toggle.setAttribute("aria-label", "YouTube 주변광 설정");
  toggle.setAttribute("aria-expanded", "false");
  panel.className = "lg-yt-panel";
  panel.hidden = true;
  host.append(canvas, bloom, edge);

  const controls = [
    ["ytAmbientIntensity", "밝기", 0, 100, "%"],
    ["ytAmbientBlur", "빛 번짐", 24, 100, "px"],
    ["ytAmbientSpread", "확장 범위", 100, 145, "%"],
    ["ytAmbientSaturation", "채도", 80, 220, "%"]
  ];
  panel.innerHTML = controls.map(([key, label, min, max]) =>
    `<label>${label}<output data-output="${key}"></output><input data-setting="${key}" type="range" min="${min}" max="${max}"></label>`
  ).join("");
  document.documentElement.append(host, toggle, panel);

  let settings = { ...defaults };
  let video = null;
  let frameRequest = 0;
  let lastPaint = 0;
  let sampledColors = true;
  let observerTimer = 0;

  const applySettings = (next) => {
    settings = { ...defaults, ...next };
    root.style.setProperty("--lg-yt-intensity", settings.ytAmbientIntensity / 100);
    root.style.setProperty("--lg-yt-blur", `${settings.ytAmbientBlur}px`);
    root.style.setProperty("--lg-yt-spread", settings.ytAmbientSpread / 100);
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
    video = candidate;
    sampledColors = true;
    host.hidden = !settings.ytAmbientEnabled || !video;
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

  chrome.storage.local.get({ ...defaults, ytAmbientSettingsVersion: 0 }).then(async (stored) => {
    if (stored.ytAmbientSettingsVersion < 2) {
      stored = { ...stored, ...defaults, ytAmbientSettingsVersion: 2 };
      await chrome.storage.local.set(stored);
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

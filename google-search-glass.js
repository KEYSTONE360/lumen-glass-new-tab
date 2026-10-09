(() => {
  if (window.__lumenGoogleSearchGlass) return;
  const allowedPaths = new Set(["/", "/webhp", "/search", "/imghp", "/imgres"]);
  if (!allowedPaths.has(location.pathname)) return;
  window.__lumenGoogleSearchGlass = true;

  const root = document.documentElement;
  root.dataset.lgGoogleSearch = "true";
  const defaults = { transparency: 62, contrast: 108, hue: 214, motion: 100, refraction: 28 };
  const wallpaperCanvas = document.createElement("canvas");
  const liquidCanvas = document.createElement("canvas");
  const button = document.createElement("button");
  const panel = document.createElement("section");
  wallpaperCanvas.className = "lg-search-wallpaper";
  liquidCanvas.className = "lg-search-liquid";
  wallpaperCanvas.setAttribute("aria-hidden", "true");
  liquidCanvas.setAttribute("aria-hidden", "true");
  button.className = "lg-search-control";
  button.type = "button";
  button.textContent = "◐";
  button.title = "검색 글라스 설정";
  button.setAttribute("aria-label", "검색 글라스 설정");
  button.setAttribute("aria-expanded", "false");
  panel.className = "lg-search-panel";
  panel.hidden = true;

  const controls = [
    ["transparency", "투명도", 15, 88, "%"],
    ["contrast", "콘트라스트", 80, 155, "%"],
    ["hue", "색조", 0, 360, "°"],
    ["motion", "흐름", 0, 160, "%"],
    ["refraction", "굴절", 8, 42, "px"]
  ];
  panel.innerHTML = controls.map(([key, label, min, max]) => `<label>${label}<output data-output="${key}"></output><input data-setting="${key}" type="range" min="${min}" max="${max}"></label>`).join("");
  document.body.append(wallpaperCanvas, liquidCanvas, button, panel);

  let settings = { ...defaults };
  const apply = (next) => {
    settings = { ...defaults, ...next };
    root.style.setProperty("--lg-search-alpha", settings.transparency / 100);
    root.style.setProperty("--lg-search-contrast", `${settings.contrast}%`);
    root.style.setProperty("--lg-search-hue", settings.hue);
    root.style.setProperty("--lg-search-blur", `${settings.refraction}px`);
    for (const [key, , , , suffix] of controls) {
      panel.querySelector(`[data-setting="${key}"]`).value = settings[key];
      panel.querySelector(`[data-output="${key}"]`).value = `${settings[key]}${suffix}`;
    }
  };

  button.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    button.setAttribute("aria-expanded", String(!panel.hidden));
  });
  panel.addEventListener("input", async (event) => {
    const key = event.target.dataset.setting;
    if (!key) return;
    settings[key] = Number(event.target.value);
    apply(settings);
    await chrome.storage.local.set({ [key]: settings[key] });
  });

  chrome.storage.local.get({ ...defaults, customWallpaper: "" }).then((stored) => {
    apply(stored);
    const wallpaperSource = stored.customWallpaper || chrome.runtime.getURL("assets/reference-flow-wallpaper.png");
    root.style.setProperty("--lg-search-wallpaper", `url("${wallpaperSource}")`);
    WallpaperPhysics.mount(wallpaperCanvas, wallpaperSource, { motion: stored.motion, refraction: stored.refraction });
    LiquidPhysics.mount(liquidCanvas, { hue: stored.hue, motion: stored.motion });
  });

  let active = null;
  const selector = "#searchform, form[role='search'], #searchform .sbct, .A8SBwf [role='option'], #rso, .MjjYud, .g, .isv-r, [role='button']";
  document.addEventListener("pointermove", (event) => {
    const surface = event.target.closest(selector);
    if (surface !== active) {
      active?.removeAttribute("data-lg-search-active");
      active = surface;
    }
    if (!surface) return;
    const bounds = surface.getBoundingClientRect();
    surface.style.setProperty("--lg-search-x", `${event.clientX - bounds.left}px`);
    surface.style.setProperty("--lg-search-y", `${event.clientY - bounds.top}px`);
    surface.setAttribute("data-lg-search-active", "true");
  }, { passive: true });
  document.addEventListener("pointerleave", () => active?.removeAttribute("data-lg-search-active"));
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes.customWallpaper) location.reload();
  });
})();

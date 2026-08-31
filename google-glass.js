(() => {
  const defaults = { transparency: 62, contrast: 108, hue: 214, motion: 100, refraction: 28 };
  const root = document.documentElement;
  const button = document.createElement("button");
  const panel = document.createElement("section");
  button.className = "lg-control";
  button.textContent = "◐ 글라스";
  button.setAttribute("aria-expanded", "false");
  panel.className = "lg-panel";
  panel.hidden = true;
  const controls = [
    ["transparency", "투명도", 15, 88],
    ["contrast", "콘트라스트", 80, 155],
    ["hue", "색조", 0, 360],
    ["motion", "흐름", 0, 160],
    ["refraction", "굴절", 8, 42]
  ];
  panel.innerHTML = controls.map(([key, label, min, max]) => `<label>${label}<output id="lg-${key}-value"></output><input id="lg-${key}" type="range" min="${min}" max="${max}" /></label>`).join("");
  const wallpaperCanvas = document.createElement("canvas");
  wallpaperCanvas.className = "wallpaper-physics-canvas";
  wallpaperCanvas.setAttribute("aria-hidden", "true");
  const canvas = document.createElement("canvas");
  canvas.className = "liquid-physics-canvas";
  canvas.setAttribute("aria-hidden", "true");
  document.body.append(wallpaperCanvas, canvas, button, panel);
  const apply = (settings) => {
    root.style.setProperty("--lg-alpha", settings.transparency / 100);
    root.style.setProperty("--lg-contrast", `${settings.contrast}%`);
    root.style.setProperty("--lg-hue", settings.hue);
    root.style.setProperty("--lg-blur", `${settings.refraction}px`);
    Object.entries(settings).forEach(([key, value]) => {
      panel.querySelector(`#lg-${key}`).value = value;
      panel.querySelector(`#lg-${key}-value`).value = `${value}${key === "hue" ? "°" : key === "refraction" ? "px" : "%"}`;
    });
  };
  button.addEventListener("click", () => { panel.hidden = !panel.hidden; button.setAttribute("aria-expanded", String(!panel.hidden)); });
  Object.keys(defaults).forEach((key) => panel.querySelector(`#lg-${key}`).addEventListener("input", async (event) => { const settings = { ...defaults, ...(await chrome.storage.local.get(defaults)), [key]: Number(event.target.value) }; apply(settings); chrome.storage.local.set(settings); }));
  chrome.storage.local.get(defaults).then((settings) => {
    apply(settings);
    WallpaperPhysics.mount(wallpaperCanvas, chrome.runtime.getURL("assets/reference-flow-wallpaper.png"), { motion: settings.motion, refraction: settings.refraction });
    LiquidPhysics.mount(canvas, { hue: settings.hue, motion: settings.motion });
  });

  const excludedTags = new Set(["CANVAS", "IMG", "VIDEO", "SVG", "IFRAME", "INPUT", "TEXTAREA"]);
  const editorSelector = "[contenteditable='true'], .kix-appview-editor, .docs-canvas-container, .docs-sheet-container, .waffle, .grid-container";
  const parseRgb = (value) => {
    const numbers = value.match(/[\d.]+/g)?.map(Number) || [];
    return { r: numbers[0] || 0, g: numbers[1] || 0, b: numbers[2] || 0, a: numbers.length > 3 ? numbers[3] : 1 };
  };
  const setPageTone = () => {
    const color = parseRgb(getComputedStyle(document.body).color);
    const luminance = (color.r * 299 + color.g * 587 + color.b * 114) / 1000;
    root.dataset.lgPageTone = luminance < 135 ? "light" : "dark";
    root.dataset.lgGoogleApp = location.hostname.split(".")[0] || "google";
  };
  const classifyStructuralSurfaces = () => {
    setPageTone();
    const viewportArea = innerWidth * innerHeight;
    const candidates = Array.from(document.querySelectorAll("body div, body main, body section, body nav, body aside")).slice(0, 1000);
    for (const element of candidates) {
      if (excludedTags.has(element.tagName) || element.matches(".lg-control, .lg-panel, .wallpaper-physics-canvas, .liquid-physics-canvas") || element.closest(editorSelector)) continue;
      const bounds = element.getBoundingClientRect();
      const area = Math.max(0, bounds.width) * Math.max(0, bounds.height);
      const role = element.getAttribute("role");
      const semantic = ["main", "navigation", "complementary", "dialog"].includes(role);
      const large = bounds.width >= innerWidth * .46 && bounds.height >= innerHeight * .24 && area >= viewportArea * .18;
      if (!large && !semantic) continue;
      const style = getComputedStyle(element);
      const background = parseRgb(style.backgroundColor);
      if (background.a < .55 || (style.backgroundImage !== "none" && style.backgroundImage.includes("url("))) continue;
      element.classList.add("lg-structural-surface");
      if (semantic && area < viewportArea * .88) element.classList.add("lg-app-surface");
    }
  };
  let classifyPending = false;
  const scheduleClassification = () => {
    if (classifyPending) return;
    classifyPending = true;
    setTimeout(() => {
      classifyPending = false;
      classifyStructuralSurfaces();
    }, 350);
  };
  classifyStructuralSurfaces();
  new MutationObserver(scheduleClassification).observe(document.body, { childList: true, subtree: true });
  addEventListener("resize", scheduleClassification, { passive: true });

  let activeSurface = null;
  const surfaceSelector = ".sbct, #searchform, #rso, .MjjYud, .g, .isv-r, .lg-control, .lg-panel, [role='button'], [role='listitem'], [role='row'], [role='tab'], [role='menuitem']";
  document.addEventListener("pointermove", (event) => {
    const surface = event.target.closest(surfaceSelector);
    if (surface !== activeSurface) {
      activeSurface?.removeAttribute("data-lg-active");
      activeSurface = surface;
    }
    if (!surface) return;
    if (!surface.matches(".sbct, #searchform, #rso, .MjjYud, .g, .isv-r, .lg-control, .lg-panel")) surface.classList.add("lg-pointer-surface");
    const bounds = surface.getBoundingClientRect();
    surface.style.setProperty("--lg-local-x", `${event.clientX - bounds.left}px`);
    surface.style.setProperty("--lg-local-y", `${event.clientY - bounds.top}px`);
    surface.setAttribute("data-lg-active", "true");
  }, { passive: true });
  document.addEventListener("pointerleave", () => {
    activeSurface?.removeAttribute("data-lg-active");
    activeSurface = null;
  });
})();

const $ = (selector) => document.querySelector(selector);
const MAX_BOOKMARKS = 8;
const defaults = {
  transparency: 62, contrast: 108, hue: 214, motion: 100, refraction: 28,
  panelSaturation: 165, borderOpacity: 22, cornerRadius: 25, shadowStrength: 32,
  glowStrength: 50, buttonOpacity: 16, buttonGlow: 45, pointerGlow: 68,
  liquidOpacity: 34, noiseOpacity: 6, wallpaperDim: 18
};
const settingUnits = {
  transparency: "%", contrast: "%", hue: "°", motion: "%", refraction: "px",
  panelSaturation: "%", borderOpacity: "%", cornerRadius: "px", shadowStrength: "%",
  glowStrength: "%", buttonOpacity: "%", buttonGlow: "%", pointerGlow: "%",
  liquidOpacity: "%", noiseOpacity: "%", wallpaperDim: "%"
};
const DEFAULT_WALLPAPER = "assets/reference-flow-wallpaper.png";
const storage = globalThis.chrome?.storage?.local ?? {
  async get(fallback) { return { ...fallback }; },
  async set() {}
};

function initials(value) {
  return (value || "?").trim().slice(0, 1).toUpperCase();
}

function hostname(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

function iconMarkup(title) {
  return `<span class="favicon" aria-hidden="true">${initials(title)}</span>`;
}

function safeText(value) {
  const element = document.createElement("span");
  element.textContent = value || "이름 없음";
  return element.innerHTML;
}

function bookmarkMarkup(node) {
  return `<a class="bookmark" href="${node.url}">${iconMarkup(node.title)}<span class="bookmark-label">${safeText(node.title)}</span></a>`;
}

function siteMarkup(site) {
  const domain = hostname(site.url);
  return `<a class="site" href="${site.url}">${iconMarkup(site.title || domain)}<span class="site-copy"><span class="site-title">${safeText(site.title || domain)}</span><span class="site-url">${safeText(domain)}</span></span></a>`;
}

async function getBookmarkLeaves() {
  if (!globalThis.chrome?.bookmarks) return [];
  const tree = await chrome.bookmarks.getTree();
  const leaves = [];
  const walk = (nodes) => nodes.forEach((node) => {
    if (node.url) leaves.push(node);
    if (node.children) walk(node.children);
  });
  walk(tree);
  return leaves.slice(0, MAX_BOOKMARKS);
}

async function populateCollections() {
  const [bookmarks, sites] = await Promise.all([
    getBookmarkLeaves().catch(() => []),
    globalThis.chrome?.topSites ? chrome.topSites.get().catch(() => []) : Promise.resolve([])
  ]);
  $("#bookmarks").innerHTML = bookmarks.length
    ? bookmarks.map(bookmarkMarkup).join("")
    : '<p class="empty">북마크를 추가하면 여기에 표시됩니다.</p>';
  $("#top-sites").innerHTML = sites.length
    ? sites.slice(0, 5).map(siteMarkup).join("")
    : '<p class="empty">자주 방문한 사이트가 여기에 표시됩니다.</p>';
}

function updateClock() {
  const now = new Date();
  const hour = now.getHours();
  $("#time").textContent = now.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
  $("#time").dateTime = now.toISOString();
  $("#date").textContent = now.toLocaleDateString("ko-KR", { weekday: "long", month: "long", day: "numeric" });
  $("#date").dateTime = now.toISOString();
  $("#greeting").textContent = hour < 12 ? "좋은 아침입니다" : hour < 18 ? "좋은 오후입니다" : "편안한 저녁입니다";
}

function openSearch(value) {
  const query = value.trim();
  if (!query) return;
  const looksLikeUrl = /^(https?:\/\/|localhost[:/]|[\w-]+\.[a-z]{2,})(\/|:|$)/i.test(query);
  window.location.href = looksLikeUrl ? (query.startsWith("http") ? query : `https://${query}`) : `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

$("#search-form").addEventListener("submit", (event) => { event.preventDefault(); openSearch($("#search-input").value); });
document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); $("#search-input").focus(); }
  if (event.key === "/" && document.activeElement === document.body) { event.preventDefault(); $("#search-input").focus(); }
});

$("#manage-bookmarks").addEventListener("click", async () => {
  if (globalThis.chrome?.tabs?.create) {
    await chrome.tabs.create({ url: "chrome://bookmarks/" });
    return;
  }
  window.location.href = "chrome://bookmarks/";
});
$("#focus-toggle").addEventListener("click", (event) => {
  document.body.classList.toggle("focus-mode");
  event.currentTarget.setAttribute("aria-pressed", String(document.body.classList.contains("focus-mode")));
});
$("#appearance-toggle").addEventListener("click", async (event) => {
  document.body.classList.toggle("light");
  const light = document.body.classList.contains("light");
  event.currentTarget.setAttribute("aria-pressed", String(light));
  event.currentTarget.setAttribute("aria-label", light ? "어두운 화면으로 전환" : "밝은 화면으로 전환");
  await storage.set({ light });
});

function applyGlassSettings(settings) {
  document.documentElement.style.setProperty("--glass-alpha", settings.transparency / 100);
  document.documentElement.style.setProperty("--contrast", `${settings.contrast}%`);
  document.documentElement.style.setProperty("--tint", settings.hue);
  document.documentElement.style.setProperty("--glass-blur", `${settings.refraction}px`);
  document.documentElement.style.setProperty("--panel-saturation", `${settings.panelSaturation}%`);
  document.documentElement.style.setProperty("--border-opacity", settings.borderOpacity / 100);
  document.documentElement.style.setProperty("--corner-radius", `${settings.cornerRadius}px`);
  document.documentElement.style.setProperty("--shadow-strength", settings.shadowStrength / 100);
  document.documentElement.style.setProperty("--glow-strength", settings.glowStrength / 1000);
  document.documentElement.style.setProperty("--button-opacity", settings.buttonOpacity / 100);
  document.documentElement.style.setProperty("--button-glow", settings.buttonGlow / 1000);
  document.documentElement.style.setProperty("--pointer-glow", settings.pointerGlow / 100);
  document.documentElement.style.setProperty("--liquid-opacity", settings.liquidOpacity / 100);
  document.documentElement.style.setProperty("--noise-opacity", settings.noiseOpacity / 100);
  document.documentElement.style.setProperty("--wallpaper-dim", settings.wallpaperDim / 100);
  for (const [key, value] of Object.entries(settings)) {
    $("#" + key).value = value;
    $("#" + key + "-value").value = `${value}${settingUnits[key]}`;
  }
}

$("#settings-button").addEventListener("click", () => $("#settings-dialog").showModal());
for (const key of Object.keys(defaults)) {
  $("#" + key).addEventListener("input", async (event) => {
    const settings = { ...defaults, ...(await storage.get(defaults)), [key]: Number(event.target.value) };
    applyGlassSettings(settings);
    await storage.set(settings);
  });
}
$("#reset-settings").addEventListener("click", async () => { applyGlassSettings(defaults); await storage.set(defaults); });

function compressWallpaper(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) return reject(new Error("이미지 파일만 선택할 수 있습니다."));
    if (file.size > 20 * 1024 * 1024) return reject(new Error("20MB 이하 이미지를 선택해 주세요."));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("이미지를 읽지 못했습니다."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("지원되지 않는 이미지입니다."));
      image.onload = () => {
        const maxWidth = 2560;
        const maxHeight = 1440;
        const scale = Math.min(1, maxWidth / image.naturalWidth, maxHeight / image.naturalHeight);
        const width = Math.max(1, Math.round(image.naturalWidth * scale));
        const height = Math.max(1, Math.round(image.naturalHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d", { alpha: false });
        context.drawImage(image, 0, 0, width, height);
        canvas.toBlob((blob) => {
          if (!blob) return reject(new Error("이미지 변환에 실패했습니다."));
          const output = new FileReader();
          output.onerror = () => reject(new Error("변환된 이미지를 읽지 못했습니다."));
          output.onload = () => resolve(output.result);
          output.readAsDataURL(blob);
        }, "image/jpeg", .9);
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function applyWallpaper(source) {
  const value = source || DEFAULT_WALLPAPER;
  document.documentElement.style.setProperty("--wallpaper-image", `url("${value}")`);
  return value;
}

$("#choose-wallpaper").addEventListener("click", () => $("#wallpaper-file").click());
$("#wallpaper-file").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const status = $("#wallpaper-status");
  status.textContent = "배경을 최적화하는 중…";
  try {
    const customWallpaper = await compressWallpaper(file);
    await storage.set({ customWallpaper });
    status.textContent = "배경이 변경되었습니다.";
    location.reload();
  } catch (error) {
    status.textContent = error.message;
    event.target.value = "";
  }
});
$("#reset-wallpaper").addEventListener("click", async () => {
  await storage.set({ customWallpaper: "" });
  $("#wallpaper-status").textContent = "기본 배경으로 복원되었습니다.";
  location.reload();
});

async function initialize() {
  const { light = false, customWallpaper = "", ...storedSettings } = await storage.get({ light: false, customWallpaper: "", ...defaults });
  document.body.classList.toggle("light", light);
  $("#appearance-toggle").setAttribute("aria-pressed", String(light));
  applyGlassSettings(storedSettings);
  const wallpaperSource = applyWallpaper(customWallpaper);
  WallpaperPhysics.mount($("#wallpaper-canvas"), wallpaperSource, { motion: storedSettings.motion, refraction: storedSettings.refraction });
  LiquidPhysics.mount($("#liquid-canvas"), { hue: storedSettings.hue, motion: storedSettings.motion });
  updateClock();
  setInterval(updateClock, 1000);
  populateCollections();
}

initialize();

let activeGlassSurface = null;
const glassSelector = ".glass-panel, .bookmark, .site, .icon-button, .text-button";
document.addEventListener("pointermove", (event) => {
  const surface = event.target.closest(glassSelector);
  if (activeGlassSurface !== surface) {
    activeGlassSurface?.removeAttribute("data-glass-active");
    activeGlassSurface = surface;
  }
  if (!surface) return;
  const bounds = surface.getBoundingClientRect();
  surface.style.setProperty("--local-x", `${event.clientX - bounds.left}px`);
  surface.style.setProperty("--local-y", `${event.clientY - bounds.top}px`);
  surface.setAttribute("data-glass-active", "true");
}, { passive: true });
document.addEventListener("pointerleave", () => {
  activeGlassSurface?.removeAttribute("data-glass-active");
  activeGlassSurface = null;
});

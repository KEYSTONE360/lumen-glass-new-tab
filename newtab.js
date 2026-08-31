const $ = (selector) => document.querySelector(selector);
const MAX_BOOKMARKS = 8;
const defaults = { transparency: 62, contrast: 108, hue: 214, motion: 100, refraction: 28 };
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
  $("#transparency-value").value = `${settings.transparency}%`;
  $("#contrast-value").value = `${settings.contrast}%`;
  $("#hue-value").value = `${settings.hue}°`;
  $("#motion-value").value = `${settings.motion}%`;
  $("#refraction-value").value = `${settings.refraction}px`;
  for (const [key, value] of Object.entries(settings)) $("#" + key).value = value;
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

async function initialize() {
  const { light = false, ...storedSettings } = await storage.get({ light: false, ...defaults });
  document.body.classList.toggle("light", light);
  $("#appearance-toggle").setAttribute("aria-pressed", String(light));
  applyGlassSettings(storedSettings);
  WallpaperPhysics.mount($("#wallpaper-canvas"), "assets/reference-flow-wallpaper.png", { motion: storedSettings.motion, refraction: storedSettings.refraction });
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

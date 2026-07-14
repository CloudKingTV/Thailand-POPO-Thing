/* POPO Map — community police checkpoint map for Bangkok */

// ---------------------------------------------------------------------------
// i18n
// ---------------------------------------------------------------------------

const I18N = {
  th: {
    subtitle: "ด่านตรวจ กรุงเทพฯ",
    report: "รายงานด่าน",
    tapMap: "แตะบนแผนที่เพื่อระบุตำแหน่งด่าน",
    cancel: "ยกเลิก",
    whatKind: "เจอด่านแบบไหน?",
    descPlaceholder: "รายละเอียดเพิ่มเติม (ไม่บังคับ)",
    submit: "ส่งรายงาน",
    recent: "รายงานล่าสุด",
    noReports: "ยังไม่มีรายงานตอนนี้ 🎉",
    reported: "รายงานแล้ว ขอบคุณ! 🙏",
    confirmed: "ยืนยันแล้ว ด่านยังอยู่",
    cleared: "บันทึกแล้วว่าด่านไปแล้ว",
    removed: "ด่านถูกลบออกจากแผนที่แล้ว",
    alreadyVoted: "คุณโหวตรายงานนี้ไปแล้ว",
    error: "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง",
    stillThere: "ยังอยู่ 👀",
    gone: "ไปแล้ว ✅",
    confirms: "ยืนยัน",
    justNow: "เมื่อสักครู่",
    minAgo: "นาทีที่แล้ว",
    hourAgo: "ชม.ที่แล้ว",
    locating: "กำลังหาตำแหน่งของคุณ...",
    locationError: "ไม่สามารถหาตำแหน่งได้",
    title: "POPO Map — ด่านตรวจกรุงเทพฯ",
    types: {
      checkpoint: "ด่านตรวจ",
      license: "ตรวจใบขับขี่",
      alcohol: "ด่านแอลกอฮอล์",
      helmet: "ตรวจหมวกกันน็อค",
      speed: "ตรวจความเร็ว",
      police: "มีตำรวจ",
    },
  },
  en: {
    subtitle: "Police checkpoints · Bangkok",
    report: "Report",
    tapMap: "Tap the map to mark the checkpoint location",
    cancel: "Cancel",
    whatKind: "What kind of stop?",
    descPlaceholder: "Extra details (optional)",
    submit: "Submit report",
    recent: "Recent reports",
    noReports: "No active reports right now 🎉",
    reported: "Reported, thank you! 🙏",
    confirmed: "Confirmed — still there",
    cleared: "Noted — marked as gone",
    removed: "Report removed from the map",
    alreadyVoted: "You already voted on this report",
    error: "Something went wrong, try again",
    stillThere: "Still there 👀",
    gone: "Gone ✅",
    confirms: "confirms",
    justNow: "just now",
    minAgo: "min ago",
    hourAgo: "h ago",
    locating: "Finding your location...",
    locationError: "Couldn't get your location",
    title: "POPO Map — Bangkok Police Checkpoints",
    types: {
      checkpoint: "Checkpoint",
      license: "License check",
      alcohol: "Alcohol checkpoint",
      helmet: "Helmet check",
      speed: "Speed check",
      police: "Police presence",
    },
  },
};

const TYPE_EMOJI = {
  checkpoint: "🚧",
  license: "🪪",
  alcohol: "🍺",
  helmet: "🪖",
  speed: "📸",
  police: "👮",
};

// Saved preference wins; otherwise follow the browser language.
let lang = localStorage.getItem("popo-lang") ||
  ((navigator.language || "").toLowerCase().startsWith("th") ? "th" : "en");
const t = (key) => I18N[lang][key] ?? key;
const typeName = (type) => I18N[lang].types[type] ?? type;

// ---------------------------------------------------------------------------
// Map
// ---------------------------------------------------------------------------

const BANGKOK = [13.7563, 100.5018];

const map = L.map("map", { zoomControl: false }).setView(BANGKOK, 12);
L.control.zoom({ position: "topright" }).addTo(map);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

const markersLayer = L.layerGroup().addTo(map);
const markerById = new Map();
let reportsCache = [];

// ---------------------------------------------------------------------------
// DOM refs
// ---------------------------------------------------------------------------

const $ = (id) => document.getElementById(id);
const reportBtn = $("reportBtn");
const locateBtn = $("locateBtn");
const langBtn = $("langBtn");
const listBtn = $("listBtn");
const listPanel = $("listPanel");
const listBody = $("listBody");
const pickBanner = $("pickBanner");
const sheet = $("sheet");
const typeGrid = $("typeGrid");
const descInput = $("descInput");
const sheetSubmit = $("sheetSubmit");
const overlay = $("overlay");
const toastEl = $("toast");

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

let toastTimer = null;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.add("hidden"), 2600);
}

function timeAgo(ts) {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return t("justNow");
  if (mins < 60) return `${mins} ${t("minAgo")}`;
  return `${Math.floor(mins / 60)} ${t("hourAgo")}`;
}

function applyLang() {
  langBtn.textContent = lang === "th" ? "EN" : "ไทย";
  document.documentElement.lang = lang;
  document.title = t("title");
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  buildTypeGrid();
  renderReports(reportsCache);
  renderList();
}

langBtn.addEventListener("click", () => {
  lang = lang === "th" ? "en" : "th";
  localStorage.setItem("popo-lang", lang);
  applyLang();
});

// ---------------------------------------------------------------------------
// Report flow: pick location -> choose type -> submit
// ---------------------------------------------------------------------------

let picking = false;
let pickedLatLng = null;
let pickedMarker = null;
let selectedType = null;

function startPicking() {
  picking = true;
  pickBanner.classList.remove("hidden");
  reportBtn.classList.add("hidden");
  document.getElementById("map").classList.add("picking");
}

function stopPicking() {
  picking = false;
  pickBanner.classList.add("hidden");
  reportBtn.classList.remove("hidden");
  document.getElementById("map").classList.remove("picking");
  if (pickedMarker) {
    map.removeLayer(pickedMarker);
    pickedMarker = null;
  }
  pickedLatLng = null;
}

function openSheet() {
  selectedType = null;
  descInput.value = "";
  sheetSubmit.disabled = true;
  buildTypeGrid();
  sheet.classList.remove("hidden");
  overlay.classList.remove("hidden");
}

function closeSheet() {
  sheet.classList.add("hidden");
  overlay.classList.add("hidden");
}

function buildTypeGrid() {
  typeGrid.innerHTML = "";
  for (const type of Object.keys(TYPE_EMOJI)) {
    const btn = document.createElement("button");
    btn.className = "type-btn" + (selectedType === type ? " selected" : "");
    btn.innerHTML = `<span class="emoji">${TYPE_EMOJI[type]}</span><span>${typeName(type)}</span>`;
    btn.addEventListener("click", () => {
      selectedType = type;
      sheetSubmit.disabled = false;
      buildTypeGrid();
    });
    typeGrid.appendChild(btn);
  }
}

reportBtn.addEventListener("click", startPicking);
$("pickCancel").addEventListener("click", stopPicking);

map.on("click", (e) => {
  if (!picking) return;
  pickedLatLng = e.latlng;
  if (pickedMarker) map.removeLayer(pickedMarker);
  pickedMarker = L.marker(e.latlng).addTo(map);
  openSheet();
});

$("sheetCancel").addEventListener("click", () => {
  closeSheet();
  stopPicking();
});
overlay.addEventListener("click", () => {
  closeSheet();
  stopPicking();
});

sheetSubmit.addEventListener("click", async () => {
  if (!pickedLatLng || !selectedType) return;
  sheetSubmit.disabled = true;
  try {
    const res = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lat: pickedLatLng.lat,
        lng: pickedLatLng.lng,
        type: selectedType,
        description: descInput.value.trim(),
      }),
    });
    if (!res.ok) throw new Error();
    closeSheet();
    stopPicking();
    toast(t("reported"));
    await fetchReports();
  } catch {
    toast(t("error"));
    sheetSubmit.disabled = false;
  }
});

// ---------------------------------------------------------------------------
// Markers & popups
// ---------------------------------------------------------------------------

function popupHtml(r) {
  const div = document.createElement("div");
  const desc = r.description
    ? `<div class="popup-desc">${escapeHtml(r.description)}</div>`
    : "";
  div.innerHTML = `
    <div class="popup-title">${TYPE_EMOJI[r.type] || "🚧"} ${typeName(r.type)}</div>
    ${desc}
    <div class="popup-meta">${timeAgo(r.createdAt)} · ${r.confirms} ${t("confirms")}</div>
    <div class="popup-actions">
      <button class="confirm-btn">${t("stillThere")}</button>
      <button class="clear-btn">${t("gone")}</button>
    </div>`;
  div.querySelector(".confirm-btn").addEventListener("click", () => voteOn(r.id, "confirm"));
  div.querySelector(".clear-btn").addEventListener("click", () => voteOn(r.id, "clear"));
  return div;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

async function voteOn(id, kind) {
  try {
    const res = await fetch(`/api/reports/${id}/${kind}`, { method: "POST" });
    if (res.status === 409) {
      toast(t("alreadyVoted"));
      return;
    }
    if (!res.ok) throw new Error();
    const data = await res.json();
    map.closePopup();
    toast(data.removed ? t("removed") : kind === "confirm" ? t("confirmed") : t("cleared"));
    await fetchReports();
  } catch {
    toast(t("error"));
  }
}

function renderReports(reports) {
  reportsCache = reports;
  const seen = new Set();
  for (const r of reports) {
    seen.add(r.id);
    const isStale = Date.now() - r.createdAt > 2 * 60 * 60 * 1000;
    const icon = L.divIcon({
      className: "",
      html: `<div class="report-marker${isStale ? " stale" : ""}">${TYPE_EMOJI[r.type] || "🚧"}</div>`,
      iconSize: [38, 38],
      iconAnchor: [19, 36],
      popupAnchor: [0, -34],
    });
    let marker = markerById.get(r.id);
    if (!marker) {
      marker = L.marker([r.lat, r.lng], { icon }).addTo(markersLayer);
      markerById.set(r.id, marker);
    } else {
      marker.setIcon(icon);
    }
    marker.unbindPopup();
    marker.bindPopup(() => popupHtml(reports.find((x) => x.id === r.id) || r));
  }
  for (const [id, marker] of markerById) {
    if (!seen.has(id)) {
      markersLayer.removeLayer(marker);
      markerById.delete(id);
    }
  }
}

// ---------------------------------------------------------------------------
// Recent reports list
// ---------------------------------------------------------------------------

function renderList() {
  listBody.innerHTML = "";
  const sorted = [...reportsCache].sort((a, b) => b.createdAt - a.createdAt);
  if (sorted.length === 0) {
    listBody.innerHTML = `<div class="list-empty">${t("noReports")}</div>`;
    return;
  }
  for (const r of sorted) {
    const item = document.createElement("div");
    item.className = "list-item";
    item.innerHTML = `
      <span class="emoji">${TYPE_EMOJI[r.type] || "🚧"}</span>
      <div class="li-main">
        <div class="li-title">${typeName(r.type)}</div>
        ${r.description ? `<div class="li-desc">${escapeHtml(r.description)}</div>` : ""}
        <div class="li-meta">${timeAgo(r.createdAt)} · ${r.confirms} ${t("confirms")}</div>
      </div>`;
    item.addEventListener("click", () => {
      listPanel.classList.add("hidden");
      map.setView([r.lat, r.lng], 15);
      markerById.get(r.id)?.openPopup();
    });
    listBody.appendChild(item);
  }
}

listBtn.addEventListener("click", () => {
  renderList();
  listPanel.classList.toggle("hidden");
});
$("listClose").addEventListener("click", () => listPanel.classList.add("hidden"));

// ---------------------------------------------------------------------------
// Geolocation
// ---------------------------------------------------------------------------

let myLocationMarker = null;
locateBtn.addEventListener("click", () => {
  if (!navigator.geolocation) {
    toast(t("locationError"));
    return;
  }
  toast(t("locating"));
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const latlng = [pos.coords.latitude, pos.coords.longitude];
      if (myLocationMarker) map.removeLayer(myLocationMarker);
      myLocationMarker = L.circleMarker(latlng, {
        radius: 8,
        color: "#2563eb",
        fillColor: "#3b82f6",
        fillOpacity: 0.9,
        weight: 2,
      }).addTo(map);
      map.setView(latlng, 15);
    },
    () => toast(t("locationError")),
    { enableHighAccuracy: true, timeout: 10000 }
  );
});

// ---------------------------------------------------------------------------
// Data polling
// ---------------------------------------------------------------------------

async function fetchReports() {
  try {
    const res = await fetch("/api/reports");
    if (!res.ok) return;
    const data = await res.json();
    renderReports(data.reports);
    if (!listPanel.classList.contains("hidden")) renderList();
  } catch {
    /* offline — keep showing what we have */
  }
}

applyLang();
fetchReports();
setInterval(fetchReports, 30_000);

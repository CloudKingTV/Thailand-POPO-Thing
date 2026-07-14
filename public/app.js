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
    markUsual: "🔁 จุดนี้เป็นด่านประจำ (ทำเครื่องหมายไว้)",
    usualSpot: "จุดด่านประจำ",
    usualSpotSub: "ชุมชนทำเครื่องหมายว่ามักมีด่านบริเวณนี้",
    reportHere: "รายงานว่ามีด่านตอนนี้",
    markedUsual: "ทำเครื่องหมายจุดด่านประจำแล้ว 📍",
    reportsWord: "รายงาน",
    proxSub: "คุณอยู่ใกล้ด่านนี้ — ยังอยู่ไหม?",
    proxStill: "ยังอยู่",
    proxGone: "ไปแล้ว",
    finesTitle: "ค่าปรับจราจร (โดยประมาณ)",
    finesNote:
      "จำนวนโดยประมาณตาม พ.ร.บ.จราจรทางบก ค่าปรับจริงขึ้นอยู่กับดุลยพินิจของเจ้าหน้าที่ พื้นที่ และการแก้ไขกฎหมาย ใช้เป็นแนวทางคร่าว ๆ ไม่ใช่คำแนะนำทางกฎหมาย",
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
    markUsual: "🔁 This is a usual/recurring spot (mark it)",
    usualSpot: "Usual checkpoint spot",
    usualSpotSub: "Community-marked recurring checkpoint area",
    reportHere: "Report a checkpoint here now",
    markedUsual: "Marked as a usual spot 📍",
    reportsWord: "reports",
    proxSub: "You're near this checkpoint — still there?",
    proxStill: "Still there",
    proxGone: "Gone",
    finesTitle: "Traffic fines (approximate)",
    finesNote:
      "Approximate amounts under the Land Traffic Act. Actual fines vary with officer discretion, province, and law changes — treat this as a rough guide, not legal advice.",
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

// Rough reference of common Thai traffic fines. Amounts are approximate
// maximums under the Land Traffic Act; a disclaimer is shown alongside.
const FINES = [
  { emoji: "🪖", en: "No helmet (motorcycle)", th: "ไม่สวมหมวกกันน็อก", amtEn: "up to ฿500 (often ~฿400)", amtTh: "สูงสุด 500 บาท (มักพบ ~400)" },
  { emoji: "📸", en: "Speeding", th: "ขับเร็วเกินกำหนด", amtEn: "up to ฿1,000", amtTh: "สูงสุด 1,000 บาท" },
  { emoji: "🪪", en: "No driver's license", th: "ไม่มีใบขับขี่", amtEn: "up to ฿1,000", amtTh: "สูงสุด 1,000 บาท" },
  { emoji: "📄", en: "License not carried", th: "ไม่พกใบขับขี่", amtEn: "up to ฿1,000 (often ~฿200)", amtTh: "สูงสุด 1,000 บาท (มักพบ ~200)" },
  { emoji: "🚦", en: "Running a red light", th: "ฝ่าไฟแดง", amtEn: "up to ฿1,000", amtTh: "สูงสุด 1,000 บาท" },
  { emoji: "📱", en: "Phone while driving", th: "ใช้โทรศัพท์ขณะขับ", amtEn: "up to ฿1,000", amtTh: "สูงสุด 1,000 บาท" },
  { emoji: "🔒", en: "No seatbelt", th: "ไม่คาดเข็มขัดนิรภัย", amtEn: "up to ฿2,000", amtTh: "สูงสุด 2,000 บาท" },
  { emoji: "🏍️", en: "Loud / modified exhaust", th: "ท่อไอเสียเสียงดัง/ดัดแปลง", amtEn: "up to ฿1,000", amtTh: "สูงสุด 1,000 บาท" },
  { emoji: "🍺", en: "Drink driving", th: "เมาแล้วขับ", amtEn: "฿5,000–20,000 + court, possible jail & licence suspension", amtTh: "5,000–20,000 บาท + ขึ้นศาล อาจถูกจำคุก/พักใบขับขี่" },
];

// Great-circle distance in metres (Haversine).
function distMeters(aLat, aLng, bLat, bLng) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

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

const spotsLayer = L.layerGroup().addTo(map);
const markersLayer = L.layerGroup().addTo(map);
const markerById = new Map();
const spotMarkerById = new Map();
let reportsCache = [];
let spotsCache = [];

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
const recurringChk = $("recurringChk");
const sheetSubmit = $("sheetSubmit");
const overlay = $("overlay");
const toastEl = $("toast");
const finesBtn = $("finesBtn");
const finesSheet = $("finesSheet");
const proxCard = $("proxCard");

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
  renderSpots(spotsCache);
  renderList();
  buildFines();
  $("proxStill").textContent = t("proxStill");
  $("proxGone").textContent = t("proxGone");
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
  recurringChk.checked = false;
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
        recurring: recurringChk.checked,
      }),
    });
    if (!res.ok) throw new Error();
    const markedUsual = recurringChk.checked;
    closeSheet();
    stopPicking();
    toast(markedUsual ? t("markedUsual") : t("reported"));
    await Promise.all([fetchReports(), fetchSpots()]);
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
// Usual spots (persistent, community-marked recurring checkpoints)
// ---------------------------------------------------------------------------

function spotLabel(s) {
  const l = lang === "th" ? s.labelTh || s.label : s.label || s.labelTh;
  return l || t("usualSpot");
}

function spotPopupHtml(s) {
  const div = document.createElement("div");
  const count = s.reportCount
    ? `<div class="popup-meta">${s.reportCount} ${t("reportsWord")}</div>`
    : "";
  div.innerHTML = `
    <div class="popup-title">📍 ${escapeHtml(spotLabel(s))}</div>
    <div class="popup-desc">${t("usualSpotSub")}</div>
    ${count}
    <div class="popup-actions">
      <button class="confirm-btn spot-report-btn">${t("reportHere")}</button>
    </div>`;
  div.querySelector(".spot-report-btn").addEventListener("click", () => {
    map.closePopup();
    reportAtSpot(s);
  });
  return div;
}

// Pre-fill the report flow at a known spot's location.
function reportAtSpot(s) {
  pickedLatLng = L.latLng(s.lat, s.lng);
  if (pickedMarker) map.removeLayer(pickedMarker);
  pickedMarker = L.marker(pickedLatLng).addTo(map);
  picking = true; // so cancel cleans up the temp marker
  openSheet();
}

function renderSpots(spots) {
  spotsCache = spots;
  const seen = new Set();
  for (const s of spots) {
    seen.add(s.id);
    const icon = L.divIcon({
      className: "",
      html: `<div class="spot-marker"><span class="spot-glyph">🚓</span></div>`,
      iconSize: [34, 44],
      iconAnchor: [17, 43],
      popupAnchor: [0, -42],
    });
    let marker = spotMarkerById.get(s.id);
    if (!marker) {
      marker = L.marker([s.lat, s.lng], { icon }).addTo(spotsLayer);
      spotMarkerById.set(s.id, marker);
    }
    marker.unbindPopup();
    marker.bindPopup(() => spotPopupHtml(spotsCache.find((x) => x.id === s.id) || s));
  }
  for (const [id, marker] of spotMarkerById) {
    if (!seen.has(id)) {
      spotsLayer.removeLayer(marker);
      spotMarkerById.delete(id);
    }
  }
}

async function fetchSpots() {
  try {
    const res = await fetch("/api/known-spots");
    if (!res.ok) return;
    const data = await res.json();
    renderSpots(data.spots || []);
  } catch {
    /* keep existing */
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
// Traffic fines reference
// ---------------------------------------------------------------------------

function buildFines() {
  const body = $("finesBody");
  body.innerHTML = "";
  for (const f of FINES) {
    const row = document.createElement("div");
    row.className = "fine-row";
    row.innerHTML = `
      <span class="fine-emoji">${f.emoji}</span>
      <span class="fine-name">${lang === "th" ? f.th : f.en}</span>
      <span class="fine-amt">${lang === "th" ? f.amtTh : f.amtEn}</span>`;
    body.appendChild(row);
  }
}

function openFines() {
  finesSheet.classList.remove("hidden");
  overlay.classList.remove("hidden");
}
function closeFines() {
  finesSheet.classList.add("hidden");
  overlay.classList.add("hidden");
}
finesBtn.addEventListener("click", openFines);
$("finesClose").addEventListener("click", closeFines);

// ---------------------------------------------------------------------------
// Geolocation: locate button + continuous watch for proximity prompts
// ---------------------------------------------------------------------------

let myLocationMarker = null;
let lastPos = null;

function drawMe(lat, lng) {
  const latlng = [lat, lng];
  if (myLocationMarker) {
    myLocationMarker.setLatLng(latlng);
  } else {
    myLocationMarker = L.circleMarker(latlng, {
      radius: 8,
      color: "#2563eb",
      fillColor: "#3b82f6",
      fillOpacity: 0.9,
      weight: 2,
    }).addTo(map);
  }
}

locateBtn.addEventListener("click", () => {
  if (!navigator.geolocation) {
    toast(t("locationError"));
    return;
  }
  toast(t("locating"));
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      drawMe(pos.coords.latitude, pos.coords.longitude);
      map.setView([pos.coords.latitude, pos.coords.longitude], 15);
    },
    () => toast(t("locationError")),
    { enableHighAccuracy: true, timeout: 10000 }
  );
  startGeoWatch();
});

// --- Proximity "still there?" prompt -----------------------------------------

const PROX_ENTER_M = 150; // prompt when this close to an active report
const PROX_REPROMPT_MS = 20 * 60 * 1000; // don't re-nag about the same one
const promptedAt = {}; // reportId -> last prompt timestamp
let proxReportId = null;

function startGeoWatch() {
  if (!navigator.geolocation || startGeoWatch.id != null) return;
  startGeoWatch.id = navigator.geolocation.watchPosition(
    (pos) => {
      lastPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      drawMe(lastPos.lat, lastPos.lng);
      checkProximity();
    },
    () => {},
    { enableHighAccuracy: true, maximumAge: 15000, timeout: 25000 }
  );
}

function checkProximity() {
  if (!lastPos || !proxCard.classList.contains("hidden")) return;
  // Don't pop over an open sheet, the report flow, or the list panel.
  if (!overlay.classList.contains("hidden") || picking) return;
  let best = null;
  let bestD = Infinity;
  for (const r of reportsCache) {
    const d = distMeters(lastPos.lat, lastPos.lng, r.lat, r.lng);
    if (d <= PROX_ENTER_M && d < bestD && Date.now() - (promptedAt[r.id] || 0) > PROX_REPROMPT_MS) {
      best = r;
      bestD = d;
    }
  }
  if (best) showProxPrompt(best);
}

function showProxPrompt(r) {
  proxReportId = r.id;
  promptedAt[r.id] = Date.now();
  $("proxTitle").textContent = `${TYPE_EMOJI[r.type] || "🚧"} ${typeName(r.type)}`;
  proxCard.classList.remove("hidden");
}

function hideProxPrompt() {
  proxCard.classList.add("hidden");
  proxReportId = null;
}

$("proxStill").addEventListener("click", async () => {
  if (proxReportId) await voteOn(proxReportId, "confirm");
  hideProxPrompt();
});
$("proxGone").addEventListener("click", async () => {
  if (proxReportId) await voteOn(proxReportId, "clear");
  hideProxPrompt();
});
$("proxDismiss").addEventListener("click", hideProxPrompt);

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
    checkProximity();
  } catch {
    /* offline — keep showing what we have */
  }
}

applyLang();
fetchReports();
fetchSpots();
setInterval(fetchReports, 30_000);
setInterval(fetchSpots, 120_000);

// Ask for location up front so the map centres on the user and the
// "still there?" proximity prompts can work while they ride around.
startGeoWatch();

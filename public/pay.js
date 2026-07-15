/* POPO Pay — pay Thai PromptPay QRs with Solana/USDC via P2P settlers.
   DEMO: escrow is simulated; see payments.js for the honest scope. */
(function () {
  const $ = (id) => document.getElementById(id);
  const toastEl = $("toast");
  const overlay = $("overlay");
  const paySheet = $("paySheet");
  const root = $("payRoot");

  let lang = localStorage.getItem("popo-lang") ||
    ((navigator.language || "").toLowerCase().startsWith("th") ? "th" : "en");

  const I18N = {
    th: {
      title: "จ่ายด้วย Solana / USDC",
      tabPay: "จ่ายเงิน", tabSettle: "รับงานจ่าย",
      demo: "โหมดสาธิต: ยังไม่มีการโอนเงินจริง ระบบจริงต้องมีใบอนุญาต, KYC/AML และ escrow บนเชน",
      pastePrompt: "สแกนหรือวาง Thai QR (PromptPay)",
      scan: "📷 สแกน QR", pasteLabel: "หรือวางโค้ด PromptPay",
      amount: "จำนวนเงิน (บาท)", create: "สร้างการชำระเงิน",
      merchant: "ร้านค้า", to: "ไปยัง",
      breakdown: "รายละเอียด", fee: "ค่าธรรมเนียมผู้จ่าย", total: "รวมที่ต้องโอน",
      scanToPay: "สแกนด้วยกระเป๋า Solana หรือกดเปิดกระเป๋า",
      openWallet: "เปิดในกระเป๋าเงิน", iPaid: "ฉันโอน USDC แล้ว",
      cancel: "ยกเลิก", release: "ได้รับสินค้าแล้ว ปล่อยเงิน",
      statusLabel: "สถานะ",
      st_open: "รอผู้จ่าย/รอเติมเงิน", st_funded: "เติม escrow แล้ว รอผู้รับงาน",
      st_claimed: "ผู้รับงานกำลังจ่าย", st_paid: "จ่ายร้านแล้ว รอยืนยัน",
      st_released: "เสร็จสมบูรณ์ ✅", st_cancelled: "ยกเลิกแล้ว",
      noOrders: "ยังไม่มีงานตอนนี้", refresh: "รีเฟรช",
      claim: "รับงานนี้", payMerchant: "จ่าย PromptPay นี้:", submitProof: "ส่งหลักฐานการจ่าย",
      proofPlaceholder: "เลขอ้างอิง/หมายเหตุการโอน", waiting: "รอผู้จ่ายยืนยัน...",
      earn: "ได้รับ", invalidQr: "อ่าน Thai QR ไม่ได้", err: "เกิดข้อผิดพลาด",
      needAmount: "QR นี้ไม่ระบุจำนวน กรุณาใส่จำนวนเงิน",
    },
    en: {
      title: "Pay with Solana / USDC",
      tabPay: "Pay", tabSettle: "Settle for others",
      demo: "Demo mode: no real funds move. A live version needs licensing, KYC/AML and on-chain escrow.",
      pastePrompt: "Scan or paste a Thai QR (PromptPay)",
      scan: "📷 Scan QR", pasteLabel: "or paste the PromptPay code",
      amount: "Amount (THB)", create: "Create payment",
      merchant: "Merchant", to: "to",
      breakdown: "Breakdown", fee: "Settler fee", total: "Total to send",
      scanToPay: "Scan with a Solana wallet, or tap to open your wallet",
      openWallet: "Open in wallet", iPaid: "I've sent the USDC",
      cancel: "Cancel", release: "Got my goods — release funds",
      statusLabel: "Status",
      st_open: "Awaiting funding", st_funded: "Escrow funded — awaiting settler",
      st_claimed: "Settler is paying the merchant", st_paid: "Merchant paid — confirm to release",
      st_released: "Complete ✅", st_cancelled: "Cancelled",
      noOrders: "No open jobs right now", refresh: "Refresh",
      claim: "Take this job", payMerchant: "Pay this PromptPay:", submitProof: "Submit payment proof",
      proofPlaceholder: "Reference no. / transfer note", waiting: "Waiting for payer to confirm...",
      earn: "You earn", invalidQr: "Couldn't read that Thai QR", err: "Something went wrong",
      needAmount: "This QR has no amount — enter one",
    },
  };
  const t = (k) => (I18N[lang] && I18N[lang][k]) || (I18N.en[k] ?? k);

  let toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.add("hidden"), 2600);
  }
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  let cfg = { settlerFee: 0.02, network: "devnet", disclaimer: "" };
  fetch("/api/pay/config").then((r) => r.json()).then((c) => (cfg = c)).catch(() => {});

  // ---- Sheet open/close ----
  function openSheet() {
    lang = localStorage.getItem("popo-lang") || lang;
    renderPay();
    paySheet.classList.remove("hidden");
    overlay.classList.remove("hidden");
  }
  function closeSheet() {
    paySheet.classList.add("hidden");
    overlay.classList.add("hidden");
    stopScan();
    stopPolling();
  }
  $("payBtn").addEventListener("click", openSheet);

  function header(active) {
    return `
      <div class="pay-head">
        <h3>🪙 ${esc(t("title"))}</h3>
        <button class="icon-btn" id="payClose">✕</button>
      </div>
      <div class="pay-demo">${esc(cfg.disclaimer || t("demo"))} · <b>${esc(cfg.network || "devnet")}</b></div>
      <div class="pay-tabs">
        <button class="pay-tab ${active === "pay" ? "on" : ""}" data-tab="pay">${esc(t("tabPay"))}</button>
        <button class="pay-tab ${active === "settle" ? "on" : ""}" data-tab="settle">${esc(t("tabSettle"))}</button>
      </div>`;
  }
  function wireCommon() {
    $("payClose").addEventListener("click", closeSheet);
    root.querySelectorAll(".pay-tab").forEach((b) =>
      b.addEventListener("click", () => (b.dataset.tab === "pay" ? renderPay() : renderSettle())));
  }

  // ================= PAY (payer side) =================
  let activeRef = null;

  function renderPay() {
    stopPolling();
    root.innerHTML = header("pay") + `
      <div class="pay-body">
        <label class="pay-label">${esc(t("pastePrompt"))}</label>
        <button class="btn btn-ghost" id="ppScan">${esc(t("scan"))}</button>
        <video id="ppVideo" class="pp-video hidden" playsinline muted></video>
        <label class="pay-label sm">${esc(t("pasteLabel"))}</label>
        <textarea id="ppPayload" class="pp-input" rows="2" placeholder="00020101..."></textarea>
        <div id="ppAmountRow" class="hidden">
          <label class="pay-label sm">${esc(t("amount"))}</label>
          <input id="ppAmount" class="pp-input" type="number" inputmode="decimal" min="1" placeholder="100">
        </div>
        <button class="btn btn-primary" id="ppCreate">${esc(t("create"))}</button>
        <div id="payResult"></div>
      </div>`;
    wireCommon();
    $("ppScan").addEventListener("click", startScan);
    $("ppCreate").addEventListener("click", createPayment);
  }

  async function createPayment() {
    const payload = $("ppPayload").value.trim();
    if (!payload) return toast(t("invalidQr"));
    const amountThb = $("ppAmount") ? Number($("ppAmount").value) : undefined;
    const btn = $("ppCreate");
    btn.disabled = true;
    try {
      const res = await fetch("/api/pay/intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload, amountThb }),
      });
      if (res.status === 400) {
        const e = await res.json();
        btn.disabled = false;
        if (e.error === "invalid-amount") {
          $("ppAmountRow").classList.remove("hidden");
          return toast(t("needAmount"));
        }
        return toast(t("invalidQr"));
      }
      if (!res.ok) throw new Error();
      const data = await res.json();
      renderResult(data);
    } catch {
      toast(t("err"));
      btn.disabled = false;
    }
  }

  function renderResult(data) {
    const o = data.order;
    activeRef = o.reference;
    const res = $("payResult");
    res.innerHTML = `
      <div class="pay-card">
        <div class="pay-merchant">${esc(o.merchant || t("merchant"))}
          <span class="pay-city">${esc(o.city || "")}</span></div>
        <div class="pay-to">${esc(t("to"))} ${esc(o.targetMasked)}</div>
        <div class="pay-amounts">
          <div><span>฿${o.amountThb}</span><small>${o.usdc} USDC</small></div>
          <div><span>+${o.feeUsdc}</span><small>${esc(t("fee"))}</small></div>
          <div class="pay-total"><span>${o.totalUsdc} USDC</span><small>${esc(t("total"))}</small></div>
        </div>
        <img class="pay-qr" src="${data.qr}" alt="Solana Pay QR">
        <div class="pay-scan-hint">${esc(t("scanToPay"))}</div>
        <a class="btn btn-primary" id="ppOpenWallet" href="${esc(data.solanaPayUrl)}">${esc(t("openWallet"))}</a>
        <div class="pay-status" id="ppStatus"></div>
        <div class="pay-actions" id="ppActions"></div>
      </div>`;
    renderStatus(o);
    startPolling(o.reference);
  }

  function renderStatus(o) {
    const s = $("ppStatus");
    if (s) s.innerHTML = `${esc(t("statusLabel"))}: <b>${esc(t("st_" + o.status))}</b>`;
    const a = $("ppActions");
    if (!a) return;
    a.innerHTML = "";
    if (o.status === "open") {
      add(a, t("iPaid"), "btn-primary", () => act(o.id, "fund"));
      add(a, t("cancel"), "btn-ghost", () => act(o.id, "cancel"));
    } else if (o.status === "paid") {
      add(a, t("release"), "btn-primary", () => act(o.id, "release"));
    }
  }
  function add(parent, label, cls, fn) {
    const b = document.createElement("button");
    b.className = "btn " + cls;
    b.textContent = label;
    b.addEventListener("click", fn);
    parent.appendChild(b);
  }
  async function act(id, verb) {
    try {
      const res = await fetch(`/api/pay/orders/${id}/${verb}`, { method: "POST" });
      if (!res.ok) throw new Error();
      const { order } = await res.json();
      renderStatus(order);
    } catch { toast(t("err")); }
  }

  let pollTimer = null;
  function startPolling(ref) {
    stopPolling();
    pollTimer = setInterval(async () => {
      if (!ref) return;
      try {
        const res = await fetch(`/api/pay/orders/by-ref/${ref}`);
        if (!res.ok) return;
        const { order } = await res.json();
        renderStatus(order);
        if (order.status === "released" || order.status === "cancelled") stopPolling();
      } catch {}
    }, 5000);
  }
  function stopPolling() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }

  // ---- Camera scan (BarcodeDetector) ----
  let scanStream = null, scanRAF = null;
  async function startScan() {
    if (!("BarcodeDetector" in window)) return toast("Scanner not supported — paste the code");
    try {
      const det = new window.BarcodeDetector({ formats: ["qr_code"] });
      scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      const v = $("ppVideo");
      v.classList.remove("hidden");
      v.srcObject = scanStream;
      await v.play();
      const loop = async () => {
        try {
          const codes = await det.detect(v);
          if (codes && codes[0]) {
            $("ppPayload").value = codes[0].rawValue;
            stopScan();
            createPayment();
            return;
          }
        } catch {}
        scanRAF = requestAnimationFrame(loop);
      };
      loop();
    } catch { toast("Camera unavailable — paste the code"); }
  }
  function stopScan() {
    if (scanRAF) cancelAnimationFrame(scanRAF), (scanRAF = null);
    if (scanStream) { scanStream.getTracks().forEach((tr) => tr.stop()); scanStream = null; }
    const v = $("ppVideo"); if (v) v.classList.add("hidden");
  }

  // ================= SETTLE (settler side) =================
  async function renderSettle() {
    stopPolling();
    root.innerHTML = header("settle") + `
      <div class="pay-body">
        <button class="btn btn-ghost" id="stRefresh">${esc(t("refresh"))}</button>
        <div id="settleList" class="settle-list"></div>
      </div>`;
    wireCommon();
    $("stRefresh").addEventListener("click", loadOrders);
    loadOrders();
  }

  async function loadOrders() {
    const list = $("settleList");
    list.innerHTML = "";
    try {
      const res = await fetch("/api/pay/orders");
      const { orders } = await res.json();
      if (!orders.length) { list.innerHTML = `<div class="list-empty">${esc(t("noOrders"))}</div>`; return; }
      for (const o of orders) {
        const div = document.createElement("div");
        div.className = "settle-item";
        div.innerHTML = `
          <div class="si-main">
            <div class="si-merchant">${esc(o.merchant || "PromptPay")} <span>${esc(o.targetMasked)}</span></div>
            <div class="si-meta">฿${o.amountThb} → ${o.totalUsdc} USDC · ${esc(t("earn"))} ${o.feeUsdc} USDC</div>
          </div>`;
        const b = document.createElement("button");
        b.className = "btn btn-primary si-btn";
        b.textContent = t("claim");
        b.addEventListener("click", () => claim(o.id));
        div.appendChild(b);
        list.appendChild(div);
      }
    } catch { list.innerHTML = `<div class="list-empty">${esc(t("err"))}</div>`; }
  }

  async function claim(id) {
    try {
      const res = await fetch(`/api/pay/orders/${id}/claim`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settler: "anon" }),
      });
      if (res.status === 409) { toast(t("err")); return loadOrders(); }
      const { order } = await res.json();
      renderClaimed(order);
    } catch { toast(t("err")); }
  }

  function renderClaimed(o) {
    const list = $("settleList");
    list.innerHTML = `
      <div class="pay-card">
        <div class="pay-merchant">${esc(o.merchant || "PromptPay")}</div>
        <div class="claim-instruct">${esc(t("payMerchant"))} <b>${esc(o.target)}</b></div>
        <div class="claim-amt">฿${o.amountThb} → ${esc(t("earn"))} ${o.feeUsdc} USDC</div>
        <textarea id="stProof" class="pp-input" rows="2" placeholder="${esc(t("proofPlaceholder"))}"></textarea>
        <button class="btn btn-primary" id="stProofBtn">${esc(t("submitProof"))}</button>
        <div id="stAfter" class="pay-status"></div>
      </div>`;
    $("stProofBtn").addEventListener("click", async () => {
      try {
        const res = await fetch(`/api/pay/orders/${o.id}/proof`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ proof: $("stProof").value.trim() }),
        });
        if (!res.ok) throw new Error();
        $("stAfter").innerHTML = `<b>${esc(t("waiting"))}</b>`;
        $("stProofBtn").disabled = true;
      } catch { toast(t("err")); }
    });
  }
})();

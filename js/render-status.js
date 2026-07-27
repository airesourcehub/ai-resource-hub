// AI Resource Hub — global render-status pill.
// Shows a small floating indicator in the top-right of EVERY page whenever the
// signed-in user has a render in progress on the desktop GPU, with a live ETA.
// Click it to open the Render Status page (GPU + cancel). Reconnects to a
// running job on load, so leaving the tool page never loses the status.

(function () {
  var RENDER_ENDPOINT = "https://render.airesourcehub.vip";
  var POLL_MS = 5000;
  var IDLE_RESCAN_MS = 15000;

  if (!window.supabase || typeof SUPABASE_URL === "undefined") return;
  var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  var TOOLS = {
    ai_transition:  { archive: "render-archive.html", label: "AI Transition" },
    music_sync:     { archive: "render-archive.html", label: "Music Sync Transition" },
    motion_transfer:{ archive: "motion-archive.html", label: "Motion Transfer" }
  };
  var STATUS_PAGE = "gpu-status.html";

  var user = null;
  var pollTimer = null, rescanTimer = null, tickTimer = null;
  var activeJobId = null, activeType = null, pollFails = 0, etaLeft = null;
  var el = {};

  init();

  async function init() {
    var s = await client.auth.getSession();
    user = s.data.session ? s.data.session.user : null;
    client.auth.onAuthStateChange(function (_e, session) {
      user = session ? session.user : null;
      if (!user) { stopAll(); hide(); } else scan();
    });
    if (user) scan();
    tickTimer = setInterval(tickEta, 1000);
  }

  async function freshToken() {
    var r = await client.auth.getSession();
    var sess = r.data.session;
    if (sess && sess.expires_at) {
      var now = Math.floor(Date.now() / 1000);
      if (sess.expires_at - now < 120) {
        try { var rr = await client.auth.refreshSession(); if (rr.data && rr.data.session) sess = rr.data.session; } catch (e) {}
      }
    }
    return sess ? sess.access_token : null;
  }

  async function scan() {
    if (!user || activeJobId) return;
    try {
      var res = await client.from("render_jobs")
        .select("id, render_type, status, progress")
        .eq("user_id", user.id)
        .in("status", ["queued", "processing"])
        .order("created_at", { ascending: false })
        .limit(1);
      if (!res.error && res.data && res.data.length) {
        var job = res.data[0];
        activeJobId = job.id;
        activeType = job.render_type || "ai_transition";
        pollFails = 0; etaLeft = null;
        render("running", Math.max(2, job.progress || 2), "Rendering…", null);
        clearTimeout(rescanTimer);
        pollService();
        return;
      }
    } catch (e) {}
    clearTimeout(rescanTimer);
    rescanTimer = setTimeout(scan, IDLE_RESCAN_MS);
  }

  function pollService() {
    clearTimeout(pollTimer);
    pollTimer = setTimeout(async function () {
      if (!activeJobId) return;
      try {
        var token = await freshToken();
        var r = await fetch(RENDER_ENDPOINT + "/jobs/" + activeJobId, { headers: { "Authorization": "Bearer " + token } });
        if (r.status === 404) { hide(); finishTracking(); return; } // job gone (service restarted)
        if (!r.ok) throw new Error("HTTP " + r.status);
        pollFails = 0;
        var j = await r.json();
        if (j.status === "done") { etaLeft = null; render("done", 100, "Render complete", null); finishTracking(); return; }
        if (j.status === "cancelled") { etaLeft = null; render("error", 100, "Render cancelled", null); finishTracking(); return; }
        if (j.status === "error") { etaLeft = null; render("error", 100, "Render failed", null); finishTracking(); return; }
        etaLeft = (j.eta_seconds != null && j.eta_seconds >= 0) ? j.eta_seconds : null;
        render("running", Math.max(2, Math.min(99, j.progress || 0)), null, etaLeft);
        pollService();
      } catch (e) {
        pollFails++;
        if (pollFails === 5) render("running", null, "Still rendering…", null);
        pollService();
      }
    }, POLL_MS);
  }

  function finishTracking() {
    clearTimeout(pollTimer);
    activeJobId = null; etaLeft = null;
    clearTimeout(rescanTimer);
    rescanTimer = setTimeout(scan, IDLE_RESCAN_MS);
  }

  function stopAll() { clearTimeout(pollTimer); clearTimeout(rescanTimer); activeJobId = null; }

  function build() {
    if (el.pill) return;
    var pill = document.createElement("div");
    pill.className = "render-pill";
    pill.setAttribute("role", "status");
    pill.innerHTML =
      '<button type="button" class="render-pill-main" aria-label="Open render status">' +
        '<span class="render-pill-dot"></span>' +
        '<span class="render-pill-body">' +
          '<span class="render-pill-text">Rendering…</span>' +
          '<span class="render-pill-track"><span class="render-pill-fill"></span></span>' +
        '</span>' +
      '</button>' +
      '<button type="button" class="render-pill-close" aria-label="Dismiss">&times;</button>';
    document.body.appendChild(pill);
    el.pill = pill;
    el.text = pill.querySelector(".render-pill-text");
    el.fill = pill.querySelector(".render-pill-fill");
    el.track = pill.querySelector(".render-pill-track");
    pill.querySelector(".render-pill-main").addEventListener("click", onClick);
    pill.querySelector(".render-pill-close").addEventListener("click", hide);
  }

  function render(state, pct, text, eta) {
    build();
    var t = TOOLS[activeType] || TOOLS.ai_transition;
    el.pill.classList.remove("is-running", "is-done", "is-error");
    el.pill.classList.add(state === "done" ? "is-done" : state === "error" ? "is-error" : "is-running");
    var prefix = state === "done" ? "✓ " : state === "error" ? "✕ " : "";
    var main = text || t.label;
    if (state === "running" && pct != null) main = "Rendering " + Math.round(pct) + "%";
    var etaStr = (state === "running" && eta != null && eta > 0) ? " • ~" + fmtDur(eta) + " left" : "";
    el.text.textContent = prefix + main + etaStr + " — " + t.label;
    if (pct == null) { el.track.style.display = "none"; }
    else { el.track.style.display = ""; el.fill.style.width = Math.max(2, Math.min(100, pct)) + "%"; }
    el.pill.style.display = "";
    el.pill.dataset.state = state;
  }

  function tickEta() {
    if (!el.pill || etaLeft == null || etaLeft <= 0) return;
    if (el.pill.dataset.state !== "running") return;
    etaLeft = Math.max(0, etaLeft - 1);
    var cur = el.text.textContent;
    var base = cur.split(" • ")[0];
    var t = TOOLS[activeType] || TOOLS.ai_transition;
    var etaStr = etaLeft > 0 ? " • ~" + fmtDur(etaLeft) + " left" : " • almost done";
    el.text.textContent = base + etaStr + (base.indexOf(" — ") === -1 ? " — " + t.label : "");
  }

  function onClick() {
    var t = TOOLS[activeType] || TOOLS.ai_transition;
    var state = el.pill.dataset.state;
    var dest = (state === "done") ? t.archive : STATUS_PAGE;
    var here = (location.pathname.split("/").pop() || "index.html").toLowerCase();
    if (here === dest.toLowerCase()) { hide(); return; }
    location.href = dest;
  }

  function hide() { if (el.pill) el.pill.style.display = "none"; }

  function fmtDur(s) {
    s = Math.max(0, Math.round(s));
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    if (h) return h + "h " + m + "m";
    if (m) return m + "m";
    return sec + "s";
  }
})();

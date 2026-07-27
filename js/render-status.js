// AI Resource Hub — global render-status pill.
// Shows a small floating indicator in the top-right of EVERY page whenever the
// signed-in user has a render in progress on the desktop GPU, so they can leave
// the tool page and still see it working. Click it to jump back to the tool, or
// to the render's library once it finishes. Reconnects to a running job on load.

(function () {
  var RENDER_ENDPOINT = "https://render.airesourcehub.vip";
  var POLL_MS = 5000;       // how often to ask the service for live progress
  var IDLE_RESCAN_MS = 15000; // how often to look for a newly-started job

  if (!window.supabase || typeof SUPABASE_URL === "undefined") return;
  var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  var TOOLS = {
    ai_transition:  { tool: "ai-transitions.html", archive: "render-archive.html", label: "AI Transition" },
    music_sync:     { tool: "ai-transitions.html", archive: "render-archive.html", label: "Music Sync Transition" },
    motion_transfer:{ tool: "motion-transfer.html", archive: "motion-archive.html", label: "Motion Transfer" }
  };

  var user = null;
  var pollTimer = null, rescanTimer = null;
  var activeJobId = null, activeType = null, pollFails = 0;
  var el = {}; // pill DOM references

  init();

  async function init() {
    var s = await client.auth.getSession();
    user = s.data.session ? s.data.session.user : null;
    client.auth.onAuthStateChange(function (_e, session) {
      user = session ? session.user : null;
      if (!user) { stopAll(); hide(); }
      else scan();
    });
    if (user) scan();
  }

  // ---- token -------------------------------------------------------------
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

  // ---- discover an active job from the database --------------------------
  async function scan() {
    if (!user) return;
    if (activeJobId) return; // already tracking one
    try {
      var res = await client.from("render_jobs")
        .select("id, render_type, status, progress, created_at")
        .eq("user_id", user.id)
        .in("status", ["queued", "processing"])
        .order("created_at", { ascending: false })
        .limit(1);
      if (!res.error && res.data && res.data.length) {
        var job = res.data[0];
        activeJobId = job.id;
        activeType = job.render_type || "ai_transition";
        pollFails = 0;
        render("running", Math.max(2, job.progress || 2), "Rendering…");
        clearTimeout(rescanTimer);
        pollService();
        return;
      }
    } catch (e) {}
    // nothing active — check again later in case one starts in another tab
    clearTimeout(rescanTimer);
    rescanTimer = setTimeout(scan, IDLE_RESCAN_MS);
  }

  // ---- poll the render service for live status/progress ------------------
  function pollService() {
    clearTimeout(pollTimer);
    pollTimer = setTimeout(async function () {
      if (!activeJobId) return;
      try {
        var token = await freshToken();
        var r = await fetch(RENDER_ENDPOINT + "/jobs/" + activeJobId, { headers: { "Authorization": "Bearer " + token } });
        if (!r.ok) throw new Error("HTTP " + r.status);
        pollFails = 0;
        var j = await r.json();
        if (j.status === "done") { render("done", 100, "Render complete"); finishTracking(); return; }
        if (j.status === "error") { render("error", 100, "Render failed"); finishTracking(); return; }
        render("running", Math.max(2, Math.min(99, j.progress || 0)), j.stage || "Rendering…");
        pollService();
      } catch (e) {
        pollFails++;
        // Service unreachable (tunnel/desktop down) — keep the pill but soften it.
        if (pollFails === 5) render("running", null, "Still rendering…");
        pollService();
      }
    }, POLL_MS);
  }

  // Job reached a terminal state: stop polling this one, let the pill linger,
  // then start looking for the next job.
  function finishTracking() {
    clearTimeout(pollTimer);
    var wasType = activeType;
    activeJobId = null;
    activeType = wasType; // keep for the click-through link until re-scan
    clearTimeout(rescanTimer);
    rescanTimer = setTimeout(scan, IDLE_RESCAN_MS);
  }

  function stopAll() { clearTimeout(pollTimer); clearTimeout(rescanTimer); activeJobId = null; }

  // ---- DOM ---------------------------------------------------------------
  function build() {
    if (el.pill) return;
    var pill = document.createElement("div");
    pill.className = "render-pill";
    pill.setAttribute("role", "status");
    pill.innerHTML =
      '<button type="button" class="render-pill-main" aria-label="View render">' +
        '<span class="render-pill-dot"></span>' +
        '<span class="render-pill-body">' +
          '<span class="render-pill-text">Rendering…</span>' +
          '<span class="render-pill-track"><span class="render-pill-fill"></span></span>' +
        '</span>' +
      '</button>' +
      '<button type="button" class="render-pill-close" aria-label="Dismiss">&times;</button>';
    document.body.appendChild(pill);
    el.pill = pill;
    el.main = pill.querySelector(".render-pill-main");
    el.text = pill.querySelector(".render-pill-text");
    el.fill = pill.querySelector(".render-pill-fill");
    el.track = pill.querySelector(".render-pill-track");
    el.main.addEventListener("click", onClick);
    pill.querySelector(".render-pill-close").addEventListener("click", function () { hide(); });
  }

  function render(state, pct, text) {
    build();
    var t = TOOLS[activeType] || TOOLS.ai_transition;
    el.pill.classList.remove("is-running", "is-done", "is-error");
    el.pill.classList.add(state === "done" ? "is-done" : state === "error" ? "is-error" : "is-running");
    var prefix = state === "done" ? "✓ " : state === "error" ? "✕ " : "";
    var suffix = (state === "running" && pct != null) ? " " + Math.round(pct) + "%" : "";
    el.text.textContent = prefix + (text || t.label) + suffix + " — " + t.label;
    if (pct == null) { el.track.style.display = "none"; }
    else { el.track.style.display = ""; el.fill.style.width = Math.max(2, Math.min(100, pct)) + "%"; }
    el.pill.style.display = "";
    el.pill.dataset.state = state;
  }

  function onClick() {
    var t = TOOLS[activeType] || TOOLS.ai_transition;
    var state = el.pill.dataset.state;
    // While running or on error, go back to the tool; when done, go to the library.
    var dest = (state === "done") ? t.archive : t.tool;
    var here = (location.pathname.split("/").pop() || "index.html").toLowerCase();
    if (here === dest.toLowerCase()) { hide(); return; }
    location.href = dest;
  }

  function hide() { if (el.pill) el.pill.style.display = "none"; }
})();

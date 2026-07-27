// AI Resource Hub — Render Status page.
// Live GPU stats + the currently-running render (stage, progress, ETA) with a
// Cancel button. Reads GPU from the desktop service and finds the active job
// via the database, same as the global status pill.

(function () {
  var RENDER_ENDPOINT = "https://render.airesourcehub.vip";
  var POLL_MS = 3000;

  if (!window.supabase || typeof SUPABASE_URL === "undefined") return;
  var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  var TOOLS = {
    ai_transition:  "AI Transition",
    music_sync:     "AI Music Sync Transition",
    motion_transfer:"Motion Transfer"
  };

  var user = null, pollTimer = null, tickTimer = null;
  var activeJobId = null, etaLeft = null;

  var gate = document.getElementById("gpuGate");
  var body = document.getElementById("gpuBody");
  var jobNone = document.getElementById("jobNone");
  var jobActive = document.getElementById("jobActive");
  var cancelBtn = document.getElementById("jobCancelBtn");

  init();

  async function init() {
    var s = await client.auth.getSession();
    user = s.data.session ? s.data.session.user : null;
    client.auth.onAuthStateChange(function (_e, session) { user = session ? session.user : null; boot(); });
    boot();
    if (cancelBtn) cancelBtn.addEventListener("click", cancelActive);
    tickTimer = setInterval(tickEta, 1000);
  }

  function boot() {
    if (!user) {
      gate.innerHTML = 'Please <a href="auth.html">log in</a> to view render status.';
      gate.classList.add("show"); gate.style.display = ""; body.style.display = "none";
      clearTimeout(pollTimer);
      return;
    }
    gate.style.display = "none"; gate.classList.remove("show"); body.style.display = "";
    poll();
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

  function poll() {
    clearTimeout(pollTimer);
    pollTimer = setTimeout(run, POLL_MS);
    run();
  }

  async function run() {
    if (!user) return;
    var token = await freshToken();
    if (!token) return;
    loadGpu(token);
    loadJob(token);
    clearTimeout(pollTimer);
    pollTimer = setTimeout(run, POLL_MS);
  }

  async function loadGpu(token) {
    try {
      var r = await fetch(RENDER_ENDPOINT + "/gpu", { headers: { "Authorization": "Bearer " + token } });
      if (!r.ok) throw new Error("HTTP " + r.status);
      var d = await r.json();
      renderGpu(d.gpus || []);
      document.getElementById("gpuStamp").textContent = "Updated " + new Date().toLocaleTimeString();
    } catch (e) {
      document.getElementById("gpuCards").innerHTML =
        '<p class="model-note">The render machine isn’t reachable right now (desktop offline or tunnel down).</p>';
    }
  }

  function renderGpu(gpus) {
    var host = document.getElementById("gpuCards");
    if (!gpus.length) { host.innerHTML = '<p class="model-note">No GPU reported.</p>'; return; }
    host.innerHTML = gpus.map(function (g) {
      var memPct = (g.mem_total ? (g.mem_used / g.mem_total * 100) : 0);
      return '<div class="gpu-card">' +
        '<div class="gpu-name">' + esc(g.name || "GPU") + '</div>' +
        meter("Utilization", g.util != null ? g.util + "%" : "—", g.util || 0) +
        meter("Memory", fmtMem(g.mem_used) + " / " + fmtMem(g.mem_total), memPct) +
        '<div class="gpu-sub">' +
          (g.temp != null ? '<span>🌡️ ' + Math.round(g.temp) + '°C</span>' : '') +
          (g.power != null ? '<span>⚡ ' + Math.round(g.power) + ' W</span>' : '') +
        '</div>' +
      '</div>';
    }).join("");
  }

  function meter(label, val, pct) {
    pct = Math.max(0, Math.min(100, pct));
    return '<div class="gpu-meter">' +
      '<div class="gpu-meter-head"><span>' + label + '</span><span>' + esc(val) + '</span></div>' +
      '<div class="gpu-meter-track"><span style="width:' + pct + '%;"></span></div></div>';
  }

  async function loadJob(token) {
    var res = await client.from("render_jobs")
      .select("id, render_type, status")
      .eq("user_id", user.id)
      .in("status", ["queued", "processing"])
      .order("created_at", { ascending: false })
      .limit(1);
    if (res.error || !res.data || !res.data.length) { showNoJob(); return; }
    var job = res.data[0];
    activeJobId = job.id;
    try {
      var r = await fetch(RENDER_ENDPOINT + "/jobs/" + job.id, { headers: { "Authorization": "Bearer " + token } });
      if (!r.ok) throw new Error("HTTP " + r.status);
      var j = await r.json();
      if (j.status === "done" || j.status === "error" || j.status === "cancelled") { showNoJob(); return; }
      showJob(job.render_type, j);
    } catch (e) { /* keep last shown state */ }
  }

  function showNoJob() {
    activeJobId = null; etaLeft = null;
    jobActive.style.display = "none";
    jobNone.style.display = "";
  }

  function showJob(type, j) {
    jobNone.style.display = "none";
    jobActive.style.display = "";
    document.getElementById("jobTool").textContent = TOOLS[type] || type;
    document.getElementById("jobStage").textContent = j.stage || "Working…";
    var pct = Math.max(2, Math.min(99, j.progress || 0));
    document.getElementById("jobFill").style.width = pct + "%";
    document.getElementById("jobPct").textContent = Math.round(pct) + "%";
    document.getElementById("jobElapsed").textContent = fmtDur(j.elapsed_seconds || 0);
    etaLeft = (j.eta_seconds != null && j.eta_seconds >= 0) ? j.eta_seconds : null;
    document.getElementById("jobEta").textContent = etaLeft != null ? "~" + fmtDur(etaLeft) : "estimating…";
  }

  function tickEta() {
    if (etaLeft == null || etaLeft <= 0) return;
    etaLeft = Math.max(0, etaLeft - 1);
    var el = document.getElementById("jobEta");
    if (el && jobActive.style.display !== "none") el.textContent = etaLeft > 0 ? "~" + fmtDur(etaLeft) : "almost done…";
  }

  async function cancelActive() {
    if (!activeJobId) return;
    if (!window.confirm("Cancel the running render? It will stop immediately and free the GPU.")) return;
    cancelBtn.disabled = true; cancelBtn.textContent = "Cancelling…";
    try {
      var token = await freshToken();
      await fetch(RENDER_ENDPOINT + "/jobs/" + activeJobId + "/cancel", { method: "POST", headers: { "Authorization": "Bearer " + token } });
      document.getElementById("jobMsg").textContent = "Cancel sent — the render is stopping.";
      document.getElementById("jobMsg").className = "form-status success";
    } catch (e) {
      document.getElementById("jobMsg").textContent = "Couldn’t reach the render service to cancel.";
      document.getElementById("jobMsg").className = "form-status error";
    }
    setTimeout(function () { cancelBtn.disabled = false; cancelBtn.textContent = "Cancel this render"; }, 4000);
  }

  function fmtDur(s) {
    s = Math.max(0, Math.round(s));
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    if (h) return h + "h " + m + "m";
    if (m) return m + "m " + sec + "s";
    return sec + "s";
  }
  function fmtMem(mb) { if (mb == null) return "—"; return (mb >= 1024) ? (mb / 1024).toFixed(1) + " GB" : Math.round(mb) + " MB"; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
})();

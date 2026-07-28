// AI Resource Hub — Render Status page.
// One /status call paints everything: service + ComfyUI health, the job the GPU
// is working on right now (and who it's for), the queue with estimated start
// times, and live CPU/GPU stats. Admins see emails; members see "another member".

(function () {
  var RENDER_ENDPOINT = "https://render.airesourcehub.vip";
  var POLL_MS = 3000;

  if (!window.supabase || typeof SUPABASE_URL === "undefined") return;
  var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  var LABELS = {
    ai_transition: "AI Transition", blend: "AI Transition", stitched: "AI Transition",
    transition_only: "AI Transition", music_sync: "Music Sync Transition",
    motion_transfer: "Motion Transfer", lipsync: "Lip Sync", wan_video: "WAN Video",
    image: "Image Studio", training: "LoRA Training"
  };

  var user = null, pollTimer = null, tickTimer = null;
  var curEtaLeft = null, curJobId = null;

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
    if (cancelBtn) cancelBtn.addEventListener("click", cancelCurrent);
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
    if (sess && sess.expires_at && sess.expires_at - Math.floor(Date.now() / 1000) < 120) {
      try { var rr = await client.auth.refreshSession(); if (rr.data && rr.data.session) sess = rr.data.session; } catch (e) {}
    }
    return sess ? sess.access_token : null;
  }

  function poll() {
    clearTimeout(pollTimer);
    run();
    pollTimer = setTimeout(poll, POLL_MS);
  }

  async function run() {
    if (!user) return;
    var token = await freshToken();
    if (!token) return;
    try {
      var r = await fetch(RENDER_ENDPOINT + "/status", { headers: { "Authorization": "Bearer " + token } });
      if (!r.ok) throw new Error("HTTP " + r.status);
      var d = await r.json();
      paintChips(true, d.comfy_up, d.busy);
      paintReserve(d);
      paintCurrent(d);
      paintQueue(d);
      renderStats(d.gpus || [], d.cpu || null);
      document.getElementById("gpuStamp").textContent = "Updated " + new Date().toLocaleTimeString();
    } catch (e) {
      paintChips(false, false, false);
      document.getElementById("gpuCards").innerHTML =
        '<p class="model-note">The render machine isn’t reachable right now (desktop offline or tunnel down).</p>';
    }
  }

  // ---- health chips ------------------------------------------------------
  function chip(el, up, upText, downText) {
    el.textContent = (up ? "● " : "○ ") + (up ? upText : downText);
    el.style.cssText = "padding:8px 14px;border-radius:999px;font-size:13px;font-weight:600;" +
      "background:" + (up ? "rgba(46,160,67,.15)" : "rgba(210,60,60,.15)") + ";" +
      "color:" + (up ? "#3fb950" : "#f06a6a") + ";border:1px solid " + (up ? "rgba(46,160,67,.4)" : "rgba(210,60,60,.4)") + ";";
  }
  function paintChips(serviceUp, comfyUp, busy) {
    chip(document.getElementById("chipService"), serviceUp, "Render service online", "Render service offline");
    chip(document.getElementById("chipComfy"), comfyUp, "ComfyUI running", "ComfyUI not running");
    var g = document.getElementById("chipGpu");
    if (!serviceUp) { chip(g, false, "", "GPU unknown"); g.textContent = "○ GPU unknown"; return; }
    chip(g, true, busy ? "GPU busy — processing" : "GPU idle — ready", "");
    if (!busy) g.style.color = "#8b95a1", g.style.background = "rgba(120,130,145,.12)", g.style.borderColor = "rgba(120,130,145,.35)";
  }

  function paintReserve(d) {
    var b = document.getElementById("reserveBanner");
    if (d.seat_holder) {
      var who = d.seat_label || "a user";
      b.innerHTML = d.seat_holder === (user && user.id)
        ? "🔒 <strong>You hold the priority seat.</strong> Only your jobs will run until you release it in the admin panel."
        : "🔒 The GPU is <strong>reserved by the admin</strong> for " + esc(who) + ". Other members’ jobs are paused until it’s released.";
      b.classList.add("show"); b.style.display = "";
    } else {
      b.style.display = "none"; b.classList.remove("show");
    }
  }

  // ---- running job -------------------------------------------------------
  function paintCurrent(d) {
    var c = d.current;
    if (!c) { curJobId = null; curEtaLeft = null; jobActive.style.display = "none"; jobNone.style.display = ""; return; }
    jobNone.style.display = "none"; jobActive.style.display = "";
    curJobId = c.id || null;
    document.getElementById("jobTool").textContent = LABELS[c.kind] || c.kind || "Render";
    document.getElementById("jobOwner").textContent = c.owner || "—";
    document.getElementById("jobStage").textContent = c.stage || "Working…";
    var pct = Math.max(2, Math.min(99, c.progress || 0));
    document.getElementById("jobFill").style.width = pct + "%";
    document.getElementById("jobPct").textContent = Math.round(pct) + "%";
    document.getElementById("jobElapsed").textContent = fmtDur(c.elapsed_seconds || 0);
    curEtaLeft = (c.eta_seconds != null && c.eta_seconds >= 0) ? c.eta_seconds : null;
    document.getElementById("jobEta").textContent = curEtaLeft != null ? "~" + fmtDur(curEtaLeft) : "estimating…";
    // Live training log
    var logWrap = document.getElementById("jobLogWrap"), logEl = document.getElementById("jobLog");
    if (c.kind === "training" && c.log_tail && c.log_tail.length) {
      logWrap.style.display = ""; logEl.textContent = c.log_tail.join("\n");
    } else { logWrap.style.display = "none"; }
    // Cancel: only when the server handed us an id (your job, or you're admin)
    cancelBtn.style.display = curJobId ? "" : "none";
  }

  // ---- queue -------------------------------------------------------------
  function paintQueue(d) {
    var host = document.getElementById("queueList");
    var q = d.queue || [];
    if (!q.length) { host.innerHTML = '<p class="model-note">Nobody’s waiting — the queue is empty.</p>'; return; }
    host.innerHTML = q.map(function (j) {
      var est = (j.est_start_seconds != null && j.est_start_seconds > 0) ? "~" + fmtDur(j.est_start_seconds) + " until start" : "starting soon";
      return '<div class="status-row" style="align-items:center;">' +
        '<span class="status-key" style="min-width:34px;">#' + (j.position + 1) + '</span>' +
        '<span class="status-val" style="flex:1;">' + esc(LABELS[j.kind] || j.kind || "Render") +
          ' <span class="frame-res" style="margin:0;">— ' + esc(j.owner || "member") + (j.is_yours ? " (you)" : "") + '</span></span>' +
        '<span class="frame-res" style="margin:0;">' + est + '</span>' +
      '</div>';
    }).join("");
  }

  // ---- hardware ----------------------------------------------------------
  function renderStats(gpus, cpu) {
    var host = document.getElementById("gpuCards");
    var html = "";
    if (cpu) {
      var ramPct = cpu.ram_total ? (cpu.ram_used / cpu.ram_total * 100) : 0;
      html += '<div class="gpu-card">' +
        '<div class="gpu-name">CPU' + (cpu.cores ? ' <span class="frame-res" style="margin:0;">' + cpu.cores + ' threads</span>' : '') + '</div>' +
        meter("Utilization", cpu.percent != null ? Math.round(cpu.percent) + "%" : "—", cpu.percent || 0) +
        meter("System RAM", fmtMem(cpu.ram_used) + " / " + fmtMem(cpu.ram_total), ramPct) +
      '</div>';
    }
    if (!gpus.length && !cpu) { host.innerHTML = '<p class="model-note">No GPU reported.</p>'; return; }
    html += gpus.map(function (g) {
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
    host.innerHTML = html;
  }

  function meter(label, val, pct) {
    pct = Math.max(0, Math.min(100, pct));
    return '<div class="gpu-meter">' +
      '<div class="gpu-meter-head"><span>' + label + '</span><span>' + esc(val) + '</span></div>' +
      '<div class="gpu-meter-track"><span style="width:' + pct + '%;"></span></div></div>';
  }

  function tickEta() {
    if (curEtaLeft == null || curEtaLeft <= 0) return;
    if (jobActive.style.display === "none") return;
    curEtaLeft = Math.max(0, curEtaLeft - 1);
    var el = document.getElementById("jobEta");
    if (el) el.textContent = curEtaLeft > 0 ? "~" + fmtDur(curEtaLeft) : "almost done…";
  }

  async function cancelCurrent() {
    if (!curJobId) return;
    if (!window.confirm("Cancel the running job? It will stop immediately and free the GPU for the next in line.")) return;
    cancelBtn.disabled = true; cancelBtn.textContent = "Cancelling…";
    try {
      var token = await freshToken();
      await fetch(RENDER_ENDPOINT + "/jobs/" + curJobId + "/cancel", { method: "POST", headers: { "Authorization": "Bearer " + token } });
      document.getElementById("jobMsg").textContent = "Cancel sent — the job is stopping.";
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

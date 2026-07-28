// AI Resource Hub — Train a LoRA (ai-toolkit on the desktop GPU).
// Seat-gated like the video tools (training monopolizes the GPU).

(function () {
  var RENDER_ENDPOINT = "https://render.airesourcehub.vip";
  var POLL_MS = 5000;

  if (!window.supabase || typeof SUPABASE_URL === "undefined") return;
  var gate = document.getElementById("trainGate");
  var form = document.getElementById("trainForm");
  if (!gate || !form) return;

  var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  var startBtn = document.getElementById("trainStartBtn");
  var cancelBtn = document.getElementById("trainCancelBtn");
  var statusEl = document.getElementById("trainStatus");
  var progress = document.getElementById("trainProgress");
  var progressFill = document.getElementById("trainProgressFill");
  var progressLabel = document.getElementById("trainProgressLabel");

  var currentUser = null, pollTimer = null, pollFails = 0, lastJobId = null;

  init();

  async function init() {
    var s = await client.auth.getSession();
    currentUser = s.data.session ? s.data.session.user : null;
    await refreshGate();
    client.auth.onAuthStateChange(function (_e, session) { currentUser = session ? session.user : null; refreshGate(); });

    startBtn.addEventListener("click", onStart);
    cancelBtn.addEventListener("click", onCancel);
    document.getElementById("trainImages").addEventListener("change", previewImages);
  }

  async function freshToken() {
    var r = await client.auth.getSession();
    var sess = r.data.session;
    if (sess && sess.expires_at && sess.expires_at - Math.floor(Date.now() / 1000) < 120) {
      try { var rr = await client.auth.refreshSession(); if (rr.data && rr.data.session) sess = rr.data.session; } catch (e) {}
    }
    return sess ? sess.access_token : null;
  }

  async function refreshGate() {
    if (!currentUser) {
      showGate('Training runs on limited hardware, one job at a time. <a href="auth.html">Log in</a> to check your access.');
      return;
    }
    var res = await client.from("render_seat").select("holder_id").eq("id", true).single();
    if (res.error) { showGate("Couldn’t check tool access right now. Please try again in a moment."); return; }
    if (res.data && res.data.holder_id && res.data.holder_id === currentUser.id) {
      gate.style.display = "none"; gate.classList.remove("show"); form.style.display = "";
      loadList();
    } else {
      showGate("Training is currently assigned to another user — only one person can use the GPU at a time. Contact the site admin if you need access.");
    }
  }
  function showGate(html) { gate.innerHTML = html; gate.classList.add("show"); gate.style.display = ""; form.style.display = "none"; }
  function setStatus(m, k) { if (statusEl) { statusEl.textContent = m || ""; statusEl.className = "form-status" + (k ? " " + k : ""); } }

  function previewImages() {
    var files = document.getElementById("trainImages").files;
    var host = document.getElementById("trainPreview");
    document.getElementById("trainCount").innerHTML = "&mdash; " + files.length + " selected";
    host.innerHTML = "";
    Array.prototype.slice.call(files, 0, 30).forEach(function (f) {
      if (f.type.indexOf("image/") !== 0) return;
      var url = URL.createObjectURL(f);
      host.innerHTML += '<div class="image-cell"><img src="' + url + '" alt="" /></div>';
    });
  }

  async function onStart() {
    var name = (document.getElementById("trainName").value || "").trim();
    var trigger = (document.getElementById("trainTrigger").value || "").trim();
    var base = getRadio("trainBase", "flux");
    var steps = getRadio("trainSteps", "2500");
    var files = document.getElementById("trainImages").files;

    if (!name) { setStatus("Give your LoRA a name.", "error"); return; }
    if (files.length < 4) { setStatus("Add at least 4 images (15–30 is ideal).", "error"); return; }

    setStatus("Checking your session…");
    var token = await freshToken();
    if (!token) { setStatus("Your session expired — please log in again.", "error"); return; }

    startBtn.disabled = true;
    cancelBtn.style.display = ""; cancelBtn.disabled = false; cancelBtn.textContent = "Cancel";
    document.getElementById("trainResult").style.display = "none";
    setStatus("Uploading your images…");
    showProgress(2, "Uploading…");

    var fd = new FormData();
    fd.append("name", name);
    fd.append("trigger_word", trigger);
    fd.append("base", base);
    fd.append("steps", steps);
    Array.prototype.forEach.call(files, function (f) { if (f.type.indexOf("image/") === 0) fd.append("images", f); });

    var jobId;
    try {
      var r = await fetch(RENDER_ENDPOINT + "/training-jobs", { method: "POST", headers: { "Authorization": "Bearer " + token }, body: fd });
      var data = await r.json().catch(function () { return {}; });
      if (r.status === 403) { setStatus("You don’t currently hold the render seat.", "error"); reset(); return; }
      if (r.status === 409) { setStatus("The GPU is busy with another job. Please try again shortly.", "error"); reset(); return; }
      if (!r.ok) throw new Error(data.detail || ("HTTP " + r.status));
      jobId = data.job_id;
      lastJobId = jobId;
    } catch (e) {
      setStatus("Couldn’t reach the render service. " + (e.message || ""), "error");
      reset(); return;
    }
    setStatus("Training started — this can take 30 minutes to a few hours. You can leave this page.");
    pollFails = 0;
    pollJob(jobId);
  }

  function pollJob(jobId) {
    clearTimeout(pollTimer);
    pollTimer = setTimeout(async function () {
      try {
        var token = await freshToken();
        var r = await fetch(RENDER_ENDPOINT + "/jobs/" + jobId, { headers: { "Authorization": "Bearer " + token } });
        if (r.status === 404) { setStatus("This training job is no longer running (the service may have restarted).", "error"); reset(); return; }
        if (!r.ok) throw new Error("HTTP " + r.status);
        pollFails = 0;
        var j = await r.json();
        if (j.status === "done") { showProgress(100, "Done"); onDone(); return; }
        if (j.status === "cancelled") { setStatus("Training cancelled.", "error"); reset(); return; }
        if (j.status === "error") { setStatus("Training failed: " + (j.error || "unknown error"), "error"); reset(); return; }
        var lbl = j.stage || "Training…";
        if (j.step && j.total_steps) lbl = "Training — step " + j.step + " / " + j.total_steps;
        if (j.eta_seconds != null && j.eta_seconds > 0) lbl += " • ~" + fmtDur(j.eta_seconds) + " left";
        showProgress(Math.max(2, Math.min(99, j.progress || 0)), lbl);
        pollJob(jobId);
      } catch (e) {
        pollFails++;
        if (pollFails >= 5) { setStatus("Lost connection — training may still be running. Check back shortly.", "error"); reset(); return; }
        pollJob(jobId);
      }
    }, POLL_MS);
  }

  function onDone() {
    reset();
    setStatus("Training complete.", "success");
    var name = (document.getElementById("trainName").value || "your LoRA").trim();
    var trig = (document.getElementById("trainTrigger").value || "").trim();
    document.getElementById("trainDoneMsg").innerHTML =
      "✓ <strong>" + name + "</strong> is trained and now available in the <a href='image-studio.html'>Image Studio</a> custom-LoRA picker." +
      (trig ? " Use the trigger word <strong>" + trig + "</strong> in your prompt." : "");
    document.getElementById("trainResult").style.display = "";
    loadList();
  }

  async function onCancel() {
    if (!lastJobId) return;
    if (!window.confirm("Cancel this training run? Progress will be lost.")) return;
    cancelBtn.disabled = true; cancelBtn.textContent = "Cancelling…";
    try {
      var token = await freshToken();
      await fetch(RENDER_ENDPOINT + "/jobs/" + lastJobId + "/cancel", { method: "POST", headers: { "Authorization": "Bearer " + token } });
      setStatus("Cancelling…");
    } catch (e) { cancelBtn.disabled = false; cancelBtn.textContent = "Cancel"; }
  }

  async function loadList() {
    if (!currentUser) return;
    var res = await client.from("training_jobs").select("name, base, status, trigger_word, created_at")
      .eq("user_id", currentUser.id).order("created_at", { ascending: false }).limit(20);
    if (res.error || !res.data || !res.data.length) return;
    var wrap = document.getElementById("trainListWrap");
    var list = document.getElementById("trainList");
    list.innerHTML = res.data.map(function (t) {
      var badge = t.status === "done" ? "✓ ready" : t.status === "error" ? "✕ failed" : t.status;
      return '<div class="admin-row"><div><strong>' + esc(t.name) + '</strong> ' +
        '<span class="frame-res">' + (t.base || "flux") + (t.trigger_word ? " · " + esc(t.trigger_word) : "") + '</span></div>' +
        '<div>' + badge + '</div></div>';
    }).join("");
    wrap.style.display = "";
  }

  function getRadio(name, dv) { var el = document.querySelector('input[name="' + name + '"]:checked'); return el ? el.value : dv; }
  function showProgress(pct, label) { progress.style.display = ""; progressFill.style.width = pct + "%"; progressLabel.textContent = label || ""; }
  function reset() { startBtn.disabled = false; cancelBtn.style.display = "none"; progress.style.display = "none"; clearTimeout(pollTimer); }
  function fmtDur(s) { s = Math.max(0, Math.round(s)); var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? h + "h " + m + "m" : (m ? m + "m" : Math.round(s) + "s"); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
})();

// AI Resource Hub — Lip Sync (LTX-2 image + audio -> talking video).
// Same single render seat as the other video tools (one GPU, one user).

(function () {
  var RENDER_ENDPOINT = "https://render.airesourcehub.vip";
  var MAX_IMG = 250 * 1024 * 1024;
  var MAX_AUDIO = 60 * 1024 * 1024;
  var POLL_MS = 4000;

  if (!window.supabase || typeof SUPABASE_URL === "undefined") return;
  var gate = document.getElementById("lipGate");
  var form = document.getElementById("lipForm");
  if (!gate || !form) return;

  var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  var genBtn = document.getElementById("lipGenerateBtn");
  var cancelBtn = document.getElementById("lipCancelBtn");
  var deleteBtn = document.getElementById("lipDeleteBtn");
  var statusEl = document.getElementById("lipStatus");
  var progress = document.getElementById("lipProgress");
  var progressFill = document.getElementById("lipProgressFill");
  var progressLabel = document.getElementById("lipProgressLabel");
  var resultWrap = document.getElementById("lipResult");
  var resultVideo = document.getElementById("lipResultVideo");
  var dlMp4 = document.getElementById("lipDownloadMp4");
  var dlMov = document.getElementById("lipDownloadMov");

  var currentUser = null, pollTimer = null, pollFails = 0, lastJobId = null;

  init();

  async function init() {
    var s = await client.auth.getSession();
    currentUser = s.data.session ? s.data.session.user : null;
    await refreshGate();
    client.auth.onAuthStateChange(function (_e, session) { currentUser = session ? session.user : null; refreshGate(); });

    if (genBtn) genBtn.addEventListener("click", onGenerate);
    if (cancelBtn) cancelBtn.addEventListener("click", cancelRender);
    if (deleteBtn) deleteBtn.addEventListener("click", deleteCurrent);
    var expandBtn = document.getElementById("lipExpandBtn");
    if (expandBtn) expandBtn.addEventListener("click", function () {
      if (resultVideo && resultVideo.src && typeof window.openRenderLightbox === "function") window.openRenderLightbox(resultVideo.src);
    });
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
      showGate('This tool runs on limited hardware, so it’s available to one authorized user at a time. <a href="auth.html">Log in</a> to check your access.');
      return;
    }
    var res = await client.from("render_seat").select("holder_id").eq("id", true).single();
    if (res.error) { showGate("Couldn’t check tool access right now. Please try again in a moment."); return; }
    if (res.data && res.data.holder_id && res.data.holder_id === currentUser.id) {
      gate.style.display = "none"; gate.classList.remove("show"); form.style.display = "";
    } else {
      showGate("The generator is currently assigned to another user — only one person can use it at a time. Contact the site admin if you need access.");
    }
  }
  function showGate(html) { gate.innerHTML = html; gate.classList.add("show"); gate.style.display = ""; form.style.display = "none"; }
  function setStatus(m, k) { if (statusEl) { statusEl.textContent = m || ""; statusEl.className = "form-status" + (k ? " " + k : ""); } }

  async function onGenerate() {
    var img = document.getElementById("lipImage").files[0];
    var aud = document.getElementById("lipAudio").files[0];
    var prompt = (document.getElementById("lipPrompt").value || "").trim();

    if (!img) { setStatus("Add a photo of the face.", "error"); return; }
    if (img.type.indexOf("image/") !== 0) { setStatus("The photo must be an image.", "error"); return; }
    if (img.size > MAX_IMG) { setStatus("Photo must be under 250 MB.", "error"); return; }
    if (!aud) { setStatus("Add an audio clip.", "error"); return; }
    if (aud.type.indexOf("audio/") !== 0) { setStatus("The audio must be an audio file (mp3, wav, m4a).", "error"); return; }
    if (aud.size > MAX_AUDIO) { setStatus("Audio must be under 60 MB.", "error"); return; }

    setStatus("Checking your session…");
    var token = await freshToken();
    if (!token) { setStatus("Your session expired — please log in again.", "error"); return; }

    genBtn.disabled = true;
    if (deleteBtn) deleteBtn.style.display = "none";
    if (cancelBtn) { cancelBtn.style.display = ""; cancelBtn.disabled = false; cancelBtn.textContent = "Cancel"; }
    resultWrap.style.display = "none";
    setStatus("Uploading your files…");
    showProgress(2, "Uploading…");

    var fd = new FormData();
    fd.append("image", img);
    fd.append("audio", aud);
    fd.append("prompt", prompt);

    var jobId;
    try {
      var r = await fetch(RENDER_ENDPOINT + "/lipsync-jobs", { method: "POST", headers: { "Authorization": "Bearer " + token }, body: fd });
      if (r.status === 403) { setStatus("You don’t currently hold the render seat.", "error"); reset(); return; }
      if (r.status === 409) { setStatus("The generator is busy with another job. Please try again shortly.", "error"); reset(); return; }
      if (!r.ok) throw new Error("HTTP " + r.status);
      var data = await r.json();
      jobId = data.job_id || data.id;
      if (!jobId) throw new Error("no job id");
      lastJobId = jobId;
    } catch (e) {
      setStatus("Couldn’t reach the render service. The desktop may be offline or the tunnel isn’t running.", "error");
      reset(); return;
    }
    setStatus("Generating your talking video — lip sync is heavy, so this can take a few minutes.");
    pollFails = 0;
    pollJob(jobId);
  }

  function pollJob(jobId) {
    clearTimeout(pollTimer);
    pollTimer = setTimeout(async function () {
      try {
        var token = await freshToken();
        var r = await fetch(RENDER_ENDPOINT + "/jobs/" + jobId, { headers: { "Authorization": "Bearer " + token } });
        if (r.status === 404) { setStatus("This render is no longer running (the service may have restarted).", "error"); reset(); return; }
        if (!r.ok) throw new Error("HTTP " + r.status);
        pollFails = 0;
        var j = await r.json();
        if (j.status === "done") { showProgress(100, "Done"); onDone(j); return; }
        if (j.status === "cancelled") { setStatus("Render cancelled.", "error"); reset(); return; }
        if (j.status === "error") { setStatus("Generation failed: " + (j.error || "unknown error"), "error"); reset(); return; }
        var lbl = j.stage || "Generating…";
        if (j.eta_seconds != null && j.eta_seconds > 0) lbl += " • ~" + fmtDur(j.eta_seconds) + " left";
        showProgress(Math.max(2, Math.min(99, j.progress || 0)), lbl);
        pollJob(jobId);
      } catch (e) {
        pollFails++;
        if (pollFails >= 5) { setStatus("Lost connection — but your render may still finish. Check “My lip syncs” in a few minutes.", "error"); reset(); return; }
        pollJob(jobId);
      }
    }, POLL_MS);
  }

  function onDone(j) {
    genBtn.disabled = false;
    if (cancelBtn) cancelBtn.style.display = "none";
    progress.style.display = "none";
    setStatus("Lip sync ready.", "success");
    var cb = "v=" + Date.now();
    var mp4 = absUrl(j.result_url) + (absUrl(j.result_url).indexOf("?") >= 0 ? "&" : "?") + cb;
    var mov = j.result_mov_url ? absUrl(j.result_mov_url) + (absUrl(j.result_mov_url).indexOf("?") >= 0 ? "&" : "?") + cb : null;
    resultVideo.src = mp4;
    dlMp4.href = mp4;
    if (mov) { dlMov.href = mov; dlMov.style.display = ""; } else { dlMov.style.display = "none"; }
    resultWrap.style.display = "";
    try { resultVideo.load(); } catch (e) {}
    if (deleteBtn) { deleteBtn.style.display = ""; deleteBtn.disabled = false; deleteBtn.textContent = "Delete this render"; }
    if (typeof window.reloadRenderArchive === "function") setTimeout(window.reloadRenderArchive, 1500);
  }

  async function cancelRender() {
    if (!lastJobId) return;
    if (!window.confirm("Cancel this render? It will stop immediately and free the GPU.")) return;
    cancelBtn.disabled = true; cancelBtn.textContent = "Cancelling…";
    try {
      var token = await freshToken();
      await fetch(RENDER_ENDPOINT + "/jobs/" + lastJobId + "/cancel", { method: "POST", headers: { "Authorization": "Bearer " + token } });
      setStatus("Cancelling the render…");
    } catch (e) {
      cancelBtn.disabled = false; cancelBtn.textContent = "Cancel";
      setStatus("Couldn’t reach the render service to cancel.", "error");
    }
  }

  async function deleteCurrent() {
    if (!lastJobId) return;
    if (!window.confirm("Delete this render permanently? This removes the video file and can't be undone.")) return;
    deleteBtn.disabled = true; deleteBtn.textContent = "Deleting…";
    var ok = false;
    try {
      var token = await freshToken();
      var r = await fetch(RENDER_ENDPOINT + "/jobs/" + lastJobId, { method: "DELETE", headers: { "Authorization": "Bearer " + token } });
      ok = r.ok;
    } catch (e) { ok = false; }
    if (ok) {
      resultWrap.style.display = "none"; deleteBtn.style.display = "none"; lastJobId = null;
      setStatus("Render deleted.", "success");
      if (typeof window.reloadRenderArchive === "function") window.reloadRenderArchive();
    } else {
      deleteBtn.disabled = false; deleteBtn.textContent = "Delete this render";
      setStatus("Couldn’t delete right now — the render service may be offline.", "error");
    }
  }

  function absUrl(u) { if (!u) return u; return /^https?:\/\//i.test(u) ? u : RENDER_ENDPOINT + (u.charAt(0) === "/" ? "" : "/") + u; }
  function showProgress(pct, label) { progress.style.display = ""; progressFill.style.width = pct + "%"; progressLabel.textContent = label || ""; }
  function reset() { genBtn.disabled = false; if (cancelBtn) cancelBtn.style.display = "none"; progress.style.display = "none"; clearTimeout(pollTimer); }
  function fmtDur(s) { s = Math.max(0, Math.round(s)); var m = Math.floor(s / 60), sec = s % 60; return m ? m + "m" : sec + "s"; }
})();

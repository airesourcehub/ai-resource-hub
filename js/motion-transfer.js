// AI Resource Hub — Motion Transfer (WAN 2.2 Animate).
// Reference image + driving video -> the character performs the motion.
// Same single "render seat" as AI Transitions (one GPU, one user at a time).

(function () {
  var RENDER_ENDPOINT = "https://render.airesourcehub.vip";
  var MAX_BYTES = 250 * 1024 * 1024;
  var POLL_MS = 4000;

  if (!window.supabase || typeof SUPABASE_URL === "undefined") return;
  var gate = document.getElementById("motionGate");
  var form = document.getElementById("motionForm");
  if (!gate || !form) return;

  var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  var genBtn = document.getElementById("motionGenerateBtn");
  var cancelBtn = document.getElementById("motionCancelBtn");
  var deleteBtn = document.getElementById("motionDeleteBtn");
  var statusEl = document.getElementById("motionStatus");
  var progress = document.getElementById("motionProgress");
  var progressFill = document.getElementById("motionProgressFill");
  var progressLabel = document.getElementById("motionProgressLabel");
  var resultWrap = document.getElementById("motionResult");
  var resultVideo = document.getElementById("motionResultVideo");
  var dlMp4 = document.getElementById("motionDownloadMp4");
  var dlMov = document.getElementById("motionDownloadMov");

  var currentUser = null, pollTimer = null, pollFails = 0, lastJobId = null;

  var IDENTITY_LOCK_TEXT = "Preserve the exact identity of the character from the reference image: keep the face, facial features, hair, skin tone, and clothing perfectly consistent and recognizable throughout. Do not morph, swap, distort, age, or change the character's identity.";

  init();

  async function init() {
    var s = await client.auth.getSession();
    currentUser = s.data.session ? s.data.session.user : null;
    await refreshGate();
    client.auth.onAuthStateChange(function (_e, session) { currentUser = session ? session.user : null; refreshGate(); });

    if (genBtn) genBtn.addEventListener("click", onGenerate);
    if (cancelBtn) cancelBtn.addEventListener("click", cancelRender);
    if (deleteBtn) deleteBtn.addEventListener("click", deleteCurrent);
    wirePhrase("motionIdentityLock", "Preserve the exact identity", IDENTITY_LOCK_TEXT);
    wirePhrase("motionHandheld", "handheld camera", "Filmed on a handheld camera with subtle, realistic camera shake and organic movement, like a live music video — slight bobbing, drift, and natural instability that adds dynamic energy.");
    wirePhrase("motionAnimateBg", "background is alive", "The environment and background is alive with motion — moving lights, drifting atmosphere, swaying elements, and subtle depth and parallax throughout the scene.");
    wirePhrase("motionDancers", "backup dancers", "Choreographed backup dancers perform in sync behind the main subject, music-video style, with energetic coordinated movement.");
    var expandBtn = document.getElementById("motionExpandBtn");
    if (expandBtn) expandBtn.addEventListener("click", function () {
      if (resultVideo && resultVideo.src && typeof window.openRenderLightbox === "function") window.openRenderLightbox(resultVideo.src);
    });
  }

  // Wire a prompt-enhancement button: append its phrase once (dedup by marker).
  function wirePhrase(btnId, marker, text) {
    var btn = document.getElementById(btnId);
    if (!btn) return;
    btn.addEventListener("click", function () {
      var box = document.getElementById("motionPrompt");
      if (!box || box.value.toLowerCase().indexOf(marker.toLowerCase()) !== -1) return;
      var cur = box.value.trim();
      box.value = cur ? (cur + " " + text) : text;
      box.focus();
    });
  }

  async function freshToken() {
    var r = await client.auth.getSession();
    var sess = r.data.session;
    if (sess && sess.expires_at) {
      var now = Math.floor(Date.now() / 1000);
      if (sess.expires_at - now < 120) {
        setStatus("Refreshing your session…");
        try { var rr = await client.auth.refreshSession(); if (rr.data && rr.data.session) sess = rr.data.session; } catch (e) {}
      }
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

  function setStatus(msg, kind) { if (statusEl) { statusEl.textContent = msg || ""; statusEl.className = "form-status" + (kind ? " " + kind : ""); } }

  function validFile(f, kind, which) {
    if (!f) return "Please add both the reference image and the driving video (" + which + " is missing).";
    if (f.type && f.type.indexOf(kind + "/") !== 0) return which + " must be " + (kind === "image" ? "an image" : "a video") + ".";
    if (f.size > MAX_BYTES) return which + " must be under 250 MB.";
    return null;
  }

  async function onGenerate() {
    var img = document.getElementById("motionImage").files[0];
    var vid = document.getElementById("motionVideo").files[0];
    var prompt = (document.getElementById("motionPrompt").value || "").trim();
    var orientEl = document.querySelector('input[name="motionOrient"]:checked');
    var orientation = orientEl ? orientEl.value : "landscape";
    var speedEl = document.querySelector('input[name="motionSpeed"]:checked');
    var speed = speedEl ? speedEl.value : "quality";
    var lengthEl = document.querySelector('input[name="motionLength"]:checked');
    var length = lengthEl ? lengthEl.value : "5";

    var err = validFile(img, "image", "Reference image") || validFile(vid, "video", "Driving video");
    if (err) { setStatus(err, "error"); return; }

    setStatus("Checking your session…");
    var token = await freshToken();
    if (!token) { setStatus("Your session expired — please log in again.", "error"); return; }

    genBtn.disabled = true;
    if (deleteBtn) deleteBtn.style.display = "none";
    if (cancelBtn) { cancelBtn.style.display = ""; cancelBtn.disabled = false; cancelBtn.textContent = "Cancel render"; }
    resultWrap.style.display = "none";
    setStatus("Uploading your files…");
    showProgress(2, "Uploading…");

    var fd = new FormData();
    fd.append("image", img);
    fd.append("video", vid);
    fd.append("prompt", prompt || "A cinematic video of the character performing the motion, natural lighting, sharp focus, high detail.");
    fd.append("orientation", orientation);
    fd.append("speed", speed);
    fd.append("length", length);

    var jobId;
    try {
      var r = await fetch(RENDER_ENDPOINT + "/motion-jobs", { method: "POST", headers: { "Authorization": "Bearer " + token }, body: fd });
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

    setStatus("Detecting pose and generating — motion transfer is heavy, so this can take several minutes.");
    pollFails = 0;
    pollJob(jobId);
  }

  function pollJob(jobId) {
    clearTimeout(pollTimer);
    pollTimer = setTimeout(async function () {
      try {
        var token = await freshToken();
        var r = await fetch(RENDER_ENDPOINT + "/jobs/" + jobId, { headers: { "Authorization": "Bearer " + token } });
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
        if (pollFails >= 5) { setStatus("Lost connection — but your render may still finish. Check “My motion transfer renders” in a few minutes.", "error"); reset(); return; }
        pollJob(jobId);
      }
    }, POLL_MS);
  }

  function onDone(j) {
    genBtn.disabled = false;
    if (cancelBtn) cancelBtn.style.display = "none";
    progress.style.display = "none";
    setStatus("Motion transfer ready.", "success");
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

  function absUrl(u) {
    if (!u) return u;
    if (/^https?:\/\//i.test(u)) return u;
    return RENDER_ENDPOINT + (u.charAt(0) === "/" ? "" : "/") + u;
  }
  function showProgress(pct, label) { progress.style.display = ""; progressFill.style.width = pct + "%"; progressLabel.textContent = label || ""; }
  function reset() { genBtn.disabled = false; if (cancelBtn) cancelBtn.style.display = "none"; progress.style.display = "none"; clearTimeout(pollTimer); }

  async function cancelRender() {
    if (!lastJobId) return;
    if (!window.confirm("Cancel this render? It will stop immediately and free the GPU.")) return;
    cancelBtn.disabled = true; cancelBtn.textContent = "Cancelling…";
    try {
      var token = await freshToken();
      await fetch(RENDER_ENDPOINT + "/jobs/" + lastJobId + "/cancel", { method: "POST", headers: { "Authorization": "Bearer " + token } });
      setStatus("Cancelling the render…");
    } catch (e) {
      cancelBtn.disabled = false; cancelBtn.textContent = "Cancel render";
      setStatus("Couldn’t reach the render service to cancel.", "error");
    }
  }

  function fmtDur(s) {
    s = Math.max(0, Math.round(s));
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    if (h) return h + "h " + m + "m";
    if (m) return m + "m";
    return sec + "s";
  }
})();

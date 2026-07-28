// AI Resource Hub — "Music Sync Transition".
// Uploads two beat-matched clips; the render service detects the beat in each,
// cuts on the nearest beat to the middle, blends with WAN, times the transition
// to the beat, and keeps the music playing across the whole output.
// Lives inside the seat-gated #blendForm, so it's only visible to the seat holder.

(function () {
  var RENDER_ENDPOINT = "https://render.airesourcehub.vip";
  var MAX_BYTES = 250 * 1024 * 1024;
  var POLL_MS = 4000;

  if (!window.supabase || typeof SUPABASE_URL === "undefined") return;
  var genBtn = document.getElementById("musicGenerateBtn");
  if (!genBtn) return;

  var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  var deleteBtn = document.getElementById("musicDeleteBtn");
  var statusEl = document.getElementById("musicStatus");
  var progress = document.getElementById("musicProgress");
  var progressFill = document.getElementById("musicProgressFill");
  var progressLabel = document.getElementById("musicProgressLabel");
  var resultWrap = document.getElementById("musicResult");
  var resultVideo = document.getElementById("musicResultVideo");
  var dlMp4 = document.getElementById("musicDownloadMp4");
  var dlMov = document.getElementById("musicDownloadMov");

  var pollTimer = null, pollFails = 0, lastJobId = null;

  var IDENTITY_LOCK_TEXT = "Preserve the exact identity of every person and character: keep each face, facial features, hair, skin tone, body, and clothing perfectly consistent and recognizable from the first frame to the last. Do not morph, swap, distort, age, or change anyone's identity.";

  genBtn.addEventListener("click", onGenerate);
  if (deleteBtn) deleteBtn.addEventListener("click", deleteCurrent);
  var lockBtn = document.getElementById("musicIdentityLock");
  if (lockBtn) lockBtn.addEventListener("click", function () {
    var box = document.getElementById("musicPrompt");
    if (!box || box.value.indexOf("Preserve the exact identity") !== -1) return;
    var cur = box.value.trim();
    box.value = cur ? (cur + " " + IDENTITY_LOCK_TEXT) : IDENTITY_LOCK_TEXT;
    box.focus();
  });

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

  function setStatus(msg, kind) {
    if (!statusEl) return;
    statusEl.textContent = msg || "";
    statusEl.className = "form-status" + (kind ? " " + kind : "");
  }

  function validFile(f, which) {
    if (!f) return "Please choose both clips (" + which + " is missing).";
    if (f.type && f.type.indexOf("video/") !== 0) return "Both files must be videos.";
    if (f.size > MAX_BYTES) return "Each clip must be under 250 MB.";
    return null;
  }

  async function onGenerate() {
    var a = document.getElementById("musicVideoA").files[0];
    var b = document.getElementById("musicVideoB").files[0];
    var prompt = (document.getElementById("musicPrompt").value || "").trim();
    var orientEl = document.querySelector('input[name="musicOrient"]:checked');
    var orientation = orientEl ? orientEl.value : "landscape";
    var speedEl = document.querySelector('input[name="musicSpeed"]:checked');
    var speed = speedEl ? speedEl.value : "quality";

    var err = validFile(a, "first clip") || validFile(b, "second clip");
    if (err) { setStatus(err, "error"); return; }
    if (!prompt) { setStatus("Please describe the transition you want.", "error"); return; }

    setStatus("Checking your session…");
    var token = await freshToken();
    if (!token) { setStatus("Your session expired — please log in again.", "error"); return; }

    genBtn.disabled = true;
    if (deleteBtn) deleteBtn.style.display = "none";
    resultWrap.style.display = "none";
    setStatus("Uploading your clips…");
    showProgress(2, "Uploading…");

    var fd = new FormData();
    fd.append("videoA", a);
    fd.append("videoB", b);
    fd.append("prompt", prompt);
    fd.append("orientation", orientation);
    fd.append("speed", speed);
    fd.append("kind", "music_sync");

    var jobId;
    try {
      var r = await fetch(RENDER_ENDPOINT + "/jobs", {
        method: "POST", headers: { "Authorization": "Bearer " + token }, body: fd
      });
      if (r.status === 423 || r.status === 403) { setStatus("The GPU is reserved by the admin for another user right now.", "error"); reset(); return; }
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

    setStatus("Detecting the beat and generating — this can take a few minutes.");
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
        if (j.status === "error") { setStatus("Generation failed: " + (j.error || "unknown error"), "error"); reset(); return; }
        var p = Math.max(2, Math.min(99, j.progress || 0));
        showProgress(p, j.stage || "Generating…");
        pollJob(jobId);
      } catch (e) {
        pollFails++;
        if (pollFails >= 5) { setStatus("Lost connection — but your render may still finish. Check “My Renders” in a few minutes.", "error"); reset(); return; }
        pollJob(jobId);
      }
    }, POLL_MS);
  }

  function onDone(j) {
    genBtn.disabled = false;
    progress.style.display = "none";
    setStatus("Music-synced transition ready.", "success");
    var mp4 = absUrl(j.result_url);
    var mov = j.result_mov_url ? absUrl(j.result_mov_url) : null;
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
  function reset() { genBtn.disabled = false; progress.style.display = "none"; clearTimeout(pollTimer); }
})();

// AI Resource Hub — "Blend two clips with AI" (WAN 2.2 FLF2V transition generator)
//
// This talks to a private render service running on the site owner's own
// desktop (RTX 3090), exposed through a Cloudflare Tunnel. Only the current
// "render seat" holder (set by the admin in the admin panel) can submit jobs.
//
// The render service does the heavy lifting: extract the boundary frames,
// run the WAN 2.2 First-Last-Frame workflow in ComfyUI, optionally stitch
// clip A + transition + clip B with ffmpeg, and return a downloadable file.

(function () {
  // Cloudflare Tunnel hostname that points at the desktop render service.
  var RENDER_ENDPOINT = "https://render.airesourcehub.vip";
  var MAX_BYTES = 250 * 1024 * 1024; // 250 MB per clip
  var POLL_MS = 4000;

  if (!window.supabase || typeof SUPABASE_URL === "undefined") return;

  var gate = document.getElementById("blendGate");
  var form = document.getElementById("blendForm");
  if (!gate || !form) return;

  var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  var genBtn = document.getElementById("blendGenerateBtn");
  var deleteBtn = document.getElementById("blendDeleteBtn");
  var statusEl = document.getElementById("blendStatus");
  var progress = document.getElementById("blendProgress");
  var progressFill = document.getElementById("blendProgressFill");
  var progressLabel = document.getElementById("blendProgressLabel");
  var resultWrap = document.getElementById("blendResult");
  var resultVideo = document.getElementById("blendResultVideo");
  var dlMp4 = document.getElementById("blendDownloadMp4");
  var dlMov = document.getElementById("blendDownloadMov");

  var currentUser = null;
  var pollTimer = null;
  var pollFails = 0;
  var lastJobId = null;

  init();

  async function init() {
    var s = await client.auth.getSession();
    currentUser = s.data.session ? s.data.session.user : null;
    await refreshGate();
    client.auth.onAuthStateChange(function (_e, session) {
      currentUser = session ? session.user : null;
      refreshGate();
    });
    if (genBtn) genBtn.addEventListener("click", onGenerate);
    if (deleteBtn) deleteBtn.addEventListener("click", deleteCurrent);

    var lockBtn = document.getElementById("blendIdentityLock");
    if (lockBtn) lockBtn.addEventListener("click", addIdentityLock);
  }

  // Text appended when the user hits "Identity Lock" — keeps people/characters
  // looking the same from the first clip through to the second.
  var IDENTITY_LOCK_TEXT = "Preserve the exact identity of every person and character: keep each face, facial features, hair, skin tone, body, and clothing perfectly consistent and recognizable from the first frame to the last. Do not morph, swap, distort, age, or change anyone's identity.";

  function addIdentityLock() {
    var box = document.getElementById("blendPrompt");
    if (!box) return;
    if (box.value.indexOf("Preserve the exact identity") !== -1) return; // already added
    var cur = box.value.trim();
    box.value = cur ? (cur + " " + IDENTITY_LOCK_TEXT) : IDENTITY_LOCK_TEXT;
    box.focus();
  }

  async function getToken() {
    var r = await client.auth.getSession();
    return r.data.session ? r.data.session.access_token : null;
  }

  // Returns a valid token, proactively refreshing a near-expired session so
  // clicking Generate never silently fails on a stale login.
  async function freshToken() {
    var r = await client.auth.getSession();
    var sess = r.data.session;
    if (sess && sess.expires_at) {
      var now = Math.floor(Date.now() / 1000);
      if (sess.expires_at - now < 120) {
        setStatus("Refreshing your session…");
        try {
          var rr = await client.auth.refreshSession();
          if (rr.data && rr.data.session) sess = rr.data.session;
        } catch (e) {}
      }
    }
    return sess ? sess.access_token : null;
  }

  async function refreshGate() {
    if (!currentUser) {
      showGate('This generator runs on limited hardware, so it’s available to one authorized user at a time. <a href="auth.html">Log in</a> to check your access.');
      return;
    }
    var res = await client.from("render_seat").select("holder_id").eq("id", true).single();
    if (res.error) {
      showGate("Couldn’t check tool access right now. Please try again in a moment.");
      return;
    }
    if (res.data && res.data.holder_id && res.data.holder_id === currentUser.id) {
      gate.style.display = "none";
      gate.classList.remove("show");
      form.style.display = "";
    } else {
      showGate("The AI transition generator is currently assigned to another user — only one person can use it at a time. Contact the site admin if you need access.");
    }
  }

  function showGate(html) {
    gate.innerHTML = html;
    gate.classList.add("show");
    gate.style.display = "";
    form.style.display = "none";
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
    var a = document.getElementById("blendVideoA").files[0];
    var b = document.getElementById("blendVideoB").files[0];
    var prompt = (document.getElementById("blendPrompt").value || "").trim();
    var modeEl = document.querySelector('input[name="blendMode"]:checked');
    var mode = modeEl ? modeEl.value : "stitched";
    var orientEl = document.querySelector('input[name="blendOrient"]:checked');
    var orientation = orientEl ? orientEl.value : "landscape";
    var speedEl = document.querySelector('input[name="blendSpeed"]:checked');
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
    fd.append("mode", mode);
    fd.append("orientation", orientation);
    fd.append("speed", speed);

    var jobId;
    try {
      var r = await fetch(RENDER_ENDPOINT + "/jobs", {
        method: "POST",
        headers: { "Authorization": "Bearer " + token },
        body: fd
      });
      if (r.status === 403) { setStatus("You don’t currently hold the render seat.", "error"); reset(); return; }
      if (r.status === 409) { setStatus("The generator is busy with another job. Please try again shortly.", "error"); reset(); return; }
      if (!r.ok) throw new Error("HTTP " + r.status);
      var data = await r.json();
      jobId = data.job_id || data.id;
      if (!jobId) throw new Error("no job id");
      lastJobId = jobId;
    } catch (e) {
      setStatus("Couldn’t reach the render service. The desktop may be offline or the tunnel isn’t running.", "error");
      reset();
      return;
    }

    setStatus("Generating your transition — this can take a few minutes. You can leave this tab open.");
    pollFails = 0;
    pollJob(jobId);
  }

  function pollJob(jobId) {
    clearTimeout(pollTimer);
    pollTimer = setTimeout(async function () {
      try {
        // Refresh the token every poll so long renders don't expire mid-way.
        var token = await freshToken();
        var r = await fetch(RENDER_ENDPOINT + "/jobs/" + jobId, {
          headers: { "Authorization": "Bearer " + token }
        });
        if (!r.ok) throw new Error("HTTP " + r.status);
        pollFails = 0;
        var j = await r.json();

        if (j.status === "done") { showProgress(100, "Done"); onDone(j); return; }
        if (j.status === "error") { setStatus("Generation failed: " + (j.error || "unknown error"), "error"); reset(); return; }

        var p = Math.max(2, Math.min(99, j.progress || 0));
        showProgress(p, j.stage || (j.status === "processing" ? "Generating…" : "Queued…"));
        pollJob(jobId);
      } catch (e) {
        // Tolerate transient blips (token refresh, brief network drop) before giving up.
        pollFails++;
        if (pollFails >= 5) {
          setStatus("Lost connection to the render service — but your render may still finish. Check “My Renders” in a few minutes.", "error");
          reset();
          return;
        }
        pollJob(jobId);
      }
    }, POLL_MS);
  }

  function onDone(j) {
    genBtn.disabled = false;
    progress.style.display = "none";
    setStatus("Transition ready.", "success");

    var mp4 = absUrl(j.result_url);
    var mov = j.result_mov_url ? absUrl(j.result_mov_url) : null;

    resultVideo.src = mp4;
    dlMp4.href = mp4;
    if (mov) { dlMov.href = mov; dlMov.style.display = ""; }
    else { dlMov.style.display = "none"; }

    resultWrap.style.display = "";
    try { resultVideo.load(); } catch (e) {}

    // Now that the render exists, reveal the delete option next to Generate.
    if (deleteBtn) { deleteBtn.style.display = ""; deleteBtn.disabled = false; deleteBtn.textContent = "Delete this render"; }

    // Refresh the "recent renders" strip so the new one shows up immediately.
    if (typeof window.reloadRenderArchive === "function") {
      setTimeout(window.reloadRenderArchive, 1500);
    }
  }

  async function deleteCurrent() {
    if (!lastJobId) return;
    if (!window.confirm("Delete this render permanently? This removes the video file and can't be undone.")) return;
    deleteBtn.disabled = true;
    deleteBtn.textContent = "Deleting…";
    var ok = false;
    try {
      var token = await freshToken();
      var r = await fetch(RENDER_ENDPOINT + "/jobs/" + lastJobId, {
        method: "DELETE",
        headers: { "Authorization": "Bearer " + token }
      });
      ok = r.ok;
    } catch (e) { ok = false; }

    if (ok) {
      resultWrap.style.display = "none";
      deleteBtn.style.display = "none";
      lastJobId = null;
      setStatus("Render deleted.", "success");
      if (typeof window.reloadRenderArchive === "function") window.reloadRenderArchive();
    } else {
      deleteBtn.disabled = false;
      deleteBtn.textContent = "Delete this render";
      setStatus("Couldn’t delete right now — the render service may be offline.", "error");
    }
  }

  function absUrl(u) {
    if (!u) return u;
    if (/^https?:\/\//i.test(u)) return u;
    return RENDER_ENDPOINT + (u.charAt(0) === "/" ? "" : "/") + u;
  }

  function showProgress(pct, label) {
    progress.style.display = "";
    progressFill.style.width = pct + "%";
    progressLabel.textContent = label || "";
  }

  function reset() {
    genBtn.disabled = false;
    progress.style.display = "none";
    clearTimeout(pollTimer);
  }
})();

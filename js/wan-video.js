// AI Resource Hub — WAN Video (identity → video).
// Sora-style: pick one or more of your own trained WAN identities, write a
// prompt, and generate a video. Open to any logged-in user; jobs queue
// one-at-a-time on the GPU (same model as Image Studio).

(function () {
  var RENDER_ENDPOINT = function () { return window.AIRH_GPU ? window.AIRH_GPU.base() : "https://render.airesourcehub.vip"; };  // your GPU (see js/gpu.js)
  var POLL_MS = 3000;

  if (!window.supabase || typeof SUPABASE_URL === "undefined") return;
  var studio = document.getElementById("wanStudio");
  if (!studio) return;

  var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  var user = null, identities = [], selected = {}, pollTimer = null, pollFails = 0, lastJobId = null;

  var GRADIENTS = ["a1c4fd,c2e9fb", "fbc2eb,a6c1ee", "84fab0,8fd3f4", "ffecd2,fcb69f", "d4fc79,96e6a1",
                   "f6d365,fda085", "e0c3fc,8ec5fc", "f093fb,f5576c", "5ee7df,b490ca", "c1dfc4,deecdd"];

  init();

  async function init() {
    var s = await client.auth.getSession();
    user = s.data.session ? s.data.session.user : null;
    gate();
    client.auth.onAuthStateChange(function (_e, sess) { user = sess ? sess.user : null; gate(); });

    document.getElementById("wanGenerateBtn").addEventListener("click", onGenerate);
    document.getElementById("wanCancelBtn").addEventListener("click", onCancel);
    document.getElementById("wanEnhance").addEventListener("click", enhancePrompt);
    document.getElementById("wanExpandBtn").addEventListener("click", function () {
      if (window.openRenderLightbox) window.openRenderLightbox(document.getElementById("wanResultVideo").src);
    });
  }

  function gate() {
    var g = document.getElementById("wanGate");
    if (!user) {
      g.innerHTML = 'WAN video is for signed-in members. <a href="auth.html">Log in</a> to start creating.';
      g.classList.add("show"); g.style.display = ""; studio.style.display = "none";
      return;
    }
    g.style.display = "none"; g.classList.remove("show"); studio.style.display = "";
    loadIdentities();
  }

  // ---- identities: trained characters (hub + yours) and your saved influencers, by @handle --------------
  async function loadIdentities() {
    var token = await freshToken();
    try {
      var r = await fetch(RENDER_ENDPOINT() + "/my-characters", { headers: { "Authorization": "Bearer " + token } });
      var d = await r.json();
      identities = (d.characters || []).slice().sort(function (a, b) { return (b.trained ? 1 : 0) - (a.trained ? 1 : 0); });
    } catch (e) { identities = []; }
    renderIdentities();
  }

  function thumbUrl(t) {
    if (!t) return "";
    if (/^https?:/i.test(t)) return t;
    return t.charAt(0) === "/" ? RENDER_ENDPOINT() + t : t;      // "/files/..." lives on the GPU, "img/..." on the site
  }

  function renderIdentities() {
    var host = document.getElementById("identityPicker");
    var empty = document.getElementById("identityEmpty");
    if (!identities.length) {
      host.innerHTML = ""; empty.style.display = "";
      document.getElementById("wanForm").style.display = "none";
      return;
    }
    empty.style.display = "none";
    host.innerHTML = identities.map(function (t, i) {
      var g = GRADIENTS[i % GRADIENTS.length].split(",");
      var on = !!selected[t.handle];
      var bg = t.thumb ? "url('" + esc(thumbUrl(t.thumb)) + "') center/cover" : "linear-gradient(135deg,#" + g[0] + ",#" + g[1] + ")";
      return '<button type="button" class="model-card' + (on ? " selected" : "") + '" data-h="' + esc(t.handle) + '">' +
        '<span class="model-thumb" style="background:' + bg + '">' +
          (on ? '<span class="model-badge model-badge-lora">&#10003; selected</span>' : (t.trained ? '<span class="model-badge">Trained</span>' : '')) +
        '</span>' +
        '<span class="model-name">' + esc(t.name || t.handle) + '</span>' +
        '<span class="model-note">@' + esc(t.handle) + (t.trained ? "" : " · picture only") + '</span>' +
      '</button>';
    }).join("");
    Array.prototype.forEach.call(host.querySelectorAll(".model-card"), function (c) {
      c.addEventListener("click", function () { toggleIdentity(c.getAttribute("data-h")); });
    });
    document.getElementById("wanForm").style.display = "";
    updateTriggerHint();
  }

  function toggleIdentity(h) {
    if (selected[h]) delete selected[h];
    else {
      if (selectedList().length >= 2) { setStatus("Up to 2 characters per video.", "error"); return; }
      selected[h] = true;
    }
    renderIdentities();
  }

  function selectedList() {
    return identities.filter(function (t) { return selected[t.handle]; });
  }

  function updateTriggerHint() {
    var picked = selectedList();
    var hint = document.getElementById("wanTriggerHint");
    hint.innerHTML = picked.length
      ? "Starring <strong>" + picked.map(function (t) { return "@" + esc(t.handle); }).join(" and ") + "</strong>. You can also type @handles in the prompt."
      : "Pick a character above, or type an @handle in your prompt.";
  }

  var ENHANCERS = ["highly detailed", "cinematic", "smooth motion", "professional lighting", "sharp focus"];
  function enhancePrompt() {
    var box = document.getElementById("wanPrompt");
    var cur = box.value.trim();
    if (!cur) { box.focus(); return; }
    var low = cur.toLowerCase();
    var adds = ENHANCERS.filter(function (t) { return low.indexOf(t.split(" ")[0]) === -1; });
    if (!adds.length) return;
    box.value = cur.replace(/[,\s]+$/, "") + ", " + adds.join(", ") + ".";
    box.focus();
  }

  // ---- generate ----------------------------------------------------------
  async function onGenerate() {
    var picked = selectedList();
    var prompt = (document.getElementById("wanPrompt").value || "").trim();
    if (!prompt) { setStatus("Please write a prompt.", "error"); return; }
    var missing = picked.filter(function (t) { return prompt.toLowerCase().indexOf("@" + t.handle.toLowerCase()) === -1; });
    if (missing.length) prompt = missing.map(function (t) { return "@" + t.handle; }).join(" and ") + " " + prompt;
    if (!/@[A-Za-z0-9_]{2,}/.test(prompt)) { setStatus("Pick a character first.", "error"); return; }

    var token = await freshToken();
    if (!token) { setStatus("Your session expired — please log in again.", "error"); return; }

    var size = getRadio("wanSize", "portrait");
    var fd = new FormData();
    fd.append("prompt", prompt);
    fd.append("orientation", size === "landscape" ? "landscape" : "portrait");
    fd.append("res", getRadio("wanRes", "480p"));
    fd.append("length", getRadio("wanLength", "5"));
    fd.append("shots", "1");

    setBusy(true);
    setStatus("Queued…");
    showProgress(2, "Queued…");

    var jobId;
    try {
      var r = await fetch(RENDER_ENDPOINT() + "/scene-jobs", { method: "POST", headers: { "Authorization": "Bearer " + token }, body: fd });
      var data = await r.json().catch(function () { return {}; });
      if (r.status === 409) { setStatus("The GPU is busy with another job. It’ll start as soon as it’s free — or try again shortly.", "error"); setBusy(false); return; }
      if (!r.ok) throw new Error(data.detail || ("HTTP " + r.status));
      jobId = data.job_id;
      lastJobId = jobId;
    } catch (e) {
      setStatus("Couldn’t reach the render service. It may be offline.", "error");
      setBusy(false); return;
    }
    pollFails = 0;
    pollJob(jobId);
  }

  function pollJob(jobId) {
    clearTimeout(pollTimer);
    pollTimer = setTimeout(async function () {
      try {
        var token = await freshToken();
        var r = await fetch(RENDER_ENDPOINT() + "/jobs/" + jobId, { headers: { "Authorization": "Bearer " + token } });
        if (r.status === 404) { setStatus("This job is no longer running (service may have restarted).", "error"); setBusy(false); return; }
        if (!r.ok) throw new Error("HTTP " + r.status);
        pollFails = 0;
        var j = await r.json();
        if (j.status === "done") { showProgress(100, "Done"); onDone(j); return; }
        if (j.status === "cancelled") { setStatus("Cancelled.", "error"); setBusy(false); return; }
        if (j.status === "error") { setStatus("Generation failed: " + (j.error || "unknown error"), "error"); setBusy(false); return; }
        var lbl = j.stage || "Generating…";
        if (j.eta_seconds != null && j.eta_seconds > 0) lbl += " • ~" + fmtDur(j.eta_seconds) + " left";
        showProgress(Math.max(2, Math.min(99, j.progress || 0)), lbl);
        pollJob(jobId);
      } catch (e) {
        pollFails++;
        if (pollFails >= 5) { setStatus("Lost connection — your video may still finish. Check your recent videos shortly.", "error"); setBusy(false); return; }
        pollJob(jobId);
      }
    }, POLL_MS);
  }

  function onDone(j) {
    setBusy(false);
    document.getElementById("wanProgress").style.display = "none";
    setStatus("Done.", "success");
    var mp4 = absUrl(j.result_url) + "?v=" + Date.now();
    var v = document.getElementById("wanResultVideo");
    v.src = mp4;
    document.getElementById("wanDownloadMp4").href = mp4;
    var movEl = document.getElementById("wanDownloadMov");
    if (j.result_mov_url) { movEl.href = absUrl(j.result_mov_url); movEl.style.display = ""; }
    else movEl.style.display = "none";
    document.getElementById("wanResult").style.display = "";
    if (typeof window.reloadRenderArchive === "function") setTimeout(window.reloadRenderArchive, 1500);
  }

  async function onCancel() {
    if (!lastJobId) return;
    try {
      var token = await freshToken();
      await fetch(RENDER_ENDPOINT() + "/jobs/" + lastJobId + "/cancel", { method: "POST", headers: { "Authorization": "Bearer " + token } });
      setStatus("Cancelling…");
    } catch (e) {}
  }

  // ---- helpers -----------------------------------------------------------
  async function freshToken() {
    var r = await client.auth.getSession();
    var sess = r.data.session;
    if (sess && sess.expires_at && sess.expires_at - Math.floor(Date.now() / 1000) < 120) {
      try { var rr = await client.auth.refreshSession(); if (rr.data && rr.data.session) sess = rr.data.session; } catch (e) {}
    }
    return sess ? sess.access_token : null;
  }
  function getRadio(name, dv) { var el = document.querySelector('input[name="' + name + '"]:checked'); return el ? el.value : dv; }
  function setStatus(m, k) { var e = document.getElementById("wanStatus"); e.textContent = m || ""; e.className = "form-status" + (k ? " " + k : ""); }
  function showProgress(p, l) { var pr = document.getElementById("wanProgress"); pr.style.display = ""; document.getElementById("wanProgressFill").style.width = p + "%"; document.getElementById("wanProgressLabel").textContent = l || ""; }
  function setBusy(b) {
    document.getElementById("wanGenerateBtn").disabled = b;
    document.getElementById("wanCancelBtn").style.display = b ? "" : "none";
    if (!b) document.getElementById("wanProgress").style.display = "none";
  }
  function absUrl(u) { if (!u) return u; return /^https?:\/\//i.test(u) ? u : RENDER_ENDPOINT() + (u.charAt(0) === "/" ? "" : "/") + u; }
  function fmtDur(s) { s = Math.max(0, Math.round(s)); var m = Math.floor(s / 60), sec = s % 60; return m ? m + "m" : sec + "s"; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
})();

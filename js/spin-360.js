// AI Resource Hub — 360 Studio: one object photo (or your own photos) -> views all the way around it,
// cut out on white and lined up, plus a spin video, a ZIP, and an optional multi-view 3D model.
// Jobs go to the render server: POST /spin-jobs, POST /spin-3d (Hunyuan3D-2mv), GET /jobs/:id.
// Finished sets are listed from render_jobs (render_type spin_360); multi-view models land in 3D Studio too.
(function () {
  var RENDER = function () { return window.AIRH_GPU ? window.AIRH_GPU.base() : "https://render.airesourcehub.vip"; };
  if (!window.supabase || typeof SUPABASE_URL === "undefined") return;
  var $ = function (id) { return document.getElementById(id); };
  if (!$("spForm")) return;
  var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  var MAX_UP = 40 * 1024 * 1024;
  var st = { src: "ai", views: 8, user: null, job: null, mvJob: null, timer: null, mvTimer: null, fails: 0, pick: null,
             rows: [], open: null, frame: 0, play: true, spinTimer: null, frames: [], q: "standard", info: {}, ownFiles: [] };

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function absUrl(u) { if (!u) return u; return /^https?:\/\//i.test(u) ? u : RENDER() + (u.charAt(0) === "/" ? "" : "/") + u; }
  function status(t, k) { var s = $("spStatus"); s.textContent = t || ""; s.className = "form-status" + (t ? " show" : "") + (k ? " " + k : ""); }
  function fmt(s) { s = Math.max(0, Math.round(s || 0)); return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2); }
  async function token() {
    var r = await client.auth.getSession(); var s = r.data.session;
    if (s && s.expires_at && s.expires_at - Date.now() / 1000 < 120) { try { var rr = await client.auth.refreshSession(); if (rr.data && rr.data.session) s = rr.data.session; } catch (e) {} }
    return s ? s.access_token : null;
  }
  function cfg() {
    var d = { mv3d: true, defaultViews: 8 };
    try { var s = JSON.parse(localStorage.getItem("airh-site-settings") || "null"); if (s && s.spin360) d = Object.assign(d, s.spin360); } catch (e) {}
    return d;
  }

  // ---------- form
  function paint() {
    Array.prototype.forEach.call(document.querySelectorAll(".as-tabs [data-src]"), function (b) {
      var on = b.getAttribute("data-src") === st.src; b.classList.toggle("is-on", on); b.setAttribute("aria-selected", on ? "true" : "false");
    });
    Array.prototype.forEach.call(document.querySelectorAll("#spForm [data-for]"), function (el) { el.style.display = el.getAttribute("data-for") === st.src ? "" : "none"; });
    Array.prototype.forEach.call(document.querySelectorAll("#spViews [data-n]"), function (b) {
      var on = +b.getAttribute("data-n") === st.views; b.classList.toggle("is-on", on); b.setAttribute("aria-checked", on ? "true" : "false");
    });
    Array.prototype.forEach.call(document.querySelectorAll("#spQ [data-q]"), function (b) { b.classList.toggle("is-on", b.getAttribute("data-q") === st.q); });
  }
  document.querySelector(".as-tabs").addEventListener("click", function (e) { var b = e.target.closest("[data-src]"); if (!b) return; st.src = b.getAttribute("data-src"); paint(); });
  $("spViews").addEventListener("click", function (e) { var b = e.target.closest("[data-n]"); if (!b) return; st.views = +b.getAttribute("data-n"); paint(); });
  $("spQ").addEventListener("click", function (e) { var b = e.target.closest("[data-q]"); if (!b) return; st.q = b.getAttribute("data-q"); paint(); });
  $("spMm").addEventListener("input", function () { $("spMmOut").textContent = this.value + " mm"; });

  $("spFile").addEventListener("change", function () { if (this.files[0]) setPick(null); });
  $("spUnpick").addEventListener("click", function () { setPick(null); });
  function setPick(p) {
    st.pick = p;
    $("spPicked").hidden = !p;
    if (p) { $("spPickedImg").src = absUrl(p); $("spFile").value = ""; var o = document.querySelector('#spForm [data-for="ai"] .vs-drop-file'); if (o) o.innerHTML = ""; }
    Array.prototype.forEach.call(document.querySelectorAll("#spMineGrid button"), function (b) { b.classList.toggle("is-on", b.getAttribute("data-u") === p); });
  }
  $("spMine").addEventListener("toggle", async function () {
    if (!this.open || this.getAttribute("data-loaded") || !st.user) return;
    this.setAttribute("data-loaded", "1");
    var r = await client.from("image_jobs").select("id,urls").eq("user_id", st.user.id).eq("status", "done").order("created_at", { ascending: false }).limit(24);
    var urls = []; (r.data || []).forEach(function (x) { (x.urls || []).forEach(function (u) { if (urls.length < 48) urls.push(u); }); });
    $("spMineGrid").innerHTML = urls.length ? urls.map(function (u) { return '<button type="button" data-u="' + esc(u) + '" aria-label="Use this image"><img loading="lazy" src="' + esc(absUrl(u)) + '" alt=""/></button>'; }).join("") : '<p class="as-hint">No images yet.</p>';
  });
  $("spMineGrid").addEventListener("click", function (e) { var b = e.target.closest("[data-u]"); if (b) setPick(b.getAttribute("data-u")); });

  // own photos: keep the order, allow reordering / removing
  $("spOwn").addEventListener("change", function () {
    Array.prototype.forEach.call(this.files, function (f) { if (st.ownFiles.length < 12) st.ownFiles.push({ f: f, u: URL.createObjectURL(f) }); });
    this.value = ""; ownList();
  });
  function ownList() {
    $("spOwnList").innerHTML = st.ownFiles.map(function (o, i) {
      return '<li data-i="' + i + '"><img src="' + o.u + '" alt=""/><span>' + (i + 1) + '</span><button type="button" data-mv="-1" aria-label="Move earlier"' + (i ? "" : " disabled") + '>‹</button><button type="button" data-mv="1" aria-label="Move later"' + (i < st.ownFiles.length - 1 ? "" : " disabled") + '>›</button><button type="button" data-rm="1" aria-label="Remove">×</button></li>';
    }).join("");
  }
  $("spOwnList").addEventListener("click", function (e) {
    var li = e.target.closest("[data-i]"); if (!li) return; var i = +li.getAttribute("data-i");
    if (e.target.closest("[data-rm]")) { URL.revokeObjectURL(st.ownFiles[i].u); st.ownFiles.splice(i, 1); }
    var mv = e.target.closest("[data-mv]");
    if (mv) { var j = i + +mv.getAttribute("data-mv"); if (j >= 0 && j < st.ownFiles.length) { var t = st.ownFiles[i]; st.ownFiles[i] = st.ownFiles[j]; st.ownFiles[j] = t; } }
    ownList();
  });

  (async function init() {
    var c = cfg(); st.views = c.defaultViews === 4 ? 4 : 8;
    var q = new URLSearchParams(location.search);
    paint();
    try { var r = await fetch(RENDER() + "/spin-info", { cache: "no-store" }); if (r.ok) st.info = await r.json(); } catch (e) {}
    var s = await client.auth.getSession();
    st.user = s.data.session ? s.data.session.user : null;
    if (q.get("image")) setPick(q.get("image"));
    gate();
    client.auth.onAuthStateChange(function (_e, sess) { var had = !!st.user; st.user = sess ? sess.user : null; if (had !== !!st.user) gate(); });
    if (q.get("set")) { await loadLibrary(); openSet(q.get("set")); }
  })();
  function gate() {
    var g = $("spGate"), f = $("spForm");
    if (!st.user) { g.innerHTML = '360 Studio runs on the hub’s GPU. <a href="auth.html">Log in</a> to use it.'; g.style.display = ""; f.style.display = "none"; return; }
    g.style.display = "none"; f.style.display = ""; loadLibrary();
  }

  // ---------- make a 360 set
  $("spGo").addEventListener("click", function () { submit({}); });
  async function submit(redo) {
    var fd = new FormData();
    if (redo.from) {
      fd.append("redo_from", redo.from); fd.append("redo_angle", String(redo.angle));
      fd.append("title", redo.title || "");
    } else if (st.src === "ai") {
      var f = $("spFile").files[0];
      if (!f && !st.pick) { status("Add a picture of the object, or pick one of your images.", "error"); return; }
      if (f) { if (f.size > MAX_UP) { status("Pictures must be under 40 MB.", "error"); return; } fd.append("image", f); }
      else fd.append("source_job", st.pick);
      fd.append("views", String(st.views));
      fd.append("title", ($("spTitle").value || "").trim());
    } else {
      if (st.ownFiles.length < 2) { status("Add at least 2 photos taken around the object.", "error"); return; }
      for (var i = 0; i < st.ownFiles.length; i++) { if (st.ownFiles[i].f.size > MAX_UP) { status("Each photo must be under 40 MB.", "error"); return; } fd.append("photos", st.ownFiles[i].f); }
      fd.append("title", ($("spTitle").value || "").trim());
    }
    var tok = await token();
    if (!tok) { status("Your session expired. Please log in again.", "error"); return; }
    $("spGo").disabled = true; status("Sending to the GPU…"); progress(2, "Starting…");
    try {
      var r = await fetch(RENDER() + "/spin-jobs", { method: "POST", headers: { Authorization: "Bearer " + tok }, body: fd });
      var d = await r.json().catch(function () { return {}; });
      if (r.status === 423 || r.status === 403) throw new Error(d.detail || "The GPU is reserved for another user right now.");
      if (!r.ok) throw new Error(d.detail || ("HTTP " + r.status));
      st.job = d.job_id; st.fails = 0;
      $("spCancel").style.display = ""; $("spCancel").disabled = false;
      status(redo.from ? "Making that view again…" : "Turning the camera around your object…");
      poll();
    } catch (e) {
      status(e.message && e.message.indexOf("HTTP") !== 0 ? e.message : "Couldn’t reach the render PC. It may be offline.", "error");
      done();
    }
  }
  function poll() {
    clearTimeout(st.timer);
    st.timer = setTimeout(async function () {
      try {
        var r = await fetch(RENDER() + "/jobs/" + st.job, { headers: { Authorization: "Bearer " + (await token()) } });
        if (r.status === 404) { status("The render PC restarted and this job was lost. Please try again.", "error"); return done(); }
        var j = await r.json(); st.fails = 0;
        if (j.status === "done") { status("Done. Drag the object to turn it.", "success"); var id = st.job; done(); await loadLibrary(id); openSet(id); return; }
        if (j.status === "error") { status("It failed: " + (j.error || "unknown error"), "error"); return done(); }
        if (j.status === "cancelled") { status("Cancelled.", "error"); return done(); }
        progress(Math.max(3, Math.min(99, j.progress || 0)), (j.stage || "Working…") + (j.elapsed_seconds ? " · " + fmt(j.elapsed_seconds) : ""));
        poll();
      } catch (e) { if (++st.fails > 6) { status("Lost connection. Your set may still finish; it will show under Your 360 sets.", "error"); return done(); } poll(); }
    }, 3000);
  }
  function progress(p, l) { $("spProgress").style.display = ""; $("spProgressFill").style.width = p + "%"; $("spProgressLabel").textContent = l || ""; }
  function done() { clearTimeout(st.timer); $("spGo").disabled = false; $("spCancel").style.display = "none"; $("spProgress").style.display = "none"; }
  $("spCancel").addEventListener("click", async function () {
    if (!st.job) return; this.disabled = true;
    try { await fetch(RENDER() + "/jobs/" + st.job + "/cancel", { method: "POST", headers: { Authorization: "Bearer " + (await token()) } }); status("Cancelling…"); } catch (e) {}
  });

  // ---------- spin viewer
  function frameUrls(x) { var m = x.meta || {}, n = m.views || (m.labels || []).length || 0, out = []; for (var i = 0; i < n; i++) out.push(absUrl("/files/" + x.id + "/view_" + i + ".png")); return out; }
  function showFrame(i) {
    if (!st.frames.length) return;
    st.frame = ((i % st.frames.length) + st.frames.length) % st.frames.length;
    $("spSpinImg").src = st.frames[st.frame];
    var m = (st.open && st.open.meta) || {};
    $("spAngle").textContent = (m.labels || [])[st.frame] || "";
    Array.prototype.forEach.call(document.querySelectorAll("#spGrid .sp-cell"), function (c, k) { c.classList.toggle("is-on", k === st.frame); });
  }
  function setPlay(on) {
    st.play = on; clearInterval(st.spinTimer);
    $("spPlay").textContent = on ? "❚❚" : "▶"; $("spPlay").setAttribute("aria-label", on ? "Pause spin" : "Play spin");
    if (on) st.spinTimer = setInterval(function () { showFrame(st.frame + 1); }, st.frames.length > 4 ? 380 : 700);
  }
  $("spPlay").addEventListener("click", function (e) { e.stopPropagation(); setPlay(!st.play); });
  (function drag() {
    var el = $("spSpin"), x0 = null, f0 = 0;
    el.addEventListener("pointerdown", function (e) { if (e.target.closest("button")) return; x0 = e.clientX; f0 = st.frame; setPlay(false); el.setPointerCapture(e.pointerId); });
    el.addEventListener("pointermove", function (e) { if (x0 === null || !st.frames.length) return; var step = el.clientWidth / (st.frames.length * 1.2); showFrame(f0 + Math.round((x0 - e.clientX) / step)); });
    el.addEventListener("pointerup", function () { x0 = null; });
    el.addEventListener("pointercancel", function () { x0 = null; });
    el.addEventListener("keydown", function (e) { if (e.key === "ArrowRight") { setPlay(false); showFrame(st.frame + 1); } if (e.key === "ArrowLeft") { setPlay(false); showFrame(st.frame - 1); } });
  })();

  function openSet(id) {
    var x = st.rows.filter(function (r) { return r.id === id; })[0]; if (!x) return;
    var m = x.meta || {};
    st.open = x; st.frames = frameUrls(x);
    st.frames.forEach(function (u) { var im = new Image(); im.src = u; });
    $("spEmpty").hidden = true; $("spViewer").hidden = false;
    $("spName").textContent = m.title || "360 set";
    $("spStats").textContent = st.frames.length + " views" + (m.own ? " · from your photos" : " · AI views") + " · " + new Date(x.created_at).toLocaleDateString();
    var a = [];
    if (m.zip) a.push('<a class="btn btn-primary btn-sm" href="' + esc(absUrl(m.zip)) + '" download="' + esc(m.zip_name || "360-views.zip") + '">Download all (ZIP)</a>');
    if (m.spin) a.push('<a class="btn btn-secondary btn-sm" href="' + esc(absUrl(m.spin)) + '" download>Spin video (MP4)</a>');
    if (m.sheet) a.push('<a class="btn btn-secondary btn-sm" href="' + esc(absUrl(m.sheet)) + '" target="_blank" rel="noopener">All views sheet</a>');
    a.push('<button type="button" class="btn btn-secondary btn-sm" data-del="1">Delete</button>');
    $("spActs").innerHTML = a.join(""); $("spActs").setAttribute("data-id", x.id);
    $("spGrid").innerHTML = st.frames.map(function (u, i) {
      return '<figure class="sp-cell" data-i="' + i + '"><button type="button" class="sp-cell-img" data-show="' + i + '" aria-label="Show ' + esc((m.labels || [])[i] || "view") + '"><img loading="lazy" src="' + esc(u) + '" alt=""/></button>' +
        '<figcaption><span>' + esc((m.labels || [])[i] || "") + '</span>' +
        '<a href="' + esc(absUrl((m.cuts || [])[i] || u)) + '" download title="Transparent PNG">PNG</a>' +
        (!m.own && i > 0 ? '<button type="button" data-redo="' + i + '">Redo</button>' : "") + "</figcaption></figure>";
    }).join("");
    $("spRedoHint").hidden = !!m.own;
    // 3D options
    var c = cfg();
    $("sp3d").hidden = c.mv3d === false && !st.info.trellis_ready;
    $("spMv").hidden = c.mv3d === false;
    $("spMv").classList.toggle("is-off", st.info.mv3d_ready === false);
    $("spMvOpts").hidden = true; $("spMvResult").hidden = true;
    $("spTex").href = "3d-studio.html?image=" + encodeURIComponent(absUrl("/files/" + x.id + "/view_0.png"));
    showFrame(0); setPlay(true);
    Array.prototype.forEach.call(document.querySelectorAll("#spList .t3-card"), function (cd) { cd.classList.toggle("is-open", cd.getAttribute("data-id") === id); });
    $("spViewer").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  $("spGrid").addEventListener("click", function (e) {
    var s = e.target.closest("[data-show]"); if (s) { setPlay(false); showFrame(+s.getAttribute("data-show")); return; }
    var r = e.target.closest("[data-redo]");
    if (r && st.open) {
      var i = +r.getAttribute("data-redo"), m = st.open.meta || {};
      var angle = (m.angles || [])[i];
      if (angle == null) return;
      if (!window.confirm("Make the “" + ((m.labels || [])[i] || "this") + "” view again? You'll get a new set with every other view kept.")) return;
      submit({ from: st.open.id, angle: angle, title: m.title || "" });
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  });

  // ---------- multi-view 3D
  $("spMv").addEventListener("click", function () {
    if (st.info.mv3d_ready === false) { $("spMvResult").hidden = false; $("spMvResult").innerHTML = "<p>The multi-view 3D model is still being installed on the render PC. Try again soon.</p>"; return; }
    $("spMvOpts").hidden = !$("spMvOpts").hidden;
  });
  $("spMvGo").addEventListener("click", async function () {
    if (!st.open) return;
    var m = st.open.meta || {};
    var fd = new FormData();
    fd.append("spin_job", st.open.id); fd.append("quality", st.q);
    fd.append("stl", $("spStl").checked ? "1" : "0"); fd.append("print_mm", $("spMm").value);
    fd.append("title", (m.title || "360 set") + " (multi-view)");
    var box = $("spMvResult"); box.hidden = false; box.innerHTML = '<div class="blend-progress"><div class="blend-progress-bar"><span id="spMvFill" style="width:3%"></span></div><p class="blend-progress-label" id="spMvLabel">Sending to the GPU…</p></div>';
    this.disabled = true;
    try {
      var r = await fetch(RENDER() + "/spin-3d", { method: "POST", headers: { Authorization: "Bearer " + (await token()) }, body: fd });
      var d = await r.json().catch(function () { return {}; });
      if (!r.ok) throw new Error(d.detail || ("HTTP " + r.status));
      st.mvJob = d.job_id; pollMv(0);
    } catch (e) { box.innerHTML = "<p>Couldn’t start it: " + esc(e.message) + "</p>"; this.disabled = false; }
  });
  function pollMv(fails) {
    clearTimeout(st.mvTimer);
    st.mvTimer = setTimeout(async function () {
      var box = $("spMvResult");
      try {
        var r = await fetch(RENDER() + "/jobs/" + st.mvJob, { headers: { Authorization: "Bearer " + (await token()) } });
        if (r.status === 404) { box.innerHTML = "<p>The render PC restarted and this job was lost. Please try again.</p>"; $("spMvGo").disabled = false; return; }
        var j = await r.json();
        if (j.status === "done") {
          var m = j.meta || {};
          box.innerHTML = '<model-viewer src="' + esc(absUrl(m.glb)) + '" camera-controls auto-rotate shadow-intensity="0.8" exposure="1" environment-image="neutral" interaction-prompt="none" touch-action="pan-y" alt="3D shape"></model-viewer>' +
            '<div class="as-acts"><a class="btn btn-primary btn-sm" href="' + esc(absUrl(m.glb)) + '" download>GLB</a>' +
            (m.stl ? '<a class="btn btn-secondary btn-sm" href="' + esc(absUrl(m.stl)) + '" download>STL</a>' : "") +
            '<a class="btn btn-secondary btn-sm" href="3d-studio.html">Open in 3D Studio</a></div>' +
            '<small class="as-hint">Also saved under Your 3D models in 3D Studio.</small>';
          $("spMvGo").disabled = false; return;
        }
        if (j.status === "error" || j.status === "cancelled") { box.innerHTML = "<p>It failed: " + esc(j.error || j.status) + "</p>"; $("spMvGo").disabled = false; return; }
        var f = $("spMvFill"), l = $("spMvLabel");
        if (f) f.style.width = Math.max(3, Math.min(99, j.progress || 0)) + "%";
        if (l) l.textContent = (j.stage || "Working…") + (j.elapsed_seconds ? " · " + fmt(j.elapsed_seconds) : "");
        pollMv(0);
      } catch (e) { if (fails > 6) { box.innerHTML = "<p>Lost connection. The model may still finish; it will show in 3D Studio.</p>"; $("spMvGo").disabled = false; return; } pollMv(fails + 1); }
    }, 3000);
  }

  // ---------- library
  async function loadLibrary(highlight) {
    if (!st.user) return;
    var r = await client.from("render_jobs").select("id,prompt,status,result_url,created_at,meta").eq("user_id", st.user.id)
      .eq("render_type", "spin_360").eq("status", "done").order("created_at", { ascending: false }).limit(60);
    st.rows = r.data || [];
    var list = $("spList");
    if (!st.rows.length) { list.innerHTML = '<p class="as-empty">Nothing here yet. Your 360 sets will show up here.</p>'; return; }
    list.innerHTML = st.rows.map(function (x) {
      var m = x.meta || {}, title = m.title || "360 set";
      var vid = m.spin ? '<video muted loop playsinline preload="none" src="' + esc(absUrl(m.spin)) + '"></video>' : "";
      return '<article class="t3-card' + (x.id === highlight ? " is-new" : "") + '" data-id="' + esc(x.id) + '">' +
        '<button type="button" class="t3-card-media sp-card-media" data-open="1" aria-label="Open ' + esc(title) + '"><img loading="lazy" alt="" src="' + esc(absUrl("/files/" + x.id + "/view_0.png")) + '"/>' + vid + "</button>" +
        '<div class="t3-card-body"><div><strong>' + esc(title) + "</strong><br/><small>" + (m.views || "") + " views · " + new Date(x.created_at).toLocaleDateString() + "</small></div></div></article>";
    }).join("");
    Array.prototype.forEach.call(list.querySelectorAll(".t3-card-media"), function (b) {
      var v = b.querySelector("video"); if (!v) return;
      b.addEventListener("mouseenter", function () { v.play().catch(function () {}); });
      b.addEventListener("mouseleave", function () { v.pause(); });
    });
  }
  $("spList").addEventListener("click", function (e) { var c = e.target.closest(".t3-card"); if (c) openSet(c.getAttribute("data-id")); });
  $("spActs").addEventListener("click", async function (e) {
    var id = this.getAttribute("data-id");
    if (!id || !e.target.closest("[data-del]")) return;
    if (!window.confirm("Delete this 360 set permanently?")) return;
    try { await fetch(RENDER() + "/jobs/" + id + "?table=render_jobs", { method: "DELETE", headers: { Authorization: "Bearer " + (await token()) } }); } catch (e2) {}
    await client.from("render_jobs").delete().eq("id", id);
    $("spViewer").hidden = true; $("spEmpty").hidden = false; setPlay(false); st.open = null;
    loadLibrary();
  });
})();

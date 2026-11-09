// AI Resource Hub — 3D Studio: picture or description -> textured 3D model (TRELLIS.2) on the hub's GPU.
// Jobs go to the render server (/3d-jobs) and finished models are listed from render_jobs (render_type model_3d).
(function () {
  var RENDER = function () { return window.AIRH_GPU ? window.AIRH_GPU.base() : "https://render.airesourcehub.vip"; };
  if (!window.supabase || typeof SUPABASE_URL === "undefined") return;
  var $ = function (id) { return document.getElementById(id); };
  if (!$("t3Form")) return;
  var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  var MAX_UP = 40 * 1024 * 1024;
  var st = { src: "image", quality: "standard", user: null, job: null, timer: null, fails: 0, pick: null, rows: [], ready: true };

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function absUrl(u) { if (!u) return u; return /^https?:\/\//i.test(u) ? u : RENDER() + (u.charAt(0) === "/" ? "" : "/") + u; }
  function status(t, k) { var s = $("t3Status"); s.textContent = t || ""; s.className = "form-status" + (k ? " " + k : ""); }
  function fmt(s) { s = Math.max(0, Math.round(s || 0)); return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2); }
  function num(n) { return n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? Math.round(n / 1e3) + "K" : String(n); }
  async function token() {
    var r = await client.auth.getSession(); var s = r.data.session;
    if (s && s.expires_at && s.expires_at - Date.now() / 1000 < 120) { try { var rr = await client.auth.refreshSession(); if (rr.data && rr.data.session) s = rr.data.session; } catch (e) {} }
    return s ? s.access_token : null;
  }

  // ---------- form
  function paint() {
    Array.prototype.forEach.call(document.querySelectorAll(".as-tabs [data-src]"), function (b) {
      var on = b.getAttribute("data-src") === st.src; b.classList.toggle("is-on", on); b.setAttribute("aria-selected", on ? "true" : "false"); });
    Array.prototype.forEach.call(document.querySelectorAll("#t3Form [data-for]"), function (el) { el.style.display = el.getAttribute("data-for") === st.src ? "" : "none"; });
    Array.prototype.forEach.call(document.querySelectorAll("#t3Quality [data-q]"), function (b) {
      var on = b.getAttribute("data-q") === st.quality; b.classList.toggle("is-on", on); b.setAttribute("aria-checked", on ? "true" : "false"); });
    $("t3MmField").hidden = !$("t3Stl").checked;
    $("t3MmOut").textContent = $("t3Mm").value + " mm";
  }
  document.querySelector(".as-tabs").addEventListener("click", function (e) { var b = e.target.closest("[data-src]"); if (!b) return; st.src = b.getAttribute("data-src"); paint(); });
  $("t3Quality").addEventListener("click", function (e) { var b = e.target.closest("[data-q]"); if (!b) return; st.quality = b.getAttribute("data-q"); paint(); });
  $("t3Stl").addEventListener("change", paint);
  $("t3Mm").addEventListener("input", paint);
  $("t3File").addEventListener("change", function () { if (this.files[0]) setPick(null); });
  $("t3Unpick").addEventListener("click", function () { setPick(null); });
  function setPick(p) {
    st.pick = p;
    $("t3Picked").hidden = !p;
    if (p) { $("t3PickedImg").src = absUrl(p); $("t3File").value = ""; var f = document.querySelector('.vs-drop[data-kind="image"] .vs-drop-file'); if (f) f.textContent = ""; }
    Array.prototype.forEach.call(document.querySelectorAll("#t3MineGrid button"), function (b) { b.classList.toggle("is-on", b.getAttribute("data-u") === p); });
  }
  $("t3Mine").addEventListener("toggle", async function () {
    if (!this.open || this._loaded || !st.user) return; this._loaded = true;
    var r = await client.from("image_jobs").select("id,urls").eq("user_id", st.user.id).eq("status", "done").order("created_at", { ascending: false }).limit(24);
    var urls = []; (r.data || []).forEach(function (x) { (x.urls || []).forEach(function (u) { if (urls.length < 48) urls.push(u); }); });
    $("t3MineGrid").innerHTML = urls.length ? urls.map(function (u) { return '<button type="button" data-u="' + esc(u) + '" aria-label="Use this image"><img loading="lazy" src="' + esc(absUrl(u)) + '" alt=""/></button>'; }).join("")
      : '<p class="as-hint">No images yet. Make one in <a href="image-studio.html">Image Studio</a>.</p>';
  });
  $("t3MineGrid").addEventListener("click", function (e) { var b = e.target.closest("[data-u]"); if (b) setPick(b.getAttribute("data-u")); });

  // ---------- gate
  (async function init() {
    var q = new URLSearchParams(location.search);
    if (q.get("from") === "text") st.src = "text";
    if (q.get("prompt")) { st.src = "text"; $("t3Prompt").value = q.get("prompt"); }
    paint();
    try { var r = await fetch(RENDER() + "/3d-models", { cache: "no-store" }); if (r.ok) { var d = await r.json(); st.ready = d.ready !== false; } } catch (e) {}
    var s = await client.auth.getSession();
    st.user = s.data.session ? s.data.session.user : null;
    if (q.get("image")) setPick(q.get("image"));
    gate();
    client.auth.onAuthStateChange(function (_e, sess) { st.user = sess ? sess.user : null; gate(); });
  })();
  function gate() {
    var g = $("t3Gate"), f = $("t3Form");
    if (!st.user) { g.innerHTML = '3D Studio runs on the hub’s GPU. <a href="auth.html">Log in</a> to use it.'; g.style.display = ""; f.style.display = "none"; return; }
    g.style.display = "none"; f.style.display = ""; loadLibrary();
  }

  // ---------- generate
  $("t3Go").addEventListener("click", async function () {
    if (!st.ready) { status("3D Studio is still being installed on the render PC. Try again soon.", "error"); return; }
    var fd = new FormData();
    if (st.src === "image") {
      var f = $("t3File").files[0];
      if (!f && !st.pick) { status("Add a picture of the object, or pick one of your images.", "error"); return; }
      if (f) { if (f.size > MAX_UP) { status("Pictures must be under 40 MB.", "error"); return; } fd.append("image", f); }
      else fd.append("source_job", st.pick);
    } else {
      var p = ($("t3Prompt").value || "").trim();
      if (!p) { status("Describe the object you want.", "error"); $("t3Prompt").focus(); return; }
      fd.append("prompt", p);
    }
    fd.append("quality", st.quality);
    fd.append("texture", $("t3Texture").checked ? "1" : "0");
    fd.append("stl", $("t3Stl").checked ? "1" : "0");
    fd.append("print_mm", $("t3Mm").value);
    fd.append("title", ($("t3Title").value || "").trim());
    var tok = await token();
    if (!tok) { status("Your session expired. Please log in again.", "error"); return; }
    $("t3Go").disabled = true; status("Sending to the GPU…"); progress(2, "Starting…");
    try {
      var r = await fetch(RENDER() + "/3d-jobs", { method: "POST", headers: { Authorization: "Bearer " + tok }, body: fd });
      var d = await r.json().catch(function () { return {}; });
      if (r.status === 423 || r.status === 403) throw new Error(d.detail || "The GPU is reserved for another user right now.");
      if (!r.ok) throw new Error(d.detail || ("HTTP " + r.status));
      st.job = d.job_id; st.fails = 0;
      $("t3Cancel").style.display = ""; $("t3Cancel").disabled = false;
      status(st.src === "text" ? "Drawing the object, then building it in 3D…" : "Building your 3D model…");
      poll();
    } catch (e) {
      status(e.message && e.message.indexOf("HTTP") !== 0 ? e.message : "Couldn’t reach the render PC. It may be offline.", "error");
      done();
    }
  });
  function poll() {
    clearTimeout(st.timer);
    st.timer = setTimeout(async function () {
      try {
        var r = await fetch(RENDER() + "/jobs/" + st.job, { headers: { Authorization: "Bearer " + (await token()) } });
        if (r.status === 404) { status("The render PC restarted and this job was lost. Please try again.", "error"); return done(); }
        var j = await r.json(); st.fails = 0;
        if (j.status === "done") { status("Done. Drag the model to turn it.", "success"); done(); await loadLibrary(st.job); open(st.job); return; }
        if (j.status === "error") { status("It failed: " + (j.error || "unknown error"), "error"); return done(); }
        if (j.status === "cancelled") { status("Cancelled.", "error"); return done(); }
        progress(Math.max(3, Math.min(99, j.progress || 0)), (j.stage || "Working…") + (j.elapsed_seconds ? " · " + fmt(j.elapsed_seconds) : ""));
        poll();
      } catch (e) { if (++st.fails > 6) { status("Lost connection. Your model may still finish; it will show under Your 3D models.", "error"); return done(); } poll(); }
    }, 3000);
  }
  function progress(p, l) { $("t3Progress").style.display = ""; $("t3ProgressFill").style.width = p + "%"; $("t3ProgressLabel").textContent = l || ""; }
  function done() { clearTimeout(st.timer); $("t3Go").disabled = false; $("t3Cancel").style.display = "none"; $("t3Progress").style.display = "none"; }
  $("t3Cancel").addEventListener("click", async function () {
    if (!st.job) return; this.disabled = true;
    try { await fetch(RENDER() + "/jobs/" + st.job + "/cancel", { method: "POST", headers: { Authorization: "Bearer " + (await token()) } }); status("Cancelling…"); } catch (e) {}
  });

  // ---------- viewer + library
  function stats(m) {
    var s = m.stats || {}, out = [];
    if (s.triangles) out.push(num(s.triangles) + " triangles");
    if (m.quality) out.push(m.quality.charAt(0).toUpperCase() + m.quality.slice(1));
    if (m.texture === false) out.push("no textures");
    if (s.stl_size_mm) out.push("STL " + s.stl_size_mm.map(function (x) { return Math.round(x); }).join(" × ") + " mm");
    return out.join(" · ");
  }
  function acts(x, compact) {
    var m = x.meta || {}, a = [];
    a.push('<a class="btn btn-primary btn-sm" href="' + esc(absUrl(m.glb || x.result_url)) + '" download>GLB</a>');
    if (m.stl) a.push('<a class="btn btn-secondary btn-sm" href="' + esc(absUrl(m.stl)) + '" download>STL</a>');
    if (!compact && m.turntable) a.push('<a class="btn btn-secondary btn-sm" href="' + esc(absUrl(m.turntable)) + '" download>Turntable MP4</a>');
    a.push('<button type="button" class="btn btn-secondary btn-sm t3-pub' + (x.is_public ? " is-on" : "") + '" data-pub="' + (x.is_public ? 1 : 0) + '" title="' + (x.is_public ? "Shared on the home page. Click to make private" : "Private. Click to share on the home page") + '">' + (x.is_public ? "Public" : "Private") + "</button>");
    if (!compact && x.prompt) a.push('<button type="button" class="btn btn-secondary btn-sm" data-reuse="1">Use again</button>');
    a.push('<button type="button" class="btn btn-secondary btn-sm" data-del="1">Delete</button>');
    return a.join("");
  }
  function open(id) {
    var x = st.rows.filter(function (r) { return r.id === id; })[0]; if (!x) return;
    var m = x.meta || {};
    $("t3Viewer").hidden = false;
    $("t3Model").setAttribute("poster", absUrl("/files/" + x.id + "/view_0.png"));
    $("t3Model").setAttribute("src", absUrl(m.glb || x.result_url));
    $("t3VName").textContent = m.title || (x.prompt || "").slice(0, 80) || "3D model";
    $("t3VStats").textContent = stats(m);
    $("t3VActs").innerHTML = acts(x, false); $("t3VActs").setAttribute("data-id", x.id);
    Array.prototype.forEach.call(document.querySelectorAll(".t3-card"), function (c) { c.classList.toggle("is-open", c.getAttribute("data-id") === id); });
    $("t3Viewer").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  async function loadLibrary(highlight) {
    if (!st.user) return;
    var r = await client.from("render_jobs").select("id,prompt,status,result_url,created_at,meta,is_public").eq("user_id", st.user.id)
      .eq("render_type", "model_3d").eq("status", "done").order("created_at", { ascending: false }).limit(60);
    st.rows = r.data || [];
    var list = $("t3List");
    if (!st.rows.length) { list.innerHTML = '<p class="as-empty">Nothing here yet. Your 3D models will show up here.</p>'; return; }
    list.innerHTML = st.rows.map(function (x) {
      var m = x.meta || {}, title = m.title || (x.prompt || "").slice(0, 60) || "3D model";
      var vid = m.turntable ? '<video muted loop playsinline preload="none" src="' + esc(absUrl(m.turntable)) + '"></video>' : "";
      return '<article class="t3-card' + (x.id === highlight ? " is-new" : "") + '" data-id="' + esc(x.id) + '">' +
        '<button type="button" class="t3-card-media" data-open="1" aria-label="Open ' + esc(title) + ' in the viewer"><img loading="lazy" alt="" src="' + esc(absUrl("/files/" + x.id + "/view_0.png")) + '"/>' + vid + "</button>" +
        '<div class="t3-card-body"><div><strong>' + esc(title) + "</strong><br/><small>" + esc(stats(m)) + " · " + new Date(x.created_at).toLocaleDateString() + "</small></div>" +
        '<div class="as-acts">' + acts(x, true) + "</div></div></article>";
    }).join("");
    Array.prototype.forEach.call(list.querySelectorAll(".t3-card-media"), function (b) {
      var v = b.querySelector("video"); if (!v) return;
      b.addEventListener("mouseenter", function () { v.play().catch(function () {}); });
      b.addEventListener("mouseleave", function () { v.pause(); });
    });
  }
  async function act(e, id) {
    var x = st.rows.filter(function (r) { return r.id === id; })[0]; if (!x) return;
    if (e.target.closest("[data-open]")) return open(id);
    var pb = e.target.closest(".t3-pub");
    if (pb) {
      var want = pb.getAttribute("data-pub") !== "1";
      var r = await client.rpc("set_public", { p_kind: "video", p_id: id, p_public: want });
      if (r.error) { window.alert("Couldn’t change sharing: " + r.error.message); return; }
      x.is_public = want; await loadLibrary(); if (!$("t3Viewer").hidden && $("t3VActs").getAttribute("data-id") === id) open(id);
      return;
    }
    if (e.target.closest("[data-reuse]")) { st.src = "text"; paint(); $("t3Prompt").value = x.prompt || ""; $("t3Prompt").focus(); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    if (e.target.closest("[data-del]")) {
      if (!window.confirm("Delete this 3D model permanently?")) return;
      try { await fetch(RENDER() + "/jobs/" + id + "?table=render_jobs", { method: "DELETE", headers: { Authorization: "Bearer " + (await token()) } }); } catch (e2) {}
      await client.from("render_jobs").delete().eq("id", id);
      if ($("t3VActs").getAttribute("data-id") === id) $("t3Viewer").hidden = true;
      loadLibrary();
    }
  }
  $("t3List").addEventListener("click", function (e) { var c = e.target.closest(".t3-card"); if (c) act(e, c.getAttribute("data-id")); });
  $("t3VActs").addEventListener("click", function (e) { var id = this.getAttribute("data-id"); if (id) act(e, id); });
})();

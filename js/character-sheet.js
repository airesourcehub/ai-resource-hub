// AI Resource Hub — Character Sheet: 1-4 photos of one character -> front / three-quarter / side / back on white.
(function () {
  var RENDER = function () { return window.AIRH_GPU ? window.AIRH_GPU.base() : "https://render.airesourcehub.vip"; };
  if (!window.supabase || typeof SUPABASE_URL === "undefined") return;
  var $ = function (id) { return document.getElementById(id); };
  if (!$("csForm")) return;
  var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  var st = { user: null, files: [], job: null, timer: null, fails: 0 };
  var VIEWS = ["Front", "Three-quarter", "Side", "Back"];

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function abs(u) { return !u ? u : /^https?:\/\//i.test(u) ? u : RENDER() + (u.charAt(0) === "/" ? "" : "/") + u; }
  function status(t, k) { $("csStatus").textContent = t || ""; $("csStatus").className = "form-status" + (k ? " " + k : ""); }
  async function token() {
    var r = await client.auth.getSession(); var s = r.data.session;
    if (s && s.expires_at && s.expires_at - Date.now() / 1000 < 120) { try { var rr = await client.auth.refreshSession(); if (rr.data && rr.data.session) s = rr.data.session; } catch (e) {} }
    return s ? s.access_token : null;
  }

  // ---- photos (keep order; first = main full-body reference)
  function addFiles(list) {
    Array.prototype.forEach.call(list || [], function (f) { if (f.type.indexOf("image/") === 0 && st.files.length < 4) st.files.push(f); });
    paintThumbs();
  }
  function paintThumbs() {
    var h = $("csThumbs");
    h.innerHTML = st.files.map(function (f, i) {
      return '<figure class="cs-thumb"><img alt="" src="' + URL.createObjectURL(f) + '" /><figcaption>' + (i === 0 ? "Main" : "Extra") + '</figcaption>' +
        '<button type="button" data-rm="' + i + '" aria-label="Remove photo ' + (i + 1) + '">&times;</button>' +
        (i > 0 ? '<button type="button" class="cs-main" data-main="' + i + '" title="Use as the main photo">Make main</button>' : "") + "</figure>";
    }).join("");
    $("csFiles").value = "";
  }
  $("csFiles").addEventListener("change", function () { addFiles(this.files); });
  $("csThumbs").addEventListener("click", function (e) {
    var rm = e.target.closest("[data-rm]"), mk = e.target.closest("[data-main]");
    if (rm) { st.files.splice(+rm.getAttribute("data-rm"), 1); paintThumbs(); }
    if (mk) { var i = +mk.getAttribute("data-main"); st.files.unshift(st.files.splice(i, 1)[0]); paintThumbs(); }
  });
  var drop = document.querySelector(".cs-drop");
  ["dragover", "drop"].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); if (ev === "drop") addFiles(e.dataTransfer.files); }); });

  // ---- gate
  (async function () {
    var s = await client.auth.getSession(); st.user = s.data.session ? s.data.session.user : null; gate();
    client.auth.onAuthStateChange(function (_e, sess) { st.user = sess ? sess.user : null; gate(); });
  })();
  function gate() {
    if (!st.user) { $("csGate").innerHTML = 'Character sheets render on the hub’s GPU. <a href="auth.html">Log in</a> to make one.'; $("csGate").style.display = ""; $("csForm").style.display = "none"; return; }
    $("csGate").style.display = "none"; $("csForm").style.display = ""; loadList();
  }

  // ---- generate
  $("csGo").addEventListener("click", async function () {
    if (!st.files.length) { status("Add at least one photo of your character.", "error"); return; }
    var tok = await token(); if (!tok) { status("Your session expired. Please log in again.", "error"); return; }
    var fd = new FormData();
    st.files.forEach(function (f) { fd.append("images", f); });
    fd.append("notes", ($("csNotes").value || "").trim()); fd.append("upscale", $("csUp").checked ? "1" : "0");
    $("csGo").disabled = true; status("Uploading your photos…"); progress(2, "Uploading…"); $("csResult").hidden = true;
    try {
      var r = await fetch(RENDER() + "/sheet-jobs", { method: "POST", headers: { Authorization: "Bearer " + tok }, body: fd });
      var d = await r.json().catch(function () { return {}; });
      if (r.status === 423 || r.status === 403) throw new Error("The GPU is reserved for another user right now.");
      if (!r.ok) throw new Error(d.detail || ("HTTP " + r.status));
      st.job = d.job_id; st.fails = 0; $("csCancel").style.display = ""; $("csCancel").disabled = false;
      status("Making your sheet. Four views take about 2–6 minutes."); poll();
    } catch (e) { status(e.message.indexOf("HTTP") === 0 ? "Couldn’t reach the render PC. It may be offline." : e.message, "error"); done(); }
  });
  function poll() {
    clearTimeout(st.timer);
    st.timer = setTimeout(async function () {
      try {
        var r = await fetch(RENDER() + "/jobs/" + st.job, { headers: { Authorization: "Bearer " + (await token()) } });
        if (r.status === 404) { status("The render PC restarted and this job was lost. Please try again.", "error"); return done(); }
        var j = await r.json(); st.fails = 0;
        if (j.status === "done") { status("Your character sheet is ready.", "success"); done(); st.shown = st.job; show(j.urls || [j.result_url]); loadList(); return; }
        if (j.status === "error") { status("It failed: " + (j.error || "unknown error"), "error"); return done(); }
        if (j.status === "cancelled") { status("Cancelled.", "error"); return done(); }
        progress(Math.max(3, Math.min(99, j.progress || 0)), j.stage || "Working…"); poll();
      } catch (e) { if (++st.fails > 6) { status("Lost connection. Your sheet may still finish; it will show in My Images.", "error"); return done(); } poll(); }
    }, 3000);
  }
  function progress(p, l) { $("csProgress").style.display = ""; $("csProgressFill").style.width = p + "%"; $("csProgressLabel").textContent = l || ""; }
  function done() { clearTimeout(st.timer); $("csGo").disabled = false; $("csCancel").style.display = "none"; $("csProgress").style.display = "none"; }
  $("csCancel").addEventListener("click", async function () {
    this.disabled = true;
    try { await fetch(RENDER() + "/jobs/" + st.job + "/cancel", { method: "POST", headers: { Authorization: "Bearer " + (await token()) } }); status("Cancelling…"); } catch (e) {}
  });
  function show(urls) {
    var u = urls.map(abs);
    $("csSheet").src = u[0]; $("csDl").href = u[0];
    $("csViews").innerHTML = u.slice(1).map(function (x, i) { return '<a class="cs-view" href="' + esc(x) + '" download title="Download ' + VIEWS[i] + ' view"><img alt="" src="' + esc(x) + '" /><span>' + VIEWS[i] + "</span></a>"; }).join("");
    $("csResult").hidden = false;
  }

  // ---- history
  async function loadList() {
    if (!st.user) return;
    var r = await client.from("image_jobs").select("id, urls, prompt, created_at").eq("user_id", st.user.id).eq("model", "character_sheet").eq("status", "done").order("created_at", { ascending: false }).limit(24);
    var rows = r.data || [];
    $("csList").innerHTML = rows.length ? rows.map(function (x) {
      return '<div class="cs-item" data-id="' + esc(x.id) + '"><button type="button" class="cs-open" data-u="' + esc(JSON.stringify(x.urls || [])) + '" data-id="' + esc(x.id) + '" aria-label="Open this sheet"><img alt="" loading="lazy" src="' + esc(abs((x.urls || [])[0])) + '" /></button>' +
        '<div class="cs-item-bar"><span>' + new Date(x.created_at).toLocaleString() + '</span><button type="button" class="cs-trash" data-id="' + esc(x.id) + '" title="Delete this sheet" aria-label="Delete this sheet"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/></svg></button></div></div>';
    }).join("") : '<p class="as-empty">Your sheets will show up here.</p>';
  }
  $("csList").addEventListener("click", async function (e) {
    var t = e.target.closest(".cs-trash");
    if (t) { await trash(t.getAttribute("data-id")); return; }
    var b = e.target.closest(".cs-open"); if (!b) return;
    try { st.shown = b.getAttribute("data-id"); show(JSON.parse(b.getAttribute("data-u"))); window.scrollTo({ top: 0, behavior: "smooth" }); } catch (x) {}
  });
  async function trash(id) {
    if (!id || !window.confirm("Delete this character sheet and its four views? This can't be undone.")) return;
    try { await fetch(RENDER() + "/jobs/" + id + "?table=image_jobs", { method: "DELETE", headers: { Authorization: "Bearer " + (await token()) } }); } catch (e) {}
    try { await client.from("image_jobs").delete().eq("id", id); } catch (e) {}
    if (st.shown === id) { $("csResult").hidden = true; st.shown = null; }
    status("Sheet deleted.", "success"); loadList();
  }
  $("csTrash").addEventListener("click", function () { trash(st.shown); });
})();

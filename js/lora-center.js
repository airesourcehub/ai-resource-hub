// AI Resource Hub — LoRA Training Center: one character -> one dataset -> a LoRA per model family, reused site-wide.
(function () {
  var RENDER = function () { return window.AIRH_GPU ? window.AIRH_GPU.base() : "https://render.airesourcehub.vip"; };
  if (!window.supabase || typeof SUPABASE_URL === "undefined") return;
  var $ = function (id) { return document.getElementById(id); };
  if (!$("lcForm")) return;
  var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  var st = { user: null, sheet: null, files: [], timer: null, src: "sheet", admin: false, preset: null, hub: {} };
  var FAM = {
    wan22: { label: "Video & scenes", model: "WAN 2.2", uses: ["@mentions in Scene mode", "Create Video"], hours: "3–5 h", state: "ready" },
    flux2: { label: "Images", model: "FLUX.2 Klein 9B", uses: ["Image Studio (Klein 9B)"], hours: "1–2 h", state: "beta" },
    ltx23: { label: "Lip sync", model: "LTX-2.3", uses: ["Lip Sync", "Music videos"], hours: "3 h", state: "beta" }
  };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function abs(u) { return !u ? u : /^https?:\/\//i.test(u) ? u : RENDER() + (u.charAt(0) === "/" ? "" : "/") + u; }
  function status(t, k) { $("lcStatus").textContent = t || ""; $("lcStatus").className = "form-status" + (k ? " " + k : ""); }
  async function token() {
    var r = await client.auth.getSession(); var s = r.data.session;
    if (s && s.expires_at && s.expires_at - Date.now() / 1000 < 120) { try { var rr = await client.auth.refreshSession(); if (rr.data && rr.data.session) s = rr.data.session; } catch (e) {} }
    return s ? s.access_token : null;
  }

  // ---- family picker
  $("lcFams").innerHTML = Object.keys(FAM).map(function (k) {
    var f = FAM[k], off = f.state === "soon";
    return '<label class="lc-fam' + (off ? " is-off" : "") + '"><input type="checkbox" name="fam" value="' + k + '"' + (k === "wan22" ? " checked" : "") + (off ? " disabled" : "") + ' />' +
      '<span class="lc-fam-top"><b>' + f.label + '</b><em class="lc-tag lc-' + f.state + '">' + (f.state === "ready" ? "Ready" : f.state === "beta" ? "Beta" : "Coming soon") + "</em></span>" +
      '<span class="lc-fam-model">' + f.model + " · about " + f.hours + "</span>" +
      '<span class="lc-fam-uses">' + f.uses.map(esc).join(" · ") + "</span></label>";
  }).join("");

  // ---- source tabs
  document.querySelectorAll("[data-src]").forEach(function (b) {
    b.addEventListener("click", function () {
      st.src = b.getAttribute("data-src");
      document.querySelectorAll("[data-src]").forEach(function (x) { x.classList.toggle("is-on", x === b); x.setAttribute("aria-selected", x === b ? "true" : "false"); });
      $("lcSheets").hidden = st.src !== "sheet"; $("lcPhotos").hidden = st.src !== "photos"; $("lcPresets").hidden = st.src !== "preset";
      if (st.src === "preset") paintPresets();
    });
  });
  $("lcFiles").addEventListener("change", function () {
    Array.prototype.forEach.call(this.files || [], function (f) { if (f.type.indexOf("image/") === 0 && st.files.length < 12) st.files.push(f); });
    this.value = ""; paintFiles();
  });
  function paintFiles() {
    $("lcThumbs").innerHTML = st.files.map(function (f, i) {
      return '<figure class="cs-thumb"><img alt="" src="' + URL.createObjectURL(f) + '" /><figcaption>' + (i === 0 ? "Main" : "#" + (i + 1)) + '</figcaption><button type="button" data-rm="' + i + '" aria-label="Remove photo">&times;</button></figure>';
    }).join("");
    $("lcCount").textContent = st.files.length + " / 12 photos (3 minimum)";
  }
  $("lcThumbs").addEventListener("click", function (e) { var b = e.target.closest("[data-rm]"); if (b) { st.files.splice(+b.getAttribute("data-rm"), 1); paintFiles(); } });
  $("lcHandle").addEventListener("input", function () { this.value = this.value.replace(/[^A-Za-z0-9_]/g, "").slice(0, 24); });
  $("lcName").addEventListener("input", function () { if (!$("lcHandle").dataset.touched) $("lcHandle").value = this.value.replace(/[^A-Za-z0-9_]/g, "").slice(0, 24); });
  $("lcHandle").addEventListener("keydown", function () { this.dataset.touched = "1"; });

  // ---- gate + data
  (async function () {
    var s = await client.auth.getSession(); st.user = s.data.session ? s.data.session.user : null; gate();
    client.auth.onAuthStateChange(function (_e, sess) { var was = st.user; st.user = sess ? sess.user : null; if (!was !== !st.user) gate(); });
  })();
  function gate() {
    $("lcGate").hidden = !!st.user; $("lcForm").hidden = !st.user; $("lcMineWrap").hidden = !st.user;
    if (st.user) { loadSheets(); loadMine(); checkAdmin(); }
  }
  // ---- admin: train the hub's own influencers (stock cards) straight into the shared @mention list
  async function checkAdmin() {
    try { var r = await client.from("profiles").select("is_admin").eq("id", st.user.id).single(); st.admin = !!(r.data && r.data.is_admin); } catch (e) { st.admin = false; }
    $("lcTabPreset").hidden = !st.admin || !window.AIRH_INF_PRESETS;
    if (!st.admin) return;
    try { var d = await (await fetch(RENDER() + "/characters")).json(); (d.characters || []).forEach(function (c) { if (c.preset) st.hub[c.preset] = c; }); } catch (e) {}
    if (st.src === "preset") paintPresets();
  }
  function paintPresets() {
    var q = ($("lcPresetFind").value || "").trim().toLowerCase();
    var list = (window.AIRH_INF_PRESETS || []).filter(function (p) { return !q || p.name.toLowerCase().indexOf(q) >= 0; });
    $("lcPresetGrid").innerHTML = list.length ? list.map(function (p) {
      var h = st.hub[p.id], on = st.preset === p.id;
      return '<button type="button" class="lc-preset' + (on ? " is-on" : "") + '" data-pid="' + esc(p.id) + '" aria-pressed="' + on + '">' +
        '<img alt="" loading="lazy" src="img/influencer/pv/' + esc(p.id) + '-close.jpg" />' +
        '<span class="lc-pname">' + esc(p.name) + "</span>" +
        (h ? '<span class="lc-pbadge" title="Already trained: ' + esc((h.families || []).join(", ")) + '">@' + esc(h.handle) + "</span>" : "") + "</button>";
    }).join("") : '<p class="as-empty">No influencer matches that.</p>';
  }
  $("lcPresetFind").addEventListener("input", paintPresets);
  $("lcPresetGrid").addEventListener("click", function (e) {
    var b = e.target.closest(".lc-preset"); if (!b) return;
    st.preset = b.getAttribute("data-pid");
    var p = (window.AIRH_INF_PRESETS || []).filter(function (x) { return x.id === st.preset; })[0] || {}, h = st.hub[st.preset];
    $("lcName").value = p.name || ""; $("lcHandle").value = h ? h.handle : (p.name || "").replace(/[^A-Za-z0-9_]/g, "").slice(0, 24); delete $("lcHandle").dataset.touched;
    paintPresets();
    status(h ? "Already trained (" + (h.families || []).join(", ") + "). Training again replaces those LoRAs and keeps the rest." : "", "");
  });
  async function loadSheets() {
    var r = await client.from("image_jobs").select("id, urls, created_at").eq("user_id", st.user.id).eq("model", "character_sheet").eq("status", "done").order("created_at", { ascending: false }).limit(24);
    var rows = r.data || [], want = new URLSearchParams(location.search).get("sheet");
    if (want && rows.some(function (x) { return x.id === want; })) st.sheet = want;
    $("lcSheetGrid").innerHTML = rows.length ? rows.map(function (x) {
      var u = x.urls || [];
      return '<div class="lc-sheet' + (st.sheet === x.id ? " is-on" : "") + '" data-id="' + esc(x.id) + '"><button type="button" class="lc-sheet-pick" aria-pressed="' + (st.sheet === x.id) + '"><img alt="" loading="lazy" src="' + esc(abs(u[0])) + '" /><span>' + new Date(x.created_at).toLocaleDateString() + '</span></button><button type="button" class="lc-x" title="Delete this sheet" aria-label="Delete this sheet">&times;</button></div>';
    }).join("") : '<p class="as-empty">No character sheets yet. <a href="character-sheet.html">Make one</a> from a few photos, or switch to “Upload photos”.</p>';
    if (want && st.sheet) $("lcForm").scrollIntoView({ behavior: "smooth" });
  }
  $("lcSheetGrid").addEventListener("click", function (e) {
    var b = e.target.closest(".lc-sheet"); if (!b) return;
    var id = b.getAttribute("data-id");
    if (e.target.closest(".lc-x")) { delSheet(id); return; }
    st.sheet = id;
    document.querySelectorAll(".lc-sheet").forEach(function (x) { x.classList.toggle("is-on", x === b); x.querySelector(".lc-sheet-pick").setAttribute("aria-pressed", x === b ? "true" : "false"); });
  });
  async function delSheet(id) {
    if (!id || !window.confirm("Delete this character sheet and its four views? This can't be undone.")) return;
    var tok = await token();
    try { await fetch(RENDER() + "/jobs/" + id + "?table=image_jobs", { method: "DELETE", headers: { Authorization: "Bearer " + tok } }); } catch (e) {}
    try { await client.from("image_jobs").delete().eq("id", id); } catch (e) {}
    if (st.sheet === id) st.sheet = null;
    status("Sheet deleted.", "success"); loadSheets();
  }

  // ---- start
  $("lcGo").addEventListener("click", async function () {
    var fams = Array.prototype.map.call(document.querySelectorAll('input[name="fam"]:checked'), function (x) { return x.value; });
    var name = $("lcName").value.trim(), handle = $("lcHandle").value.trim();
    if (!name) return status("Give your character a name.", "error");
    if (handle.length < 2) return status("Pick an @handle (letters, numbers, underscore).", "error");
    if (!fams.length) return status("Pick at least one training type.", "error");
    if (st.src === "sheet" && !st.sheet) return status("Pick one of your character sheets.", "error");
    if (st.src === "photos" && st.files.length < 3) return status("Add at least 3 photos of the same character.", "error");
    if (st.src === "preset" && !st.preset) return status("Pick one of the hub's influencers.", "error");
    var tok = await token(); if (!tok) return status("Your session expired. Please log in again.", "error");
    var fd = new FormData();
    fd.append("name", name); fd.append("handle", handle); fd.append("families", fams.join(","));
    if (st.src === "sheet") fd.append("sheet_id", st.sheet); else if (st.src === "preset") fd.append("preset", st.preset); else st.files.forEach(function (f) { fd.append("images", f); });
    $("lcGo").disabled = true; status("Sending to the GPU…");
    try {
      var r = await fetch(RENDER() + "/train-character", { method: "POST", headers: { Authorization: "Bearer " + tok }, body: fd });
      var d = await r.json().catch(function () { return {}; });
      if (!r.ok) throw new Error(d.detail || "The GPU didn't accept the job.");
      status("Started. First it builds a ~30-picture dataset, then trains. You can leave this page.", "success");
      $("lcName").value = ""; $("lcHandle").value = ""; delete $("lcHandle").dataset.touched; st.files = []; paintFiles();
      loadMine();
    } catch (e) { status(e.message || "Couldn't reach the GPU.", "error"); }
    $("lcGo").disabled = false;
  });

  // ---- your trained characters
  function chip(fam, c) {
    var j = (c.jobs || []).filter(function (x) { return x.family === fam || (x.kind === "lora_dataset" && !x.family); });
    var t = (c.jobs || []).filter(function (x) { return x.family === fam; })[0];
    var ds = (c.jobs || []).filter(function (x) { return x.kind === "lora_dataset"; })[0];
    var f = FAM[fam] || { label: fam };
    var stt, cls;
    if ((c.loras || {})[fam] || (c.loras || {})[fam + "_low"]) { stt = "Ready"; cls = "ok"; }
    else if (t && t.status === "processing") { stt = (t.progress || 0) + "%" + (t.eta_seconds ? " · " + Math.ceil(t.eta_seconds / 60) + " min left" : ""); cls = "run"; }
    else if (t && t.status === "error") { stt = "Failed"; cls = "err"; }
    else if (ds && ds.status === "processing") { stt = "Building dataset " + (ds.progress || 0) + "%"; cls = "run"; }
    else if (c.status === "error") { stt = "Failed"; cls = "err"; }
    else { stt = "Queued"; cls = "wait"; }
    return '<span class="lc-chip lc-' + cls + '" title="' + esc((t && t.error) || (t && t.stage) || "") + '"><b>' + esc(f.label) + "</b> " + esc(stt) + "</span>";
  }
  async function loadMine() {
    clearTimeout(st.timer);
    var tok = await token(); if (!tok) return;
    var d = {};
    try { var r = await fetch(RENDER() + "/my-loras", { headers: { Authorization: "Bearer " + tok } }); d = await r.json(); } catch (e) { $("lcMine").innerHTML = '<p class="as-empty">The GPU is offline right now, so live progress isn’t available.</p>'; return; }
    var rows = d.characters || [], live = false;
    $("lcMine").innerHTML = rows.length ? rows.map(function (c) {
      if (c.status !== "ready" && c.status !== "error") live = true;
      return '<article class="lc-card"><div class="lc-thumb">' + (c.thumb ? '<img alt="" loading="lazy" src="' + esc(abs(c.thumb)) + '" />' : "") + "</div>" +
        '<div class="lc-body"><h3>' + esc(c.name) + ' <span class="lc-handle">@' + esc(c.handle) + "</span></h3>" +
        '<p class="lc-meta">Trigger <code>' + esc(c.trigger) + "</code>" + (c.dataset_images ? " · " + c.dataset_images + " training pictures" : "") + "</p>" +
        '<div class="lc-chips">' + (c.families || []).map(function (f) { return chip(f, c); }).join("") + "</div>" +
        (c.status === "ready" ? '<p class="lc-use">Type <b>@' + esc(c.handle) + '</b> in <a href="influencer.html#scene">Scene mode</a> or <a href="wan-video.html">Create Video</a>.</p>' : "") +
        "</div></article>";
    }).join("") : '<p class="as-empty">Nothing trained yet. Your characters show up here with live progress.</p>';
    if (live) st.timer = setTimeout(loadMine, 15000);
  }
})();

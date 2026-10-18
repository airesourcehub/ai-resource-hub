// AI Resource Hub — Admin → Motion Presets.
// Clips live in the public Storage bucket "motion-presets" (admin-only write). The list is saved to
// site_settings key "motion_presets" as { items: [{ id, name, video, poster, mode, target, note, portrait, hidden }] };
// js/influencer.js shows them on Explore → Motion Presets and in each character's popup.
(function () {
  if (!window.supabase || typeof SUPABASE_URL === "undefined") return;
  var $ = function (id) { return document.getElementById(id); };
  if (!$("admin-motionpresets")) return;
  var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  var BUCKET = "motion-presets", BASE = SUPABASE_URL + "/storage/v1/object/public/" + BUCKET + "/";
  var items = [], dirty = false, file = null, dragId = null;

  load();
  async function load() {
    var r = await client.from("site_settings").select("value").eq("key", "motion_presets").maybeSingle();
    items = (r.data && r.data.value && r.data.value.items) || [];
    render();
  }
  function render() {
    var n = 0;
    $("mpGrid").innerHTML = items.length ? items.map(function (m, i) {
      var pos = m.hidden ? "Hidden" : "#" + (++n);
      return '<div class="io-card' + (m.hidden ? " is-off" : "") + '" draggable="true" data-id="' + esc(m.id) + '">' +
        '<div class="io-img"><video muted loop playsinline preload="metadata"' + (m.poster ? ' poster="' + esc(m.poster) + '"' : "") + ' src="' + esc(m.video) + '#t=0.1"></video></div>' +
        '<div class="io-meta"><span class="io-pos">' + pos + "</span><strong>" + esc(m.name) + "</strong><small>" + (m.mode === "swap" ? "Character swap" : "Motion transfer") + "</small></div>" +
        '<div class="io-acts"><button type="button" data-mv="-1" aria-label="Move earlier"' + (i === 0 ? " disabled" : "") + ">&larr;</button>" +
        '<button type="button" data-mv="1" aria-label="Move later"' + (i === items.length - 1 ? " disabled" : "") + ">&rarr;</button>" +
        '<button type="button" class="mp-del" data-del aria-label="Delete">Delete</button>' +
        '<label><input type="checkbox" data-show' + (m.hidden ? "" : " checked") + " /> Show</label></div></div>";
    }).join("") : '<p class="model-note">No motion presets yet. Upload a clip above.</p>';
  }
  function idx(el) { var c = el.closest(".io-card"); if (!c) return -1; var id = c.getAttribute("data-id"); for (var i = 0; i < items.length; i++) if (items[i].id === id) return i; return -1; }
  function move(i, to) { if (i < 0 || to < 0 || to >= items.length || to === i) return; var m = items.splice(i, 1)[0]; items.splice(to, 0, m); dirty = true; render(); status("Not saved yet."); }

  var grid = $("mpGrid");
  grid.addEventListener("click", async function (e) {
    var b = e.target.closest("[data-mv]");
    if (b) { var i = idx(b); move(i, i + Number(b.getAttribute("data-mv"))); return; }
    var d = e.target.closest("[data-del]");
    if (d) {
      var k = idx(d); if (k < 0) return;
      var m = items[k];
      if (!window.confirm('Delete "' + m.name + '"? The clip is removed from storage and from the site.')) return;
      var paths = [m.path, m.posterPath].filter(Boolean);
      if (paths.length) await client.storage.from(BUCKET).remove(paths);
      items.splice(k, 1); render(); await save();
    }
  });
  grid.addEventListener("change", function (e) {
    if (!e.target.hasAttribute("data-show")) return;
    var i = idx(e.target); if (i < 0) return;
    items[i].hidden = !e.target.checked; dirty = true; render(); status("Not saved yet.");
  });
  grid.addEventListener("mouseover", function (e) { var v = e.target.closest(".io-card") && e.target.closest(".io-card").querySelector("video"); if (v && v.paused) v.play().catch(function () {}); });
  grid.addEventListener("mouseout", function (e) { var c = e.target.closest(".io-card"); if (c && !c.contains(e.relatedTarget)) { var v = c.querySelector("video"); if (v) v.pause(); } });
  grid.addEventListener("dragstart", function (e) { var c = e.target.closest(".io-card"); if (!c) return; dragId = c.getAttribute("data-id"); c.classList.add("is-drag"); e.dataTransfer.effectAllowed = "move"; });
  grid.addEventListener("dragend", function () { dragId = null; Array.prototype.forEach.call(grid.querySelectorAll(".is-drag,.is-over"), function (c) { c.classList.remove("is-drag", "is-over"); }); });
  grid.addEventListener("dragover", function (e) { var c = e.target.closest(".io-card"); if (!c || !dragId) return; e.preventDefault(); Array.prototype.forEach.call(grid.querySelectorAll(".is-over"), function (x) { x.classList.remove("is-over"); }); c.classList.add("is-over"); });
  grid.addEventListener("drop", function (e) {
    var c = e.target.closest(".io-card"); if (!c || !dragId) return; e.preventDefault();
    var from = -1, to = idx(c); items.forEach(function (m, i) { if (m.id === dragId) from = i; });
    move(from, to);
  });

  // ---- add form
  $("mpMode").addEventListener("change", function () { $("mpTargetRow").hidden = $("mpMode").value !== "swap"; });
  $("mpFile").addEventListener("change", function () {
    file = this.files && this.files[0] ? this.files[0] : null;
    var v = $("mpPrev");
    if (!file) { v.hidden = true; v.removeAttribute("src"); $("mpFileTxt").hidden = false; return; }
    v.src = URL.createObjectURL(file); v.hidden = false; v.play().catch(function () {});
    $("mpFileTxt").hidden = true;
    if (!$("mpName").value.trim()) $("mpName").value = file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").slice(0, 60);
  });
  $("mpForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    if (!file) { addStatus("Choose a clip first.", true); return; }
    if (!/^video\//.test(file.type)) { addStatus("That file isn't a video.", true); return; }
    if (file.size > 100 * 1024 * 1024) { addStatus("That clip is over 100 MB. Trim or compress it first.", true); return; }
    var name = $("mpName").value.trim(); if (!name) { addStatus("Give it a name.", true); return; }
    var btn = $("mpAdd"); btn.disabled = true;
    try {
      addStatus("Reading the clip…");
      var info = await probe(file);
      var id = Date.now().toString(36) + "-" + slug(name);
      var ext = (file.name.match(/\.([a-z0-9]+)$/i) || [, "mp4"])[1].toLowerCase();
      var path = id + "." + ext, posterPath = id + ".jpg";
      addStatus("Uploading the clip…");
      var up = await client.storage.from(BUCKET).upload(path, file, { contentType: file.type, cacheControl: "31536000", upsert: false });
      if (up.error) throw up.error;
      var poster = null;
      if (info.poster) {
        var pu = await client.storage.from(BUCKET).upload(posterPath, info.poster, { contentType: "image/jpeg", cacheControl: "31536000", upsert: true });
        if (!pu.error) poster = BASE + posterPath;
      }
      items.unshift({ id: id, name: name, video: BASE + path, path: path, poster: poster, posterPath: poster ? posterPath : null,
        mode: $("mpMode").value, target: $("mpMode").value === "swap" ? ($("mpTarget").value.trim() || "person") : "",
        note: $("mpNote").value.trim(), portrait: info.h >= info.w, secs: Math.round(info.dur * 10) / 10, hidden: false });
      render();
      await save();
      addStatus("Added and live.");
      $("mpForm").reset(); file = null; $("mpPrev").hidden = true; $("mpPrev").removeAttribute("src"); $("mpFileTxt").hidden = false; $("mpTargetRow").hidden = true;
    } catch (err) {
      addStatus("Upload failed: " + (err.message || err), true);
    } finally { btn.disabled = false; }
  });

  function probe(f) {
    return new Promise(function (resolve) {
      var v = document.createElement("video"), url = URL.createObjectURL(f), done = false;
      v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = url;
      function fin(res) { if (done) return; done = true; URL.revokeObjectURL(url); resolve(res); }
      v.onloadedmetadata = function () { try { v.currentTime = Math.min(0.5, (v.duration || 1) / 3); } catch (e) { fin({ w: v.videoWidth, h: v.videoHeight, dur: v.duration || 0 }); } };
      v.onseeked = function () {
        var w = v.videoWidth, h = v.videoHeight, s = Math.min(1, 720 / Math.max(w, h));
        var c = document.createElement("canvas"); c.width = Math.round(w * s); c.height = Math.round(h * s);
        c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
        c.toBlob(function (b) { fin({ w: w, h: h, dur: v.duration || 0, poster: b }); }, "image/jpeg", 0.84);
      };
      v.onerror = function () { fin({ w: 0, h: 1, dur: 0 }); };
      setTimeout(function () { fin({ w: v.videoWidth || 0, h: v.videoHeight || 1, dur: v.duration || 0 }); }, 15000);
    });
  }

  $("mpSave").addEventListener("click", save);
  async function save() {
    status("Saving…");
    var u = await client.auth.getUser();
    var r = await client.from("site_settings").upsert({ key: "motion_presets", value: { items: items }, updated_at: new Date().toISOString(), updated_by: u.data && u.data.user ? u.data.user.id : null });
    if (r.error) { status("Couldn't save: " + r.error.message, true); return; }
    dirty = false; status("Saved. Live for everyone.");
  }
  window.addEventListener("beforeunload", function (e) { if (dirty) { e.preventDefault(); e.returnValue = ""; } });
  function status(t, err) { var s = $("mpStatus"); s.textContent = t; s.classList.toggle("is-err", !!err); }
  function addStatus(t, err) { var s = $("mpAddStatus"); s.textContent = t; s.classList.toggle("is-err", !!err); }
  function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "clip"; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
})();

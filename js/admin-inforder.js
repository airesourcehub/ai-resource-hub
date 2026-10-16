// AI Resource Hub — Admin → Influencer Order.
// Saves { order: [preset ids], hidden: [preset ids] } to site_settings key "influencer" (public read, admin-only
// write). js/influencer.js applies it to the preset wall for every visitor.
(function () {
  if (!window.supabase || typeof SUPABASE_URL === "undefined") return;
  var $ = function (id) { return document.getElementById(id); };
  if (!$("admin-inforder") || !window.AIRH_INF_PRESETS) return;
  var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  var ALL = window.AIRH_INF_PRESETS, byId = {};
  ALL.forEach(function (p) { byId[p.id] = p; });
  var TIER = { normal: "Average", freak: "Bold", total: "Extreme" };
  var order = ALL.map(function (p) { return p.id; }), hidden = [], dirty = false, dragId = null;

  load();
  async function load() {
    var r = await client.from("site_settings").select("value").eq("key", "influencer").maybeSingle();
    var v = r.data && r.data.value;
    if (v && v.order && v.order.length) {
      var seen = {}; order = [];
      v.order.forEach(function (id) { if (byId[id] && !seen[id]) { seen[id] = 1; order.push(id); } });
      ALL.forEach(function (p) { if (!seen[p.id]) order.push(p.id); });
    }
    hidden = (v && v.hidden) || [];
    render();
  }

  function render() {
    var n = 0;
    $("ioGrid").innerHTML = order.map(function (id, i) {
      var p = byId[id], off = hidden.indexOf(id) > -1;
      var pos = off ? "Hidden" : "#" + (++n);
      return '<div class="io-card' + (off ? " is-off" : "") + '" draggable="true" data-id="' + id + '">' +
        '<div class="io-img" style="background-image:url(img/influencer/pv/' + id + '-close.jpg)"></div>' +
        '<div class="io-meta"><span class="io-pos">' + pos + '</span><strong>' + esc(p.name) + '</strong><small>' + esc(TIER[p.tier] || (p.tier.charAt(0).toUpperCase() + p.tier.slice(1))) + "</small></div>" +
        '<div class="io-acts"><button type="button" data-mv="-1" aria-label="Move earlier"' + (i === 0 ? " disabled" : "") + '>&larr;</button>' +
        '<button type="button" data-mv="1" aria-label="Move later"' + (i === order.length - 1 ? " disabled" : "") + '>&rarr;</button>' +
        '<label><input type="checkbox" data-show' + (off ? "" : " checked") + " /> Show</label></div></div>";
    }).join("");
  }

  function move(id, to) {
    var i = order.indexOf(id); if (i < 0 || to < 0 || to >= order.length || to === i) return;
    order.splice(i, 1); order.splice(to, 0, id); dirty = true; render(); status("Not saved yet.");
  }

  var grid = $("ioGrid");
  grid.addEventListener("click", function (e) {
    var b = e.target.closest("[data-mv]"); if (!b) return;
    var id = b.closest(".io-card").getAttribute("data-id");
    move(id, order.indexOf(id) + Number(b.getAttribute("data-mv")));
  });
  grid.addEventListener("change", function (e) {
    if (!e.target.hasAttribute("data-show")) return;
    var id = e.target.closest(".io-card").getAttribute("data-id");
    hidden = hidden.filter(function (x) { return x !== id; });
    if (!e.target.checked) hidden.push(id);
    dirty = true; render(); status("Not saved yet.");
  });
  grid.addEventListener("dragstart", function (e) {
    var c = e.target.closest(".io-card"); if (!c) return;
    dragId = c.getAttribute("data-id"); c.classList.add("is-drag");
    try { e.dataTransfer.setData("text/plain", dragId); e.dataTransfer.effectAllowed = "move"; } catch (err) {}
  });
  grid.addEventListener("dragend", function () { dragId = null; clearOver(); render(); });
  grid.addEventListener("dragover", function (e) {
    var c = e.target.closest(".io-card"); if (!dragId || !c) return;
    e.preventDefault(); clearOver(); c.classList.add("is-over");
  });
  grid.addEventListener("drop", function (e) {
    var c = e.target.closest(".io-card"); if (!dragId || !c) return;
    e.preventDefault();
    var to = order.indexOf(c.getAttribute("data-id"));
    var id = dragId; dragId = null; clearOver(); move(id, to);
  });
  function clearOver() { Array.prototype.forEach.call(grid.querySelectorAll(".is-over,.is-drag"), function (x) { x.classList.remove("is-over", "is-drag"); }); }

  $("ioSave").addEventListener("click", async function () {
    status("Saving…");
    var u = await client.auth.getUser();
    var v = { order: order.slice(), hidden: hidden.slice() };
    var r = await client.from("site_settings").upsert({ key: "influencer", value: v, updated_at: new Date().toISOString(), updated_by: u.data && u.data.user ? u.data.user.id : null });
    if (r.error) { status("Couldn't save: " + r.error.message, true); return; }
    try { localStorage.setItem("airh-inf-order", JSON.stringify(v)); } catch (e) {}
    dirty = false; status("Saved. Everyone sees this order on their next visit.");
  });
  $("ioDefault").addEventListener("click", function () {
    if (!window.confirm("Put the presets back in the default order and show them all? (Click Save to make it live.)")) return;
    order = ALL.map(function (p) { return p.id; }); hidden = []; dirty = true; render();
    status("Default order loaded. Click Save to make it live.");
  });
  window.addEventListener("beforeunload", function (e) { if (dirty) { e.preventDefault(); e.returnValue = ""; } });

  function status(t, err) { var s = $("ioStatus"); s.textContent = t; s.style.color = err ? "var(--color-red)" : ""; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
})();

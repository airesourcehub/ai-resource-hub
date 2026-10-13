// AI Resource Hub — Admin → Site Settings.
// Edits the "site" row of the site_settings table (public read, admin-only
// write). js/site-settings.js applies it on every page.

(function () {
  if (!window.supabase || typeof SUPABASE_URL === "undefined") return;
  var $ = function (id) { return document.getElementById(id); };
  if (!$("admin-site")) return;
  var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  var SECTIONS = [
    ["explore", "Explore"], ["image", "Image"], ["video", "Video"], ["audio", "Audio"],
    ["influencer", "AI Influencer"], ["mcp", "MCP"], ["prompts", "Prompts"]
  ];
  var SWATCHES = [
    ["#ff6a1f", "Orange"], ["#d1fe17", "Lime"], ["#ffd21f", "Gold"], ["#ff3b6b", "Hot pink"],
    ["#ef4444", "Red"], ["#a855f7", "Purple"], ["#3b82f6", "Blue"], ["#06b6d4", "Cyan"], ["#22c55e", "Green"], ["#f5f5f5", "White"]
  ];
  var DEF = window.AIRH_SITE ? JSON.parse(JSON.stringify(window.AIRH_SITE.defaults)) :
    { accent: "#ff6a1f", accentLight: "", navOrder: SECTIONS.map(function (s) { return s[0]; }), nav: {}, cta: { label: "Start creating", href: "image-studio.html", visible: true }, showStatus: true, signupsOpen: false, hostGpuName: "" };
  var cur = JSON.parse(JSON.stringify(DEF));

  load();

  async function load() {
    var r = await client.from("site_settings").select("value").eq("key", "site").maybeSingle();
    if (r.data && r.data.value) cur = Object.assign(JSON.parse(JSON.stringify(DEF)), r.data.value);
    render();
  }

  function render() {
    $("ssSwatches").innerHTML = SWATCHES.map(function (s) {
      return '<button type="button" class="ss-sw' + (s[0].toLowerCase() === String(cur.accent).toLowerCase() ? " is-on" : "") + '" data-c="' + s[0] + '" title="' + s[1] + '" style="--c:' + s[0] + '"><span></span>' + s[1] + "</button>";
    }).join("");
    $("ssAccent").value = cur.accent; $("ssAccentHex").value = cur.accent;
    $("ssLightAuto").checked = !cur.accentLight;
    $("ssLightWrap").hidden = !cur.accentLight;
    if (cur.accentLight) $("ssAccentLight").value = cur.accentLight;
    var order = (cur.navOrder && cur.navOrder.length ? cur.navOrder : DEF.navOrder).slice();
    SECTIONS.forEach(function (s) { if (order.indexOf(s[0]) < 0) order.push(s[0]); });
    cur.navOrder = order;
    $("ssNav").innerHTML = order.map(function (key, i) {
      var def = (SECTIONS.filter(function (s) { return s[0] === key; })[0] || [key, key])[1];
      var c = (cur.nav || {})[key] || {};
      return '<div class="ss-nav-row" data-key="' + key + '">' +
        '<div class="ss-move"><button type="button" data-mv="-1" aria-label="Move up"' + (i === 0 ? " disabled" : "") + '>&uarr;</button><button type="button" data-mv="1" aria-label="Move down"' + (i === order.length - 1 ? " disabled" : "") + ">&darr;</button></div>" +
        '<label class="ss-check"><input type="checkbox" data-f="visible"' + (c.visible === false ? "" : " checked") + " /> Show</label>" +
        '<input type="text" data-f="label" maxlength="20" placeholder="' + def + '" value="' + esc(c.label || "") + '" aria-label="' + def + ' label" />' +
        '<input type="text" data-f="badge" maxlength="8" placeholder="Badge" value="' + esc(c.badge || "") + '" aria-label="' + def + ' badge" class="ss-badge-in" />' +
        '<span class="ss-def">' + def + "</span></div>";
    }).join("");
    $("ssCtaLabel").value = (cur.cta && cur.cta.label) || DEF.cta.label;
    $("ssCtaHref").value = (cur.cta && cur.cta.href) || DEF.cta.href;
    $("ssCtaShow").checked = !(cur.cta && cur.cta.visible === false);
    $("ssStatusShow").checked = cur.showStatus !== false;
    $("ssSignups").checked = cur.signupsOpen === true;
    $("ssHostName").value = cur.hostGpuName || "";
    preview();
  }

  function collect() {
    var nav = {};
    Array.prototype.forEach.call($("ssNav").querySelectorAll(".ss-nav-row"), function (row) {
      var key = row.getAttribute("data-key"), o = {};
      if (!row.querySelector('[data-f="visible"]').checked) o.visible = false;
      var l = row.querySelector('[data-f="label"]').value.trim(); if (l) o.label = l;
      var b = row.querySelector('[data-f="badge"]').value.trim(); if (b) o.badge = b;
      if (Object.keys(o).length) nav[key] = o;
    });
    cur.nav = nav;
    cur.accent = norm($("ssAccentHex").value) || "#ff6a1f";
    cur.accentLight = $("ssLightAuto").checked ? "" : $("ssAccentLight").value;
    cur.cta = { label: $("ssCtaLabel").value.trim() || DEF.cta.label, href: $("ssCtaHref").value.trim() || DEF.cta.href, visible: $("ssCtaShow").checked };
    cur.showStatus = $("ssStatusShow").checked;
    cur.signupsOpen = $("ssSignups").checked;
    cur.hostGpuName = $("ssHostName").value.trim().slice(0, 40);
    return cur;
  }

  function preview() {
    if (window.AIRH_SITE) window.AIRH_SITE.apply(collect());
  }

  function norm(h) { h = String(h || "").trim(); if (h && h[0] !== "#") h = "#" + h; return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(h) ? h.toLowerCase() : null; }

  $("admin-site").addEventListener("click", function (e) {
    var sw = e.target.closest(".ss-sw");
    if (sw) { cur.accent = sw.getAttribute("data-c"); $("ssAccent").value = cur.accent; $("ssAccentHex").value = cur.accent; collect(); render(); return; }
    var mv = e.target.closest("[data-mv]");
    if (mv) {
      collect();
      var key = mv.closest(".ss-nav-row").getAttribute("data-key");
      var i = cur.navOrder.indexOf(key), j = i + Number(mv.getAttribute("data-mv"));
      if (j < 0 || j >= cur.navOrder.length) return;
      cur.navOrder.splice(i, 1); cur.navOrder.splice(j, 0, key);
      render();
    }
  });
  $("admin-site").addEventListener("input", function (e) {
    if (e.target.id === "ssAccent") $("ssAccentHex").value = e.target.value;
    if (e.target.id === "ssAccentHex" && norm(e.target.value) && norm(e.target.value).length === 7) $("ssAccent").value = norm(e.target.value);
    preview();
  });
  $("admin-site").addEventListener("change", function (e) {
    if (e.target.id === "ssLightAuto") $("ssLightWrap").hidden = e.target.checked;
    preview();
  });

  $("ssSave").addEventListener("click", async function () {
    var v = collect();
    if (v.signupsOpen && !window.confirm("Open sign-ups? Anyone will be able to create an account (they still use their own PC unless you approve them for your GPU).")) return;
    status("Saving…");
    var u = await client.auth.getUser();
    var r = await client.from("site_settings").upsert({ key: "site", value: v, updated_at: new Date().toISOString(), updated_by: u.data && u.data.user ? u.data.user.id : null });
    if (r.error) { status("Couldn't save: " + r.error.message, true); return; }
    try { localStorage.setItem("airh-site-settings", JSON.stringify(v)); } catch (e) {}
    status("Saved. Everyone sees it on their next page load.");
  });

  $("ssReset").addEventListener("click", function () {
    if (!window.confirm("Put the colors and menu back to the defaults? (Click Save to make it live.)")) return;
    cur = JSON.parse(JSON.stringify(DEF));
    render();
    status("Defaults loaded. Click Save to make them live.");
  });

  function status(t, err) { var s = $("ssStatus"); s.textContent = t; s.style.color = err ? "var(--color-red)" : ""; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
})();

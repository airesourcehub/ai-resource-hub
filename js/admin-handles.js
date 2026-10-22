// AI Resource Hub — Admin → Influencer @handles.
// Edits the @mention handle of each TRAINED character (site_settings key "influencer_handles":
// { handles: { presetId: Handle } }). Saved through the save_stock_handles() database function, which
// checks the format, keeps stock handles unique, and frees any user's own handle that now matches a
// stock one (stock always wins). User handles are unique per account only.
(function () {
  if (!window.supabase || typeof SUPABASE_URL === "undefined") return;
  var $ = function (id) { return document.getElementById(id); };
  if (!$("admin-handles")) return;
  var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  var PRESETS = window.AIRH_INF_PRESETS || [];
  var RE = /^[A-Za-z][A-Za-z0-9_]{1,29}$/;
  function def(p) { return String(p.name || "").replace(/[^A-Za-z0-9_]/g, ""); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function status(t, bad) { var s = $("hdStatus"); s.textContent = t; s.style.color = bad ? "#e5484d" : ""; }

  function check() {
    var seen = {}, bad = 0;
    Array.prototype.forEach.call(document.querySelectorAll("#hdList input"), function (inp) {
      var v = inp.value.trim().replace(/^@/, ""), k = v.toLowerCase(), msg = "";
      if (!RE.test(v)) msg = "2–30 letters, numbers or _, starting with a letter";
      else if (seen[k]) msg = "Already used by " + seen[k];
      else seen[k] = inp.getAttribute("data-name");
      inp.closest(".hd-row").querySelector(".hd-err").textContent = msg;
      inp.setAttribute("aria-invalid", msg ? "true" : "false");
      if (msg) bad++;
    });
    $("hdSave").disabled = bad > 0;
    return bad === 0;
  }

  (async function load() {
    var r = await client.from("site_settings").select("value").eq("key", "influencer_handles").maybeSingle();
    var h = (r.data && r.data.value && r.data.value.handles) || {};
    // Only trained characters have a handle; a character is added here when its training is wired in.
    var trained = PRESETS.filter(function (p) { return h[p.id]; });
    if (!trained.length) { $("hdList").innerHTML = '<small class="inf-note">No trained characters yet.</small>'; return; }
    $("hdList").innerHTML = trained.map(function (p) {
      return '<div class="hd-row"><img alt="" loading="lazy" src="img/influencer/pv/' + esc(p.id) + '-close.jpg" />' +
        '<span class="hd-name">' + esc(p.name) + '</span><label class="hd-in"><span>@</span><input type="text" maxlength="30" spellcheck="false" autocomplete="off" data-id="' +
        esc(p.id) + '" data-name="' + esc(p.name) + '" value="' + esc(h[p.id] || def(p)) + '" aria-label="@handle for ' + esc(p.name) + '" /></label><small class="hd-err"></small></div>';
    }).join("");
    $("hdList").addEventListener("input", check);
    check();
    status(trained.length + " trained character" + (trained.length === 1 ? "" : "s") + ".");
  })();

  $("hdSave").addEventListener("click", async function () {
    if (!check()) return status("Fix the handles marked in red first.", true);
    var map = {};
    Array.prototype.forEach.call(document.querySelectorAll("#hdList input"), function (inp) { map[inp.getAttribute("data-id")] = inp.value.trim().replace(/^@/, ""); });
    if (!Object.keys(map).length) return status("Nothing to save.", true);
    status("Saving…");
    var r = await client.rpc("save_stock_handles", { handles: map });
    if (r.error) return status("Couldn't save: " + r.error.message, true);
    var n = r.data || 0;
    status("Saved. Takes effect on the site and in Claude/ChatGPT within 30 seconds." +
      (n ? " " + n + " user influencer" + (n === 1 ? " was" : "s were") + " using one of these handles and lost it; those users can pick a new one." : ""));
  });
})();

// AI Resource Hub — Admin → Content Guard.
// Saves { enabled, positive, negative } to site_settings key "content_guard". The render server
// (content_guard.py) reads it before every ComfyUI job; off = prompts are used exactly as written.
(function () {
  if (!window.supabase || typeof SUPABASE_URL === "undefined") return;
  var $ = function (id) { return document.getElementById(id); };
  if (!$("admin-contentguard")) return;
  var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  var DEF_POS = "fully clothed", DEF_NEG = "nude, naked, topless, nipples, underwear, lingerie, bikini";

  function status(t, bad) { var s = $("cgStatus"); s.textContent = t; s.style.color = bad ? "#e5484d" : ""; }
  function sync() { $("cgPos").disabled = $("cgNeg").disabled = !$("cgEnabled").checked; }

  (async function load() {
    var r = await client.from("site_settings").select("value").eq("key", "content_guard").maybeSingle();
    var v = (r.data && r.data.value) || {};
    $("cgEnabled").checked = !!v.enabled;
    $("cgPos").value = v.positive || DEF_POS;
    $("cgNeg").value = v.negative || DEF_NEG;
    sync();
    status(v.enabled ? "Guard is on." : "Guard is off — prompts are used exactly as written.");
  })();

  $("cgEnabled").addEventListener("change", sync);
  $("cgSave").addEventListener("click", async function () {
    status("Saving…");
    var u = await client.auth.getUser();
    var v = { enabled: $("cgEnabled").checked, positive: $("cgPos").value.trim() || DEF_POS, negative: $("cgNeg").value.trim() || DEF_NEG };
    var r = await client.from("site_settings").upsert({ key: "content_guard", value: v, updated_at: new Date().toISOString(),
      updated_by: u.data && u.data.user ? u.data.user.id : null });
    if (r.error) return status("Couldn't save: " + r.error.message, true);
    status(v.enabled ? "Saved. Guard is on." : "Saved. Guard is off — prompts are used exactly as written.");
  });
})();

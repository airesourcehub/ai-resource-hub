// AI Resource Hub — per-user render archive.
// Shared by the AI Transitions page ("Your recent renders" strip, #blendArchive)
// and the dedicated My Renders page (#archiveList). Reads the signed-in user's
// own rows from public.render_jobs (RLS keeps it private to them) and links to
// the result files served by the desktop render service.

(function () {
  var RENDER_ENDPOINT = "https://render.airesourcehub.vip";
  if (!window.supabase || typeof SUPABASE_URL === "undefined") return;

  var fullList = document.getElementById("archiveList");     // dedicated page
  var recent = document.getElementById("blendArchive");      // transitions-page strip
  var recentWrap = document.getElementById("blendArchiveWrap");
  if (!fullList && !recent) return;

  var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  init();
  window.reloadRenderArchive = init;

  async function init() {
    var s = await client.auth.getSession();
    var user = s.data.session ? s.data.session.user : null;
    await render(user);
    client.auth.onAuthStateChange(function (_e, sess) {
      render(sess ? sess.user : null);
    });
  }

  async function render(user) {
    if (!user) {
      setMsg('Log in to see your saved renders.');
      return;
    }
    var q = client.from("render_jobs")
      .select("id,status,mode,prompt,result_url,result_mov_url,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (recent && !fullList) q = q.limit(6);

    var res = await q;
    if (res.error) { setMsg("Couldn't load your renders right now."); return; }

    var rows = (res.data || []).filter(function (r) { return r.status === "done" && r.result_url; });
    if (!rows.length) {
      setMsg("No renders yet — your finished transitions will appear here automatically.");
      return;
    }

    var html = rows.map(card).join("");
    if (fullList) fullList.innerHTML = html;
    if (recent) recent.innerHTML = html;
    if (recentWrap) recentWrap.style.display = "";
  }

  function card(r) {
    var mp4 = abs(r.result_url);
    var mov = r.result_mov_url ? abs(r.result_mov_url) : null;
    var when = new Date(r.created_at).toLocaleString();
    var kind = r.mode === "stitched" ? "Full sequence" : "Transition only";
    return '<div class="archive-card">' +
      '<video src="' + mp4 + '" controls preload="metadata" playsinline class="archive-video"></video>' +
      (r.prompt ? '<p class="archive-prompt">' + esc(r.prompt) + '</p>' : '') +
      '<p class="frame-res" style="margin:6px 0;">' + esc(when) + ' &middot; ' + kind + '</p>' +
      '<div class="output-actions">' +
        '<a class="btn btn-primary btn-small" href="' + mp4 + '" download>MP4</a>' +
        (mov ? '<a class="btn btn-secondary btn-small" href="' + mov + '" download>MOV</a>' : '') +
      '</div>' +
    '</div>';
  }

  function abs(u) {
    if (!u) return u;
    return /^https?:\/\//i.test(u) ? u : RENDER_ENDPOINT + (u.charAt(0) === "/" ? "" : "/") + u;
  }

  function setMsg(msg) {
    var target = fullList || recent;
    if (target) target.innerHTML = '<p class="model-note">' + esc(msg) + '</p>';
    // On the transitions page, only reveal the strip once there's something to show.
    if (recentWrap && fullList == null) {
      recentWrap.style.display = (msg.indexOf("No renders yet") === 0 || msg.indexOf("Log in") === 0) ? "none" : "";
    }
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
})();

// AI Resource Hub — per-user render archive.
// Shared by the AI Transitions page ("Your recent renders" strip, #blendArchive,
// last 10) and the dedicated My Renders page (#archiveList, all). Reads the
// signed-in user's own rows from public.render_jobs (RLS keeps it private) and
// links to the result files served by the desktop render service. Each card has
// a Delete button that removes both the file (via the service) and the row.

(function () {
  var RENDER_ENDPOINT = "https://render.airesourcehub.vip";
  var RECENT_LIMIT = 10;
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
    wireDelete(fullList);
    wireDelete(recent);
  }

  async function getToken() {
    var r = await client.auth.getSession();
    return r.data.session ? r.data.session.access_token : null;
  }

  async function render(user) {
    if (!user) { setMsg("Log in to see your saved renders."); return; }

    var q = client.from("render_jobs")
      .select("id,status,mode,prompt,result_url,result_mov_url,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (recent && !fullList) q = q.limit(RECENT_LIMIT);

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
    return '<div class="archive-card" data-card="' + esc(r.id) + '">' +
      '<video src="' + mp4 + '" controls preload="metadata" playsinline class="archive-video"></video>' +
      (r.prompt ? '<p class="archive-prompt">' + esc(r.prompt) + '</p>' : '') +
      '<p class="frame-res" style="margin:6px 0;">' + esc(when) + ' &middot; ' + kind + '</p>' +
      '<div class="output-actions">' +
        '<a class="btn btn-primary btn-small" href="' + mp4 + '" download>MP4</a>' +
        (mov ? '<a class="btn btn-secondary btn-small" href="' + mov + '" download>MOV</a>' : '') +
        '<button type="button" class="btn btn-danger btn-small archive-del" data-id="' + esc(r.id) + '">Delete</button>' +
      '</div>' +
    '</div>';
  }

  function wireDelete(container) {
    if (!container || container.dataset.delWired) return;
    container.dataset.delWired = "1";
    container.addEventListener("click", async function (e) {
      var btn = e.target.closest(".archive-del");
      if (!btn) return;
      var id = btn.getAttribute("data-id");
      if (!id) return;
      if (!window.confirm("Delete this render permanently? This removes the video file and can't be undone.")) return;

      btn.disabled = true;
      btn.textContent = "Deleting…";
      var ok = await deleteRender(id);
      if (ok) {
        if (typeof window.reloadRenderArchive === "function") window.reloadRenderArchive();
      } else {
        btn.disabled = false;
        btn.textContent = "Delete";
        window.alert("Couldn't delete right now — the render service may be offline. Try again once it's running.");
      }
    });
  }

  async function deleteRender(id) {
    try {
      var token = await getToken();
      if (!token) return false;
      var r = await fetch(RENDER_ENDPOINT + "/jobs/" + id, {
        method: "DELETE",
        headers: { "Authorization": "Bearer " + token }
      });
      return r.ok;
    } catch (e) {
      return false;
    }
  }

  function abs(u) {
    if (!u) return u;
    return /^https?:\/\//i.test(u) ? u : RENDER_ENDPOINT + (u.charAt(0) === "/" ? "" : "/") + u;
  }

  function setMsg(msg) {
    var target = fullList || recent;
    if (target) target.innerHTML = '<p class="model-note">' + esc(msg) + '</p>';
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

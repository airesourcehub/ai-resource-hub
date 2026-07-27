// AI Resource Hub — AI Transitions render library.
// Scoped strictly to render_type = 'ai_transition' so this library only ever
// shows transition renders. Supports per-user project folders (render_folders).
//
// Two contexts:
//   - #archiveList  (My AI Transition Renders page): full library + folder bar
//   - #blendArchive (AI Transitions page strip): last 10, no folder controls

(function () {
  var RENDER_ENDPOINT = "https://render.airesourcehub.vip";
  var RENDER_TYPE = "ai_transition";
  var TOOL = "ai_transition";
  var RECENT_LIMIT = 10;
  var LS_KEY = "ai-transition-folder";

  if (!window.supabase || typeof SUPABASE_URL === "undefined") return;

  var fullList = document.getElementById("archiveList");   // dedicated page
  var folderBar = document.getElementById("folderBar");    // dedicated page
  var recent = document.getElementById("blendArchive");    // transitions strip
  var recentWrap = document.getElementById("blendArchiveWrap");
  if (!fullList && !recent) return;

  var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  var user = null;
  var folders = [];
  var selected = "all"; // 'all' | 'unfiled' | folderId
  try { selected = localStorage.getItem(LS_KEY) || "all"; } catch (e) {}

  init();
  window.reloadRenderArchive = init;

  async function init() {
    var s = await client.auth.getSession();
    user = s.data.session ? s.data.session.user : null;
    await refresh();
    client.auth.onAuthStateChange(function (_e, sess) {
      user = sess ? sess.user : null;
      refresh();
    });
    if (fullList) wire(fullList);
    if (recent) wire(recent);
  }

  async function getToken() {
    var r = await client.auth.getSession();
    return r.data.session ? r.data.session.access_token : null;
  }

  async function refresh() {
    if (!user) { setMsg("Log in to see your saved renders."); return; }
    if (fullList) { await loadFolders(); renderFolderBar(); }
    await loadRenders();
  }

  async function loadFolders() {
    var res = await client.from("render_folders")
      .select("id,name")
      .eq("user_id", user.id).eq("tool", TOOL)
      .order("created_at", { ascending: true });
    folders = res.data || [];
  }

  async function loadRenders() {
    var q = client.from("render_jobs")
      .select("id,status,mode,prompt,result_url,result_mov_url,created_at,folder_id")
      .eq("user_id", user.id).eq("render_type", RENDER_TYPE)
      .order("created_at", { ascending: false });
    if (recent && !fullList) q = q.limit(RECENT_LIMIT);

    var res = await q;
    if (res.error) { setMsg("Couldn't load your renders right now."); return; }
    var rows = (res.data || []).filter(function (r) { return r.status === "done" && r.result_url; });

    // Full-page folder filtering.
    if (fullList) {
      if (selected === "unfiled") rows = rows.filter(function (r) { return !r.folder_id; });
      else if (selected !== "all") rows = rows.filter(function (r) { return r.folder_id === selected; });
    }

    if (!rows.length) {
      setMsg(fullList ? "Nothing in this view yet." : "No renders yet — your finished transitions will appear here automatically.");
      return;
    }

    var html = rows.map(card).join("");
    if (fullList) fullList.innerHTML = html;
    if (recent) recent.innerHTML = html;
    if (recentWrap) recentWrap.style.display = "";
  }

  function renderFolderBar() {
    if (!folderBar) return;
    var chips = [chip("all", "All"), chip("unfiled", "Unfiled")];
    folders.forEach(function (f) { chips.push(chip(f.id, f.name, true)); });
    folderBar.innerHTML =
      '<div class="folder-chips">' + chips.join("") + '</div>' +
      '<button type="button" class="btn btn-secondary btn-small" id="newFolderBtn">+ New folder</button>';
  }

  function chip(val, label, deletable) {
    var active = selected === val ? " active" : "";
    return '<span class="folder-chip' + active + '" data-folder="' + esc(val) + '">' +
      esc(label) +
      (deletable ? '<button type="button" class="folder-del" data-delfolder="' + esc(val) + '" title="Delete folder">&times;</button>' : '') +
      '</span>';
  }

  function card(r) {
    var mp4 = abs(r.result_url);
    var mov = r.result_mov_url ? abs(r.result_mov_url) : null;
    var when = new Date(r.created_at).toLocaleString();
    var kind = r.mode === "stitched" ? "Full sequence" : "Transition only";
    var moveSel = "";
    if (fullList) {
      var opts = '<option value="">Unfiled</option>' + folders.map(function (f) {
        return '<option value="' + esc(f.id) + '"' + (r.folder_id === f.id ? " selected" : "") + '>' + esc(f.name) + '</option>';
      }).join("");
      moveSel = '<select class="archive-move" data-id="' + esc(r.id) + '" title="Move to folder">' + opts + '</select>';
    }
    return '<div class="archive-card" data-card="' + esc(r.id) + '">' +
      '<video src="' + mp4 + '" controls preload="metadata" playsinline class="archive-video"></video>' +
      (r.prompt ? '<p class="archive-prompt">' + esc(r.prompt) + '</p>' : '') +
      '<p class="frame-res" style="margin:6px 0;">' + esc(when) + ' &middot; ' + kind + '</p>' +
      (moveSel ? '<div class="archive-move-wrap">' + moveSel + '</div>' : '') +
      '<div class="output-actions">' +
        '<a class="btn btn-primary btn-small" href="' + mp4 + '" download>MP4</a>' +
        (mov ? '<a class="btn btn-secondary btn-small" href="' + mov + '" download>MOV</a>' : '') +
        '<button type="button" class="btn btn-danger btn-small archive-del" data-id="' + esc(r.id) + '">Delete</button>' +
      '</div>' +
    '</div>';
  }

  function wire(container) {
    if (container.dataset.wired) return;
    container.dataset.wired = "1";

    container.addEventListener("click", async function (e) {
      var del = e.target.closest(".archive-del");
      if (del) return onDelete(del);
      var folderChip = e.target.closest("[data-folder]");
      if (folderChip && !e.target.closest(".folder-del")) {
        selected = folderChip.getAttribute("data-folder");
        try { localStorage.setItem(LS_KEY, selected); } catch (x) {}
        renderFolderBar(); loadRenders(); return;
      }
      var delF = e.target.closest("[data-delfolder]");
      if (delF) return onDeleteFolder(delF.getAttribute("data-delfolder"));
      if (e.target.id === "newFolderBtn") return onNewFolder();
    });

    container.addEventListener("change", async function (e) {
      var sel = e.target.closest(".archive-move");
      if (!sel) return;
      var id = sel.getAttribute("data-id");
      var folderId = sel.value || null;
      await client.from("render_jobs").update({ folder_id: folderId }).eq("id", id);
      loadRenders();
    });
  }

  // The folder bar lives outside #archiveList, so listen there too.
  if (folderBar) { /* attach a lightweight click handler */
    folderBar.addEventListener("click", function (e) {
      var folderChip = e.target.closest("[data-folder]");
      if (folderChip && !e.target.closest(".folder-del")) {
        selected = folderChip.getAttribute("data-folder");
        try { localStorage.setItem(LS_KEY, selected); } catch (x) {}
        renderFolderBar(); loadRenders(); return;
      }
      var delF = e.target.closest("[data-delfolder]");
      if (delF) return onDeleteFolder(delF.getAttribute("data-delfolder"));
      if (e.target.id === "newFolderBtn") return onNewFolder();
    });
  }

  async function onNewFolder() {
    var name = window.prompt("Name your new project folder:");
    if (!name || !name.trim()) return;
    await client.from("render_folders").insert({ user_id: user.id, tool: TOOL, name: name.trim() });
    await loadFolders(); renderFolderBar(); loadRenders();
  }

  async function onDeleteFolder(id) {
    if (!window.confirm("Delete this folder? The renders inside it stay — they just become Unfiled.")) return;
    await client.from("render_folders").delete().eq("id", id);
    if (selected === id) { selected = "all"; try { localStorage.setItem(LS_KEY, "all"); } catch (x) {} }
    await loadFolders(); renderFolderBar(); loadRenders();
  }

  async function onDelete(btn) {
    var id = btn.getAttribute("data-id");
    if (!id) return;
    if (!window.confirm("Delete this render permanently? This removes the video file and can't be undone.")) return;
    btn.disabled = true; btn.textContent = "Deleting…";
    var ok = await deleteRender(id);
    if (ok) { if (typeof window.reloadRenderArchive === "function") window.reloadRenderArchive(); }
    else {
      btn.disabled = false; btn.textContent = "Delete";
      window.alert("Couldn't delete right now — the render service may be offline. Try again once it's running.");
    }
  }

  async function deleteRender(id) {
    try {
      var token = await getToken();
      if (!token) return false;
      var r = await fetch(RENDER_ENDPOINT + "/jobs/" + id, {
        method: "DELETE", headers: { "Authorization": "Bearer " + token }
      });
      return r.ok;
    } catch (e) { return false; }
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
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
})();

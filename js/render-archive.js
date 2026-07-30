// AI Resource Hub — render library (shared by AI Transitions & Motion Transfer).
// The render type + tool are read from a data attribute on the container, so the
// same code powers each tool's own separate, folder-organized library:
//   full page: <div id="archiveList" data-render-type="..." data-tool="...">
//   tool strip: <div class="render-archive-strip" data-render-type="..." data-tool="...">
//              inside a wrapper <div class="render-archive-wrap">

(function () {
  var RENDER_ENDPOINT = "https://render.airesourcehub.vip";
  var RECENT_LIMIT = 10;
  if (!window.supabase || typeof SUPABASE_URL === "undefined") return;

  var fullList = document.getElementById("archiveList");
  var folderBar = document.getElementById("folderBar");
  var strip = document.querySelector(".render-archive-strip");
  var wrap = strip ? strip.closest(".render-archive-wrap") : null;
  if (!fullList && !strip) return;

  var cfg = fullList || strip;
  var RENDER_TYPE = cfg.getAttribute("data-render-type") || "ai_transition";
  var TOOL = cfg.getAttribute("data-tool") || RENDER_TYPE;
  var LS_KEY = "render-folder-" + TOOL;

  var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  var user = null, folders = [], selected = "all";
  var CACHE_BUST = Date.now(); // refreshed each load so stale cached videos don't stick
  try { selected = localStorage.getItem(LS_KEY) || "all"; } catch (e) {}

  init();
  window.reloadRenderArchive = init;

  async function init() {
    CACHE_BUST = Date.now();
    ensureLightbox();
    var s = await client.auth.getSession();
    user = s.data.session ? s.data.session.user : null;
    await refresh();
    client.auth.onAuthStateChange(function (_e, sess) { user = sess ? sess.user : null; refresh(); });
    if (fullList) wire(fullList);
    if (strip) wire(strip);
    if (folderBar) wireFolderBar();
  }

  // ---- Shared "Expand" lightbox (larger centered popup, not fullscreen) ----
  function ensureLightbox() {
    if (document.getElementById("renderLightbox")) return;
    var ov = document.createElement("div");
    ov.id = "renderLightbox";
    ov.className = "render-lightbox";
    ov.innerHTML = '<div class="render-lightbox-inner"><button type="button" class="render-lightbox-close" aria-label="Close">&times;</button><video class="render-lightbox-video" controls playsinline></video></div>';
    document.body.appendChild(ov);
    ov.addEventListener("click", function (e) {
      if (e.target === ov || e.target.classList.contains("render-lightbox-close")) closeLightbox();
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeLightbox(); });
  }
  function closeLightbox() {
    var ov = document.getElementById("renderLightbox");
    if (!ov) return;
    var v = ov.querySelector("video");
    try { v.pause(); } catch (e) {}
    v.removeAttribute("src");
    try { v.load(); } catch (e) {}
    ov.classList.remove("open");
  }
  window.openRenderLightbox = function (src) {
    ensureLightbox();
    var ov = document.getElementById("renderLightbox");
    var v = ov.querySelector("video");
    v.src = src; ov.classList.add("open");
    try { v.play(); } catch (e) {}
  };

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
    var res = await client.from("render_folders").select("id,name")
      .eq("user_id", user.id).eq("tool", TOOL).order("created_at", { ascending: true });
    folders = res.data || [];
  }

  async function loadRenders() {
    var q = client.from("render_jobs")
      .select("id,status,mode,prompt,result_url,result_mov_url,created_at,folder_id")
      .eq("user_id", user.id).eq("render_type", RENDER_TYPE).eq("status", "done")
      .order("created_at", { ascending: false });
    if (strip && !fullList) q = q.limit(RECENT_LIMIT);

    var res = await q;
    if (res.error) { setMsg("Couldn't load your renders right now."); return; }
    var rows = (res.data || []).filter(function (r) { return r.result_url; });

    if (fullList) {
      if (selected === "unfiled") rows = rows.filter(function (r) { return !r.folder_id; });
      else if (selected !== "all") rows = rows.filter(function (r) { return r.folder_id === selected; });
    }
    if (!rows.length) {
      setMsg(fullList ? "Nothing in this view yet." : "No renders yet — your finished results will appear here automatically.");
      return;
    }
    var html = rows.map(card).join("");
    if (fullList) fullList.innerHTML = html;
    if (strip) strip.innerHTML = html;
    if (wrap) wrap.style.display = "";
  }

  function renderFolderBar() {
    if (!folderBar) return;
    var chips = [chip("all", "All"), chip("unfiled", "Unfiled")];
    folders.forEach(function (f) { chips.push(chip(f.id, f.name, true)); });
    folderBar.innerHTML = '<div class="folder-chips">' + chips.join("") +
      '</div><button type="button" class="btn btn-secondary btn-small" id="newFolderBtn">+ New folder</button>';
  }
  function chip(val, label, deletable) {
    return '<span class="folder-chip' + (selected === val ? " active" : "") + '" data-folder="' + esc(val) + '">' +
      esc(label) + (deletable ? '<button type="button" class="folder-del" data-delfolder="' + esc(val) + '" title="Delete folder">&times;</button>' : '') + '</span>';
  }

  function bust(url, key) {
    if (!url) return url;
    return url + (url.indexOf("?") >= 0 ? "&" : "?") + "v=" + key;
  }

  function card(r) {
    // Stable per-render key: the URL stays the same across reloads, so a video
    // that already loaded is served from cache instead of re-downloading (which
    // is what made finished renders flash blank for a while over the tunnel).
    var key = String(Date.parse(r.created_at) || r.id);
    var mp4 = bust(abs(r.result_url), key);
    var mov = r.result_mov_url ? bust(abs(r.result_mov_url), key) : null;
    var when = new Date(r.created_at).toLocaleString();
    var kind = r.mode === "motion_transfer" ? "Motion transfer"
             : r.mode === "music_sync" ? "Music sync"
             : r.mode === "stitched" ? "Full sequence" : "Transition only";
    var moveSel = "";
    if (fullList) {
      var opts = '<option value="">Unfiled</option>' + folders.map(function (f) {
        return '<option value="' + esc(f.id) + '"' + (r.folder_id === f.id ? " selected" : "") + '>' + esc(f.name) + '</option>';
      }).join("");
      moveSel = '<div class="archive-move-wrap"><select class="archive-move" data-id="' + esc(r.id) + '" title="Move to folder">' + opts + '</select></div>';
    }
    return '<div class="archive-card" data-card="' + esc(r.id) + '">' +
      '<video src="' + mp4 + '" controls preload="metadata" playsinline class="archive-video"></video>' +
      (r.prompt ? '<p class="archive-prompt">' + esc(r.prompt) + '</p>' : '') +
      '<p class="frame-res" style="margin:6px 0;">' + esc(when) + ' &middot; ' + kind + '</p>' + moveSel +
      '<div class="output-actions">' +
        '<button type="button" class="btn btn-secondary btn-small archive-expand" data-src="' + mp4 + '">&#10530; Expand</button>' +
        '<a class="btn btn-primary btn-small" href="' + mp4 + '" download>MP4</a>' +
        (mov ? '<a class="btn btn-secondary btn-small" href="' + mov + '" download>MOV</a>' : '') +
        '<button type="button" class="btn btn-danger btn-small archive-del" data-id="' + esc(r.id) + '">Delete</button>' +
      '</div></div>';
  }

  function wire(container) {
    if (container.dataset.wired) return;
    container.dataset.wired = "1";
    container.addEventListener("click", function (e) {
      var exp = e.target.closest(".archive-expand");
      if (exp) { window.openRenderLightbox(exp.getAttribute("data-src")); return; }
      var del = e.target.closest(".archive-del");
      if (del) return onDelete(del);
    });
    container.addEventListener("change", async function (e) {
      var sel = e.target.closest(".archive-move");
      if (!sel) return;
      await client.from("render_jobs").update({ folder_id: sel.value || null }).eq("id", sel.getAttribute("data-id"));
      loadRenders();
    });
  }

  function wireFolderBar() {
    folderBar.addEventListener("click", function (e) {
      var fc = e.target.closest("[data-folder]");
      if (fc && !e.target.closest(".folder-del")) {
        selected = fc.getAttribute("data-folder");
        try { localStorage.setItem(LS_KEY, selected); } catch (x) {}
        renderFolderBar(); loadRenders(); return;
      }
      var df = e.target.closest("[data-delfolder]");
      if (df) return onDeleteFolder(df.getAttribute("data-delfolder"));
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
    if (!id || !window.confirm("Delete this render permanently? This removes the video file and can't be undone.")) return;
    btn.disabled = true; btn.textContent = "Deleting…";
    var ok = await deleteRender(id);
    if (ok) { if (typeof window.reloadRenderArchive === "function") window.reloadRenderArchive(); }
    else { btn.disabled = false; btn.textContent = "Delete"; window.alert("Couldn't delete right now — the render service may be offline."); }
  }
  async function deleteRender(id) {
    try {
      var token = await getToken();
      if (!token) return false;
      var r = await fetch(RENDER_ENDPOINT + "/jobs/" + id, { method: "DELETE", headers: { "Authorization": "Bearer " + token } });
      return r.ok;
    } catch (e) { return false; }
  }

  function abs(u) {
    if (!u) return u;
    return /^https?:\/\//i.test(u) ? u : RENDER_ENDPOINT + (u.charAt(0) === "/" ? "" : "/") + u;
  }
  function setMsg(msg) {
    var t = fullList || strip;
    if (t) t.innerHTML = '<p class="model-note">' + esc(msg) + '</p>';
    if (wrap && fullList == null) {
      wrap.style.display = (msg.indexOf("No renders yet") === 0 || msg.indexOf("Log in") === 0) ? "none" : "";
    }
  }
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
})();

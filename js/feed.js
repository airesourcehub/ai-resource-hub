// AI Resource Hub — home page community feed. Shows ONLY generations their owners switched to Public
// (database function public_feed). Everything else stays private to its owner.
(function () {
  if (!window.supabase || typeof SUPABASE_URL === "undefined") return;
  var grid = document.getElementById("feedGrid");
  if (!grid) return;
  var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  var HUB = "https://render.airesourcehub.vip";
  var PAGE = 36;
  var st = { kind: "all", before: null, rows: [], busy: false };
  var MODEL = { flux2: "FLUX.2", flux2_edit: "FLUX.2 Edit", zimage: "Z-Image Turbo", qwen2512: "Qwen-Image 2512", qwen_edit2509: "Qwen Edit 2509", krea2: "Krea 2",
    hidream: "HiDream", motion_transfer: "Motion Transfer", ai_transition: "AI Transition", lipsync: "Lip Sync" };
  var MODE = { motion_transfer: "Motion Transfer", character_swap: "Character Swap", character_scene: "Character Scene", upscale_1080: "Upscaled video",
    stitched: "AI Transition", transform: "AI Transition", music_sync: "Beat-synced edit", lipsync: "Lip Sync", wan_video: "WAN Video" };

  function abs(u) { if (!u) return ""; return /^https?:\/\//i.test(u) ? u : HUB + (u.charAt(0) === "/" ? "" : "/") + u; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function label(r) { return r.kind === "video" ? (MODE[r.mode] || "Video") : (MODEL[r.model] || r.model || "Image"); }
  function recreate(r) {
    if (r.kind === "image") return "image-studio.html?" + new URLSearchParams({ prompt: r.prompt || "", model: r.model || "" }).toString();
    if (/motion|swap|scene/.test(r.mode || "")) return "motion-transfer.html";
    if (r.mode === "lipsync") return "lip-sync.html";
    return "video.html";
  }

  async function load(reset) {
    if (st.busy) return; st.busy = true;
    if (reset) { st.before = null; st.rows = []; grid.innerHTML = ""; }
    var more = document.getElementById("feedMore");
    more.disabled = true;
    var r = await client.rpc("public_feed", { p_kind: st.kind, p_before: st.before, p_limit: PAGE });
    st.busy = false; more.disabled = false;
    if (r.error) { if (!st.rows.length) { document.getElementById("feedEmpty").textContent = "The feed couldn’t load right now."; document.getElementById("feedEmpty").hidden = false; } return; }
    var rows = r.data || [];
    rows.forEach(function (row) { st.rows.push(row); grid.insertAdjacentHTML("beforeend", tile(row, st.rows.length - 1)); });
    if (rows.length) st.before = rows[rows.length - 1].published_at;
    document.getElementById("feedEmpty").hidden = st.rows.length > 0;
    more.hidden = rows.length < PAGE;
    watchVideos();
  }

  function tile(r, i) {
    var u = abs((r.urls || [])[0]);
    var ar = r.width && r.height ? r.width + " / " + r.height : (r.kind === "video" ? "9 / 16" : "1 / 1");
    var media = r.kind === "video"
      ? '<video muted loop playsinline preload="none" data-src="' + esc(u) + '"></video><span class="feed-play" aria-hidden="true"></span>'
      : '<img loading="lazy" alt="' + esc((r.prompt || "AI image").slice(0, 120)) + '" src="' + esc(u) + '" />';
    var count = r.kind === "image" && (r.urls || []).length > 1 ? '<span class="feed-count">' + r.urls.length + "</span>" : "";
    return '<button type="button" class="feed-tile" data-i="' + i + '" style="aspect-ratio:' + ar + '">' + media + count +
      '<span class="feed-meta"><span class="feed-who">' + (r.avatar ? '<img alt="" src="' + esc(r.avatar) + '" />' : "") + esc(r.creator) + "</span><span>" + esc(label(r)) + "</span></span></button>";
  }

  // Videos play silently while on screen, like a social feed.
  var io = "IntersectionObserver" in window ? new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      var v = e.target;
      if (e.isIntersecting) { if (!v.src) v.src = v.getAttribute("data-src"); var p = v.play(); if (p && p.catch) p.catch(function () {}); }
      else v.pause();
    });
  }, { rootMargin: "200px 0px", threshold: 0.25 }) : null;
  function watchVideos() {
    Array.prototype.forEach.call(grid.querySelectorAll("video:not([data-w])"), function (v) {
      v.setAttribute("data-w", "1");
      if (io) io.observe(v); else v.src = v.getAttribute("data-src");
    });
  }
  grid.addEventListener("error", function (e) {
    var t = e.target.closest && e.target.closest(".feed-tile");
    if (t && (e.target.tagName === "IMG" || e.target.tagName === "VIDEO")) t.classList.add("is-missing");
  }, true);

  // ---- viewer
  var box = null, cur = -1;
  function open(i) {
    var r = st.rows[i]; if (!r) return; cur = i;
    if (!box) {
      box = document.createElement("div"); box.className = "feed-box"; box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true");
      box.innerHTML = '<div class="feed-box-in"><button type="button" class="feed-x" aria-label="Close">&times;</button><div class="feed-box-media"></div>' +
        '<aside class="feed-box-side"><div class="feed-box-who"></div><span class="feed-box-tag"></span><p class="feed-box-prompt"></p>' +
        '<div class="feed-box-acts"><a class="btn btn-primary feed-re">Recreate</a><button type="button" class="btn btn-secondary feed-copy">Copy prompt</button></div>' +
        '<div class="feed-box-nav"><button type="button" class="btn btn-secondary" data-step="-1" aria-label="Previous">&#8592;</button><button type="button" class="btn btn-secondary" data-step="1" aria-label="Next">&#8594;</button></div></aside></div>';
      document.body.appendChild(box);
      box.addEventListener("click", function (e) {
        if (e.target === box || e.target.closest(".feed-x")) return close();
        var s = e.target.closest("[data-step]"); if (s) return open(Math.max(0, Math.min(st.rows.length - 1, cur + +s.getAttribute("data-step"))));
        if (e.target.closest(".feed-copy")) { try { navigator.clipboard.writeText(st.rows[cur].prompt || ""); e.target.textContent = "Copied"; } catch (x) {} }
      });
      document.addEventListener("keydown", function (e) {
        if (!box || box.hidden) return;
        if (e.key === "Escape") close();
        if (e.key === "ArrowRight") open(Math.min(st.rows.length - 1, cur + 1));
        if (e.key === "ArrowLeft") open(Math.max(0, cur - 1));
      });
    }
    var m = box.querySelector(".feed-box-media");
    m.innerHTML = r.kind === "video"
      ? '<video controls autoplay loop playsinline src="' + esc(abs(r.urls[0])) + '"></video>'
      : (r.urls || []).map(function (u) { return '<img alt="" src="' + esc(abs(u)) + '" />'; }).join("");
    box.querySelector(".feed-box-who").innerHTML = (r.avatar ? '<img alt="" src="' + esc(r.avatar) + '" />' : "") + "<strong>" + esc(r.creator) + "</strong><small>" + new Date(r.published_at).toLocaleDateString() + "</small>";
    box.querySelector(".feed-box-tag").textContent = label(r);
    box.querySelector(".feed-box-prompt").textContent = r.prompt || "";
    box.querySelector(".feed-copy").textContent = "Copy prompt";
    box.querySelector(".feed-copy").hidden = !r.prompt;
    box.querySelector(".feed-re").href = recreate(r);
    box.querySelector(".feed-re").textContent = r.kind === "image" ? "Recreate in Image Studio" : "Make one like this";
    box.hidden = false; document.body.style.overflow = "hidden";
    box.querySelector(".feed-x").focus();
  }
  function close() { if (!box) return; box.hidden = true; document.body.style.overflow = ""; var v = box.querySelector("video"); if (v) v.pause(); }
  grid.addEventListener("click", function (e) { var t = e.target.closest(".feed-tile"); if (t) open(+t.getAttribute("data-i")); });

  document.querySelector(".feed-filter").addEventListener("click", function (e) {
    var b = e.target.closest("[data-k]"); if (!b || b.getAttribute("data-k") === st.kind) return;
    st.kind = b.getAttribute("data-k");
    Array.prototype.forEach.call(this.querySelectorAll("[data-k]"), function (x) { var on = x === b; x.classList.toggle("is-on", on); x.setAttribute("aria-selected", on ? "true" : "false"); });
    load(true);
  });
  document.getElementById("feedMore").addEventListener("click", function () { load(false); });
  load(true);
})();

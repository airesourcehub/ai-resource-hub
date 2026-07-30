// AI Resource Hub — My Activity.
// A personal, chronological log of everything the signed-in user has done:
// images (image_jobs), videos (render_jobs), LoRAs (training_jobs), and page
// visits (analytics_events). RLS ensures each user only sees their own rows.

(function () {
  if (!window.supabase || typeof SUPABASE_URL === "undefined") return;
  var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  var gate = document.getElementById("actGate");
  var body = document.getElementById("actBody");
  var listEl = document.getElementById("actList");
  var filterEl = document.getElementById("actFilter");
  if (!listEl) return;

  var user = null, items = [];

  init();

  async function init() {
    var s = await client.auth.getSession();
    user = s.data.session ? s.data.session.user : null;
    client.auth.onAuthStateChange(function (_e, sess) { user = sess ? sess.user : null; boot(); });
    boot();
    if (filterEl) filterEl.addEventListener("change", draw);
  }

  function boot() {
    if (!user) {
      gate.innerHTML = 'Please <a href="auth.html">log in</a> to see your activity.';
      gate.classList.add("show"); gate.style.display = ""; body.style.display = "none";
      return;
    }
    gate.style.display = "none"; gate.classList.remove("show"); body.style.display = "";
    load();
  }

  var VIDEO_LABELS = {
    ai_transition: "AI Transition", blend: "AI Transition", music_sync: "Music Sync Transition",
    motion_transfer: "Motion Transfer", lipsync: "Lip Sync", wan_video: "WAN Video"
  };

  async function load() {
    listEl.innerHTML = '<p class="model-note">Loading your activity…</p>';
    var uid = user.id;
    var res = await Promise.all([
      client.from("image_jobs").select("id,model,prompt,status,created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(200),
      client.from("render_jobs").select("id,render_type,mode,prompt,status,created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(200),
      client.from("training_jobs").select("id,name,base,trigger_word,status,created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(200),
      client.from("analytics_events").select("id,path,ip,city,country,created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(300)
    ]);

    var images = (res[0].data || []).map(function (r) {
      return { t: r.created_at, cat: "image", icon: "🖼️", title: "Image — " + (r.model || "model"),
               sub: r.prompt || "", status: r.status };
    });
    var videos = (res[1].data || []).map(function (r) {
      return { t: r.created_at, cat: "video", icon: "🎬", title: (VIDEO_LABELS[r.render_type] || r.render_type || "Video"),
               sub: r.prompt || "", status: r.status };
    });
    var loras = (res[2].data || []).map(function (r) {
      return { t: r.created_at, cat: "lora", icon: "🧬", title: "LoRA — " + (r.name || "") + " (" + (r.base || "flux") + ")",
               sub: r.trigger_word ? ("trigger: " + r.trigger_word) : "", status: r.status };
    });
    var visits = (res[3].data || []).map(function (r) {
      var loc = [r.city, r.country].filter(Boolean).join(", ");
      return { t: r.created_at, cat: "visit", icon: "👁️", title: "Visited " + (r.path || "/"),
               sub: [loc, r.ip].filter(Boolean).join(" · "), status: null };
    });

    document.getElementById("chipImages").textContent = "Images: " + images.length;
    document.getElementById("chipVideos").textContent = "Videos: " + videos.length;
    document.getElementById("chipLoras").textContent = "LoRAs: " + loras.length;
    document.getElementById("chipVisits").textContent = "Page visits: " + visits.length;

    items = images.concat(videos).concat(loras).concat(visits)
      .sort(function (a, b) { return (Date.parse(b.t) || 0) - (Date.parse(a.t) || 0); });
    draw();
  }

  function draw() {
    var f = filterEl ? filterEl.value : "all";
    var rows = items.filter(function (it) {
      if (f === "creations") return it.cat !== "visit";
      if (f === "visits") return it.cat === "visit";
      return true;
    });
    if (!rows.length) { listEl.innerHTML = '<p class="admin-empty">Nothing here yet.</p>'; return; }
    listEl.innerHTML = rows.map(function (it) {
      var badge = it.status ? '<span class="tag' + (it.status === "done" ? "" : " private") + '">' + esc(it.status) + '</span>' : "";
      return '<div class="admin-row"><div class="admin-row-main">' +
        '<strong>' + it.icon + ' ' + esc(it.title) + '</strong> ' + badge +
        (it.sub ? '<span class="admin-row-meta">' + esc(trunc(it.sub, 90)) + '</span>' : '') +
        '<span class="admin-row-meta">' + fmt(it.t) + '</span>' +
        '</div></div>';
    }).join("");
  }

  function fmt(iso) { try { return new Date(iso).toLocaleString(); } catch (e) { return ""; } }
  function trunc(s, n) { s = String(s || ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
})();

// AI Resource Hub — My Images (full gallery for the Image Studio).
(function () {
  var RENDER_ENDPOINT = "https://render.airesourcehub.vip";
  if (!window.supabase || typeof SUPABASE_URL === "undefined") return;
  var host = document.getElementById("imageGalleryList");
  if (!host) return;
  var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  var user = null;

  init();
  async function init() {
    var s = await client.auth.getSession();
    user = s.data.session ? s.data.session.user : null;
    client.auth.onAuthStateChange(function (_e, sess) { user = sess ? sess.user : null; load(); });
    load();
  }

  async function load() {
    if (!user) { host.innerHTML = '<p class="model-note">Please <a href="auth.html">log in</a> to see your images.</p>'; return; }
    var res = await client.from("image_jobs").select("id, model, prompt, urls, created_at")
      .eq("user_id", user.id).eq("status", "done").order("created_at", { ascending: false }).limit(200);
    if (res.error) { host.innerHTML = '<p class="model-note">Couldn’t load your images.</p>'; return; }
    var rows = res.data || [];
    if (!rows.length) { host.innerHTML = '<p class="model-note">No images yet — head to the Image Studio to make some.</p>'; return; }
    var cells = [];
    rows.forEach(function (row) {
      (row.urls || []).forEach(function (u, i) {
        cells.push(cell(absUrl(u), row.id, i === 0));
      });
    });
    host.innerHTML = cells.join("");
    wire();
  }

  function cell(url, jobId, allowDelete) {
    return '<div class="image-cell-wrap">' +
      '<a class="image-cell" href="' + url + '" download data-src="' + url + '"><img loading="lazy" src="' + url + '" alt="Generated image" /></a>' +
      (allowDelete ? '<button class="image-del" data-job="' + jobId + '" title="Delete">&times;</button>' : '') +
    '</div>';
  }

  function wire() {
    Array.prototype.forEach.call(host.querySelectorAll(".image-cell"), function (a) {
      a.addEventListener("click", function (e) { e.preventDefault(); lightbox(a.getAttribute("data-src")); });
    });
    Array.prototype.forEach.call(host.querySelectorAll(".image-del"), function (b) {
      b.addEventListener("click", function () { del(b.getAttribute("data-job")); });
    });
  }

  async function del(jobId) {
    if (!window.confirm("Delete this image (and its batch) permanently?")) return;
    try {
      var token = (await client.auth.getSession()).data.session.access_token;
      await fetch(RENDER_ENDPOINT + "/jobs/" + jobId + "?table=image_jobs", { method: "DELETE", headers: { "Authorization": "Bearer " + token } });
    } catch (e) {}
    // Fallback: remove the row directly (RLS lets users delete their own).
    try { await client.from("image_jobs").delete().eq("id", jobId); } catch (e) {}
    load();
  }

  function lightbox(src) {
    var lb = document.getElementById("imgLightbox");
    if (!lb) {
      lb = document.createElement("div"); lb.id = "imgLightbox"; lb.className = "render-lightbox";
      lb.innerHTML = '<div class="render-lightbox-inner"><button class="render-lightbox-close" aria-label="Close">&times;</button><img /><a class="btn btn-primary render-lightbox-dl" download>Download</a></div>';
      document.body.appendChild(lb);
      lb.addEventListener("click", function (e) { if (e.target === lb || e.target.className === "render-lightbox-close") lb.style.display = "none"; });
    }
    lb.querySelector("img").src = src;
    lb.querySelector(".render-lightbox-dl").href = src;
    lb.style.display = "flex";
  }

  function absUrl(u) { if (!u) return u; return /^https?:\/\//i.test(u) ? u : RENDER_ENDPOINT + (u.charAt(0) === "/" ? "" : "/") + u; }
})();

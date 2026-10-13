// AI Resource Hub — homepage behavior
// 1. Fills "Made by the community" with public Prompt Gallery posts.
// 2. Puts the most-liked public video at the front of the spotlight rail.
// 3. Hover/focus plays video tiles (autoplays in view on touch screens).
// 4. Arrow buttons scroll the spotlight rail.

document.addEventListener("DOMContentLoaded", function () {
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var canHover = window.matchMedia && window.matchMedia("(hover: hover)").matches;

  // ---------- Rail arrows ----------
  document.querySelectorAll(".rail-btn").forEach(function (btn) {
    var track = document.getElementById(btn.getAttribute("data-rail"));
    if (!track) return;
    btn.addEventListener("click", function () {
      var dir = Number(btn.getAttribute("data-dir")) || 1;
      track.scrollBy({ left: dir * track.clientWidth * 0.8, behavior: reduceMotion ? "auto" : "smooth" });
    });
    function sync() {
      var dir = Number(btn.getAttribute("data-dir"));
      var max = track.scrollWidth - track.clientWidth - 2;
      btn.disabled = dir < 0 ? track.scrollLeft <= 2 : track.scrollLeft >= max;
    }
    track.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);
    sync();
  });

  // ---------- Video tiles ----------
  var observer = null;
  if (!canHover && !reduceMotion && "IntersectionObserver" in window) {
    observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        var v = e.target;
        if (e.isIntersecting) { safePlay(v); } else { v.pause(); }
      });
    }, { threshold: 0.6 });
  }

  function safePlay(video) {
    if (!video.getAttribute("src")) video.setAttribute("src", video.getAttribute("data-src"));
    var p = video.play();
    if (p && p.catch) p.catch(function () {});
  }

  function wireVideo(tile) {
    var video = tile.querySelector("video");
    if (!video) return;
    if (observer) { observer.observe(video); return; }
    if (reduceMotion) return;
    function start() { safePlay(video); }
    function stop() { video.pause(); }
    tile.addEventListener("mouseenter", start);
    tile.addEventListener("focus", start);
    tile.addEventListener("mouseleave", stop);
    tile.addEventListener("blur", stop);
  }

  function esc(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function mediaHtml(item) {
    var isVideo = item.media_type === "video";
    var poster = item.cover_url || (isVideo ? "" : item.image_url);
    if (isVideo) {
      return '<div class="tile-media">' +
        (poster ? '<img src="' + esc(poster) + '" alt="" loading="lazy" />' : "") +
        '<video muted loop playsinline preload="none" data-src="' + esc(item.image_url) + '"' +
        (poster ? ' poster="' + esc(poster) + '"' : "") + "></video></div>" +
        '<span class="tile-play" aria-hidden="true">&#9654;</span>';
    }
    return '<div class="tile-media"><img src="' + esc(item.image_url) + '" alt="" loading="lazy" /></div>';
  }

  function tileFor(item, extraDesc) {
    var a = document.createElement("a");
    a.className = "tile";
    a.href = "gallery.html";
    a.setAttribute("aria-label", (item.title || "Community post") + " — open the Prompt Gallery");
    a.innerHTML = mediaHtml(item) +
      '<div class="tile-body"><h3 class="tile-title">' + esc(item.title || "Untitled") + "</h3>" +
      (extraDesc ? '<p class="tile-desc">' + esc(extraDesc) + "</p>" : "") + "</div>";
    // When a video is showing, hide the still poster image under it
    var vid = a.querySelector("video");
    if (vid) {
      vid.addEventListener("playing", function () { var img = a.querySelector(".tile-media img"); if (img) img.style.opacity = "0"; });
    }
    return a;
  }

  // ---------- Community data ----------
  var strip = document.getElementById("communityStrip");
  var block = document.getElementById("community-block");

  var ready = typeof SUPABASE_URL !== "undefined" && typeof window.supabase !== "undefined" &&
    SUPABASE_URL.indexOf("YOUR_SUPABASE") === -1;

  if (!ready) {
    if (block) block.hidden = true;
    return;
  }

  var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  Promise.resolve(client.from(SUPABASE_TABLE)
    .select("id, title, media_type, image_url, cover_url, likes_count, created_at, is_removed")
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .limit(16))
    .then(function (res) {
      var items = (res.data || []).filter(function (r) { return !r.is_removed && r.image_url; });

      if (!items.length) {
        strip.innerHTML = '<div class="community-empty">Nothing posted yet. <a href="gallery.html">Share the first one</a> with the prompt you used.</div>';
        return;
      }

      strip.innerHTML = "";
      items.forEach(function (item) {
        var t = tileFor(item);
        strip.appendChild(t);
        wireVideo(t);
      });

      // Spotlight: the most-liked public video leads the hero rail
      var videos = items.filter(function (r) { return r.media_type === "video"; });
      if (videos.length) {
        videos.sort(function (a, b) { return (b.likes_count || 0) - (a.likes_count || 0); });
        var rail = document.getElementById("spotlightRail");
        var lead = tileFor(videos[0], "From the community. Open the gallery to see the prompt behind it.");
        rail.insertBefore(lead, rail.firstChild);
        rail.scrollLeft = 0;
        wireVideo(lead);
        rail.dispatchEvent(new Event("scroll"));
      }
    })
    .catch(function () {
      if (block) block.hidden = true;
    });
});

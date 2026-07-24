// AI Resource Hub — Gallery logic (Supabase for accounts/data; the actual
// photo/video files live on the site owner's Synology NAS, served through a
// Cloudflare Tunnel).
// Upload a photo or video + prompt + hashtags, choose public/private, and
// search/browse past prompts by keyword or hashtag. Posting requires login;
// browsing/searching public entries does not. Files are uploaded from the
// browser to the NAS upload service (which verifies the user's login first);
// the returned URL is then saved to Supabase alongside the prompt/tags/etc.
// If the NAS is down, only the Gallery is affected — the rest of the site
// (which doesn't depend on it) keeps working.
//
// Older entries created before this migration still point at Cloudinary URLs;
// those keep working untouched. Only new uploads go to the NAS.

// Where the NAS upload service answers (Cloudflare Tunnel hostname).
var NAS_GALLERY_BASE = "https://gallery.airesourcehub.vip";

var NAS_IMAGE_MAX_BYTES = 50 * 1024 * 1024;  // 50MB — matches the NAS service
var NAS_VIDEO_MAX_BYTES = 200 * 1024 * 1024; // 200MB — matches the NAS service

// Shared by the main upload form and the in-comment remix uploader.
function classifyMedia(file) {
  var mediaType = file.type.indexOf("video") === 0 ? "video" : "image";
  var maxBytes = mediaType === "video" ? NAS_VIDEO_MAX_BYTES : NAS_IMAGE_MAX_BYTES;
  return { mediaType: mediaType, maxBytes: maxBytes, tooLarge: file.size > maxBytes };
}

function parseTags(raw) {
  return raw
    .split(/[\s,]+/)
    .map(function (t) { return t.replace(/^#/, "").toLowerCase().trim(); })
    .filter(Boolean);
}

// Builds a still-frame JPG URL for a given second offset into a Cloudinary
// video, used when someone picks a custom cover frame from the timeline
// instead of relying on the frame-0 default.
function buildFramePosterUrl(publicId, offsetSeconds) {
  var offset = Math.max(0, Math.round((offsetSeconds || 0) * 10) / 10);
  return "https://res.cloudinary.com/" + CLOUDINARY_CLOUD_NAME + "/video/upload/so_" + offset + "/" + publicId + ".jpg";
}

// Powers the "cover thumbnail" picker attached to any video upload (main
// upload form, in-comment remix form, and the edit form for existing
// posts): either scrub a slider to pick a frame off the video's timeline,
// or upload a completely separate photo to use as the thumbnail instead.
//
// opts: {
//   modeBtns: [button elements with data-cover-mode="frame"|"photo"],
//   frameMode: element wrapping the slider,
//   photoMode: element wrapping the photo file input,
//   slider: the range input,
//   photoInput: the cover photo file input,
//   photoPreviewImg: img element showing the chosen cover photo,
//   resetBtn: optional — only present in the edit form
// }
function setupCoverPicker(opts) {
  var mode = "frame";
  var changed = false;
  var resetRequested = false;
  var boundVideoEl = null;

  function setMode(newMode) {
    mode = newMode;
    opts.modeBtns.forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-cover-mode") === newMode);
    });
    opts.frameMode.style.display = newMode === "frame" ? "" : "none";
    opts.photoMode.style.display = newMode === "photo" ? "" : "none";
  }

  opts.modeBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      setMode(btn.getAttribute("data-cover-mode"));
    });
  });

  opts.slider.addEventListener("input", function () {
    changed = true;
    resetRequested = false;
    if (boundVideoEl) boundVideoEl.currentTime = parseFloat(opts.slider.value) || 0;
  });

  if (opts.photoInput && opts.photoPreviewImg) {
    opts.photoInput.addEventListener("change", function () {
      var file = opts.photoInput.files[0];
      if (!file) return;
      changed = true;
      resetRequested = false;
      opts.photoPreviewImg.src = URL.createObjectURL(file);
      opts.photoPreviewImg.classList.add("show");
    });
  }

  if (opts.resetBtn) {
    opts.resetBtn.addEventListener("click", function () {
      changed = true;
      resetRequested = true;
      setMode("frame");
      opts.slider.value = 0;
      if (boundVideoEl) boundVideoEl.currentTime = 0;
      if (opts.photoInput) opts.photoInput.value = "";
      if (opts.photoPreviewImg) { opts.photoPreviewImg.classList.remove("show"); opts.photoPreviewImg.removeAttribute("src"); }
    });
  }

  return {
    // Ties the slider to a <video> element for live scrubbing preview.
    // Used both for a freshly-selected local file (upload/remix forms) and
    // for the already-hosted lightbox video (edit form).
    bindVideo: function (videoEl) {
      boundVideoEl = videoEl;
      if (!videoEl) return;
      function trySetMax() {
        if (isFinite(videoEl.duration) && videoEl.duration > 0) {
          opts.slider.max = videoEl.duration;
        }
      }
      trySetMax();
      videoEl.addEventListener("loadedmetadata", trySetMax);
    },
    // Full reset for one-shot forms (upload, remix) after submit/cancel.
    reset: function () {
      changed = false;
      resetRequested = false;
      setMode("frame");
      opts.slider.value = 0;
      opts.slider.max = 0;
      if (opts.photoInput) opts.photoInput.value = "";
      if (opts.photoPreviewImg) { opts.photoPreviewImg.classList.remove("show"); opts.photoPreviewImg.removeAttribute("src"); }
    },
    // Lighter reset for the edit form: clears the picker's state without
    // zeroing the slider's max, since the bound lightbox video may not
    // re-fire loadedmetadata if the same item is being edited again.
    beginEditing: function () {
      changed = false;
      resetRequested = false;
      setMode("frame");
      opts.slider.value = 0;
      if (opts.photoInput) opts.photoInput.value = "";
      if (opts.photoPreviewImg) { opts.photoPreviewImg.classList.remove("show"); opts.photoPreviewImg.removeAttribute("src"); }
      if (boundVideoEl && isFinite(boundVideoEl.duration) && boundVideoEl.duration > 0) {
        opts.slider.max = boundVideoEl.duration;
      }
    },
    getMode: function () { return mode; },
    getFrameOffset: function () { return parseFloat(opts.slider.value) || 0; },
    getPhotoFile: function () { return opts.photoInput && opts.photoInput.files[0] ? opts.photoInput.files[0] : null; },
    hasChanged: function () { return changed; },
    isResetRequested: function () { return resetRequested; }
  };
}

// Uploads one file to the NAS service. Requires the visitor's Supabase access
// token (the service rejects anyone who isn't a logged-in user). Returns a
// Cloudinary-shaped object so the rest of the code didn't need rewiring:
//   { secure_url, public_id, kind }
function uploadToNas(file, token) {
  var formData = new FormData();
  formData.append("file", file);

  return fetch(NAS_GALLERY_BASE + "/upload", {
    method: "POST",
    headers: { "Authorization": "Bearer " + (token || "") },
    body: formData
  }).then(function (res) {
    return res.json().catch(function () { return {}; }).then(function (data) {
      if (!res.ok) {
        throw new Error(data.error || "Upload to the gallery server failed.");
      }
      return { secure_url: data.url, public_id: data.id || null, kind: data.kind };
    });
  });
}

// Grab a still JPEG (as a Blob) from an already-loaded, same-origin <video>
// element — used for the local preview videos in the upload/remix forms. Since
// the NAS service doesn't render its own video thumbnails, the browser makes
// one and uploads it as a normal image to serve as the cover.
function captureFrameBlobFromVideoEl(videoEl, offsetSeconds) {
  return new Promise(function (resolve, reject) {
    if (!videoEl || !videoEl.src) return reject(new Error("no video"));
    var wanted = Math.max(0, offsetSeconds || 0);
    var done = false;
    function grab() {
      if (done) return; done = true;
      try {
        var w = videoEl.videoWidth, h = videoEl.videoHeight;
        if (!w || !h) return reject(new Error("video not ready"));
        var c = document.createElement("canvas");
        c.width = w; c.height = h;
        c.getContext("2d").drawImage(videoEl, 0, 0, w, h);
        c.toBlob(function (blob) { blob ? resolve(blob) : reject(new Error("no blob")); }, "image/jpeg", 0.85);
      } catch (e) { reject(e); }
    }
    function onSeeked() { videoEl.removeEventListener("seeked", onSeeked); grab(); }
    if (videoEl.readyState >= 2 && Math.abs((videoEl.currentTime || 0) - wanted) < 0.05) {
      grab();
    } else {
      videoEl.addEventListener("seeked", onSeeked);
      try { videoEl.currentTime = wanted; } catch (e) { videoEl.removeEventListener("seeked", onSeeked); grab(); }
      setTimeout(function () { if (!done) { videoEl.removeEventListener("seeked", onSeeked); grab(); } }, 3000);
    }
  });
}

// Same idea, but loads a remote video URL fresh (with CORS) to capture a frame
// — used by the edit form, where the video is already hosted on the NAS. The
// NAS serves files with Access-Control-Allow-Origin: * so the canvas stays
// untainted; if a source doesn't allow it, this rejects and the caller leaves
// the existing cover alone.
function captureFrameBlobFromSrc(src, offsetSeconds) {
  return new Promise(function (resolve, reject) {
    var v = document.createElement("video");
    v.crossOrigin = "anonymous";
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    var done = false;
    function fail(e) { if (done) return; done = true; reject(e || new Error("capture failed")); }
    function grab() {
      if (done) return;
      try {
        var w = v.videoWidth, h = v.videoHeight;
        if (!w || !h) return fail(new Error("video not ready"));
        var c = document.createElement("canvas");
        c.width = w; c.height = h;
        c.getContext("2d").drawImage(v, 0, 0, w, h);
        c.toBlob(function (blob) {
          done = true;
          if (blob) resolve(blob); else reject(new Error("no blob"));
        }, "image/jpeg", 0.85);
      } catch (e) { fail(e); }
    }
    v.addEventListener("error", function () { fail(new Error("video load error")); });
    v.addEventListener("seeked", grab);
    v.addEventListener("loadeddata", function () {
      try { v.currentTime = Math.max(0, offsetSeconds || 0); } catch (e) { grab(); }
    });
    setTimeout(function () { fail(new Error("capture timeout")); }, 15000);
    v.src = src;
  });
}

// Works out the cover_url for a NEW video (upload/remix forms). "photo" mode
// uploads the chosen still; otherwise it grabs the scrubbed frame (default 0)
// from the local preview video. Returns null if capture fails (rare) — the
// video just won't have a poster thumbnail.
function coverForLocalVideo(picker, previewVideoEl, token) {
  if (picker.getMode() === "photo" && picker.getPhotoFile()) {
    return uploadToNas(picker.getPhotoFile(), token).then(function (r) { return r.secure_url; });
  }
  return captureFrameBlobFromVideoEl(previewVideoEl, picker.getFrameOffset())
    .then(function (blob) {
      var f = new File([blob], "cover.jpg", { type: "image/jpeg" });
      return uploadToNas(f, token).then(function (r) { return r.secure_url; });
    })
    .catch(function (e) { console.warn("cover frame capture failed", e); return null; });
}

// Works out the cover_url when EDITING an existing video's cover. Returns
// { set: true, url } to apply a change, or { set: false } to leave the current
// cover untouched (e.g. if grabbing a frame off the remote video failed).
function coverForEditVideo(picker, remoteSrc, token) {
  if (picker.isResetRequested()) return Promise.resolve({ set: true, url: null });
  if (picker.getMode() === "photo" && picker.getPhotoFile()) {
    return uploadToNas(picker.getPhotoFile(), token).then(function (r) { return { set: true, url: r.secure_url }; });
  }
  return captureFrameBlobFromSrc(remoteSrc, picker.getFrameOffset())
    .then(function (blob) {
      var f = new File([blob], "cover.jpg", { type: "image/jpeg" });
      return uploadToNas(f, token).then(function (r) { return { set: true, url: r.secure_url }; });
    })
    .catch(function (e) { console.warn("edit cover capture failed", e); return { set: false }; });
}

document.addEventListener("DOMContentLoaded", function () {
  var isConfigured = typeof SUPABASE_URL !== "undefined" &&
    SUPABASE_URL.indexOf("YOUR_SUPABASE") === -1 &&
    SUPABASE_ANON_KEY.indexOf("YOUR_SUPABASE") === -1;

  var setupBanner = document.getElementById("setupBanner");
  var authRequiredBanner = document.getElementById("authRequiredBanner");
  var uploadCard = document.getElementById("uploadCard");
  var galleryGrid = document.getElementById("galleryGrid");
  var emptyState = document.getElementById("emptyState");
  var searchInput = document.getElementById("gallerySearch");
  var sortSelect = document.getElementById("gallerySort");
  var galleryToolbar = document.getElementById("galleryToolbar");
  var openUploadBtn = document.getElementById("openUploadBtn");
  var uploadModalOverlay = document.getElementById("uploadModalOverlay");
  var uploadModalClose = document.getElementById("uploadModalClose");

  if (!isConfigured) {
    if (setupBanner) setupBanner.classList.add("show");
    if (galleryToolbar) galleryToolbar.style.display = "none";
    if (galleryGrid) galleryGrid.style.display = "none";
    if (emptyState) {
      emptyState.style.display = "block";
      emptyState.innerHTML = "Gallery backend isn't connected yet. See the README for a 5-minute Supabase setup — once configured, your uploaded prompts, photos, and videos will appear here.";
    }
    return;
  }

  var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // The NAS upload service needs the logged-in user's access token to accept a
  // file. This pulls the current one from the active Supabase session.
  async function getAccessToken() {
    var r = await client.auth.getSession();
    return r.data.session ? r.data.session.access_token : null;
  }

  var allItems = [];
  var currentUser = null;
  var likedIds = {}; // gallery_id -> true, for the current user
  var activeHoverPopup = null; // the single floating video-hover preview, if any

  init();

  async function init() {
    var sessionResult = await client.auth.getSession();
    currentUser = sessionResult.data.session ? sessionResult.data.session.user : null;
    updateAuthGate();

    client.auth.onAuthStateChange(function (_event, session) {
      currentUser = session ? session.user : null;
      updateAuthGate();
      loadLikes().then(function () {
        renderCurrentView();
      });
    });

    await loadGallery();
    await loadLikes();
    renderCurrentView();
  }

  // ---------- Upload modal ----------
  function openUploadModal() {
    if (uploadModalOverlay) uploadModalOverlay.classList.add("open");
  }
  function closeUploadModal() {
    if (uploadModalOverlay) uploadModalOverlay.classList.remove("open");
  }
  if (openUploadBtn) openUploadBtn.addEventListener("click", openUploadModal);
  if (uploadModalClose) uploadModalClose.addEventListener("click", closeUploadModal);
  if (uploadModalOverlay) {
    uploadModalOverlay.addEventListener("click", function (e) {
      if (e.target === uploadModalOverlay) closeUploadModal();
    });
  }

  function updateAuthGate() {
    if (currentUser) {
      if (authRequiredBanner) authRequiredBanner.classList.remove("show");
      if (uploadCard) uploadCard.style.display = "";
    } else {
      if (authRequiredBanner) authRequiredBanner.classList.add("show");
      if (uploadCard) uploadCard.style.display = "none";
    }
    updateCommentAuthGate();
  }

  // ---------- Upload form ----------
  var form = document.getElementById("uploadForm");
  var fileInput = document.getElementById("uploadFile");
  var previewImg = document.getElementById("uploadPreviewImg");
  var previewVideo = document.getElementById("uploadPreviewVideo");
  var status = document.getElementById("uploadStatus");
  var modelSelect = document.getElementById("uploadModel");
  var modelOtherInput = document.getElementById("uploadModelOther");
  var workflowInput = document.getElementById("uploadWorkflow");

  if (modelSelect && modelOtherInput) {
    modelSelect.addEventListener("change", function () {
      var isOther = modelSelect.value === "other";
      modelOtherInput.style.display = isOther ? "block" : "none";
      if (!isOther) modelOtherInput.value = "";
    });
  }

  // Shared by the main upload form and the in-comment remix uploader.
  function wireFilePreview(input, imgEl, videoEl) {
    if (!input) return;
    input.addEventListener("change", function () {
      var file = input.files[0];
      if (!file) return;
      var isVideo = file.type.indexOf("video") === 0;
      var url = URL.createObjectURL(file);

      if (isVideo) {
        videoEl.src = url;
        videoEl.classList.add("show");
        imgEl.classList.remove("show");
        imgEl.removeAttribute("src");
      } else {
        imgEl.src = url;
        imgEl.classList.add("show");
        videoEl.classList.remove("show");
        videoEl.removeAttribute("src");
      }
    });
  }

  wireFilePreview(fileInput, previewImg, previewVideo);

  var uploadCoverPicker = setupCoverPicker({
    modeBtns: Array.prototype.slice.call(document.querySelectorAll("#uploadCoverPicker .cover-mode-btn")),
    frameMode: document.getElementById("uploadCoverFrameMode"),
    photoMode: document.getElementById("uploadCoverPhotoMode"),
    slider: document.getElementById("uploadCoverSlider"),
    photoInput: document.getElementById("uploadCoverPhoto"),
    photoPreviewImg: document.getElementById("uploadCoverPhotoPreview")
  });
  uploadCoverPicker.bindVideo(previewVideo);

  var uploadCoverField = document.getElementById("uploadCoverPicker");
  if (fileInput && uploadCoverField) {
    fileInput.addEventListener("change", function () {
      var file = fileInput.files[0];
      var isVideo = file && file.type.indexOf("video") === 0;
      uploadCoverField.style.display = isVideo ? "" : "none";
      if (isVideo) uploadCoverPicker.reset();
    });
  }

  if (form) {
    form.addEventListener("submit", async function (e) {
      e.preventDefault();

      if (!currentUser) {
        showStatus("Please log in to add to the gallery.", "error");
        return;
      }

      var file = fileInput.files[0];
      var titleText = document.getElementById("uploadTitle").value.trim();
      var promptText = document.getElementById("uploadPrompt").value.trim();
      var tagsRaw = document.getElementById("uploadTags").value.trim();
      var modelSelectValue = document.getElementById("uploadModel").value.trim();
      var modelUsed = modelSelectValue === "other"
        ? document.getElementById("uploadModelOther").value.trim()
        : modelSelectValue;
      var visibility = form.querySelector('input[name="uploadVisibility"]:checked');
      var isPublic = !visibility || visibility.value === "public";

      if (!file || !titleText || !promptText) {
        showStatus("Please add a file, a title, and the prompt you used.", "error");
        return;
      }

      var classified = classifyMedia(file);
      var mediaType = classified.mediaType;
      if (classified.tooLarge) {
        var maxMb = Math.round(classified.maxBytes / (1024 * 1024));
        showStatus("That file is too large — the limit is " + maxMb + "MB for " + mediaType + "s.", "error");
        return;
      }

      var tags = parseTags(tagsRaw);

      // Optional ComfyUI workflow attachment: read + validate as JSON, stored
      // as text on the post (small enough that it lives in the database, not
      // on the NAS).
      var workflowJson = null;
      if (workflowInput && workflowInput.files && workflowInput.files[0]) {
        var wfFile = workflowInput.files[0];
        if (wfFile.size > 2 * 1024 * 1024) {
          showStatus("That workflow file is too big (max 2MB).", "error");
          return;
        }
        try {
          var wfText = await wfFile.text();
          JSON.parse(wfText);
          workflowJson = wfText;
        } catch (e) {
          showStatus("That workflow file isn't valid JSON — export it from ComfyUI as .json.", "error");
          return;
        }
      }

      showStatus("Uploading...", "");

      try {
        var token = await getAccessToken();
        if (!token) { showStatus("Your session expired — please log in again.", "error"); return; }

        var nasResult = await uploadToNas(file, token);
        var imageUrl = nasResult.secure_url;

        var coverUrl = null;
        if (mediaType === "video") {
          coverUrl = await coverForLocalVideo(uploadCoverPicker, previewVideo, token);
        }

        var insertResult = await client.from(SUPABASE_TABLE).insert([{
          image_url: imageUrl,
          cloudinary_public_id: null,
          cover_url: coverUrl,
          title: titleText || null,
          prompt: promptText,
          hashtags: tags,
          model: modelUsed || null,
          workflow_json: workflowJson,
          user_id: currentUser.id,
          is_public: isPublic,
          media_type: mediaType
        }]);
        if (insertResult.error) throw insertResult.error;

        showStatus("Saved to your gallery.", "success");
        form.reset();
        previewImg.classList.remove("show");
        previewVideo.classList.remove("show");
        if (modelOtherInput) modelOtherInput.style.display = "none";
        if (uploadCoverField) uploadCoverField.style.display = "none";
        uploadCoverPicker.reset();
        await loadGallery();
        renderCurrentView();
        setTimeout(closeUploadModal, 900);
      } catch (err) {
        console.error(err);
        showStatus("Something went wrong: " + (err.message || err), "error");
      }
    });
  }

  function showStatus(msg, type) {
    if (!status) return;
    status.textContent = msg;
    status.className = "form-status show" + (type ? " " + type : "");
  }

  // ---------- Load + render ----------
  // RLS handles visibility server-side: logged out / other users only ever
  // receive rows where is_public = true; the owner also gets their own
  // private rows back automatically.
  async function loadGallery() {
    var result = await client
      .from(SUPABASE_TABLE)
      .select("*")
      .order("created_at", { ascending: false });

    if (result.error) {
      console.error(result.error);
      return;
    }

    // Admins get every row back (including admin-removed ones) via their
    // read-all policy, so filter out takedowns here for the public gallery.
    allItems = (result.data || []).filter(function (r) { return !r.is_removed; });
  }

  // Loads the current user's own likes so we know which hearts to fill in.
  async function loadLikes() {
    likedIds = {};
    if (!currentUser) return;

    var result = await client
      .from("gallery_likes")
      .select("gallery_id")
      .eq("user_id", currentUser.id);

    if (result.error) {
      console.error(result.error);
      return;
    }

    (result.data || []).forEach(function (row) {
      likedIds[row.gallery_id] = true;
    });
  }

  // Re-applies the current search + sort to allItems and re-renders. Call
  // this any time allItems, likedIds, or the search/sort controls change.
  function renderCurrentView() {
    var query = searchInput ? searchInput.value.trim() : "";
    var items = query ? filterItems(query) : allItems.slice();
    items = sortItems(items, query);
    renderGallery(items);
  }

  function renderGallery(items) {
    if (!galleryGrid) return;
    closeHoverPreview();
    galleryGrid.innerHTML = "";

    if (!items.length) {
      emptyState.style.display = "block";
      emptyState.textContent = currentUser
        ? "No entries yet — upload your first photo or video above."
        : "No public entries yet. Log in to add the first one.";
      return;
    }
    emptyState.style.display = "none";

    items.forEach(function (item) {
      var card = document.createElement("div");
      card.className = "gallery-item";

      var mediaHtml = item.media_type === "video"
        ? '<video src="' + escapeHtml(item.image_url) + '"' + posterAttr(item) + ' muted loop preload="metadata" playsinline></video>'
        : '<img src="' + escapeHtml(item.image_url) + '" alt="Gallery image" loading="lazy" />';

      var badges = (item.hashtags || []).map(function (t) {
        return '<span class="tag">#' + escapeHtml(t) + "</span>";
      }).join("");

      if (!item.is_public) {
        badges = '<span class="tag private">Private</span>' + badges;
      }

      var liked = !!likedIds[item.id];
      var likesCount = item.likes_count || 0;

      var remixOfHtml = "";
      if (item.parent_id) {
        var parentItem = allItems.find(function (i) { return i.id === item.parent_id; });
        var parentLabel = parentItem ? (parentItem.title || parentItem.prompt) : null;
        remixOfHtml = parentLabel
          ? '<div class="remix-of" data-parent-id="' + escapeHtml(item.parent_id) + '">↻ Remix of ' + escapeHtml(parentLabel) + "</div>"
          : '<div class="remix-of remix-of-hidden">↻ A remix</div>';
      }

      card.innerHTML =
        mediaHtml +
        (item.media_type === "video" ? '<span class="gallery-media-badge">Video</span>' : "") +
        '<div class="gallery-item-body">' +
          remixOfHtml +
          (item.title ? "<h4>" + escapeHtml(item.title) + "</h4>" : "") +
          "<p>" + escapeHtml(item.prompt) + "</p>" +
          '<div class="gallery-item-footer">' +
            '<div class="gallery-tags">' + badges + "</div>" +
            '<button type="button" class="like-btn card-like-btn' + (liked ? " liked" : "") + '" data-gallery-id="' + escapeHtml(item.id) + '">' +
              '<span class="like-heart">' + (liked ? "♥" : "♡") + '</span> <span class="like-count">' + likesCount + "</span>" +
            "</button>" +
          "</div>" +
        "</div>";
      card.addEventListener("click", function (e) {
        if (e.target.closest(".card-like-btn") || e.target.closest(".remix-of")) return;
        openLightbox(item);
      });

      var likeBtn = card.querySelector(".card-like-btn");
      if (likeBtn) {
        likeBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          toggleLike(item, likeBtn);
        });
      }

      var remixOfEl = card.querySelector(".remix-of[data-parent-id]");
      if (remixOfEl) {
        remixOfEl.addEventListener("click", function (e) {
          e.stopPropagation();
          var parentItem = allItems.find(function (i) { return i.id === item.parent_id; });
          if (parentItem) openLightbox(parentItem);
        });
      }

      if (item.media_type === "video") {
        card.addEventListener("mouseenter", function () {
          closeHoverPreview();
          activeHoverPopup = showHoverPreview(card, item);
        });
        card.addEventListener("mouseleave", function () {
          closeHoverPreview();
        });
      }

      galleryGrid.appendChild(card);
    });
  }

  // Cloudinary can derive a still-frame JPG straight from a video's public
  // ID (so_0 = frame at 0 seconds) — used as a <video poster> so mobile
  // Safari shows a real thumbnail instead of a blank box (iOS doesn't decode
  // a frame for preload="metadata" the way desktop browsers do).
  function posterUrl(item) {
    if (item.cover_url) return item.cover_url;
    if (!item.cloudinary_public_id) return null;
    return "https://res.cloudinary.com/" + CLOUDINARY_CLOUD_NAME + "/video/upload/so_0/" + item.cloudinary_public_id + ".jpg";
  }

  function posterAttr(item) {
    var url = posterUrl(item);
    return url ? ' poster="' + escapeHtml(url) + '"' : "";
  }

  // ---------- Likes ----------
  async function toggleLike(item, likeBtn) {
    if (!currentUser) {
      window.location.href = "auth.html";
      return;
    }

    var alreadyLiked = !!likedIds[item.id];
    var heart = likeBtn.querySelector(".like-heart");
    var countEl = likeBtn.querySelector(".like-count");

    // Optimistic UI update
    likeBtn.classList.toggle("liked", !alreadyLiked);
    if (heart) heart.textContent = alreadyLiked ? "♡" : "♥";
    item.likes_count = Math.max(0, (item.likes_count || 0) + (alreadyLiked ? -1 : 1));
    if (countEl) countEl.textContent = item.likes_count;
    likedIds[item.id] = !alreadyLiked;

    try {
      if (alreadyLiked) {
        var delResult = await client
          .from("gallery_likes")
          .delete()
          .eq("gallery_id", item.id)
          .eq("user_id", currentUser.id);
        if (delResult.error) throw delResult.error;
      } else {
        var insResult = await client
          .from("gallery_likes")
          .insert([{ gallery_id: item.id, user_id: currentUser.id }]);
        if (insResult.error) throw insResult.error;
      }

      var stored = allItems.find(function (i) { return i.id === item.id; });
      if (stored) stored.likes_count = item.likes_count;

      if (currentLightboxItem && currentLightboxItem.id === item.id) {
        renderLightboxLike(currentLightboxItem);
      }
    } catch (err) {
      console.error(err);
      // Roll back the optimistic update on failure
      likedIds[item.id] = alreadyLiked;
      item.likes_count = Math.max(0, (item.likes_count || 0) + (alreadyLiked ? 1 : -1));
      if (heart) heart.textContent = alreadyLiked ? "♥" : "♡";
      likeBtn.classList.toggle("liked", alreadyLiked);
      if (countEl) countEl.textContent = item.likes_count;
    }
  }

  // Removes the currently-showing hover preview, if any. Only one popup is
  // ever allowed to exist at a time — this is also called at the top of
  // every full re-render (search/sort/like/upload/comment) so a popup left
  // over from a card that just got wiped out of the DOM can never get
  // orphaned and stuck on screen forever.
  function closeHoverPreview() {
    if (activeHoverPopup) {
      activeHoverPopup.remove();
      activeHoverPopup = null;
    }
  }

  // Shows the video at its native resolution/aspect ratio in a floating
  // popup near the hovered card, instead of the cropped grid thumbnail.
  function showHoverPreview(card, item) {
    var popup = document.createElement("div");
    popup.className = "gallery-hover-preview";

    var video = document.createElement("video");
    video.src = item.image_url;
    var poster = posterUrl(item);
    if (poster) video.poster = poster;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    popup.appendChild(video);
    document.body.appendChild(popup);

    function reposition() {
      var cardRect = card.getBoundingClientRect();
      var popupRect = popup.getBoundingClientRect();

      var left = cardRect.left + cardRect.width / 2 - popupRect.width / 2;
      left = Math.max(8, Math.min(left, window.innerWidth - popupRect.width - 8));

      var top = cardRect.top - popupRect.height - 12;
      if (top < 8) top = cardRect.bottom + 12;
      top = Math.max(8, Math.min(top, window.innerHeight - popupRect.height - 8));

      popup.style.left = left + "px";
      popup.style.top = top + "px";
    }

    video.addEventListener("loadedmetadata", reposition);
    reposition();

    var playPromise = video.play();
    if (playPromise && playPromise.catch) playPromise.catch(function () {});

    return popup;
  }

  // ---------- Search ----------
  function filterItems(query) {
    var q = query.toLowerCase();
    return allItems.filter(function (item) {
      var inPrompt = item.prompt && item.prompt.toLowerCase().indexOf(q) !== -1;
      var inTitle = item.title && item.title.toLowerCase().indexOf(q) !== -1;
      var inTags = (item.hashtags || []).some(function (t) { return t.toLowerCase().indexOf(q) !== -1; });
      var inModel = item.model && item.model.toLowerCase().indexOf(q) !== -1;
      return inPrompt || inTitle || inTags || inModel;
    });
  }

  if (searchInput) {
    searchInput.addEventListener("input", function () {
      renderCurrentView();
    });
  }

  // ---------- Report / flag a post ----------
  var FLAG_ENDPOINT = SUPABASE_URL.replace(/\/+$/, "") + "/functions/v1/submit-flag";
  var reportOverlay = document.getElementById("reportModalOverlay");
  var reportClose = document.getElementById("reportModalClose");
  var reportCancel = document.getElementById("reportCancelBtn");
  var reportSubmit = document.getElementById("reportSubmitBtn");
  var reportReason = document.getElementById("reportReason");
  var reportNotice = document.getElementById("reportNotice");
  var reportStatus = document.getElementById("reportStatus");
  var reportTargetId = null;

  function openReportModal(item) {
    if (!reportOverlay || !item) return;
    reportTargetId = item.id;
    if (reportReason) reportReason.value = "";
    if (reportNotice) reportNotice.value = "";
    if (reportStatus) { reportStatus.textContent = ""; reportStatus.className = "form-status"; }
    if (reportSubmit) reportSubmit.disabled = false;
    reportOverlay.classList.add("open");
  }
  function closeReportModal() {
    if (reportOverlay) reportOverlay.classList.remove("open");
    reportTargetId = null;
  }
  if (lightboxReportBtn) {
    lightboxReportBtn.addEventListener("click", function () {
      if (currentLightboxItem) openReportModal(currentLightboxItem);
    });
  }
  if (reportClose) reportClose.addEventListener("click", closeReportModal);
  if (reportCancel) reportCancel.addEventListener("click", closeReportModal);
  if (reportOverlay) {
    reportOverlay.addEventListener("click", function (e) {
      if (e.target === reportOverlay) closeReportModal();
    });
  }
  if (reportSubmit) {
    reportSubmit.addEventListener("click", async function () {
      if (!reportTargetId) return;
      var reason = reportReason ? reportReason.value : "";
      if (!reason) {
        if (reportStatus) { reportStatus.textContent = "Please choose a reason."; reportStatus.className = "form-status show error"; }
        return;
      }
      reportSubmit.disabled = true;
      if (reportStatus) { reportStatus.textContent = "Sending…"; reportStatus.className = "form-status show"; }
      try {
        var res = await fetch(FLAG_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json", "apikey": SUPABASE_ANON_KEY },
          body: JSON.stringify({
            gallery_id: reportTargetId,
            reason: reason,
            notice: reportNotice ? reportNotice.value.trim() : ""
          })
        });
        var data = await res.json().catch(function () { return {}; });
        if (!res.ok) throw new Error(data.error || "Couldn't submit your report.");
        if (reportStatus) { reportStatus.textContent = data.message || "Thanks — your report has been sent."; reportStatus.className = "form-status show success"; }
        setTimeout(closeReportModal, 1400);
      } catch (err) {
        if (reportStatus) { reportStatus.textContent = err.message || "Couldn't submit your report."; reportStatus.className = "form-status show error"; }
        reportSubmit.disabled = false;
      }
    });
  }

  // Download a post's attached ComfyUI workflow as a .json file.
  function downloadWorkflow(item) {
    if (!item || !item.workflow_json) return;
    try {
      var blob = new Blob([item.workflow_json], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      var base = (item.title || "workflow").replace(/[^a-z0-9_-]+/gi, "_").slice(0, 40) || "workflow";
      a.href = url;
      a.download = base + ".json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    } catch (e) { console.error("workflow download failed", e); }
  }

  if (sortSelect) {
    sortSelect.addEventListener("change", function () {
      renderCurrentView();
    });
  }

  // ---------- Sort ----------
  // Cheap relevance score for a search query: exact/whole-word hashtag match
  // scores highest, then a title hit, then a prompt hit — with a small bonus
  // for matches that occur earlier in the text.
  function relevanceScore(item, q) {
    var query = q.toLowerCase();
    var score = 0;

    (item.hashtags || []).forEach(function (t) {
      var tag = t.toLowerCase();
      if (tag === query) score += 100;
      else if (tag.indexOf(query) !== -1) score += 40;
    });

    if (item.title) {
      var idx = item.title.toLowerCase().indexOf(query);
      if (idx !== -1) score += 60 - Math.min(idx, 30);
    }

    if (item.prompt) {
      var pIdx = item.prompt.toLowerCase().indexOf(query);
      if (pIdx !== -1) score += 20 - Math.min(pIdx / 10, 10);
    }

    return score;
  }

  function sortItems(items, query) {
    var mode = sortSelect ? sortSelect.value : "popular";
    var sorted = items.slice();

    if (mode === "relevant" && query) {
      sorted.sort(function (a, b) {
        var diff = relevanceScore(b, query) - relevanceScore(a, query);
        if (diff !== 0) return diff;
        return (b.likes_count || 0) - (a.likes_count || 0);
      });
    } else if (mode === "recent") {
      sorted.sort(function (a, b) {
        return new Date(b.created_at) - new Date(a.created_at);
      });
    } else {
      // "popular" default, and "relevant" with no active search query falls
      // back to popularity too since there's nothing to rank relevance against.
      sorted.sort(function (a, b) {
        var diff = (b.likes_count || 0) - (a.likes_count || 0);
        if (diff !== 0) return diff;
        return new Date(b.created_at) - new Date(a.created_at);
      });
    }

    return sorted;
  }

  // ---------- Lightbox ----------
  var overlay = document.getElementById("lightboxOverlay");
  var lightboxImg = document.getElementById("lightboxImg");
  var lightboxVideo = document.getElementById("lightboxVideo");
  var lightboxTitle = document.getElementById("lightboxTitle");
  var lightboxPrompt = document.getElementById("lightboxPrompt");
  var lightboxModel = document.getElementById("lightboxModel");
  var lightboxTags = document.getElementById("lightboxTags");
  var lightboxCopy = document.getElementById("lightboxCopy");
  var lightboxWorkflowBtn = document.getElementById("lightboxWorkflowBtn");
  var lightboxReportBtn = document.getElementById("lightboxReportBtn");
  var lightboxLikeBtn = document.getElementById("lightboxLikeBtn");
  var lightboxClose = document.getElementById("lightboxClose");

  var lightboxView = document.getElementById("lightboxView");
  var lightboxEditBtn = document.getElementById("lightboxEditBtn");
  var lightboxEditForm = document.getElementById("lightboxEditForm");
  var editTitle = document.getElementById("editTitle");
  var editPrompt = document.getElementById("editPrompt");
  var editTags = document.getElementById("editTags");
  var editModel = document.getElementById("editModel");
  var editModelOther = document.getElementById("editModelOther");
  var editStatus = document.getElementById("editStatus");
  var editSaveBtn = document.getElementById("editSaveBtn");
  var editCancelBtn = document.getElementById("editCancelBtn");
  var editCoverField = document.getElementById("editCoverField");

  var editCoverPicker = setupCoverPicker({
    modeBtns: Array.prototype.slice.call(document.querySelectorAll("#editCoverField .cover-mode-btn")),
    frameMode: document.getElementById("editCoverFrameMode"),
    photoMode: document.getElementById("editCoverPhotoMode"),
    slider: document.getElementById("editCoverSlider"),
    photoInput: document.getElementById("editCoverPhoto"),
    photoPreviewImg: document.getElementById("editCoverPhotoPreview"),
    resetBtn: document.getElementById("editCoverResetBtn")
  });
  editCoverPicker.bindVideo(lightboxVideo);

  // ---------- Comments + remixes ----------
  var commentsList = document.getElementById("commentsList");
  var commentAuthBanner = document.getElementById("commentAuthBanner");
  var commentComposer = document.getElementById("commentComposer");
  var commentBody = document.getElementById("commentBody");
  var toggleRemixBtn = document.getElementById("toggleRemixBtn");
  var remixSubform = document.getElementById("remixSubform");
  var remixFile = document.getElementById("remixFile");
  var remixPreviewImg = document.getElementById("remixPreviewImg");
  var remixPreviewVideo = document.getElementById("remixPreviewVideo");
  var remixTitle = document.getElementById("remixTitle");
  var remixPrompt = document.getElementById("remixPrompt");
  var remixTags = document.getElementById("remixTags");
  var remixModel = document.getElementById("remixModel");
  var remixModelOther = document.getElementById("remixModelOther");
  var postCommentBtn = document.getElementById("postCommentBtn");
  var commentStatus = document.getElementById("commentStatus");

  wireFilePreview(remixFile, remixPreviewImg, remixPreviewVideo);

  var remixCoverPicker = setupCoverPicker({
    modeBtns: Array.prototype.slice.call(document.querySelectorAll("#remixCoverPicker .cover-mode-btn")),
    frameMode: document.getElementById("remixCoverFrameMode"),
    photoMode: document.getElementById("remixCoverPhotoMode"),
    slider: document.getElementById("remixCoverSlider"),
    photoInput: document.getElementById("remixCoverPhoto"),
    photoPreviewImg: document.getElementById("remixCoverPhotoPreview")
  });
  remixCoverPicker.bindVideo(remixPreviewVideo);

  var remixCoverField = document.getElementById("remixCoverPicker");
  if (remixFile && remixCoverField) {
    remixFile.addEventListener("change", function () {
      var file = remixFile.files[0];
      var isVideo = file && file.type.indexOf("video") === 0;
      remixCoverField.style.display = isVideo ? "" : "none";
      if (isVideo) remixCoverPicker.reset();
    });
  }

  if (remixModel && remixModelOther) {
    remixModel.addEventListener("change", function () {
      var isOther = remixModel.value === "other";
      remixModelOther.style.display = isOther ? "block" : "none";
      if (!isOther) remixModelOther.value = "";
    });
  }

  if (toggleRemixBtn) {
    toggleRemixBtn.addEventListener("click", function () {
      var opening = remixSubform.style.display === "none";
      remixSubform.style.display = opening ? "block" : "none";
      toggleRemixBtn.textContent = opening ? "− Hide remix form" : "+ Add your own remix (photo/video)";
      if (opening && currentLightboxItem && !remixPrompt.value) {
        // Pre-fill with the original so it's easy to tweak rather than retype
        remixPrompt.value = currentLightboxItem.prompt || "";
        remixTags.value = (currentLightboxItem.hashtags || []).join(", ");
        if (currentLightboxItem.model) {
          var opt = remixModel.querySelector('option[value="' + currentLightboxItem.model.replace(/"/g, '\\"') + '"]');
          if (opt) {
            remixModel.value = currentLightboxItem.model;
          } else {
            remixModel.value = "other";
            remixModelOther.style.display = "block";
            remixModelOther.value = currentLightboxItem.model;
          }
        }
      }
    });
  }

  function resetCommentComposer() {
    if (commentBody) commentBody.value = "";
    if (remixSubform) remixSubform.style.display = "none";
    if (toggleRemixBtn) toggleRemixBtn.textContent = "+ Add your own remix (photo/video)";
    if (remixFile) remixFile.value = "";
    if (remixTitle) remixTitle.value = "";
    if (remixPrompt) remixPrompt.value = "";
    if (remixTags) remixTags.value = "";
    if (remixModel) remixModel.value = "";
    if (remixModelOther) { remixModelOther.value = ""; remixModelOther.style.display = "none"; }
    if (remixPreviewImg) remixPreviewImg.classList.remove("show");
    if (remixPreviewVideo) remixPreviewVideo.classList.remove("show");
    if (remixCoverField) remixCoverField.style.display = "none";
    remixCoverPicker.reset();
  }

  function pseudoName(userId) {
    return "Member " + String(userId || "").replace(/-/g, "").slice(0, 6).toUpperCase();
  }

  async function loadComments(galleryId) {
    var result = await client
      .from("gallery_comments")
      .select("*")
      .eq("gallery_id", galleryId)
      .order("created_at", { ascending: true });

    if (result.error) {
      console.error(result.error);
      return;
    }
    renderComments(result.data || []);
  }

  function renderComments(comments) {
    if (!commentsList) return;
    commentsList.innerHTML = "";

    if (!comments.length) {
      commentsList.innerHTML = '<p class="comments-empty">No comments yet — say something or share your own remix.</p>';
      return;
    }

    comments.forEach(function (c) {
      var row = document.createElement("div");
      row.className = "comment-row";

      var remixHtml = "";
      if (c.remix_id) {
        var remix = allItems.find(function (i) { return i.id === c.remix_id; });
        if (remix) {
          var thumb = remix.media_type === "video"
            ? '<video src="' + escapeHtml(remix.image_url) + '"' + posterAttr(remix) + ' muted preload="metadata" playsinline></video>'
            : '<img src="' + escapeHtml(remix.image_url) + '" alt="Remix" />';
          remixHtml =
            '<div class="comment-remix" data-remix-id="' + escapeHtml(remix.id) + '">' +
              thumb +
              '<span class="comment-remix-link">View remix →</span>' +
            "</div>";
        } else {
          remixHtml = '<div class="comment-remix comment-remix-hidden">Shared a remix (private — only visible to its owner)</div>';
        }
      }

      var canDelete = currentUser && c.user_id === currentUser.id;

      row.innerHTML =
        '<div class="comment-meta"><span class="comment-author">' + escapeHtml(pseudoName(c.user_id)) + "</span></div>" +
        (c.body ? '<p class="comment-body">' + escapeHtml(c.body) + "</p>" : "") +
        remixHtml +
        (canDelete ? '<button type="button" class="comment-delete" data-comment-id="' + escapeHtml(c.id) + '">Delete</button>' : "");

      var remixLink = row.querySelector(".comment-remix");
      if (remixLink && !remixLink.classList.contains("comment-remix-hidden")) {
        remixLink.addEventListener("click", function () {
          var remix = allItems.find(function (i) { return i.id === c.remix_id; });
          if (remix) openLightbox(remix);
        });
      }

      var delBtn = row.querySelector(".comment-delete");
      if (delBtn) {
        delBtn.addEventListener("click", function () {
          deleteComment(c.id);
        });
      }

      commentsList.appendChild(row);
    });
  }

  async function deleteComment(commentId) {
    var result = await client.from("gallery_comments").delete().eq("id", commentId);
    if (result.error) {
      console.error(result.error);
      return;
    }
    if (currentLightboxItem) loadComments(currentLightboxItem.id);
  }

  if (postCommentBtn) {
    postCommentBtn.addEventListener("click", async function () {
      if (!currentLightboxItem) return;
      if (!currentUser) {
        window.location.href = "auth.html";
        return;
      }

      var bodyText = commentBody.value.trim();
      var wantsRemix = remixSubform.style.display !== "none";
      var file = wantsRemix && remixFile.files[0] ? remixFile.files[0] : null;

      if (!bodyText && !file) {
        commentStatus.textContent = "Add a comment or attach a remix.";
        commentStatus.className = "form-status show error";
        return;
      }

      if (wantsRemix && !file) {
        commentStatus.textContent = "Choose a photo or video for your remix, or close the remix form.";
        commentStatus.className = "form-status show error";
        return;
      }

      var remixPromptText = wantsRemix ? remixPrompt.value.trim() : "";
      if (file && !remixPromptText) {
        commentStatus.textContent = "Add the prompt you used for your remix.";
        commentStatus.className = "form-status show error";
        return;
      }

      var classified = file ? classifyMedia(file) : null;
      if (classified && classified.tooLarge) {
        var maxMb = Math.round(classified.maxBytes / (1024 * 1024));
        commentStatus.textContent = "That file is too large — the limit is " + maxMb + "MB for " + classified.mediaType + "s.";
        commentStatus.className = "form-status show error";
        return;
      }

      commentStatus.textContent = "Posting...";
      commentStatus.className = "form-status show";

      try {
        var remixId = null;

        if (file) {
          var remixToken = await getAccessToken();
          if (!remixToken) { commentStatus.textContent = "Your session expired — please log in again."; commentStatus.className = "form-status show error"; return; }
          var nasResult = await uploadToNas(file, remixToken);
          var remixModelSelectValue = remixModel.value.trim();
          var remixModelUsed = remixModelSelectValue === "other"
            ? remixModelOther.value.trim()
            : remixModelSelectValue;
          var remixVisibility = remixSubform.querySelector('input[name="remixVisibility"]:checked');
          var remixIsPublic = !remixVisibility || remixVisibility.value === "public";

          var remixCoverUrl = null;
          if (classified.mediaType === "video") {
            remixCoverUrl = await coverForLocalVideo(remixCoverPicker, remixPreviewVideo, remixToken);
          }

          var remixInsert = await client.from(SUPABASE_TABLE).insert([{
            image_url: nasResult.secure_url,
            cloudinary_public_id: null,
            cover_url: remixCoverUrl,
            title: remixTitle.value.trim() || null,
            prompt: remixPromptText,
            hashtags: parseTags(remixTags.value.trim()),
            model: remixModelUsed || null,
            user_id: currentUser.id,
            is_public: remixIsPublic,
            media_type: classified.mediaType,
            parent_id: currentLightboxItem.id
          }]).select().single();

          if (remixInsert.error) throw remixInsert.error;
          remixId = remixInsert.data.id;
        }

        var commentInsert = await client.from("gallery_comments").insert([{
          gallery_id: currentLightboxItem.id,
          user_id: currentUser.id,
          body: bodyText || null,
          remix_id: remixId
        }]);
        if (commentInsert.error) throw commentInsert.error;

        commentStatus.textContent = "Posted!";
        commentStatus.className = "form-status show success";
        resetCommentComposer();

        // If a remix was created, refresh allItems first so the comment
        // thread's remix thumbnail lookup (which reads from allItems) finds
        // it — otherwise it briefly shows as "not visible" due to the race.
        if (remixId) {
          await loadGallery();
          renderCurrentView();
        }
        await loadComments(currentLightboxItem.id);
      } catch (err) {
        console.error(err);
        commentStatus.textContent = "Something went wrong: " + (err.message || err);
        commentStatus.className = "form-status show error";
      }
    });
  }

  function updateCommentAuthGate() {
    if (currentUser) {
      if (commentAuthBanner) commentAuthBanner.style.display = "none";
      if (commentComposer) commentComposer.style.display = "";
    } else {
      if (commentAuthBanner) commentAuthBanner.style.display = "block";
      if (commentComposer) commentComposer.style.display = "none";
    }
  }

  var currentLightboxItem = null;

  if (editModel && editModelOther) {
    editModel.addEventListener("change", function () {
      var isOther = editModel.value === "other";
      editModelOther.style.display = isOther ? "block" : "none";
      if (!isOther) editModelOther.value = "";
    });
  }

  function openLightbox(item) {
    if (!overlay) return;
    closeHoverPreview();
    currentLightboxItem = item;

    if (item.media_type === "video") {
      lightboxVideo.src = item.image_url;
      var poster = posterUrl(item);
      if (poster) lightboxVideo.poster = poster;
      lightboxVideo.style.display = "block";
      lightboxImg.style.display = "none";
      lightboxImg.removeAttribute("src");
    } else {
      lightboxImg.src = item.image_url;
      lightboxImg.style.display = "block";
      lightboxVideo.style.display = "none";
      lightboxVideo.removeAttribute("src");
    }

    renderLightboxView(item);
    renderLightboxLike(item);
    exitEditMode();
    resetCommentComposer();
    updateCommentAuthGate();
    loadComments(item.id);

    if (lightboxEditBtn) {
      var isOwner = currentUser && item.user_id === currentUser.id;
      lightboxEditBtn.style.display = isOwner ? "" : "none";
    }

    if (lightboxWorkflowBtn) {
      if (item.workflow_json) {
        lightboxWorkflowBtn.style.display = "";
        lightboxWorkflowBtn.onclick = function () { downloadWorkflow(item); };
      } else {
        lightboxWorkflowBtn.style.display = "none";
        lightboxWorkflowBtn.onclick = null;
      }
    }

    overlay.classList.add("open");

    lightboxCopy.onclick = function () {
      navigator.clipboard.writeText(item.prompt);
      lightboxCopy.textContent = "Copied ✓";
      setTimeout(function () { lightboxCopy.textContent = "Copy Prompt"; }, 1500);
    };

    if (lightboxLikeBtn) {
      lightboxLikeBtn.onclick = function () {
        toggleLike(item, lightboxLikeBtn);
        // Keep the matching grid card's heart/count in sync without a full re-render
        var gridBtn = galleryGrid.querySelector('.card-like-btn[data-gallery-id="' + item.id + '"]');
        if (gridBtn) {
          var liked = !!likedIds[item.id];
          gridBtn.classList.toggle("liked", liked);
          var gh = gridBtn.querySelector(".like-heart");
          var gc = gridBtn.querySelector(".like-count");
          if (gh) gh.textContent = liked ? "♥" : "♡";
          if (gc) gc.textContent = item.likes_count || 0;
        }
      };
    }
  }

  function renderLightboxLike(item) {
    if (!lightboxLikeBtn) return;
    var liked = !!likedIds[item.id];
    lightboxLikeBtn.classList.toggle("liked", liked);
    var heart = lightboxLikeBtn.querySelector(".like-heart");
    var count = lightboxLikeBtn.querySelector(".like-count");
    if (heart) heart.textContent = liked ? "♥" : "♡";
    if (count) count.textContent = item.likes_count || 0;
  }

  function renderLightboxView(item) {
    if (lightboxTitle) {
      lightboxTitle.textContent = item.title || "";
      lightboxTitle.style.display = item.title ? "block" : "none";
    }
    lightboxPrompt.textContent = item.prompt;
    if (lightboxModel) {
      lightboxModel.textContent = item.model ? "Model: " + item.model : "";
      lightboxModel.style.display = item.model ? "block" : "none";
    }
    var badges = (item.hashtags || []).map(function (t) {
      return '<span class="tag">#' + escapeHtml(t) + "</span>";
    }).join("");
    if (!item.is_public) badges = '<span class="tag private">Private</span>' + badges;
    lightboxTags.innerHTML = badges;
  }

  function exitEditMode() {
    if (lightboxView) lightboxView.style.display = "";
    if (lightboxEditForm) lightboxEditForm.style.display = "none";
    if (editStatus) { editStatus.textContent = ""; editStatus.className = "form-status"; }
  }

  if (lightboxEditBtn) {
    lightboxEditBtn.addEventListener("click", function () {
      if (!currentLightboxItem) return;
      var item = currentLightboxItem;

      editTitle.value = item.title || "";
      editPrompt.value = item.prompt || "";
      editTags.value = (item.hashtags || []).join(", ");

      var knownOption = item.model
        ? editModel.querySelector('option[value="' + item.model.replace(/"/g, '\\"') + '"]')
        : null;
      if (item.model && knownOption) {
        editModel.value = item.model;
        editModelOther.style.display = "none";
        editModelOther.value = "";
      } else if (item.model) {
        editModel.value = "other";
        editModelOther.style.display = "block";
        editModelOther.value = item.model;
      } else {
        editModel.value = "";
        editModelOther.style.display = "none";
        editModelOther.value = "";
      }

      var visRadio = lightboxEditForm.querySelector('input[name="editVisibility"][value="' + (item.is_public ? "public" : "private") + '"]');
      if (visRadio) visRadio.checked = true;

      if (editCoverField) editCoverField.style.display = item.media_type === "video" ? "" : "none";
      if (item.media_type === "video") editCoverPicker.beginEditing();

      if (lightboxView) lightboxView.style.display = "none";
      if (lightboxEditForm) lightboxEditForm.style.display = "block";
    });
  }

  if (editCancelBtn) {
    editCancelBtn.addEventListener("click", function () {
      exitEditMode();
    });
  }

  if (editSaveBtn) {
    editSaveBtn.addEventListener("click", async function () {
      if (!currentLightboxItem) return;

      var newTitle = editTitle.value.trim();
      var newPrompt = editPrompt.value.trim();
      var newTagsRaw = editTags.value.trim();
      var newModelSelectValue = editModel.value.trim();
      var newModel = newModelSelectValue === "other"
        ? editModelOther.value.trim()
        : newModelSelectValue;
      var visRadio = lightboxEditForm.querySelector('input[name="editVisibility"]:checked');
      var newIsPublic = !visRadio || visRadio.value === "public";

      if (!newPrompt) {
        editStatus.textContent = "Prompt can't be empty.";
        editStatus.className = "form-status show error";
        return;
      }

      var newTags = parseTags(newTagsRaw);

      editStatus.textContent = "Saving...";
      editStatus.className = "form-status show";

      try {
        var updatePayload = {
          title: newTitle || null,
          prompt: newPrompt,
          hashtags: newTags,
          model: newModel || null,
          is_public: newIsPublic
        };

        var coverChanged = currentLightboxItem.media_type === "video" && editCoverPicker.hasChanged();
        if (coverChanged) {
          var editToken = await getAccessToken();
          if (!editToken) { editStatus.textContent = "Your session expired — please log in again."; editStatus.className = "form-status show error"; return; }
          var editCover = await coverForEditVideo(editCoverPicker, currentLightboxItem.image_url, editToken);
          if (editCover.set) updatePayload.cover_url = editCover.url;
          else coverChanged = false; // frame capture failed — leave the existing cover as-is
        }

        var updateResult = await client
          .from(SUPABASE_TABLE)
          .update(updatePayload)
          .eq("id", currentLightboxItem.id);

        if (updateResult.error) throw updateResult.error;

        currentLightboxItem.title = newTitle || null;
        currentLightboxItem.prompt = newPrompt;
        currentLightboxItem.hashtags = newTags;
        currentLightboxItem.model = newModel || null;
        currentLightboxItem.is_public = newIsPublic;
        if (coverChanged) currentLightboxItem.cover_url = updatePayload.cover_url;

        var stored = allItems.find(function (i) { return i.id === currentLightboxItem.id; });
        if (stored) {
          stored.title = currentLightboxItem.title;
          stored.prompt = currentLightboxItem.prompt;
          stored.hashtags = currentLightboxItem.hashtags;
          stored.model = currentLightboxItem.model;
          stored.is_public = currentLightboxItem.is_public;
          if (coverChanged) stored.cover_url = updatePayload.cover_url;
        }

        if (coverChanged) {
          var newPoster = posterUrl(currentLightboxItem);
          if (newPoster) lightboxVideo.poster = newPoster;
        }

        renderLightboxView(currentLightboxItem);
        renderCurrentView();
        exitEditMode();
      } catch (err) {
        console.error(err);
        editStatus.textContent = "Something went wrong: " + (err.message || err);
        editStatus.className = "form-status show error";
      }
    });
  }

  if (lightboxClose) {
    lightboxClose.addEventListener("click", function () {
      overlay.classList.remove("open");
      lightboxVideo.pause();
    });
  }
  if (overlay) {
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) {
        overlay.classList.remove("open");
        lightboxVideo.pause();
      }
    });
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
});

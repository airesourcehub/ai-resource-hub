// AI Resource Hub — Gallery logic (Supabase for accounts/data, Cloudinary for
// the actual photo/video files)
// Upload a photo or video + prompt + hashtags, choose public/private, and
// search/browse past prompts by keyword or hashtag. Posting requires login;
// browsing/searching public entries does not. Files are uploaded directly
// from the browser to Cloudinary's unsigned upload API (no backend needed);
// the resulting URL + public_id are then saved to Supabase alongside the
// prompt/tags/etc. If Cloudinary is down, only the Gallery is affected —
// the rest of the site (which doesn't depend on it) keeps working.

var CLOUDINARY_IMAGE_MAX_BYTES = 10 * 1024 * 1024; // 10MB, Cloudinary free plan
var CLOUDINARY_VIDEO_MAX_BYTES = 100 * 1024 * 1024; // 100MB, Cloudinary free plan

function uploadToCloudinary(file) {
  var formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

  var url = "https://api.cloudinary.com/v1_1/" + CLOUDINARY_CLOUD_NAME + "/auto/upload";

  return fetch(url, { method: "POST", body: formData }).then(function (res) {
    return res.json().then(function (data) {
      if (!res.ok) {
        throw new Error((data.error && data.error.message) || "Upload to Cloudinary failed.");
      }
      return data;
    });
  });
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
  var allItems = [];
  var currentUser = null;
  var likedIds = {}; // gallery_id -> true, for the current user

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
  }

  // ---------- Upload form ----------
  var form = document.getElementById("uploadForm");
  var fileInput = document.getElementById("uploadFile");
  var previewImg = document.getElementById("uploadPreviewImg");
  var previewVideo = document.getElementById("uploadPreviewVideo");
  var status = document.getElementById("uploadStatus");
  var modelSelect = document.getElementById("uploadModel");
  var modelOtherInput = document.getElementById("uploadModelOther");

  if (modelSelect && modelOtherInput) {
    modelSelect.addEventListener("change", function () {
      var isOther = modelSelect.value === "other";
      modelOtherInput.style.display = isOther ? "block" : "none";
      if (!isOther) modelOtherInput.value = "";
    });
  }

  if (fileInput) {
    fileInput.addEventListener("change", function () {
      var file = fileInput.files[0];
      if (!file) return;
      var isVideo = file.type.indexOf("video") === 0;
      var url = URL.createObjectURL(file);

      if (isVideo) {
        previewVideo.src = url;
        previewVideo.classList.add("show");
        previewImg.classList.remove("show");
        previewImg.removeAttribute("src");
      } else {
        previewImg.src = url;
        previewImg.classList.add("show");
        previewVideo.classList.remove("show");
        previewVideo.removeAttribute("src");
      }
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

      if (!file || !promptText) {
        showStatus("Please add both a file and a prompt.", "error");
        return;
      }

      var mediaType = file.type.indexOf("video") === 0 ? "video" : "image";
      var maxBytes = mediaType === "video" ? CLOUDINARY_VIDEO_MAX_BYTES : CLOUDINARY_IMAGE_MAX_BYTES;
      if (file.size > maxBytes) {
        var maxMb = Math.round(maxBytes / (1024 * 1024));
        showStatus("That file is too large — the limit is " + maxMb + "MB for " + mediaType + "s.", "error");
        return;
      }

      var tags = tagsRaw
        .split(/[\s,]+/)
        .map(function (t) { return t.replace(/^#/, "").toLowerCase().trim(); })
        .filter(Boolean);

      showStatus("Uploading...", "");

      try {
        var cloudinaryResult = await uploadToCloudinary(file);
        var imageUrl = cloudinaryResult.secure_url;

        var insertResult = await client.from(SUPABASE_TABLE).insert([{
          image_url: imageUrl,
          cloudinary_public_id: cloudinaryResult.public_id || null,
          title: titleText || null,
          prompt: promptText,
          hashtags: tags,
          model: modelUsed || null,
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

    allItems = result.data || [];
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

      card.innerHTML =
        mediaHtml +
        (item.media_type === "video" ? '<span class="gallery-media-badge">Video</span>' : "") +
        '<div class="gallery-item-body">' +
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
        if (e.target.closest(".card-like-btn")) return;
        openLightbox(item);
      });

      var likeBtn = card.querySelector(".card-like-btn");
      if (likeBtn) {
        likeBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          toggleLike(item, likeBtn);
        });
      }

      if (item.media_type === "video") {
        var hoverPopup = null;
        card.addEventListener("mouseenter", function () {
          hoverPopup = showHoverPreview(card, item);
        });
        card.addEventListener("mouseleave", function () {
          if (hoverPopup) {
            hoverPopup.remove();
            hoverPopup = null;
          }
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
      return inPrompt || inTitle || inTags;
    });
  }

  if (searchInput) {
    searchInput.addEventListener("input", function () {
      renderCurrentView();
    });
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

    if (lightboxEditBtn) {
      var isOwner = currentUser && item.user_id === currentUser.id;
      lightboxEditBtn.style.display = isOwner ? "" : "none";
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

      var newTags = newTagsRaw
        .split(/[\s,]+/)
        .map(function (t) { return t.replace(/^#/, "").toLowerCase().trim(); })
        .filter(Boolean);

      editStatus.textContent = "Saving...";
      editStatus.className = "form-status show";

      try {
        var updateResult = await client
          .from(SUPABASE_TABLE)
          .update({
            title: newTitle || null,
            prompt: newPrompt,
            hashtags: newTags,
            model: newModel || null,
            is_public: newIsPublic
          })
          .eq("id", currentLightboxItem.id);

        if (updateResult.error) throw updateResult.error;

        currentLightboxItem.title = newTitle || null;
        currentLightboxItem.prompt = newPrompt;
        currentLightboxItem.hashtags = newTags;
        currentLightboxItem.model = newModel || null;
        currentLightboxItem.is_public = newIsPublic;

        var stored = allItems.find(function (i) { return i.id === currentLightboxItem.id; });
        if (stored) {
          stored.title = currentLightboxItem.title;
          stored.prompt = currentLightboxItem.prompt;
          stored.hashtags = currentLightboxItem.hashtags;
          stored.model = currentLightboxItem.model;
          stored.is_public = currentLightboxItem.is_public;
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

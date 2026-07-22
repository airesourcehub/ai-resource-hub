// AI Resource Hub — Gallery logic (Supabase-backed)
// Upload a photo or video + prompt + hashtags, choose public/private, and
// search/browse past prompts by keyword or hashtag. Posting requires login;
// browsing/searching public entries does not.

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

  if (!isConfigured) {
    if (setupBanner) setupBanner.classList.add("show");
    if (uploadCard) uploadCard.style.display = "none";
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

  init();

  async function init() {
    var sessionResult = await client.auth.getSession();
    currentUser = sessionResult.data.session ? sessionResult.data.session.user : null;
    updateAuthGate();

    client.auth.onAuthStateChange(function (_event, session) {
      currentUser = session ? session.user : null;
      updateAuthGate();
      loadGallery();
    });

    loadGallery();
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

      var tags = tagsRaw
        .split(/[\s,]+/)
        .map(function (t) { return t.replace(/^#/, "").toLowerCase().trim(); })
        .filter(Boolean);

      showStatus("Uploading...", "");

      try {
        var fileExt = file.name.split(".").pop();
        var filePath = currentUser.id + "/" + Date.now() + "-" + Math.random().toString(36).slice(2) + "." + fileExt;

        var uploadResult = await client.storage.from(SUPABASE_BUCKET).upload(filePath, file);
        if (uploadResult.error) throw uploadResult.error;

        var publicUrlResult = client.storage.from(SUPABASE_BUCKET).getPublicUrl(filePath);
        var imageUrl = publicUrlResult.data.publicUrl;

        var insertResult = await client.from(SUPABASE_TABLE).insert([{
          image_url: imageUrl,
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
        loadGallery();
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
    renderGallery(allItems);
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
        ? '<video src="' + escapeHtml(item.image_url) + '" muted loop preload="metadata" playsinline></video>'
        : '<img src="' + escapeHtml(item.image_url) + '" alt="Gallery image" loading="lazy" />';

      var badges = (item.hashtags || []).map(function (t) {
        return '<span class="tag">#' + escapeHtml(t) + "</span>";
      }).join("");

      if (!item.is_public) {
        badges = '<span class="tag private">Private</span>' + badges;
      }

      card.innerHTML =
        mediaHtml +
        (item.media_type === "video" ? '<span class="gallery-media-badge">Video</span>' : "") +
        '<div class="gallery-item-body">' +
          (item.title ? "<h4>" + escapeHtml(item.title) + "</h4>" : "") +
          "<p>" + escapeHtml(item.prompt) + "</p>" +
          '<div class="gallery-tags">' + badges + "</div>" +
        "</div>";
      card.addEventListener("click", function () { openLightbox(item); });

      if (item.media_type === "video") {
        var hoverPopup = null;
        card.addEventListener("mouseenter", function () {
          hoverPopup = showHoverPreview(card, item.image_url);
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

  // Shows the video at its native resolution/aspect ratio in a floating
  // popup near the hovered card, instead of the cropped grid thumbnail.
  function showHoverPreview(card, url) {
    var popup = document.createElement("div");
    popup.className = "gallery-hover-preview";

    var video = document.createElement("video");
    video.src = url;
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
      var inTags = (item.hashtags || []).some(function (t) { return t.toLowerCase().indexOf(q) !== -1; });
      return inPrompt || inTags;
    });
  }

  if (searchInput) {
    searchInput.addEventListener("input", function () {
      var q = searchInput.value.trim();
      renderGallery(q ? filterItems(q) : allItems);
    });
  }

  // ---------- Lightbox ----------
  var overlay = document.getElementById("lightboxOverlay");
  var lightboxImg = document.getElementById("lightboxImg");
  var lightboxVideo = document.getElementById("lightboxVideo");
  var lightboxTitle = document.getElementById("lightboxTitle");
  var lightboxPrompt = document.getElementById("lightboxPrompt");
  var lightboxTags = document.getElementById("lightboxTags");
  var lightboxCopy = document.getElementById("lightboxCopy");
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
  }

  function renderLightboxView(item) {
    if (lightboxTitle) {
      lightboxTitle.textContent = item.title || "";
      lightboxTitle.style.display = item.title ? "block" : "none";
    }
    lightboxPrompt.textContent = item.prompt;
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
        renderGallery(searchInput && searchInput.value.trim() ? filterItems(searchInput.value.trim()) : allItems);
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

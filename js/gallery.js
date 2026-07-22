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
      var promptText = document.getElementById("uploadPrompt").value.trim();
      var tagsRaw = document.getElementById("uploadTags").value.trim();
      var modelUsed = document.getElementById("uploadModel").value.trim();
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
        ? '<video src="' + escapeHtml(item.image_url) + '" muted loop preload="metadata"></video>'
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
          "<p>" + escapeHtml(item.prompt) + "</p>" +
          '<div class="gallery-tags">' + badges + "</div>" +
        "</div>";
      card.addEventListener("click", function () { openLightbox(item); });
      galleryGrid.appendChild(card);
    });
  }

  // ---------- Search ----------
  if (searchInput) {
    searchInput.addEventListener("input", function () {
      var q = searchInput.value.trim().toLowerCase();
      if (!q) {
        renderGallery(allItems);
        return;
      }
      var filtered = allItems.filter(function (item) {
        var inPrompt = item.prompt && item.prompt.toLowerCase().indexOf(q) !== -1;
        var inTags = (item.hashtags || []).some(function (t) { return t.toLowerCase().indexOf(q) !== -1; });
        return inPrompt || inTags;
      });
      renderGallery(filtered);
    });
  }

  // ---------- Lightbox ----------
  var overlay = document.getElementById("lightboxOverlay");
  var lightboxImg = document.getElementById("lightboxImg");
  var lightboxVideo = document.getElementById("lightboxVideo");
  var lightboxPrompt = document.getElementById("lightboxPrompt");
  var lightboxTags = document.getElementById("lightboxTags");
  var lightboxCopy = document.getElementById("lightboxCopy");
  var lightboxClose = document.getElementById("lightboxClose");

  function openLightbox(item) {
    if (!overlay) return;

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

    lightboxPrompt.textContent = item.prompt;
    var badges = (item.hashtags || []).map(function (t) {
      return '<span class="tag">#' + escapeHtml(t) + "</span>";
    }).join("");
    if (!item.is_public) badges = '<span class="tag private">Private</span>' + badges;
    lightboxTags.innerHTML = badges;
    overlay.classList.add("open");

    lightboxCopy.onclick = function () {
      navigator.clipboard.writeText(item.prompt);
      lightboxCopy.textContent = "Copied ✓";
      setTimeout(function () { lightboxCopy.textContent = "Copy Prompt"; }, 1500);
    };
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

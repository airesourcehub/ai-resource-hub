// AI Resource Hub — Gallery logic (Supabase-backed)
// Upload an image + prompt + hashtags, store in Supabase, and search/browse
// past prompts by keyword or hashtag.

document.addEventListener("DOMContentLoaded", function () {
  var isConfigured = typeof SUPABASE_URL !== "undefined" &&
    SUPABASE_URL.indexOf("YOUR_SUPABASE") === -1 &&
    SUPABASE_ANON_KEY.indexOf("YOUR_SUPABASE") === -1;

  var setupBanner = document.getElementById("setupBanner");
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
      emptyState.innerHTML = "Gallery backend isn't connected yet. See the README for a 5-minute Supabase setup — once configured, your uploaded prompts and photos will appear here.";
    }
    return;
  }

  var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  var allItems = [];

  loadGallery();

  // ---------- Upload form ----------
  var form = document.getElementById("uploadForm");
  var fileInput = document.getElementById("uploadFile");
  var preview = document.getElementById("uploadPreview");
  var status = document.getElementById("uploadStatus");

  if (fileInput) {
    fileInput.addEventListener("change", function () {
      var file = fileInput.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function (e) {
        preview.src = e.target.result;
        preview.classList.add("show");
      };
      reader.readAsDataURL(file);
    });
  }

  if (form) {
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      var file = fileInput.files[0];
      var promptText = document.getElementById("uploadPrompt").value.trim();
      var tagsRaw = document.getElementById("uploadTags").value.trim();
      var modelUsed = document.getElementById("uploadModel").value.trim();

      if (!file || !promptText) {
        showStatus("Please add both a photo and a prompt.", "error");
        return;
      }

      var tags = tagsRaw
        .split(/[\s,]+/)
        .map(function (t) { return t.replace(/^#/, "").toLowerCase().trim(); })
        .filter(Boolean);

      showStatus("Uploading...", "");

      try {
        var fileExt = file.name.split(".").pop();
        var filePath = Date.now() + "-" + Math.random().toString(36).slice(2) + "." + fileExt;

        var uploadResult = await client.storage.from(SUPABASE_BUCKET).upload(filePath, file);
        if (uploadResult.error) throw uploadResult.error;

        var publicUrlResult = client.storage.from(SUPABASE_BUCKET).getPublicUrl(filePath);
        var imageUrl = publicUrlResult.data.publicUrl;

        var insertResult = await client.from(SUPABASE_TABLE).insert([{
          image_url: imageUrl,
          prompt: promptText,
          hashtags: tags,
          model: modelUsed || null
        }]);
        if (insertResult.error) throw insertResult.error;

        showStatus("Saved to your gallery.", "success");
        form.reset();
        preview.classList.remove("show");
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
      emptyState.textContent = "No entries yet — upload your first photo and prompt above.";
      return;
    }
    emptyState.style.display = "none";

    items.forEach(function (item) {
      var card = document.createElement("div");
      card.className = "gallery-item";
      card.innerHTML =
        '<img src="' + escapeHtml(item.image_url) + '" alt="Gallery image" loading="lazy" />' +
        '<div class="gallery-item-body">' +
          "<p>" + escapeHtml(item.prompt) + "</p>" +
          '<div class="gallery-tags">' +
            (item.hashtags || []).map(function (t) { return '<span class="tag">#' + escapeHtml(t) + "</span>"; }).join("") +
          "</div>" +
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
  var lightboxPrompt = document.getElementById("lightboxPrompt");
  var lightboxTags = document.getElementById("lightboxTags");
  var lightboxCopy = document.getElementById("lightboxCopy");
  var lightboxClose = document.getElementById("lightboxClose");

  function openLightbox(item) {
    if (!overlay) return;
    lightboxImg.src = item.image_url;
    lightboxPrompt.textContent = item.prompt;
    lightboxTags.innerHTML = (item.hashtags || []).map(function (t) {
      return '<span class="tag">#' + escapeHtml(t) + "</span>";
    }).join("");
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
    });
  }
  if (overlay) {
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) overlay.classList.remove("open");
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

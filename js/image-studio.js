// AI Resource Hub — Image Studio.
// Multi-model image generation + editing on the desktop GPU, open to any
// logged-in user (jobs queue one-at-a-time). Optional custom LoRA.

(function () {
  var RENDER_ENDPOINT = "https://render.airesourcehub.vip";
  var POLL_MS = 3000;

  if (!window.supabase || typeof SUPABASE_URL === "undefined") return;
  var form = document.getElementById("imageForm");
  var studio = document.getElementById("imageStudio");
  if (!studio) return;

  var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Mirrors the service registry (image_support.py). `category` groups the
  // picker; `type` (create/edit) controls whether an input photo is needed.
  // `family` decides which trained LoRAs auto-appear: a Flux-family model
  // shows the user's own trained Flux identities; Qwen models don't.
  var MODELS = [
    { id: "flux2", name: "FLUX.2", type: "create", category: "t2i", lora: true, family: "flux", note: "Best all-round quality. Built-in Turbo toggle." },
    { id: "qwen2512", name: "Qwen-Image 2512", type: "create", category: "t2i", lora: true, family: "qwen", note: "Strong prompt adherence and text." },
    { id: "krea2", name: "Krea 2 Turbo", type: "create", category: "t2i", lora: true, family: "flux", note: "Fast, stylish." },
    { id: "zimage", name: "Z-Image Turbo", type: "create", category: "t2i", lora: false, note: "Very fast." },
    { id: "anima", name: "Anima", type: "create", category: "t2i", lora: false, note: "Stylized." },
    { id: "hidream", name: "HiDream O1", type: "create", category: "t2i", lora: false, note: "High detail." },
    { id: "sd35", name: "Stable Diffusion 3.5", type: "create", category: "t2i", lora: false, note: "Classic, flexible." },
    { id: "qwen_edit", name: "Qwen Image Edit", type: "edit", category: "edit", lora: true, family: "qwen", note: "Instruction-based edits." },
    { id: "qwen_edit2509", name: "Qwen Edit 2509", type: "edit", category: "edit", lora: true, family: "qwen", note: "Newer Qwen edit." },
    { id: "qwen_edit2511", name: "Qwen Edit 2511", type: "edit", category: "edit", lora: true, family: "qwen", note: "Multi-reference edit." },
    { id: "firered", name: "FireRed Edit", type: "edit", category: "edit", lora: true, family: "qwen", note: "Detailed photo edits." },
    { id: "flux2_edit", name: "FLUX.2 Image-to-Image", type: "edit", category: "i2i", lora: true, family: "flux", note: "Transform a photo with a prompt." }
  ];

  var CATEGORIES = [
    { key: "t2i", label: "Text to Image" },
    { key: "edit", label: "Image Edit" },
    { key: "i2i", label: "Image to Image" }
  ];

  var GRADIENTS = ["a1c4fd,c2e9fb", "fbc2eb,a6c1ee", "84fab0,8fd3f4", "ffecd2,fcb69f", "d4fc79,96e6a1",
                   "f6d365,fda085", "e0c3fc,8ec5fc", "f093fb,f5576c", "5ee7df,b490ca", "c1dfc4,deecdd",
                   "fddb92,d1fdff", "cfd9df,e2ebf0"];

  var user = null, selected = null, pollTimer = null, pollFails = 0, lastJobId = null;

  init();

  async function init() {
    renderPicker();
    var s = await client.auth.getSession();
    user = s.data.session ? s.data.session.user : null;
    gate();
    client.auth.onAuthStateChange(function (_e, sess) { user = sess ? sess.user : null; gate(); });

    document.getElementById("imgGenerateBtn").addEventListener("click", onGenerate);
    document.getElementById("imgCancelBtn").addEventListener("click", onCancel);
    document.getElementById("imgEnhance").addEventListener("click", enhancePrompt);
    document.getElementById("loraFile").addEventListener("change", onLoraUpload);
    var ls = document.getElementById("loraStrength");
    ls.addEventListener("input", function () {
      document.getElementById("loraStrengthLabel").textContent = (ls.value / 10).toFixed(1);
    });
  }

  function gate() {
    var g = document.getElementById("imgGate");
    if (!user) {
      g.innerHTML = 'Image generation is for signed-in members. <a href="auth.html">Log in</a> to start creating.';
      g.classList.add("show"); g.style.display = ""; studio.style.display = "none";
      return;
    }
    g.style.display = "none"; g.classList.remove("show"); studio.style.display = "";
    loadRecent();
  }

  // Admin-uploaded thumbnail (Supabase Storage) first, then the bundled
  // default in img/models/, then the gradient — the browser uses the first
  // that loads. Cache-busted per page load so admin swaps show on refresh.
  var THUMB_BASE = (typeof SUPABASE_URL !== "undefined" ? SUPABASE_URL : "") + "/storage/v1/object/public/model-thumbnails/";
  var TB = Date.now();

  function card(m, i) {
    var g = GRADIENTS[i % GRADIENTS.length].split(",");
    return '<button type="button" class="model-card" data-id="' + m.id + '">' +
      '<span class="model-thumb" style="background-image:url(' + THUMB_BASE + m.id + '.jpg?t=' + TB + '),url(img/models/' + m.id + '.jpg),linear-gradient(135deg,#' + g[0] + ',#' + g[1] + ')">' +
        (m.lora ? '<span class="model-badge model-badge-lora">LoRA</span>' : '') +
      '</span>' +
      '<span class="model-name">' + m.name + '</span>' +
      '<span class="model-note">' + m.note + '</span>' +
    '</button>';
  }

  function renderPicker() {
    var host = document.getElementById("modelPicker");
    var idx = 0, html = "";
    CATEGORIES.forEach(function (cat) {
      var models = MODELS.filter(function (m) { return m.category === cat.key; });
      if (!models.length) return;
      html += '<h3 class="model-category-title">' + cat.label + '</h3>';
      html += '<div class="model-grid">' + models.map(function (m) { return card(m, idx++); }).join("") + '</div>';
    });
    host.innerHTML = html;
    Array.prototype.forEach.call(host.querySelectorAll(".model-card"), function (c) {
      c.addEventListener("click", function () { selectModel(c.getAttribute("data-id")); });
    });
  }

  function selectModel(id) {
    selected = MODELS.filter(function (m) { return m.id === id; })[0];
    if (!selected) return;
    Array.prototype.forEach.call(document.querySelectorAll(".model-card"), function (c) {
      c.classList.toggle("selected", c.getAttribute("data-id") === id);
    });
    form.style.display = "";
    var isEdit = selected.type === "edit";
    document.getElementById("stepTwoLabel").textContent = isEdit ? "Upload a photo and describe the edit" : "Describe your image";
    document.getElementById("editImageField").style.display = isEdit ? "" : "none";
    document.getElementById("sizeField").style.display = isEdit ? "none" : "";
    document.getElementById("loraField").style.display = selected.lora ? "" : "none";
    if (selected.lora) loadLoras();
    document.getElementById("imgResults").style.display = "none";
    document.getElementById("imgGenerateBtn").textContent = isEdit ? "Generate edit" : "Generate";
    form.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // ---- prompt enhancer (client-side, no LLM) -----------------------------
  var ENHANCERS = ["highly detailed", "sharp focus", "professional lighting", "rich color", "8k, crisp"];
  function enhancePrompt() {
    var box = document.getElementById("imgPrompt");
    var cur = box.value.trim();
    if (!cur) { box.focus(); return; }
    var low = cur.toLowerCase();
    var adds = ENHANCERS.filter(function (t) { return low.indexOf(t.split(",")[0]) === -1; });
    if (!adds.length) return;
    box.value = cur.replace(/[,\s]+$/, "") + ", " + adds.join(", ") + ".";
    box.focus();
  }

  // ---- LoRA list + upload ------------------------------------------------
  // Your own trained identities (from the Train LoRA page) auto-appear here
  // for the matching family — train a Flux LoRA and it's waiting for you in
  // every Flux model, listed by the trigger word you chose.
  async function myTrainedLoras(family) {
    if (!user || !family) return [];
    try {
      var res = await client.from("training_jobs")
        .select("name, trigger_word, base, lora_file, created_at")
        .eq("user_id", user.id).eq("base", family).eq("status", "done")
        .order("created_at", { ascending: false });
      return (res.data || []).filter(function (t) {
        // Only usable if it landed in the shared LoRA folder (a bare filename).
        return t.lora_file && !/[\\/]/.test(t.lora_file);
      });
    } catch (e) { return []; }
  }

  async function loadLoras() {
    var sel = document.getElementById("loraPick");
    var family = selected && selected.family;
    var mine = await myTrainedLoras(family);
    try {
      var token = await freshToken();
      var r = await fetch(RENDER_ENDPOINT + "/loras", { headers: { "Authorization": "Bearer " + token } });
      var d = await r.json();
      var opts = '<option value="">None</option>';
      if (mine.length) {
        opts += '<optgroup label="Your trained identities">';
        mine.forEach(function (t) {
          var label = (t.trigger_word || t.name || t.lora_file).trim();
          opts += '<option value="' + esc(t.lora_file) + '">' + esc(label) + '</option>';
        });
        opts += '</optgroup>';
      }
      var others = (d.loras || []);
      if (others.length) {
        opts += '<optgroup label="Installed / uploaded LoRAs">';
        others.forEach(function (n) { opts += '<option value="' + esc(n) + '">' + esc(n) + '</option>'; });
        opts += '</optgroup>';
      }
      sel.innerHTML = opts;
      var trained = mine.length
        ? "Your trained " + family + " identities are listed at the top — pick one, and remember to include its trigger word in the prompt. "
        : "";
      document.getElementById("loraMsg").innerHTML = trained + (d.configured === false
        ? "Uploading is off until the LoRA folder is set on the server."
        : "Remember to add your LoRA&rsquo;s <strong>trigger word</strong> to the prompt.");
    } catch (e) {
      // Even if the render service is unreachable, still show trained identities.
      if (mine.length) {
        var o = '<option value="">None</option><optgroup label="Your trained identities">';
        mine.forEach(function (t) {
          o += '<option value="' + esc(t.lora_file) + '">' + esc((t.trigger_word || t.name || t.lora_file).trim()) + '</option>';
        });
        sel.innerHTML = o + '</optgroup>';
      }
    }
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  async function onLoraUpload() {
    var f = document.getElementById("loraFile").files[0];
    if (!f) return;
    setStatus("Uploading LoRA (" + Math.round(f.size / 1048576) + " MB)…");
    var fd = new FormData(); fd.append("file", f);
    try {
      var token = await freshToken();
      var r = await fetch(RENDER_ENDPOINT + "/loras", { method: "POST", headers: { "Authorization": "Bearer " + token }, body: fd });
      var d = await r.json();
      if (!r.ok) throw new Error(d.detail || "upload failed");
      await loadLoras();
      document.getElementById("loraPick").value = d.name;
      setStatus("LoRA uploaded and selected.", "success");
    } catch (e) {
      setStatus("Couldn’t upload the LoRA: " + e.message, "error");
    }
    document.getElementById("loraFile").value = "";
  }

  // ---- generate ----------------------------------------------------------
  async function onGenerate() {
    if (!selected) { setStatus("Pick a model first.", "error"); return; }
    var prompt = (document.getElementById("imgPrompt").value || "").trim();
    if (!prompt) { setStatus("Please write a prompt.", "error"); return; }
    var img = document.getElementById("imgInput").files[0];
    if (selected.type === "edit" && !img) { setStatus("Add a photo to edit.", "error"); return; }

    var token = await freshToken();
    if (!token) { setStatus("Your session expired — please log in again.", "error"); return; }

    var fd = new FormData();
    fd.append("model", selected.id);
    fd.append("mode", selected.type);
    fd.append("prompt", prompt);
    fd.append("negative", (document.getElementById("imgNegative").value || "").trim());
    fd.append("batch", getRadio("imgBatch", "1"));
    if (selected.type === "create") {
      var size = getRadio("imgSize", "1024x1024").split("x");
      fd.append("width", size[0]); fd.append("height", size[1]);
    }
    if (selected.lora) {
      fd.append("lora", document.getElementById("loraPick").value || "");
      fd.append("lora_strength", (document.getElementById("loraStrength").value / 10).toFixed(2));
    }
    if (img) fd.append("image", img);

    setBusy(true);
    setStatus("Queued…");
    showProgress(2, "Queued…");

    var jobId;
    try {
      var r = await fetch(RENDER_ENDPOINT + "/image-jobs", { method: "POST", headers: { "Authorization": "Bearer " + token }, body: fd });
      var data = await r.json();
      if (!r.ok) throw new Error(data.detail || ("HTTP " + r.status));
      jobId = data.job_id;
      lastJobId = jobId;
    } catch (e) {
      setStatus("Couldn’t reach the render service. It may be offline.", "error");
      setBusy(false); return;
    }
    pollFails = 0;
    pollJob(jobId);
  }

  function pollJob(jobId) {
    clearTimeout(pollTimer);
    pollTimer = setTimeout(async function () {
      try {
        var token = await freshToken();
        var r = await fetch(RENDER_ENDPOINT + "/jobs/" + jobId, { headers: { "Authorization": "Bearer " + token } });
        if (r.status === 404) { setStatus("This job is no longer running (service may have restarted).", "error"); setBusy(false); return; }
        if (!r.ok) throw new Error("HTTP " + r.status);
        pollFails = 0;
        var j = await r.json();
        if (j.status === "done") { showProgress(100, "Done"); onDone(j); return; }
        if (j.status === "cancelled") { setStatus("Cancelled.", "error"); setBusy(false); return; }
        if (j.status === "error") { setStatus("Generation failed: " + (j.error || "unknown error"), "error"); setBusy(false); return; }
        var lbl = j.stage || "Generating…";
        if (j.eta_seconds != null && j.eta_seconds > 0) lbl += " • ~" + fmtDur(j.eta_seconds) + " left";
        showProgress(Math.max(2, Math.min(99, j.progress || 0)), lbl);
        pollJob(jobId);
      } catch (e) {
        pollFails++;
        if (pollFails >= 5) { setStatus("Lost connection — your image may still finish. Check your gallery shortly.", "error"); setBusy(false); return; }
        pollJob(jobId);
      }
    }, POLL_MS);
  }

  function onDone(j) {
    setBusy(false);
    document.getElementById("imgProgress").style.display = "none";
    setStatus("Done.", "success");
    var urls = (j.urls || []).map(function (u) { return absUrl(u) + (u.indexOf("?") >= 0 ? "&" : "?") + "v=" + Date.now(); });
    renderImages(document.getElementById("imgResultGrid"), urls);
    document.getElementById("imgResults").style.display = "";
    setTimeout(loadRecent, 1500);
  }

  async function onCancel() {
    if (!lastJobId) return;
    try {
      var token = await freshToken();
      await fetch(RENDER_ENDPOINT + "/jobs/" + lastJobId + "/cancel", { method: "POST", headers: { "Authorization": "Bearer " + token } });
      setStatus("Cancelling…");
    } catch (e) {}
  }

  // ---- recent gallery strip ----------------------------------------------
  async function loadRecent() {
    if (!user) return;
    var res = await client.from("image_jobs").select("id, urls, created_at")
      .eq("user_id", user.id).eq("status", "done")
      .order("created_at", { ascending: false }).limit(8);
    if (res.error || !res.data) return;
    var urls = [];
    res.data.forEach(function (row) { (row.urls || []).forEach(function (u) { urls.push(absUrl(u)); }); });
    if (urls.length) {
      document.getElementById("imgGalleryWrap").style.display = "";
      renderImages(document.getElementById("imgRecent"), urls.slice(0, 12));
    }
  }

  function renderImages(host, urls) {
    host.innerHTML = urls.map(function (u) {
      return '<a class="image-cell" href="' + u + '" download><img loading="lazy" src="' + u + '" alt="Generated image" /></a>';
    }).join("");
    Array.prototype.forEach.call(host.querySelectorAll(".image-cell"), function (a) {
      a.addEventListener("click", function (e) { e.preventDefault(); lightbox(a.getAttribute("href")); });
    });
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

  // ---- helpers -----------------------------------------------------------
  async function freshToken() {
    var r = await client.auth.getSession();
    var sess = r.data.session;
    if (sess && sess.expires_at && sess.expires_at - Math.floor(Date.now() / 1000) < 120) {
      try { var rr = await client.auth.refreshSession(); if (rr.data && rr.data.session) sess = rr.data.session; } catch (e) {}
    }
    return sess ? sess.access_token : null;
  }
  function getRadio(name, dv) { var el = document.querySelector('input[name="' + name + '"]:checked'); return el ? el.value : dv; }
  function setStatus(m, k) { var e = document.getElementById("imgStatus"); e.textContent = m || ""; e.className = "form-status" + (k ? " " + k : ""); }
  function showProgress(p, l) { var pr = document.getElementById("imgProgress"); pr.style.display = ""; document.getElementById("imgProgressFill").style.width = p + "%"; document.getElementById("imgProgressLabel").textContent = l || ""; }
  function setBusy(b) {
    document.getElementById("imgGenerateBtn").disabled = b;
    document.getElementById("imgCancelBtn").style.display = b ? "" : "none";
    if (!b) document.getElementById("imgProgress").style.display = "none";
  }
  function absUrl(u) { if (!u) return u; return /^https?:\/\//i.test(u) ? u : RENDER_ENDPOINT + (u.charAt(0) === "/" ? "" : "/") + u; }
  function fmtDur(s) { s = Math.max(0, Math.round(s)); var m = Math.floor(s / 60), sec = s % 60; return m ? m + "m" : sec + "s"; }
})();

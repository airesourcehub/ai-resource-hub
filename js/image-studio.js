// AI Resource Hub — Image Studio (generator layout).
// Feed of your generations + a docked prompt composer, wired to the same
// render service as before (POST /image-jobs, GET /jobs/:id, cancel, /loras,
// /status). Jobs still queue one at a time on the desktop GPU.
//
// Server contract (unchanged): multipart form with model, mode (create|edit),
// prompt, negative, batch, width+height, size=custom (edits at a set size;
// without it edits keep the photo's size), lora + lora_strength
// (LoRA models), image (edit models, ONE photo).

(function () {
  var RENDER_ENDPOINT = "https://render.airesourcehub.vip";
  var POLL_MS = 3000;
  var STATUS_MS = 20000;
  var PAGE = 20;
  var PREFS_KEY = "airh-image-studio";

  // Mirrors the service registry (image_support.py).
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
    { id: "qwen_edit2511", name: "Qwen Edit 2511", type: "edit", category: "edit", lora: true, family: "qwen", note: "Latest Qwen edit." },
    { id: "firered", name: "FireRed Edit", type: "edit", category: "edit", lora: true, family: "qwen", note: "Detailed photo edits." },
    { id: "flux2_edit", name: "FLUX.2 Image-to-Image", type: "edit", category: "i2i", lora: true, family: "flux", note: "Transform a photo with a prompt." }
  ];
  var CATEGORIES = [
    { key: "t2i", label: "Text to image" },
    { key: "edit", label: "Edit a photo" },
    { key: "i2i", label: "Image to image" }
  ];
  var RATIOS = [
    { id: "1:1", w: 1024, h: 1024 },
    { id: "3:4", w: 896, h: 1152 },
    { id: "4:3", w: 1152, h: 896 },
    { id: "2:3", w: 832, h: 1216 },
    { id: "3:2", w: 1216, h: 832 },
    { id: "9:16", w: 768, h: 1344 },
    { id: "16:9", w: 1344, h: 768 }
  ];
  var DEFAULT_EDIT = "qwen_edit2509";
  var ENHANCERS = ["highly detailed", "sharp focus", "professional lighting", "rich color", "8k, crisp"];

  var THUMB_BASE = (typeof SUPABASE_URL !== "undefined" ? SUPABASE_URL : "") + "/storage/v1/object/public/model-thumbnails/";
  var TB = Date.now();

  if (!document.getElementById("composer")) return;
  var $ = function (id) { return document.getElementById(id); };
  var hasSupabase = !!(window.supabase && typeof SUPABASE_URL !== "undefined");
  var client = hasSupabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

  var prefs = loadPrefs();
  var state = {
    user: null,
    model: byId(prefs.model) || MODELS[0],
    ratio: ratioById(prefs.ratio) || RATIOS[0],
    editRatio: (prefs.editRatio && (prefs.editRatio === "photo" || ratioById(prefs.editRatio))) ? prefs.editRatio : "photo", // edits: "photo" = keep the photo's size
    batch: clamp(Number(prefs.batch) || 1, 1, 4),
    lastEdit: prefs.lastEdit || DEFAULT_EDIT,
    ref: null,            // { blob, url }
    jobs: [],             // newest first; { id, model, prompt, negative, status, urls, width, height, batch, created_at, pending, progress, stage, error }
    offset: 0,
    statusTimer: null
  };

  // ---------------------------------------------------------------- init
  buildModelList();
  buildRatios();
  buildCount();
  wireComposer();
  wirePopovers();
  wireDragDrop();
  syncChips();
  autosize();
  applyLinkParams();

  if (client) {
    client.auth.getSession().then(function (r) {
      setUser(r.data.session ? r.data.session.user : null);
    });
    client.auth.onAuthStateChange(function (_e, sess) {
      var next = sess ? sess.user : null;
      if ((next && next.id) !== (state.user && state.user.id)) setUser(next);
    });
  } else {
    setUser(null);
  }

  function setUser(u) {
    state.user = u;
    state.jobs = [];
    state.offset = 0;
    renderFeed();
    syncGenerate();
    clearInterval(state.statusTimer);
    if (u) {
      loadHistory();
      resumeRunning();
      refreshStatus();
      state.statusTimer = setInterval(function () { if (!document.hidden) refreshStatus(); }, STATUS_MS);
      if (state.model.lora) loadLoras();
    } else {
      paintGpu("idle", "Log in to see the queue.");
    }
  }

  // ------------------------------------------------------------ composer
  function wireComposer() {
    var ta = $("prompt");
    ta.addEventListener("input", function () { autosize(); syncGenerate(); });
    ta.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); $("composer").requestSubmit(); }
    });
    $("composer").addEventListener("submit", function (e) { e.preventDefault(); onGenerate(); });
    $("enhanceBtn").addEventListener("click", enhancePrompt);
    $("refAdd").addEventListener("click", function () { $("refInput").click(); });
    $("refInput").addEventListener("change", function () {
      var f = this.files && this.files[0];
      if (f) setRef(f);
      this.value = "";
    });
    $("refRemove").addEventListener("click", function () { clearRef(); });
    $("negative").addEventListener("input", syncChips);
    $("loraPick").addEventListener("change", syncChips);
    $("loraStrength").addEventListener("input", function () {
      $("loraStrengthOut").textContent = (this.value / 10).toFixed(1);
    });
    $("loraFile").addEventListener("change", onLoraUpload);
    $("modelSearch").addEventListener("input", function () { buildModelList(this.value); });

    Array.prototype.forEach.call(document.querySelectorAll("#studioStarters button"), function (b) {
      b.addEventListener("click", function () {
        ta.value = b.getAttribute("data-prompt");
        autosize(); syncGenerate(); ta.focus();
      });
    });

    document.addEventListener("paste", function (e) {
      var items = (e.clipboardData && e.clipboardData.items) || [];
      for (var i = 0; i < items.length; i++) {
        if (items[i].type && items[i].type.indexOf("image/") === 0) {
          var f = items[i].getAsFile();
          if (f) { e.preventDefault(); setRef(f); return; }
        }
      }
    });

    $("studioMore").addEventListener("click", loadHistory);
  }

  function autosize() {
    var ta = $("prompt");
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 220) + "px";
  }

  function enhancePrompt() {
    var ta = $("prompt");
    var cur = ta.value.trim();
    if (!cur) { ta.focus(); hint("Write a prompt first, then enhance it."); return; }
    var low = cur.toLowerCase();
    var adds = ENHANCERS.filter(function (t) { return low.indexOf(t.split(",")[0]) === -1; });
    if (!adds.length) { hint("That prompt already has quality detail."); return; }
    ta.value = cur.replace(/[,.\s]+$/, "") + ", " + adds.join(", ") + ".";
    autosize(); ta.focus();
  }

  function syncGenerate() {
    var btn = $("generateBtn");
    if (!state.user) {
      btn.textContent = "Log in to generate";
      btn.disabled = false;
      return;
    }
    btn.textContent = state.model.type === "edit" ? "Generate edit" : "Generate";
    var needsRef = state.model.type === "edit" && !state.ref;
    btn.disabled = !$("prompt").value.trim() || needsRef;
    if (needsRef) hint(state.model.name + " edits a photo. Add one with + (or drag it in), or pick a text-to-image model.");
    else if ($("composerHint").getAttribute("data-kind") === "needs-ref") hint("");
  }

  function hint(msg, isError, kind) {
    var el = $("composerHint");
    el.textContent = msg || "";
    el.classList.toggle("is-error", !!isError);
    el.setAttribute("data-kind", msg && /edits a photo/.test(msg) ? "needs-ref" : (kind || ""));
  }

  // ----------------------------------------------------------- reference
  function setRef(fileOrBlob, previewUrl) {
    if (!fileOrBlob || (fileOrBlob.type && fileOrBlob.type.indexOf("image/") !== 0)) {
      hint("That file isn't an image. Use a JPG, PNG or WebP.", true);
      return;
    }
    if (state.ref && state.ref.ownUrl) URL.revokeObjectURL(state.ref.url);
    var own = !previewUrl;
    var url = previewUrl || URL.createObjectURL(fileOrBlob);
    state.ref = { blob: fileOrBlob, url: url, ownUrl: own };
    $("refImg").src = url;
    $("refThumb").hidden = false;
    $("refAdd").hidden = true;
    if (state.model.type === "create") {
      var m = byId(state.lastEdit) || byId(DEFAULT_EDIT);
      selectModel(m.id, true);
      hint("Switched to " + m.name + " to edit your photo. Pick another edit model from the model menu any time.");
    } else {
      hint("");
    }
    syncChips(); syncGenerate();
    $("prompt").focus();
  }

  function clearRef() {
    if (state.ref && state.ref.ownUrl) URL.revokeObjectURL(state.ref.url);
    state.ref = null;
    $("refThumb").hidden = true;
    $("refAdd").hidden = false;
    $("refImg").removeAttribute("src");
    syncChips(); syncGenerate();
  }

  function wireDragDrop() {
    var depth = 0;
    var veil = $("dropVeil");
    function hasFiles(e) { return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], "Files") !== -1; }
    document.addEventListener("dragenter", function (e) {
      if (!hasFiles(e)) return;
      depth++; veil.hidden = false; $("composer").classList.add("is-dragging");
    });
    document.addEventListener("dragleave", function (e) {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) { veil.hidden = true; $("composer").classList.remove("is-dragging"); }
    });
    document.addEventListener("dragover", function (e) { if (hasFiles(e)) e.preventDefault(); });
    document.addEventListener("drop", function (e) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0; veil.hidden = true; $("composer").classList.remove("is-dragging");
      var f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) setRef(f);
    });
  }

  // ------------------------------------------------------------- popovers
  function wirePopovers() {
    Array.prototype.forEach.call(document.querySelectorAll(".chip[data-pop]"), function (chip) {
      chip.setAttribute("aria-expanded", "false");
      chip.addEventListener("click", function (e) {
        e.stopPropagation();
        var pop = $(chip.getAttribute("data-pop"));
        var open = !pop.hidden;
        closePops();
        if (!open) openPop(chip, pop);
      });
    });
    document.addEventListener("click", function (e) {
      if (!e.target.closest(".pop")) closePops();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { closePops(); closeLightbox(); }
    });
    window.addEventListener("resize", closePops);
  }

  function openPop(chip, pop) {
    pop.hidden = false;
    chip.setAttribute("aria-expanded", "true");
    var form = $("composer").getBoundingClientRect();
    var c = chip.getBoundingClientRect();
    var left = c.left - form.left;
    var maxLeft = form.width - pop.offsetWidth - 8;
    pop.style.left = Math.max(8, Math.min(left, maxLeft)) + "px";
    var focusable = pop.querySelector("input[type=search], .is-on, button, select, textarea");
    if (focusable && window.matchMedia("(hover: hover)").matches) focusable.focus();
  }

  function closePops() {
    Array.prototype.forEach.call(document.querySelectorAll(".pop"), function (p) { p.hidden = true; });
    Array.prototype.forEach.call(document.querySelectorAll(".chip[data-pop]"), function (c) { c.setAttribute("aria-expanded", "false"); });
  }

  // Links from the gallery: ?prompt=…&model=…&ref=<image url>
  function applyLinkParams() {
    var q;
    try { q = new URLSearchParams(location.search); } catch (e) { return; }
    var prompt = q.get("prompt"), model = q.get("model"), ref = q.get("ref");
    if (!prompt && !model && !ref) return;
    if (model) {
      var want = model.toLowerCase().replace(/[^a-z0-9]/g, "");
      var match = MODELS.filter(function (m) {
        var id = m.id.replace(/[^a-z0-9]/g, ""), nm = m.name.toLowerCase().replace(/[^a-z0-9]/g, "");
        return id === want || nm === want || (want.length > 3 && (nm.indexOf(want) !== -1 || want.indexOf(nm) !== -1));
      })[0];
      if (match) selectModel(match.id, true);
    }
    if (prompt) { $("prompt").value = prompt; autosize(); }
    if (ref) useAsRef(ref);
    else if (prompt) hint("Prompt loaded from the gallery. Pick a model and ratio, then generate.");
    syncGenerate();
    try { history.replaceState(null, "", location.pathname); } catch (e) {}
  }

  // ---------------------------------------------------------- model menu
  function thumbCss(id) {
    return "background-image:url(" + THUMB_BASE + id + ".jpg?t=" + TB + "),url(img/models/" + id + ".jpg)";
  }

  function buildModelList(filter) {
    var q = (filter || "").trim().toLowerCase();
    var html = "";
    CATEGORIES.forEach(function (cat) {
      var list = MODELS.filter(function (m) {
        return m.category === cat.key && (!q || (m.name + " " + m.note).toLowerCase().indexOf(q) !== -1);
      });
      if (!list.length) return;
      html += '<p class="model-group-title">' + cat.label + "</p>";
      list.forEach(function (m) {
        html += '<button type="button" class="model-opt' + (m.id === state.model.id ? " is-on" : "") + '" data-id="' + m.id + '">' +
          '<span class="model-opt-thumb" style="' + thumbCss(m.id) + '"></span>' +
          '<span><span class="model-opt-name">' + esc(m.name) + (m.lora ? ' <span class="mini-tag">LoRA</span>' : "") + "</span>" +
          '<span class="model-opt-note">' + esc(m.note) + "</span></span></button>";
      });
    });
    $("modelList").innerHTML = html || '<p class="pop-note">No model matches that search.</p>';
    Array.prototype.forEach.call($("modelList").querySelectorAll(".model-opt"), function (b) {
      b.addEventListener("click", function () { selectModel(b.getAttribute("data-id")); closePops(); $("prompt").focus(); });
    });
  }

  function selectModel(id, quiet) {
    var m = byId(id);
    if (!m) return;
    state.model = m;
    if (m.type === "edit") state.lastEdit = m.id;
    if (m.type === "create" && state.ref) {
      clearRef();
      if (!quiet) hint(m.name + " makes images from text, so the photo was removed.");
    } else if (!quiet) {
      hint("");
    }
    savePrefs();
    buildModelList($("modelSearch").value);
    if (m.lora) loadLoras(); else $("loraPick").value = "";
    buildRatios(); syncChips(); syncGenerate();
  }

  // --------------------------------------------------------- ratio/count
  function ratioBox(r, max) {
    var s = max / Math.max(r.w, r.h);
    return '<span class="ratio-icon" style="width:' + Math.round(r.w * s) + "px;height:" + Math.round(r.h * s) + 'px"></span>';
  }

  // The size the next run will use: a RATIOS entry, or null = keep the photo's size (edits only).
  function outRatio() {
    if (state.model.type !== "edit") return state.ratio;
    return state.editRatio === "photo" ? null : ratioById(state.editRatio);
  }

  function buildRatios() {
    var isEdit = state.model.type === "edit";
    var cur = outRatio();
    var html = isEdit
      ? '<button type="button" class="ratio-opt ratio-photo' + (cur ? "" : " is-on") + '" data-id="photo">' +
        '<span class="ratio-box"><span class="ratio-icon ratio-icon-photo" aria-hidden="true"></span></span>Photo<small>Keep its size</small></button>'
      : "";
    html += RATIOS.map(function (r) {
      return '<button type="button" class="ratio-opt' + (cur && r.id === cur.id ? " is-on" : "") + '" data-id="' + r.id + '">' +
        '<span class="ratio-box">' + ratioBox(r, 28) + "</span>" + r.id + "<small>" + r.w + "&times;" + r.h + "</small></button>";
    }).join("");
    $("ratioGrid").innerHTML = html;
    $("ratioGrid").style.gridTemplateColumns = "repeat(4, 1fr)";
    $("ratioNote").hidden = !isEdit;
    Array.prototype.forEach.call($("ratioGrid").querySelectorAll(".ratio-opt"), function (b) {
      b.addEventListener("click", function () {
        var id = b.getAttribute("data-id");
        if (state.model.type === "edit") state.editRatio = id;
        else state.ratio = ratioById(id);
        savePrefs(); buildRatios(); syncChips(); closePops();
      });
    });
  }

  function buildCount() {
    var html = "";
    for (var n = 1; n <= 4; n++) html += '<button type="button" data-n="' + n + '"' + (n === state.batch ? ' class="is-on"' : "") + ">" + n + "</button>";
    $("countSeg").innerHTML = html;
    Array.prototype.forEach.call($("countSeg").querySelectorAll("button"), function (b) {
      b.addEventListener("click", function () {
        state.batch = Number(b.getAttribute("data-n"));
        savePrefs(); buildCount(); syncChips(); closePops();
      });
    });
  }

  function syncChips() {
    var m = state.model;
    $("chipModelThumb").setAttribute("style", thumbCss(m.id));
    $("chipModelName").textContent = m.name;
    var r = outRatio();
    $("chipRatio").disabled = false;
    $("chipRatio").title = r ? r.w + " × " + r.h : "Same size as your photo";
    $("chipRatioName").textContent = r ? r.id : "Photo size";
    $("chipRatioIcon").outerHTML = r
      ? '<span class="ratio-icon" id="chipRatioIcon" style="' + ratioBox(r, 14).match(/style="([^"]+)"/)[1] + '"></span>'
      : '<span class="ratio-icon ratio-icon-photo" id="chipRatioIcon"></span>';
    $("chipCountName").textContent = state.batch + (state.batch === 1 ? " image" : " images");
    $("chipLora").hidden = !m.lora;
    var lora = $("loraPick");
    var loraLabel = lora.value ? (lora.options[lora.selectedIndex] || {}).text : "";
    $("chipLoraName").textContent = loraLabel ? "LoRA: " + truncate(loraLabel, 18) : "LoRA";
    $("chipLora").classList.toggle("is-set", !!lora.value);
    var neg = $("negative").value.trim();
    $("chipAvoidName").textContent = neg ? "Avoid: " + truncate(neg, 16) : "Avoid";
    $("chipAvoid").classList.toggle("is-set", !!neg);
  }

  // ---------------------------------------------------------------- LoRA
  async function myTrainedLoras(family) {
    if (!state.user || !family || !client) return [];
    try {
      var res = await client.from("training_jobs")
        .select("name, trigger_word, base, lora_file, created_at")
        .eq("user_id", state.user.id).eq("base", family).eq("status", "done")
        .order("created_at", { ascending: false });
      return (res.data || []).filter(function (t) { return t.lora_file && !/[\\/]/.test(t.lora_file); });
    } catch (e) { return []; }
  }

  async function loadLoras() {
    if (!state.user) return;
    var sel = $("loraPick");
    var keep = sel.value;
    var family = state.model.family;
    var mine = await myTrainedLoras(family);
    var opts = '<option value="">None</option>';
    if (mine.length) {
      opts += '<optgroup label="Your trained identities">';
      mine.forEach(function (t) { opts += '<option value="' + esc(t.lora_file) + '">' + esc((t.trigger_word || t.name || t.lora_file).trim()) + "</option>"; });
      opts += "</optgroup>";
    }
    var msg = "Add your LoRA's trigger word to the prompt.";
    try {
      var token = await freshToken();
      var r = await fetch(RENDER_ENDPOINT + "/loras", { headers: { Authorization: "Bearer " + token } });
      var d = await r.json();
      if ((d.loras || []).length) {
        opts += '<optgroup label="Installed and uploaded">';
        d.loras.forEach(function (n) { opts += '<option value="' + esc(n) + '">' + esc(n) + "</option>"; });
        opts += "</optgroup>";
      }
      if (d.configured === false) msg = "Uploading is off until the LoRA folder is set on the server.";
    } catch (e) {
      msg = "The GPU server isn't reachable, so only your trained identities are listed.";
    }
    sel.innerHTML = opts;
    if (keep && sel.querySelector('option[value="' + cssEsc(keep) + '"]')) sel.value = keep;
    $("loraMsg").textContent = msg;
    syncChips();
  }

  async function onLoraUpload() {
    var f = $("loraFile").files[0];
    if (!f) return;
    $("loraMsg").textContent = "Uploading " + f.name + " (" + Math.round(f.size / 1048576) + " MB)…";
    var fd = new FormData(); fd.append("file", f);
    try {
      var token = await freshToken();
      var r = await fetch(RENDER_ENDPOINT + "/loras", { method: "POST", headers: { Authorization: "Bearer " + token }, body: fd });
      var d = await r.json();
      if (!r.ok) throw new Error(d.detail || "upload failed");
      await loadLoras();
      $("loraPick").value = d.name;
      syncChips();
      $("loraMsg").textContent = "Uploaded and selected. Add its trigger word to the prompt.";
    } catch (e) {
      $("loraMsg").textContent = "Upload failed: " + e.message;
    }
    $("loraFile").value = "";
  }

  // ------------------------------------------------------------ generate
  async function onGenerate() {
    if (!state.user) { window.location.href = "auth.html"; return; }
    var m = state.model;
    var prompt = $("prompt").value.trim();
    if (!prompt) { hint("Write a prompt first.", true); return; }
    if (m.type === "edit" && !state.ref) { syncGenerate(); return; }

    var token = await freshToken();
    if (!token) { hint("Your session expired. Log in again to keep generating.", true); return; }

    var fd = new FormData();
    fd.append("model", m.id);
    fd.append("mode", m.type);
    fd.append("prompt", prompt);
    var negative = $("negative").value.trim();
    fd.append("negative", negative);
    fd.append("batch", String(state.batch));
    var out = outRatio();
    if (out) { fd.append("width", String(out.w)); fd.append("height", String(out.h)); }
    if (m.type === "edit" && out) fd.append("size", "custom");
    if (m.lora) {
      fd.append("lora", $("loraPick").value || "");
      fd.append("lora_strength", ($("loraStrength").value / 10).toFixed(2));
    }
    if (m.type === "edit" && state.ref) {
      var name = state.ref.blob.name || "reference." + ((state.ref.blob.type || "image/png").split("/")[1] || "png");
      fd.append("image", state.ref.blob, name);
    }

    var tempId = "tmp-" + Date.now();
    var refAspect = await aspectOf(state.ref && state.ref.url);
    var job = {
      id: tempId, model: m.id, prompt: prompt, negative: negative, status: "queued",
      width: out ? out.w : refAspect.w, height: out ? out.h : refAspect.h,
      batch: state.batch, created_at: new Date().toISOString(), pending: true, progress: 2, stage: "Sending to the GPU…"
    };
    state.jobs.unshift(job);
    renderFeed();
    window.scrollTo({ top: 0, behavior: prefersReduced() ? "auto" : "smooth" });
    hint("");

    try {
      var r = await fetch(RENDER_ENDPOINT + "/image-jobs", { method: "POST", headers: { Authorization: "Bearer " + token }, body: fd });
      var data = await r.json().catch(function () { return {}; });
      if (!r.ok) throw new Error(data.detail || ("HTTP " + r.status));
      job.id = data.job_id;
      job.stage = "Queued";
      renderFeed();
      poll(job);
    } catch (e) {
      job.pending = false; job.status = "error";
      job.error = /Failed to fetch|NetworkError|HTTP 5/.test(e.message)
        ? "The GPU server isn't reachable right now. Check System status, then try again."
        : e.message;
      renderFeed();
    }
  }

  function poll(job, fails) {
    fails = fails || 0;
    setTimeout(async function () {
      if (!job.pending) return;
      try {
        var token = await freshToken();
        var r = await fetch(RENDER_ENDPOINT + "/jobs/" + job.id, { headers: { Authorization: "Bearer " + token } });
        if (r.status === 404) { finish(job, "error", null, "This job stopped running, probably because the GPU server restarted."); return; }
        if (!r.ok) throw new Error("HTTP " + r.status);
        var j = await r.json();
        if (j.status === "done") { finish(job, "done", j.urls || []); return; }
        if (j.status === "cancelled") { finish(job, "cancelled"); return; }
        if (j.status === "error") { finish(job, "error", null, j.error || "The render failed."); return; }
        job.progress = Math.max(2, Math.min(99, j.progress || 0));
        var lbl = j.stage || (j.status === "queued" ? "Waiting in the queue" : "Generating");
        if (j.eta_seconds > 0) lbl += " · about " + fmtDur(j.eta_seconds) + " left";
        job.stage = lbl;
        updatePending(job);
        poll(job, 0);
      } catch (e) {
        if (fails + 1 >= 6) {
          job.stage = "Lost touch with the GPU server. Your image may still finish; refresh in a minute.";
          updatePending(job);
          return;
        }
        poll(job, fails + 1);
      }
    }, POLL_MS);
  }

  function finish(job, status, urls, error) {
    job.pending = false;
    job.status = status;
    if (urls) job.urls = urls;
    if (error) job.error = error;
    if (status === "cancelled") state.jobs = state.jobs.filter(function (j) { return j !== job; });
    renderFeed();
    refreshStatus();
  }

  async function cancelJob(job) {
    if (!job || String(job.id).indexOf("tmp-") === 0) return;
    job.stage = "Cancelling…";
    updatePending(job);
    try {
      var token = await freshToken();
      await fetch(RENDER_ENDPOINT + "/jobs/" + job.id + "/cancel", { method: "POST", headers: { Authorization: "Bearer " + token } });
    } catch (e) {}
  }

  // ------------------------------------------------------------- history
  async function loadHistory() {
    if (!state.user || !client) return;
    var btn = $("studioMore");
    btn.disabled = true;
    var res = await client.from("image_jobs")
      .select("id, model, mode, prompt, negative, status, urls, width, height, batch, lora, error, created_at")
      .eq("user_id", state.user.id).in("status", ["done", "error"])
      .order("created_at", { ascending: false })
      .range(state.offset, state.offset + PAGE - 1);
    btn.disabled = false;
    if (res.error) return;
    var rows = res.data || [];
    state.offset += rows.length;
    var known = {};
    state.jobs.forEach(function (j) { known[j.id] = true; });
    rows.forEach(function (row) { if (!known[row.id]) state.jobs.push(row); });
    btn.hidden = rows.length < PAGE;
    renderFeed();
  }

  // Pick back up any render that was still running when the page was left.
  async function resumeRunning() {
    if (!client) return;
    var since = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
    var res = await client.from("image_jobs")
      .select("id, model, mode, prompt, negative, status, urls, width, height, batch, created_at")
      .eq("user_id", state.user.id).not("status", "in", "(done,error,cancelled)")
      .gte("created_at", since).order("created_at", { ascending: false });
    (res.data || []).forEach(function (row) {
      if (state.jobs.some(function (j) { return j.id === row.id; })) return;
      row.pending = true; row.progress = row.progress || 2; row.stage = "Reconnecting…";
      state.jobs.unshift(row);
      poll(row);
    });
    renderFeed();
  }

  // ---------------------------------------------------------------- feed
  function renderFeed() {
    var host = $("studioFeed");
    $("studio").classList.toggle("has-jobs", state.jobs.length > 0);
    host.innerHTML = "";
    host.classList.add("studio-wall");
    state.jobs.forEach(function (job) {
      jobTiles(job).forEach(function (t) { host.appendChild(t); });
    });
  }

  // One seamless masonry wall (Higgsfield-style): every image is its own tile
  // at its real shape; prompt, model and actions appear on hover.
  function jobTiles(job) {
    var m = byId(job.model);
    var modelName = m ? m.name : (job.model || "");
    var ratio = job.width && job.height ? closestRatio(job.width, job.height) : "";
    var guessAR = job.width && job.height ? job.width / job.height : 1;
    var tiles = [];

    if (job.pending) {
      for (var i = 0; i < (job.batch || 1); i++) {
        var ph = document.createElement("div");
        ph.className = "wtile is-pending";
        ph.setAttribute("data-job", job.id);
        ph.style.aspectRatio = String(guessAR);
        ph.innerHTML =
          '<div class="wtile-pending">' +
            '<p class="wtile-pending-prompt"></p>' +
            '<div class="job-progress-track"><span></span></div>' +
            '<div class="wtile-pending-row"><span class="job-stage"></span>' +
            (i === 0 ? '<button type="button" class="wtile-cancel">Cancel</button>' : "") + "</div>" +
          "</div>";
        ph.querySelector(".wtile-pending-prompt").textContent = job.prompt || "";
        var c = ph.querySelector(".wtile-cancel");
        if (c) c.addEventListener("click", function () { cancelJob(job); });
        paintProgress(ph, job);
        tiles.push(ph);
      }
      return tiles;
    }

    if (job.status === "error") {
      var err = document.createElement("div");
      err.className = "wtile is-error";
      err.innerHTML = '<strong>Didn&rsquo;t render</strong><p class="wtile-err-msg"></p><p class="wtile-err-prompt"></p>' +
        '<button type="button" class="wtile-cancel">Try again</button>';
      err.querySelector(".wtile-err-msg").textContent = job.error || "Unknown error.";
      err.querySelector(".wtile-err-prompt").textContent = job.prompt || "";
      err.querySelector("button").addEventListener("click", function () { reuseJob(job); });
      tiles.push(err);
      return tiles;
    }

    (job.urls || []).forEach(function (u, idx) {
      var src = absUrl(u);
      var t = document.createElement("div");
      t.className = "wtile";
      t.setAttribute("tabindex", "0");
      t.style.aspectRatio = String(guessAR); // placeholder until the real image size is known
      t.innerHTML =
        '<img loading="lazy" alt="" />' +
        '<div class="wtile-shade" aria-hidden="true"></div>' +
        '<div class="wtile-actions">' +
          '<button type="button" class="wtile-btn" data-act="edit" title="Edit this image" aria-label="Edit this image"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>' +
          '<button type="button" class="wtile-btn" data-act="reuse" title="Reuse prompt" aria-label="Reuse prompt"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 2l4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg></button>' +
          '<button type="button" class="wtile-btn" data-act="dl" title="Download" aria-label="Download"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12m0 0-4-4m4 4 4-4M5 21h14"/></svg></button>' +
        "</div>" +
        '<div class="wtile-meta"><p class="wtile-prompt"></p><span class="wtile-sub"></span></div>';
      t.querySelector(".wtile-prompt").textContent = job.prompt || "";
      t.querySelector(".wtile-sub").textContent = [modelName, ratio, when(job.created_at)].filter(Boolean).join(" · ");
      var img = t.querySelector("img");
      img.alt = "Generated image " + (idx + 1) + ": " + (job.prompt || "");
      img.addEventListener("load", function () {
        if (img.naturalWidth && img.naturalHeight) t.style.aspectRatio = img.naturalWidth + " / " + img.naturalHeight;
        t.classList.add("is-loaded");
      });
      img.addEventListener("error", function () {
        // Images live on the GPU server; when it's offline, show a calm placeholder instead of a broken icon.
        t.classList.add("is-missing");
        img.removeAttribute("alt");
        if (!t.querySelector(".shot-missing")) {
          var note = document.createElement("div");
          note.className = "shot-missing";
          note.innerHTML = "<strong>Image unavailable</strong><span>It's stored on the GPU server, which isn't reachable right now. It will show again once the server is back.</span>";
          t.appendChild(note);
        }
      });
      img.src = src;
      t.addEventListener("click", function (e) {
        if (e.target.closest(".wtile-btn") || t.classList.contains("is-missing")) return;
        openLightbox(src);
      });
      t.addEventListener("keydown", function (e) {
        if ((e.key === "Enter" || e.key === " ") && e.target === t) { e.preventDefault(); openLightbox(src); }
      });
      t.querySelector('[data-act="dl"]').addEventListener("click", function () { download(src, job); });
      t.querySelector('[data-act="edit"]').addEventListener("click", function () { useAsRef(src); });
      t.querySelector('[data-act="reuse"]').addEventListener("click", function () { reuseJob(job); });
      tiles.push(t);
    });
    return tiles;
  }

  function updatePending(job) {
    var els = document.querySelectorAll('[data-job="' + cssEsc(String(job.id)) + '"]');
    Array.prototype.forEach.call(els, function (el) { paintProgress(el, job); });
  }

  function paintProgress(el, job) {
    var bar = el.querySelector(".job-progress-track span");
    var st = el.querySelector(".job-stage");
    if (bar) bar.style.width = (job.progress || 2) + "%";
    if (st) st.textContent = job.stage || "Working…";
  }

  function reuseJob(job) {
    var m = byId(job.model);
    if (m) selectModel(m.id, true);
    $("prompt").value = job.prompt || "";
    $("negative").value = job.negative || "";
    if (job.width && job.height && m) {
      var r = RATIOS.filter(function (x) { return x.w === job.width && x.h === job.height; })[0];
      if (m.type === "create" && r) state.ratio = r;
      if (m.type === "edit") state.editRatio = r ? r.id : "photo";
      buildRatios();
    }
    if (job.batch) { state.batch = clamp(job.batch, 1, 4); buildCount(); }
    savePrefs(); autosize(); syncChips(); syncGenerate();
    if (m && m.type === "edit" && !state.ref) hint("Add the photo you want to edit, then generate.");
    $("prompt").focus();
  }

  async function useAsRef(src) {
    closeLightbox();
    hint("Loading that image as your photo…");
    try {
      var r = await fetch(src, { mode: "cors" });
      if (!r.ok) throw new Error();
      var blob = await r.blob();
      setRef(blob, src);
    } catch (e) {
      hint("Couldn't load that image as a photo. Download it, then drag it in.", true);
    }
  }

  // ------------------------------------------------------------ download
  async function download(src, job) {
    var base = "airesourcehub-" + (job && job.model ? job.model : "image") + "-" + Date.now();
    try {
      var r = await fetch(src, { mode: "cors" });
      if (!r.ok) throw new Error();
      var blob = await r.blob();
      var ext = (blob.type.split("/")[1] || "png").replace("jpeg", "jpg");
      var file = new File([blob], base + "." + ext, { type: blob.type });
      var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      if (isIOS && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file] });
        return;
      }
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url; a.download = file.name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    } catch (e) {
      window.open(src, "_blank", "noopener");
    }
  }

  // ------------------------------------------------------------ lightbox
  var lb = null, lbList = [], lbIdx = 0;

  function allShots() {
    var out = [];
    state.jobs.forEach(function (j) {
      if (j.pending || j.status !== "done") return;
      (j.urls || []).forEach(function (u) { out.push({ src: absUrl(u), job: j }); });
    });
    return out;
  }

  function openLightbox(src) {
    lbList = allShots();
    lbIdx = Math.max(0, lbList.findIndex(function (s) { return s.src === src; }));
    if (!lb) {
      lb = document.createElement("div");
      lb.className = "studio-lightbox";
      lb.setAttribute("role", "dialog");
      lb.setAttribute("aria-label", "Image viewer");
      lb.innerHTML =
        '<div class="lb-stage"><button type="button" class="lb-nav lb-prev" aria-label="Previous image">&#8592;</button>' +
        '<img alt="" /><button type="button" class="lb-nav lb-next" aria-label="Next image">&#8594;</button></div>' +
        '<aside class="lb-side"><button type="button" class="lb-close" aria-label="Close">&times;</button>' +
        '<p class="lb-prompt"></p><p class="lb-meta"></p>' +
        '<button type="button" class="btn btn-primary" data-act="dl">Download</button>' +
        '<button type="button" class="btn btn-secondary" data-act="edit">Edit this image</button>' +
        '<button type="button" class="btn btn-secondary" data-act="reuse">Reuse prompt</button></aside>';
      document.body.appendChild(lb);
      lb.querySelector(".lb-close").addEventListener("click", closeLightbox);
      lb.querySelector(".lb-prev").addEventListener("click", function () { stepLightbox(-1); });
      lb.querySelector(".lb-next").addEventListener("click", function () { stepLightbox(1); });
      lb.querySelector(".lb-stage").addEventListener("click", function (e) { if (e.target.classList.contains("lb-stage")) closeLightbox(); });
      lb.querySelector('[data-act="dl"]').addEventListener("click", function () { var s = lbList[lbIdx]; download(s.src, s.job); });
      lb.querySelector('[data-act="edit"]').addEventListener("click", function () { useAsRef(lbList[lbIdx].src); });
      lb.querySelector('[data-act="reuse"]').addEventListener("click", function () { var s = lbList[lbIdx]; closeLightbox(); reuseJob(s.job); });
      document.addEventListener("keydown", function (e) {
        if (!lb || lb.hidden) return;
        if (e.key === "ArrowLeft") stepLightbox(-1);
        if (e.key === "ArrowRight") stepLightbox(1);
      });
    }
    paintLightbox();
    lb.hidden = false;
    lb.querySelector(".lb-close").focus();
  }

  function paintLightbox() {
    var s = lbList[lbIdx];
    if (!s) return;
    var m = byId(s.job.model);
    lb.querySelector(".lb-stage img").src = s.src;
    lb.querySelector(".lb-prompt").textContent = s.job.prompt || "";
    lb.querySelector(".lb-meta").textContent = (m ? m.name : s.job.model) +
      (s.job.width ? " · " + s.job.width + "×" + s.job.height : "") + " · " + when(s.job.created_at);
    lb.querySelector(".lb-prev").hidden = lbList.length < 2;
    lb.querySelector(".lb-next").hidden = lbList.length < 2;
  }

  function stepLightbox(d) {
    if (!lbList.length) return;
    lbIdx = (lbIdx + d + lbList.length) % lbList.length;
    paintLightbox();
  }

  function closeLightbox() { if (lb) lb.hidden = true; }

  // --------------------------------------------------------- GPU status
  async function refreshStatus() {
    if (!state.user) return;
    try {
      var token = await freshToken();
      var r = await fetch(RENDER_ENDPOINT + "/status", { headers: { Authorization: "Bearer " + token } });
      if (!r.ok) throw new Error();
      var d = await r.json();
      var waiting = (d.queue || []).length;
      if (!d.comfy_up) paintGpu("down", "The GPU server is up but the image engine isn't running yet.");
      else if (d.busy || waiting) paintGpu("busy", "Busy" + (waiting ? " · " + waiting + " waiting" : "") + ". New jobs join the queue.");
      else paintGpu("up", "Ready. Your job starts right away.");
    } catch (e) {
      paintGpu("down", "Offline. The render machine isn't reachable right now.");
    }
  }

  function paintGpu(kind, detail) {
    var dot = $("gpuDot");
    dot.className = "gpu-dot" + (kind === "up" ? " is-up" : kind === "busy" ? " is-busy" : kind === "down" ? " is-down" : "");
    $("chipGpuName").textContent = kind === "up" ? "GPU ready" : kind === "busy" ? "GPU busy" : kind === "down" ? "GPU offline" : "Our GPU";
    $("gpuDetail").textContent = detail;
  }

  // ------------------------------------------------------------- helpers
  async function freshToken() {
    if (!client) return null;
    var r = await client.auth.getSession();
    var sess = r.data.session;
    if (sess && sess.expires_at && sess.expires_at - Math.floor(Date.now() / 1000) < 120) {
      try { var rr = await client.auth.refreshSession(); if (rr.data && rr.data.session) sess = rr.data.session; } catch (e) {}
    }
    return sess ? sess.access_token : null;
  }

  function aspectOf(url) {
    return new Promise(function (resolve) {
      if (!url) return resolve({ w: 1, h: 1 });
      var i = new Image();
      i.onload = function () { resolve({ w: i.naturalWidth || 1, h: i.naturalHeight || 1 }); };
      i.onerror = function () { resolve({ w: 1, h: 1 }); };
      i.src = url;
    });
  }

  function closestRatio(w, h) {
    var exact = RATIOS.filter(function (r) { return r.w === w && r.h === h; })[0];
    if (exact) return exact.id;
    var a = w / h, best = null, diff = 9;
    RATIOS.forEach(function (r) { var d = Math.abs(r.w / r.h - a); if (d < diff) { diff = d; best = r; } });
    return diff < 0.04 ? best.id : w + "×" + h;
  }

  function byId(id) { return MODELS.filter(function (m) { return m.id === id; })[0] || null; }
  function ratioById(id) { return RATIOS.filter(function (r) { return r.id === id; })[0] || null; }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function truncate(s, n) { s = String(s); return s.length > n ? s.slice(0, n - 1) + "…" : s; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function cssEsc(s) { return window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/["\\]/g, "\\$&"); }
  function absUrl(u) { if (!u) return u; return /^https?:\/\//i.test(u) ? u : RENDER_ENDPOINT + (u.charAt(0) === "/" ? "" : "/") + u; }
  function fmtDur(s) { s = Math.max(0, Math.round(s)); var m = Math.floor(s / 60), sec = s % 60; return m ? m + " min" : sec + "s"; }
  function prefersReduced() { return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; }

  function when(iso) {
    if (!iso) return "";
    var d = new Date(iso), s = (Date.now() - d.getTime()) / 1000;
    if (s < 60) return "just now";
    if (s < 3600) return Math.floor(s / 60) + " min ago";
    if (s < 86400) return Math.floor(s / 3600) + " h ago";
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function loadPrefs() { try { return JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") || {}; } catch (e) { return {}; } }
  function savePrefs() {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ model: state.model.id, ratio: state.ratio.id, editRatio: state.editRatio, batch: state.batch, lastEdit: state.lastEdit }));
    } catch (e) {}
  }
})();

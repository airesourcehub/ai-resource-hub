// AI Resource Hub — Background Remover.
// Runs entirely in the visitor's browser with Transformers.js (WebGPU when the
// browser has it, WebAssembly otherwise). Nothing is uploaded and the render PC
// is never used. Models: BiRefNet lite (MIT, any subject) and MODNet (people).
// Admin → Site Settings → "Background Remover" controls it (site_settings.site.bgRemover).
(function () {
  var $ = function (id) { return document.getElementById(id); };
  if (!$("brForm")) return;

  var TJS = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2/dist/transformers.min.js";
  var JSZIP = "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js";
  var MODELS = {
    best: { id: "onnx-community/BiRefNet_lite-ONNX", label: "Best quality" },
    fast: { id: "Xenova/modnet", label: "Fast (people)" }
  };
  var MAX_PIXELS = 40e6;      // larger pictures are scaled down to this
  var PREVIEW_SIDE = 1600;    // on-screen preview size; downloads are full size
  var SWATCHES = ["#ffffff", "#000000", "#f3f3f1", "#ff6a1f", "#ffd21f", "#ef4444", "#ff3b6b", "#a855f7", "#3b82f6", "#06b6d4", "#22c55e", "#d1fe17"];
  var BG_DEF = { enabled: true, guests: true, fast: true, model: "best", maxBatch: 20 };

  var client = (window.supabase && typeof SUPABASE_URL !== "undefined") ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
  var RENDER = function () { return window.AIRH_GPU ? window.AIRH_GPU.base() : "https://render.airesourcehub.vip"; };

  var cfg = Object.assign({}, BG_DEF);
  var st = {
    model: "best", bg: "none", color: "#ffffff", blur: 18, bgBmp: null, bgName: "", edge: 0, crop: false, shadow: false,
    items: [], cur: null, busy: false, user: null, admin: false, allowed: true, nextId: 1
  };
  var segs = {};          // model key -> Promise<pipeline>
  var noGpu = {};         // model key -> true once WebGPU failed for it on this computer
  var device = null;      // "webgpu" | "wasm" once a model is loaded

  // ---------------------------------------------------------------- helpers
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function status(t, k) { var s = $("brStatus"); s.textContent = t || ""; s.className = "form-status" + (t ? " show" : "") + (k ? " " + k : ""); }
  function progress(p, label) {
    if (p == null) { $("brProgress").style.display = "none"; return; }
    $("brProgress").style.display = ""; $("brProgressFill").style.width = Math.max(2, Math.min(100, p)) + "%"; $("brProgressLabel").textContent = label || "";
  }
  function mb(n) { return Math.round(n / 1048576) + " MB"; }
  function baseName(n) { return String(n || "picture").replace(/\.[^.]+$/, "").replace(/[^\w\- ]+/g, "").trim().slice(0, 60) || "picture"; }
  function absUrl(u) { if (!u) return u; return /^https?:\/\//i.test(u) ? u : RENDER() + (u.charAt(0) === "/" ? "" : "/") + u; }
  function isIOS() { return /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); }
  function canvas(w, h) { var c = document.createElement("canvas"); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
  function loadScript(src) {
    return new Promise(function (ok, bad) { var s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = function () { bad(new Error("Couldn't load " + src)); }; document.head.appendChild(s); });
  }

  // ---------------------------------------------------------------- settings + access
  function readCfg() {
    var s = null;
    try { s = JSON.parse(localStorage.getItem("airh-site-settings") || "null"); } catch (e) {}
    cfg = Object.assign({}, BG_DEF, (s && s.bgRemover) || {});
  }
  async function freshCfg() {
    if (typeof SUPABASE_URL === "undefined") return;
    try {
      var r = await fetch(SUPABASE_URL + "/rest/v1/site_settings?key=eq.site&select=value", { headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY } });
      var rows = r.ok ? await r.json() : [];
      var v = rows && rows[0] ? rows[0].value : null;
      cfg = Object.assign({}, BG_DEF, (v && v.bgRemover) || {});
    } catch (e) {}
  }
  async function whoAmI() {
    st.user = null; st.admin = false;
    if (!client) return;
    try {
      var s = await client.auth.getSession();
      st.user = s.data.session ? s.data.session.user : null;
      if (st.user) {
        var p = await client.from("profiles").select("is_admin").eq("id", st.user.id).maybeSingle();
        st.admin = !!(p.data && p.data.is_admin);
      }
    } catch (e) {}
  }
  function gate() {
    var g = $("brGate"), msg = "";
    if (cfg.enabled === false && !st.admin) msg = "The Background Remover is switched off right now. Check back soon.";
    else if (cfg.guests === false && !st.user) msg = 'The Background Remover is for members. <a href="auth.html">Log in</a> to use it — it’s free.';
    st.allowed = !msg;
    g.innerHTML = msg; g.style.display = msg ? "" : "none";
    $("brForm").style.display = msg ? "none" : "";
    if (cfg.enabled === false && st.admin) { g.innerHTML = "Switched off for visitors (Admin → Site Settings). You can still use it because you’re the admin."; g.style.display = ""; }
    $("brModelField").hidden = cfg.fast === false;
    if (cfg.fast === false) st.model = "best";
    $("brMine").hidden = !st.user;
    paint();
  }

  // ---------------------------------------------------------------- form
  function paint() {
    Array.prototype.forEach.call($("brModel").querySelectorAll("[data-m]"), function (b) {
      var on = b.getAttribute("data-m") === st.model; b.classList.toggle("is-on", on); b.setAttribute("aria-checked", on ? "true" : "false");
    });
    Array.prototype.forEach.call($("brBg").querySelectorAll("[data-bg]"), function (b) {
      var on = b.getAttribute("data-bg") === st.bg; b.classList.toggle("is-on", on); b.setAttribute("aria-checked", on ? "true" : "false");
    });
    Array.prototype.forEach.call(document.querySelectorAll(".br-sub"), function (el) { el.hidden = el.getAttribute("data-for") !== st.bg; });
    Array.prototype.forEach.call($("brSwatches").querySelectorAll("[data-c]"), function (b) { b.classList.toggle("is-on", b.getAttribute("data-c") === st.color); });
    $("brBlurOut").textContent = st.blur;
    $("brEdgeOut").textContent = st.edge === 0 ? "Natural" : st.edge < 40 ? "Cleaner" : st.edge < 75 ? "Crisp" : "Hard";
    var it = curItem();
    var redo = it && it.status === "done" && it.model !== st.model;
    $("brGo").hidden = !redo;
    $("brGo").disabled = st.busy;
    $("brClear").style.display = st.items.length ? "" : "none";
  }

  $("brSwatches").innerHTML = SWATCHES.map(function (c) { return '<button type="button" data-c="' + c + '" style="--c:' + c + '" aria-label="Color ' + c + '"></button>'; }).join("");
  $("brModel").addEventListener("click", function (e) { var b = e.target.closest("[data-m]"); if (!b) return; st.model = b.getAttribute("data-m"); paint(); });
  $("brBg").addEventListener("click", function (e) {
    var b = e.target.closest("[data-bg]"); if (!b) return; st.bg = b.getAttribute("data-bg"); paint();
    if (st.bg === "image" && !st.bgBmp) $("brBgFile").click();
    show();
  });
  $("brSwatches").addEventListener("click", function (e) { var b = e.target.closest("[data-c]"); if (!b) return; st.color = b.getAttribute("data-c"); $("brColor").value = st.color; paint(); show(); });
  $("brColor").addEventListener("input", function () { st.color = this.value; paint(); show(); });
  $("brBlur").addEventListener("input", function () { st.blur = +this.value; paint(); show(); });
  $("brEdge").addEventListener("input", function () { st.edge = +this.value; paint(); show(); });
  $("brCrop").addEventListener("change", function () { st.crop = this.checked; show(); });
  $("brShadow").addEventListener("change", function () { st.shadow = this.checked; show(); });
  $("brBgFile").addEventListener("change", async function () {
    var f = this.files[0]; this.value = ""; if (!f) return;
    try { st.bgBmp = await createImageBitmap(f); st.bgName = f.name; $("brBgName").textContent = f.name; st.bg = "image"; paint(); show(); }
    catch (e) { status("Couldn't open that background picture.", "error"); }
  });

  // ---------------------------------------------------------------- adding pictures
  $("brFile").addEventListener("change", function () { addFiles(this.files); this.value = ""; });
  document.addEventListener("paste", function (e) {
    if (!st.allowed) return;
    var t = e.target; if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
    var files = [];
    Array.prototype.forEach.call((e.clipboardData && e.clipboardData.items) || [], function (it) { if (it.kind === "file" && /^image\//.test(it.type)) files.push(it.getAsFile()); });
    if (files.length) { e.preventDefault(); addFiles(files); }
  });
  var stage = document.querySelector(".vs-stage");
  ["dragenter", "dragover"].forEach(function (ev) { stage.addEventListener(ev, function (e) { if (!st.allowed) return; e.preventDefault(); stage.classList.add("br-over"); }); });
  ["dragleave", "drop"].forEach(function (ev) { stage.addEventListener(ev, function (e) { if (ev === "dragleave" && stage.contains(e.relatedTarget)) return; stage.classList.remove("br-over"); }); });
  stage.addEventListener("drop", function (e) { if (!st.allowed) return; e.preventDefault(); if (e.dataTransfer && e.dataTransfer.files.length) addFiles(e.dataTransfer.files); });
  $("brEmpty").addEventListener("click", function () { if (st.allowed) $("brFile").click(); });

  function addFiles(list) {
    var files = Array.prototype.filter.call(list || [], function (f) { return f && (/^image\//.test(f.type) || /\.(heic|heif|avif|webp|png|jpe?g|bmp|gif)$/i.test(f.name || "")); });
    if (!files.length) { status("Those don't look like pictures.", "error"); return; }
    var room = Math.max(0, (cfg.maxBatch || 20) - st.items.length);
    if (files.length > room) status("You can do " + (cfg.maxBatch || 20) + " pictures at a time, so only the first " + room + " were added. Clear all to start a new batch.", "error");
    files.slice(0, room).forEach(function (f) { addItem(f, f.name); });
    pump();
  }
  function addItem(blob, name) {
    var it = { id: st.nextId++, name: name || "picture", blob: blob, status: "queued", model: null, err: "", bmp: null, w: 0, h: 0, mask: null, prev: null, thumb: "" };
    st.items.push(it);
    if (!st.cur) st.cur = it.id;
    list();
    if (st.cur === it.id) show();
    return it;
  }
  function curItem() { var id = st.cur; return st.items.filter(function (x) { return x.id === id; })[0] || null; }

  $("brClear").addEventListener("click", function () {
    if (st.busy && !confirm("Stop and clear everything?")) return;
    st.items.forEach(function (it) { if (it.thumb) URL.revokeObjectURL(it.thumb); if (it.bmp && it.bmp.close) it.bmp.close(); });
    st.items = []; st.cur = null; list(); show(); status(""); paint();
  });

  // ---------------------------------------------------------------- the model
  async function hasWebGPU() {
    try { if (!navigator.gpu) return false; var a = await navigator.gpu.requestAdapter(); return !!a; } catch (e) { return false; }
  }
  function getSeg(key) {
    if (!segs[key]) segs[key] = loadSeg(key, !!noGpu[key]).catch(function (e) { delete segs[key]; throw e; });
    return segs[key];
  }
  async function loadSeg(key, cpuOnly) {
    progress(1, "Loading the AI…");
    var T;
    try { T = await import(TJS); } catch (e) { throw new Error("Couldn't load the AI library. Check your connection (or an ad blocker) and try again."); }
    T.env.allowLocalModels = false;
    var gpu = !cpuOnly && (await hasWebGPU());
    var tries = key === "best"
      ? (gpu ? [["webgpu", "fp16"], ["webgpu", "fp32"], ["wasm", "fp32"]] : [["wasm", "fp32"], ["wasm", "q8"]])
      : (gpu ? [["webgpu", "fp32"], ["wasm", null]] : [["wasm", null]]);
    var last = null;
    for (var i = 0; i < tries.length; i++) {
      var files = {};
      var opts = {
        device: tries[i][0],
        progress_callback: function (d) {
          if (!d || d.status !== "progress" || !d.file || !d.total) return;
          files[d.file] = { l: d.loaded || 0, t: d.total };
          var l = 0, t = 0; Object.keys(files).forEach(function (k) { l += files[k].l; t += files[k].t; });
          if (t > 2e6) progress(l / t * 100, "Downloading the AI model (one time only): " + mb(l) + " of " + mb(t));
        }
      };
      if (tries[i][1]) opts.dtype = tries[i][1];
      try {
        var seg = await T.pipeline("background-removal", MODELS[key].id, opts);
        progress(100, "Warming up…");
        // Run the model once on a test picture: some graphics cards load it but can't run it.
        var ok = await selfTest(seg);
        if (!ok && tries[i][0] === "webgpu" && key === "best") throw new Error("model output check failed");
        device = tries[i][0];
        return seg;
      } catch (e) { last = e; if (window.console) console.warn("[bg-remover] " + tries[i].join("/") + " failed:", e); }
    }
    throw new Error("The AI model couldn't start in this browser" + (last && last.message ? " (" + last.message + ")" : "") + ". Try Chrome or Edge on a computer.");
  }
  // A black disc on white: a working model cuts the disc out (center opaque, corners clear).
  async function selfTest(seg) {
    var c = canvas(256, 256), x = c.getContext("2d");
    x.fillStyle = "#fff"; x.fillRect(0, 0, 256, 256); x.fillStyle = "#111"; x.beginPath(); x.arc(128, 128, 70, 0, 7); x.fill();
    var out = await seg(c); var d = out.data, ch = out.channels || 4;
    var center = d[(128 * 256 + 128) * ch + ch - 1], corner = d[(8 * 256 + 8) * ch + ch - 1];
    return center - corner > 60;
  }

  // ---------------------------------------------------------------- processing queue
  async function pump() {
    if (st.busy) return;
    var it = st.items.filter(function (x) { return x.status === "queued"; })[0];
    if (!it) { progress(null); paint(); return; }
    st.busy = true; paint();
    var n = st.items.filter(function (x) { return x.status === "done" || x.status === "error"; }).length + 1;
    var total = st.items.length;
    try {
      it.status = "working"; list(); if (st.cur === it.id) show();
      if (!it.bmp) await decode(it);
      var key = it.wantModel || st.model;
      var seg = await getSeg(key);
      progress(total > 1 ? (n - 1) / total * 100 : 60, total > 1 ? "Removing backgrounds: " + n + " of " + total : "Removing the background…");
      var t0 = performance.now();
      var src = canvas(it.w, it.h); src.getContext("2d").drawImage(it.bmp, 0, 0, it.w, it.h);
      var out;
      try { out = await seg(src); }
      catch (e) {
        if (device !== "webgpu" || noGpu[key]) throw e;
        // The graphics card couldn't run it: switch this model to the processor and try again.
        if (window.console) console.warn("[bg-remover] WebGPU run failed, using the processor instead:", e);
        noGpu[key] = true; delete segs[key];
        progress(5, "Your graphics card can't run this model, switching to your processor…");
        seg = await getSeg(key);
        out = await seg(src);
      }
      var ch = out.channels || 4, d = out.data, m = new Uint8ClampedArray(it.w * it.h);
      if (out.width !== it.w || out.height !== it.h) throw new Error("unexpected output size");
      for (var i = 0, j = ch - 1; i < m.length; i++, j += ch) m[i] = d[j];
      it.mask = m; it.prev = null; it.model = key; it.wantModel = null; it.status = "done";
      it.secs = (performance.now() - t0) / 1000;
      await thumb(it);
      status("");
    } catch (e) {
      it.status = "error";
      it.err = e && e.message ? e.message : String(e);
      status(it.err, "error");
    }
    st.busy = false;
    list(); if (st.cur === it.id) show();
    pump();
  }
  async function decode(it) {
    var bmp;
    try { bmp = await createImageBitmap(it.blob, { imageOrientation: "from-image" }); }
    catch (e) {
      try { bmp = await createImageBitmap(it.blob); }
      catch (e2) {
        if (/\.hei[cf]$/i.test(it.name) || /hei[cf]/i.test(it.blob.type)) throw new Error("This browser can't open HEIC photos. Convert it to JPG first (free at crisspofficial.com/convert) or use Safari.");
        throw new Error("Couldn't open " + it.name + ".");
      }
    }
    var w = bmp.width, h = bmp.height, k = Math.min(1, Math.sqrt(MAX_PIXELS / (w * h)));
    if (k < 1) {
      var c = canvas(w * k, h * k); c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
      if (bmp.close) bmp.close();
      bmp = await createImageBitmap(c);
    }
    it.bmp = bmp; it.w = bmp.width; it.h = bmp.height;
  }

  $("brGo").addEventListener("click", function () {
    var it = curItem(); if (!it || st.busy) return;
    it.status = "queued"; it.wantModel = st.model; list(); show(); pump();
  });

  // ---------------------------------------------------------------- compositing
  function curve(a) {
    if (!st.edge) return a;
    var t = st.edge / 100 * 0.42 * 255, v = (a - t) * 255 / (255 - 2 * t);
    return v < 0 ? 0 : v > 255 ? 255 : v;
  }
  // Base picture + mask at a given scale (the on-screen preview is cached).
  function layers(it, side) {
    var k = side ? Math.min(1, side / Math.max(it.w, it.h)) : 1;
    if (k < 1 && it.prev && it.prev.k === k) return it.prev;
    var w = Math.max(1, Math.round(it.w * k)), h = Math.max(1, Math.round(it.h * k));
    var base = canvas(w, h); base.getContext("2d").drawImage(it.bmp, 0, 0, w, h);
    var mask = it.mask;
    if (k < 1) {
      var full = canvas(it.w, it.h), fx = full.getContext("2d"), id = fx.createImageData(it.w, it.h), dd = id.data;
      for (var i = 0, j = 3; i < mask.length; i++, j += 4) dd[j] = mask[i];
      fx.putImageData(id, 0, 0);
      var sm = canvas(w, h), sx = sm.getContext("2d"); sx.drawImage(full, 0, 0, w, h);
      var sd = sx.getImageData(0, 0, w, h).data; mask = new Uint8ClampedArray(w * h);
      for (i = 0, j = 3; i < mask.length; i++, j += 4) mask[i] = sd[j];
    }
    var L = { k: k, w: w, h: h, base: base, mask: mask };
    if (k < 1) it.prev = L;
    return L;
  }
  function compose(L) {
    var w = L.w, h = L.h, i, j, lut = new Uint8ClampedArray(256);
    for (i = 0; i < 256; i++) lut[i] = curve(i);
    // subject = picture with the new alpha
    var subj = canvas(w, h), sx = subj.getContext("2d");
    sx.drawImage(L.base, 0, 0);
    var img = sx.getImageData(0, 0, w, h), d = img.data, m = L.mask;
    var x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (i = 0, j = 3; i < m.length; i++, j += 4) {
      var a = lut[m[i]]; d[j] = a;
      if (a > 10) { var x = i % w, y = (i - x) / w; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    sx.putImageData(img, 0, 0);
    // frame
    var box = { x: 0, y: 0, w: w, h: h };
    if (st.crop && x1 >= 0) {
      var pad = Math.round(Math.max(x1 - x0, y1 - y0) * (st.shadow ? 0.08 : 0.03));
      box.x = Math.max(0, x0 - pad); box.y = Math.max(0, y0 - pad);
      box.w = Math.min(w, x1 + pad + 1) - box.x; box.h = Math.min(h, y1 + pad + 1) - box.y;
    }
    var out = canvas(box.w, box.h), ox = out.getContext("2d");
    ox.translate(-box.x, -box.y);
    if (st.bg === "color") { ox.fillStyle = st.color; ox.fillRect(box.x, box.y, box.w, box.h); }
    else if (st.bg === "blur") blurInto(ox, L.base, w, h);
    else if (st.bg === "image" && st.bgBmp) cover(ox, st.bgBmp, box);
    if (st.shadow) {
      var s = Math.max(w, h);
      ox.save(); ox.shadowColor = "rgba(0,0,0,0.38)"; ox.shadowBlur = s * 0.035; ox.shadowOffsetY = s * 0.018;
      ox.drawImage(subj, 0, 0); ox.restore();
    }
    ox.drawImage(subj, 0, 0);
    return { canvas: out, box: box, empty: x1 < 0 };
  }
  function blurInto(ox, base, w, h) {
    var r = st.blur * Math.max(w, h) / 1000;
    ox.save();
    if (typeof ox.filter === "string" && "filter" in CanvasRenderingContext2D.prototype) {
      ox.filter = "blur(" + r.toFixed(1) + "px)";
      var g = r * 3; ox.drawImage(base, -g, -g, w + 2 * g, h + 2 * g);
    } else {
      var f = Math.max(2, r / 1.5), sm = canvas(w / f, h / f), sx = sm.getContext("2d");
      sx.imageSmoothingQuality = "high"; sx.drawImage(base, 0, 0, sm.width, sm.height);
      ox.imageSmoothingQuality = "high"; ox.drawImage(sm, 0, 0, w, h);
    }
    ox.restore();
  }
  function cover(ox, bmp, box) {
    var k = Math.max(box.w / bmp.width, box.h / bmp.height), dw = bmp.width * k, dh = bmp.height * k;
    ox.drawImage(bmp, box.x + (box.w - dw) / 2, box.y + (box.h - dh) / 2, dw, dh);
  }

  // ---------------------------------------------------------------- viewer
  var showTimer = null;
  function show() { clearTimeout(showTimer); showTimer = setTimeout(draw, 16); }
  function draw() {
    var it = curItem();
    $("brEmpty").hidden = !!it;
    $("brViewer").hidden = !it;
    paint();
    if (!it) return;
    $("brName").textContent = it.name;
    var working = it.status === "queued" || it.status === "working";
    $("brBusy").hidden = !working && it.status !== "error";
    $("brBusyTxt").textContent = it.status === "error" ? it.err : it.status === "queued" ? "Waiting…" : "Removing the background…";
    $("brBusy").classList.toggle("is-err", it.status === "error");
    var before = $("brBefore"), after = $("brOut");
    ["brDl", "brCopy"].forEach(function (id) { $(id).disabled = it.status !== "done"; });
    $("brDlJpg").hidden = st.bg === "none";
    $("brDlAll").hidden = st.items.filter(function (x) { return x.status === "done"; }).length < 2;
    $("brCopy").hidden = !(navigator.clipboard && window.ClipboardItem);
    if (it.status !== "done") {
      $("brStats").textContent = it.w ? it.w + " × " + it.h : "";
      if (it.bmp) { var k = Math.min(1, PREVIEW_SIDE / Math.max(it.w, it.h)); sizeTo(before, it.w * k, it.h * k).getContext("2d").drawImage(it.bmp, 0, 0, before.width, before.height); sizeTo(after, before.width, before.height); }
      else { sizeTo(before, 4, 3); sizeTo(after, 4, 3); }
      $("brCompare").classList.add("is-pending");
      return;
    }
    $("brCompare").classList.remove("is-pending");
    var L = layers(it, PREVIEW_SIDE), r = compose(L);
    sizeTo(after, r.canvas.width, r.canvas.height).getContext("2d").drawImage(r.canvas, 0, 0);
    sizeTo(before, r.box.w, r.box.h).getContext("2d").drawImage(L.base, -r.box.x, -r.box.y);
    var sc = 1 / L.k;
    $("brStats").textContent = Math.round(r.box.w * sc) + " × " + Math.round(r.box.h * sc) + " · " + MODELS[it.model].label + (it.secs ? " · " + it.secs.toFixed(1) + " s on " + (device === "webgpu" ? "your graphics card" : "your processor") : "") + (r.empty ? " · No subject found" : "");
    if (r.empty) status("The AI didn't find a clear subject in this picture." + (it.model === "fast" ? " The Fast model only finds people — try Best quality." : ""), "error");
  }
  function sizeTo(c, w, h) { w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h)); if (c.width !== w) c.width = w; if (c.height !== h) c.height = h; c.getContext("2d").clearRect(0, 0, w, h); return c; }
  $("brSlider").addEventListener("input", function () { $("brCompare").style.setProperty("--pos", this.value + "%"); });

  function list() {
    var box = $("brList");
    $("brListWrap").hidden = st.items.length < 2;
    box.innerHTML = st.items.map(function (it) {
      var lab = it.status === "done" ? "" : it.status === "error" ? "Failed" : it.status === "working" ? "Working…" : "Waiting";
      return '<button type="button" class="br-card' + (it.id === st.cur ? " is-open" : "") + (it.status === "error" ? " is-err" : "") + '" data-id="' + it.id + '" title="' + esc(it.name) + '">' +
        (it.thumb ? '<img src="' + it.thumb + '" alt=""/>' : "") + (lab ? '<span class="br-card-st">' + lab + "</span>" : "") + "</button>";
    }).join("");
    $("brClear").style.display = st.items.length ? "" : "none";
  }
  $("brList").addEventListener("click", function (e) { var b = e.target.closest("[data-id]"); if (!b) return; st.cur = +b.getAttribute("data-id"); status(""); list(); show(); });
  async function thumb(it) {
    var k = Math.min(1, 240 / Math.max(it.w, it.h)), c = canvas(it.w * k, it.h * k), x = c.getContext("2d");
    var L = layers(it, PREVIEW_SIDE), m = canvas(L.w, L.h), mx = m.getContext("2d");
    mx.drawImage(L.base, 0, 0); var id = mx.getImageData(0, 0, L.w, L.h);
    for (var i = 0, j = 3; i < L.mask.length; i++, j += 4) id.data[j] = L.mask[i];
    mx.putImageData(id, 0, 0); x.drawImage(m, 0, 0, c.width, c.height);
    var b = await new Promise(function (ok) { c.toBlob(ok, "image/png"); });
    if (it.thumb) URL.revokeObjectURL(it.thumb);
    it.thumb = b ? URL.createObjectURL(b) : "";
  }

  // ---------------------------------------------------------------- downloads
  function fullBlob(it, type) {
    var r = compose(layers(it, 0)), c = r.canvas;
    if (type === "image/jpeg") { var j = canvas(c.width, c.height), jx = j.getContext("2d"); jx.fillStyle = "#fff"; jx.fillRect(0, 0, j.width, j.height); jx.drawImage(c, 0, 0); c = j; }
    return new Promise(function (ok) { c.toBlob(ok, type, 0.92); });
  }
  function fileName(it, type) { return baseName(it.name) + "-no-bg" + (type === "image/jpeg" ? ".jpg" : ".png"); }
  async function save(blob, name) {
    if (isIOS() && navigator.canShare) {
      var f = new File([blob], name, { type: blob.type });
      if (navigator.canShare({ files: [f] })) { try { await navigator.share({ files: [f] }); return; } catch (e) { if (e && e.name === "AbortError") return; } }
    }
    var u = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(u); }, 30000);
  }
  async function dl(type) {
    var it = curItem(); if (!it || it.status !== "done") return;
    status("Preparing your download…");
    try { var b = await fullBlob(it, type); await save(b, fileName(it, type)); status(""); track("download"); }
    catch (e) { status("Couldn't make the file: " + (e.message || e), "error"); }
  }
  $("brDl").addEventListener("click", function () { dl("image/png"); });
  $("brDlJpg").addEventListener("click", function () { dl("image/jpeg"); });
  $("brCopy").addEventListener("click", async function () {
    var it = curItem(); if (!it || it.status !== "done") return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": fullBlob(it, "image/png") })]);
      status("Copied. Paste it anywhere.", "success");
    } catch (e) { status("Your browser didn't allow copying. Use Download instead.", "error"); }
  });
  $("brDlAll").addEventListener("click", async function () {
    var done = st.items.filter(function (x) { return x.status === "done"; });
    if (!done.length) return;
    try {
      if (!window.JSZip) await loadScript(JSZIP);
      var zip = new window.JSZip(), used = {}, type = "image/png";
      for (var i = 0; i < done.length; i++) {
        progress((i / done.length) * 100, "Packing " + (i + 1) + " of " + done.length + "…");
        var n = fileName(done[i], type); if (used[n]) n = n.replace(/\.png$/, "-" + (++used[n]) + ".png"); else used[n] = 1;
        zip.file(n, await fullBlob(done[i], type));
      }
      progress(100, "Zipping…");
      var z = await zip.generateAsync({ type: "blob" });
      progress(null);
      await save(z, "backgrounds-removed.zip"); track("download_all");
    } catch (e) { progress(null); status("Couldn't make the ZIP: " + (e.message || e), "error"); }
  });
  function track(what) { try { if (window.AIRH_TRACK) window.AIRH_TRACK("bg_remover_" + what); } catch (e) {} }

  // ---------------------------------------------------------------- "my images"
  $("brMine").addEventListener("toggle", async function () {
    if (!this.open || this.getAttribute("data-loaded") || !client || !st.user) return;
    this.setAttribute("data-loaded", "1");
    var r = await client.from("image_jobs").select("id,urls").eq("user_id", st.user.id).eq("status", "done").order("created_at", { ascending: false }).limit(24);
    var urls = []; (r.data || []).forEach(function (x) { (x.urls || []).forEach(function (u) { if (urls.length < 48) urls.push(u); }); });
    $("brMineGrid").innerHTML = urls.length ? urls.map(function (u) { return '<button type="button" data-u="' + esc(absUrl(u)) + '" aria-label="Use this image"><img loading="lazy" src="' + esc(absUrl(u)) + '" alt=""/></button>'; }).join("") : '<p class="as-hint">No images yet. Make some in Image Studio.</p>';
  });
  $("brMineGrid").addEventListener("click", function (e) { var b = e.target.closest("[data-u]"); if (b) addUrl(b.getAttribute("data-u")); });
  async function addUrl(u) {
    status("Fetching the picture…");
    try {
      var r = await fetch(u, { mode: "cors" }); if (!r.ok) throw new Error("HTTP " + r.status);
      var b = await r.blob(); if (!/^image\//.test(b.type)) throw new Error("not an image");
      var name = decodeURIComponent((u.split("?")[0].split("/").pop() || "picture.png"));
      status(""); var it = addItem(b, name); st.cur = it.id; list(); show(); pump();
    } catch (e) {
      status("Couldn't fetch that picture" + (/render\./.test(u) ? " (the GPU PC may be offline)" : "") + ". Download it and upload it here instead.", "error");
    }
  }

  // ---------------------------------------------------------------- start
  (async function init() {
    readCfg();
    st.model = cfg.model === "fast" && cfg.fast !== false ? "fast" : "best";
    paint(); gate();
    await Promise.all([freshCfg(), whoAmI()]);
    if (!st.items.length) st.model = cfg.model === "fast" && cfg.fast !== false ? "fast" : "best";
    gate();
    if (client) client.auth.onAuthStateChange(function () { whoAmI().then(gate); });
    var q = new URLSearchParams(location.search).get("image");
    if (q && st.allowed && /^https:\/\//i.test(q)) addUrl(q);
    show();
  })();
})();

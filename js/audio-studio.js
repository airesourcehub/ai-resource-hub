// AI Resource Hub — Audio Studio: AI Music (ACE-Step 1.5 / MiniMax Music 3), Sound FX (Stable Audio Open),
// Voice (Chatterbox Turbo / Chatterbox / Chatterbox Multilingual / Kokoro) and Stems (RoFormer / Demucs).
// Every job runs on the hub's GPU through the render server (/audio-jobs), one at a time.
(function () {
  var RENDER = function () { return window.AIRH_GPU ? window.AIRH_GPU.base() : "https://render.airesourcehub.vip"; };
  if (!window.supabase || typeof SUPABASE_URL === "undefined") return;
  var $ = function (id) { return document.getElementById(id); };
  if (!$("asForm")) return;
  var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  var MAX_UP = 200 * 1024 * 1024;

  // Fallback catalog (the server's /audio-models replaces it when reachable).
  var CAT = {
    music: { ace15: { label: "ACE-Step 1.5 XL Turbo", max_seconds: 240, note: "Fast. Set BPM, key and time signature." },
             minimax3: { label: "MiniMax Music 3", max_seconds: 240, note: "Rich, detailed songs. Describe tempo and key in the style text." } },
    sfx: { stable_audio_open: { label: "Stable Audio Open 1.0", max_seconds: 47, note: "Sound effects, foley, ambience, risers and loops up to 47 s." } },
    voice: { chatterbox_turbo: { label: "Chatterbox Turbo", note: "Fast, natural English. Clone any voice from a 10 s clip. Tags like [laugh] [sigh] work." },
             chatterbox: { label: "Chatterbox (emotion)", note: "English with an emotion slider for more dramatic reads. Clones voices." },
             chatterbox_mtl: { label: "Chatterbox Multilingual", note: "23 languages. Clones voices." },
             kokoro: { label: "Kokoro", note: "Very fast, clean preset voices. No cloning." } },
    stems: { vocals: { label: "Vocals + instrumental", note: "BS-RoFormer. The cleanest acapella and instrumental." },
             "4stem": { label: "4 stems", note: "Demucs: vocals, drums, bass, other." },
             "6stem": { label: "6 stems", note: "Demucs: vocals, drums, bass, guitar, piano, other." } }
  };
  var KEYS = ["C major","C# major","Db major","D major","D# major","Eb major","E major","F major","F# major","Gb major","G major","G# major","Ab major","A major","A# major","Bb major","B major","C minor","C# minor","Db minor","D minor","D# minor","Eb minor","E minor","F minor","F# minor","Gb minor","G minor","G# minor","Ab minor","A minor","A# minor","Bb minor","B minor"];
  var KOKORO = { af_heart: "Heart (US female)", af_bella: "Bella (US female)", af_nicole: "Nicole (US female, soft)", af_sarah: "Sarah (US female)", am_michael: "Michael (US male)", am_fenrir: "Fenrir (US male, deep)", am_puck: "Puck (US male, upbeat)", am_eric: "Eric (US male)", bf_emma: "Emma (UK female)", bf_isabella: "Isabella (UK female)", bm_george: "George (UK male)", bm_fable: "Fable (UK male)" };
  var VLANGS = ["ar","da","de","el","en","es","fi","fr","he","hi","it","ja","ko","ms","nl","no","pl","pt","ru","sv","sw","tr","zh"];
  var LANG_NAMES = { ar: "Arabic", da: "Danish", de: "German", el: "Greek", en: "English", es: "Spanish", fi: "Finnish", fr: "French", he: "Hebrew", hi: "Hindi", it: "Italian", ja: "Japanese", ko: "Korean", ms: "Malay", nl: "Dutch", no: "Norwegian", pl: "Polish", pt: "Portuguese", ru: "Russian", sv: "Swedish", sw: "Swahili", tr: "Turkish", zh: "Chinese", yue: "Cantonese" };
  var COPY = {
    music: { h: "AI Music", lead: "Full songs from a style and your lyrics, made on the hub's GPU. Pick a model, describe the sound, paste your lyrics.", label: "Style",
             ph: { ace15: "Late-night trap, 95 BPM, heavy 808 bass, dark synths, male rap vocals, atmospheric club vibe", minimax3: "Dancehall, 100 BPM, A minor. Bouncy and sunny, island drums, deep bass, confident male vocals with a catchy hook" },
             hint: { ace15: "Genre, mood, instruments and vocal type. BPM and key go below.", minimax3: "Describe genre, tempo (BPM), key, mood and vocals in your own words." } },
    sfx: { h: "Sound Effects", lead: "Foley, ambience, risers, hits and loops from a description. Up to 47 seconds.", label: "Describe the sound",
           ph: { stable_audio_open: "Heavy wooden door slamming shut in a large stone hall, long echo" }, hint: { stable_audio_open: "Be concrete: the object, the action, the space it's in." } },
    voice: { h: "Voice & Text to Speech", lead: "Voiceovers in seconds. Clone a voice from a short clip, or pick a ready-made voice.", label: "Script",
             ph: { chatterbox_turbo: "Yo, what's good everybody, welcome back to the channel [laugh]. Today we're cooking up something special.", chatterbox: "I told you this day would come. And now it's here.", chatterbox_mtl: "Bonjour à tous, et bienvenue.", kokoro: "Welcome to AI Resource Hub, where your ideas turn into images, videos and music." },
             hint: { chatterbox_turbo: "Up to 5,000 characters. Tags: [laugh] [chuckle] [sigh] [cough] [gasp].", chatterbox: "Up to 5,000 characters. Turn Emotion up for a more dramatic read.", chatterbox_mtl: "Write the script in the language you pick.", kokoro: "Up to 5,000 characters." } },
    stems: { h: "Stem Splitter", lead: "Pull any song apart into vocals, drums, bass and more. Download each stem or all of them as a zip." }
  };

  var st = { tool: "music", model: { music: "ace15", sfx: "stable_audio_open", voice: "chatterbox_turbo", stems: "vocals" }, user: null, job: null, timer: null, fails: 0, filter: "" };

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function absUrl(u) { if (!u) return u; return /^https?:\/\//i.test(u) ? u : RENDER() + (u.charAt(0) === "/" ? "" : "/") + u; }
  function status(t, k) { var s = $("asStatus"); s.textContent = t || ""; s.className = "form-status" + (k ? " " + k : ""); }
  function fmt(s) { s = Math.max(0, Math.round(s || 0)); return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2); }
  async function token() {
    var r = await client.auth.getSession(); var s = r.data.session;
    if (s && s.expires_at && s.expires_at - Date.now() / 1000 < 120) { try { var rr = await client.auth.refreshSession(); if (rr.data && rr.data.session) s = rr.data.session; } catch (e) {} }
    return s ? s.access_token : null;
  }

  // ---------- form
  function fill(sel, items, val) { $(sel).innerHTML = items.map(function (it) { return '<option value="' + esc(it[0]) + '"' + (it[0] === val ? " selected" : "") + ">" + esc(it[1]) + "</option>"; }).join(""); }
  fill("asKey", KEYS.map(function (k) { return [k, k]; }), "C minor");
  fill("asLang", ["en","es","fr","pt","de","it","ja","ko","zh","yue","hi","ru","ar","nl","tr","unknown"].map(function (k) { return [k, LANG_NAMES[k] || "Other / mixed"]; }), "en");
  fill("asVoice", Object.keys(KOKORO).map(function (k) { return [k, KOKORO[k]]; }), "af_heart");
  fill("asVLang", VLANGS.map(function (k) { return [k, LANG_NAMES[k] || k]; }), "en");

  function paint() {
    var t = st.tool, m = st.model[t], models = CAT[t] || {};
    Array.prototype.forEach.call(document.querySelectorAll(".as-tabs [data-tool]"), function (b) { var on = b.getAttribute("data-tool") === t; b.classList.toggle("is-on", on); b.setAttribute("aria-selected", on ? "true" : "false"); });
    $("asModels").innerHTML = Object.keys(models).map(function (k) {
      return '<button type="button" role="radio" class="as-model' + (k === m ? " is-on" : "") + '" aria-checked="' + (k === m) + '" data-m="' + esc(k) + '"><strong>' + esc(models[k].label) + "</strong><span>" + esc(models[k].note || "") + "</span></button>";
    }).join("");
    Array.prototype.forEach.call(document.querySelectorAll("#asForm [data-for]"), function (el) {
      var okT = el.getAttribute("data-for").split(" ").indexOf(t) >= 0;
      var dm = el.getAttribute("data-model"); var okM = !dm || dm.split(" ").indexOf(m) >= 0;
      el.style.display = okT && okM ? "" : "none";
    });
    var c = COPY[t];
    $("asTitleH").textContent = c.h; $("asLead").textContent = c.lead;
    if (c.label) {
      $("asPromptLabel").textContent = c.label;
      $("asPrompt").placeholder = (c.ph && c.ph[m]) || "";
      $("asPromptHint").textContent = (c.hint && c.hint[m]) || "";
      $("asPrompt").rows = t === "voice" ? 7 : 3;
      $("asPrompt").maxLength = t === "voice" ? 5000 : 1000;
    }
    var sec = $("asSeconds"), max = t === "sfx" ? 47 : ((models[m] || {}).max_seconds || 240);
    sec.max = max; sec.min = t === "sfx" ? 1 : 10;
    if (+sec.value > max) sec.value = t === "sfx" ? 8 : 60;
    if (t === "sfx" && +sec.value > 47) sec.value = 8;
    $("asSecondsOut").textContent = fmt(+sec.value);
    $("asGo").textContent = { music: "Generate song", sfx: "Generate sound", voice: "Generate voice", stems: "Split song" }[t];
    try { localStorage.setItem("airh-audio-tool", t); } catch (e) {}
  }
  document.querySelector(".as-tabs").addEventListener("click", function (e) {
    var b = e.target.closest("[data-tool]"); if (!b) return;
    var prev = st.tool; st.tool = b.getAttribute("data-tool");
    if (prev === "sfx" || st.tool === "sfx") $("asSeconds").value = st.tool === "sfx" ? 8 : 60;
    paint();
  });
  $("asModels").addEventListener("click", function (e) { var b = e.target.closest("[data-m]"); if (!b) return; st.model[st.tool] = b.getAttribute("data-m"); paint(); });
  $("asSeconds").addEventListener("input", function () { $("asSecondsOut").textContent = fmt(+this.value); });
  $("asEmo").addEventListener("input", function () { $("asEmoOut").textContent = (+this.value).toFixed(2); }); $("asEmoOut").textContent = "0.50";
  $("asSpeed").addEventListener("input", function () { $("asSpeedOut").textContent = (+this.value).toFixed(2) + "×"; }); $("asSpeedOut").textContent = "1.00×";

  // ---------- gate + catalog
  (async function init() {
    var tq = new URLSearchParams(location.search).get("tool");
    var saved = null; try { saved = localStorage.getItem("airh-audio-tool"); } catch (e) {}
    st.tool = CAT[tq] ? tq : (CAT[saved] ? saved : "music");
    paint();
    try {
      var r = await fetch(RENDER() + "/audio-models", { cache: "no-store" });
      if (r.ok) {
        var d = await r.json();
        if (d.music) CAT.music = d.music;
        if (d.voice) CAT.voice = d.voice;
        if (d.stems) Object.keys(d.stems).forEach(function (k) { if (CAT.stems[k]) CAT.stems[k].label = d.stems[k].label; });
        st.ready = { voice: d.voice_ready !== false, stems: d.stems_ready !== false };
        paint();
      }
    } catch (e) {}
    var s = await client.auth.getSession();
    st.user = s.data.session ? s.data.session.user : null;
    gate();
    client.auth.onAuthStateChange(function (_e, sess) { st.user = sess ? sess.user : null; gate(); });
  })();
  function gate() {
    var g = $("asGate"), f = $("asForm");
    if (!st.user) { g.innerHTML = 'Audio tools run on the hub’s GPU. <a href="auth.html">Log in</a> to use them.'; g.style.display = ""; f.style.display = "none"; return; }
    g.style.display = "none"; f.style.display = ""; loadLibrary();
  }

  // ---------- generate
  $("asGo").addEventListener("click", async function () {
    var t = st.tool, m = st.model[t];
    var p = ($("asPrompt").value || "").trim();
    if (t !== "stems" && !p) { status(t === "voice" ? "Type what the voice should say." : "Describe what you want to hear.", "error"); $("asPrompt").focus(); return; }
    if (st.ready && ((t === "voice" && !st.ready.voice) || (t === "stems" && !st.ready.stems))) { status("This tool is still being installed on the render PC. Try again in a few minutes.", "error"); return; }
    var fd = new FormData();
    fd.append("tool", t); fd.append("model", m); fd.append("prompt", p); fd.append("title", ($("asTitle").value || "").trim());
    if (t === "music") { fd.append("lyrics", $("asLyrics").value || ""); fd.append("seconds", $("asSeconds").value); fd.append("bpm", $("asBpm").value); fd.append("keyscale", $("asKey").value); fd.append("timesig", $("asTime").value); fd.append("language", $("asLang").value); }
    if (t === "sfx") { fd.append("seconds", $("asSeconds").value); fd.append("negative", $("asNegative").value || ""); }
    if (t === "voice") {
      fd.append("voice", $("asVoice").value); fd.append("speed", $("asSpeed").value); fd.append("exaggeration", $("asEmo").value); fd.append("language", $("asVLang").value);
      var ref = $("asRef").files[0];
      if (ref && m !== "kokoro") { if (ref.size > MAX_UP) { status("The voice sample is too big.", "error"); return; } fd.append("file", ref); }
    }
    if (t === "stems") {
      var song = $("asSong").files[0];
      if (!song) { status("Add a song to split.", "error"); return; }
      if (song.size > MAX_UP) { status("Songs must be under 200 MB.", "error"); return; }
      fd.append("file", song);
    }
    var tok = await token();
    if (!tok) { status("Your session expired. Please log in again.", "error"); return; }
    $("asGo").disabled = true; status(t === "stems" ? "Uploading your song…" : "Sending to the GPU…"); progress(2, "Starting…");
    try {
      var r = await fetch(RENDER() + "/audio-jobs", { method: "POST", headers: { Authorization: "Bearer " + tok }, body: fd });
      var d = await r.json().catch(function () { return {}; });
      if (r.status === 423 || r.status === 403) throw new Error("The GPU is reserved for another user right now.");
      if (!r.ok) throw new Error(d.detail || ("HTTP " + r.status));
      st.job = d.job_id; st.fails = 0;
      $("asCancel").style.display = ""; $("asCancel").disabled = false;
      status({ music: "Making your song…", sfx: "Making your sound…", voice: "Recording the voice…", stems: "Splitting the song…" }[t]);
      poll();
    } catch (e) {
      status(e.message && e.message.indexOf("HTTP") !== 0 ? e.message : "Couldn’t reach the render PC. It may be offline.", "error");
      done();
    }
  });
  function poll() {
    clearTimeout(st.timer);
    st.timer = setTimeout(async function () {
      try {
        var r = await fetch(RENDER() + "/jobs/" + st.job, { headers: { Authorization: "Bearer " + (await token()) } });
        if (r.status === 404) { status("The render PC restarted and this job was lost. Please try again.", "error"); return done(); }
        var j = await r.json(); st.fails = 0;
        if (j.status === "done") { status("Done.", "success"); done(); loadLibrary(st.job); return; }
        if (j.status === "error") { status("It failed: " + (j.error || "unknown error"), "error"); return done(); }
        if (j.status === "cancelled") { status("Cancelled.", "error"); return done(); }
        progress(Math.max(3, Math.min(99, j.progress || 0)), (j.stage || "Working…") + (j.elapsed_seconds ? " · " + fmt(j.elapsed_seconds) : ""));
        poll();
      } catch (e) { if (++st.fails > 6) { status("Lost connection. Your audio may still finish; it will show in Your audio.", "error"); return done(); } poll(); }
    }, 2500);
  }
  function progress(p, l) { $("asProgress").style.display = ""; $("asProgressFill").style.width = p + "%"; $("asProgressLabel").textContent = l || ""; }
  function done() { clearTimeout(st.timer); $("asGo").disabled = false; $("asCancel").style.display = "none"; $("asProgress").style.display = "none"; }
  $("asCancel").addEventListener("click", async function () {
    if (!st.job) return; this.disabled = true;
    try { await fetch(RENDER() + "/jobs/" + st.job + "/cancel", { method: "POST", headers: { Authorization: "Bearer " + (await token()) } }); status("Cancelling…"); } catch (e) {}
  });

  // ---------- library
  var LABEL = { audio_music: "Song", audio_sfx: "Sound FX", audio_voice: "Voice", audio_stems: "Stems" };
  var MODEL_NAMES = { ace15: "ACE-Step 1.5", minimax3: "MiniMax Music 3", stable_audio_open: "Stable Audio Open", chatterbox_turbo: "Chatterbox Turbo", chatterbox: "Chatterbox", chatterbox_mtl: "Chatterbox Multilingual", kokoro: "Kokoro", vocals: "RoFormer", "4stem": "Demucs 4-stem", "6stem": "Demucs 6-stem" };
  document.querySelector(".as-filter").addEventListener("click", function (e) {
    var b = e.target.closest("[data-f]"); if (!b) return; st.filter = b.getAttribute("data-f");
    Array.prototype.forEach.call(this.querySelectorAll("[data-f]"), function (x) { x.classList.toggle("is-on", x === b); });
    loadLibrary();
  });
  async function loadLibrary(highlight) {
    if (!st.user) return;
    var q = client.from("render_jobs").select("id,mode,prompt,status,result_url,created_at,meta").eq("user_id", st.user.id).eq("render_type", "audio").eq("status", "done").order("created_at", { ascending: false }).limit(40);
    if (st.filter) q = q.eq("mode", st.filter);
    var r = await q; var rows = r.data || [];
    var list = $("asList");
    if (!rows.length) { list.innerHTML = '<p class="as-empty">Nothing here yet. Your songs, sounds, voiceovers and stems will show up here.</p>'; return; }
    list.innerHTML = rows.map(function (x) {
      var m = x.meta || {}, url = absUrl(x.result_url), title = m.title || (x.prompt || "").slice(0, 70) || LABEL[x.mode];
      var stems = m.stems ? Object.keys(m.stems).map(function (k) { var u = absUrl(m.stems[k]); return '<div class="as-stem"><span>' + esc(k.replace(/_/g, " ")) + '</span><audio controls preload="none" src="' + esc(u) + '"></audio><a class="as-dl" href="' + esc(u) + '" download aria-label="Download ' + esc(k) + '">MP3</a></div>'; }).join("") : "";
      return '<article class="as-item' + (x.id === highlight ? " is-new" : "") + '" data-id="' + esc(x.id) + '"><div class="as-item-head"><span class="as-tag">' + esc(LABEL[x.mode] || "Audio") + "</span><strong>" + esc(title) + '</strong><small>' + esc(MODEL_NAMES[m.model] || m.model || "") + (m.seconds ? " · " + fmt(m.seconds) : "") + " · " + new Date(x.created_at).toLocaleDateString() + "</small></div>" +
        (stems ? '<div class="as-stems">' + stems + "</div>" : '<audio controls preload="none" src="' + esc(url) + '"></audio>') +
        '<div class="as-acts">' + (m.zip ? '<a class="btn btn-primary btn-sm" href="' + esc(absUrl(m.zip)) + '" download>All stems (WAV zip)</a>' : '<a class="btn btn-primary btn-sm" href="' + esc(url) + '" download>Download MP3</a>') +
        (x.prompt && x.mode !== "audio_stems" ? '<button type="button" class="btn btn-secondary btn-sm" data-reuse="1">Use again</button>' : "") +
        '<button type="button" class="btn btn-secondary btn-sm" data-del="1">Delete</button></div></article>';
    }).join("");
    list._rows = rows;
  }
  $("asList").addEventListener("click", async function (e) {
    var art = e.target.closest(".as-item"); if (!art) return;
    var row = (this._rows || []).filter(function (x) { return x.id === art.getAttribute("data-id"); })[0]; if (!row) return;
    if (e.target.closest("[data-reuse]")) {
      st.tool = row.mode.replace("audio_", ""); if (row.meta && row.meta.model && CAT[st.tool][row.meta.model]) st.model[st.tool] = row.meta.model;
      paint(); $("asPrompt").value = row.prompt || ""; $("asPrompt").focus(); window.scrollTo({ top: 0, behavior: "smooth" });
    }
    if (e.target.closest("[data-del]")) {
      if (!window.confirm("Delete this audio permanently?")) return;
      try { await fetch(RENDER() + "/jobs/" + row.id + "?table=render_jobs", { method: "DELETE", headers: { Authorization: "Bearer " + (await token()) } }); } catch (e2) {}
      await client.from("render_jobs").delete().eq("id", row.id);
      loadLibrary();
    }
  });
})();

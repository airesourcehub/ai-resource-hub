// AI Resource Hub — Prompt Generator logic
// Builds prompts for Text/Writing, Image, and Video AI tools, formatted to
// match the specific prompting conventions of the selected model.

var ENHANCE_FUNCTION_URL = "https://flzhhgfkpdmszucoljpu.supabase.co/functions/v1/enhance-prompt";

document.addEventListener("DOMContentLoaded", function () {
  var tabs = document.querySelectorAll(".tool-tab");
  var panels = document.querySelectorAll(".generator-panel");

  // Output boxes auto-grow to fit whatever prompt was generated instead of
  // staying a fixed small size and forcing a scrollbar — textareas don't do
  // this natively, so height is measured off scrollHeight after every value
  // change. Declared up here (not down with the other helpers) because
  // bindPanel() below pushes into this array as each panel is bound, and
  // that happens before the file reaches the helpers section.
  var autoGrowOutputs = [];
  function autoGrowOutput(el) {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }
  function growAllOutputs() {
    autoGrowOutputs.forEach(autoGrowOutput);
  }
  window.addEventListener("resize", growAllOutputs);
  window.addEventListener("orientationchange", growAllOutputs);

  // ---------- AI enhance: auth session tracking ----------
  // Basic template-building below needs no login (runs fully client-side).
  // The "Enhance with AI" button calls a Supabase Edge Function that
  // actually sends the fields to Claude, so it's gated to logged-in
  // accounts to keep API costs bounded to this site's invite-only users.
  var currentUser = null;
  var enhanceGates = []; // functions to call whenever auth state changes
  var isSupabaseConfigured = typeof SUPABASE_URL !== "undefined" &&
    SUPABASE_URL.indexOf("YOUR_SUPABASE") === -1 &&
    SUPABASE_ANON_KEY.indexOf("YOUR_SUPABASE") === -1 &&
    typeof window.supabase !== "undefined";

  if (isSupabaseConfigured) {
    var authClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    authClient.auth.getSession().then(function (result) {
      currentUser = result.data.session ? result.data.session.user : null;
      applyEnhanceGates();
    });
    authClient.auth.onAuthStateChange(function (_event, session) {
      currentUser = session ? session.user : null;
      applyEnhanceGates();
    });
  }

  function applyEnhanceGates() {
    enhanceGates.forEach(function (fn) { fn(); });
  }

  function getAccessToken() {
    if (!isSupabaseConfigured) return Promise.resolve(null);
    return authClient.auth.getSession().then(function (result) {
      return result.data.session ? result.data.session.access_token : null;
    });
  }

  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      var target = tab.getAttribute("data-tool");
      tabs.forEach(function (t) { t.classList.remove("active"); });
      tab.classList.add("active");
      panels.forEach(function (panel) {
        panel.classList.toggle("active", panel.id === "panel-" + target);
      });
      // The just-shown panel's output box was sized while display:none (so
      // scrollHeight read as 0) — recalculate now that it's actually visible.
      growAllOutputs();
    });
  });

  // ---------- Basic / Advanced mode ----------
  // Basic mode shows only the essential field per panel (model + the core
  // description field); Advanced reveals every optional field. Persisted
  // across visits via localStorage.
  (function () {
    var MODE_KEY = "ai-resource-hub-prompt-mode";
    var root = document.getElementById("promptGeneratorRoot");
    var basicBtn = document.getElementById("modeBasicBtn");
    var advancedBtn = document.getElementById("modeAdvancedBtn");
    if (!root || !basicBtn || !advancedBtn) return;

    function applyMode(mode) {
      root.classList.toggle("mode-advanced", mode === "advanced");
      basicBtn.classList.toggle("active", mode === "basic");
      advancedBtn.classList.toggle("active", mode === "advanced");
    }

    function setMode(mode) {
      try { localStorage.setItem(MODE_KEY, mode); } catch (e) {}
      applyMode(mode);
    }

    var stored;
    try { stored = localStorage.getItem(MODE_KEY); } catch (e) { stored = null; }
    applyMode(stored === "advanced" ? "advanced" : "basic");

    basicBtn.addEventListener("click", function () { setMode("basic"); });
    advancedBtn.addEventListener("click", function () { setMode("advanced"); });
  })();

  var MODEL_NOTES = {
    // Text
    chatgpt: "Conversational, natural language. Works well with role + task + tone instructions.",
    claude: "Responds well to clear structure. This uses tags to separate role, task, and context.",
    gemini: "Conversational, natural language — similar to ChatGPT, integrates with Google Workspace context.",
    // Image
    midjourney: "Comma-separated descriptive phrase plus -- parameters at the end (aspect ratio, version, exclusions).",
    dalle: "Full natural-language sentences work best. Avoid comma-tag lists or -- parameters.",
    stablediffusion: "Comma-separated tags/tokens. Supports (keyword:1.3) weighting and a separate negative prompt.",
    firefly: "Natural-language description, similar to DALL-E. No negative prompt field — describe what you want directly.",
    seedream: "Full natural-language description, similar to DALL-E — no comma-tag lists or -- parameters needed.",
    // Video
    ltx: "Chronological structure: main action first, then motion detail, then environment, camera/lighting last. Keep it literal.",
    veo: "Natural-language cinematic paragraph — describe the scene like a shot list, in prose.",
    runway: "Descriptive prompt plus explicit camera controls (pan, dolly, focal length, rack focus).",
    sora: "Narrative, cinematic prose. Supports explicit camera direction (Director's Mode style).",
    kling: "Descriptive prompt plus a distinct camera movement cue. Supports an optional negative prompt.",
    pika: "Descriptive prompt plus dash parameters, e.g. -ar (aspect ratio), -motion, -gs (guidance scale).",
    wan: "Structured 6-part prompt: camera movement, subject/scene, motion, camera language, style, atmosphere. Supports a negative prompt.",
    seedance: "Natural-language cinematic paragraph, similar to Veo/Runway/Sora — describe the scene and camera movement in prose."
  };

  // ---------- TEXT / WRITING ----------
  var textFields = ["textModel", "textRole", "textFormat", "textTopic", "textAudience", "textTone", "textDetails"];
  var textFieldLabels = {
    textRole: "Role/persona for the AI to act as",
    textFormat: "Format",
    textTopic: "Topic or goal",
    textAudience: "Audience",
    textTone: "Tone",
    textDetails: "Extra details"
  };
  bindPanel(textFields, buildTextPrompt, "textPromptOutput", "textModel", "textModelNote", {
    category: "text",
    panelPrefix: "text",
    fieldLabels: textFieldLabels
  });

  function buildTextPrompt() {
    var model = val("textModel") || "chatgpt";
    var role = val("textRole") || "a helpful expert writer";
    var format = val("textFormat") || "piece of content";
    var topic = val("textTopic") || "[your topic]";
    var audience = val("textAudience");
    var tone = val("textTone");
    var details = val("textDetails");

    if (model === "claude") {
      var xml = "<role>" + role + "</role>\n";
      xml += "<task>Write a " + format + " about " + topic + ".</task>\n";
      if (audience) xml += "<audience>" + audience + "</audience>\n";
      if (tone) xml += "<tone>" + tone + "</tone>\n";
      if (details) xml += "<additional_details>" + details + "</additional_details>\n";
      xml += "<instructions>Keep the writing clear, well-structured, and free of filler.</instructions>";
      return xml;
    }

    // chatgpt / gemini / default — conversational natural language
    var prompt = "Act as " + role + ". Write a " + format + " about " + topic + ".";
    if (audience) prompt += " The target audience is " + audience + ".";
    if (tone) prompt += " Use a " + tone + " tone.";
    if (details) prompt += " Additional details to include: " + details + ".";
    prompt += " Keep the writing clear, well-structured, and free of filler.";
    return prompt;
  }

  // ---------- IMAGE ----------
  var imageFields = ["imgModel", "imgSubject", "imgStyle", "imgSetting", "imgLighting", "imgMood", "imgAspect", "imgNegative", "imgDetails"];
  var imageFieldLabels = {
    imgSubject: "Main subject",
    imgStyle: "Art style",
    imgSetting: "Setting/background",
    imgLighting: "Lighting",
    imgMood: "Mood",
    imgAspect: "Aspect ratio",
    imgNegative: "Negative prompt (things to avoid)",
    imgDetails: "Extra details"
  };
  bindPanel(imageFields, buildImagePrompt, "imagePromptOutput", "imgModel", "imgModelNote", {
    category: "image",
    panelPrefix: "img",
    fieldLabels: imageFieldLabels
  });

  function buildImagePrompt() {
    var model = val("imgModel") || "midjourney";
    var subject = val("imgSubject") || "[main subject]";
    var style = val("imgStyle");
    var setting = val("imgSetting");
    var lighting = val("imgLighting");
    var mood = val("imgMood");
    var aspect = val("imgAspect");
    var negative = val("imgNegative");
    var details = val("imgDetails");

    if (model === "dalle" || model === "firefly" || model === "seedream") {
      var sentence = "A" + (style ? " " + style : "") + " image of " + subject;
      if (setting) sentence += ", set in " + setting;
      if (lighting) sentence += ", with " + lighting + " lighting";
      if (mood) sentence += ", conveying a " + mood + " mood";
      sentence += ".";
      if (details) sentence += " " + details + ".";
      return sentence;
    }

    if (model === "stablediffusion") {
      var tags = [subject];
      if (setting) tags.push(setting);
      if (style) tags.push(style);
      if (lighting) tags.push(lighting + " lighting");
      if (mood) tags.push(mood + " mood");
      if (details) tags.push(details);
      var sd = tags.join(", ");
      if (negative) sd += "\nNegative prompt: " + negative;
      return sd;
    }

    // midjourney (default)
    var parts = [subject];
    if (setting) parts.push("set in " + setting);
    if (style) parts.push(style + " style");
    if (lighting) parts.push(lighting + " lighting");
    if (mood) parts.push(mood + " mood");
    if (details) parts.push(details);
    var mj = parts.join(", ");
    if (aspect) mj += " --ar " + aspect;
    mj += " --v 7";
    if (negative) mj += " --no " + negative;
    return mj;
  }

  // ---------- VIDEO ----------
  var videoFields = ["vidModel", "vidScene", "vidCamera", "vidStyle", "vidPacing", "vidMood", "vidNegative", "vidDetails"];
  var videoFieldLabels = {
    vidScene: "Scene description",
    vidCamera: "Camera movement",
    vidStyle: "Visual style",
    vidPacing: "Pacing/motion",
    vidMood: "Mood",
    vidNegative: "Negative prompt (things to avoid)",
    vidDetails: "Extra details"
  };
  bindPanel(videoFields, buildVideoPrompt, "videoPromptOutput", "vidModel", "vidModelNote", {
    category: "video",
    panelPrefix: "vid",
    fieldLabels: videoFieldLabels
  });

  function buildVideoPrompt() {
    var model = val("vidModel") || "ltx";
    var scene = val("vidScene") || "[describe the scene]";
    var camera = val("vidCamera");
    var style = val("vidStyle");
    var pacing = val("vidPacing");
    var mood = val("vidMood");
    var negative = val("vidNegative");
    var details = val("vidDetails");

    if (model === "ltx") {
      // Chronological: action first, motion detail, environment/character, camera + lighting last
      var ltx = scene + ".";
      if (pacing) ltx += " Motion: " + pacing + ".";
      if (details) ltx += " " + details + ".";
      if (camera) ltx += " Camera: " + camera + ".";
      if (style) ltx += " Style: " + style + ".";
      ltx += " Describe motion literally and in the order it happens.";
      return ltx;
    }

    if (model === "pika") {
      var pika = scene;
      if (style) pika += ", " + style + " style";
      if (mood) pika += ", " + mood + " mood";
      if (details) pika += ", " + details;
      pika += " -motion " + (pacing ? "2" : "1") + " -gs 12";
      return pika;
    }

    if (model === "kling") {
      var kling = scene + ".";
      if (camera) kling += " camera_movement: " + camera + ".";
      if (style) kling += " style: " + style + ".";
      if (mood) kling += " mood: " + mood + ".";
      if (details) kling += " " + details + ".";
      if (negative) kling += "\nNegative prompt: " + negative;
      return kling;
    }

    if (model === "wan") {
      // Wan's documented structure: Camera Movement + Subject/Scene + Motion
      // + Camera Language + Style + Atmosphere, plus an optional negative prompt.
      var wan = "";
      if (camera) wan += "Camera movement: " + camera + ". ";
      wan += "Subject and scene: " + scene + ". ";
      if (pacing) wan += "Motion: " + pacing + ". ";
      if (style) wan += "Style: " + style + ". ";
      if (mood) wan += "Atmosphere: " + mood + ". ";
      if (details) wan += details + ". ";
      wan = wan.trim();
      if (negative) wan += "\nNegative prompt: " + negative;
      return wan;
    }

    // veo / runway / sora / seedance — cinematic natural-language paragraph
    var prompt = "A video of " + scene + ".";
    if (camera) prompt += " Camera: " + camera + ".";
    if (style) prompt += " Visual style: " + style + ".";
    if (pacing) prompt += " Pacing: " + pacing + ".";
    if (mood) prompt += " Mood: " + mood + ".";
    if (details) prompt += " Additional details: " + details + ".";
    return prompt;
  }

  // ---------- helpers ----------
  function val(id) {
    var el = document.getElementById(id);
    return el ? el.value.trim() : "";
  }

  // (autoGrowOutput / growAllOutputs are declared near the top of this
  // file's DOMContentLoaded handler, before bindPanel() is ever called.)

  function bindPanel(fieldIds, buildFn, outputId, modelSelectId, noteId, enhanceOpts) {
    var output = document.getElementById(outputId);
    if (!output) return;

    autoGrowOutputs.push(output);

    function update() {
      output.value = buildFn();
      output.classList.remove("ai-enhanced");
      autoGrowOutput(output);
      var noteEl = document.getElementById(noteId);
      if (noteEl && modelSelectId) {
        var model = val(modelSelectId);
        noteEl.textContent = MODEL_NOTES[model] || "";
      }
    }

    fieldIds.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener("input", update);
      if (el) el.addEventListener("change", update);
    });

    update();

    var card = output.closest(".output-card");
    var copyBtn = card ? card.querySelector(".copy-btn") : null;
    var feedback = card ? card.querySelector(".copy-feedback") : null;

    if (copyBtn) {
      copyBtn.addEventListener("click", function () {
        output.select();
        navigator.clipboard.writeText(output.value).then(function () {
          if (feedback) {
            feedback.classList.add("show");
            setTimeout(function () { feedback.classList.remove("show"); }, 2000);
          }
        }).catch(function () {
          document.execCommand("copy");
        });
      });
    }

    var clearBtn = card ? card.querySelector(".clear-btn") : null;
    if (clearBtn) {
      clearBtn.addEventListener("click", function () {
        fieldIds.forEach(function (id) {
          var el = document.getElementById(id);
          if (el && el.tagName !== "SELECT") el.value = "";
        });
        update();
      });
    }

    if (enhanceOpts) wireEnhance(enhanceOpts, fieldIds, modelSelectId, output);
  }

  // Wires the "✨ Enhance with AI" button for one panel: shows a login
  // prompt instead of the button when logged out, and otherwise sends the
  // current field values to the enhance-prompt Edge Function and swaps the
  // output textarea's content for Claude's rewrite on success.
  function wireEnhance(opts, fieldIds, modelSelectId, output) {
    var prefix = opts.panelPrefix;
    var btn = document.getElementById(prefix + "EnhanceBtn");
    var status = document.getElementById(prefix + "EnhanceStatus");
    var authNote = document.getElementById(prefix + "EnhanceAuthNote");
    if (!btn) return;

    function gate() {
      var loggedIn = !!currentUser;
      btn.style.display = loggedIn ? "" : "none";
      if (authNote) authNote.style.display = loggedIn ? "none" : "block";
    }
    gate();
    enhanceGates.push(gate);

    btn.addEventListener("click", function () {
      if (!currentUser) return;

      var fields = {};
      fieldIds.forEach(function (id) {
        if (id === modelSelectId) return;
        var label = (opts.fieldLabels && opts.fieldLabels[id]) || id;
        var v = val(id);
        if (v) fields[label] = v;
      });

      if (!Object.keys(fields).length) {
        status.textContent = "Fill in at least one field first.";
        status.className = "ai-enhance-status show error";
        return;
      }

      btn.disabled = true;
      status.textContent = "Enhancing with AI...";
      status.className = "ai-enhance-status show";

      getAccessToken().then(function (token) {
        if (!token) {
          status.textContent = "Please log in again.";
          status.className = "ai-enhance-status show error";
          btn.disabled = false;
          return;
        }

        return fetch(ENHANCE_FUNCTION_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
          body: JSON.stringify({ category: opts.category, model: val(modelSelectId), fields: fields })
        }).then(function (res) {
          return res.json().then(function (data) {
            if (!res.ok) throw new Error(data.error || "AI enhancement failed.");
            output.value = data.prompt;
            output.classList.add("ai-enhanced");
            autoGrowOutput(output);
            status.textContent = "✨ Enhanced";
            status.className = "ai-enhance-status show success";
          });
        });
      }).catch(function (err) {
        status.textContent = err.message || "Something went wrong.";
        status.className = "ai-enhance-status show error";
      }).then(function () {
        btn.disabled = false;
      });
    });
  }
});

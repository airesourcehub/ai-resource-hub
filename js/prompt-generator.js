// AI Resource Hub — Prompt Generator logic
// Builds prompts for Text/Writing, Image, and Video AI tools, formatted to
// match the specific prompting conventions of the selected model.

document.addEventListener("DOMContentLoaded", function () {
  var tabs = document.querySelectorAll(".tool-tab");
  var panels = document.querySelectorAll(".generator-panel");

  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      var target = tab.getAttribute("data-tool");
      tabs.forEach(function (t) { t.classList.remove("active"); });
      tab.classList.add("active");
      panels.forEach(function (panel) {
        panel.classList.toggle("active", panel.id === "panel-" + target);
      });
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
    // Video
    ltx: "Chronological structure: main action first, then motion detail, then environment, camera/lighting last. Keep it literal.",
    veo: "Natural-language cinematic paragraph — describe the scene like a shot list, in prose.",
    runway: "Descriptive prompt plus explicit camera controls (pan, dolly, focal length, rack focus).",
    sora: "Narrative, cinematic prose. Supports explicit camera direction (Director's Mode style).",
    kling: "Descriptive prompt plus a distinct camera movement cue. Supports an optional negative prompt.",
    pika: "Descriptive prompt plus dash parameters, e.g. -ar (aspect ratio), -motion, -gs (guidance scale).",
    wan: "Structured 6-part prompt: camera movement, subject/scene, motion, camera language, style, atmosphere. Supports a negative prompt."
  };

  // ---------- TEXT / WRITING ----------
  var textFields = ["textModel", "textRole", "textFormat", "textTopic", "textAudience", "textTone", "textDetails"];
  bindPanel(textFields, buildTextPrompt, "textPromptOutput", "textModel", "textModelNote");

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
  bindPanel(imageFields, buildImagePrompt, "imagePromptOutput", "imgModel", "imgModelNote");

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

    if (model === "dalle" || model === "firefly") {
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
  bindPanel(videoFields, buildVideoPrompt, "videoPromptOutput", "vidModel", "vidModelNote");

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

    // veo / runway / sora — cinematic natural-language paragraph
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

  function bindPanel(fieldIds, buildFn, outputId, modelSelectId, noteId) {
    var output = document.getElementById(outputId);
    if (!output) return;

    function update() {
      output.value = buildFn();
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
  }
});

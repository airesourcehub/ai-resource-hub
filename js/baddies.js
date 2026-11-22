// AI Resource Hub — Baddies Generator.
// Design a curvy "Baddie" character: skin tone, height, body shape and how
// exaggerated the curves are, then hair, outfit, tattoos and a real firearm.
// The settings become one detailed prompt that runs on your GPU through the
// normal render service (POST /image-jobs, same as AI Influencer). When the
// curves are pushed high, a second Qwen Edit pass ("post_edit") exaggerates
// only the body so the model can't quietly tone it down.
// Saved characters live in the Supabase "baddies" table (settings JSON + image job id).
// Admin: Site Settings → Baddies Generator (site_settings 'site' → baddies).

(function () {
  var $ = function (id) { return document.getElementById(id); };
  if (!$("bd")) return;
  var RENDER = function () { return window.AIRH_GPU ? window.AIRH_GPU.base() : "https://render.airesourcehub.vip"; };
  var POLL_MS = 3000, PAGE = 24, PREFS = "airh-baddies";

  // ------------------------------------------------------------ admin settings
  var CFG = { enabled: true, preview: true, heightMin: 36, heightMax: 84, heightDefault: 58, exagDefault: 80, maxBatch: 4, engine: "zimage", view: "sheet" };
  try { var ss = JSON.parse(localStorage.getItem("airh-site-settings") || "null"); if (ss && ss.baddies) CFG = Object.assign(CFG, ss.baddies); } catch (e) {}

  // ------------------------------------------------------------ catalog
  var SKIN = [
    ["porcelain", "Porcelain", "#f3d9c8", "porcelain fair"],
    ["fair", "Fair", "#ebc6a8", "fair light"],
    ["olive", "Light olive", "#d9ae86", "light olive"],
    ["honey", "Honey", "#cf9a67", "warm honey"],
    ["tan", "Golden tan", "#c18552", "golden tan"],
    ["caramel", "Caramel", "#ad7444", "smooth caramel brown"],
    ["bronze", "Bronze", "#97603a", "rich bronze"],
    ["chestnut", "Chestnut", "#80502f", "chestnut brown"],
    ["mocha", "Mocha", "#6a3f25", "deep mocha brown"],
    ["espresso", "Espresso", "#4f2d1a", "dark espresso brown"],
    ["ebony", "Deep ebony", "#36200f", "deep ebony"]
  ];

  // Body sliders 0–10. words[i] = wording for value tiers 0-2, 3-4, 5-6, 7-8, 9-10.
  var SHAPE = [
    { id: "waist", label: "Waist", lo: "Soft", hi: "Snatched", words: ["a soft natural waist", "a defined waist", "a small cinched waist", "a tiny snatched waist", "an extremely tiny, wasp-thin snatched waist"] },
    { id: "hips", label: "Hips", lo: "Narrow", hi: "Very wide", words: ["slim hips", "curvy hips", "wide hips", "very wide hips", "extremely wide, dramatic hips"] },
    { id: "glutes", label: "Glutes", lo: "Small", hi: "Huge", words: ["a small rear", "a round rear", "big round glutes", "very big, round, lifted glutes", "huge, extremely round, lifted glutes"] },
    { id: "thighs", label: "Thighs", lo: "Slim", hi: "Very thick", words: ["slim thighs", "toned thighs", "thick thighs", "very thick, full thighs", "extremely thick, full thighs"] },
    { id: "bust", label: "Bust", lo: "Small", hi: "Full", words: ["a small bust", "a modest bust", "a medium bust", "a full bust", "a very full bust"] },
    { id: "tone", label: "Muscle tone", lo: "Soft", hi: "Ripped", words: ["soft curves", "smooth curves", "lightly toned curves", "toned athletic curves", "visibly muscular, fit curves"] }
  ];

  var BODY_PRESETS = [
    { id: "ref", label: "Signature", v: { waist: 9, hips: 9, glutes: 10, thighs: 9, bust: 5, tone: 3 }, exag: 80 },
    { id: "slimthick", label: "Slim thick", v: { waist: 8, hips: 7, glutes: 7, thighs: 7, bust: 5, tone: 4 }, exag: 60 },
    { id: "petite", label: "Petite curvy", v: { waist: 7, hips: 6, glutes: 7, thighs: 6, bust: 4, tone: 3 }, exag: 50 },
    { id: "athletic", label: "Athletic", v: { waist: 7, hips: 6, glutes: 7, thighs: 7, bust: 4, tone: 8 }, exag: 45 },
    { id: "max", label: "Max curves", v: { waist: 10, hips: 10, glutes: 10, thighs: 10, bust: 6, tone: 2 }, exag: 100 }
  ];

  // Option groups: [id, label, prompt wording]
  var LOOK = [
    { id: "hair", label: "Hair", opts: [
      ["straight", "Long bone straight", "very long sleek bone-straight hair with a middle part, past the waist"],
      ["wave", "Body wave", "long glossy body-wave hair"],
      ["curly", "Curly", "big long voluminous curly hair"],
      ["knotless", "Knotless braids", "long waist-length knotless braids"],
      ["butterfly", "Butterfly locs", "long butterfly locs"],
      ["pony", "Sleek high ponytail", "a sleek high ponytail reaching her lower back"],
      ["buns", "Space buns", "two sleek space buns with face-framing strands"],
      ["bob", "Sleek bob", "a sleek chin-length bob"],
      ["pixie", "Pixie cut", "a short pixie cut"],
      ["own", "Their own hair", ""]] },
    { id: "haircolor", label: "Hair color", opts: [
      ["black", "Jet black", "jet black"], ["brown", "Dark brown", "dark brown"], ["honey", "Honey blonde", "honey blonde"],
      ["platinum", "Platinum", "platinum blonde"], ["burgundy", "Burgundy", "deep burgundy"], ["copper", "Copper", "copper ginger"],
      ["pink", "Pink", "hot pink"], ["blue", "Icy blue", "icy blue"], ["own", "Their own color", ""]] },
    { id: "makeup", label: "Makeup", opts: [
      ["natural", "Natural", "soft natural makeup"], ["glam", "Full glam", "full glam makeup with lashes and glossy lips"],
      ["bold", "Bold", "bold makeup with sharp winged liner and dark lips"]] },
    { id: "eyes", label: "Eyes", opts: [
      ["brown", "Brown", "brown eyes"], ["hazel", "Hazel", "hazel eyes"], ["green", "Green", "green eyes"], ["grey", "Grey", "grey eyes"], ["blue", "Blue", "blue eyes"]] },
    { id: "expr", label: "Expression", opts: [
      ["confident", "Confident", "a calm confident expression"], ["smirk", "Smirk", "a sly smirk"], ["fierce", "Fierce", "a fierce, focused stare"], ["smile", "Smile", "a soft smile"]] }
  ];

  var GEAR = [
    { id: "camo", label: "Camo / colorway", opts: [
      ["snow", "Winter white camo", "white-and-grey winter snow camo"],
      ["desert", "Desert tan", "desert tan camo"],
      ["woodland", "Woodland green", "woodland green camo"],
      ["urban", "Urban black", "all-black urban tactical"],
      ["navy", "Navy digital", "navy blue digital camo"],
      ["pink", "Pink camo", "pink camo"],
      ["red", "Red ops", "black with red accents"]] },
    { id: "top", label: "Top", opts: [
      ["puffer", "Cropped puffer + fur hood", "a cropped puffer jacket with a fur-trimmed hood"],
      ["crop", "Tactical crop top", "a fitted tactical crop top"],
      ["jacket", "Cropped field jacket", "a cropped military field jacket"],
      ["hoodie", "Cropped hoodie", "a cropped hoodie"],
      ["tank", "Fitted tank", "a fitted ribbed tank top"]] },
    { id: "bottom", label: "Bottom", opts: [
      ["bodysuit", "High-cut bodysuit", "a high-cut fitted bodysuit"],
      ["shorts", "Biker shorts", "fitted biker shorts"],
      ["cargo", "Cargo shorts", "short fitted cargo shorts"],
      ["leggings", "Camo leggings", "fitted camo leggings"],
      ["pants", "Cargo pants", "fitted low-rise cargo pants"]] },
    { id: "gear", label: "Gear", multi: 4, opts: [
      ["vest", "Plate carrier", "a tactical plate carrier vest"],
      ["chest", "Chest rig", "a chest rig with magazine pouches"],
      ["gloves", "Tactical gloves", "tactical gloves"],
      ["pads", "Knee pads", "knee pads"],
      ["headset", "Headset", "a tactical headset"],
      ["beanie", "Beanie", "a beanie"],
      ["cap", "Cap", "a tactical cap"],
      ["shades", "Shades", "dark sunglasses"],
      ["holster", "Thigh holster", "a drop-leg thigh holster"]] },
    { id: "boots", label: "Boots", opts: [
      ["white", "White combat", "chunky white combat boots"], ["black", "Black combat", "black combat boots"],
      ["tan", "Tan combat", "tan desert combat boots"], ["sneakers", "Sneakers", "chunky sneakers"]] }
  ];

  var INK = [
    { id: "tattoos", label: "Tattoos", opts: [
      ["none", "None", ""], ["accents", "Small accents", "a few small tattoos"],
      ["legs", "Leg sleeves", "full leg sleeve tattoos on both legs"], ["arms", "Arm sleeves", "full arm sleeve tattoos"],
      ["full", "Legs, arms + neck", "full leg sleeve tattoos, arm sleeves and a neck tattoo"]] },
    { id: "inkstyle", label: "Tattoo style", opts: [
      ["color", "Bright color", "vivid full-color neo-traditional"], ["blackgrey", "Black & grey", "black and grey realism"],
      ["japanese", "Japanese", "colorful Japanese irezumi"], ["script", "Script & fine line", "fine-line script and ornamental"]] },
    { id: "jewelry", label: "Jewelry", multi: 3, opts: [
      ["hoops", "Gold hoops", "gold hoop earrings"], ["studs", "Diamond studs", "diamond stud earrings"],
      ["chain", "Gold chain", "a gold chain necklace"], ["tennis", "Tennis necklace", "a diamond tennis necklace"],
      ["dogtags", "Dog tags", "silver dog tags"], ["nails", "Long nails", "long glossy nails"]] }
  ];

  var WEAPONS = [
    ["none", "No weapon", "", ""],
    ["ak47", "AK-47", "a real AK-47 assault rifle (7.62x39, wooden furniture, curved magazine)", "rifle"],
    ["akm", "AKM (black)", "a real AKM rifle with black polymer furniture and a curved magazine", "rifle"],
    ["m4a1", "M4A1 carbine", "a real Colt M4A1 carbine with a collapsible stock and red-dot sight", "rifle"],
    ["hk416", "HK416", "a real Heckler & Koch HK416 rifle", "rifle"],
    ["scar", "FN SCAR-L", "a real FN SCAR-L rifle", "rifle"],
    ["mp5", "MP5", "a real Heckler & Koch MP5 submachine gun", "smg"],
    ["uzi", "Uzi", "a real IMI Uzi submachine gun", "smg"],
    ["remington", "Remington 870", "a real Remington 870 pump-action shotgun", "rifle"],
    ["barrett", "Barrett M82", "a real Barrett M82 .50 cal sniper rifle", "rifle"],
    ["glock", "Glock 19", "a real Glock 19 pistol", "pistol"],
    ["deagle", "Desert Eagle", "a real IMI Desert Eagle .50 pistol", "pistol"]
  ];
  var HOLDS = [
    ["low", "Low ready", "holding it at low ready across her body"],
    ["shoulder", "Shouldered", "holding it shouldered and aimed"],
    ["sling", "Slung", "with it slung across her back on a sling"],
    ["side", "At her side", "holding it relaxed down at her side"]
  ];

  var VIEWS = {
    sheet: { label: "Turnaround", w: 1344, h: 768, lead: "Character turnaround reference sheet of", tail: "shown three times side by side as the exact same character on one sheet: front view, side profile view and back view, all full body head to toe with boots visible, identical outfit, tattoos, hair and weapon in every view" },
    full: { label: "Full body", w: 832, h: 1216, lead: "Full-body shot, head to toe, of", tail: "standing facing the camera, whole body in frame including boots" },
    back: { label: "Rear 3/4", w: 832, h: 1216, lead: "Full-body three-quarter rear view shot, head to toe, of", tail: "looking back over her shoulder at the camera, whole body in frame including boots" },
    action: { label: "Action pose", w: 832, h: 1216, lead: "Dynamic full-body action shot of", tail: "in a confident combat stance, whole body in frame" },
    portrait: { label: "Portrait", w: 896, h: 1152, lead: "Waist-up portrait of", tail: "looking into the camera" }
  };
  // Looks: drive both the AI render style and the live 3D preview (js/baddies-3d.js LOOKS uses the same ids).
  var STYLES = [
    ["game", "FPS game", "high-end 3D video game character render, Unreal Engine 5 quality, detailed skin shading, crisp"],
    ["photo", "Realistic", "photorealistic photograph of a real person, natural skin texture with pores, cinematic lighting, shot on a full-frame camera with an 85mm lens, sharp focus, high detail"],
    ["anime", "Anime", "anime style illustration, cel-shaded, clean bold line art, vibrant colors, detailed anime character design"],
    ["comic", "Comic book", "American comic book art, bold black ink outlines, halftone dot shading, vivid flat colors"],
    ["clay", "Claymation", "claymation stop-motion style, handmade plasticine clay character with visible fingerprints and sculpting marks, miniature set, soft studio lighting"],
    ["sculpt", "Clay sculpt", "matte grey digital clay sculpture render, no textures, character sculpt turnaround"],
    ["marble", "Marble statue", "classical white marble statue, carved polished stone with grey veins, museum lighting"],
    ["gold", "Gold statue", "solid polished gold statue, reflective metal, luxury trophy, dark background"],
    ["synth", "Synthwave", "synthwave neon style, Miami night, magenta and cyan neon rim lighting, retro 80s aesthetic, glowing grid floor"],
    ["pencil", "Pencil sketch", "detailed graphite pencil sketch on paper, hand-drawn hatching, black and white"],
    ["ps1", "Retro low-poly", "low-poly retro 1990s video game character, PS1-era graphics, pixelated low-res textures"],
    ["watercolor", "Watercolor", "soft watercolor painting, loose brush strokes, paper texture, pastel washes"],
    ["nightvision", "Night vision", "night vision camera footage, green monochrome, grainy military optics"],
    ["thermal", "Thermal", "thermal imaging camera view, heat-map colors, FLIR style"],
    ["hologram", "Hologram", "glowing blue sci-fi hologram projection, translucent, scanlines, futuristic"]
  ];
  var BGS = [
    ["white", "White studio", "plain light-grey seamless studio background, soft even lighting"],
    ["snow", "Snowy ruins", "a snowy war-torn city street background"],
    ["desert", "Desert base", "a dusty desert military compound background"],
    ["miami", "Miami night", "a neon-lit Miami street at night background"],
    ["jungle", "Jungle", "a dense jungle background"]
  ];

  var NEGATIVE = "child, minor, teen, young-looking, childlike body, nude, nudity, topless, nipples, genitals, nsfw, explicit, " +
    "white ink tattoo, white tattoos, fake gun, toy gun, made-up gun, deformed gun, extra barrels, mangled weapon, " +
    "extra limbs, extra fingers, deformed hands, bad anatomy, blurry, watermark, text, logo, cropped head, cropped feet";

  var DEFAULTS = {
    skin: "caramel", height: CFG.heightDefault, exag: CFG.exagDefault,
    shape: { waist: 9, hips: 9, glutes: 10, thighs: 9, bust: 5, tone: 3 },
    pick: { hair: ["straight"], haircolor: ["black"], makeup: ["glam"], eyes: ["brown"], expr: ["confident"],
      camo: ["snow"], top: ["puffer"], bottom: ["bodysuit"], gear: ["vest", "gloves"], boots: ["white"],
      tattoos: ["legs"], inkstyle: ["color"], jewelry: ["studs"] },
    weapon: "ak47", hold: "low", view: CFG.view in VIEWS ? CFG.view : "sheet", style: "game", bg: "white"
  };

  // ------------------------------------------------------------ state
  var prefs = loadPrefs();
  var state = clone(DEFAULTS);
  state.engine = prefs.engine || CFG.engine || "zimage";
  state.batch = clampN(prefs.batch || 1, 1, CFG.maxBatch || 4);
  if (prefs.last) applySettings(prefs.last, true);
  state.user = null; state.mine = []; state.offset = 0;
  state.chars = []; state.char = (prefs.last && prefs.last.char) || null;

  var hasSb = !!(window.supabase && typeof SUPABASE_URL !== "undefined");
  var client = hasSb ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

  // ------------------------------------------------------------ render the panel
  function renderPanel() {
    $("bdBodyPresets").innerHTML = BODY_PRESETS.map(function (p) { return '<button type="button" data-bp="' + p.id + '">' + esc(p.label) + "</button>"; }).join("");
    $("bdSkin").innerHTML = SKIN.map(function (s) {
      return '<button type="button" role="radio" data-skin="' + s[0] + '" title="' + esc(s[1]) + '" aria-label="' + esc(s[1]) + '" style="--sw:' + s[2] + '"></button>';
    }).join("");
    var hmin = clampN(CFG.heightMin, 36, 83), hmax = clampN(CFG.heightMax, hmin + 1, 84);
    $("bdHeight").min = hmin; $("bdHeight").max = hmax;
    $("bdHeightMin").textContent = ftIn(hmin); $("bdHeightMax").textContent = ftIn(hmax);
    $("bdShape").innerHTML = SHAPE.map(function (s) {
      return '<div class="bd-slider bd-slider-sm"><div class="bd-row-lbl"><label for="bdS_' + s.id + '">' + s.label + '</label><b data-sv="' + s.id + '"></b></div>' +
        '<input type="range" id="bdS_' + s.id + '" data-shape="' + s.id + '" min="0" max="10" step="1" />' +
        '<div class="bd-scale"><span>' + s.lo + "</span><span>" + s.hi + "</span></div></div>";
    }).join("");
    $("bdLook").innerHTML = LOOK.map(groupHtml).join("");
    $("bdGear").innerHTML = GEAR.map(groupHtml).join("");
    $("bdInk").innerHTML = INK.map(groupHtml).join("");
    $("bdWeapon").innerHTML = chipRow("weapon", "Model", WEAPONS) + chipRow("hold", "How she holds it", HOLDS);
    $("bdScene").innerHTML = chipRow("view", "Shot", Object.keys(VIEWS).map(function (k) { return [k, VIEWS[k].label]; })) +
      chipRow("style", "Look", STYLES) + chipRow("bg", "Background", BGS);
  }
  function groupHtml(g) {
    return '<div class="bd-group" data-g="' + g.id + '"><div class="bd-row-lbl"><span>' + esc(g.label) + (g.multi ? " <small>up to " + g.multi + "</small>" : "") + "</span></div>" +
      '<div class="bd-chips">' + g.opts.map(function (o) { return '<button type="button" data-gid="' + g.id + '" data-opt="' + o[0] + '">' + esc(o[1]) + "</button>"; }).join("") + "</div></div>";
  }
  function chipRow(key, label, list) {
    return '<div class="bd-group"><div class="bd-row-lbl"><span>' + esc(label) + "</span></div>" +
      '<div class="bd-chips">' + list.map(function (o) { return '<button type="button" data-single="' + key + '" data-opt="' + o[0] + '">' + esc(o[1]) + "</button>"; }).join("") + "</div></div>";
  }

  function sync() {
    var skin = SKIN.filter(function (s) { return s[0] === state.skin; })[0] || SKIN[5];
    $("bdSkinName").textContent = skin[1];
    each($("bdSkin").children, function (b) { var on = b.getAttribute("data-skin") === state.skin; b.classList.toggle("is-on", on); b.setAttribute("aria-checked", on); });
    $("bdHeight").value = state.height; $("bdHeightVal").textContent = ftIn(state.height);
    $("bdExag").value = state.exag; $("bdExagVal").textContent = exagLabel(state.exag) + " · " + state.exag;
    SHAPE.forEach(function (s) {
      $("bdS_" + s.id).value = state.shape[s.id];
      document.querySelector('[data-sv="' + s.id + '"]').textContent = state.shape[s.id] + "/10";
    });
    each(document.querySelectorAll("#bd [data-gid]"), function (b) {
      b.classList.toggle("is-on", (state.pick[b.getAttribute("data-gid")] || []).indexOf(b.getAttribute("data-opt")) >= 0);
    });
    each(document.querySelectorAll("#bd [data-single]"), function (b) {
      b.classList.toggle("is-on", state[b.getAttribute("data-single")] === b.getAttribute("data-opt"));
    });
    var noInk = (state.pick.tattoos || [])[0] === "none";
    var inkStyle = document.querySelector('.bd-group[data-g="inkstyle"]'); if (inkStyle) inkStyle.classList.toggle("is-dim", noInk);
    var holdRow = document.querySelector('[data-single="hold"]'); if (holdRow) holdRow.closest(".bd-group").classList.toggle("is-dim", state.weapon === "none");
    each(document.querySelectorAll("#bdBodyPresets [data-bp]"), function (b) {
      var p = BODY_PRESETS.filter(function (x) { return x.id === b.getAttribute("data-bp"); })[0];
      b.classList.toggle("is-on", !!p && p.exag === state.exag && SHAPE.every(function (s) { return p.v[s.id] === state.shape[s.id]; }));
    });
    each($("bdEngine").children, function (b) { b.classList.toggle("is-on", b.getAttribute("data-v") === state.engine); });
    $("bdBatch").textContent = state.batch;
    $("bdGoSub").textContent = VIEWS[state.view].label + (state.batch > 1 ? " ×" + state.batch : "");
    charFace();
    each(document.querySelectorAll('#bd [data-opt="own"]'), function (b) { b.hidden = !state.char; });
    $("bdSkinName").textContent = state.char ? "Their own" : skin[1];
    $("bdSkin").classList.toggle("is-dim", !!state.char);
    $("bdPrompt").textContent = (state.char ? "[Qwen Edit of " + (state.char.handle ? "@" + state.char.handle : state.char.name) + "'s picture]\n" : "") + buildPrompt() + (postEdit() ? "\n\nSecond pass (body only): " + postEdit() : "");
    savePrefs();
    try { window.BADDIES_STATE = snapshot(); window.dispatchEvent(new CustomEvent("baddies:change", { detail: window.BADDIES_STATE })); } catch (e) {}
  }

  // ------------------------------------------------------------ wiring
  function wire() {
    $("bdSkin").addEventListener("click", function (e) { var b = e.target.closest("[data-skin]"); if (b) { state.skin = b.getAttribute("data-skin"); sync(); } });
    $("bdHeight").addEventListener("input", function () { state.height = +this.value; sync(); });
    $("bdExag").addEventListener("input", function () { state.exag = +this.value; sync(); });
    $("bdShape").addEventListener("input", function (e) { var id = e.target.getAttribute("data-shape"); if (id) { state.shape[id] = +e.target.value; sync(); } });
    $("bdBodyPresets").addEventListener("click", function (e) {
      var b = e.target.closest("[data-bp]"); if (!b) return;
      var p = BODY_PRESETS.filter(function (x) { return x.id === b.getAttribute("data-bp"); })[0];
      state.shape = clone(p.v); state.exag = p.exag; sync();
    });
    $("bdScroll").addEventListener("click", function (e) {
      var b = e.target.closest("[data-gid]");
      if (b) {
        var gid = b.getAttribute("data-gid"), opt = b.getAttribute("data-opt"), g = groupById(gid), cur = state.pick[gid] || [];
        if (gid === "hair" || gid === "haircolor") state.hairTouched = true;
        if (g.multi) {
          var i = cur.indexOf(opt);
          if (i >= 0) cur.splice(i, 1); else { cur.push(opt); if (cur.length > g.multi) cur.shift(); }
          state.pick[gid] = cur;
        } else state.pick[gid] = [opt];
        sync(); return;
      }
      var s = e.target.closest("[data-single]");
      if (s) { state[s.getAttribute("data-single")] = s.getAttribute("data-opt"); sync(); }
    });
    $("bdExtra").addEventListener("input", sync);
    $("bdEngine").addEventListener("click", function (e) { var b = e.target.closest("[data-v]"); if (b) { state.engine = b.getAttribute("data-v"); sync(); } });
    $("bdBatchDn").addEventListener("click", function () { state.batch = Math.max(1, state.batch - 1); sync(); });
    $("bdBatchUp").addEventListener("click", function () { state.batch = Math.min(CFG.maxBatch || 4, state.batch + 1); sync(); });
    $("bdShuffle").addEventListener("click", shuffle);
    $("bdReset").addEventListener("click", function () { var e = state.engine, n = state.batch; applySettings(DEFAULTS); state.engine = e; state.batch = n; state.hairTouched = false;
      if (state.char) { state.pick.hair = ["own"]; state.pick.haircolor = ["own"]; } $("bdName").value = ""; $("bdExtra").value = ""; sync(); });
    $("bdGo").addEventListener("click", onGenerate);
    $("bdChars").addEventListener("click", function (e) {
      var b = e.target.closest("[data-char]"); if (!b) return;
      var k = b.getAttribute("data-char");
      var had = !!state.char;
      state.char = k ? state.chars.filter(function (c) { return c.key === k; })[0] || null : null;
      onCharChange(had);
      renderChars(); sync();
    });
    $("bdMore").addEventListener("click", loadMine);
    $("bdWall").addEventListener("click", function (e) {
      var t = e.target.closest(".bd-tile"); if (!t) return;
      var c = state.mine.filter(function (x) { return String(x.id) === t.getAttribute("data-id"); })[0]; if (!c) return;
      if (e.target.closest("[data-act=recreate]")) { e.stopPropagation(); recreate(c); return; }
      if (c.status === "done") openViewer(c, t.getAttribute("data-url"));
    });
    $("bdViewerX").addEventListener("click", closeViewer);
    $("bdViewer").addEventListener("click", function (e) { if (e.target === this) closeViewer(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("bdViewer").hidden) closeViewer(); });
  }

  function shuffle() {
    state.skin = pick(SKIN)[0];
    var hmin = +$("bdHeight").min, hmax = +$("bdHeight").max;
    state.height = hmin + Math.floor(Math.random() * (hmax - hmin + 1));
    var p = pick(BODY_PRESETS); state.shape = clone(p.v); state.exag = p.exag;
    LOOK.concat(GEAR, INK).forEach(function (g) {
      if (g.multi) { var o = g.opts.slice().sort(function () { return Math.random() - 0.5; }); state.pick[g.id] = o.slice(0, 1 + Math.floor(Math.random() * g.multi)).map(function (x) { return x[0]; }); }
      else state.pick[g.id] = [pick(g.opts.filter(function (o) { return o[0] !== "own"; }))[0]];
    });
    if (state.char) { state.pick.hair = ["own"]; state.pick.haircolor = ["own"]; }
    state.hairTouched = true;
    // AK-47 shows up more often
    state.weapon = Math.random() < 0.4 ? "ak47" : pick(WEAPONS.slice(1))[0];
    state.hold = pick(HOLDS)[0];
    sync();
  }

  // ------------------------------------------------------------ prompt
  function tier(v) { return v <= 2 ? 0 : v <= 4 ? 1 : v <= 6 ? 2 : v <= 8 ? 3 : 4; }
  function shapeWords(id) { var s = SHAPE.filter(function (x) { return x.id === id; })[0]; return s.words[tier(state.shape[id])]; }
  function opt(gid) { var g = groupById(gid), v = (state.pick[gid] || [])[0]; var o = g && g.opts.filter(function (x) { return x[0] === v; })[0]; return o ? o[2] : ""; }
  function opts(gid) { var g = groupById(gid); return (state.pick[gid] || []).map(function (v) { var o = g.opts.filter(function (x) { return x[0] === v; })[0]; return o ? o[2] : ""; }).filter(Boolean); }
  function fromList(list, id) { var o = list.filter(function (x) { return x[0] === id; })[0]; return o || list[0]; }

  function heightWords(h) {
    var s = ftIn(h) + " tall";
    if (h <= 44) return "a tiny adult woman with dwarfism, only " + s + ", short adult body proportions, short limbs, clearly a grown woman";
    if (h <= 54) return "very petite and short, only " + s + ", compact small frame with short legs";
    if (h <= 59) return "petite and short, about " + s + ", compact frame";
    if (h <= 64) return "about " + s + ", average-short height";
    if (h <= 68) return "about " + s + ", average height";
    if (h <= 74) return "tall, about " + s + ", long legs";
    if (h <= 79) return "very tall amazon woman, about " + s + ", towering, very long legs";
    return "a giant towering amazon woman, " + s + ", extremely tall with very long legs, towers over everything";
  }
  function exagLabel(x) { return x < 25 ? "Natural" : x < 50 ? "Curvy" : x < 70 ? "Thick" : x < 90 ? "Extra" : "Extreme"; }
  function exagWords(x) {
    if (x < 25) return "realistic, natural body proportions";
    if (x < 50) return "a curvy hourglass figure";
    if (x < 70) return "a thick, pronounced hourglass figure";
    if (x < 90) return "a heavily exaggerated hourglass figure with dramatic curves, the waist far narrower than the hips";
    return "an extremely exaggerated, stylized cartoon-like hourglass figure, impossibly tiny waist and enormous hips, glutes and thighs";
  }

  function buildPrompt() {
    var V = VIEWS[state.view];
    var skin = fromList(SKIN, state.skin)[3];
    var parts = [];
    var C = state.char;
    if (C) parts.push("Transform the person in this photo into the following character, keeping their face, facial structure and identity clearly recognizable, the same person in every view");
    parts.push(V.lead + (C ? " this same adult person, restyled as" : "") + " a stunning adult woman in her late twenties, a female soldier character called a Baddie");
    parts.push("BODY: " + exagWords(state.exag) + ", " + [shapeWords("waist"), shapeWords("hips"), shapeWords("glutes"), shapeWords("thighs"), shapeWords("bust"), shapeWords("tone")].join(", "));
    parts.push(heightWords(state.height));
    parts.push(C ? "keep their own skin tone and face, with a smooth glowing finish" : skin + " skin with a smooth glowing finish");
    var hair = opt("hair"), hc = opt("haircolor");
    if (C) {
      var hd = hairDesc();
      parts.push(hd.own ? "HAIR: keep " + hd.text + ", identical in every view"
        : "HAIR: completely replace their original hair with " + hd.text + ", the same new hairstyle and color in the front, side and back views; none of their original hairstyle or hair color anywhere, including the back of the head");
    } else parts.push((hair ? hair.replace(/hair/, (hc ? hc + " hair" : "hair")) : hc + " hair") + (hair && !/hair/.test(hair) && hc ? " in " + hc : ""));
    parts.push([opt("makeup"), opt("eyes"), opt("expr")].filter(Boolean).join(", "));
    var camo = opt("camo");
    var outfit = "wearing " + [opt("top"), opt("bottom")].filter(Boolean).join(" and ") + " in " + camo + ", a stylish streetwear outfit with a military touch";
    var gear = opts("gear"); if (gear.length) outfit += ", with " + gear.join(", ");
    if (opt("boots")) outfit += ", " + opt("boots");
    parts.push(outfit);
    var tat = opt("tattoos");
    if (tat) parts.push(tat + " in " + (opt("inkstyle") || "full color") + " style, rich saturated ink colors, no white ink");
    var jew = opts("jewelry"); if (jew.length) parts.push("accessorized with " + jew.join(", "));
    var w = fromList(WEAPONS, state.weapon);
    if (w[0] !== "none") {
      var hold = fromList(HOLDS, state.hold)[2];
      if (w[3] === "pistol" && state.hold === "sling") hold = "with it holstered on her thigh";
      if (w[3] === "pistol" && state.hold === "shoulder") hold = "aiming it with both hands at eye level in a two-handed grip";
      if (w[3] === "pistol" && state.hold === "low") hold = "holding it in both hands, pointed down at a low ready";
      parts.push("armed with " + w[2] + ", " + hold + ", an accurate, true-to-life model of the real firearm with correct details and proportions");
    }
    var extra = $("bdExtra").value.trim(); if (extra) parts.push(extra);
    parts.push(V.tail);
    parts.push(fromList(BGS, state.bg)[2]);
    parts.push(fromList(STYLES, state.style)[2]);
    return parts.join(". ").replace(/\s+/g, " ").replace(/\.\./g, ".") + ".";
  }

  // Second Qwen Edit pass: only when the curves are pushed hard (models tend to normalise them).
  function postEdit() {
    var body = bodyEdit(), fix = "";
    if (state.char && state.view === "sheet") {
      var hd = hairDesc();
      fix = "Make it the exact same person in all three views: same face, same outfit, and the hair in every view (front, side and back, including the back of the head) must be " +
        (hd.own ? "the same hairstyle and color as in the front view" : hd.text) + ". Repaint any view whose hair does not match.";
    }
    if (!fix) return body;
    if (!body) return fix + " Keep the layout, body, skin tone, tattoos, clothes, boots, weapon, pose and background exactly the same. Seamless, same art style.";
    return body.replace(/ Keep her face, hair,/, " " + fix + " Keep her face,");
  }
  function bodyEdit() {
    if (state.exag < 70) return "";
    var asks = [];
    if (state.shape.waist >= 7) asks.push("the waist much narrower and snatched");
    if (state.shape.hips >= 7) asks.push("the hips much wider");
    if (state.shape.glutes >= 7) asks.push("the glutes much bigger, rounder and lifted");
    if (state.shape.thighs >= 7) asks.push("the thighs much thicker");
    if (!asks.length) return "";
    var where = state.view === "sheet" ? "Keep the exact layout and every view. In each view, edit only the woman's body proportions: make " : "Edit only this woman's body proportions: make ";
    return where + asks.join(", ") + (state.exag >= 90 ? ", strongly exaggerated like a stylized game character" : "") +
      ". Keep her face, hair, skin tone, tattoos, clothes, boots, weapon, pose and background exactly the same. Seamless, same art style.";
  }

  // ------------------------------------------------------------ characters (trained + saved influencers)
  // Trained characters: the admin's @handles (site_settings 'influencer_handles') on the stock presets.
  // Saved influencers: the user's own rows in "influencers" (with their image job's first picture).
  // A picked character turns the render into a Qwen Edit of their picture, keeping their face.
  var IMG_INF = "img/influencer/";
  async function loadChars() {
    var list = [];
    if (client) {
      try {
        var hs = await client.from("site_settings").select("value").eq("key", "influencer_handles").maybeSingle();
        var handles = (hs.data && hs.data.value && hs.data.value.handles) || {};
        Object.keys(handles).forEach(function (id) {
          list.push({ key: "p:" + id, name: niceName(id), handle: handles[id], kind: "Trained",
            thumb: IMG_INF + "pv/" + id + "-close.jpg", url: new URL(IMG_INF + "pv/" + id + "-full.jpg", document.baseURI).href });
        });
      } catch (e) {}
      if (state.user) {
        try {
          var r = await client.from("influencers").select("id, name, handle, job_id, favorite, created_at").eq("user_id", state.user.id).order("created_at", { ascending: false }).limit(60);
          var rows = (r.data || []).filter(function (x) { return x.job_id; });
          var ids = rows.map(function (x) { return x.job_id; }), urls = {};
          if (ids.length) {
            var jr = await client.from("image_jobs").select("id, urls, status").in("id", ids);
            (jr.data || []).forEach(function (j) { if (j.urls && j.urls[0]) urls[j.id] = absUrl(j.urls[0]); });
          }
          rows.sort(function (a, b) { return (b.handle ? 2 : 0) + (b.favorite ? 1 : 0) - (a.handle ? 2 : 0) - (a.favorite ? 1 : 0); });
          rows.forEach(function (x) {
            if (!urls[x.job_id]) return;
            list.push({ key: "i:" + x.id, name: x.name || "Influencer", handle: x.handle || "", kind: "Yours", thumb: urls[x.job_id], url: urls[x.job_id] });
          });
        } catch (e) {}
      }
    }
    state.chars = list;
    if (state.char && (state.user || /^p:/.test(state.char.key)) && list.length && !list.some(function (c) { return c.key === state.char.key; })) state.char = null;
    renderChars(); sync();
  }
  function niceName(id) { return String(id).split("-").map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(" "); }
  function absUrl(u) { return /^https?:/.test(u) ? u : RENDER() + (u.charAt(0) === "/" ? "" : "/") + u; }
  function renderChars() {
    var box = $("bdChars"); if (!box) return;
    var cur = state.char ? state.char.key : "";
    var html = '<button type="button" class="bd-char' + (cur ? "" : " is-on") + '" data-char="" role="radio" aria-checked="' + !cur + '"><span class="bd-char-none">New face</span><b>None</b></button>';
    html += state.chars.map(function (c) {
      return '<button type="button" class="bd-char' + (c.key === cur ? " is-on" : "") + '" data-char="' + esc(c.key) + '" role="radio" aria-checked="' + (c.key === cur) + '" title="' + esc(c.name) + '">' +
        '<img src="' + esc(c.thumb) + '" alt="" loading="lazy" /><b>' + (c.handle ? "@" + esc(c.handle) : esc(c.name)) + '</b><small>' + esc(c.kind) + "</small></button>";
    }).join("");
    if (!state.chars.length) html += '<p class="bd-note">' + (state.user ? "No characters yet. Make one on the AI Influencer page." : '<a href="auth.html">Log in</a> to use your influencers.') + "</p>";
    box.innerHTML = html;
  }
  // Hair when a character is picked: a fresh design takes the character's own hair;
  // mid-design (hair already chosen) keeps the current hair. "Their own hair" is always selectable.
  function onCharChange(had) {
    var own = (state.pick.hair || [])[0] === "own", ownC = (state.pick.haircolor || [])[0] === "own";
    if (state.char && !had && !state.hairTouched) { state.pick.hair = ["own"]; state.pick.haircolor = ["own"]; }
    if (!state.char) {
      if (own) state.pick.hair = clone(DEFAULTS.pick.hair);
      if (ownC) state.pick.haircolor = clone(DEFAULTS.pick.haircolor);
    }
  }
  function hairDesc() {
    var h = (state.pick.hair || [])[0], c = (state.pick.haircolor || [])[0];
    var hs = opt("hair"), hc = opt("haircolor");
    if (h === "own" && c === "own") return { own: true, text: "their own original hairstyle and hair color exactly as in the photo" };
    if (h === "own") return { own: false, text: "their own original hairstyle, recolored " + hc };
    var style = hs.replace(/hair/, (c === "own" ? "hair in their own natural hair color" : hc + " hair"));
    if (!/hair/.test(hs)) style += c === "own" ? " in their own natural hair color" : " in " + hc;
    return { own: false, text: style };
  }
  function charFace() {
    var t = $("bdFaceTag"); if (!t) return;
    if (state.char) { t.hidden = false; t.innerHTML = '<img src="' + esc(state.char.thumb) + '" alt="" /><span>Face: <b>' + esc(state.char.handle ? "@" + state.char.handle : state.char.name) + "</b> (used in the AI render)</span>"; }
    else t.hidden = true;
  }
  async function charBlob(c) {
    var r = await fetch(c.url, { mode: "cors", cache: "force-cache" });
    if (!r.ok) throw new Error("Couldn't load " + (c.handle ? "@" + c.handle : c.name) + "'s picture.");
    var b = await r.blob();
    return new File([b], "face." + (/png/.test(b.type) ? "png" : "jpg"), { type: b.type || "image/jpeg" });
  }

  // ------------------------------------------------------------ generate
  async function onGenerate() {
    if (!state.user) { location.href = "auth.html"; return; }
    if (CFG.enabled === false && !isAdmin()) { hint("The Baddies Generator is switched off right now.", true); return; }
    var token = await freshToken();
    if (!token) { hint("Your session expired. Log in again to keep creating.", true); return; }
    var V = VIEWS[state.view], prompt = buildPrompt(), pe = postEdit();
    var name = $("bdName").value.trim() || autoName();
    var model = state.char ? "qwen_edit2509" : state.engine;
    var face = null;
    if (state.char) {
      try { face = await charBlob(state.char); }
      catch (e) { hint(e.message + " Pick another character or None.", true); return; }
    }
    var fd = new FormData();
    fd.append("model", model);
    fd.append("mode", face ? "edit" : "create");
    fd.append("prompt", prompt);
    fd.append("negative", NEGATIVE);
    fd.append("batch", String(state.batch));
    fd.append("width", String(V.w));
    fd.append("height", String(V.h));
    if (face) { fd.append("size", "custom"); fd.append("image", face, face.name); }
    if (model === "flux2" || model === "qwen_edit2509") { fd.append("lora", ""); fd.append("lora_strength", "1.0"); }
    if (pe) fd.append("post_edit", pe);

    var settings = snapshot();
    var card = { id: "tmp-" + Date.now(), name: name, settings: settings, view: state.view, model: model, prompt: prompt,
      created_at: new Date().toISOString(), status: "queued", pending: true, progress: 2, stage: "Sending to the GPU…", urls: [], w: V.w, h: V.h };
    state.mine.unshift(card); renderMine();
    $("bdGo").disabled = true; hint("");
    try {
      var r = await fetch(RENDER() + "/image-jobs", { method: "POST", headers: { Authorization: "Bearer " + token }, body: fd });
      var d = await r.json().catch(function () { return {}; });
      if (!r.ok) throw new Error(d.detail || ("HTTP " + r.status));
      card.job_id = d.job_id; card.stage = "Queued";
      if (client) {
        var ins = await client.from("baddies").insert({ user_id: state.user.id, name: name, settings: settings, view: state.view, model: model, prompt: prompt, job_id: d.job_id }).select("id").single();
        if (ins.data) card.id = ins.data.id;
      }
      renderMine(); poll(card, 0);
    } catch (e) {
      card.pending = false; card.status = "error";
      card.error = /Failed to fetch|NetworkError|HTTP 5/.test(e.message) ? "The GPU server isn't reachable right now. Check System Status, then try again." : e.message;
      renderMine();
    } finally { $("bdGo").disabled = false; }
  }

  function poll(card, fails) {
    setTimeout(async function () {
      if (!card.pending) return;
      try {
        var token = await freshToken();
        var r = await fetch(RENDER() + "/jobs/" + card.job_id, { headers: { Authorization: "Bearer " + token } });
        if (r.status === 404) return done(card, "error", null, "This render stopped, probably because the GPU server restarted.");
        if (!r.ok) throw new Error("HTTP " + r.status);
        var j = await r.json();
        if (j.status === "done") return done(card, "done", j.urls || []);
        if (j.status === "cancelled") return done(card, "cancelled");
        if (j.status === "error") return done(card, "error", null, j.error || "The render failed.");
        card.progress = Math.max(2, Math.min(99, j.progress || 0));
        card.stage = (j.stage || (j.status === "queued" ? "Waiting in the queue" : "Generating")) + (j.eta_seconds > 0 ? " · about " + fmtDur(j.eta_seconds) + " left" : "");
        updateTile(card); poll(card, 0);
      } catch (e) {
        if (fails + 1 >= 6) { card.stage = "Lost touch with the GPU server. It may still finish; refresh in a minute."; updateTile(card); return; }
        poll(card, fails + 1);
      }
    }, POLL_MS);
  }
  function done(card, status, urls, err) {
    card.pending = false; card.status = status;
    if (urls) card.urls = urls; if (err) card.error = err;
    if (status === "cancelled") state.mine = state.mine.filter(function (c) { return c !== card; });
    renderMine(); refreshGpu();
  }

  // ------------------------------------------------------------ my baddies
  async function loadMine() {
    if (!client || !state.user) return;
    var res = await client.from("baddies").select("id, name, settings, view, model, prompt, job_id, favorite, created_at")
      .eq("user_id", state.user.id).order("created_at", { ascending: false }).range(state.offset, state.offset + PAGE - 1);
    var rows = res.data || [], ids = rows.map(function (r) { return r.job_id; }).filter(Boolean), jobs = {};
    if (ids.length) {
      var jr = await client.from("image_jobs").select("id, status, urls, width, height, error").in("id", ids);
      (jr.data || []).forEach(function (j) { jobs[j.id] = j; });
    }
    rows.forEach(function (r) {
      var j = jobs[r.job_id] || {}, V = VIEWS[r.view] || VIEWS.full;
      r.status = j.status || "queued"; r.urls = j.urls || []; r.error = j.error;
      r.w = j.width || V.w; r.h = j.height || V.h;
      if (/^(queued|processing|running)$/.test(r.status)) { r.pending = true; r.progress = 5; r.stage = "Working…"; poll(r, 0); }
      state.mine.push(r);
    });
    state.offset += rows.length;
    $("bdMore").hidden = rows.length < PAGE;
    renderMine();
  }

  function renderMine() {
    var wall = $("bdWall"); wall.innerHTML = "";
    $("bdEmpty").hidden = !(state.user && !state.mine.length);
    state.mine.forEach(function (c) {
      if (c.status === "done" && c.urls && c.urls.length) c.urls.forEach(function (u) { wall.appendChild(tile(c, u)); });
      else wall.appendChild(tile(c, null));
    });
  }
  function tile(c, url) {
    var t = document.createElement("div");
    t.className = "bd-tile" + (c.pending ? " is-pending" : "") + (c.status === "error" ? " is-error" : "") + ((c.w || 832) > (c.h || 1216) ? " is-wide" : "");
    t.setAttribute("data-id", c.id);
    t.style.aspectRatio = (c.w || 832) + " / " + (c.h || 1216);
    if (url) {
      t.setAttribute("data-url", url);
      t.innerHTML = '<img loading="lazy" alt="' + esc(c.name || "Baddie") + '" src="' + esc(absUrl(url)) + '" onerror="this.parentNode.classList.add(\'is-missing\')" />' +
        '<div class="bd-tile-meta"><strong>' + esc(c.name || "Baddie") + "</strong><span>" + esc(when(c.created_at)) + "</span></div>" +
        '<button type="button" class="bd-tile-re" data-act="recreate">Remake</button>' +
        '<div class="bd-tile-missing">Image unavailable while the GPU machine is offline</div>';
    } else if (c.status === "error") {
      t.innerHTML = '<div class="bd-tile-body"><strong>' + esc(c.name || "Baddie") + '</strong><p>' + esc(c.error || "The render failed.") + '</p><button type="button" class="btn btn-secondary btn-sm" data-act="recreate">Load settings</button></div>';
    } else {
      t.innerHTML = '<div class="bd-tile-body"><div class="bd-spin"></div><strong>' + esc(c.name || "Baddie") + '</strong><p class="bd-stage-txt">' + esc(c.stage || "Working…") + '</p><div class="bd-bar"><i style="width:' + (c.progress || 2) + '%"></i></div></div>';
    }
    return t;
  }
  function updateTile(c) {
    var t = $("bdWall").querySelector('.bd-tile[data-id="' + c.id + '"]');
    if (!t) return renderMine();
    var s = t.querySelector(".bd-stage-txt"), b = t.querySelector(".bd-bar i");
    if (s) s.textContent = c.stage || ""; if (b) b.style.width = (c.progress || 2) + "%";
  }

  // ------------------------------------------------------------ viewer
  var vCard = null, vUrl = null;
  function openViewer(c, url) {
    vCard = c; vUrl = url;
    var abs = absUrl(url);
    $("bdViewerImg").src = abs; $("bdViewerImg").alt = c.name || "Baddie";
    $("bdViewerName").textContent = c.name || "Baddie";
    $("bdViewerWhen").textContent = when(c.created_at) + " · " + ((VIEWS[c.view] || {}).label || "") + " · " + (c.model === "flux2" ? "Best" : "Fast");
    $("bdViewerSpecs").innerHTML = specs(c.settings || {}).map(function (s) { return "<li><span>" + esc(s[0]) + "</span><b>" + esc(s[1]) + "</b></li>"; }).join("");
    var q = encodeURIComponent(abs);
    document.querySelector('[data-va="spin"]').href = "spin-360.html?image=" + q;
    document.querySelector('[data-va="motion"]').href = "motion-transfer.html?ref=" + q;
    document.querySelector('[data-va="edit"]').href = "image-studio.html?model=qwen_edit2509&ref=" + q;
    $("bdViewer").hidden = false; document.body.style.overflow = "hidden";
  }
  function closeViewer() { $("bdViewer").hidden = true; document.body.style.overflow = ""; vCard = null; }
  document.addEventListener("click", function (e) {
    var a = e.target.closest("#bdViewer [data-va]"); if (!a || !vCard) return;
    var act = a.getAttribute("data-va");
    if (act === "recreate") { var c = vCard; closeViewer(); recreate(c); }
    else if (act === "dl") downloadImg(absUrl(vUrl), vCard.name);
    else if (act === "del") delCard(vCard);
  });
  function specs(s) {
    if (!s || !s.shape) return [];
    var out = [];
    if (s.char) out.push(["Character", s.char.handle ? "@" + s.char.handle : (s.char.name || "Influencer")]);
    out.push(["Skin", s.char ? "Their own" : fromList(SKIN, s.skin)[1]], ["Height", ftIn(s.height)], ["Exaggeration", exagLabel(s.exag) + " (" + s.exag + ")"]);
    var hh = s.pick && s.pick.hair ? fromList(LOOK[0].opts, s.pick.hair[0])[1] : "", hcol = s.pick && s.pick.haircolor ? fromList(LOOK[1].opts, s.pick.haircolor[0])[1] : "";
    if (hh) out.push(["Hair", hh + (hcol && s.pick.haircolor[0] !== "own" ? " · " + hcol : "")]);
    SHAPE.forEach(function (x) { out.push([x.label, (s.shape[x.id] != null ? s.shape[x.id] : "–") + "/10"]); });
    out.push(["Weapon", fromList(WEAPONS, s.weapon)[1]]);
    return out;
  }
  async function delCard(c) {
    if (!confirm("Delete this Baddie from your list?")) return;
    if (client && realId(c.id)) await client.from("baddies").delete().eq("id", c.id);
    state.mine = state.mine.filter(function (x) { return x !== c; });
    closeViewer(); renderMine();
  }
  function recreate(c) {
    if (c.settings && c.settings.shape) applySettings(c.settings);
    $("bdName").value = c.name || "";
    sync(); $("bdScroll").scrollTop = 0;
    hint("Settings loaded. Change anything you like, then Generate.");
  }

  // ------------------------------------------------------------ settings in/out
  function snapshot() {
    return { skin: state.skin, height: state.height, exag: state.exag, shape: clone(state.shape), pick: clone(state.pick),
      weapon: state.weapon, hold: state.hold, view: state.view, style: state.style, bg: state.bg, extra: $("bdExtra") ? $("bdExtra").value.trim() : "",
      hairTouched: !!state.hairTouched,
      char: state.char ? { key: state.char.key, name: state.char.name, handle: state.char.handle, kind: state.char.kind, thumb: state.char.thumb, url: state.char.url } : null };
  }
  function applySettings(s, quiet) {
    if (!s) return;
    ["skin", "height", "exag", "weapon", "hold", "view", "style", "bg"].forEach(function (k) { if (s[k] != null) state[k] = s[k]; });
    if (!VIEWS[state.view]) state.view = "sheet";
    if (s.shape) state.shape = Object.assign(clone(DEFAULTS.shape), s.shape);
    if (s.pick) state.pick = Object.assign(clone(DEFAULTS.pick), clone(s.pick));
    if (!quiet && $("bdExtra")) $("bdExtra").value = s.extra || "";
    else if (quiet && s.extra != null) state._extra = s.extra;
    if ("char" in s) state.char = s.char || null;
    var hairDiff = (state.pick.hair || [])[0] !== DEFAULTS.pick.hair[0] || (state.pick.haircolor || [])[0] !== DEFAULTS.pick.haircolor[0];
    state.hairTouched = s.hairTouched != null ? !!s.hairTouched : (!quiet || hairDiff);
  }
  function autoName() {
    var camo = groupById("camo").opts.filter(function (o) { return o[0] === (state.pick.camo || [])[0]; })[0];
    return (camo ? camo[1].split(" ")[0] + " " : "") + "Baddie";
  }

  // ------------------------------------------------------------ user + gpu
  function setUser(u) {
    state.user = u; state.mine = []; state.offset = 0;
    $("bdSignin").hidden = !!u;
    $("bdGo").firstChild.nodeValue = u ? "Generate " : "Log in to generate ";
    renderMine();
    if (u) { loadMine(); refreshGpu(); }
    loadChars();
    syncOff();
  }
  function isAdmin() { try { return !!(window.AIRH_GPU && AIRH_GPU.state().isAdmin); } catch (e) { return false; } }
  function syncOff() {
    var off = CFG.enabled === false;
    $("bdOff").hidden = !(off && isAdmin());
    if (off && !isAdmin()) { $("bdGo").disabled = true; hint("The Baddies Generator is switched off right now.", true); }
  }
  async function refreshGpu() {
    try {
      var token = await freshToken();
      var r = await fetch(RENDER() + "/status", { headers: token ? { Authorization: "Bearer " + token } : {} });
      if (!r.ok) throw new Error();
      var d = await r.json(), waiting = (d.queue || []).length;
      if (!d.comfy_up) paintGpu("down", "GPU engine starting");
      else if (d.busy || waiting) paintGpu("busy", "GPU busy" + (waiting ? " · " + waiting + " waiting" : ""));
      else paintGpu("up", ((window.AIRH_GPU && AIRH_GPU.current().name) || "GPU") + " ready");
    } catch (e) { paintGpu("down", "GPU offline"); }
  }
  function paintGpu(kind, text) { $("bdGpuDot").className = "gpu-dot " + (kind === "up" ? "is-up" : kind === "busy" ? "is-busy" : "is-down"); $("bdGpuText").textContent = text; }

  // ------------------------------------------------------------ helpers
  async function freshToken() {
    if (!client) return null;
    var r = await client.auth.getSession(), sess = r.data.session;
    if (sess && sess.expires_at && sess.expires_at - Math.floor(Date.now() / 1000) < 120) {
      try { var rr = await client.auth.refreshSession(); if (rr.data && rr.data.session) sess = rr.data.session; } catch (e) {}
    }
    return sess ? sess.access_token : null;
  }
  function downloadImg(url, name) {
    fetch(url).then(function (r) { return r.blob(); }).then(function (b) {
      var file = new File([b], slug(name || "baddie") + ".png", { type: b.type || "image/png" });
      if (/iPad|iPhone|iPod/.test(navigator.userAgent) && navigator.canShare && navigator.canShare({ files: [file] })) return navigator.share({ files: [file] });
      var a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    }).catch(function () { window.open(url, "_blank"); });
  }
  function groupById(id) { return LOOK.concat(GEAR, INK).filter(function (g) { return g.id === id; })[0]; }
  function ftIn(i) { i = Math.round(i); return Math.floor(i / 12) + "'" + (i % 12) + '"'; }
  function hint(m, err) { var h = $("bdHint"); h.textContent = m || ""; h.classList.toggle("is-err", !!err); }
  function absUrl(u) { if (!u) return u; return /^https?:\/\//i.test(u) ? u : RENDER() + (u.charAt(0) === "/" ? "" : "/") + u; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function clampN(n, a, b) { n = Number(n); if (!isFinite(n)) n = a; return Math.max(a, Math.min(b, n)); }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function each(list, fn) { Array.prototype.forEach.call(list, fn); }
  function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "baddie"; }
  function fmtDur(s) { s = Math.round(s); return s < 60 ? s + "s" : Math.floor(s / 60) + "m " + (s % 60) + "s"; }
  function when(iso) {
    if (!iso) return ""; var d = new Date(iso), diff = (Date.now() - d) / 1000;
    if (diff < 60) return "just now"; if (diff < 3600) return Math.floor(diff / 60) + " min ago";
    if (diff < 86400) return Math.floor(diff / 3600) + " h ago"; return d.toLocaleDateString();
  }
  function realId(id) { return id && String(id).indexOf("tmp-") !== 0 ? String(id) : null; }
  function loadPrefs() { try { return JSON.parse(localStorage.getItem(PREFS) || "{}") || {}; } catch (e) { return {}; } }
  function savePrefs() { try { localStorage.setItem(PREFS, JSON.stringify({ engine: state.engine, batch: state.batch, last: snapshot() })); } catch (e) {} }

  // ------------------------------------------------------------ boot
  window.BADDIES_STYLES = STYLES;
  window.BADDIES_SET_STYLE = function (id) { if (STYLES.some(function (x) { return x[0] === id; })) { state.style = id; sync(); } };
  if (CFG.preview === false && $("bdPreview")) { $("bdPreview").remove(); $("bd").classList.add("no-preview"); }
  renderPanel();
  if (state._extra) { $("bdExtra").value = state._extra; delete state._extra; }
  state.height = clampN(state.height, +$("bdHeight").min, +$("bdHeight").max);
  wire();
  sync();
  if (client) {
    client.auth.getSession().then(function (r) { setUser(r.data.session ? r.data.session.user : null); });
    client.auth.onAuthStateChange(function (_e, sess) { var n = sess ? sess.user : null; if ((n && n.id) !== (state.user && state.user.id)) setUser(n); });
  } else setUser(null);
  if (window.AIRH_GPU) AIRH_GPU.onChange(function () { syncOff(); if (state.user) refreshGpu(); });
})();

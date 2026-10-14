// AI Resource Hub — AI Influencer builder (Higgsfield-style).
// Pick a character type + traits -> we write a detailed prompt -> the image
// job runs on your GPU (js/gpu.js) through the same render service as Image Studio
// (POST /image-jobs). Saved characters live in the Supabase "influencers"
// table (traits JSON + the image job id) so Recreate and history work.
//
// Tuned for one RTX 3090 (24 GB): "Fast" = Z-Image Turbo, "Best" = FLUX.2
// (Turbo LoRA on). A photo upload switches to Qwen Edit 2509 (Lightning,
// 4 steps) at a set output size.

(function () {
  var RENDER = function () { return window.AIRH_GPU ? window.AIRH_GPU.base() : "https://render.airesourcehub.vip"; };  // your GPU (see js/gpu.js)
  var POLL_MS = 3000;
  var PAGE = 24;
  var PREFS_KEY = "airh-influencer";
  var IMG = "img/influencer/";

  // ------------------------------------------------------------ catalog
  // Character types ("tiers"). human = the face/skin/ethnicity groups apply.
  var TIERS = [
    { id: "normal", label: "Average", human: true },
    { id: "freak", label: "Bold", human: true },
    { id: "total", label: "Extreme", human: true },
    { id: "insect", label: "Insect", animal: "praying mantis", head: "a giant green praying mantis head: triangular insect head with two huge bulging compound eyes, long thin antennae and small mandibles, smooth green exoskeleton" },
    { id: "frog", label: "Frog", animal: "frog", head: "a realistic green frog head with big round golden eyes, a wide frog mouth and smooth moist green skin" },
    { id: "cat", label: "Cat", animal: "cat", head: "a realistic cat head with fur, whiskers and pointed ears" },
    { id: "dog", label: "Dog", animal: "dog", head: "a realistic pug dog head with a wrinkled black muzzle and floppy ears" },
    { id: "rodent", label: "Rodent", animal: "capybara", head: "a realistic capybara head with coarse brown fur, small round ears and a blunt snout" },
    { id: "bird", label: "Bird", animal: "bird", head: "a realistic bird head with feathers, round eyes and a curved beak" }
  ];

  // Option flags: h = humans only, b = Bold/Extreme/animals only,
  // x = Extreme only, X = Extreme or animals, a = animals only. Third item = prompt wording.
  var GROUPS = [
    { id: "gender", label: "Gender", max: 1, options: [
      ["female", "Female", "", "woman"], ["male", "Male", "", "man"],
      ["trans_man", "Trans man", "", "transgender man"], ["trans_woman", "Trans woman", "", "transgender woman"],
      ["non_binary", "Non-binary", "", "androgynous non-binary person"]] },
    { id: "build", label: "Build", max: 1, options: [
      ["slim", "Slim", "", "slim build"], ["athletic", "Athletic", "", "athletic build"],
      ["muscular", "Muscular", "", "muscular build"], ["curvy", "Curvy", "", "curvy figure"],
      ["heavy", "Heavy", "", "heavyset build"], ["ultra", "Ultra Muscular", "", "hugely over-muscled bodybuilder physique"],
      ["centaur", "Centaur", "X", "centaur body with a horse's lower half"]] },
    { id: "hair", label: "Hairstyle", max: 1, options: [
      ["bob", "Bob", "b", "rounded lampshade bob haircut"], ["bald", "Bald", "", "completely bald head"],
      ["buzz", "Buzz cut", "", "buzz cut"], ["bowl", "Bowl cut", "", "bowl cut"], ["mullet", "Mullet", "", "mullet"],
      ["braids", "Braids", "", "braids"], ["pigtails", "Pigtails", "", "pigtails"], ["afro", "Afro", "", "big afro"],
      ["mohawk", "Mohawk", "", "mohawk"], ["waves", "Volume waves", "b", "huge voluminous pompadour waves"],
      ["beehive", "Beehive", "b", "towering beehive hairdo"], ["perm", "Perm", "b", "tight dome-shaped perm"],
      ["long", "Long hair", "", "long hair"], ["short", "Short hair", "", "short hair"],
      ["horns", "Hair horns", "b", "hair styled into two horns"], ["softserve", "Soft-serve swirl", "b", "hair piled into a soft-serve ice cream swirl"],
      ["sphere", "Curl sphere", "b", "a perfect sphere of curly hair"], ["mouse", "Mouse-ear puffs", "b", "two round hair puffs like mouse ears"],
      ["wings", "Hair wings", "b", "hair swept out sideways like wings"], ["hedgehog", "Hedgehog spikes", "b", "spiky hedgehog hair"],
      ["tufts", "Side tufts", "b", "bald on top with big side tufts"], ["stairs", "Stair steps", "b", "hair cut in stair-step layers"],
      ["shelf", "Shelf bob", "b", "flat shelf-like bob"], ["corkscrews", "Corkscrews", "b", "springy corkscrew curls"],
      ["sidecoil", "Side coil", "b", "one big coil of hair on the side"], ["mushroom", "Mushroom", "b", "mushroom-cap haircut"]] },
    { id: "haircolor", label: "Hair color", max: 1, options: [
      ["black", "Jet black", "", "jet black"], ["darkbrown", "Dark brown", "", "dark brown"], ["chestnut", "Chestnut", "", "chestnut"],
      ["ginger", "Ginger", "", "ginger"], ["red", "Red", "", "bright red"], ["blonde", "Blonde", "", "blonde"],
      ["platinum", "Platinum", "", "platinum blonde"], ["grey", "Grey", "", "grey"], ["white", "White", "", "white"],
      ["pink", "Pastel pink", "", "pastel pink"], ["lilac", "Lilac", "", "lilac"], ["blue", "Blue", "", "blue"], ["green", "Green", "", "green"]] },
    { id: "style", label: "Style", max: 1, options: [
      ["retro", "Retro", "", "a retro 70s outfit with a patterned collared shirt and flared trousers"], ["sporty", "Sporty", "", "a matching zip-up athletic tracksuit and sneakers"],
      ["y2k", "Y2K", "", "a Y2K outfit with a cropped baby tee, low-rise cargo pants and platform sneakers"], ["theatre", "Theatre", "", "a glamorous sequined theatrical stage costume"],
      ["goth", "Goth", "", "a gothic all-black outfit with a long coat and platform boots"], ["suits", "Suits", "", "a sharp tailored suit with a shirt and tie"],
      ["street", "Streetstyle", "", "a streetwear outfit with an oversized graphic hoodie, baggy jeans and chunky sneakers"], ["casual", "Casual", "", "a casual outfit of a t-shirt, jeans and sneakers"]] },
    { id: "ethnicity", label: "Ethnicity", max: 1, options: [
      ["african", "African", "h", "Black African"], ["asian", "Asian", "h", "East Asian"], ["european", "European", "h", "European"],
      ["indian", "Indian", "h", "South Asian Indian"], ["mideast", "Middle Eastern", "h", "Middle Eastern"], ["mixed", "Mixed", "h", "mixed-race Latin American"]] },
    { id: "age", label: "Age", max: 1, options: [
      ["adult", "Adult", "h", "young adult (about 25)"], ["mature", "Mature", "h", "middle-aged (about 45)"], ["senior", "Senior", "h", "elderly (about 70)"]] },
    { id: "skin", label: "Skin color", max: 1, options: [
      ["porcelain", "Porcelain", "h", "porcelain"], ["fair", "Fair", "h", "fair"], ["light", "Light", "h", "light"], ["olive", "Olive", "h", "olive"],
      ["tan", "Tan", "h", "tan"], ["brown", "Brown", "h", "brown"], ["deep", "Deep brown", "h", "deep brown"], ["ebony", "Ebony", "h", "ebony"]] },
    { id: "height", label: "Height", max: 1, options: [
      ["short", "Short", "a", "short"], ["average", "Average", "", ""], ["tall", "Tall", "", "tall"], ["vtall", "Very tall", "", "very tall"]] },
    { id: "proportions", label: "Proportions", max: 2, options: [
      ["longlimbs", "Long limbs", "", "long limbs"], ["shortlegs", "Short legs", "", "short legs"],
      ["shoulders", "Broad shoulders", "", "broad shoulders"], ["waist", "Tiny waist", "", "a very tiny waist"],
      ["egg", "Egg body", "b", "a round egg-shaped body"]] },
    { id: "head", label: "Head shape", max: 1, options: [
      ["standard", "Standard", "h", ""], ["long", "Long", "h", "long face"], ["tiny", "Tiny", "hb", "comically tiny head"],
      ["forehead", "High forehead", "hb", "very high forehead"], ["caveman", "Caveman", "hb", "heavy caveman brow"],
      ["gigachad", "Gigachad", "hb", "chiseled gigachad jawline"], ["megajaw", "Mega jaw", "hb", "enormous jaw"],
      ["round", "Round", "h", "round face"], ["square", "Square", "h", "square face"], ["heart", "Heart", "h", "heart-shaped face"]] },
    { id: "neck", label: "Neck", max: 1, options: [
      ["standard", "Standard", "h", ""], ["long", "Long", "hb", "long neck"], ["column", "Column", "hb", "thick column neck"], ["short", "Short", "h", "short neck"]] },
    { id: "eyeshape", label: "Eye shape", max: 1, options: [
      ["almond", "Almond", "h", "almond-shaped"], ["round", "Round", "h", "round"], ["monolid", "Monolid", "h", "monolid"],
      ["closeset", "Close-set", "hb", "close-set"], ["wideset", "Wide-set", "hb", "wide-set"], ["uneven", "Uneven", "hb", "uneven"],
      ["large", "Large", "h", "large"], ["huge", "Huge", "hb", "huge"], ["hooded", "Hooded", "h", "hooded"],
      ["upturned", "Upturned", "h", "upturned"], ["downturned", "Downturned", "h", "downturned"]] },
    { id: "eyecolor", label: "Eye color", max: 1, options: [
      ["black", "Black", "h", "black"], ["brown", "Brown", "h", "brown"], ["hazel", "Hazel", "h", "hazel"], ["green", "Green", "h", "green"],
      ["blue", "Blue", "h", "blue"], ["iceblue", "Ice blue", "h", "ice blue"], ["amber", "Amber", "h", "amber"], ["grey", "Grey", "h", "grey"]] },
    { id: "features", label: "Features", max: 4, options: [
      ["freckles", "Freckles", "h", "freckles"], ["dimples", "Dimples", "h", "dimples"], ["eyebags", "Heavy eye bags", "h", "heavy eye bags"],
      ["blush", "Blush", "hb", "rosy blushing cheeks"], ["cheekbones", "High cheekbones", "h", "high cheekbones"], ["fulllips", "Full lips", "h", "full lips"],
      ["thickbrows", "Thick brows", "h", "thick eyebrows"], ["mole", "Beauty mark", "h", "a beauty mark"], ["potato", "Potato nose", "hb", "a bulbous potato nose"],
      ["button", "Button nose", "hb", "a button nose"], ["pointy", "Pointy nose", "hb", "a long pointy nose"], ["tinynose", "Tiny nose", "h", "a tiny nose"],
      ["pouty", "Pouty lips", "hb", "pouty lips"], ["pursed", "Tiny pursed mouth", "hb", "a tiny pursed mouth"], ["widemouth", "Wide mouth", "h", "a wide mouth"],
      ["unibrow", "Unibrow", "hb", "a unibrow"], ["thinbrows", "Thin high brows", "hb", "thin high-arched brows"], ["brush", "Brush brows", "hb", "bushy brush brows"],
      ["jug", "Jug ears", "hb", "big jug ears"], ["unevenears", "Uneven ears", "hb", "uneven ears"], ["gap", "Gap teeth", "hb", "a gap-toothed smile"],
      ["buck", "Buck teeth", "hb", "buck teeth"], ["pointychin", "Pointy chin", "h", "a pointy chin"], ["weakchin", "Weak chin", "hb", "a weak chin"],
      ["bigforehead", "Big forehead", "hb", "a big forehead"]] },
    { id: "facialhair", label: "Facial hair", max: 1, options: [
      ["clean", "Clean", "", "clean-shaven"], ["stubble", "Stubble", "", "stubble"], ["beard", "Full beard", "", "a full beard"],
      ["goatee", "Goatee", "", "a goatee"], ["moustache", "Moustache", "", "a moustache"], ["pencil", "Pencil", "", "a pencil moustache"],
      ["pushbroom", "Push-broom", "b", "a thick push-broom moustache"], ["braided", "Braided", "b", "a braided beard"]] },
    { id: "distinctive", label: "Distinctive features", max: 2, options: [
      ["oddeyes", "Odd eyes", "", "heterochromia, two different eye colors"], ["facetattoo", "Face tattoo", "", "a face tattoo"],
      ["piercing", "Piercing", "", "a septum piercing"], ["earpiercing", "Ear piercing", "", "ear piercings"], ["slits", "Brow slits", "", "eyebrow slits"],
      ["bleached", "Bleached", "", "bleached eyebrows"], ["nobrows", "No brows", "", "no eyebrows"], ["grill", "Gold grill", "", "a gold grill on the teeth"],
      ["braces", "Braces", "", "braces on the teeth"], ["scar", "Brow scar", "", "a scar through one eyebrow"], ["gems", "Face gems", "", "small face gems"],
      ["elf", "Elf ears", "", "pointed elf ears"], ["lashes", "Big lashes", "", "big dramatic lashes"], ["tape", "Nose tape", "", "a strip of tape across the nose"]] },
    { id: "accessories", label: "Accessories", max: 3, options: [
      ["none", "None", "", ""], ["glasses", "Glasses", "", "glasses"], ["headphones", "Headphones", "", "headphones around the neck"],
      ["jewelry", "Jewelry", "", "statement jewelry"], ["hat", "Hat", "", "a hat"], ["bag", "Bag", "", "a designer bag"]] }
  ];

  var VIEWS = {
    full: { w: 832, h: 1216, lead: "Full-body fashion photo, head to toe, of", tail: "standing straight and facing the camera, whole body in frame including shoes" },
    portrait: { w: 896, h: 1152, lead: "Close-up portrait photo, head and shoulders, of", tail: "looking straight into the camera" },
    card: { w: 1344, h: 768, white: true, lead: "Two-panel photorealistic character sheet of", tail: "LEFT panel: a tight front-facing close-up portrait with the entire head and hair in frame; RIGHT panel: the exact same character full body, standing straight, arms hanging at the sides, head to toe with shoes visible; both panels front-facing with a blank deadpan expression, identical character and outfit in both panels" },
    sheet: { w: 1344, h: 768, lead: "Character turnaround reference sheet of", tail: "shown four times side by side as the exact same character: front view, three-quarter view, side profile and back view, all full body, identical outfit and features" }
  };
  var ENGINES = { zimage: "Z-Image Turbo", flux2: "FLUX.2", qwen_edit2509: "Qwen Edit 2509" };
  // Style presets for Motion (ids match the render server's studio_extras.STYLE_PRESETS).
  var STYLES = [
    ["anime", "Anime"], ["animated3d", "3D Animated"], ["clay", "Claymation"], ["comic", "Comic Ink"],
    ["watercolor", "Watercolor"], ["oil", "Oil Painting"], ["cyberpunk", "Neon City"], ["noir", "Film Noir"],
    ["retro", "70s Film"], ["sketch", "Pencil Sketch"], ["pixel", "Pixel Art"], ["statue", "Marble Statue"],
    ["plush", "Plush Toy"], ["photoreal", "Photoreal"]
  ];
  var MODE_COPY = {
    motion: { note: "Your influencer copies every move from the video, in their own setting.", hint: "The moves to copy" },
    swap: { note: "Your influencer replaces someone in the video. The scene, camera and lighting stay the same.", hint: "The video to put them into" }
  };
  var NEGATIVE = "blurry, deformed, extra limbs, extra fingers, bad anatomy, watermark, text, logo, cropped head, child, minor, nsfw";

  // Presets for the Explore wall (images rendered on the 3090, in img/influencer/).
  var PRESETS = [
    { id: "miami-mc", name: "Miami Night MC", tier: "normal", t: { gender: ["male"], build: ["athletic"], hair: ["braids"], haircolor: ["black"], style: ["street"], ethnicity: ["african"], age: ["adult"], skin: ["deep"], facialhair: ["stubble"], distinctive: ["grill"], accessories: ["jewelry"] } },
    { id: "goth-queen", name: "Goth Queen", tier: "normal", t: { gender: ["female"], build: ["slim"], hair: ["long"], haircolor: ["black"], style: ["goth"], ethnicity: ["european"], age: ["adult"], skin: ["porcelain"], eyecolor: ["iceblue"], distinctive: ["piercing", "lashes"], accessories: ["jewelry"] } },
    { id: "gym-chad", name: "Gym Gigachad", tier: "freak", t: { gender: ["male"], build: ["ultra"], hair: ["waves"], haircolor: ["blonde"], style: ["sporty"], ethnicity: ["european"], age: ["adult"], skin: ["tan"], head: ["gigachad"], height: ["vtall"], facialhair: ["clean"] } },
    { id: "y2k-star", name: "Y2K Pop Star", tier: "normal", t: { gender: ["female"], build: ["curvy"], hair: ["pigtails"], haircolor: ["pink"], style: ["y2k"], ethnicity: ["asian"], age: ["adult"], skin: ["light"], features: ["freckles", "blush"], distinctive: ["gems"], accessories: ["glasses"] } },
    { id: "boss-cat", name: "Boss Cat", tier: "cat", t: { gender: ["male"], build: ["heavy"], hair: ["mullet"], haircolor: ["ginger"], style: ["suits"], height: ["average"], accessories: ["jewelry", "hat"] } },
    { id: "retro-crooner", name: "Retro Crooner", tier: "freak", t: { gender: ["male"], build: ["slim"], hair: ["bowl"], haircolor: ["chestnut"], style: ["retro"], ethnicity: ["mideast"], age: ["mature"], skin: ["olive"], facialhair: ["pushbroom"], proportions: ["longlimbs"] } },
    { id: "frog-prof", name: "Professor Frog", tier: "frog", t: { gender: ["male"], build: ["slim"], hair: ["tufts"], haircolor: ["white"], style: ["suits"], accessories: ["glasses", "bag"] } },
    { id: "capy-skater", name: "Capybara Skater", tier: "rodent", t: { gender: ["non_binary"], build: ["athletic"], hair: ["buzz"], haircolor: ["blue"], style: ["street"], accessories: ["headphones", "hat"] } },
    { id: "salsa-diva", name: "Salsa Diva", tier: "normal", t: { gender: ["female"], build: ["curvy"], hair: ["afro"], haircolor: ["darkbrown"], style: ["theatre"], ethnicity: ["mixed"], age: ["mature"], skin: ["brown"], features: ["fulllips", "cheekbones"], accessories: ["jewelry"] } },
    { id: "extreme-mantis", name: "Mantis Model", tier: "insect", t: { gender: ["female"], build: ["slim"], hair: ["beehive"], haircolor: ["lilac"], style: ["retro"], proportions: ["longlimbs"], accessories: ["glasses"] } }
  ];

  // ------------------------------------------------------------ state
  var $ = function (id) { return document.getElementById(id); };
  var root = $("inf");
  if (!root) return;
  var hasSupabase = !!(window.supabase && typeof SUPABASE_URL !== "undefined");
  var client = hasSupabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
  var prefs = loadPrefs();
  var state = {
    user: null,
    tier: "normal",
    traits: {},          // groupId -> [optionId]
    open: { tier: true },
    view: VIEWS[prefs.view] ? prefs.view : "full",
    engine: ENGINES[prefs.engine] && prefs.engine !== "qwen_edit2509" ? prefs.engine : "zimage",
    batch: clamp(prefs.batch || 1, 1, 4),
    photo: null,         // { blob, url }
    mine: [],            // influencer rows + job data
    offset: 0,
    motionPick: null,
    viewing: null,
    m: {
      mode: prefs.mMode === "swap" ? "swap" : "motion",
      res: prefs.mRes === "480p" || prefs.mRes === "1080p" ? prefs.mRes : "720p",
      len: prefs.mLen === 10 ? 10 : 5,
      video: null,        // { blob, url, w, h, dur }
      char: null,         // { url, name, infId } or { blob, url, name }
      style: "", styleCustom: "", styleImg: null, styleTab: "presets",
      usePrompt: false
    },
    vids: [], vidOffset: 0, vViewing: null
  };

  // ------------------------------------------------------------ boot
  buildGroups();
  renderPicked();
  wire();
  renderPresets();
  renderFan();
  syncSeg("viewSeg", "data-view", state.view);
  syncSeg("engineSeg", "data-engine", state.engine);
  syncEngineNote();
  $("batchVal").textContent = state.batch;
  wireMotion();
  applyLinkParams();

  if (client) {
    client.auth.getSession().then(function (r) { setUser(r.data.session ? r.data.session.user : null); });
    client.auth.onAuthStateChange(function (_e, sess) {
      var next = sess ? sess.user : null;
      if ((next && next.id) !== (state.user && state.user.id)) setUser(next);
    });
  } else setUser(null);

  function setUser(u) {
    state.user = u;
    state.mine = []; state.offset = 0;
    $("mineSignin").hidden = !!u;
    syncGenerate(); syncMotionGo();
    state.vids = []; state.vidOffset = 0;
    if (u) { loadMine(); loadVideos(); refreshGpu(); setInterval(refreshGpu, 25000); }
    else { renderMine(); renderMotionPick(); renderVideos(); }
  }

  // ------------------------------------------------------------ panel UI
  function tierOf(id) { return TIERS.filter(function (t) { return t.id === id; })[0] || TIERS[0]; }
  function isAnimal() { return !tierOf(state.tier).human; }

  function allowed(flags) {
    var t = state.tier, human = tierOf(t).human;
    if (flags.indexOf("h") > -1 && !human) return false;
    if (flags.indexOf("a") > -1 && human) return false;
    if (flags.indexOf("x") > -1 && t !== "total") return false;
    if (flags.indexOf("X") > -1 && human && t !== "total") return false;
    if (flags.indexOf("b") > -1 && t === "normal") return false;
    return true;
  }

  function visibleOptions(g) { return g.options.filter(function (o) { return allowed(o[2]); }); }

  function buildGroups() {
    var html = '<section class="inf-group' + (state.open.tier ? " is-open" : "") + '" data-g="tier">' +
      groupHead("tier", "Character type", TIERS.length, tierOf(state.tier).label) +
      '<div class="inf-group-body"><div class="inf-types">' + TIERS.map(function (t) {
        return '<button type="button" class="inf-type' + (t.id === state.tier ? " is-on" : "") + '" data-tier="' + t.id + '" aria-pressed="' + (t.id === state.tier) + '">' +
          '<span class="inf-type-img" style="background-image:url(' + IMG + "type-" + t.id + '.jpg)"></span><span>' + t.label + "</span></button>";
      }).join("") + "</div></div></section>";
    GROUPS.forEach(function (g) {
      var opts = visibleOptions(g);
      if (!opts.length) return;
      var picked = (state.traits[g.id] || []).map(function (id) { return labelOf(g, id); }).join(", ");
      html += '<section class="inf-group' + (state.open[g.id] ? " is-open" : "") + '" data-g="' + g.id + '">' +
        groupHead(g.id, g.label, opts.length, picked, g.max) +
        '<div class="inf-group-body">' + (g.max > 1 ? '<p class="inf-max">Pick up to ' + g.max + "</p>" : "") +
        '<div class="inf-opts">' + opts.map(function (o) {
          var on = (state.traits[g.id] || []).indexOf(o[0]) > -1;
          return '<button type="button" class="inf-opt' + (on ? " is-on" : "") + '" data-g="' + g.id + '" data-o="' + o[0] + '" aria-pressed="' + on + '">' + esc(o[1]) + "</button>";
        }).join("") + "</div></div></section>";
    });
    $("groups").innerHTML = html;
  }

  function groupHead(id, label, count, picked) {
    return '<button type="button" class="inf-group-head" data-toggle="' + id + '" aria-expanded="' + !!state.open[id] + '">' +
      '<span class="inf-group-name">' + esc(label) + ' <span class="inf-dot">&middot;</span> <span class="inf-group-count">' + count + "</span></span>" +
      '<span class="inf-group-picked">' + esc(picked || "") + "</span>" +
      '<svg class="inf-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>';
  }

  function groupById(id) { return GROUPS.filter(function (g) { return g.id === id; })[0]; }
  function optOf(g, id) { return g.options.filter(function (o) { return o[0] === id; })[0]; }
  function labelOf(g, id) { var o = optOf(g, id); return o ? o[1] : id; }

  function setTier(t) {
    state.tier = t;
    // drop picks that this character type doesn't offer
    Object.keys(state.traits).forEach(function (gid) {
      var g = groupById(gid);
      state.traits[gid] = (state.traits[gid] || []).filter(function (oid) { var o = optOf(g, oid); return o && allowed(o[2]); });
      if (!state.traits[gid].length) delete state.traits[gid];
    });
    buildGroups(); renderPicked(); syncEngineNote();
  }

  function syncEngineNote() {
    var seg = $("engineSeg"); if (!seg) return;
    var animal = isAnimal();
    seg.classList.toggle("is-locked", animal);
    seg.title = animal ? "Animal-head characters always use Best (FLUX.2): it keeps the animal head on a human body." : "";
    syncSeg("engineSeg", "data-engine", animal ? "flux2" : state.engine);
  }

  function toggleOpt(gid, oid) {
    var g = groupById(gid);
    var cur = (state.traits[gid] || []).slice();
    var i = cur.indexOf(oid);
    if (i > -1) cur.splice(i, 1);
    else {
      if (gid === "accessories" && oid === "none") cur = [];
      else if (gid === "accessories") cur = cur.filter(function (x) { return x !== "none"; });
      if (g.max === 1) cur = [];
      else if (cur.length >= g.max) cur.shift();
      cur.push(oid);
    }
    if (cur.length) state.traits[gid] = cur; else delete state.traits[gid];
    var sec = $("groups").querySelector('.inf-group[data-g="' + gid + '"]');
    if (sec) {
      Array.prototype.forEach.call(sec.querySelectorAll(".inf-opt"), function (b) {
        var on = cur.indexOf(b.getAttribute("data-o")) > -1;
        b.classList.toggle("is-on", on); b.setAttribute("aria-pressed", on);
      });
      sec.querySelector(".inf-group-picked").textContent = cur.map(function (id) { return labelOf(g, id); }).join(", ");
    }
    renderPicked();
  }

  function renderPicked() {
    var chips = [];
    chips.push('<span class="inf-chip is-type">' + esc(tierOf(state.tier).label) + "</span>");
    GROUPS.forEach(function (g) {
      (state.traits[g.id] || []).forEach(function (oid) {
        chips.push('<button type="button" class="inf-chip" data-g="' + g.id + '" data-o="' + oid + '" title="Remove">' + esc(labelOf(g, oid)) + ' <span aria-hidden="true">&times;</span></button>');
      });
    });
    $("picked").innerHTML = chips.join("");
    $("pickedWrap").hidden = chips.length < 2;
  }

  function shuffle() {
    var humanBias = Math.random() < 0.7;
    var pool = humanBias ? TIERS.filter(function (t) { return t.human; }) : TIERS;
    state.tier = pick(pool).id;
    state.traits = {};
    GROUPS.forEach(function (g) {
      var opts = visibleOptions(g).filter(function (o) { return o[0] !== "none"; });
      if (!opts.length) return;
      var core = ["gender", "build", "hair", "haircolor", "style", "ethnicity", "age", "skin"].indexOf(g.id) > -1;
      if (!core && Math.random() < 0.55) return;
      var n = g.max > 1 ? 1 + Math.floor(Math.random() * Math.min(2, g.max)) : 1;
      var bag = opts.slice(), out = [];
      while (out.length < n && bag.length) out.push(bag.splice(Math.floor(Math.random() * bag.length), 1)[0][0]);
      state.traits[g.id] = out;
    });
    if (state.traits.gender && state.traits.gender[0] === "female") delete state.traits.facialhair;
    buildGroups(); renderPicked(); syncEngineNote();
    hint("Random character loaded. Tweak anything, then Generate.");
  }

  function loadRecipe(tier, traits, name) {
    state.tier = tierOf(tier).id;
    state.traits = JSON.parse(JSON.stringify(traits || {}));
    state.open = { tier: true };
    $("infName").value = name || "";
    setPane("create");
    buildGroups(); renderPicked();
    syncEngineNote();
    $("paneCreate").scrollTop = 0;
    if (window.matchMedia("(max-width: 960px)").matches) root.scrollIntoView({ behavior: "smooth" });
    hint("Settings loaded" + (name ? " from " + name : "") + ". Change anything, then Generate.");
  }

  // ------------------------------------------------------------ prompt
  function phrase(gid, oid) { var g = groupById(gid), o = g && optOf(g, oid); return o ? o[3] : ""; }
  function pickOne(gid) { var v = state.traits[gid]; return v && v.length ? phrase(gid, v[0]) : ""; }
  function pickAll(gid) { return (state.traits[gid] || []).map(function (o) { return phrase(gid, o); }).filter(Boolean); }

  function buildPrompt(view) {
    var t = tierOf(state.tier), V = VIEWS[view];
    var who = pickOne("gender") || "person";
    var parts = [];
    var subject;
    if (t.human) {
      subject = [pickOne("age"), pickOne("ethnicity"), who].filter(Boolean).join(" ");
      var vibe = t.id === "freak" ? "a bold, quirky, slightly exaggerated " : t.id === "total" ? "an extreme, surreal, heavily exaggerated caricature of a " : "a realistic ";
      subject = vibe + subject;
    } else {
      // The animal head REPLACES the human head (not an animal sitting on a person).
      subject = "a surreal photoreal hybrid character: a human " + who + "'s body from the neck down, but instead of a human head it has " + t.head +
        ", attached directly to the human neck and scaled like a human head; no human face, no human skin or human ears on the head, the " + t.animal + " head is the character's real head";
    }
    parts.push(V.lead + " " + subject + (pickOne("style") ? ", fully clothed in " + pickOne("style") : ", fully clothed in a stylish outfit"));
    var body = [pickOne("height"), pickOne("build")].filter(Boolean).join(", ");
    var prop = pickAll("proportions");
    if (body || prop.length) parts.push([body, prop.length ? "with " + prop.join(" and ") : ""].filter(Boolean).join(" "));
    if (pickOne("skin")) parts.push(pickOne("skin") + " skin tone");
    var hair = pickOne("hair"), hc = pickOne("haircolor");
    if (!t.human) {
      // hair sits ON the animal head, like a wig/hairdo
      if (hair && state.traits.hair[0] !== "bald") parts.push("hair growing from the top of the " + t.animal + " head: " + hair + (hc ? " in " + hc : ""));
      else if (hc) parts.push("tuft of " + hc + " hair on top of the " + t.animal + " head");
    }
    else if (hair) parts.push(state.traits.hair[0] === "bald" ? hair : hair + (hc ? " in " + hc : ""));
    else if (hc) parts.push(hc + " hair");
    var face = [pickOne("head"), pickOne("neck")].filter(Boolean);
    var eyes = [pickOne("eyeshape"), pickOne("eyecolor")].filter(Boolean).join(" ");
    if (eyes) face.push(eyes + " eyes");
    if (face.length) parts.push(face.join(", "));
    var shaven = (state.traits.facialhair || [])[0] === "clean";
    var feats = pickAll("features").concat(shaven ? [] : pickAll("facialhair"), pickAll("distinctive"));
    if (feats.length) parts.push((t.human ? "with " : "the " + t.animal + " face has ") + feats.join(", "));
    if (shaven) parts.push("clean-shaven");
    var acc = pickAll("accessories");
    if (acc.length) parts.push("accessorized with " + acc.join(", "));
    var extra = $("infExtra").value.trim();
    if (extra) parts.push(extra);
    parts.push(V.tail);
    var bg = V.white ? "pure white seamless studio background, bright soft even light, faint contact shadow under the feet" : "plain light grey studio backdrop, soft even studio lighting";
    parts.push(t.id === "total" ? "surreal hyper-detailed but photoreal character design, " + bg + ", sharp focus"
      : bg + ", photorealistic, natural skin texture, sharp focus, high detail, editorial fashion photography");
    return parts.join(". ").replace(/\s+/g, " ").replace(/\.\./g, ".") + ".";
  }

  function buildEditPrompt(view) {
    var p = buildPrompt(view);
    return "Transform the person in this photo into the following character, keeping their face, facial structure and identity clearly recognizable. " + p;
  }

  // ------------------------------------------------------------ generate
  function syncGenerate() {
    var b = $("generateBtn");
    b.firstChild.nodeValue = state.user ? "Generate " : "Log in to generate ";
  }

  async function onGenerate() {
    if (!state.user) { window.location.href = "auth.html"; return; }
    var token = await freshToken();
    if (!token) { hint("Your session expired. Log in again to keep creating.", true); return; }
    var view = state.view, V = VIEWS[view];
    var fromPhoto = !!state.photo;
    var model = fromPhoto ? "qwen_edit2509" : isAnimal() ? "flux2" : state.engine;
    var prompt = fromPhoto ? buildEditPrompt(view) : buildPrompt(view);
    var name = $("infName").value.trim() || autoName();

    var fd = new FormData();
    fd.append("model", model);
    fd.append("mode", fromPhoto ? "edit" : "create");
    fd.append("prompt", prompt);
    fd.append("negative", NEGATIVE);
    fd.append("batch", String(state.batch));
    fd.append("width", String(V.w));
    fd.append("height", String(V.h));
    if (fromPhoto) { fd.append("size", "custom"); fd.append("image", state.photo.blob, state.photo.blob.name || "face.png"); }
    if (model === "flux2" || model === "qwen_edit2509") { fd.append("lora", ""); fd.append("lora_strength", "1.0"); }

    var card = { id: "tmp-" + Date.now(), name: name, tier: state.tier, traits: JSON.parse(JSON.stringify(state.traits)), view: view, model: model,
      prompt: prompt, from_photo: fromPhoto, created_at: new Date().toISOString(), status: "queued", pending: true, progress: 2, stage: "Sending to the GPU…", urls: [], w: V.w, h: V.h };
    state.mine.unshift(card);
    setStage("mine");
    renderMine();
    $("generateBtn").disabled = true;
    hint("");

    try {
      var r = await fetch(RENDER() + "/image-jobs", { method: "POST", headers: { Authorization: "Bearer " + token }, body: fd });
      var d = await r.json().catch(function () { return {}; });
      if (!r.ok) throw new Error(d.detail || ("HTTP " + r.status));
      card.job_id = d.job_id;
      card.stage = "Queued";
      if (client) {
        var ins = await client.from("influencers").insert({
          user_id: state.user.id, name: name, tier: card.tier, traits: card.traits, view: view, model: model,
          prompt: prompt, job_id: d.job_id, from_photo: fromPhoto
        }).select("id").single();
        if (ins.data) card.id = ins.data.id;
      }
      updateCard(card);
      poll(card, 0);
    } catch (e) {
      card.pending = false; card.status = "error";
      card.error = /Failed to fetch|NetworkError|HTTP 5/.test(e.message) ? "The GPU server isn't reachable right now. Check System status, then try again." : e.message;
      renderMine();
    } finally {
      $("generateBtn").disabled = false;
    }
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
        updateCard(card);
        poll(card, 0);
      } catch (e) {
        if (fails + 1 >= 6) { card.stage = "Lost touch with the GPU server. It may still finish; refresh in a minute."; updateCard(card); return; }
        poll(card, fails + 1);
      }
    }, POLL_MS);
  }

  function done(card, status, urls, err) {
    card.pending = false; card.status = status;
    if (urls) card.urls = urls;
    if (err) card.error = err;
    if (status === "cancelled") state.mine = state.mine.filter(function (c) { return c !== card; });
    renderMine(); renderMotionPick(); refreshGpu();
  }

  // ------------------------------------------------------------ my influencers
  async function loadMine() {
    if (!client || !state.user) return;
    var res = await client.from("influencers").select("id, name, tier, traits, view, model, prompt, job_id, from_photo, favorite, created_at")
      .eq("user_id", state.user.id).order("created_at", { ascending: false }).range(state.offset, state.offset + PAGE - 1);
    var rows = res.data || [];
    var ids = rows.map(function (r) { return r.job_id; }).filter(Boolean);
    var jobs = {};
    if (ids.length) {
      var jr = await client.from("image_jobs").select("id, status, urls, width, height, error").in("id", ids);
      (jr.data || []).forEach(function (j) { jobs[j.id] = j; });
    }
    rows.forEach(function (r) {
      var j = jobs[r.job_id] || {};
      r.status = j.status || "queued"; r.urls = j.urls || []; r.error = j.error;
      var V = VIEWS[r.view] || VIEWS.full;
      r.w = j.width || V.w; r.h = j.height || V.h;
      if (r.status === "queued" || r.status === "processing" || r.status === "running") { r.pending = true; r.progress = 5; r.stage = "Working…"; poll(r, 0); }
      state.mine.push(r);
    });
    state.offset += rows.length;
    $("mineMore").hidden = rows.length < PAGE;
    renderMine(); renderMotionPick();
  }

  function renderMine() {
    var wall = $("mineWall");
    var list = state.mine.filter(function (c) { return c.favorite; }).concat(state.mine.filter(function (c) { return !c.favorite; }));
    $("mineCount").textContent = list.length ? String(list.length) : "";
    $("mineEmpty").hidden = !(state.user && !list.length);
    wall.innerHTML = "";
    list.forEach(function (c) {
      if (c.status === "done" && c.urls && c.urls.length) c.urls.forEach(function (u, i) { wall.appendChild(tileFor(c, u, i)); });
      else wall.appendChild(tileFor(c, null, 0));
    });
  }

  function tileFor(c, url, idx) {
    var t = document.createElement("div");
    t.className = "inf-tile" + (c.pending ? " is-pending" : "") + (c.status === "error" ? " is-error" : "");
    t.setAttribute("data-id", c.id);
    t.style.aspectRatio = (c.w || 832) + " / " + (c.h || 1216);
    if (url) {
      var img = new Image();
      img.alt = c.name || "Influencer";
      img.loading = "lazy";
      img.onload = function () { t.classList.add("is-loaded"); };
      img.onerror = function () { t.classList.add("is-missing"); };
      img.src = absUrl(url);
      t.appendChild(img);
      t.insertAdjacentHTML("beforeend", '<div class="inf-tile-shade"></div><div class="inf-tile-meta"><strong>' + esc(c.name || "Influencer") + "</strong><span>" + esc(tierOf(c.tier).label) + "</span></div>" +
        '<div class="inf-tile-acts"><button type="button" class="inf-recreate" data-act="recreate">Recreate</button></div>' +
        '<div class="inf-tile-side">' +
          '<button type="button" class="inf-icon-btn inf-fav' + (c.favorite ? " is-on" : "") + '" data-act="fav" title="Favorite" aria-label="Favorite" aria-pressed="' + !!c.favorite + '"><svg width=\"15\" height=\"15\" viewBox=\"0 0 24 24\" fill=\"currentColor\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M12 20.5s-7.5-4.6-7.5-10.1A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.8c0 5.5-7.5 10.1-7.5 10.1z\"/></svg></button>' +
          '<button type="button" class="inf-icon-btn" data-act="dl" title="Download" aria-label="Download"><svg width=\"15\" height=\"15\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M12 3v12m0 0-4-4m4 4 4-4M5 21h14\"/></svg></button>' +
        '</div>' +
        '<button type="button" class="inf-tomotion" data-act="motion"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="13" height="14" rx="2.5"/><path d="m16 10 5-3v10l-5-3"/></svg>Turn to motion</button>' +
        '<div class="inf-missing-note">Image unavailable while the GPU machine is offline</div>');
      t.tabIndex = 0;
      t.addEventListener("click", function (e) {
        if (e.target.closest("[data-act=recreate]")) { e.stopPropagation(); loadRecipe(c.tier, c.traits, c.name); return; }
        if (e.target.closest("[data-act=motion]")) { e.stopPropagation(); toMotion(c, url); return; }
        if (e.target.closest("[data-act=fav]")) { e.stopPropagation(); toggleFav(c); return; }
        if (e.target.closest("[data-act=dl]")) { e.stopPropagation(); downloadImg(absUrl(url), c.name); return; }
        openViewer(c, url);
      });
      t.addEventListener("keydown", function (e) { if (e.key === "Enter") openViewer(c, url); });
    } else if (c.pending) {
      t.innerHTML = '<div class="inf-pend"><span class="inf-spin"></span><strong>' + esc(c.name || "Your influencer") + '</strong><span class="inf-pend-stage">' + esc(c.stage || "Working…") +
        '</span><span class="inf-bar"><span style="width:' + (c.progress || 2) + '%"></span></span></div>';
    } else {
      t.innerHTML = '<div class="inf-pend"><strong>' + esc(c.name || "Influencer") + "</strong><span>" + esc(c.error || "This render didn't finish.") +
        '</span><button type="button" class="btn btn-secondary btn-small" data-act="recreate">Load settings</button></div>';
      t.querySelector("[data-act=recreate]").addEventListener("click", function () { loadRecipe(c.tier, c.traits, c.name); });
    }
    return t;
  }

  async function toggleFav(c) {
    c.favorite = !c.favorite;
    renderMine();
    if (client && realId(c.id)) {
      var r = await client.from("influencers").update({ favorite: c.favorite }).eq("id", c.id);
      if (r.error) { c.favorite = !c.favorite; renderMine(); hint("Couldn't save the favorite. Try again.", true); }
    }
  }

  async function downloadImg(src, name) {
    try {
      var blob = await (await fetch(src)).blob();
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "influencer-" + slug(name || "character") + ".png";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    } catch (e) { window.open(src, "_blank", "noopener"); }
  }

  function updateCard(c) {
    var t = $("mineWall").querySelector('.inf-tile[data-id="' + cssEsc(String(c.id)) + '"]');
    if (!t) { renderMine(); return; }
    var st = t.querySelector(".inf-pend-stage"), bar = t.querySelector(".inf-bar span");
    if (st) st.textContent = c.stage || "Working…";
    if (bar) bar.style.width = (c.progress || 2) + "%";
  }

  // ------------------------------------------------------------ presets + hero
  function renderPresets() {
    var wall = $("presetWall");
    wall.innerHTML = "";
    PRESETS.forEach(function (p) {
      var t = document.createElement("div");
      t.className = "inf-tile is-preset";
      t.style.aspectRatio = "832 / 1216";
      var img = new Image();
      img.alt = p.name; img.loading = "lazy";
      img.onload = function () { t.classList.add("is-loaded"); };
      img.onerror = function () { t.classList.add("is-missing"); };
      img.src = IMG + "preset-" + p.id + ".jpg";
      t.appendChild(img);
      t.insertAdjacentHTML("beforeend", '<div class="inf-tile-shade"></div><div class="inf-tile-meta"><strong>' + esc(p.name) + "</strong><span>" + esc(tierOf(p.tier).label) + '</span></div><div class="inf-tile-acts is-on"><button type="button" class="inf-recreate">Recreate</button></div>');
      t.addEventListener("click", function () { loadRecipe(p.tier, p.t, p.name); });
      wall.appendChild(t);
    });
  }

  function renderFan() {
    var ids = ["miami-mc", "goth-queen", "boss-cat", "y2k-star", "gym-chad"];
    $("fan").innerHTML = ids.map(function (id, i) {
      return '<span class="inf-fan-card" style="--i:' + (i - 2) + ";background-image:url(" + IMG + "preset-" + id + '.jpg)"></span>';
    }).join("");
  }

  // ------------------------------------------------------------ motion pane
  function renderMotionPick() {
    var box = $("motionPick");
    var ready = [];
    state.mine.forEach(function (c) { if (c.status === "done" && c.urls && c.urls.length) ready.push({ c: c, u: c.urls[0] }); });
    if (!ready.length) {
      box.innerHTML = '<p class="inf-note">' + (state.user ? "Create an influencer first. They show up here." : '<a href="auth.html">Log in</a> to use your influencers.') + "</p>";
      syncMotionLinks(); return;
    }
    if (!state.motionPick || !ready.some(function (r) { return r.u === state.motionPick; })) state.motionPick = ready[0].u;
    if (!state.m.char) { var first = ready.filter(function (r) { return r.u === state.motionPick; })[0] || ready[0]; setChar({ url: first.u, name: first.c.name, infId: realId(first.c.id), crop: first.c.view === "card" ? "right" : (first.c.view === "sheet" ? "left" : "") }, true); }
    box.innerHTML = ready.slice(0, 36).map(function (r) {
      var on = !!state.m.char && state.m.char.url === r.u;
      return '<button type="button" class="inf-pick-item' + (on ? " is-on" : "") + '" data-u="' + esc(r.u) + '" data-id="' + esc(r.c.id) + '" title="' + esc(r.c.name || "") + '"><img src="' + esc(absUrl(r.u)) + '" alt="' + esc(r.c.name || "Influencer") + '" loading="lazy" /></button>';
    }).join("");
    syncMotionLinks();
  }

  function syncMotionLinks() {
    Array.prototype.forEach.call(document.querySelectorAll(".inf-mtool"), function (a) {
      var base = a.getAttribute("data-tool");
      a.href = state.motionPick ? base + "?ref=" + encodeURIComponent(absUrl(state.motionPick)) : base;
      a.classList.toggle("is-off", !state.motionPick);
    });
  }

  // ------------------------------------------------------------ viewer
  function openViewer(c, url) {
    state.viewing = { c: c, url: url };
    var full = absUrl(url);
    $("viewerImg").src = full;
    $("viewerImg").alt = c.name || "Influencer";
    $("viewerBg").style.backgroundImage = "url(" + JSON.stringify(full) + ")";
    $("viewerName").textContent = c.name || "Influencer";
    $("viewerMeta").textContent = tierOf(c.tier).label + " · " + (ENGINES[c.model] || c.model || "") + (c.from_photo ? " · from your photo" : "") + " · " + when(c.created_at);
    var chips = [];
    GROUPS.forEach(function (g) { ((c.traits || {})[g.id] || []).forEach(function (o) { chips.push('<span class="inf-chip">' + esc(labelOf(g, o)) + "</span>"); }); });
    $("viewerChips").innerHTML = chips.join("");
    var ref = encodeURIComponent(full);
    $("actLip").href = "lip-sync.html?ref=" + ref;
    $("actShots").href = "image-studio.html?model=qwen_edit2509&ref=" + ref;
    $("actDownload").href = full;
    $("actDownload").setAttribute("download", "influencer-" + slug(c.name || "character") + ".png");
    $("viewer").hidden = false;
    document.body.style.overflow = "hidden";
    $("viewerClose").focus();
  }

  function closeViewer() { $("viewer").hidden = true; document.body.style.overflow = ""; state.viewing = null; }

  async function deleteViewing() {
    var v = state.viewing;
    if (!v || !client) return;
    if (!window.confirm("Delete " + (v.c.name || "this influencer") + "? This removes it from your list.")) return;
    if (String(v.c.id).indexOf("tmp-") !== 0) await client.from("influencers").delete().eq("id", v.c.id);
    state.mine = state.mine.filter(function (c) { return c !== v.c; });
    closeViewer(); renderMine(); renderMotionPick();
  }

  // ------------------------------------------------------------ wiring
  function wire() {
    $("groups").addEventListener("click", function (e) {
      var head = e.target.closest("[data-toggle]");
      if (head) {
        var id = head.getAttribute("data-toggle");
        state.open[id] = !state.open[id];
        head.parentElement.classList.toggle("is-open", state.open[id]);
        head.setAttribute("aria-expanded", state.open[id]);
        return;
      }
      var ty = e.target.closest("[data-tier]");
      if (ty) { setTier(ty.getAttribute("data-tier")); return; }
      var op = e.target.closest(".inf-opt");
      if (op) toggleOpt(op.getAttribute("data-g"), op.getAttribute("data-o"));
    });
    $("picked").addEventListener("click", function (e) {
      var c = e.target.closest(".inf-chip[data-g]");
      if (c) toggleOpt(c.getAttribute("data-g"), c.getAttribute("data-o"));
    });
    $("resetAll").addEventListener("click", function () {
      state.traits = {}; state.tier = "normal"; $("infName").value = ""; $("infExtra").value = "";
      buildGroups(); renderPicked(); hint("");
    });
    $("shuffleBtn").addEventListener("click", shuffle);
    $("generateBtn").addEventListener("click", onGenerate);
    $("batchMinus").addEventListener("click", function () { setBatch(state.batch - 1); });
    $("batchPlus").addEventListener("click", function () { setBatch(state.batch + 1); });
    segWire("viewSeg", "data-view", function (v) { state.view = v; savePrefs(); });
    segWire("engineSeg", "data-engine", function (v) { if (isAnimal()) { syncEngineNote(); hint("Animal-head characters always use Best (FLUX.2)."); return; } state.engine = v; savePrefs(); });

    Array.prototype.forEach.call(document.querySelectorAll(".inf-seg button"), function (b) {
      b.addEventListener("click", function () { setPane(b.getAttribute("data-pane")); });
    });
    Array.prototype.forEach.call(document.querySelectorAll(".inf-stage-tabs [data-stage]"), function (b) {
      b.addEventListener("click", function () { setStage(b.getAttribute("data-stage")); });
    });
    $("mineMore").addEventListener("click", loadMine);

    $("motionPick").addEventListener("click", function (e) {
      var b = e.target.closest(".inf-pick-item");
      if (!b) return;
      state.motionPick = b.getAttribute("data-u");
      var c = state.mine.filter(function (x) { return String(x.id) === b.getAttribute("data-id"); })[0];
      setChar({ url: state.motionPick, name: c ? c.name : "Influencer", infId: c ? realId(c.id) : null, crop: c && c.view === "card" ? "right" : (c && c.view === "sheet" ? "left" : "") });
      Array.prototype.forEach.call(this.querySelectorAll(".inf-pick-item"), function (x) { x.classList.toggle("is-on", x === b); });
      $("mPicker").hidden = true;
      syncMotionLinks();
    });
    Array.prototype.forEach.call(document.querySelectorAll(".inf-mtool"), function (a) {
      a.addEventListener("click", function (e) { if (a.classList.contains("is-off")) { e.preventDefault(); hint("Create an influencer first, then pick them here.", true); } });
    });

    // photo
    var input = $("photoInput"), drop = $("photoDrop");
    input.addEventListener("change", function () { if (input.files && input.files[0]) setPhoto(input.files[0]); });
    ["dragenter", "dragover"].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add("is-over"); }); });
    ["dragleave", "drop"].forEach(function (ev) { drop.addEventListener(ev, function () { drop.classList.remove("is-over"); }); });
    drop.addEventListener("drop", function (e) {
      e.preventDefault();
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) setPhoto(f);
    });
    $("photoClear").addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); clearPhoto(); });

    // viewer
    $("viewerClose").addEventListener("click", closeViewer);
    $("viewerBg").addEventListener("click", closeViewer);
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      if (!$("styleModal").hidden) closeStyle();
      else if (!$("vViewer").hidden) closeVideo();
      else if (!$("viewer").hidden) closeViewer();
    });
    $("actAnimate").addEventListener("click", function () { var v = state.viewing; closeViewer(); if (v) toMotion(v.c, v.url); });
    $("actRecreate").addEventListener("click", function () { var v = state.viewing; closeViewer(); if (v) loadRecipe(v.c.tier, v.c.traits, v.c.name); });
    $("actDelete").addEventListener("click", deleteViewing);
  }

  function setPhoto(f) {
    if (!/^image\//.test(f.type)) { hint("That file isn't an image.", true); return; }
    if (state.photo) URL.revokeObjectURL(state.photo.url);
    state.photo = { blob: f, url: URL.createObjectURL(f) };
    $("photoPreview").src = state.photo.url;
    $("photoFile").hidden = false;
    $("photoDrop").classList.add("has-file");
    $("photoInput").disabled = true;
    hint("Using your photo: the character keeps this face (Qwen Edit).");
  }

  function clearPhoto() {
    if (state.photo) URL.revokeObjectURL(state.photo.url);
    state.photo = null;
    $("photoFile").hidden = true;
    $("photoDrop").classList.remove("has-file");
    $("photoInput").disabled = false;
    $("photoInput").value = "";
    hint("");
  }

  function setPane(p) {
    Array.prototype.forEach.call(document.querySelectorAll(".inf-seg button"), function (b) {
      var on = b.getAttribute("data-pane") === p; b.classList.toggle("is-on", on); b.setAttribute("aria-selected", on);
    });
    $("paneCreate").hidden = p !== "create";
    $("paneMotion").hidden = p !== "motion";
    $("createFoot").hidden = p !== "create";
    $("motionFoot").hidden = p !== "motion";
    if (p === "motion") { renderMotionPick(); if (state.user) setStage("videos"); }
    else if (!$("stageVideos").hidden) setStage("mine");
  }

  function setStage(s) {
    Array.prototype.forEach.call(document.querySelectorAll(".inf-stage-tabs [data-stage]"), function (b) {
      var on = b.getAttribute("data-stage") === s; b.classList.toggle("is-on", on); b.setAttribute("aria-selected", on);
    });
    $("stageExplore").hidden = s !== "explore";
    $("stageMine").hidden = s !== "mine";
    $("stageVideos").hidden = s !== "videos";
    if (s === "videos") renderVideos();
  }

  function setBatch(n) { state.batch = clamp(n, 1, 4); $("batchVal").textContent = state.batch; savePrefs(); }

  function segWire(id, attr, cb) {
    Array.prototype.forEach.call($(id).querySelectorAll("button"), function (b) {
      b.addEventListener("click", function () { syncSeg(id, attr, b.getAttribute(attr)); cb(b.getAttribute(attr)); });
    });
  }
  function syncSeg(id, attr, val) {
    Array.prototype.forEach.call($(id).querySelectorAll("button"), function (b) { b.classList.toggle("is-on", b.getAttribute(attr) === val); });
  }

  function applyLinkParams() {
    var q; try { q = new URLSearchParams(location.search); } catch (e) { return; }
    var p = q.get("preset");
    if (p) { var pr = PRESETS.filter(function (x) { return x.id === p; })[0]; if (pr) loadRecipe(pr.tier, pr.t, pr.name); }
    if (q.get("tab") === "mine") setStage("mine");
    if (q.get("tab") === "videos") setStage("videos");
    if (q.get("tab") === "motion") setPane("motion");
  }

  // ------------------------------------------------------------ motion: transfer / swap / style
  function toMotion(c, url) {
    setChar({ url: url, name: c.name || "Influencer", infId: realId(c.id), crop: c.view === "card" ? "right" : (c.view === "sheet" ? "left" : "") });
    state.motionPick = url;
    setPane("motion");
    $("paneMotion").scrollTop = 0;
    if (window.matchMedia("(max-width: 960px)").matches) root.scrollIntoView({ behavior: "smooth" });
    mHint(state.m.video ? "Ready. Pick a style if you like, then Generate." : "Now add a reference video.");
  }

  function setChar(ch, quiet) {
    var old = state.m.char;
    if (old && old.blob && old.url && (!ch || ch.url !== old.url)) URL.revokeObjectURL(old.url);
    state.m.char = ch;
    var img = $("mCharImg");
    if (ch) { img.src = ch.blob ? ch.url : absUrl(ch.url); img.alt = ch.name || "Character"; }
    img.style.objectPosition = ch && ch.crop === "right" ? "85% 30%" : ch && ch.crop === "left" ? "8% 30%" : "";
    img.hidden = !ch;
    $("mCharSlot").classList.toggle("has-file", !!ch);
    $("mCharTag").hidden = !ch;
    $("mCharTag").textContent = ch ? (ch.name || "Character") : "";
    if (!quiet) syncMotionGo();
  }

  function setVideo(f) {
    if (!/^video\//.test(f.type)) { mHint("That file isn't a video.", true); return; }
    if (f.size > 300 * 1024 * 1024) { mHint("That video is over 300 MB. Trim it first.", true); return; }
    clearVideo(true);
    var url = URL.createObjectURL(f);
    var v = $("mVideoPrev");
    state.m.video = { blob: f, url: url, w: 0, h: 0, dur: 0 };
    v.onloadedmetadata = function () {
      if (!state.m.video || state.m.video.url !== url) return;
      state.m.video.w = v.videoWidth; state.m.video.h = v.videoHeight; state.m.video.dur = v.duration || 0;
      paintVideoTag();
      v.play().catch(function () {});
    };
    v.src = url; v.hidden = false;
    $("mVideoDrop").classList.add("has-file");
    $("mVideoClear").hidden = false;
    $("mVideoInput").disabled = true;
    syncMotionGo();
    mHint("");
  }

  function clearVideo(quiet) {
    var v = $("mVideoPrev");
    if (state.m.video) URL.revokeObjectURL(state.m.video.url);
    state.m.video = null;
    v.pause(); v.removeAttribute("src"); v.load(); v.hidden = true;
    $("mVideoDrop").classList.remove("has-file");
    $("mVideoClear").hidden = true; $("mVideoTag").hidden = true;
    $("mVideoInput").disabled = false; $("mVideoInput").value = "";
    if (!quiet) syncMotionGo();
  }

  function paintVideoTag() {
    var v = state.m.video, tag = $("mVideoTag");
    if (!v || !v.dur) { tag.hidden = true; return; }
    tag.textContent = fmtClock(v.dur) + (v.dur > state.m.len + 0.5 ? " · uses first " + state.m.len + " s" : "") + (v.w ? " · " + (v.h > v.w ? "vertical" : "horizontal") : "");
    tag.hidden = false;
  }

  function setMode(mode) {
    state.m.mode = mode;
    syncSeg("mModeSeg", "data-mode", mode);
    $("mModeNote").textContent = MODE_COPY[mode].note;
    $("mVideoHint").textContent = MODE_COPY[mode].hint;
    $("mTargetField").hidden = mode !== "swap";
    savePrefs(); syncMotionGo();
  }

  function syncMotionGo() {
    var b = $("mGenerateBtn"), m = state.m;
    var label = !state.user ? "Log in to generate " : m.mode === "swap" ? "Swap character " : "Generate motion ";
    b.firstChild.nodeValue = label;
    b.classList.toggle("is-dim", !!state.user && !(m.video && m.char));
  }

  function styleLabel() {
    var m = state.m;
    if (m.style === "custom") return m.styleImg ? "Custom (image)" : "Custom";
    var s = STYLES.filter(function (x) { return x[0] === m.style; })[0];
    return s ? s[1] : "Original";
  }

  function paintStyleBtn() {
    var m = state.m, th = $("mStyleThumb");
    $("mStyleName").textContent = styleLabel();
    if (m.style && m.style !== "custom") th.style.backgroundImage = "url(img/styles/" + m.style + ".jpg)";
    else if (m.style === "custom" && m.styleImg) th.style.backgroundImage = "url(" + JSON.stringify(m.styleImg.url) + ")";
    else th.style.backgroundImage = "";
    th.classList.toggle("is-custom", m.style === "custom" && !m.styleImg);
    $("mStyleBtn").classList.toggle("is-set", !!m.style);
  }

  function openStyle() {
    var m = state.m;
    $("styleGrid").innerHTML = '<button type="button" class="m-style-tile' + (!m.style ? " is-on" : "") + '" data-style=""><span class="m-style-img is-none"><span>Aa</span></span><span class="m-style-name">Original</span></button>' +
      STYLES.map(function (s) {
        return '<button type="button" class="m-style-tile' + (m.style === s[0] ? " is-on" : "") + '" data-style="' + s[0] + '"><span class="m-style-img" style="background-image:url(img/styles/' + s[0] + '.jpg)"></span><span class="m-style-name">' + esc(s[1]) + "</span></button>";
      }).join("");
    $("styleText").value = m.styleCustom || "";
    setStyleTab(m.style === "custom" ? "custom" : "presets");
    $("styleModal").hidden = false;
    document.body.style.overflow = "hidden";
  }
  function closeStyle() { $("styleModal").hidden = true; document.body.style.overflow = ""; }
  function setStyleTab(t) {
    state.m.styleTab = t;
    syncSeg("styleTabs", "data-tab", t);
    $("styleGrid").hidden = t !== "presets";
    $("styleCustom").hidden = t !== "custom";
  }
  function setStyleImg(f) {
    if (!/^image\//.test(f.type)) return;
    if (state.m.styleImg) URL.revokeObjectURL(state.m.styleImg.url);
    state.m.styleImg = { blob: f, url: URL.createObjectURL(f) };
    $("styleImgPrev").src = state.m.styleImg.url; $("styleImgPrev").hidden = false;
    $("styleImgDrop").classList.add("has-file");
  }

  async function onMotionGenerate() {
    var m = state.m;
    if (!state.user) { window.location.href = "auth.html"; return; }
    if (!m.video) { mHint("Add a reference video first.", true); return; }
    if (!m.char) { mHint("Pick the character first.", true); $("mPicker").hidden = false; renderMotionPick(); return; }
    if (m.mode === "swap" && !$("mTarget").value.trim()) { mHint("Say what to replace, e.g. person.", true); return; }
    var token = await freshToken();
    if (!token) { mHint("Your session expired. Log in again.", true); return; }
    var btn = $("mGenerateBtn");
    btn.disabled = true;
    mHint("Uploading…");
    var vid = null;
    try {
      var charBlob = m.char.blob;
      if (!charBlob) {
        var cr = await fetch(absUrl(m.char.url));
        if (!cr.ok) throw new Error("Couldn't load that character image from the GPU server.");
        charBlob = await cr.blob();
      }
      if (m.char.crop) charBlob = await cropPanel(charBlob, m.char.crop);
      var prompt = m.usePrompt ? $("mPrompt").value.trim() : "";
      var fd = new FormData();
      fd.append("image", charBlob, "character.png");
      fd.append("video", m.video.blob, m.video.blob.name || "reference.mp4");
      fd.append("mode", m.mode);
      fd.append("prompt", prompt);
      fd.append("length", String(m.len));
      fd.append("res", m.res);
      fd.append("orientation", m.video.h > m.video.w ? "portrait" : "landscape");
      fd.append("steps", "4");
      fd.append("fps", "16");
      if (m.mode === "swap") fd.append("target", $("mTarget").value.trim());
      if (m.style) {
        fd.append("style", m.style);
        if (m.style === "custom") {
          fd.append("style_custom", m.styleCustom || "");
          if (m.styleImg) fd.append("style_image", m.styleImg.blob, "style.png");
        }
      }
      if (m.char.infId) fd.append("influencer_id", m.char.infId);

      vid = { id: "tmp-" + Date.now(), mode: m.mode === "swap" ? "character_swap" : "motion_transfer", prompt: prompt, status: "queued",
        pending: true, progress: 2, stage: "Uploading to the GPU…", created_at: new Date().toISOString(),
        meta: { res: m.res, style: m.style, length_secs: m.len }, thumb: m.char.blob ? m.char.url : absUrl(m.char.url), portrait: m.video.h > m.video.w };
      state.vids.unshift(vid);
      setStage("videos");

      var r = await fetch(RENDER() + "/motion-jobs", { method: "POST", headers: { Authorization: "Bearer " + token }, body: fd });
      var d = await r.json().catch(function () { return {}; });
      if (!r.ok) throw new Error(d.detail || ("HTTP " + r.status));
      vid.id = d.job_id; vid.stage = "Queued";
      renderVideos();
      pollVideo(vid, 0);
      mHint("Sent. Your video shows up on the right when it's done.");
    } catch (e) {
      if (vid) { state.vids = state.vids.filter(function (x) { return x !== vid; }); renderVideos(); }
      mHint(/Failed to fetch|NetworkError|HTTP 5/.test(e.message) ? "The GPU server isn't reachable right now. Check System status, then try again." : e.message, true);
    } finally {
      btn.disabled = false;
    }
  }

  function pollVideo(v, fails) {
    setTimeout(async function () {
      if (!v.pending) return;
      try {
        var token = await freshToken();
        var r = await fetch(RENDER() + "/jobs/" + v.id, { headers: { Authorization: "Bearer " + token } });
        if (r.status === 404) return vidDone(v, "error", null, "This render stopped, probably because the GPU server restarted.");
        if (!r.ok) throw new Error("HTTP " + r.status);
        var j = await r.json();
        if (j.status === "done") return vidDone(v, "done", j);
        if (j.status === "cancelled") return vidDone(v, "cancelled");
        if (j.status === "error") return vidDone(v, "error", null, j.error || "The render failed.");
        v.progress = Math.max(2, Math.min(99, j.progress || 0));
        v.stage = (j.stage || (j.status === "queued" ? "Waiting in the queue" : "Rendering")) + (j.eta_seconds > 0 ? " · about " + fmtDur(j.eta_seconds) + " left" : "");
        paintVid(v);
        pollVideo(v, 0);
      } catch (e) {
        if (fails + 1 >= 8) { v.stage = "Lost touch with the GPU server. It may still finish; refresh in a minute."; paintVid(v); return; }
        pollVideo(v, fails + 1);
      }
    }, 4000);
  }

  function vidDone(v, status, j, err) {
    v.pending = false; v.status = status;
    if (j) { v.result_url = j.result_url; v.result_mov_url = j.result_mov_url; }
    if (err) v.error = err;
    if (status === "cancelled") state.vids = state.vids.filter(function (x) { return x !== v; });
    renderVideos(); refreshGpu();
  }

  async function loadVideos() {
    if (!client || !state.user) return;
    var res = await client.from("render_jobs").select("id, status, mode, prompt, progress, result_url, result_mov_url, error, created_at, influencer_id, meta")
      .eq("user_id", state.user.id).eq("render_type", "motion_transfer").order("created_at", { ascending: false })
      .range(state.vidOffset, state.vidOffset + 11);
    var rows = res.data || [];
    rows.forEach(function (r) {
      if (state.vids.some(function (x) { return x.id === r.id; })) return;
      if (r.status === "processing" || r.status === "queued") { r.pending = true; r.progress = r.progress || 5; r.stage = "Reconnecting…"; pollVideo(r, 0); }
      state.vids.push(r);
    });
    state.vidOffset += rows.length;
    $("vidMore").hidden = rows.length < 12;
    renderVideos();
  }

  function vidTitle(v) {
    var meta = v.meta || {};
    var st = meta.style ? (STYLES.filter(function (s) { return s[0] === meta.style; })[0] || [0, "Custom style"])[1] : "";
    var kind = v.mode === "character_swap" ? "Character swap" : v.mode === "upscale_1080" ? "1080p upscale" : "Motion transfer";
    return [kind, st].filter(Boolean).join(" · ");
  }

  function renderVideos() {
    var wall = $("vidWall");
    if (!wall) return;
    $("vidCount").textContent = state.vids.length ? String(state.vids.length) : "";
    $("vidEmpty").hidden = !(state.user && !state.vids.length);
    wall.innerHTML = "";
    state.vids.forEach(function (v) {
      var t = document.createElement("div");
      t.className = "inf-vtile" + (v.pending ? " is-pending" : "") + (v.status === "error" ? " is-error" : "") + (v.portrait ? " is-portrait" : "");
      t.setAttribute("data-vid", v.id);
      var meta = v.meta || {};
      var sub = [meta.res, meta.length_secs ? meta.length_secs + " s" : "", when(v.created_at)].filter(Boolean).join(" · ");
      if (v.pending) {
        t.innerHTML = (v.thumb ? '<img class="inf-vthumb" alt="" src="' + esc(v.thumb) + '" />' : "") +
          '<div class="inf-pend"><span class="inf-spin"></span><strong>' + esc(vidTitle(v)) + '</strong><span class="inf-pend-stage">' + esc(v.stage || "Working…") +
          '</span><span class="inf-bar"><span style="width:' + (v.progress || 2) + '%"></span></span>' +
          (String(v.id).indexOf("tmp-") ? '<button type="button" class="inf-vcancel">Cancel</button>' : "") + "</div>";
        var cb = t.querySelector(".inf-vcancel");
        if (cb) cb.addEventListener("click", function () { cancelVideo(v); });
      } else if (v.status === "done" && v.result_url) {
        t.innerHTML = '<video muted loop playsinline preload="metadata"></video><div class="inf-tile-shade"></div>' +
          '<span class="inf-vplay" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></span>' +
          '<div class="inf-tile-meta"><strong>' + esc(vidTitle(v)) + "</strong><span>" + esc(sub) + "</span></div>" +
          (is1080(v) ? "" : '<button type="button" class="inf-vup" data-act="up" title="Upscale to 1080p">1080p</button>') +
          '<div class="inf-missing-note">Video unavailable while the GPU machine is offline</div>';
        var vel = t.querySelector("video");
        vel.addEventListener("loadedmetadata", function () {
          if (vel.videoWidth) t.style.aspectRatio = vel.videoWidth + " / " + vel.videoHeight;
          t.classList.add("is-loaded");
        });
        vel.addEventListener("error", function () { t.classList.add("is-missing"); });
        vel.src = absUrl(v.result_url) + "#t=0.1";
        t.addEventListener("mouseenter", function () { vel.play().catch(function () {}); });
        t.addEventListener("mouseleave", function () { vel.pause(); });
        t.tabIndex = 0;
        t.addEventListener("click", function (e) {
          if (e.target.closest("[data-act=up]")) { e.stopPropagation(); upscaleVideo(v); return; }
          openVideo(v);
        });
        t.addEventListener("keydown", function (e) { if (e.key === "Enter") openVideo(v); });
      } else {
        t.innerHTML = '<div class="inf-pend"><strong>' + esc(vidTitle(v)) + '</strong><span class="inf-verr">' + esc(friendlyErr(v.error)) + '</span><button type="button" class="inf-vcancel">Remove</button></div>';
        t.querySelector(".inf-vcancel").addEventListener("click", function () { deleteVideo(v, true); });
      }
      wall.appendChild(t);
    });
  }

  function paintVid(v) {
    var t = $("vidWall").querySelector('[data-vid="' + cssEsc(String(v.id)) + '"]');
    if (!t) { renderVideos(); return; }
    var st = t.querySelector(".inf-pend-stage"), bar = t.querySelector(".inf-bar span");
    if (st) st.textContent = v.stage || "Working…";
    if (bar) bar.style.width = (v.progress || 2) + "%";
  }

  async function cancelVideo(v) {
    v.stage = "Cancelling…"; paintVid(v);
    try { var token = await freshToken(); await fetch(RENDER() + "/jobs/" + v.id + "/cancel", { method: "POST", headers: { Authorization: "Bearer " + token } }); } catch (e) {}
  }

  function openVideo(v) {
    state.vViewing = v;
    var src = absUrl(v.result_url);
    $("vViewerVid").src = src;
    $("vViewerTitle").textContent = vidTitle(v);
    var meta = v.meta || {};
    $("vViewerMeta").textContent = [meta.res, meta.length_secs ? meta.length_secs + " s" : "", when(v.created_at)].filter(Boolean).join(" · ");
    $("vViewerPrompt").textContent = v.prompt || "";
    $("vDl").href = src; $("vDl").setAttribute("download", "motion-" + String(v.id).slice(0, 8) + ".mp4");
    $("vDlMov").hidden = !v.result_mov_url;
    if (v.result_mov_url) { $("vDlMov").href = absUrl(v.result_mov_url); $("vDlMov").setAttribute("download", "motion-" + String(v.id).slice(0, 8) + ".mov"); }
    $("vUp").hidden = is1080(v);
    $("vViewer").hidden = false;
    document.body.style.overflow = "hidden";
    $("vViewerVid").play().catch(function () {});
  }
  function is1080(v) { return v.mode === "upscale_1080" || ((v.meta || {}).res === "1080p"); }

  async function upscaleVideo(v) {
    if (!v || !state.user) return;
    var token = await freshToken();
    if (!token) { mHint("Your session expired. Log in again.", true); return; }
    var meta = v.meta || {};
    var nv = { id: "tmp-" + Date.now(), mode: "upscale_1080", prompt: v.prompt || "", status: "queued", pending: true, progress: 2,
      stage: "Sending to the upscaler…", created_at: new Date().toISOString(), meta: { res: "1080p", style: meta.style, length_secs: meta.length_secs } };
    state.vids.unshift(nv);
    if (state.vViewing) closeVideo();
    setStage("videos");
    try {
      var fd = new FormData(); fd.append("source", String(v.id));
      var r = await fetch(RENDER() + "/video-upscale-jobs", { method: "POST", headers: { Authorization: "Bearer " + token }, body: fd });
      var d = await r.json().catch(function () { return {}; });
      if (!r.ok) throw new Error(d.detail || ("HTTP " + r.status));
      nv.id = d.job_id; nv.stage = "Queued";
      renderVideos(); pollVideo(nv, 0);
    } catch (e) {
      state.vids = state.vids.filter(function (x) { return x !== nv; });
      renderVideos();
      mHint(/Failed to fetch|NetworkError|HTTP 5/.test(e.message) ? "The GPU server isn't reachable right now." : e.message, true);
    }
  }

  function closeVideo() { var vv = $("vViewerVid"); vv.pause(); vv.removeAttribute("src"); vv.load(); $("vViewer").hidden = true; document.body.style.overflow = ""; state.vViewing = null; }

  async function deleteVideo(v, quiet) {
    if (!v) return;
    if (!quiet && !window.confirm("Delete this video? It is removed from the GPU and your list.")) return;
    try {
      var token = await freshToken();
      if (String(v.id).indexOf("tmp-")) await fetch(RENDER() + "/jobs/" + v.id + "?table=render_jobs", { method: "DELETE", headers: { Authorization: "Bearer " + token } });
    } catch (e) {}
    state.vids = state.vids.filter(function (x) { return x !== v; });
    if (state.vViewing === v) closeVideo();
    renderVideos();
  }

  function wireMotion() {
    segWire("mModeSeg", "data-mode", setMode);
    segWire("mLenSeg", "data-len", function (v) { state.m.len = Number(v); savePrefs(); paintVideoTag(); });
    segWire("mResSeg", "data-res", function (v) { state.m.res = v; savePrefs(); });
    syncSeg("mLenSeg", "data-len", String(state.m.len));
    syncSeg("mResSeg", "data-res", state.m.res);
    setMode(state.m.mode);

    var vin = $("mVideoInput"), vdrop = $("mVideoDrop");
    vin.addEventListener("change", function () { if (vin.files && vin.files[0]) setVideo(vin.files[0]); });
    ["dragenter", "dragover"].forEach(function (ev) { vdrop.addEventListener(ev, function (e) { e.preventDefault(); vdrop.classList.add("is-over"); }); });
    ["dragleave", "drop"].forEach(function (ev) { vdrop.addEventListener(ev, function () { vdrop.classList.remove("is-over"); }); });
    vdrop.addEventListener("drop", function (e) { e.preventDefault(); var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) setVideo(f); });
    $("mVideoClear").addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); clearVideo(); });

    $("mCharSlot").addEventListener("click", function () { $("mPicker").hidden = !$("mPicker").hidden; renderMotionPick(); });
    $("mCharInput").addEventListener("change", function () {
      var f = this.files && this.files[0];
      if (!f || !/^image\//.test(f.type)) return;
      setChar({ blob: f, url: URL.createObjectURL(f), name: "Your photo", infId: null });
      Array.prototype.forEach.call(document.querySelectorAll("#motionPick .inf-pick-item"), function (x) { x.classList.remove("is-on"); });
      $("mPicker").hidden = true;
      this.value = "";
    });

    $("mStyleBtn").addEventListener("click", openStyle);
    Array.prototype.forEach.call(document.querySelectorAll("#styleModal [data-close]"), function (b) { b.addEventListener("click", closeStyle); });
    segWire("styleTabs", "data-tab", setStyleTab);
    $("styleGrid").addEventListener("click", function (e) {
      var b = e.target.closest("[data-style]");
      if (!b) return;
      state.m.style = b.getAttribute("data-style");
      paintStyleBtn(); closeStyle();
    });
    $("styleImgInput").addEventListener("change", function () { if (this.files && this.files[0]) setStyleImg(this.files[0]); });
    $("styleApply").addEventListener("click", function () {
      var txt = $("styleText").value.trim();
      if (!txt && !state.m.styleImg) { $("styleText").focus(); return; }
      state.m.style = "custom"; state.m.styleCustom = txt;
      paintStyleBtn(); closeStyle();
    });

    $("mPromptToggle").addEventListener("click", function () {
      state.m.usePrompt = !state.m.usePrompt;
      this.setAttribute("aria-checked", state.m.usePrompt);
      this.classList.toggle("is-on", state.m.usePrompt);
      $("mPrompt").hidden = !state.m.usePrompt;
      if (state.m.usePrompt) $("mPrompt").focus();
    });

    $("mGenerateBtn").addEventListener("click", onMotionGenerate);
    $("vidMore").addEventListener("click", loadVideos);
    Array.prototype.forEach.call(document.querySelectorAll("#vViewer [data-vclose]"), function (b) { b.addEventListener("click", closeVideo); });
    $("vDelete").addEventListener("click", function () { deleteVideo(state.vViewing); });
    $("vUp").addEventListener("click", function () { upscaleVideo(state.vViewing); });
    paintStyleBtn();
    syncMotionGo();
  }

  function friendlyErr(e) {
    e = String(e || "");
    if (!e) return "This video didn't finish.";
    if (/8188|actively refused|Failed to establish|Max retries/i.test(e)) return "ComfyUI wasn't running on the GPU machine when this started.";
    if (/out of memory|OOM/i.test(e)) return "The GPU ran out of memory. Try 480p or 5 s.";
    if (/Cancelled/i.test(e)) return "Cancelled.";
    return e.length > 140 ? e.slice(0, 140) + "…" : e;
  }

  // Character sheets hold more than one view; motion needs a single full-body shot.
  // card (2 panels): right half = full body. turnaround (4 views): first quarter = front view.
  async function cropPanel(blob, side) {
    try {
      var bmp = await createImageBitmap(blob);
      var w = side === "right" ? Math.round(bmp.width / 2) : Math.round(bmp.width / 4);
      var x = side === "right" ? bmp.width - w : 0;
      var cv = document.createElement("canvas"); cv.width = w; cv.height = bmp.height;
      cv.getContext("2d").drawImage(bmp, x, 0, w, bmp.height, 0, 0, w, bmp.height);
      return await new Promise(function (res) { cv.toBlob(function (b) { res(b || blob); }, "image/png"); });
    } catch (e) { return blob; }
  }

  function mHint(msg, err) { var h = $("mHint"); h.textContent = msg || ""; h.classList.toggle("is-err", !!err); }
  function fmtClock(s) { s = Math.round(s); return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2); }

  // ------------------------------------------------------------ GPU line
  async function refreshGpu() {
    if (!state.user) return;
    try {
      var token = await freshToken();
      var r = await fetch(RENDER() + "/status", { headers: { Authorization: "Bearer " + token } });
      if (!r.ok) throw new Error();
      var d = await r.json();
      var waiting = (d.queue || []).length;
      if (!d.comfy_up) paintGpu("down", "GPU engine starting");
      else if (d.busy || waiting) paintGpu("busy", "GPU busy" + (waiting ? " · " + waiting + " waiting" : ""));
      else paintGpu("up", ((window.AIRH_GPU && AIRH_GPU.current().name) || "GPU") + " ready");
    } catch (e) { paintGpu("down", "GPU offline"); }
  }
  function paintGpu(kind, text) {
    $("gpuDot").className = "gpu-dot " + (kind === "up" ? "is-up" : kind === "busy" ? "is-busy" : "is-down");
    $("gpuText").textContent = text;
  }

  // ------------------------------------------------------------ helpers
  async function freshToken() {
    if (!client) return null;
    var r = await client.auth.getSession();
    var sess = r.data.session;
    if (sess && sess.expires_at && sess.expires_at - Math.floor(Date.now() / 1000) < 120) {
      try { var rr = await client.auth.refreshSession(); if (rr.data && rr.data.session) sess = rr.data.session; } catch (e) {}
    }
    return sess ? sess.access_token : null;
  }
  function autoName() {
    var t = tierOf(state.tier), g = state.traits.gender && labelOf(groupById("gender"), state.traits.gender[0]);
    var s = state.traits.style && labelOf(groupById("style"), state.traits.style[0]);
    return [s, t.human ? (g || "Influencer") : t.label].filter(Boolean).join(" ");
  }
  function hint(msg, err) { var h = $("hint"); h.textContent = msg || ""; h.classList.toggle("is-err", !!err); }
  function absUrl(u) { if (!u) return u; return /^https?:\/\//i.test(u) ? u : RENDER() + (u.charAt(0) === "/" ? "" : "/") + u; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function cssEsc(s) { return window.CSS && CSS.escape ? CSS.escape(s) : s.replace(/"/g, '\\"'); }
  function clamp(n, a, b) { n = Number(n) || a; return Math.max(a, Math.min(b, n)); }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "character"; }
  function fmtDur(s) { s = Math.round(s); return s < 60 ? s + "s" : Math.floor(s / 60) + "m " + (s % 60) + "s"; }
  function when(iso) {
    if (!iso) return "";
    var d = new Date(iso), diff = (Date.now() - d) / 1000;
    if (diff < 60) return "just now";
    if (diff < 3600) return Math.floor(diff / 60) + " min ago";
    if (diff < 86400) return Math.floor(diff / 3600) + " h ago";
    return d.toLocaleDateString();
  }
  function loadPrefs() { try { return JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") || {}; } catch (e) { return {}; } }
  function savePrefs() { try { localStorage.setItem(PREFS_KEY, JSON.stringify({ view: state.view, engine: state.engine, batch: state.batch, mMode: state.m.mode, mRes: state.m.res, mLen: state.m.len })); } catch (e) {} }
  function realId(id) { return id && String(id).indexOf("tmp-") !== 0 ? String(id) : null; }
})();

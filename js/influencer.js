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
    { id: "gender", label: "Gender", max: 1, visual: true, options: [
      ["female", "Female", "", "woman"], ["male", "Male", "", "man"],
      ["trans_man", "Trans man", "", "transgender man"], ["trans_woman", "Trans woman", "", "transgender woman"],
      ["non_binary", "Non-binary", "", "androgynous non-binary person"]] },
    { id: "build", label: "Body", max: 1, visual: true, options: [
      ["skinny", "Stick thin", "b", "skeletally thin stick-figure body, collarbones and ribs showing"], ["slim", "Slim", "", "slim build"],
      ["athletic", "Athletic", "", "athletic build"], ["muscular", "Muscular", "", "muscular build"], ["curvy", "Curvy", "", "curvy figure"],
      ["heavy", "Heavy", "", "heavyset build"], ["obese", "Obese", "b", "absurdly, enormously obese torso with a gigantic round bare belly hanging down far over the waistband"],
      ["ultra", "Ultra Muscular", "", "hugely over-muscled bodybuilder physique"],
      ["centaur", "Centaur", "X", "centaur body with a horse's lower half"]] },
    { id: "arms", label: "Arms", max: 1, visual: true, options: [
      ["stick", "Stick arms", "b", "bizarrely thin stick arms, unnaturally long and skinny, with smooth natural skin"], ["regular", "Regular", "", "normal arms"],
      ["toned", "Toned", "", "toned arms"], ["heavy", "Heavy", "", "huge soft heavy fat arms"], ["huge", "Huge", "b", "huge bulging muscular arms"]] },
    { id: "legs", label: "Legs", max: 1, visual: true, options: [
      ["stick", "Stick legs", "b", "bizarrely thin stick legs from hip to ankle, unnaturally skinny, with smooth natural skin and normal-size sneakers"],
      ["stilts", "Long stilts", "b", "impossibly long, stilt-like skinny legs far longer than normal, with smooth natural skin"],
      ["regular", "Regular", "", "normal legs"], ["thick", "Thick", "", "thick heavy legs"], ["muscular", "Muscular", "", "muscular legs"]] },
    { id: "headsize", label: "Head size", max: 1, visual: true, options: [
      ["tiny", "Tiny (shrunken)", "b", ""], ["regular", "Regular", "", "a normal-sized head"],
      ["big", "Big", "b", "an unnaturally oversized head, about one and a half times normal size, on a small body"], ["huge", "Bobblehead", "b", "a gigantic bobblehead head, twice normal size, on a small body"]] },
    { id: "hair", label: "Hairstyle", max: 1, visual: true, options: [
      ["freeform", "Freeform twists", "", "big messy freeform twisted dreads standing up and out like an afro"],
      ["spiderlocs", "Spider locs", "", "very thick twisted dreadlocks gathered into about eight stiff rope-like locs that stick straight out and up from the head in every direction like spider legs or antennae, each lock as thick as a thumb"],
      ["shortdreads", "Short dreads", "", "short dreadlocks"], ["meddreads", "Medium dreads", "", "medium-length dreadlocks"],
      ["longdreads", "Long dreads", "", "long dreadlocks hanging past the shoulders"],
      ["dyedtips", "Dyed-tip dreads", "", "shoulder-length dreadlocks with blonde dyed tips falling over the face"],
      ["colorlocs", "Color locs", "b", "short twisted locs dyed in bright mixed colors"],
      ["twists", "Two-strand twists", "", "short two-strand twists"], ["cornrows", "Cornrows", "", "neat straight-back cornrows"],
      ["waves", "360 waves", "", "short brushed 360 waves haircut"],
      ["mushfade", "Mushroom fade", "b", "an enormous thick mushroom-shaped bowl cut sitting on top of a high skin fade"],
      ["bob", "Bob", "b", "rounded lampshade bob haircut"], ["bald", "Bald", "", "completely bald head"],
      ["buzz", "Buzz cut", "", "buzz cut"], ["bowl", "Bowl cut", "", "bowl cut"], ["mullet", "Mullet", "", "mullet"],
      ["braids", "Braids", "", "braids"], ["pigtails", "Pigtails", "", "pigtails"], ["afro", "Afro", "", "big afro"],
      ["mohawk", "Mohawk", "", "mohawk"], ["pompadour", "Volume waves", "b", "huge voluminous pompadour waves"],
      ["beehive", "Beehive", "b", "towering beehive hairdo"], ["perm", "Perm", "b", "tight dome-shaped perm"],
      ["long", "Long hair", "", "long hair"], ["short", "Short hair", "", "short hair"],
      ["horns", "Hair horns", "b", "hair styled into two horns"], ["softserve", "Soft-serve swirl", "b", "hair piled into a soft-serve ice cream swirl"],
      ["sphere", "Curl sphere", "b", "a perfect sphere of curly hair"], ["mouse", "Mouse-ear puffs", "b", "two round hair puffs like mouse ears"],
      ["wings", "Hair wings", "b", "hair swept out sideways like wings"], ["hedgehog", "Hedgehog spikes", "b", "spiky hedgehog hair"],
      ["tufts", "Side tufts", "b", "bald on top with big side tufts"], ["stairs", "Stair steps", "b", "hair cut in stair-step layers"],
      ["shelf", "Shelf bob", "b", "flat shelf-like bob"], ["corkscrews", "Corkscrews", "b", "springy corkscrew curls"],
      ["sidecoil", "Side coil", "b", "one big coil of hair on the side"], ["mushroom", "Mushroom", "b", "mushroom-cap haircut"], ["lampshade", "Lampshade bob", "b", "a stiff lampshade-shaped bob with a blunt fringe, flaring out at the bottom"], ["flattop", "Box flat-top", "b", "a tall, perfectly flat box-shaped flat-top haircut"], ["crescent", "Crescent", "b", "hair lacquered into one giant crescent-moon arch curving high over the head from ear to ear"], ["fingerwave", "Finger waves", "", "a sleek finger-wave bob glued flat to the head"], ["checker", "Checkerboard", "b", "a flat-top haircut dyed in a precise checkerboard of black and bleached-white squares"]] },
    { id: "haircolor", label: "Hair color", max: 1, visual: true, options: [
      ["black", "Jet black", "", "jet black"], ["darkbrown", "Dark brown", "", "dark brown"], ["chestnut", "Chestnut", "", "chestnut"],
      ["ginger", "Ginger", "", "ginger"], ["red", "Red", "", "bright red"], ["blonde", "Blonde", "", "blonde"],
      ["platinum", "Platinum", "", "platinum blonde"], ["grey", "Grey", "", "grey"], ["white", "White", "", "white"],
      ["pink", "Pastel pink", "", "pastel pink"], ["lilac", "Lilac", "", "lilac"], ["blue", "Blue", "", "blue"], ["green", "Green", "", "green"]] },
    { id: "style", label: "Style", max: 1, visual: true, options: [
      ["retro", "Retro", "", "a retro 70s outfit with a patterned collared shirt and flared trousers"], ["sporty", "Sporty", "", "a matching zip-up athletic tracksuit and sneakers"],
      ["y2k", "Y2K", "", "a Y2K outfit with a cropped baby tee, low-rise cargo pants and platform sneakers"], ["theatre", "Theatre", "", "a glamorous sequined theatrical stage costume"],
      ["goth", "Goth", "", "a gothic all-black outfit with a long coat and platform boots"], ["suits", "Suits", "", "a sharp tailored suit with a shirt and tie"],
      ["street", "Streetstyle", "", "a streetwear outfit with an oversized graphic hoodie, baggy jeans and chunky sneakers"], ["casual", "Casual", "", "a casual outfit of a t-shirt, jeans and sneakers"]] },
    { id: "ethnicity", label: "Ethnicity", max: 1, visual: true, options: [
      ["african", "African", "h", "Black African"], ["asian", "Asian", "h", "East Asian"], ["european", "European", "h", "European"],
      ["indian", "Indian", "h", "South Asian Indian"], ["mideast", "Middle Eastern", "h", "Middle Eastern"], ["mixed", "Mixed", "h", "mixed-race Latin American"]] },
    { id: "age", label: "Age", max: 1, visual: true, options: [
      ["adult", "Adult", "h", "young adult (about 25)"], ["mature", "Mature", "h", "middle-aged (about 45)"], ["senior", "Senior", "h", "elderly (about 70)"]] },
    { id: "skin", label: "Skin color", max: 1, visual: true, options: [
      ["porcelain", "Porcelain", "h", "porcelain"], ["fair", "Fair", "h", "fair"], ["light", "Light", "h", "light"], ["olive", "Olive", "h", "olive"],
      ["tan", "Tan", "h", "tan"], ["brown", "Brown", "h", "brown"], ["deep", "Deep brown", "h", "deep brown"], ["ebony", "Ebony", "h", "ebony"]] },
    { id: "height", label: "Height", max: 1, visual: true, options: [
      ["short", "Short", "a", "short"], ["average", "Average", "", ""], ["tall", "Tall", "", "tall"], ["vtall", "Very tall", "", "very tall"]] },
    { id: "proportions", label: "Proportions", max: 2, visual: true, options: [
      ["longlimbs", "Long limbs", "", "long limbs"], ["shortlegs", "Short legs", "", "short legs"],
      ["shoulders", "Broad shoulders", "", "broad shoulders"], ["waist", "Tiny waist", "", "a very tiny waist"],
      ["egg", "Egg body", "b", "a round egg-shaped body"]] },
    { id: "head", label: "Head shape", max: 1, visual: true, options: [
      ["standard", "Standard", "h", ""], ["long", "Long", "h", "long face"], ["tiny", "Tiny", "hb", "comically tiny head"],
      ["forehead", "High forehead", "hb", "very high forehead"], ["caveman", "Caveman", "hb", "heavy caveman brow"],
      ["gigachad", "Gigachad", "hb", "chiseled gigachad jawline"], ["megajaw", "Mega jaw", "hb", "enormous jaw"],
      ["round", "Round", "h", "round face"], ["square", "Square", "h", "square face"], ["heart", "Heart", "h", "heart-shaped face"], ["dome", "Cone dome", "hb", "a classic Conehead skull: the whole bald head elongated straight upward into one tall smooth cone, as wide as the face above the ears and tapering to a softly rounded tip, as tall as the face again, in exactly the same skin tone as the face with no seam"], ["herojaw", "Hero jaw", "hb", "a cartoonish oversized hero jaw with a deep cleft chin"]] },
    { id: "neck", label: "Neck", max: 1, visual: true, options: [
      ["standard", "Standard", "h", "a normal neck"], ["thin", "Pencil neck", "hb", "a very thin pencil neck"], ["long", "Long", "hb", "a long neck"], ["column", "Column", "hb", "a thick column neck"], ["short", "Short", "h", "a short neck"], ["giraffe", "Giraffe", "hb", "an absurdly long, thin human neck, three times normal length, with normal smooth skin"]] },
    { id: "eyeshape", label: "Eye shape", max: 1, visual: true, options: [
      ["almond", "Almond", "h", "almond-shaped"], ["round", "Round", "h", "round"], ["monolid", "Monolid", "h", "monolid"],
      ["closeset", "Close-set", "hb", "close-set"], ["wideset", "Wide-set", "hb", "wide-set"], ["uneven", "Uneven", "hb", "uneven"],
      ["large", "Large", "h", "large"], ["huge", "Huge", "hb", "huge"], ["hooded", "Hooded", "h", "hooded"],
      ["upturned", "Upturned", "h", "upturned"], ["downturned", "Downturned", "h", "downturned"]] },
    { id: "eyecolor", label: "Eye color", max: 1, visual: true, options: [
      ["black", "Black", "h", "black"], ["brown", "Brown", "h", "brown"], ["hazel", "Hazel", "h", "hazel"], ["green", "Green", "h", "green"],
      ["blue", "Blue", "h", "blue"], ["iceblue", "Ice blue", "h", "ice blue"], ["amber", "Amber", "h", "amber"], ["grey", "Grey", "h", "grey"]] },
    { id: "features", label: "Features", max: 4, visual: true, options: [
      ["freckles", "Freckles", "h", "freckles"], ["dimples", "Dimples", "h", "dimples"], ["eyebags", "Heavy eye bags", "h", "heavy eye bags"],
      ["blush", "Blush", "hb", "rosy blushing cheeks"], ["cheekbones", "High cheekbones", "h", "high cheekbones"], ["fulllips", "Full lips", "h", "full lips"],
      ["thickbrows", "Thick brows", "h", "thick eyebrows"], ["mole", "Beauty mark", "h", "a beauty mark"], ["potato", "Potato nose", "hb", "a big, round, bulbous fleshy nose"],
      ["button", "Button nose", "hb", "a button nose"], ["pointy", "Pointy nose", "hb", "a long pointy nose"], ["tinynose", "Tiny nose", "h", "a tiny nose"],
      ["pouty", "Pouty lips", "hb", "pouty lips"], ["pursed", "Tiny pursed mouth", "hb", "a tiny pursed mouth"], ["widemouth", "Wide mouth", "h", "a wide mouth"],
      ["unibrow", "Unibrow", "hb", "a unibrow"], ["thinbrows", "Thin high brows", "hb", "thin high-arched brows"], ["brush", "Brush brows", "hb", "bushy brush brows"],
      ["jug", "Jug ears", "hb", "big jug ears"], ["unevenears", "Uneven ears", "hb", "uneven ears"], ["gap", "Gap teeth", "hb", "a gap-toothed smile"],
      ["buck", "Buck teeth", "hb", "buck teeth"], ["pointychin", "Pointy chin", "h", "a pointy chin"], ["weakchin", "Weak chin", "hb", "a weak chin"],
      ["bigforehead", "Big forehead", "hb", "a big forehead"]] },
    { id: "facialhair", label: "Facial hair", max: 1, visual: true, options: [
      ["clean", "Clean", "", "clean-shaven"], ["stubble", "Stubble", "", "stubble"], ["beard", "Full beard", "", "a full beard"],
      ["goatee", "Goatee", "", "a goatee"], ["moustache", "Moustache", "", "a moustache"], ["pencil", "Pencil", "", "a pencil moustache"],
      ["pushbroom", "Push-broom", "b", "a thick push-broom moustache"], ["braided", "Braided", "b", "a braided beard"], ["handlebar", "Handlebar", "b", "a colossal waxed handlebar moustache wider than the shoulders, both ends curled into tight spirals"], ["horseshoe", "Horseshoe", "", "a heavy horseshoe moustache"]] },
    { id: "distinctive", label: "Distinctive features", max: 2, visual: true, options: [
      ["oddeyes", "Odd eyes", "", "heterochromia, two different eye colors"], ["facetattoo", "Face tattoo", "", "a face tattoo"],
      ["piercing", "Piercing", "", "a septum piercing"], ["earpiercing", "Ear piercing", "", "ear piercings"], ["slits", "Brow slits", "", "eyebrow slits"],
      ["bleached", "Bleached", "", "bleached eyebrows"], ["nobrows", "No brows", "", "no eyebrows"],
      ["braces", "Braces", "", "braces on the teeth"], ["scar", "Brow scar", "", "a scar through one eyebrow"], ["gems", "Face gems", "", "small face gems"],
      ["elf", "Elf ears", "", "pointed elf ears"], ["lashes", "Big lashes", "", "big dramatic lashes"], ["tape", "Nose tape", "", "a strip of tape across the nose"]] },
    { id: "accessories", label: "Accessories", max: 3, visual: true, options: [
      ["none", "None", "", ""], ["glasses", "Glasses", "", "glasses"], ["headphones", "Headphones", "", "headphones around the neck"],
      ["jewelry", "Jewelry", "", "statement jewelry"], ["chain", "Iced-out chain", "", "an iced-out diamond chain"],
      ["cap", "Fitted cap", "", "a fitted baseball cap"], ["backcap", "Backwards cap", "", "a backwards baseball cap"],
      ["hat", "Hat", "", "a hat"], ["bag", "Bag", "", "a designer bag"], ["earmuffs", "Earmuffs", "", "fluffy oversized earmuffs"], ["shades", "Sport shades", "", "black wraparound sport sunglasses"]] },
    { id: "pendant", label: "Chain pendant", max: 1, visual: true, options: [
      ["none", "None", "", ""],
      ["lion", "Gold lion", "", "a big solid {M} lion head pendant with a detailed mane and diamond eyes", "gold"],
      ["cross", "Iced cross", "", "a big iced-out {M} diamond cross pendant"],
      ["hundred", "100 emoji", "", "a pendant shaped like the red 100 emoji, double underlined, paved in red rubies and white diamonds set in {M}"],
      ["ak", "AK", "", "an iced-out {M} diamond AK-47 rifle pendant"],
      ["mic", "Microphone", "", "an iced-out {M} diamond vintage microphone pendant"],
      ["headphones", "Headphones", "", "an iced-out {M} diamond over-ear headphones pendant"],
      ["turntables", "DJ decks", "", "an iced-out {M} DJ setup pendant: two turntables side by side with black vinyl records and tonearms and a DJ mixer with knobs and faders in the middle, all paved in diamonds"],
      ["name", "Name pendant", "", "NAME"]] },
    { id: "metal", label: "Chain metal", max: 1, visual: true, options: [
      ["silver", "White gold", "", "white gold"], ["gold", "Yellow gold", "", "yellow gold"], ["rose", "Rose gold", "", "rose gold"]] },
    { id: "grill", label: "Grills", max: 1, visual: true, options: [
      ["none", "None", "", ""],
      ["solid", "Solid", "", "a polished solid {G} grill with a mirror shine, each tooth individually shaped"],
      ["diamondcut", "Diamond-cut", "", "a {G} diamond-cut grill, the metal engraved with fine glittering faceted cuts that sparkle like diamond dust"],
      ["iced", "Iced out", "", "a fully iced-out grill, every tooth completely paved in brilliant VVS diamonds set in {G}", "platinum"],
      ["stars", "Star cut", "", "a polished {G} grill with a small diamond-paved star set into the center of each tooth"],
      ["openface", "Open face", "", "an open-face {G} grill: thin polished frames outlining each tooth with the natural white enamel showing through the middle"],
      ["ruby", "Ruby", "", "a grill paved in deep blood-red rubies set in {G}, every gem individually set and glowing red"],
      ["led", "LED", "", "a light-up LED grill glowing bright neon blue, pink and purple through clear covers with thin {G} edges, the light glowing on the lips"],
      ["fangs", "Fangs", "", "pointed {G} fang caps paved in diamonds on the upper canine teeth, the other teeth natural white", "silver"],
      ["rainbow", "Rainbow gems", "", "a grill paved in a rainbow mosaic of rubies, sapphires, emeralds and yellow and pink diamonds set in {G}"]] },
    { id: "grillmetal", label: "Grill metal", max: 1, visual: true, sub: "grill", options: [
      ["gold", "Gold", "", "yellow gold"], ["silver", "Silver", "", "sterling silver"], ["platinum", "Platinum", "", "platinum"], ["rose", "Rose gold", "", "rose gold"]] },
    { id: "grillcover", label: "Coverage", max: 1, sub: "grill", options: [
      ["top6", "Top 6", "", "the top six front teeth"], ["bottom6", "Bottom 6", "", "the bottom six front teeth"],
      ["both6", "Top & bottom 6", "", "the top six and bottom six front teeth"], ["full8", "Full mouth 8+8", "", "every visible tooth, the top eight and bottom eight"]] }
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
    motion: { note: "Your influencer copies every move from the video, in their own setting and with their own body shape.", title: "Add a reference video<br />to extract motion", hint: "Video duration: 4 to 30 seconds" },
    scene: { note: "Write a scene with a signature character like @Auntie. Their trained look is used in every shot, and every camera angle stays in the same place.", title: "", hint: "" },
    swap: { note: "Your character takes the place of someone in the video. The scene and camera stay the same. Works best for characters with regular human proportions.", title: "Add a reference video<br />to edit", hint: "Video duration: 4 to 30 seconds" }
  };
  var NEGATIVE = "blurry, deformed, extra limbs, extra fingers, bad anatomy, watermark, text, logo, cropped head, child, minor, nsfw";

  // Presets for the Explore wall (images rendered on the 3090, in img/influencer/).
  // x = extra description (goes into "Anything else?"), view = shot used for the preset image.
  var PRESETS = applyPresetOrder(window.AIRH_INF_PRESETS || [], loadPresetOrderCache());

  // ------------------------------------------------------------ state
  var $ = function (id) { return document.getElementById(id); };
  var root = $("inf");
  var MPRESETS = [], pv = null;   // motion presets + open preset viewer (declared early: boot code uses them)
  if (!root) return;
  var hasSupabase = !!(window.supabase && typeof SUPABASE_URL !== "undefined");
  var client = hasSupabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

  // ---- preset order set by the admin (site_settings key "influencer": { order: [ids], hidden: [ids] })
  function applyPresetOrder(all, cfg) {
    if (!cfg || !cfg.order || !cfg.order.length) {
      var h0 = (cfg && cfg.hidden) || [];
      return all.filter(function (p) { return h0.indexOf(p.id) < 0; });
    }
    var byId = {}; all.forEach(function (p) { byId[p.id] = p; });
    var hidden = cfg.hidden || [], seen = {}, out = [];
    cfg.order.forEach(function (id) { if (byId[id] && !seen[id]) { seen[id] = 1; if (hidden.indexOf(id) < 0) out.push(byId[id]); } });
    all.forEach(function (p) { if (!seen[p.id] && hidden.indexOf(p.id) < 0) out.push(p); });   // presets added later go at the end
    return out;
  }
  function loadPresetOrderCache() { try { return JSON.parse(localStorage.getItem("airh-inf-order") || "null"); } catch (e) { return null; } }
  function fetchPresetOrder() {
    if (!hasSupabase) return;
    fetch(SUPABASE_URL + "/rest/v1/site_settings?key=eq.influencer&select=value", { headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY }, cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rows) {
        var cfg = rows && rows[0] ? rows[0].value : null;
        var before = JSON.stringify(loadPresetOrderCache());
        try { localStorage.setItem("airh-inf-order", JSON.stringify(cfg)); } catch (e) {}
        if (JSON.stringify(cfg) === before) return;
        PRESETS = applyPresetOrder(window.AIRH_INF_PRESETS || [], cfg);
        if ($("presetWall")) renderPresets();
      }).catch(function () {});
  }
  var prefs = loadPrefs();
  var state = {
    histF: "all",       // History filter: all / mine / videos
    user: null,
    tier: "normal",
    traits: {},          // groupId -> [optionId]
    open: { tier: true },
    view: prefs.v2 && VIEWS[prefs.view] ? prefs.view : "card",
    engine: prefs.v2 && ENGINES[prefs.engine] && prefs.engine !== "qwen_edit2509" ? prefs.engine : "flux2",
    batch: clamp(prefs.batch || 1, 1, 4),
    photo: null,         // { blob, url }
    mine: [],            // influencer rows + job data
    offset: 0,
    motionPick: null,
    viewing: null,
    m: {
      mode: prefs.mMode === "swap" || prefs.mMode === "scene" ? prefs.mMode : "motion",
      shots: 1, shape: "portrait", sceneChars: null,
      res: prefs.mRes === "480p" || prefs.mRes === "1080p" ? prefs.mRes : "720p",
      len: prefs.mLen === 10 ? 10 : 5,
      video: null,        // { blob, url, w, h, dur }
      char: null,         // { url, name, infId } or { blob, url, name }
      style: "", styleCustom: "", styleImg: null, styleTab: "presets",
      usePrompt: false,
      setting: "own", clip: null
    },
    vids: [], vidOffset: 0, vViewing: null,
    sel: {}             // "id|url" -> { c, url } (multi-select on My influencers)
  };

  // ------------------------------------------------------------ boot
  buildGroups();
  renderPicked();
  wire();
  wireWallView();
  renderPresets();
  fetchPresetOrder();
  renderFan();
  syncSeg("viewSeg", "data-view", state.view);
  syncSeg("engineSeg", "data-engine", state.engine);
  syncEngineNote();
  $("batchVal").textContent = state.batch;
  wireMotion();
  wirePresetViewer();
  wireSelection();
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
    function optsHtml(g, opts) {
      return g.visual
        ? '<div class="inf-types inf-vis' + (g.id === "hair" ? " is-hair" : "") + '">' + opts.map(function (o) {
            var on = (state.traits[g.id] || []).indexOf(o[0]) > -1;
            return '<button type="button" class="inf-type inf-opt' + (on ? " is-on" : "") + '" data-g="' + g.id + '" data-o="' + o[0] + '" aria-pressed="' + on + '">' +
              '<span class="inf-type-img" style="background-image:url(' + IMG + "opt/" + g.id + "-" + o[0] + '.jpg)"></span><span>' + esc(o[1]) + "</span></button>";
          }).join("") + "</div>"
        : '<div class="inf-opts">' + opts.map(function (o) {
            var on = (state.traits[g.id] || []).indexOf(o[0]) > -1;
            return '<button type="button" class="inf-opt' + (on ? " is-on" : "") + '" data-g="' + g.id + '" data-o="' + o[0] + '" aria-pressed="' + on + '">' + esc(o[1]) + "</button>";
          }).join("") + "</div>";
    }
    GROUPS.forEach(function (g) {
      if (g.sub) return;
      var opts = visibleOptions(g);
      if (!opts.length) return;
      var picked = g.id === "grill" ? grillSummary() : (state.traits[g.id] || []).map(function (id) { return labelOf(g, id); }).join(", ");
      var subs = GROUPS.filter(function (x) { return x.sub === g.id; }).map(function (x) {
        return '<div class="inf-subgroup" data-g="' + x.id + '"><p class="inf-sub-label">' + esc(x.label) + '<span class="inf-group-picked" hidden></span></p>' + optsHtml(x, visibleOptions(x)) + "</div>";
      }).join("");
      html += '<section class="inf-group' + (state.open[g.id] ? " is-open" : "") + '" data-g="' + g.id + '">' +
        groupHead(g.id, g.label, opts.length, picked, g.max) +
        '<div class="inf-group-body">' + (g.max > 1 ? '<p class="inf-max">Pick up to ' + g.max + "</p>" : "") +
        optsHtml(g, opts) + subs +
        (g.id === "grill" ? '<p class="inf-chain-hint">Pick a grill style, then the metal and how many teeth it covers. Leave it on None for no grill.</p>' : "") +
        (g.id === "pendant" ? '<label class="inf-pname"' + ((state.traits.pendant || [])[0] === "name" ? "" : " hidden") + '>Name on the pendant <input id="infPendantName" type="text" maxlength="14" placeholder="e.g. CRISS P" value="' + esc(state.pendantName || "") + '"></label>' : "") +
        "</div></section>";
      if (g.id === "metal" && tierOf(state.tier).human) {
        var cs = state.chains || [];
        html += '<section class="inf-group' + (state.open.chains ? " is-open" : "") + '" data-g="chains">' +
          groupHead("chains", "Chains (jeweler)", 3, cs.length ? cs.map(function (c) { return c.mm + "mm " + c.len + '"'; }).join(" + ") : "") +
          '<div class="inf-group-body"><div class="inf-chains-wrap">' + chainsHtml() + "</div></div></section>";
      }
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
    var sec = $("groups").querySelector('.inf-group[data-g="' + gid + '"], .inf-subgroup[data-g="' + gid + '"]');
    if (sec) {
      Array.prototype.forEach.call(sec.querySelectorAll('.inf-opt[data-g="' + gid + '"]'), function (b) {
        var on = cur.indexOf(b.getAttribute("data-o")) > -1;
        b.classList.toggle("is-on", on); b.setAttribute("aria-pressed", on);
      });
      sec.querySelector(".inf-group-picked").textContent = cur.map(function (id) { return labelOf(g, id); }).join(", ");
      if (gid === "grill" || g.sub === "grill") { var gh = $("groups").querySelector('.inf-group[data-g="grill"] .inf-group-head .inf-group-picked'); if (gh) gh.textContent = grillSummary(); }
      var pn = sec.querySelector(".inf-pname"); if (pn) pn.hidden = cur[0] !== "name";
    }
    renderPicked();
  }

  function renderPicked() {
    var chips = [];
    chips.push('<span class="inf-chip is-type">' + esc(tierOf(state.tier).label) + "</span>");
    GROUPS.forEach(function (g) {
      (state.traits[g.id] || []).forEach(function (oid) {
        chips.push('<button type="button" class="inf-chip" data-g="' + g.id + '" data-o="' + oid + '" title="Remove">' + esc((g.sub === "grill" ? "Grill: " : g.id === "grill" ? "Grill " : "") + labelOf(g, oid)) + ' <span aria-hidden="true">&times;</span></button>');
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
      if (g.sub && !(state.traits[g.sub] || []).length) return;
      if (g.id === "grill" && Math.random() < 0.75) return;
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

  function loadRecipe(tier, traits, name, extra, view, chains) {
    state.tier = tierOf(tier).id;
    state.traits = JSON.parse(JSON.stringify(traits || {}));
    state.chains = chains ? JSON.parse(JSON.stringify(chains)) : []; state.pendantOn = 0;
    state.open = { tier: true };
    $("infName").value = name || "";
    $("infExtra").value = extra || "";
    if (view && VIEWS[view]) { state.view = view; syncSeg("viewSeg", "data-view", view); }
    setPane("create");
    buildGroups(); renderPicked();
    syncEngineNote();
    $("paneCreate").scrollTop = 0;
    if (window.matchMedia("(max-width: 720px)").matches) root.scrollIntoView({ behavior: "smooth" });
    hint("Settings loaded" + (name ? " from " + name : "") + ". Change anything, then Generate.");
    toast("Character settings applied to the sidebar");
  }

  // ------------------------------------------------------------ prompt
  function phrase(gid, oid) {
    if (gid === "pendant" && oid === "name") {
      var nm = (state.pendantName || $("infName").value || "ICY").replace(/["<>]/g, "").trim().slice(0, 14) || "ICY";
      return 'a big custom name pendant spelling "' + nm + '" in bold cursive script letters, ' + metalWord() + ' paved in diamonds' + pendantAttach();
    }
    var g = groupById(gid), o = g && optOf(g, oid);
    if (!o) return "";
    if (gid === "pendant") return o[3].replace(/\{M\}/g, metalWord(o[4])) + pendantAttach(o[4]);
    return o[3];
  }
  function grillSummary() {
    var gs = (state.traits.grill || [])[0];
    if (!gs || gs === "none") return gs === "none" ? "None" : "";
    var g = groupById("grill"), o = optOf(g, gs);
    var m = (state.traits.grillmetal || [])[0], c = (state.traits.grillcover || [])[0];
    return [o ? o[1] : gs, m ? labelOf(groupById("grillmetal"), m) : "", gs !== "fangs" && c ? labelOf(groupById("grillcover"), c) : ""].filter(Boolean).join(" \u00b7 ");
  }
  function grillPhrase() {
    var gs = (state.traits.grill || [])[0];
    if (!gs || gs === "none") return "";
    var o = optOf(groupById("grill"), gs); if (!o) return "";
    var m = (state.traits.grillmetal || [])[0] || o[4] || "gold";
    var mw = { gold: "yellow gold", silver: "sterling silver", platinum: "platinum", rose: "rose gold" }[m] || "yellow gold";
    var cov = optOf(groupById("grillcover"), (state.traits.grillcover || [])[0] || "both6");
    var core = o[3].replace(/\{G\}/g, mw);
    return gs === "fangs" ? core : core + ", fitted over " + cov[3];
  }
  function metalWord(def) {
    var m = (state.traits.metal || [])[0] || def || "silver";
    return { silver: "white gold", gold: "yellow gold", rose: "rose gold" }[m] || "white gold";
  }
  // ---- jeweler: up to 3 layered chains, each with its own style, width, length and metal
  var CHAIN_STYLES = [["cuban", "Cuban link", "cuban link chain"], ["tennis", "Tennis", "tennis chain of single set diamonds"], ["rope", "Rope", "twisted rope chain"],
    ["franco", "Franco", "franco chain"], ["figaro", "Figaro", "figaro chain"], ["herringbone", "Herringbone", "flat herringbone chain"], ["rolo", "Rolo", "rolo link chain"]];
  var CHAIN_MM = [3, 5, 8, 10, 12, 15, 18, 20, 25];
  var CHAIN_LEN = [[16, "16\" choker", "16 inches, sitting tight around the neck like a choker"], [18, "18\"", "18 inches, resting at the collarbone"],
    [20, "20\"", "20 inches, resting on the upper chest"], [22, "22\"", "22 inches, hanging to the mid chest"], [24, "24\"", "24 inches, hanging to the lower chest"],
    [26, "26\"", "26 inches, hanging just above the stomach"], [30, "30\"", "30 inches, hanging down to the stomach"]];
  var CHAIN_METAL = [["match", "Match pendant"], ["silver", "White gold"], ["gold", "Yellow gold"], ["rose", "Rose gold"]];
  function newChain(i) { return [{ style: "cuban", mm: 12, len: 20, metal: "match", iced: true }, { style: "tennis", mm: 5, len: 18, metal: "match", iced: true }, { style: "rope", mm: 8, len: 24, metal: "match", iced: false }][i] || { style: "cuban", mm: 10, len: 22, metal: "match", iced: true }; }
  function chainMetal(c) { if (c.metal && c.metal !== "match") return { silver: "white gold", gold: "yellow gold", rose: "rose gold" }[c.metal]; var p = (state.traits.pendant || [])[0], g = groupById("pendant"), o = p && optOf(g, p); return metalWord(o && o[4]); }
  function chainPhrase(c) {
    var st = CHAIN_STYLES.filter(function (x) { return x[0] === c.style; })[0] || CHAIN_STYLES[0];
    var ln = CHAIN_LEN.filter(function (x) { return x[0] === +c.len; })[0] || CHAIN_LEN[2];
    var w = c.mm <= 5 ? "thin " : c.mm >= 15 ? "massive heavy " : "thick ";
    return "a " + w + c.mm + "mm " + (c.iced && c.style !== "tennis" ? "iced-out diamond " : "") + chainMetal(c) + " " + st[2] + ", " + ln[2];
  }
  function chainsPhrase() {
    var cs = state.chains || [];
    if (!cs.length) return "";
    var ord = ["first", "second", "third"];
    var list = cs.map(function (c, i) { return (cs.length > 1 ? "(" + (i + 1) + ") " : "") + chainPhrase(c); }).join("; ");
    return (cs.length > 1 ? cs.length + " layered chains at the same time, clearly separate and each fully visible: " : "") + list +
      ", every diamond individually set and sparkling, realistic jewelry proportions";
  }
  function pendantAttach(def) {
    var cs = state.chains || [];
    if (!cs.length) return ", hanging from the center of a thick iced-out " + metalWord(def) + " cuban link chain on a big diamond bail, every diamond individually set and sparkling";
    var i = Math.min(state.pendantOn || 0, cs.length - 1);
    return ", hanging on a big diamond bail from the center of the " + ["first", "second", "third"][i] + " chain (the " + cs[i].len + "-inch " + cs[i].mm + "mm one)";
  }
  function chainsHtml() {
    var cs = state.chains || [];
    function sel(i, key, opts) {
      return '<select data-chain="' + i + '" data-k="' + key + '">' + opts.map(function (o) { return '<option value="' + o[0] + '"' + (String(cs[i][key]) === String(o[0]) ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join("") + "</select>";
    }
    var h = '<div class="inf-chains"><div class="inf-chain-count">' + [0, 1, 2, 3].map(function (n) {
      return '<button type="button" data-chaincount="' + n + '" class="' + (cs.length === n ? "is-on" : "") + '">' + (n ? n + (n > 1 ? " chains" : " chain") : "Off") + "</button>";
    }).join("") + "</div>";
    cs.forEach(function (c, i) {
      h += '<div class="inf-chain-row"><span class="inf-chain-n">' + (i + 1) + "</span>" +
        sel(i, "style", CHAIN_STYLES) + sel(i, "mm", CHAIN_MM.map(function (m) { return [m, m + "mm"]; })) +
        sel(i, "len", CHAIN_LEN) + sel(i, "metal", CHAIN_METAL) +
        '<label class="inf-chain-ice"><input type="checkbox" data-chain="' + i + '" data-k="iced"' + (c.iced ? " checked" : "") + "> Iced</label></div>";
    });
    if (cs.length > 1) h += '<div class="inf-chain-pend">Pendant hangs on chain ' + cs.map(function (c, i) {
      return '<button type="button" data-pendon="' + i + '" class="' + ((state.pendantOn || 0) === i ? "is-on" : "") + '">' + (i + 1) + "</button>";
    }).join("") + "</div>";
    return h + '<p class="inf-chain-hint">Pick 1 to 3 chains and set each one like a jeweler would: style, width, length and metal.</p></div>';
  }
  function refreshChains() {
    var box = $("groups").querySelector(".inf-chains-wrap"); if (box) box.innerHTML = chainsHtml();
    var head = $("groups").querySelector('.inf-group[data-g="chains"] .inf-group-picked');
    if (head) head.textContent = (state.chains || []).length ? (state.chains || []).map(function (c) { return c.mm + "mm " + c.len + '"'; }).join(" + ") : "";
  }
  function pickOne(gid) { var v = state.traits[gid]; return v && v.length ? phrase(gid, v[0]) : ""; }
  function pickAll(gid) { return (state.traits[gid] || []).map(function (o) { return phrase(gid, o); }).filter(Boolean); }

  function buildPrompt(view) {
    var t = tierOf(state.tier), V = VIEWS[view];
    var who = pickOne("gender") || "person";
    var parts = [];
    var subject;
    if (t.human) {
      subject = [pickOne("age"), pickOne("ethnicity"), who].filter(Boolean).join(" ");
      var vibe = t.id === "freak" ? "a bold, quirky, slightly exaggerated " : t.id === "total" ? "a real person, a hyperreal practical-prosthetic casting character with extreme, heavily exaggerated features: a " : "a realistic ";
      subject = vibe + subject;
    } else {
      // The animal head REPLACES the human head (not an animal sitting on a person).
      subject = "a surreal photoreal hybrid character: a human " + who + "'s body from the neck down, but instead of a human head it has " + t.head +
        ", attached directly to the human neck and scaled like a human head; no human face, no human skin or human ears on the head, the " + t.animal + " head is the character's real head";
    }
    // Signature = the odd body parts (Arms / Legs / Head size, plus extreme builds). Stated first and loud,
    // or realistic models quietly normalise them.
    var sig = ["arms", "legs", "headsize"].filter(function (g) { var v = state.traits[g]; return v && v.length && v[0] !== "regular"; })
      .map(function (g) { return pickOne(g); }).filter(Boolean);  // "tiny" head has no wording: the server shrinks it
    var b0 = (state.traits.build || [])[0];
    if (b0 === "skinny" || b0 === "obese") sig.unshift(pickOne("build"));
    if (sig.length && t.human) subject = subject.replace(/^(a realistic |a bold, quirky, slightly exaggerated )/, "a surreal but photoreal ") + " with wildly exaggerated, unnatural body proportions";
    parts.push(V.lead + " " + subject + (pickOne("style") ? ", fully clothed in " + pickOne("style") : $("infExtra").value.trim() ? ", fully clothed" : ", fully clothed in a stylish outfit"));
    var extraRaw = $("infExtra").value.trim(), lead = /^signature\s*:/i.test(extraRaw);
    if (lead) parts.push("SIGNATURE, extreme and unmistakable, the first thing you notice: " + extraRaw.replace(/^signature\s*:\s*/i, "") + (sig.length ? "; " + sig.join("; ") : ""));
    else if (sig.length) parts.push("SIGNATURE, wildly exaggerated and the first thing you notice: " + sig.join("; "));
    var body = [pickOne("height"), b0 === "skinny" || b0 === "obese" ? "" : pickOne("build")].filter(Boolean).join(", ");
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
    var pend = pickOne("pendant");
    var chs = chainsPhrase();
    if (chs) acc = acc.filter(function (a) { return a !== "an iced-out diamond chain"; }).concat(["wearing " + chs]);
    if (pend) acc = acc.filter(function (a) { return a !== "an iced-out diamond chain"; }).concat([pend]);
    else if ((state.traits.metal || [])[0]) acc = acc.map(function (a) { return a === "an iced-out diamond chain" ? "an iced-out " + metalWord() + " diamond cuban link chain" : a; });
    if (acc.length) parts.push("accessorized with " + acc.join(", "));
    var grl = grillPhrase();
    if (grl) parts.push("wearing a custom grill on the teeth: " + grl + ", mouth open in a confident wide grin with lips parted so the grill is clearly visible, sharp detailed jewelry on the teeth");
    if (extraRaw && !lead) parts.push(extraRaw);
    parts.push(grl ? V.tail.replace("a blank deadpan expression", "a confident open-mouth grin showing the grill") : V.tail);
    var bg = V.white ? "pure white seamless studio background, bright soft even light, faint contact shadow under the feet" : "plain light grey studio backdrop, soft even studio lighting";
    parts.push(t.id === "total" ? "extremely exaggerated but photoreal, a real photograph not a 3D render or cartoon, high-end fashion lookbook photography, " + bg + ", crisp natural skin texture, sharp focus"
      : bg + ", photorealistic, natural skin texture, sharp focus, high detail, editorial fashion photography");
    return parts.join(". ").replace(/\s+/g, " ").replace(/\.\./g, ".") + ".";
  }

  // Second pass for exaggerated traits: FLUX.2 draws a believable character, then Qwen Edit 2509
  // warps only the body parts (the way the viral "stick legs" edits are made).
  var EXAGGERATE = {
    build: { skinny: "the whole body skeletally thin, stick-figure skinny", obese: "the torso absurdly obese with a gigantic round belly hanging far over the waistband" },
    arms: { stick: "the arms bizarrely, unnaturally thin like broomsticks, with smooth natural skin", heavy: "the arms huge, soft and fat", huge: "the arms enormously muscular and bulging" },
    legs: { stick: "the legs bizarrely, unnaturally thin like broomsticks from hip to ankle, with smooth natural skin", stilts: "the legs impossibly long and thin like stilts, with smooth natural skin" },
    headsize: { big: "the head about one and a half times bigger, clearly too big for the body", huge: "the head twice as big, like a bobblehead" }
  };
  function exaggerationEdit(view) {
    var asks = [];
    Object.keys(EXAGGERATE).forEach(function (g) { var v = (state.traits[g] || [])[0]; if (v && EXAGGERATE[g][v]) asks.push(EXAGGERATE[g][v]); });
    if (!asks.length) return "";
    var where = view === "card" ? "Keep the exact two-panel layout (close-up portrait on the left, full body on the right). Edit only the character's body proportions wherever the body is visible: make "
      : view === "sheet" ? "Keep the exact layout and every view. Edit only the character's body proportions in each view: make "
      : "Edit only this person's body proportions: make ";
    return where + asks.join("; make ") +
      ". Keep the face, hair, skin tone, tattoos, clothes, shoes, accessories, pose and background exactly the same. Surreal but photoreal, seamless.";
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
    var exa = exaggerationEdit(state.view);
    if (exa) fd.append("post_edit", exa);
    if ((state.traits.headsize || [])[0] === "tiny") fd.append("shrink_head", "1");

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
    if (typeof paintHistEmpty === "function" && state.histF === "all") paintHistEmpty();
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
      t.insertAdjacentHTML("beforeend", '<div class="inf-tile-shade"></div><div class="inf-tile-meta"><strong>' + esc(c.name || "Influencer") + "</strong><span>" + esc(mentionOf(c) ? "@" + mentionOf(c) : tierOf(c.tier).label) + "</span></div>" +
        '<button type="button" class="inf-check" data-act="sel" aria-label="Select" aria-pressed="false"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg></button>' +
        '<div class="inf-tile-acts"><button type="button" class="inf-recreate" data-act="recreate">Recreate</button></div>' +
        '<div class="inf-tile-side">' +
          '<button type="button" class="inf-icon-btn inf-fav' + (c.favorite ? " is-on" : "") + '" data-act="fav" title="Favorite" aria-label="Favorite" aria-pressed="' + !!c.favorite + '"><svg width=\"15\" height=\"15\" viewBox=\"0 0 24 24\" fill=\"currentColor\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M12 20.5s-7.5-4.6-7.5-10.1A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.8c0 5.5-7.5 10.1-7.5 10.1z\"/></svg></button>' +
          '<button type="button" class="inf-icon-btn" data-act="more" title="More" aria-label="More actions"><svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg></button>' +
          '<button type="button" class="inf-icon-btn" data-act="dl" title="Download" aria-label="Download"><svg width=\"15\" height=\"15\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M12 3v12m0 0-4-4m4 4 4-4M5 21h14\"/></svg></button>' +
        '</div>' +
        '<button type="button" class="inf-tomotion" data-act="motion"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="13" height="14" rx="2.5"/><path d="m16 10 5-3v10l-5-3"/></svg>Turn to motion</button>' +
        '<div class="inf-missing-note">Image unavailable while the GPU machine is offline</div>');
      t.tabIndex = 0;
      t.setAttribute("data-key", selKey(c, url));
      if (state.sel[selKey(c, url)]) t.classList.add("is-selected");
      t.addEventListener("contextmenu", function (e) { e.preventDefault(); openMenu(e.clientX, e.clientY, c, url); });
      t.draggable = true;
      t.addEventListener("dragstart", function (e) { dragChar(e, { url: url, name: c.name || "Influencer", infId: realId(c.id), t: c.traits, tier: c.tier, crop: c.view === "card" ? "right" : (c.view === "sheet" ? "left" : "") }, absUrl(url)); });
      t.addEventListener("click", function (e) {
        if (e.target.closest("[data-act=sel]")) { e.stopPropagation(); toggleSel(c, url); return; }
        if (e.target.closest("[data-act=more]")) { e.stopPropagation(); var r = e.target.closest("[data-act=more]").getBoundingClientRect(); openMenu(r.left - 220, r.bottom + 6, c, url); return; }
        if (selCount() && !e.target.closest("[data-act]")) { toggleSel(c, url); return; }
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

  function mentionOf(c) { var h = String((c && c.name) || "").replace(/[^A-Za-z0-9_]/g, ""); return h.length >= 2 ? h : ""; }
  async function renameChar(c) {
    var nm = window.prompt("Name this influencer. Its @mention is the name without spaces (e.g. Miami Mike becomes @MiamiMike). Use a different name from your other influencers.", c.name || "");
    if (nm == null) return;
    nm = nm.trim().slice(0, 40);
    if (nm.replace(/[^A-Za-z0-9_]/g, "").length < 2) { hint("Use at least two letters or numbers.", true); return; }
    var clash = (state.mine || []).some(function (x) { return x !== c && mentionOf(x).toLowerCase() === nm.replace(/[^A-Za-z0-9_]/g, "").toLowerCase(); });
    if (clash) { hint("Another of your influencers already uses @" + nm.replace(/[^A-Za-z0-9_]/g, "") + ". Pick a different name.", true); return; }
    var old = c.name; c.name = nm; renderMine();
    if (client && realId(c.id)) {
      var r = await client.from("influencers").update({ name: nm }).eq("id", c.id);
      if (r.error) { c.name = old; renderMine(); hint("Couldn't rename. Try again.", true); return; }
    }
    state.m.sceneChars = null;
    hint("Renamed. Mention it as @" + mentionOf(c) + " in Scene mode or in Claude/ChatGPT.");
  }

  async function toggleFav(c) {
    c.favorite = !c.favorite;
    renderMine(); paintSelBar();
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
  // Which presets show their full-body shot on the wall (others show the close-up); unset = every 3rd one.
  // (key written inline: these run at boot, before later var assignments)
  function wallMode() { try { return localStorage.getItem("airh-inf-wall") === "sheets" ? "sheets" : "photos"; } catch (e) { return "photos"; } }
  function wireWallView() {
    var box = $("wallView"); if (!box) return;
    function paint() {
      var m = wallMode();
      Array.prototype.forEach.call(box.querySelectorAll("button"), function (b) { var on = b.getAttribute("data-wall") === m; b.classList.toggle("is-on", on); b.setAttribute("aria-pressed", on ? "true" : "false"); });
      $("presetWall").classList.toggle("is-sheets", m === "sheets");
    }
    box.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-wall]"); if (!b) return;
      try { localStorage.setItem("airh-inf-wall", b.getAttribute("data-wall")); } catch (err) {}
      paint(); renderPresets();
    });
    paint();
  }
  function renderPresets() {
    var PRESET_FULL = { "stick-stacks": true, "heavyweight": true, "peace-slim": true, "earmuff-auntie": false, "bowl-hulk": true, "tall-pin": true,
      "aerobics-al": true, "egg-man": true, "biker-ghost": true, "boxtop-betty": false, "cone-carl": false, "lampshade-lou": true };
    var wall = $("presetWall");
    wall.innerHTML = "";
    var tiles = [];
    PRESETS.forEach(function (p, i) {
      var t = document.createElement("div");
      t.className = "inf-tile is-preset";
      // Big single-photo previews (Higgsfield-style wall): alternate close-up and full-body crops of the sheet.
      var sheets = wallMode() === "sheets";
      var full = PRESET_FULL[p.id] !== undefined ? PRESET_FULL[p.id] : (i % 3 === 1);
      t.style.aspectRatio = sheets ? "1792 / 1024" : (full ? "9 / 14" : "7 / 8");
      var img = new Image();
      img.alt = p.name; img.loading = "lazy"; img.decoding = "async";
      img.onload = function () { t.classList.add("is-loaded"); };
      img.onerror = function () { if (!img.dataset.fb) { img.dataset.fb = 1; t.style.aspectRatio = "1344 / 768"; img.src = IMG + "preset-" + p.id + ".jpg"; } else t.classList.add("is-missing"); };
      img.src = sheets ? IMG + "preset-" + p.id + ".jpg" : IMG + "pv/" + p.id + (full ? "-full" : "-close") + ".jpg";
      t.appendChild(img);
      t.insertAdjacentHTML("beforeend", '<div class="inf-tile-shade"></div><div class="inf-tile-meta"><strong>' + esc(p.name) + "</strong><span>" + esc(tierOf(p.tier).label) + '</span></div><div class="inf-tile-acts"><button type="button" class="inf-recreate"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="13" height="13" rx="2.5"/><path d="M16 8V5.5A2.5 2.5 0 0 0 13.5 3h-8A2.5 2.5 0 0 0 3 5.5v8A2.5 2.5 0 0 0 5.5 16H8"/></svg>Recreate</button></div>');
      t.setAttribute("role", "button"); t.tabIndex = 0; t.setAttribute("aria-label", p.name + ": view sheet");
      t.draggable = true;
      t.addEventListener("dragstart", function (e) { dragChar(e, { url: presetFull(p), name: p.name, infId: null, t: p.t, tier: p.tier, crop: "" }, IMG + "pv/" + p.id + "-close.jpg"); });
      t.addEventListener("click", function (e) {
        if (e.target.closest(".inf-recreate")) { e.stopPropagation(); loadRecipe(p.tier, p.t, p.name, p.x, p.view, p.chains); return; }
        openPresetViewer(p);
      });
      t.addEventListener("keydown", function (e) { if ((e.key === "Enter" || e.key === " ") && e.target === t) { e.preventDefault(); openPresetViewer(p); } });
      t._ar = sheets ? 1024 / 1792 : (full ? 14 / 9 : 8 / 7);
      tiles.push(t);
    });
    presetTiles = tiles;
    layoutPresetWall(true);
  }
  // Row-by-row masonry: tiles go left to right into the shortest column, so the PRESETS order is the reading order
  // (CSS columns fill top-to-bottom, which stacked look-alikes on top of each other).
  var presetTiles = [], presetCols = 0;
  function layoutPresetWall(force) {
    var wall = $("presetWall"); if (!wall || !presetTiles.length) return;
    if (wall.classList.contains("is-sheets")) {
      wall.classList.remove("is-masonry"); wall.style.gap = "";
      if (force || presetCols !== -1) { wall.innerHTML = ""; presetTiles.forEach(function (t) { wall.appendChild(t); }); presetCols = -1; }
      return;
    }
    wall.classList.remove("is-masonry");
    var cs = getComputedStyle(wall);
    var maxC = parseInt(cs.columnCount, 10) || 4, minW = parseFloat(cs.columnWidth) || 220, gap = parseFloat(cs.columnGap) || 12;
    var w = wall.clientWidth || wall.parentNode.clientWidth;
    if (w < 50) { setTimeout(function () { layoutPresetWall(force); }, 250); return; }
    var n = Math.max(1, Math.min(maxC, Math.floor((w + gap) / (minW + gap))));
    wall.classList.add("is-masonry"); wall.style.gap = gap + "px";
    if (!force && n === presetCols) return;
    presetCols = n;
    wall.innerHTML = "";
    var cols = [], hts = [];
    for (var c = 0; c < n; c++) { var d = document.createElement("div"); d.className = "inf-wcol"; wall.appendChild(d); cols.push(d); hts.push(0); }
    presetTiles.forEach(function (t, i) {
      var k = 0;
      if (i < n) k = i; else for (var j = 1; j < n; j++) if (hts[j] < hts[k] - 0.05) k = j;
      cols[k].appendChild(t); hts[k] += t._ar + 0.06;
    });
  }
  var presetResizeT;
  window.addEventListener("resize", function () { clearTimeout(presetResizeT); presetResizeT = setTimeout(function () { layoutPresetWall(false); }, 120); });

  function renderFan() {
    var ids = ["miami-mc", "goth-queen", "boss-cat", "y2k-star", "gym-chad"];
    $("fan").innerHTML = ids.map(function (id, i) {
      return '<span class="inf-fan-card" style="--i:' + (i - 2) + ";background-image:url(" + IMG + "pv/" + id + '-close.jpg)"></span>';
    }).join("");
  }

  // ------------------------------------------------------------ preset viewer + motion presets (Higgsfield-style)
  // Clicking a preset opens its full sheet in a popup; only the Recreate button imports settings.
  // Motion presets are reference clips the admin uploads (site_settings key "motion_presets", bucket motion-presets).
  function siteUrl(u) {
    if (!u) return u;
    var m = String(u).match(/^https?:\/\/(?:www\.)?airesourcehub\.vip(\/.*)$/i);
    if (m) return location.origin + m[1];             // www. vs bare domain must not break fetch()
    return /^https?:\/\//i.test(u) ? u : location.origin + "/" + String(u).replace(/^\//, "");
  }
  function presetFull(p) { return siteUrl(IMG + "pv/" + p.id + "-full.jpg"); }
  function loadMotionCache() { try { return JSON.parse(localStorage.getItem("airh-motion-presets") || "null"); } catch (e) { return null; } }
  function setMotionPresets(cfg) {
    var items = (cfg && cfg.items) || [];
    MPRESETS = items.filter(function (m) { return m && m.video && !m.hidden; }).map(function (m) {
      var c = {}; for (var k in m) c[k] = m[k];
      c.video = siteUrl(m.video); if (m.poster) c.poster = siteUrl(m.poster);
      return c;
    });
    renderMotionWall();
    if (pv && !$("pViewer").hidden) paintPvStrip();
  }
  function fetchMotionPresets() {
    setMotionPresets(loadMotionCache());
    if (!hasSupabase) return;
    fetch(SUPABASE_URL + "/rest/v1/site_settings?key=eq.motion_presets&select=value", { headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY }, cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rows) {
        var cfg = rows && rows[0] ? rows[0].value : null;
        try { localStorage.setItem("airh-motion-presets", JSON.stringify(cfg)); } catch (e) {}
        setMotionPresets(cfg);
      }).catch(function () {});
  }
  function mpModeLabel(m) { return m.mode === "swap" ? "Objects swap" : "Motion transfer"; }
  function renderMotionWall() {
    var wall = $("motionWall"); if (!wall) return;
    $("motionEmpty").hidden = MPRESETS.length > 0;
    wall.innerHTML = MPRESETS.map(function (m, i) {
      return '<button type="button" class="inf-mtile' + (m.portrait === false ? " is-wide" : "") + '" data-mi="' + i + '">' +
        '<video muted loop playsinline preload="none"' + (m.poster ? ' poster="' + esc(m.poster) + '"' : "") + ' src="' + esc(m.video) + '#t=0.1"></video>' +
        '<span class="inf-tile-shade"></span><span class="inf-mbadge">' + esc(mpModeLabel(m)) + '</span><span class="inf-tile-meta"><strong>' + esc(m.name || "Motion") + "</strong>" + (m.shots > 1 ? "<small>" + m.shots + " camera angles</small>" : "") + "</span>" +
        '<span class="inf-mrecreate" data-mrec="' + i + '" role="button" tabindex="0"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="13" height="13" rx="2.5"/><path d="M16 8V5.5A2.5 2.5 0 0 0 13.5 3h-8A2.5 2.5 0 0 0 3 5.5v8A2.5 2.5 0 0 0 5.5 16H8"/></svg>Recreate</span></button>';
    }).join("");
  }
  function wireMotionWall() {
    var wall = $("motionWall"); if (!wall) return;
    wall.addEventListener("click", function (e) {
      var r = e.target.closest("[data-mrec]");
      if (r) { e.stopPropagation(); var mm = MPRESETS[+r.getAttribute("data-mrec")]; if (mm) applyMotion(mm, mm.mode === "swap" ? "swap" : "motion", null); return; }
      var b = e.target.closest("[data-mi]"); if (b) openMotionViewer(MPRESETS[+b.getAttribute("data-mi")]);
    });
    wall.addEventListener("mouseover", function (e) { var b = e.target.closest("[data-mi]"); if (b) { var v = b.querySelector("video"); if (v && v.paused) v.play().catch(function () {}); } });
    wall.addEventListener("mouseout", function (e) { var b = e.target.closest("[data-mi]"); if (b && !b.contains(e.relatedTarget)) { var v = b.querySelector("video"); if (v) v.pause(); } });
  }

  function openPv(kind, data) {
    pv = { kind: kind, data: data, motion: null, char: null, all: false };
    var img = $("pvImg"), vid = $("pvVid");
    $("pViewer").classList.toggle("is-motion", kind === "motion");
    if (kind === "inf") {
      var p = data;
      vid.pause(); vid.hidden = true; vid.removeAttribute("src");
      img.hidden = false; img.src = IMG + "preset-" + p.id + ".jpg"; img.alt = p.name;
      $("pvBg").style.backgroundImage = "url(" + JSON.stringify(IMG + "pv/" + p.id + "-close.jpg") + ")";
      $("pvName").textContent = p.name;
      $("pvParams").hidden = false; $("pvNoteSec").hidden = true;
      paintPvChips();
      $("pvRecreate").hidden = false; $("pvDl").hidden = true;
      $("pvMotion").hidden = false; $("pvSwap").hidden = false;
      $("pvMotion").textContent = "Turn to motion"; $("pvSwap").textContent = "Objects swap";
      $("pvMotionTitle").lastChild.textContent = "Add a motion preset";
    } else {
      var m = data;
      img.hidden = true; img.removeAttribute("src");
      vid.hidden = false; vid.poster = m.poster || ""; vid.src = m.video; vid.play().catch(function () {});
      $("pvBg").style.backgroundImage = m.poster ? "url(" + JSON.stringify(m.poster) + ")" : "none";
      $("pvName").textContent = m.name || "Motion preset";
      $("pvParams").hidden = true;
      $("pvNoteSec").hidden = !m.note; $("pvNote").textContent = m.note || "";
      $("pvRecreate").hidden = false;
      $("pvMotion").hidden = true; $("pvSwap").hidden = true;
      $("pvDl").hidden = false; $("pvDl").href = m.video; $("pvDl").setAttribute("download", slug(m.name || "motion") + ".mp4");
      $("pvMotionTitle").lastChild.textContent = "Pick your character";
    }
    paintPvStrip();
    $("pViewer").hidden = false;
    document.body.style.overflow = "hidden";
  }
  function openPresetViewer(p) { openPv("inf", p); }
  function dragChar(e, ch, thumb) {
    try {
      e.dataTransfer.setData("application/x-airh-char", JSON.stringify(ch));
      e.dataTransfer.setData("text/uri-list", /^https?:/.test(ch.url) ? ch.url : absUrl(ch.url));
      e.dataTransfer.effectAllowed = "copy";
    } catch (er) {}
    if (!$("paneMotion").hidden) $("mCharSlot").classList.add("is-target");
  }
  document.addEventListener("dragend", function () { var s = $("mCharSlot"); if (s) s.classList.remove("is-target", "is-over"); });
  function openMotionViewer(m) { if (m) openPv("motion", m); }
  function closePv() { $("pViewer").hidden = true; $("pvVid").pause(); document.body.style.overflow = ""; pv = null; }

  var PV_SECTIONS = [
    { t: "Character parameters", ids: ["gender", "build", "arms", "legs", "ethnicity", "age", "skin", "height", "proportions", "headsize"] },
    { t: "Face", ids: ["head", "neck", "eyeshape", "eyecolor", "features", "facialhair", "distinctive"] },
    { t: "Hair", ids: ["hair", "haircolor"] },
    { t: "Style", ids: ["style", "accessories", "pendant", "metal", "grill", "grillmetal", "grillcover"] }
  ];
  function paintPvChips() {
    var p = pv.data, tr = p.t || {}, byId = {}, used = {};
    GROUPS.forEach(function (g) { byId[g.id] = g; });
    var secs = PV_SECTIONS.map(function (sec, i) {
      var chips = i === 0 ? ['<span class="inf-chip is-type">' + esc(tierOf(p.tier).label) + "</span>"] : [];
      sec.ids.forEach(function (id) { used[id] = 1; var g = byId[id]; if (g) (tr[id] || []).forEach(function (o) { chips.push('<span class="inf-chip">' + esc(labelOf(g, o)) + "</span>"); }); });
      return { t: sec.t, chips: chips };
    });
    GROUPS.forEach(function (g) { if (!used[g.id]) (tr[g.id] || []).forEach(function (o) { secs[3].chips.push('<span class="inf-chip">' + esc(labelOf(g, o)) + "</span>"); }); });
    secs = secs.filter(function (x) { return x.chips.length; });
    var shown = pv.all ? secs : secs.slice(0, 1);
    $("pvChips").innerHTML = shown.map(function (x, i) {
      return (i ? '<h5 class="inf-pv-sub">' + esc(x.t) + "</h5>" : "") + '<div class="inf-viewer-chips">' + x.chips.join("") + "</div>";
    }).join("");
    $("pvMore").hidden = secs.length < 2;
    $("pvMore").innerHTML = pv.all ? 'Show less <span aria-hidden="true">&#8963;</span>' : 'See all <span aria-hidden="true">&#8964;</span>';
  }
  function paintPvStrip() {
    var box = $("pvStrip"), hintEl = $("pvStripHint");
    if (pv.kind === "inf") {
      if (!MPRESETS.length) { box.innerHTML = ""; hintEl.textContent = "No motion presets yet. Motion transfer opens the Motion tab, where you can add your own clip."; return; }
      box.innerHTML = MPRESETS.map(function (m, i) {
        return '<button type="button" class="inf-pv-pick' + (pv.motion === m ? " is-on" : "") + '" data-pm="' + i + '" title="' + esc(m.name || "") + '">' +
          (m.poster ? '<img src="' + esc(m.poster) + '" alt="" loading="lazy" />' : '<video muted playsinline preload="metadata" src="' + esc(m.video) + '#t=0.1"></video>') +
          "<span>" + esc(m.name || "Motion") + "</span></button>";
      }).join("");
      hintEl.textContent = pv.motion ? "Selected: " + (pv.motion.name || "motion") + ". Choose Turn to motion or Objects swap." : "Optional: pick a clip, then choose Turn to motion or Objects swap.";
    } else {
      var list = (PRESETS || []).map(function (p) { return { key: "p:" + p.id, name: p.name, thumb: IMG + "pv/" + p.id + "-close.jpg", ch: { url: presetFull(p), name: p.name, infId: null, t: p.t, tier: p.tier, crop: "" } }; });
      var mine = [];
      state.mine.forEach(function (c) { if (c.status === "done" && c.urls && c.urls.length) mine.push({ key: "m:" + c.urls[0], name: c.name || "My influencer", thumb: absUrl(c.urls[0]), ch: { url: c.urls[0], name: c.name, infId: realId(c.id), t: c.traits, tier: c.tier, crop: c.view === "card" ? "right" : (c.view === "sheet" ? "left" : "") } }); });
      pv.list = mine.slice(0, 24).concat(list);
      box.innerHTML = pv.list.map(function (r, i) {
        return '<button type="button" class="inf-pv-pick is-char' + (pv.char && pv.char.key === r.key ? " is-on" : "") + '" data-pc="' + i + '" title="' + esc(r.name) + '"><img src="' + esc(r.thumb) + '" alt="" loading="lazy" /><span>' + esc(r.name) + "</span></button>";
      }).join("");
      hintEl.textContent = pv.char ? "Selected: " + pv.char.name + "." : (state.m.char ? "Or keep your current character: " + (state.m.char.name || "Character") + "." : "Pick who should perform this motion.");
    }
  }

  async function loadMotionClip(m) {
    mHint("Loading the motion clip…");
    try {
      var r = await fetch(siteUrl(m.video));
      if (!r.ok) throw new Error("HTTP " + r.status);
      var b = await r.blob();
      var type = b.type && /^video\//.test(b.type) ? b.type : "video/mp4";
      var fl = new File([b], slug(m.name || "motion") + (type === "video/webm" ? ".webm" : type === "video/quicktime" ? ".mov" : ".mp4"), { type: type });
      fl.__preset = true; state.m.clip = m;
      setVideo(fl);
      mHint(state.m.char ? "Ready. Pick a style if you like, then Generate." : "Clip loaded. Now drag & drop your character into the slot below.");
    } catch (e) { mHint("Couldn't load that motion clip. Try again, or upload your own video.", true); }
  }
  function pvSend(mode) {
    var cur = pv; if (!cur) return;
    var ch = null, clip = null;
    if (cur.kind === "inf") { ch = { url: presetFull(cur.data), name: cur.data.name, infId: null, t: cur.data.t, tier: cur.data.tier, crop: "" }; clip = cur.motion; }
    else { ch = cur.char ? cur.char.ch : null; clip = cur.data; }
    closePv();
    applyMotion(clip, mode, ch);
  }
  // Recreate a motion preset (tile button or popup): switch the left panel to Motion, load the clip + mode (+ character).
  function applyMotion(clip, mode, ch) {
    if (ch) setChar(ch);
    var f = charFit(ch || state.m.char), switched = false;
    if (mode === "swap" && f && f.odd) { mode = "motion"; switched = true; }
    state.m.clip = clip || null;
    if (clip) { state.m.setting = "clip"; if ($("mSetSeg")) syncSeg("mSetSeg", "data-set", "clip"); }
    setPane("motion");
    setMode(mode);
    if (mode === "swap" && clip && clip.target) $("mTarget").value = clip.target;
    else if (mode === "swap" && !$("mTarget").value.trim()) $("mTarget").value = "person";
    $("paneMotion").scrollTop = 0;
    if (window.matchMedia("(max-width: 720px)").matches) root.scrollIntoView({ behavior: "smooth" });
    toast(switched ? "Using Motion transfer: it keeps " + ((ch || state.m.char).name || "this character") + "'s proportions" : (clip ? "Motion preset loaded into Motion" : (ch ? ch.name + " added to Motion" : "Motion tab ready")));
    if (clip) loadMotionClip(clip);
    else mHint(state.m.video ? "Ready. Pick a style if you like, then Generate." : "Now add a reference video, or pick one from Motion Presets.");
    renderMotionPick();
  }
  function wirePresetViewer() {
    if (!$("pViewer")) return;
    Array.prototype.forEach.call(document.querySelectorAll("#pViewer [data-pclose]"), function (el) { el.addEventListener("click", closePv); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && pv && !$("pViewer").hidden) closePv(); });
    $("pvMore").addEventListener("click", function () { pv.all = !pv.all; paintPvChips(); });
    $("pvStrip").addEventListener("click", function (e) {
      var b = e.target.closest("[data-pm],[data-pc]"); if (!b || !pv) return;
      if (b.hasAttribute("data-pm")) { var m = MPRESETS[+b.getAttribute("data-pm")]; pv.motion = pv.motion === m ? null : m; }
      else { var r = pv.list[+b.getAttribute("data-pc")]; pv.char = pv.char && pv.char.key === r.key ? null : r; }
      paintPvStrip();
    });
    $("pvRecreate").addEventListener("click", function () {
      if (pv && pv.kind === "motion") { pvSend(pv.data.mode === "swap" ? "swap" : "motion"); return; }
      var p = pv && pv.data; closePv(); if (p) loadRecipe(p.tier, p.t, p.name, p.x, p.view, p.chains);
    });
    $("pvMotion").addEventListener("click", function () { pvSend("motion"); });
    $("pvSwap").addEventListener("click", function () { pvSend("swap"); });
    var ex = $("exploreTabs");
    if (ex) ex.addEventListener("click", function (e) {
      var b = e.target.closest("[data-ex]"); if (!b) return; setExplore(b.getAttribute("data-ex"));
    });
    var hb = $("histBar");
    if (hb) hb.addEventListener("click", function (e) { var b = e.target.closest("[data-hist]"); if (b) setStage(b.getAttribute("data-hist"), true); });
    if ($("infToastX")) $("infToastX").addEventListener("click", function () { $("infToast").hidden = true; });
    wireMotionWall();
    fetchMotionPresets();
  }
  function setExplore(k) {
    Array.prototype.forEach.call($("exploreTabs").querySelectorAll("[data-ex]"), function (b) { var on = b.getAttribute("data-ex") === k; b.classList.toggle("is-on", on); b.setAttribute("aria-selected", on); });
    $("exInf").hidden = k !== "inf"; $("exMotion").hidden = k !== "motion";
    if (k === "inf") layoutPresetWall(true);
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
    if (!v) return;
    var before = state.mine.length;
    await deleteChars([v.c]);
    if (state.mine.length < before) closeViewer();
  }

  // ------------------------------------------------------------ wiring
  function wire() {
    $("groups").addEventListener("input", function (e) {
      if (e.target && e.target.id === "infPendantName") state.pendantName = e.target.value;
    });
    $("groups").addEventListener("change", function (e) {
      var t = e.target, i = t && t.getAttribute("data-chain");
      if (i === null || i === undefined || !state.chains || !state.chains[+i]) return;
      var k = t.getAttribute("data-k");
      state.chains[+i][k] = k === "iced" ? t.checked : (k === "mm" || k === "len") ? +t.value : t.value;
      refreshChains();
    });
    $("groups").addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("[data-chaincount],[data-pendon]");
      if (!b) return;
      if (b.hasAttribute("data-chaincount")) {
        var n = +b.getAttribute("data-chaincount"), cs = state.chains || [];
        while (cs.length < n) cs.push(newChain(cs.length));
        cs.length = n; state.chains = cs;
        if ((state.pendantOn || 0) >= n) state.pendantOn = 0;
      } else state.pendantOn = +b.getAttribute("data-pendon");
      refreshChains();
    });
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
      state.traits = {}; state.chains = []; state.pendantOn = 0; state.tier = "normal"; $("infName").value = ""; $("infExtra").value = "";
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
      setChar({ url: state.motionPick, name: c ? c.name : "Influencer", infId: c ? realId(c.id) : null, t: c ? c.traits : null, tier: c ? c.tier : null, crop: c && c.view === "card" ? "right" : (c && c.view === "sheet" ? "left" : "") });
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
    if (p === "motion") renderMotionPick();
  }

  // History = one tab (like Higgsfield) with a filter: all / influencers / videos.
  // Code paths call setStage("mine") / setStage("videos") after a render; that opens History and keeps "All" if it's on.
  function setStage(s, explicit) {
    if (s === "history") s = state.histF || "all";
    var hist = s === "all" || s === "mine" || s === "videos";
    if (hist) { if (explicit || s === "all" || state.histF !== "all") state.histF = s; }
    var f = state.histF || "all";
    Array.prototype.forEach.call(document.querySelectorAll(".inf-stage-tabs [data-stage]"), function (b) {
      var k = b.getAttribute("data-stage"), on = hist ? k === "history" : k === s; b.classList.toggle("is-on", on); b.setAttribute("aria-selected", on);
    });
    if ($("histBar")) {
      $("histBar").hidden = !hist;
      Array.prototype.forEach.call($("histBar").querySelectorAll("[data-hist]"), function (b) { var on = b.getAttribute("data-hist") === f; b.classList.toggle("is-on", on); b.setAttribute("aria-selected", on); });
    }
    var showMine = hist && f !== "videos", showVids = hist && f !== "mine";
    $("stageExplore").hidden = hist;
    $("stageMine").hidden = !showMine;
    $("stageVideos").hidden = !showVids;
    var all = hist && f === "all";
    $("stageMine").classList.toggle("is-all", all); $("stageVideos").classList.toggle("is-all", all);
    if (all) {   // newest kind first, like one mixed history feed
      var tm = state.mine[0] && state.mine[0].created_at, tv = state.vids[0] && state.vids[0].created_at;
      var mineFirst = !tv || (tm && new Date(tm) >= new Date(tv));
      var m = $("stageMine"), v = $("stageVideos");
      if (mineFirst && v.nextElementSibling === m) m.parentNode.insertBefore(m, v);
      if (!mineFirst && m.nextElementSibling === v) v.parentNode.insertBefore(v, m);
    }
    if (showVids) renderVideos();
    paintHistEmpty();
  }
  function paintHistEmpty() {
    if (!$("histBar")) return;
    var all = (state.histF || "all") === "all";
    if (all) {
      $("vidEmpty").hidden = true;
      $("mineEmpty").hidden = !(state.user && !state.mine.length && !state.vids.length);
    }
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
    if (p) { var pr = (window.AIRH_INF_PRESETS || PRESETS).filter(function (x) { return x.id === p; })[0]; if (pr) loadRecipe(pr.tier, pr.t, pr.name, pr.x, pr.view, pr.chains); }
    if (q.get("tab") === "mine") setStage("mine", true);
    if (q.get("tab") === "videos") setStage("videos", true);
    if (q.get("tab") === "history") setStage("history");
    if (q.get("tab") === "motion") setPane("motion");
  }

  // ------------------------------------------------------------ select, right-click menu, bottom toolbar
  function selKey(c, url) { return String(c.id) + "|" + url; }
  function selCount() { return Object.keys(state.sel).length; }
  function toggleSel(c, url, force) {
    var k = selKey(c, url);
    var on = force === undefined ? !state.sel[k] : force;
    if (on) state.sel[k] = { c: c, url: url }; else delete state.sel[k];
    var t = $("mineWall").querySelector('[data-key="' + cssEsc(k) + '"]');
    if (t) { t.classList.toggle("is-selected", on); var b = t.querySelector(".inf-check"); if (b) b.setAttribute("aria-pressed", on); }
    paintSelBar();
  }
  function clearSel() {
    state.sel = {};
    Array.prototype.forEach.call($("mineWall").querySelectorAll(".is-selected"), function (t) { t.classList.remove("is-selected"); });
    paintSelBar();
  }
  function selectAll() {
    state.mine.forEach(function (c) { if (c.status === "done") (c.urls || []).forEach(function (u) { toggleSel(c, u, true); }); });
  }
  function selItems() { return Object.keys(state.sel).map(function (k) { return state.sel[k]; }); }
  function paintSelBar() {
    var n = selCount(), bar = $("selBar");
    document.body.classList.toggle("inf-selecting", n > 0);
    bar.hidden = n === 0;
    if (!n) return;
    var first = selItems()[0];
    $("selThumb").style.backgroundImage = "url(" + JSON.stringify(absUrl(first.url)) + ")";
    $("selCount").textContent = n + " selected";
    var allFav = selItems().every(function (it) { return it.c.favorite; });
    $("selFav").classList.toggle("is-on", allFav);
    $("selFav").setAttribute("aria-pressed", allFav);
  }
  async function selDownload() {
    var items = selItems();
    for (var i = 0; i < items.length; i++) {
      await downloadImg(absUrl(items[i].url), (items[i].c.name || "character") + (items.length > 1 ? "-" + (i + 1) : ""));
      await new Promise(function (r) { setTimeout(r, 350); });
    }
  }
  async function selFavorite() {
    var items = selItems(), seen = {};
    var target = !items.every(function (it) { return it.c.favorite; });
    for (var i = 0; i < items.length; i++) {
      var c = items[i].c; if (seen[c.id]) continue; seen[c.id] = 1;
      if (!!c.favorite !== target) await toggleFav(c);
    }
    renderMine(); paintSelBar();
  }
  async function deleteChars(list) {
    var uniq = [], seen = {};
    list.forEach(function (c) { if (!seen[c.id]) { seen[c.id] = 1; uniq.push(c); } });
    if (!uniq.length) return;
    var label = uniq.length === 1 ? (uniq[0].name || "this influencer") : uniq.length + " influencers";
    if (!window.confirm("Delete " + label + "? This removes them from your list.")) return;
    var ids = uniq.map(function (c) { return realId(c.id); }).filter(Boolean);
    if (client && ids.length) {
      var r = await client.from("influencers").delete().in("id", ids);
      if (r.error) { hint("Couldn't delete: " + r.error.message, true); return; }
    }
    state.mine = state.mine.filter(function (c) { return !seen[c.id]; });
    clearSel(); renderMine(); renderMotionPick();
  }

  var menuCtx = null;
  function openMenu(x, y, c, url) {
    menuCtx = { c: c, url: url };
    var m = $("ctxMenu");
    $("ctxLike").querySelector("span").textContent = c.favorite ? "Unlike" : "Like";
    $("ctxSelect").querySelector("span").textContent = state.sel[selKey(c, url)] ? "Unselect" : "Select";
    m.hidden = false;
    var w = m.offsetWidth, h = m.offsetHeight;
    m.style.left = Math.max(8, Math.min(x, window.innerWidth - w - 8)) + "px";
    m.style.top = Math.max(8, Math.min(y, window.innerHeight - h - 8)) + "px";
    m.classList.toggle("flip-sub", x + w + 220 > window.innerWidth);
    var first = m.querySelector("button"); if (first) first.focus({ preventScroll: true });
  }
  function closeMenu() { $("ctxMenu").hidden = true; menuCtx = null; }
  async function menuAct(act) {
    var ctx = menuCtx; closeMenu();
    if (!ctx) return;
    var c = ctx.c, url = ctx.url, full = absUrl(url);
    if (act === "open") openViewer(c, url);
    else if (act === "select") toggleSel(c, url);
    else if (act === "motion") { toMotion(c, url); setMode("motion"); }
    else if (act === "swap") { toMotion(c, url); setMode("swap"); }
    else if (act === "lipsync") location.href = "lip-sync.html?ref=" + encodeURIComponent(full);
    else if (act === "recreate") loadRecipe(c.tier, c.traits, c.name);
    else if (act === "reference") location.href = "image-studio.html?model=qwen_edit2509&ref=" + encodeURIComponent(full);
    else if (act === "like") toggleFav(c);
    else if (act === "rename") renameChar(c);
    else if (act === "copy") {
      try { await navigator.clipboard.writeText(full); hint("Image link copied."); } catch (e) { window.prompt("Copy this link:", full); }
    }
    else if (act === "newtab") window.open(full, "_blank", "noopener");
    else if (act === "download") downloadImg(full, c.name);
    else if (act === "delete") deleteChars([c]);
  }
  function wireSelection() {
    $("ctxMenu").addEventListener("click", function (e) {
      var b = e.target.closest("[data-m]");
      if (!b) return;
      if (b.classList.contains("has-sub")) { b.parentElement.classList.toggle("sub-open"); return; }
      menuAct(b.getAttribute("data-m"));
    });
    document.addEventListener("mousedown", function (e) { if (!$("ctxMenu").hidden && !e.target.closest("#ctxMenu")) closeMenu(); });
    window.addEventListener("scroll", function () { if (!$("ctxMenu").hidden) closeMenu(); }, true);
    window.addEventListener("resize", closeMenu);
    $("selDl").addEventListener("click", selDownload);
    $("selFav").addEventListener("click", selFavorite);
    $("selDel").addEventListener("click", function () { deleteChars(selItems().map(function (it) { return it.c; })); });
    $("selAll").addEventListener("click", selectAll);
    $("selClose").addEventListener("click", clearSel);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !$("ctxMenu").hidden) { closeMenu(); e.stopImmediatePropagation(); return; }
      if (e.key === "Escape" && selCount() && $("viewer").hidden && $("vViewer").hidden && $("styleModal").hidden) clearSel();
      if ((e.key === "Delete" || e.key === "Backspace") && selCount() && !/INPUT|TEXTAREA/.test((document.activeElement || {}).tagName || "")) {
        e.preventDefault(); deleteChars(selItems().map(function (it) { return it.c; }));
      }
    }, true);
  }

  // ------------------------------------------------------------ motion: transfer / swap / style
  function toMotion(c, url) {
    setChar({ url: url, name: c.name || "Influencer", infId: realId(c.id), t: c.traits, tier: c.tier, crop: c.view === "card" ? "right" : (c.view === "sheet" ? "left" : "") });
    state.motionPick = url;
    setPane("motion");
    $("paneMotion").scrollTop = 0;
    if (window.matchMedia("(max-width: 720px)").matches) root.scrollIntoView({ behavior: "smooth" });
    mHint(state.m.video ? "Ready. Pick a style if you like, then Generate." : "Now add a reference video.");
    toast((c.name || "Your character") + " added to Motion");
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
    if ($("mCharClear")) { $("mCharClear").hidden = !ch; $("mCharSub").hidden = !ch; }
    $("mCharTag").hidden = !ch;
    $("mCharTag").textContent = ch ? (ch.name || "Character") : "";
    if (!quiet) syncMotionGo();
    paintFit();
  }

  function setVideo(f) {
    if (!/^video\//.test(f.type)) { mHint("That file isn't a video.", true); return; }
    if (f.size > 300 * 1024 * 1024) { mHint("That video is over 300 MB. Trim it first.", true); return; }
    clearVideo(true);
    if (!f.__preset) state.m.clip = null;
    paintFit();
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

  // ---- fit check: some characters don't fit onto another person's body (Objects swap)
  var ODD = {
    neck: { giraffe: "a very long neck", column: "a very thick neck" },
    headsize: { tiny: "a tiny head", big: "an oversized head" },
    head: { dome: "a cone-shaped head", megajaw: "a giant jaw", caveman: "a huge brow" },
    height: { vtall: "extreme height" },
    proportions: { longlimbs: "extra-long limbs", egg: "an egg-shaped body", shortlegs: "very short legs" },
    arms: { stick: "stick arms", heavy: "giant arms" },
    legs: { stick: "stick legs", stilts: "stilt legs" },
    build: { obese: "a very large build", ultra: "a giant build" },
    hair: { spiderlocs: "big sticking-out hair", horns: "big sculpted hair", beehive: "a towering hairdo", sphere: "a giant round hairdo",
      tufts: "big side puffs of hair", crescent: "big sculpted hair", lampshade: "a lampshade hairdo", flattop: "a tall flat-top" }
  };
  var ODD_TIERS = { cat: "a cat body", rodent: "an animal body", insect: "an insect body", frog: "a frog body" };
  function charFit(ch) {
    if (!ch || (!ch.t && !ch.tier)) return null;
    var why = [];
    if (ch.tier && ODD_TIERS[ch.tier]) why.push(ODD_TIERS[ch.tier]);
    Object.keys(ODD).forEach(function (g) { ((ch.t || {})[g] || []).forEach(function (o) { if (ODD[g][o]) why.push(ODD[g][o]); }); });
    return { odd: why.length > 0, why: why.slice(0, 2) };
  }
  function paintFit() {
    var el = $("mFit"); if (!el) return;
    var m = state.m, ch = m.char, f = charFit(ch), clip = m.clip || null, html = "", cls = "";
    var nm = esc((ch && ch.name) || "This character");
    if (ch && f && f.odd && m.mode === "swap") {
      cls = "is-warn";
      html = "<strong>Heads up:</strong> " + nm + " has " + esc(f.why.join(" and ")) + ". Objects swap fits the character onto the body of the person in the clip, so anything bigger or taller than a normal person can glitch, get cut off or float. " +
        '<button type="button" class="m-fit-btn" data-fitmode="motion">Use Motion transfer instead</button>';
    } else if (ch && f && f.odd) {
      cls = "is-ok";
      html = "<strong>Good choice:</strong> Motion transfer keeps " + nm + "'s own shape (" + esc(f.why.join(", ")) + ")" +
        (m.setting === "clip" ? " and rebuilds the clip's setting around them." : " and keeps the setting from their picture. Pick <em>Same as clip</em> under Setting to put them in the clip's location.");
    } else if (ch && f && m.mode === "swap") {
      cls = "is-ok";
      html = "<strong>Good match:</strong> " + nm + " has regular proportions, so they fit cleanly onto the person in the clip.";
    } else if (ch && !f) {
      cls = "is-tip";
      html = "<strong>Tip:</strong> use a photo that shows the whole body, facing the camera. If your character is unusually tall or has a long neck, tiny head or big hair, use Motion transfer: Objects swap squeezes them onto the body of the person in the clip.";
    }
    if (clip && clip.shots > 1) html += (html ? "<br>" : "") + '<span class="m-fit-shots">This clip has ' + clip.shots + " camera angles. Each shot is rendered on its own and joined back together, so it takes a little longer.</span>";
    el.className = "m-fit " + cls; el.innerHTML = html; el.hidden = !html;
  }

  function setMode(mode) {
    state.m.mode = mode;
    syncSeg("mModeSeg", "data-mode", mode);
    $("mModeNote").textContent = MODE_COPY[mode].note;
    $("mVideoHint").textContent = MODE_COPY[mode].hint;
    if ($("mVideoTitle")) $("mVideoTitle").innerHTML = MODE_COPY[mode].title;
    var sc = mode === "scene";
    $("mTargetField").hidden = mode !== "swap";
    if ($("mSettingRow")) $("mSettingRow").hidden = mode !== "motion";
    $("mSceneBox").hidden = !sc;
    document.querySelector("#paneMotion .m-slots").hidden = sc;
    ["mStyleBtn", "mPromptRow"].forEach(function (id) { if ($(id)) $(id).hidden = sc; });
    if (sc) { $("mPrompt").hidden = true; $("mFit").hidden = true; $("mPicker").hidden = true; loadSceneChars(); }
    else $("mPrompt").hidden = !state.m.usePrompt;
    savePrefs(); syncMotionGo(); paintFit();
  }

  function syncMotionGo() {
    var b = $("mGenerateBtn"), m = state.m;
    var label = !state.user ? "Log in to generate " : "Generate ";
    b.firstChild.nodeValue = label;
    b.classList.toggle("is-dim", !!state.user && (m.mode === "scene" ? !/@[A-Za-z]/.test(($("mScenePrompt") || {}).value || "") : !(m.video && m.char)));
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

  // ---- Scene mode: signature characters (@Name) put into any scene from a prompt.
  async function loadSceneChars() {
    var m = state.m, list = $("mSceneList");
    if (m.sceneChars) return paintSceneChars();
    try {
      var tok = state.user ? await freshToken() : null;
      var r = tok ? await fetch(RENDER() + "/my-characters", { headers: { Authorization: "Bearer " + tok } })
                  : await fetch(RENDER() + "/characters");
      var d = await r.json();
      m.sceneChars = (d && d.characters) || [];
    } catch (e) { m.sceneChars = null; list.innerHTML = '<small class="inf-note">The GPU server isn\'t reachable right now.</small>'; return; }
    paintSceneChars();
  }
  function paintSceneChars() {
    var list = $("mSceneList"), cs = state.m.sceneChars || [];
    if (!cs.length) { list.innerHTML = '<small class="inf-note">No characters yet.</small>'; return; }
    list.innerHTML = cs.map(function (c) {
      return '<button type="button" class="m-scene-chip" data-handle="' + esc(c.handle) + '">' +
        (c.thumb ? '<img alt="" src="' + esc(c.thumb.charAt(0) === "/" ? absUrl(c.thumb) : c.thumb) + '" />' : "") + "<span>@" + esc(c.handle) + "</span></button>";
    }).join("");
    Array.prototype.forEach.call(list.querySelectorAll(".m-scene-chip"), function (b) {
      b.addEventListener("click", function () {
        var ta = $("mScenePrompt"), tag = "@" + b.getAttribute("data-handle");
        if (ta.value.indexOf(tag) < 0) {
          var s = ta.selectionStart != null ? ta.selectionStart : ta.value.length;
          var pre = ta.value.slice(0, s), post = ta.value.slice(s);
          ta.value = pre + (pre && !/\s$/.test(pre) ? " " : "") + tag + " " + post;
        }
        ta.focus(); syncMotionGo();
      });
    });
  }
  async function onSceneGenerate() {
    var m = state.m, prompt = $("mScenePrompt").value.trim();
    var cs = m.sceneChars || [];
    var used = cs.filter(function (c) { return new RegExp("@" + c.handle + "\\b", "i").test(prompt); });
    if (!used.length) { mHint(cs.length ? "Bring a character in with @, e.g. @" + cs[0].handle + "." : "Mention a signature character with @.", true); return; }
    var token = await freshToken();
    if (!token) { mHint("Your session expired. Log in again.", true); return; }
    var btn = $("mGenerateBtn"); btn.disabled = true; mHint("Sending…");
    var vid = null;
    try {
      var fd = new FormData();
      fd.append("prompt", prompt); fd.append("shots", String(m.shots)); fd.append("length", String(m.len));
      fd.append("res", m.res); fd.append("orientation", m.shape);
      vid = { id: "tmp-" + Date.now(), mode: "character_scene", prompt: prompt, status: "queued", pending: true, progress: 2,
        stage: "Sending to the GPU…", created_at: new Date().toISOString(), meta: { res: m.res, length_secs: m.len, shots: m.shots },
        thumb: used[0].thumb || "", portrait: m.shape !== "landscape" };
      state.vids.unshift(vid); setStage("videos");
      var r = await fetch(RENDER() + "/scene-jobs", { method: "POST", headers: { Authorization: "Bearer " + token }, body: fd });
      var d = await r.json().catch(function () { return {}; });
      if (!r.ok) throw new Error(d.detail || ("HTTP " + r.status));
      vid.id = d.job_id; vid.stage = "Queued"; renderVideos(); pollVideo(vid, 0);
      mHint("Sent. Your video shows up on the right when it's done.");
    } catch (e) {
      if (vid) { state.vids = state.vids.filter(function (x) { return x !== vid; }); renderVideos(); }
      mHint(/Failed to fetch|NetworkError|HTTP 5/.test(e.message) ? "The GPU server isn't reachable right now. Check System status, then try again." : e.message, true);
    } finally { btn.disabled = false; }
  }

  async function onMotionGenerate() {
    var m = state.m;
    if (!state.user) { window.location.href = "auth.html"; return; }
    if (m.mode === "scene") return onSceneGenerate();
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
      else fd.append("setting", m.setting === "clip" ? "clip" : "own");
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
    var kind = v.mode === "character_scene" ? "Scene" + (meta.shots > 1 ? " · " + meta.shots + " angles" : "") : v.mode === "character_swap" ? "Character swap" : v.mode === "upscale_1080" ? "1080p upscale" : "Motion transfer";
    return [kind, st].filter(Boolean).join(" · ");
  }

  function renderVideos() {
    var wall = $("vidWall");
    if (!wall) return;
    $("vidCount").textContent = state.vids.length ? String(state.vids.length) : "";
    $("vidEmpty").hidden = !(state.user && !state.vids.length) || (state.histF || "all") === "all";
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
    if ($("mSetSeg")) segWire("mSetSeg", "data-set", function (v) { state.m.setting = v === "clip" ? "clip" : "own"; paintFit(); });
    segWire("mLenSeg", "data-len", function (v) { state.m.len = Number(v); savePrefs(); paintVideoTag(); });
    segWire("mResSeg", "data-res", function (v) { state.m.res = v; savePrefs(); });
    segWire("mShotsSeg", "data-shots", function (v) { state.m.shots = Number(v) || 1; });
    segWire("mShapeSeg", "data-shape", function (v) { state.m.shape = v === "landscape" ? "landscape" : "portrait"; });
    $("mScenePrompt").addEventListener("input", syncMotionGo);
    syncSeg("mLenSeg", "data-len", String(state.m.len));
    syncSeg("mResSeg", "data-res", state.m.res);
    setMode(state.m.mode);

    var vin = $("mVideoInput"), vdrop = $("mVideoDrop");
    vin.addEventListener("change", function () { if (vin.files && vin.files[0]) setVideo(vin.files[0]); });
    ["dragenter", "dragover"].forEach(function (ev) { vdrop.addEventListener(ev, function (e) { e.preventDefault(); vdrop.classList.add("is-over"); }); });
    ["dragleave", "drop"].forEach(function (ev) { vdrop.addEventListener(ev, function () { vdrop.classList.remove("is-over"); }); });
    vdrop.addEventListener("drop", function (e) { e.preventDefault(); var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) setVideo(f); });
    $("mVideoClear").addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); clearVideo(); });

    // Character slot: drag & drop (image files, or an influencer card dragged from the wall / History), click to pick.
    var cslot = $("mCharSlot");
    cslot.addEventListener("click", function (e) { if (e.target.closest("#mCharClear")) return; $("mPicker").hidden = !$("mPicker").hidden; renderMotionPick(); });
    cslot.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); cslot.click(); } });
    ["dragenter", "dragover"].forEach(function (ev) { cslot.addEventListener(ev, function (e) { e.preventDefault(); cslot.classList.add("is-over"); }); });
    ["dragleave", "drop"].forEach(function (ev) { cslot.addEventListener(ev, function () { cslot.classList.remove("is-over"); }); });
    cslot.addEventListener("drop", function (e) {
      e.preventDefault();
      var dt = e.dataTransfer; if (!dt) return;
      var raw = ""; try { raw = dt.getData("application/x-airh-char"); } catch (er) {}
      if (raw) { try { var ch = JSON.parse(raw); setChar(ch); $("mPicker").hidden = true; toast((ch.name || "Character") + " added to Motion"); } catch (er) {} return; }
      var f = dt.files && dt.files[0];
      if (f && /^image\//.test(f.type)) { setChar({ blob: f, url: URL.createObjectURL(f), name: "Your photo", infId: null }); $("mPicker").hidden = true; return; }
      if (f) mHint("Drop an image (PNG or JPG) of your character.", true);
    });
    $("mCharClear").addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); setChar(null); renderMotionPick(); });
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
    if ($("mFit")) $("mFit").addEventListener("click", function (e) { var b = e.target.closest("[data-fitmode]"); if (b) { setMode(b.getAttribute("data-fitmode")); toast("Switched to Motion transfer"); } });
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
  var toastT;
  function toast(msg) {
    var t = $("infToast"); if (!t) return;
    $("infToastTxt").textContent = msg; t.hidden = false;
    t.classList.remove("is-in"); void t.offsetWidth; t.classList.add("is-in");
    clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, 3200);
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
  function savePrefs() { try { localStorage.setItem(PREFS_KEY, JSON.stringify({ v2: 1, view: state.view, engine: state.engine, batch: state.batch, mMode: state.m.mode, mRes: state.m.res, mLen: state.m.len })); } catch (e) {} }
  function realId(id) { return id && String(id).indexOf("tmp-") !== 0 ? String(id) : null; }
})();

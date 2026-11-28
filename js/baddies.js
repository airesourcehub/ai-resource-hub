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

  // Male Baddies: the same sliders, worded for a man (Bust becomes Chest)
  var SHAPE_M = {
    waist: ["a natural waist", "a trim waist", "a narrow, trim waist", "a very narrow V-taper waist", "an extreme V-taper waist"],
    hips: ["narrow hips", "average hips", "solid hips", "wide hips", "very wide hips"],
    glutes: ["a flat rear", "an athletic rear", "muscular glutes", "big muscular glutes", "very big, muscular glutes"],
    thighs: ["slim legs", "athletic legs", "thick muscular thighs", "very thick, muscular thighs", "massive bodybuilder thighs"],
    bust: ["a lean chest", "a fit chest", "a defined chest", "a broad muscular chest", "a huge, powerful chest"],
    tone: ["a soft build", "a lean build", "an athletic build", "a muscular, ripped build", "a huge, shredded bodybuilder build"]
  };
  function isMale() { return state.gender === "male"; }
  // Every prompt is written for a woman; for a male Baddie the words are swapped on the way to the GPU.
  function genderize(t) {
    if (!t || !isMale()) return t;
    var NOT_POSS = /^(and|or|to|in|at|from|with|by|on|off|the|a|an|as|so|but|is|was|into|onto|over|out|up|down|for|of|like|than)$/i;
    return t.replace(/\bwomen\b/g, "men").replace(/\bWomen\b/g, "Men").replace(/\bwoman\b/g, "man").replace(/\bWoman\b/g, "Man").replace(/\bWOMAN\b/g, "MAN")
      .replace(/\bfemale\b/g, "male").replace(/\bFemale\b/g, "Male").replace(/\bgirl\b/g, "guy")
      .replace(/\bherself\b/g, "himself").replace(/\bhers\b/g, "his").replace(/\bshe\b/g, "he").replace(/\bShe\b/g, "He")
      .replace(/\b([Hh])er\b(\s*)([\w-]+)?/g, function (m, h, sp, w) { var his = h === "H" ? "His" : "his", him = h === "H" ? "Him" : "him"; return (w && !NOT_POSS.test(w) ? his : him) + sp + (w || ""); })
      .replace(/\bstunning adult man\b/g, "handsome adult man").replace(/\bhourglass\b/g, "V-shaped");
  }
  // One-tap body types. g = gender, h = height in inches (optional), x = extra body words for the prompt (optional).
  var BODY_PRESETS = [
    { g: "female", id: "ref", label: "Signature", v: { waist: 9, hips: 9, glutes: 10, thighs: 9, bust: 5, tone: 3 }, exag: 80 },
    { g: "female", id: "slimthick", label: "Slim thick", v: { waist: 8, hips: 7, glutes: 7, thighs: 7, bust: 5, tone: 4 }, exag: 60 },
    { g: "female", id: "petite", label: "Petite curvy", v: { waist: 7, hips: 6, glutes: 7, thighs: 6, bust: 4, tone: 3 }, exag: 50, h: 59 },
    { g: "female", id: "athletic", label: "Athletic", v: { waist: 7, hips: 6, glutes: 7, thighs: 7, bust: 4, tone: 8 }, exag: 45 },
    { g: "female", id: "max", label: "Max curves", v: { waist: 10, hips: 10, glutes: 10, thighs: 10, bust: 6, tone: 2 }, exag: 100 },
    { g: "female", id: "maxbust", label: "Max curves + max bust", v: { waist: 10, hips: 10, glutes: 10, thighs: 10, bust: 10, tone: 2 }, exag: 100, x: "a very large, full bust" },
    { g: "female", id: "maxflat", label: "Max curves, small bust", v: { waist: 10, hips: 10, glutes: 10, thighs: 10, bust: 0, tone: 2 }, exag: 100, x: "a small, flat bust" },
    { g: "female", id: "petitemax", label: "Petite max curves", v: { waist: 10, hips: 10, glutes: 10, thighs: 9, bust: 4, tone: 2 }, exag: 95, h: 58 },
    { g: "female", id: "bbl", label: "BBL", v: { waist: 10, hips: 9, glutes: 10, thighs: 7, bust: 6, tone: 3 }, exag: 90, x: "a sculpted BBL-style figure, very round lifted rear and tiny waist" },
    { g: "female", id: "pear", label: "Pear shape", v: { waist: 7, hips: 10, glutes: 9, thighs: 9, bust: 2, tone: 3 }, exag: 70 },
    { g: "female", id: "busty", label: "Busty slim", v: { waist: 8, hips: 5, glutes: 5, thighs: 5, bust: 10, tone: 4 }, exag: 50 },
    { g: "female", id: "fitness", label: "Fitness model", v: { waist: 8, hips: 6, glutes: 8, thighs: 7, bust: 5, tone: 9 }, exag: 45, x: "visible toned abs" },
    { g: "female", id: "amazon", label: "Tall Amazon", v: { waist: 7, hips: 7, glutes: 7, thighs: 8, bust: 6, tone: 8 }, exag: 55, h: 74, x: "a tall, strong, statuesque frame" },
    { g: "female", id: "plus", label: "Thick / plus", v: { waist: 3, hips: 9, glutes: 9, thighs: 10, bust: 8, tone: 1 }, exag: 60, x: "a soft, thick plus-size figure" },
    { g: "female", id: "runway", label: "Runway slim", v: { waist: 7, hips: 3, glutes: 3, thighs: 2, bust: 3, tone: 5 }, exag: 15, h: 70, x: "a slim, long-legged model figure" },
    { g: "female", id: "natural", label: "Natural", v: { waist: 5, hips: 5, glutes: 5, thighs: 5, bust: 5, tone: 4 }, exag: 10 },
    { g: "male", id: "m_sixpack", label: "Athletic six-pack", v: { waist: 8, hips: 4, glutes: 5, thighs: 5, bust: 6, tone: 8 }, exag: 40, h: 70, x: "a lean athletic build with a clearly defined six-pack" },
    { g: "male", id: "m_muscle", label: "Fully muscular", v: { waist: 7, hips: 5, glutes: 7, thighs: 8, bust: 9, tone: 10 }, exag: 75, h: 71, x: "muscular all over: big chest, shoulders and arms, strong legs" },
    { g: "male", id: "m_skinnylegs", label: "Big upper, skinny legs", v: { waist: 8, hips: 3, glutes: 3, thighs: 1, bust: 10, tone: 9 }, exag: 70, h: 70, x: "a massive muscular upper body (chest, shoulders, arms) on noticeably skinny legs" },
    { g: "male", id: "m_thicklegs", label: "Thick legs, full upper", v: { waist: 6, hips: 6, glutes: 8, thighs: 10, bust: 10, tone: 9 }, exag: 80, h: 71, x: "a full muscular upper torso and very thick, powerful legs" },
    { g: "male", id: "m_swimmer", label: "Swimmer V-taper", v: { waist: 9, hips: 3, glutes: 4, thighs: 4, bust: 7, tone: 7 }, exag: 55, h: 74, x: "a swimmer's build: wide shoulders, long torso, narrow hips" },
    { g: "male", id: "m_superhero", label: "Superhero", v: { waist: 10, hips: 4, glutes: 7, thighs: 8, bust: 10, tone: 10 }, exag: 100, h: 75, x: "a heroic comic-book physique, huge shoulders and chest, tiny waist" },
    { g: "male", id: "m_bodybuilder", label: "Bodybuilder", v: { waist: 6, hips: 6, glutes: 9, thighs: 10, bust: 10, tone: 10 }, exag: 100, h: 70, x: "a competition bodybuilder, huge and shredded with visible veins" },
    { g: "male", id: "m_lean", label: "Lean / slim", v: { waist: 6, hips: 3, glutes: 3, thighs: 3, bust: 3, tone: 5 }, exag: 10, h: 70 },
    { g: "male", id: "m_runner", label: "Runner", v: { waist: 7, hips: 3, glutes: 5, thighs: 5, bust: 3, tone: 8 }, exag: 20, h: 69, x: "a lean distance-runner build" },
    { g: "male", id: "m_bigstrong", label: "Big & strong", v: { waist: 3, hips: 7, glutes: 7, thighs: 9, bust: 9, tone: 5 }, exag: 50, h: 75, x: "a big, heavy, powerful frame" },
    { g: "male", id: "m_dadbod", label: "Dad bod", v: { waist: 2, hips: 6, glutes: 5, thighs: 6, bust: 5, tone: 1 }, exag: 10, h: 70, x: "a relaxed dad bod with a soft belly" },
    { g: "male", id: "m_short", label: "Short & stocky", v: { waist: 5, hips: 6, glutes: 7, thighs: 8, bust: 8, tone: 7 }, exag: 45, h: 64, x: "a short, stocky, muscular frame" }
  ];
  function activePreset() {
    return BODY_PRESETS.filter(function (p) { return p.g === (state.gender || "female") && p.exag === state.exag && SHAPE.every(function (s) { return p.v[s.id] === state.shape[s.id]; }); })[0] || null;
  }

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
      ["spike", "Bun + spike ponytail", "slicked-back hair in a sleek round low bun, with one long, thick, rigid, glossy tube of hair jutting out of the back of her head diagonally up and backward like a horn, not hanging down, edges slicked down"],
      ["bob", "Sleek bob", "a sleek chin-length bob"],
      ["pixie", "Pixie cut", "a short pixie cut"],
      ["afro", "Afro", "a big round natural afro"],
      ["locs", "Short locs", "shoulder-length dreadlocks (locs)"],
      ["manbun", "Top knot", "hair pulled up into a high top-knot bun with short sides"],
      ["cornrows", "Cornrows", "neat straight-back cornrows braided close to the scalp"],
      ["waves", "360 waves", "a short 360 waves haircut with deep spinning waves and a sharp line-up"],
      ["hightop", "High-top fade", "a tall flat-top high-top fade, the sides faded down to the skin"],
      ["mohawk_low", "Low mohawk", "a short low mohawk (faux hawk): a short strip of hair down the middle, the sides shaved"],
      ["mohawk_tall", "Tall mohawk", "a tall spiked punk mohawk standing straight up, the sides completely shaved"],
      ["fade", "Low fade", "a short haircut with a clean low skin fade on the sides and back and a little length on top"],
      ["buzz", "Buzz cut", "a very short buzz cut, hair clipped close to the scalp"],
      ["bald", "Bald", "a smooth, completely bald shaved head"],
      ["own", "Their own hair", ""]] },
    { id: "haircolor", label: "Hair color", opts: [
      ["black", "Jet black", "jet black"], ["brown", "Dark brown", "dark brown"], ["honey", "Honey blonde", "honey blonde"],
      ["platinum", "Platinum", "platinum blonde"], ["burgundy", "Burgundy", "deep burgundy"], ["copper", "Copper", "copper ginger"],
      ["pink", "Pink", "hot pink"], ["blue", "Icy blue", "icy blue"], ["own", "Their own color", ""]] },
    { id: "hairx", label: "Hair details", multi: 2, opts: [
      ["eye", "Over one eye", "a long side-swept fringe falling over one eye, partly covering it"],
      ["bangs", "Blunt bangs", "blunt straight-cut bangs"],
      ["edges", "Laid edges", "sleek laid baby hair edges"]] },
    { id: "makeup", label: "Makeup", opts: [
      ["natural", "Natural", "soft natural makeup"], ["glam", "Full glam", "full glam makeup with lashes and glossy lips"],
      ["bold", "Bold", "bold makeup with sharp winged liner and dark lips"]] },
    { id: "eyes", label: "Eyes", opts: [
      ["brown", "Brown", "brown eyes"], ["hazel", "Hazel", "hazel eyes"], ["green", "Green", "green eyes"], ["grey", "Grey", "grey eyes"], ["blue", "Blue", "blue eyes"]] },
    { id: "expr", label: "Expression", opts: [
      ["confident", "Confident", "a calm confident expression"], ["smirk", "Smirk", "a sly smirk"], ["fierce", "Fierce", "a fierce, focused stare"], ["smile", "Smile", "a soft smile"],
      ["pout", "Pout", "full lips in a pout"], ["surprised", "Surprised", "a surprised expression, eyebrows raised, lips slightly parted"],
      ["sultry", "Sultry", "a sultry look with heavy-lidded eyes and slightly parted lips"], ["wink", "Wink", "winking with one eye and a playful smile"],
      ["tongue", "Tongue out", "a playful expression with her tongue sticking out"], ["tonguewink", "Tongue + wink", "winking with her tongue sticking out playfully"],
      ["laugh", "Laughing", "laughing out loud, big open smile"], ["angry", "Angry", "an angry glare, brows furrowed, jaw clenched"],
      ["kiss", "Blowing a kiss", "puckered lips blowing a kiss"], ["bite", "Biting lip", "a flirty look biting her lower lip"],
      ["stern", "Stone cold", "a stone-cold serious expression, no smile"], ["shout", "Battle cry", "shouting a battle cry, mouth wide open, intense"]] }
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
      ["holster", "Thigh holster", "a drop-leg thigh holster"]] },
    { id: "eyewear", label: "Eyewear", opts: [
      ["none", "None", ""],
      ["wayfarer", "Wayfarers (Ray-Ban style)", "classic black Ray-Ban Wayfarer style sunglasses"],
      ["aviator", "Aviators", "gold aviator sunglasses with gradient lenses"],
      ["round", "Round shades", "round retro sunglasses with thin gold frames"],
      ["cateye", "Cat-eye", "glamorous black cat-eye sunglasses"],
      ["shield", "Wraparound shades", "sleek wraparound mirrored shield sunglasses"],
      ["smart", "Smart glasses (Meta Ray-Ban style)", "Ray-Ban Meta style smart glasses with a tiny camera in the frame"],
      ["vr", "VR headset", "a white virtual reality headset over her eyes, like a Meta Quest"],
      ["goggles", "Tactical goggles", "black tactical ballistic goggles over her eyes"],
      ["nvg", "Night-vision goggles", "military night vision goggles lowered over her eyes"]] },
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
      ["japanese", "Japanese", "colorful Japanese irezumi"], ["script", "Script & fine line", "fine-line script and ornamental"],
      ["tribal", "Tribal", "bold solid black Polynesian tribal"], ["comic", "Comic book", "comic book pop art with halftone dots and bold outlines"],
      ["traditional", "Old school", "American traditional with bold outlines and red, green and yellow"], ["geometric", "Geometric", "geometric dotwork and mandala"],
      ["floral", "Fine-line floral", "delicate fine-line floral"], ["biomech", "Biomechanical", "grey and blue biomechanical"],
      ["chicano", "Chicano", "chicano black and grey"], ["watercolor", "Watercolor", "soft watercolor splash"], ["anime", "Anime", "bright anime character"]] },
    { id: "jewelry", label: "Jewelry", multi: 3, opts: [
      ["hoops", "Gold hoops", "gold hoop earrings"], ["studs", "Diamond studs", "diamond stud earrings"],
      ["chain", "Gold chain", "a gold chain necklace"], ["tennis", "Tennis necklace", "a diamond tennis necklace"],
      ["dogtags", "Dog tags", "silver dog tags"], ["crystalband", "Crystal headband", "a sparkling crystal rhinestone headband across the top of her head"], ["nails", "Long nails", "long glossy nails"]] }
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
  // Poses (ids shared with js/baddies-3d.js POSE_PRESETS). Hands-busy poses sling the gun.
  var POSES = [
    ["hold", "Gun hold", ""],
    ["hips", "Hands on hips", "standing with both hands on her hips"],
    ["hippop", "Hip pop", "standing with a confident hip pop, one hip pushed out, hands on her hips"],
    ["lookback", "Looking back", "standing slightly turned away, looking back over her shoulder at the camera"],
    ["crossed", "Arms crossed", "standing with her arms crossed"],
    ["peace", "Peace sign", "throwing a peace sign near her face with one hand, the other hand on her hip"],
    ["walk", "Walking", "walking toward the camera mid-stride"],
    ["squat", "Squat", "in a low squat with her hands resting on her knees"],
    ["kneel", "Kneeling aim", "kneeling on one knee"],
    ["sit", "Sitting", "sitting down"],
    ["sitfloor", "Sit on floor", "sitting on the floor with her knees bent up in front of her"],
    ["sitcross", "Cross-legged", "sitting cross-legged on the floor"],
    ["allfours", "All fours", "on all fours on her hands and knees, looking ahead"],
    ["custom", "Custom (drag)", ""]
  ];
  // What she sits on (for "Sitting" and Custom). Heights live in js/baddies-3d.js SEATS.
  var SEATS = [
    ["none", "No seat", ""],
    ["chair", "Chair", "sitting on a simple black metal chair"],
    ["stool", "Stool", "sitting on a tall black bar stool, feet resting on the footrest"],
    ["crate", "Ammo crate", "sitting on an olive green military ammo crate"],
    ["steps", "Steps", "sitting on concrete steps"],
    ["floor", "Floor", "sitting on the floor"]
  ];
  function seatId() { var p = poseId(), s = state.pose && state.pose.seat; if (p === "sit") return s && s !== "none" ? s : "chair"; if (p === "custom") return s || "none"; return "none"; }
  var DUO = [
    ["side", "Side by side", "standing side by side, shoulder to shoulder, facing the camera"],
    ["arm", "Arm around", "standing close together, her arm around their shoulders, both facing the camera"],
    ["back", "Back to back", "standing back to back with arms crossed, both looking at the camera"],
    ["squad", "Squad pose", "posing together like a squad, confident, facing the camera"]
  ];
  // Body turn / torso twist / head / eyes (degrees; eyes -10..10). Positive = toward her own left.
  var LOOK_SLIDERS = [
    ["turn", "Body turn", -180, 180, 15, "Turn to her right", "Turn to her left"],
    ["twist", "Torso twist", -60, 60, 5, "To her right", "To her left"],
    ["lean", "Torso lean", -40, 40, 5, "Back", "Forward"],
    ["head", "Head turn", -85, 85, 5, "To her right", "To her left"],
    ["nod", "Head up / down", -35, 35, 5, "Down", "Up"],
    ["tilt", "Head tilt", -30, 30, 5, "Right", "Left"],
    ["eyeX", "Eyes left / right", -10, 10, 1, "Her right", "Her left"],
    ["eyeY", "Eyes up / down", -10, 10, 1, "Down", "Up"]
  ];
  var LOOK_PRESETS = [
    ["front", "Facing camera", { turn: 0, twist: 0, lean: 0, head: 0, nod: 0, tilt: 0, eyeX: 0, eyeY: 0 }],
    ["backR", "Look back over right shoulder", { turn: 160, twist: -50, head: -80, nod: 5, tilt: 0, eyeX: -5, eyeY: 0 }],
    ["backL", "Look back over left shoulder", { turn: -160, twist: 50, head: 80, nod: 5, tilt: 0, eyeX: 5, eyeY: 0 }],
    ["side", "Side profile", { turn: 90, twist: 0, head: 0, nod: 0, tilt: 0, eyeX: 0, eyeY: 0 }],
    ["threeq", "3/4 turn, eyes to camera", { turn: 35, twist: 0, head: -20, nod: 0, tilt: 5, eyeX: -5, eyeY: 0 }],
    ["away", "Looking away", { turn: 0, twist: 0, head: 70, nod: 10, tilt: 0, eyeX: 6, eyeY: 2 }]
  ];
  function lookOf() { var l = (state.pose && state.pose.look) || {}; return { turn: +l.turn || 0, twist: +l.twist || 0, lean: +l.lean || 0, head: +l.head || 0, nod: +l.nod || 0, tilt: +l.tilt || 0, eyeX: +l.eyeX || 0, eyeY: +l.eyeY || 0 }; }
  function norm180(a) { a = ((a + 180) % 360 + 360) % 360 - 180; return a; }
  // Words for the body turn, head and eyes (where she faces relative to the camera).
  function lookWords() {
    var L = lookOf(), out = [], t = norm180(L.turn), face = norm180(t + L.twist + L.head);
    var side = function (v) { return v > 0 ? "left" : "right"; };
    var away = Math.abs(t) > 110, sideways = !away && Math.abs(t) > 60, threeq = !away && !sideways && Math.abs(t) >= 20;
    if (state.view === "cam") { away = sideways = threeq = false; }
    if (away) out.push("turned away with her back to the camera");
    else if (sideways) out.push("turned sideways, her " + (t > 0 ? "right" : "left") + " side toward the camera");
    else if (threeq) out.push("body turned three-quarters, her " + (t > 0 ? "right" : "left") + " shoulder toward the camera");
    sideways = sideways || threeq;
    if (Math.abs(L.twist) >= 15) out.push("upper body twisted to her " + side(L.twist));
    if (L.lean >= 10) out.push("leaning forward"); else if (L.lean <= -10) out.push("leaning back");
    var headToCam = Math.abs(face) < 55;
    if (away && headToCam) out.push("looking back over her " + side(L.twist + L.head) + " shoulder at the camera");
    else if (sideways && headToCam && Math.abs(L.head) >= 15) out.push("head turned to look at the camera");
    else if (Math.abs(L.head) >= 15) out.push("head turned to her " + side(L.head) + (headToCam ? "" : ", looking away from the camera"));
    if (L.nod >= 10) out.push("chin raised, looking up"); else if (L.nod <= -10) out.push("head lowered, looking down");
    if (Math.abs(L.tilt) >= 10) out.push("head tilted to her " + side(L.tilt));
    var ex = L.eyeX, ey = L.eyeY, eyes = [];
    if (ex >= 4) eyes.push("to her left"); else if (ex <= -4) eyes.push("to her right");
    if (ey >= 4) eyes.push("up"); else if (ey <= -4) eyes.push("down");
    if (eyes.length) out.push("eyes glancing " + eyes.join(" and ") + (headToCam ? ", toward the camera" : ""));
    else if (headToCam && (away || sideways || Math.abs(L.head) >= 15)) out.push("eyes looking straight into the camera");
    return out.join(", ");
  }
  function poseId() { return (state.pose && state.pose.preset) || "hold"; }
  function handsBusy() { var p = poseId(); return p !== "hold" && p !== "kneel" && p !== "custom"; }
  // Exactly how she carries the gun, in words the image models follow (grip, which hand, muzzle and magazine direction).
  function holdExact(w) {
    w = w || fromList(WEAPONS, state.weapon);
    var pistol = w[3] === "pistol", h = state.hold;
    if (handsBusy()) return pistol
      ? "with the pistol holstered in a black thigh holster on her right thigh, grip up, and both of her hands free and not touching any gun"
      : "with the long gun slung on a tactical sling diagonally across her back, its stock behind one shoulder and its muzzle pointing down behind her opposite hip, both of her hands free and not holding any gun";
    if (pistol) {
      if (h === "shoulder") return "aiming the pistol forward at eye level in a firm two-handed grip: right hand wrapped high on the grip, left hand cupping it, both arms extended, index finger straight along the frame above the trigger guard, slide on top, muzzle pointing forward";
      if (h === "sling") return "with the pistol holstered in a black thigh holster on her right thigh, grip up";
      if (h === "side") return "holding the pistol in her right hand down along her right thigh, arm relaxed, muzzle pointing at the ground, index finger straight along the frame off the trigger";
      return "holding the pistol in both hands at a low ready in front of her waist: right hand on the grip, left hand supporting, muzzle angled down at the ground, index finger straight along the frame off the trigger";
    }
    if (h === "shoulder") return "aiming it: buttstock pressed into the pocket of her right shoulder, cheek resting on the stock, right hand on the pistol grip, left hand forward on the handguard, index finger straight along the side above the trigger guard, the gun right side up with the magazine pointing down, muzzle pointing forward";
    if (h === "sling") return "with the long gun slung on a tactical sling diagonally across her back, its stock behind one shoulder and its muzzle pointing down behind her opposite hip, both of her hands free";
    if (h === "side") return "carrying it at her right side: right hand wrapped around the pistol grip, arm relaxed, the gun hanging straight down along her right leg, stock up near her hip and muzzle pointing at the ground, right side up with the magazine facing forward, index finger straight off the trigger";
    return "holding it at low ready diagonally across the front of her body with both hands: right hand on the pistol grip, left hand on the handguard, buttstock tucked against her right hip, muzzle angled down toward the ground to her front left, the gun right side up with the magazine pointing down, index finger straight along the side off the trigger";
  }
  function poseWords() {
    var pid = poseId(), base = fromList(POSES, pid)[2], seat = seatId();
    if (seat !== "none") base = fromList(SEATS, seat)[2] + (pid === "sit" ? (seat === "stool" ? ", knees bent" : seat === "floor" ? "" : ", knees bent, feet on the ground") : "");
    return [base, lookWords()].filter(Boolean).join(", ");
  }
  var HOLDS = [
    ["low", "Low ready", "holding it at low ready across her body"],
    ["shoulder", "Shouldered", "holding it shouldered and aimed"],
    ["sling", "Slung", "with it slung across her back on a sling"],
    ["side", "At her side", "holding it relaxed down at her side"]
  ];

  // Picture size: Auto keeps each shot's own size; the others force the aspect ratio of every generated picture
  var ASPECTS = [["auto", "Auto", 0, 0], ["9x16", "9:16", 768, 1344], ["2x3", "2:3", 832, 1216], ["4x5", "4:5", 896, 1120],
    ["1x1", "1:1", 1024, 1024], ["3x2", "3:2", 1216, 832], ["16x9", "16:9", 1344, 768]];
  function aspectDims() { var a = fromList(ASPECTS, state.aspect || "auto"); return a && a[2] ? { w: a[2], h: a[3] } : null; }
  var VIEWS = {
    sheet: { label: "Turnaround", w: 1344, h: 768, lead: "Character turnaround reference sheet of", tail: "shown three times side by side as the exact same character on one sheet: front view, side profile view and back view, all full body head to toe with boots visible, identical outfit, tattoos, hair and weapon in every view" },
    full: { label: "Full body", w: 832, h: 1216, lead: "Full-body shot, head to toe, of", tail: "standing facing the camera, whole body in frame including boots" },
    back: { label: "Rear 3/4", w: 832, h: 1216, lead: "Full-body three-quarter rear view shot, head to toe, of", tail: "looking back over her shoulder at the camera, whole body in frame including boots" },
    action: { label: "Action pose", w: 832, h: 1216, lead: "Dynamic full-body action shot of", tail: "in a confident combat stance, whole body in frame" },
    portrait: { label: "Portrait", w: 896, h: 1152, lead: "Waist-up portrait of", tail: "looking into the camera" },
    cam: { label: "Viewer angle", w: 832, h: 1216, lead: "Photo of", tail: "" }   // filled in from the 3D viewer's camera (camShot)
  };
  // ---- "Viewer angle": the shot is taken from wherever the 3D viewer's camera is (height, side, distance, shape)
  function camShot() {
    var c = window.BADDIES_CAMERA ? window.BADDIES_CAMERA() : null;
    if (!c) return { w: 832, h: 1216, lead: "Full-body shot, head to toe, of", tail: "facing the camera" };
    var w = c.aspect < 0.85 ? 832 : c.aspect > 1.2 ? 1216 : 1024, h = c.aspect < 0.85 ? 1216 : c.aspect > 1.2 ? 832 : 1024;
    var lead = { full: "Full-body shot, head to toe including her boots, of", knees: "Three-quarter shot from the knees up of", waist: "Medium shot from the waist up of",
      chest: "Close-up from the chest up of", face: "Tight close-up portrait of the face of" }[c.frame];
    var words = [];
    if (c.camH > 1.15 || c.pitch <= -28) words.push(c.pitch <= -50 ? "steep high-angle shot from far above, the camera looking down on her, the ground all around her filling the background" : "high-angle shot from above, the camera looking down at her, the ground visible around her");
    else if (c.camH < 0.3 || c.pitch >= 18) words.push("low-angle hero shot from near the ground, the camera looking up at her, sky above her");
    else if (c.camH < 0.7) words.push("camera at waist height");
    else words.push("eye-level camera");
    var a = Math.abs(c.az), side = c.az > 0 ? "left" : "right";
    if (a < 22) words.push("she faces the camera");
    else if (a < 67) words.push("three-quarter view, her " + side + " side turned toward the camera");
    else if (a < 112) words.push("side profile view, her " + side + " side to the camera");
    else if (a < 157) words.push("three-quarter rear view from behind her " + side + " shoulder");
    else words.push("seen from directly behind, her back to the camera");
    if (c.dist < 1.1) words.push("shot close with a wide 28mm lens"); else if (c.dist > 4.5) words.push("shot from a distance with a long lens");
    return { w: w, h: h, lead: lead, tail: words.join(", "), info: c };
  }
  // ---- "Draw characters with": the photo (edit their picture) or one of their trained LoRAs (draw them from scratch)
  var LORA_MODES = [["photo", "Photo", "Edits their picture (works for everyone)"], ["zimage", "Z-Image LoRA", "Z-Image Turbo draws them from their trained LoRA"], ["flux2", "FLUX LoRA", "FLUX.2 Klein draws them from their trained LoRA"]];
  function loraMode() { return state.loraMode === "zimage" || state.loraMode === "flux2" ? state.loraMode : "photo"; }
  function hasLora(c, f) { return !!(c && c.handle && c.fams && c.fams.indexOf(f || loraMode()) >= 0); }
  function useLora(c) { return loraMode() !== "photo" && hasLora(c); }
  function loraModel() { return loraMode() === "zimage" ? "zimage" : "klein9b"; }
  function loraTag(c) { return "@" + c.handle + " " + (loraMode() === "zimage" ? "Z-Image" : "FLUX") + " LoRA"; }
  function camLock() { return state.view === "cam" && state.camlock !== "off"; }
  function camPrompt() {   // Klein edit: Picture 1 = the 3D view from the viewer camera, Picture 2 = the rendered character
    var V = camShot();
    return "Picture 1 is a 3D preview taken from the exact camera position to use. Picture 2 shows the real woman. Make a real photo of the woman from Picture 2 seen from exactly the camera angle, camera height, distance, lens and framing of Picture 1: " +
      V.tail + ". Her pose, body angle, arms, legs and head match the 3D figure in Picture 1, and the background scene sits the same way it does in Picture 1. " +
      "Copy her exact appearance from Picture 2: same face, age, skin color, hair, body proportions, outfit, tattoos, jewelry, boots and weapon. Rendered with full real detail (real skin, fabric and metal), not a 3D preview. " +
      fromList(BGS, state.bg)[2] + ". " + fromList(STYLES, state.style)[2] + ".";
  }
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
    ["desert", "Desert dunes", "endless golden sand dunes in the desert at sunset, warm orange glowing sky background"],
    ["miami", "Miami Beach", "Ocean Drive in Miami Beach at golden hour with pastel art deco hotels and palm trees background"],
    ["snow", "Snowy base", "a snowy mountain military base with wooden cabins and pine trees background"],
    ["jungle", "Jungle", "a dense tropical jungle clearing background"],
    ["christmas", "Christmas", "a snowy town square on Christmas Eve with a giant lit Christmas tree, garlands and string lights background"],
    ["halloween", "Horror Nights", "a terrifying Halloween Horror Nights style horror theme park scare zone at night, thick fog lit by blood-red and green lights, menacing haunted house facades, creepy carnival props and masked scare actors in the fog background"],
    ["newyear", "New Year's Eve", "a luxury city rooftop on New Year's Eve with gold balloons and fireworks over the skyline background"],
    ["valentine", "Valentine's Day", "a romantic Valentine's Day garden terrace with a red rose arch, rose petals and heart string lights background"],
    ["july4", "4th of July", "a Fourth of July night on a Miami beach with American flags and red, white and blue fireworks over the ocean background"],
    ["brickellam", "Brickell morning", "a selfie-style photo taken at arm's length while she walks down a palm-lined sidewalk in Brickell, Miami in the soft golden early morning, glass high-rise towers behind her"],
    ["brickell", "Brickell day", "a selfie-style photo taken at arm's length while she walks down a palm-lined sidewalk in Brickell, Miami on a bright sunny day, gleaming glass skyscrapers behind her"],
    ["brickellpm", "Brickell night", "a selfie-style photo taken at arm's length while she walks down a sidewalk in Brickell, Miami at night, glowing skyscrapers, colorful tower lights and street lamps behind her"],
    ["ultra", "Ultra Music Festival", "Ultra Music Festival at Bayfront Park in Miami at night: a huge main stage with giant LED screens, lasers and pyrotechnics, a dancing crowd and the downtown Miami skyline behind her"],
    ["timessquare", "Times Square", "Times Square in New York City at night, towering skyscrapers covered in giant glowing LED billboards, yellow taxis and city crowds background"],
    ["pyramids", "Pyramids of Giza", "the Great Pyramids of Giza and the Sphinx in Egypt at golden hour, endless desert and warm golden light background"],
    ["santamonica", "Santa Monica Pier", "the beach beside the Santa Monica Pier in California at sunset, the lit Ferris wheel and roller coaster over the Pacific Ocean, palm trees and the Malibu hills background"],
    ["vegas", "Las Vegas Strip", "the Las Vegas Strip at night, huge glowing neon casino resorts, giant lit hotel towers, dancing fountains and palm trees background"],
    ["niagara", "Niagara Falls", "the viewing deck at the edge of Niagara Falls, the massive Horseshoe Falls thundering behind her with huge clouds of mist and a rainbow background"],
    ["burj", "Burj Khalifa", "downtown Dubai at blue hour beside the Dubai Fountain, the Burj Khalifa towering into the sky lit up, glittering skyscrapers reflected in the fountain lake background"],
    ["eiffel", "Eiffel Tower", "the Trocadero plaza in Paris at night, the Eiffel Tower glowing golden and sparkling across the Seine, classic Parisian buildings and street lamps background"],
    ["liberty", "Statue of Liberty", "Liberty Island in New York Harbor on a bright sunny day, the Statue of Liberty towering behind her, the Manhattan skyline across the water background"],
    ["vizcaya", "Vizcaya Miami", "Vizcaya Museum and Gardens in Miami at golden hour, the grand Italian Renaissance villa, formal gardens, fountains, statues and stone balustrades by Biscayne Bay background"],
    ["frenchmans", "Frenchman's Cove", "Frenchman's Cove in Portland, Jamaica on a sunny day, a secluded cove with bright turquoise water, white sand and lush green jungle cliffs background"],
    ["bamboo", "Jamaica bamboo rafting", "standing on a long bamboo raft on the emerald Rio Grande river in Portland, Jamaica, lush tropical rainforest and bamboo groves on both banks background"],
    ["chinasnow", "Ancient China in snow", "an ancient Chinese city on a snowy winter night, traditional buildings with snow-covered curved tiled roofs, glowing red lanterns, warm lit windows, a pagoda and gentle snowfall background"],
    ["southbeach", "South Beach", "the wide white sand of South Beach in Miami on a bright sunny afternoon, turquoise ocean, colorful lifeguard towers, palm trees and the art deco hotels of Ocean Drive background"],
    ["hawaii", "Waikiki, Hawaii", "Waikiki Beach in Honolulu, Hawaii on a sunny day, golden sand, clear turquoise Pacific waves with surfers, Diamond Head crater and tall palm trees background"],
    ["malibu", "Malibu sunset", "a Malibu, California beach at sunset, the Pacific Ocean under a glowing orange and pink sky, the pier, coastal hills and beach houses background"],
    ["everest", "Mount Everest summit", "standing on the snowy summit of Mount Everest at sunrise, jagged Himalaya peaks and a sea of clouds far below her, deep blue sky background"],
    ["overlook", "Alps mountaintop", "standing on a rocky mountaintop in the Swiss Alps at golden hour, a green valley with a charming alpine village, river and waterfalls far below her, snowy peaks around background"],
    ["nyroof", "NYC skyscraper rooftop", "standing on the roof of a skyscraper in Midtown Manhattan at night, the Empire State Building glowing nearby and the glittering New York City skyline far below and all around background"],
    ["antdubai", "Burj Khalifa spire", "standing on the tiny top of the Burj Khalifa spire in Dubai at sunset, more than 800 meters up, the whole city, desert and Persian Gulf far below her, a daring rooftopper selfie background"],
    ["anttokyo", "Tokyo Skytree antenna", "standing on the tiny top of the Tokyo Skytree antenna at dusk, more than 600 meters up, the endless lights of Tokyo far below her and Mount Fuji on the horizon, a daring rooftopper selfie background"],
    ["antshanghai", "Shanghai Tower top", "standing on the tiny top of the Shanghai Tower at blue hour, more than 600 meters up, the glowing Lujiazui skyline and Huangpu River far below her, a daring rooftopper selfie background"],
    ["wing777", "777 wingtip", "standing on the wingtip of a Boeing 777 airliner at cruising altitude at sunset, the white wing and engine beside her, a sea of clouds far below and a glowing orange and pink sky background"],
    ["sigbridge", "Miami Signature Bridge", "standing high in the air on top of the curved white crown of the tallest arch of Miami's I-395 Signature Bridge at dusk, about 100 meters above the highway: under her boots is only the narrow rounded white top of the arch, no road, deck, ledge or railing at her level. The arch curves down and away behind her toward the downtown Miami and Brickell skyline, the bridge's other white arches with cyan blue lights and their fanning white cables are below her, the highway with red and white car light trails is far, far below, Biscayne Bay and an orange and pink sunset sky, a daring rooftopper-style aerial photo"],
    ["mars", "Mars", "standing on the surface of Mars, rust red dust and rocks, red mountains and a huge crater rim on the horizon, hazy butterscotch sky background"],
    ["moon", "The Moon", "standing on the surface of the Moon, grey lunar dust and craters, a black starry sky with the blue Earth above the horizon, a lunar lander in the distance background"],
  ];

  var NEGATIVE = "child, minor, teen, young-looking, childlike body, nude, nudity, topless, nipples, genitals, nsfw, explicit, " +
    "white ink tattoo, white tattoos, fake gun, toy gun, made-up gun, deformed gun, extra barrels, mangled weapon, gun held upside down, backwards gun, magazine on top, finger on the trigger, two guns, gun fused with body, " +
    "extra limbs, extra fingers, deformed hands, bad anatomy, blurry, watermark, text, logo, cropped head, cropped feet";

  var DEFAULTS = {
    skin: "caramel", height: CFG.heightDefault, exag: CFG.exagDefault,
    shape: { waist: 9, hips: 9, glutes: 10, thighs: 9, bust: 5, tone: 3 },
    pick: { hair: ["straight"], haircolor: ["black"], makeup: ["glam"], eyes: ["brown"], expr: ["confident"],
      camo: ["snow"], top: ["puffer"], bottom: ["bodysuit"], gear: ["vest", "gloves"], eyewear: ["none"], boots: ["white"],
      tattoos: ["legs"], inkstyle: ["color"], jewelry: ["studs"] },
    weapon: "ak47", hold: "low", camlock: "on", aspect: "auto", gender: "female", view: CFG.view in VIEWS ? CFG.view : "sheet", style: "game", bg: "white",
    pose: { preset: "hold", custom: null, match: false, look: { turn: 0, twist: 0, head: 0, nod: 0, tilt: 0, eyeX: 0, eyeY: 0 } }, duo: "side"
  };

  // ------------------------------------------------------------ state
  var prefs = loadPrefs();
  var state = clone(DEFAULTS);
  // 2026-11-23: FLUX 3 Klein became the default create model (it follows poses far better than Z-Image Turbo)
  // 2026-11-23: Christopher picked Z-Image Turbo as the default after the model comparison
  state.engine = prefs.engine && prefs.engineV === 3 ? prefs.engine : (CFG.engine || "zimage");
  state.editEngine = prefs.editEngine || "klein9b_edit";
  state.batch = clampN(prefs.batch || 1, 1, CFG.maxBatch || 4);
  if (prefs.last) applySettings(prefs.last, true);
  state.user = null; state.mine = []; state.offset = 0;
  state.chars = []; state.char = (prefs.last && prefs.last.char) || null; state["with"] = (prefs.last && prefs.last["with"]) || null;
  if (!state.pose) state.pose = clone(DEFAULTS.pose);

  var hasSb = !!(window.supabase && typeof SUPABASE_URL !== "undefined");
  var client = hasSb ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

  // ------------------------------------------------------------ render the panel
  function renderPanel() {
    $("bdBodyPresets").innerHTML = BODY_PRESETS.map(function (p) { return '<button type="button" data-bp="' + p.id + '" data-bg="' + p.g + '">' + esc(p.label) + "</button>"; }).join("");
    $("bdSkin").innerHTML = SKIN.map(function (s) {
      return '<button type="button" role="radio" data-skin="' + s[0] + '" title="' + esc(s[1]) + '" aria-label="' + esc(s[1]) + '" style="--sw:' + s[2] + '"></button>';
    }).join("");
    var hmin = clampN(CFG.heightMin, 36, 83), hmax = clampN(CFG.heightMax, hmin + 1, 84);
    $("bdHeight").min = hmin; $("bdHeight").max = hmax;
    $("bdHeightMin").textContent = ftIn(hmin); $("bdHeightMax").textContent = ftIn(hmax);
    $("bdGender").innerHTML = '<button type="button" data-gender="female">Female</button><button type="button" data-gender="male">Male</button>';
    $("bdGender").addEventListener("click", function (e) {
      var b = e.target.closest("[data-gender]"); if (!b) return;
      var g = b.getAttribute("data-gender"); if (g === (state.gender || "female")) return;
      var was = activePreset(); state.gender = g;
      if (was) {   // was on a body type: switch to the matching first body type for the new gender
        var p = BODY_PRESETS.filter(function (x) { return x.g === g; })[0]; state.shape = clone(p.v); state.exag = p.exag; if (p.h) state.height = p.h;
      }
      sync();
    });
    $("bdShape").innerHTML = SHAPE.map(function (s) {
      return '<div class="bd-slider bd-slider-sm"><div class="bd-row-lbl"><label for="bdS_' + s.id + '">' + s.label + '</label><b data-sv="' + s.id + '"></b></div>' +
        '<input type="range" id="bdS_' + s.id + '" data-shape="' + s.id + '" min="0" max="10" step="1" />' +
        '<div class="bd-scale"><span>' + s.lo + "</span><span>" + s.hi + "</span></div></div>";
    }).join("");
    $("bdLook").innerHTML = LOOK.map(groupHtml).join("");
    $("bdGear").innerHTML = GEAR.map(groupHtml).join("");
    $("bdInk").innerHTML = INK.map(groupHtml).join("");
    $("bdWeapon").innerHTML = chipRow("weapon", "Model", WEAPONS) + chipRow("hold", "How she holds it", HOLDS);
    $("bdPose").innerHTML = '<div class="bd-group"><div class="bd-chips">' + POSES.map(function (o) { return '<button type="button" data-pose="' + o[0] + '">' + esc(o[1]) + "</button>"; }).join("") + "</div></div>" +
      '<div class="bd-group" id="bdSeatG"><div class="bd-row-lbl"><span>Sitting on</span></div><div class="bd-chips">' +
        SEATS.map(function (o) { return '<button type="button" data-seat="' + o[0] + '">' + esc(o[1]) + "</button>"; }).join("") + "</div></div>" +
      '<div class="bd-group"><div class="bd-row-lbl"><span>Body, head &amp; eyes</span></div><div class="bd-chips">' +
        LOOK_PRESETS.map(function (o) { return '<button type="button" data-lookp="' + o[0] + '">' + esc(o[1]) + "</button>"; }).join("") + "</div></div>" +
      LOOK_SLIDERS.map(function (x) {
        return '<div class="bd-slider bd-slider-sm"><div class="bd-row-lbl"><label for="bdL_' + x[0] + '">' + x[1] + '</label><b data-lv="' + x[0] + '"></b></div>' +
          '<input type="range" id="bdL_' + x[0] + '" data-look-k="' + x[0] + '" min="' + x[2] + '" max="' + x[3] + '" step="' + x[4] + '" />' +
          '<div class="bd-scale"><span>' + x[5] + "</span><span>" + x[6] + "</span></div></div>";
      }).join("") +
      '<label class="bd-toggle"><input type="checkbox" id="bdPoseMatch" /> <span>Match my 3D pose exactly in the AI render</span></label>';
    $("bdDuo").innerHTML = '<p class="bd-note" id="bdWoNote"></p>' +
      WITH_OPTS.map(function (w) { return '<div class="bd-group"><div class="bd-row-lbl"><span><b class="bd-wo-who"></b> ' + esc(w[1].replace(/^Their /, "")) + '</span></div><div class="bd-chips">' +
        w[2].map(function (o) { return '<button type="button" data-wo="' + w[0] + '" data-v="' + o[0] + '">' + esc(o[1]) + "</button>"; }).join("") + "</div></div>"; }).join("") +
      '<div class="bd-group"><div class="bd-row-lbl"><span>How they pose together</span></div><div class="bd-chips">' + DUO.map(function (o) { return '<button type="button" data-duo="' + o[0] + '">' + esc(o[1]) + "</button>"; }).join("") + "</div></div>";
    $("bdScene").innerHTML = chipRow("view", "Shot", Object.keys(VIEWS).map(function (k) { return [k, VIEWS[k].label]; })) +
      '<div class="bd-camlock">' + chipRow("camlock", "Viewer angle: match it", [["on", "Exactly (3D picture)"], ["off", "Words only (faster)"]]) +
      '<p class="bd-note">Frame her in the 3D viewer (drag, scroll, or High / Low / Close), then Generate. "Exactly" sends a picture from your camera so the render copies the angle.</p></div>' +
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
    setTimeout(secSummaries, 0);
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
    var ap = activePreset();
    each(document.querySelectorAll("#bdBodyPresets [data-bp]"), function (b) {
      b.hidden = b.getAttribute("data-bg") !== (state.gender || "female");
      b.classList.toggle("is-on", !!ap && ap.id === b.getAttribute("data-bp"));
    });
    each($("bdAspect").children, function (b) { b.classList.toggle("is-on", b.getAttribute("data-v") === (state.aspect || "auto")); });
    each($("bdEngine").children, function (b) { b.classList.toggle("is-on", b.getAttribute("data-v") === state.engine); });
    each($("bdEdit").children, function (b) { b.classList.toggle("is-on", b.getAttribute("data-v") === state.editEngine); });
    $("bdBatch").textContent = state.batch;
    each($("bdGender").children, function (b) { b.classList.toggle("is-on", b.getAttribute("data-gender") === (state.gender || "female")); });
    var bl = document.querySelector('label[for="bdS_bust"]'); if (bl) bl.textContent = isMale() ? "Chest" : "Bust";
    var cl = document.querySelector(".bd-camlock"); if (cl) cl.hidden = state.view !== "cam";
    // which models this Generate will run, in order (from the real plan for the current settings)
    var chain = [], steps = [];
    try {
      var LONG = (typeof MODEL_NAMES === "object" && MODEL_NAMES) || {};
      var SHORT = { zimage: "Z-Image", flux3: "FLUX 3", flux2: "FLUX.2", klein9b_edit: "Klein", qwen_edit2509: "Qwen", flux2_edit: "FLUX.2 edit" };
      planSteps().forEach(function (st) {
        var m = st.model || (st.inputs.length ? editModel() : state.engine), SH = { klein9b: "FLUX Klein" };
        chain.push((SH[m] || SHORT[m] || m) + (st.lora ? " + " + st.lora.replace(/ (Z-Image|FLUX) LoRA$/, " LoRA") : "")); steps.push((st.label || (st.inputs.length ? "editing" : "creating her")) + ": " + (LONG[m] || (m === "klein9b" ? "FLUX.2 Klein 9B" : m)) + (st.lora ? " + " + st.lora : ""));
        if (st.post) { chain.push("Qwen"); steps.push("keeping her curves: " + (LONG.qwen_edit2509 || "Qwen Image Edit")); }
      });
    } catch (e) {}
    $("bdGoSub").textContent = VIEWS[state.view].label + (state.batch > 1 ? " ×" + state.batch : "") + (chain.length ? " (" + chain.reduce(function (o, m) { var l = o[o.length - 1]; if (l && l.m === m) l.n++; else o.push({ m: m, n: 1 }); return o; }, []).map(function (x) { return x.m + (x.n > 1 ? " ×" + x.n : ""); }).join(" → ") + ")" : "");
    $("bdGo").title = steps.length ? "This render runs " + steps.length + " step" + (steps.length > 1 ? "s" : "") + ":\n" + steps.map(function (x, i) { return (i + 1) + ". " + x; }).join("\n") : "";
    charFace();
    each(document.querySelectorAll('#bd [data-opt="own"]'), function (b) { b.hidden = !state.char; });
    var pid = poseId();
    each(document.querySelectorAll("#bdPose [data-pose]"), function (b) { b.classList.toggle("is-on", b.getAttribute("data-pose") === pid); });
    var pm = $("bdPoseMatch"); if (pm) { pm.checked = poseMatch(); pm.disabled = pid === "custom"; }
    var sid = seatId(), sg = $("bdSeatG");
    if (sg) {
      sg.hidden = !(pid === "sit" || pid === "custom");
      each(sg.querySelectorAll("[data-seat]"), function (b) { var v = b.getAttribute("data-seat"); b.hidden = pid === "sit" && v === "none"; b.classList.toggle("is-on", v === sid); });
    }
    var LKv = lookOf();
    LOOK_SLIDERS.forEach(function (x) {
      var el = $("bdL_" + x[0]); if (el) el.value = LKv[x[0]];
      var lb = document.querySelector('[data-lv="' + x[0] + '"]'); if (lb) lb.textContent = x[0].indexOf("eye") === 0 ? String(LKv[x[0]]) : LKv[x[0]] + "°";
    });
    each(document.querySelectorAll("#bdPose [data-lookp]"), function (b) {
      var p = LOOK_PRESETS.filter(function (o) { return o[0] === b.getAttribute("data-lookp"); })[0];
      b.classList.toggle("is-on", !!p && Object.keys(p[2]).every(function (k) { return p[2][k] === LKv[k]; }));
    });
    $("bdPoseNote").textContent = pid === "custom" ? "Drag the colored dots in the 3D preview: blue = hands, green = feet, orange = hips. To sit her down, pick what she sits on above. The AI render copies this pose."
      : (handsBusy() && state.weapon !== "none" ? "Her hands are busy in this pose, so the " + (fromList(WEAPONS, state.weapon)[3] === "pistol" ? "pistol goes in a thigh holster" : "gun is slung across her back") + ". To have her hold it, pick Low ready, Shouldered or At her side (that switches to the Gun hold pose). " : "") + (poseMatch() ? "The AI render copies the 3D pose." : "Turn on matching to copy the exact 3D pose; otherwise the pose is described in words.");
    var wn = state["with"] ? whoName(state["with"]) : "";
    each(document.querySelectorAll("#bdDuo .bd-wo-who"), function (el) { el.textContent = wn ? wn + "'s" : "Their"; });
    var won = $("bdWoNote"); if (won) won.textContent = wn ? "These only change " + wn + " in the AI render. Her own look (and the 3D preview) comes from the settings above." : "";
    each(document.querySelectorAll("#bdDuo [data-wo]"), function (b) { b.classList.toggle("is-on", withOpt(b.getAttribute("data-wo")) === b.getAttribute("data-v")); });
    each(document.querySelectorAll("#bdDuo [data-duo]"), function (b) { b.classList.toggle("is-on", b.getAttribute("data-duo") === (state.duo || "side")); });
    $("bdDuo").hidden = !state["with"];
    var holdG = document.querySelector('[data-single="hold"]'); if (holdG) holdG.closest(".bd-group").classList.toggle("is-dim", state.weapon === "none");
    if (handsBusy() && state.weapon !== "none" && state.hold !== "sling") state.hold = "sling";   // keep the chips honest
    var slB = document.querySelector('[data-single="hold"][data-opt="sling"]'), slL = slB && (slB.querySelector("span") || slB);
    if (slL) slL.textContent = fromList(WEAPONS, state.weapon)[3] === "pistol" ? "Holstered" : "Slung";
    each(document.querySelectorAll("#bd [data-single='hold']"), function (b) { b.classList.toggle("is-on", state.hold === b.getAttribute("data-opt")); });
    var viewG = document.querySelector('[data-single="view"]'); if (viewG) viewG.closest(".bd-group").classList.toggle("is-dim", singleShot());
    $("bdSkinName").textContent = state.char ? "Their own" : skin[1];
    $("bdSkin").classList.toggle("is-dim", !!state.char);
    renderPromptBox();
    savePrefs();
    try { window.BADDIES_STATE = snapshot(); window.dispatchEvent(new CustomEvent("baddies:change", { detail: window.BADDIES_STATE })); } catch (e) {}
  }

  function renderPromptBox() {
    if (state.char || singleShot() || hairRef()) {
      $("bdPrompt").textContent = planSteps().map(function (st, i, a) {
        return (a.length > 1 ? "Step " + (i + 1) + (st.label ? " (" + st.label + ")" : "") + ": " : "") + st.prompt + (st.post ? "\n  Touch-up: " + st.post : "");
      }).join("\n\n") + (singleShot() ? "\n\n(One shot: turnaround is off with a matched pose or a second person.)" : "");
    } else $("bdPrompt").textContent = buildPrompt() + (postEdit() ? "\n\nSecond pass (body only): " + postEdit() : "");
  }
  // the 3D preview re-poses after a change; refresh the prompt so the pose words match it
  window.addEventListener("baddies:posed", function () { if (poseMatch()) renderPromptBox(); });

  // ------------------------------------------------------------ wiring
  // ------------------------------------------------------------ picture chips
  // Every option chip gets a small picture: AI thumbnails (img/baddies/opt/<key>.webp), 3D-preview snapshots,
  // or a color swatch. BADDIES_THUMBS lists the keys that have a picture (js/baddies-thumbs.js).
  var SWATCH = {
    haircolor: { black: "#141110", brown: "#3b2418", honey: "#c8913f", platinum: "#e9dfc6", burgundy: "#6d1a2a", copper: "#b5562a", pink: "#ff4fa8", blue: "#a9dcff" },
    eyes: { brown: "#5a3214", hazel: "#8a6a2e", green: "#3f7a3a", grey: "#8a949c", blue: "#3d7fc9" }
  };
  function thumbKey(b) {
    var o = b.getAttribute("data-opt");
    if (b.hasAttribute("data-gid")) return b.getAttribute("data-gid") + "-" + o;
    if (b.hasAttribute("data-single")) return b.getAttribute("data-single") + "-" + o;
    if (b.hasAttribute("data-pose")) return "pose-" + b.getAttribute("data-pose");
    if (b.hasAttribute("data-seat")) return "seat-" + b.getAttribute("data-seat");
    if (b.hasAttribute("data-duo")) return "duo-" + b.getAttribute("data-duo");
    if (b.hasAttribute("data-lookp")) return "lookp-" + b.getAttribute("data-lookp");
    if (b.hasAttribute("data-bp")) return "bp-" + b.getAttribute("data-bp");
    return "";
  }
  function addThumbs() {
    var T = window.BADDIES_THUMBS || {};
    each(document.querySelectorAll("#bd .bd-chips button, #bdBodyPresets button"), function (b) {
      if (b.classList.contains("has-th") || b.classList.contains("has-sw")) return;
      var g = b.getAttribute("data-gid"), o = b.getAttribute("data-opt"), key = thumbKey(b), lbl = b.textContent;
      if (g && SWATCH[g]) {
        if (!SWATCH[g][o] && o !== "own") return;
        b.classList.add("has-sw");
        b.innerHTML = (SWATCH[g][o] ? '<i class="bd-sw bd-sw-' + g + '" style="--c:' + SWATCH[g][o] + '"></i>' : '<i class="bd-sw bd-sw-own"></i>') + "<span>" + esc(lbl) + "</span>";
        return;
      }
      var none = /^(none|own)$/.test(o || "") || key === "weapon-none" || key === "seat-none" || key === "pose-custom";
      if (!T[key] && !none) return;
      b.classList.add("has-th");
      b.innerHTML = (T[key] ? '<img class="bd-th" src="img/baddies/opt/' + key + '.webp?v=' + T[key] + '" alt="" loading="lazy" decoding="async" />'
        : '<i class="bd-th bd-th-icon" aria-hidden="true">' + (key === "pose-custom" ? "&#9995;" : o === "own" ? "&#9786;" : "&#8856;") + "</i>") + "<span>" + esc(lbl) + "</span>";
      var row = b.parentNode; if (row) row.classList.add("bd-tiles");
    });
  }

  // ------------------------------------------------------------ collapsible sections
  // Each side-panel section header toggles its body; a collapsed section shows a one-line summary of its picks.
  var SECS_KEY = "airh-baddies-closed";
  function setupSections() {
    var closed = {};
    try { closed = JSON.parse(localStorage.getItem(SECS_KEY) || "{}") || {}; } catch (e) {}
    each(document.querySelectorAll("#bd .bd-sec"), function (sec) {
      var h = sec.querySelector(".bd-sec-h"); if (!h || sec.querySelector(".bd-sec-body")) return;
      var id = sec.getAttribute("data-sec"), body = document.createElement("div");
      body.className = "bd-sec-body"; body.id = "bdSecBody_" + id;
      while (h.nextSibling) body.appendChild(h.nextSibling);
      sec.appendChild(body);
      var label = h.textContent;
      h.innerHTML = '<button type="button" class="bd-sec-tog" aria-controls="' + body.id + '"><span class="bd-sec-t"></span>' +
        '<span class="bd-sec-sum"></span><svg class="bd-sec-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>';
      h.querySelector(".bd-sec-t").textContent = label;
      setClosed(sec, !!closed[id]);
      h.querySelector("button").addEventListener("click", function () {
        var now = !sec.classList.contains("is-closed"); setClosed(sec, now);
        try { var c = JSON.parse(localStorage.getItem(SECS_KEY) || "{}") || {}; if (now) c[id] = 1; else delete c[id]; localStorage.setItem(SECS_KEY, JSON.stringify(c)); } catch (e) {}
        secSummaries();
        if (!now) window.dispatchEvent(new Event("resize"));
      });
    });
    var bar = document.createElement("div"); bar.className = "bd-sec-all";
    bar.innerHTML = '<button type="button" data-all="close">Collapse all</button><button type="button" data-all="open">Expand all</button>';
    var first = document.querySelector("#bd .bd-sec"); if (first) first.parentNode.insertBefore(bar, first);
    bar.addEventListener("click", function (e) {
      var b = e.target.closest("[data-all]"); if (!b) return;
      var shut = b.getAttribute("data-all") === "close", c = {};
      each(document.querySelectorAll("#bd .bd-sec"), function (sec) { setClosed(sec, shut); if (shut) c[sec.getAttribute("data-sec")] = 1; });
      try { localStorage.setItem(SECS_KEY, JSON.stringify(c)); } catch (e) {}
      secSummaries();
    });
    secSummaries();
  }
  function setClosed(sec, shut) {
    sec.classList.toggle("is-closed", shut);
    var b = sec.querySelector(".bd-sec-tog"); if (b) b.setAttribute("aria-expanded", String(!shut));
  }
  function secSummaries() {
    each(document.querySelectorAll("#bd .bd-sec"), function (sec) {
      var out = sec.querySelector(".bd-sec-sum"); if (!out) return;
      if (!sec.classList.contains("is-closed")) { out.textContent = ""; return; }
      var picks = [];
      each(sec.querySelectorAll(".bd-sec-body button.is-on"), function (b) {
        var lb = b.querySelector("b") || b.querySelector("span"), t = (b.getAttribute("title") || (lb ? lb.textContent : b.textContent) || "").trim();
        if (t && picks.indexOf(t) < 0) picks.push(t);
      });
      out.textContent = picks.slice(0, 4).join(" · ") + (picks.length > 4 ? " +" + (picks.length - 4) : "");
    });
  }

  function wire() {
    $("bdSkin").addEventListener("click", function (e) { var b = e.target.closest("[data-skin]"); if (b) { state.skin = b.getAttribute("data-skin"); sync(); } });
    $("bdHeight").addEventListener("input", function () { state.height = +this.value; sync(); });
    $("bdExag").addEventListener("input", function () { state.exag = +this.value; sync(); });
    $("bdShape").addEventListener("input", function (e) { var id = e.target.getAttribute("data-shape"); if (id) { state.shape[id] = +e.target.value; sync(); } });
    $("bdBodyPresets").addEventListener("click", function (e) {
      var b = e.target.closest("[data-bp]"); if (!b) return;
      var p = BODY_PRESETS.filter(function (x) { return x.id === b.getAttribute("data-bp"); })[0];
      state.shape = clone(p.v); state.exag = p.exag; state.gender = p.g; if (p.h) state.height = p.h; sync();
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
      if (s) {
        var key = s.getAttribute("data-single"), val = s.getAttribute("data-opt");
        state[key] = val;
        if (key === "hold" && val !== "sling" && handsBusy()) {   // she can't hold it with her hands busy: go to the Gun hold pose
          state.pose = { look: lookOf(), seat: "none", preset: "hold", custom: null, match: !!(state.pose && state.pose.match && state.pose.preset !== "custom") };
          hint("Switched the pose to Gun hold so she can hold it " + fromList(HOLDS, val)[1].toLowerCase() + ".");
        }
        if (key === "hold") state.holdPick = val;
        sync();
      }
    });
    $("bdExtra").addEventListener("input", sync);
    $("bdAspect").addEventListener("click", function (e) { var b = e.target.closest("[data-v]"); if (b) { state.aspect = b.getAttribute("data-v"); sync(); } });
    $("bdEngine").addEventListener("click", function (e) { var b = e.target.closest("[data-v]"); if (b) { state.engine = b.getAttribute("data-v"); sync(); } });
    $("bdEdit").addEventListener("click", function (e) { var b = e.target.closest("[data-v]"); if (b) { state.editEngine = b.getAttribute("data-v"); sync(); } });
    $("bdBatchDn").addEventListener("click", function () { state.batch = Math.max(1, state.batch - 1); sync(); });
    $("bdBatchUp").addEventListener("click", function () { state.batch = Math.min(CFG.maxBatch || 4, state.batch + 1); sync(); });
    $("bdShuffle").addEventListener("click", shuffle);
    $("bdReset").addEventListener("click", function () { var e = state.engine, ee = state.editEngine, n = state.batch; applySettings(DEFAULTS); state.engine = e; state.editEngine = ee; state.batch = n; state.hairTouched = false;
      if (state.char) { state.pick.hair = ["own"]; state.pick.haircolor = ["own"]; } $("bdName").value = ""; $("bdExtra").value = ""; sync(); });
    $("bdGo").addEventListener("click", onGenerate);
    $("bdPose").addEventListener("click", function (e) {
      var se = e.target.closest("[data-seat]");
      if (se) { state.pose.seat = se.getAttribute("data-seat"); sync(); return; }
      var lp = e.target.closest("[data-lookp]");
      if (lp) { var P = LOOK_PRESETS.filter(function (o) { return o[0] === lp.getAttribute("data-lookp"); })[0]; if (P) { state.pose.look = clone(P[2]); sync(); } return; }
      var b = e.target.closest("[data-pose]"); if (!b) return;
      var id = b.getAttribute("data-pose");
      state.pose = { look: lookOf(), seat: id === "sit" ? ((state.pose && state.pose.seat && state.pose.seat !== "none") ? state.pose.seat : "chair") : (id === "custom" ? (state.pose && state.pose.seat) || "none" : "none"), preset: id, custom: id === "custom" ? (state.pose && state.pose.custom) || null : null, match: id === "custom" ? true : !!(state.pose && state.pose.match && state.pose.preset !== "custom") };
      if (id === "custom") { var sp = $("bdPreview"); if (sp && sp.scrollIntoView) sp.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
      if (handsBusy()) { if (state.hold !== "sling") state.holdBefore = state.hold; state.hold = "sling"; }
      else if (state.hold === "sling" && state.holdBefore && state.holdPick !== "sling") state.hold = state.holdBefore;
      sync();
    });
    $("bdPose").addEventListener("change", function (e) { if (e.target.id === "bdPoseMatch") { state.pose.match = e.target.checked; sync(); } });
    $("bdPose").addEventListener("input", function (e) {
      var k = e.target.getAttribute && e.target.getAttribute("data-look-k"); if (!k) return;
      state.pose.look = Object.assign(lookOf(), state.pose.look || {}); state.pose.look[k] = +e.target.value; sync();
    });
    document.addEventListener("click", function (e) { var b = e.target.closest("[data-lora]"); if (b && b.closest("[data-lora-seg]")) setLoraMode(b.getAttribute("data-lora")); });
    $("bdWith").addEventListener("click", function (e) {
      var b = e.target.closest("[data-with]"); if (!b) return;
      if (b.classList.contains("is-off")) { hint("No " + (loraMode() === "zimage" ? "Z-Image" : "FLUX") + " LoRA for this character yet. Switch \"Draw characters with\" to Photo to use them.", true); return; }
      var k = b.getAttribute("data-with");
      state["with"] = k ? state.chars.filter(function (c) { return c.key === k; })[0] || null : null;
      renderChars(); sync();
    });
    $("bdDuo").addEventListener("click", function (e) {
      var w = e.target.closest("[data-wo]"); if (w) { state.withOpts = Object.assign({}, state.withOpts || {}); state.withOpts[w.getAttribute("data-wo")] = w.getAttribute("data-v"); sync(); return; }
      var b = e.target.closest("[data-duo]"); if (b) { state.duo = b.getAttribute("data-duo"); sync(); } });
    $("bdChars").addEventListener("click", function (e) {
      var b = e.target.closest("[data-char]"); if (!b) return;
      if (b.classList.contains("is-off")) { hint("No " + (loraMode() === "zimage" ? "Z-Image" : "FLUX") + " LoRA for this character yet. Switch \"Draw characters with\" to Photo to use them.", true); return; }
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
    var p = pick(BODY_PRESETS.filter(function (x) { return x.g === (state.gender || "female"); })); state.shape = clone(p.v); state.exag = p.exag;
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
  function shapeWords(id) { var s = SHAPE.filter(function (x) { return x.id === id; })[0]; return (isMale() ? SHAPE_M[id] : s.words)[tier(state.shape[id])]; }
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
    if (isMale()) return x < 25 ? "realistic, natural body proportions" : x < 50 ? "a fit athletic build with broad shoulders" : x < 70 ? "a strong V-shaped build with broad shoulders" : x < 90 ? "a heavily exaggerated V-shaped physique, very broad shoulders and a narrow waist" : "an extremely exaggerated, stylized superhero physique, huge shoulders and arms, tiny waist";
    if (x < 25) return "realistic, natural body proportions";
    if (x < 50) return "a curvy hourglass figure";
    if (x < 70) return "a thick, pronounced hourglass figure";
    if (x < 90) return "a heavily exaggerated hourglass figure with dramatic curves, the waist far narrower than the hips";
    return "an extremely exaggerated, stylized cartoon-like hourglass figure, impossibly tiny waist and enormous hips, glutes and thighs";
  }

  // ---- character mode: two steps keep the person recognisable.
  // Step 1 edits their own photo in place (same face, camera and framing): new hair, body, outfit, ink, gun.
  // Step 2 turns that picture into the chosen shot (turnaround / rear / action / portrait); "Full body" stops at step 1.
  function buildCharEdit() {
    var C = state.char, hd = hairDesc(), parts = [];
    parts.push("Edit this photo. Keep this person's face, head shape, age, skin color, eyes, eyebrows, nose, lips, neck, any glasses and every distinctive feature exactly the same, so she is unmistakably the same person, and keep the same camera angle, lighting and plain background" +
      (C.kind === "Yours" ? ". Zoom out if needed so her whole body shows head to toe, and if the photo has more than one panel, show only one full-body view of her" : ""));
    var ch = [];
    ch.push(hd.own ? "keep her own hair exactly as it is" : "replace her current hair completely with " + hd.text);
    ch.push("change her body to " + exagWords(state.exag) + ", " + [shapeWords("waist"), shapeWords("hips"), shapeWords("glutes"), shapeWords("thighs"), shapeWords("bust"), shapeWords("tone")].join(", "));
    var hw = heightWords(state.height); ch.push("she is " + hw.replace(/^about /, "about "));
    var camo = opt("camo");
    var outfit = "remove all of her original clothes and dress her in " + [opt("top"), opt("bottom")].filter(Boolean).join(" and ") + " in " + camo;
    var gear = opts("gear"); if (gear.length) outfit += ", with " + gear.join(", ");
    if (opt("eyewear")) outfit += ", wearing " + opt("eyewear");
    if (opt("boots")) outfit += ", " + opt("boots");
    ch.push(outfit);
    var tat = opt("tattoos"); if (tat) ch.push("add " + tat + " in " + (opt("inkstyle") || "full color") + " style, rich saturated colors, no white ink");
    var jew = opts("jewelry"); if (jew.length) ch.push("add " + jew.join(", "));
    var mk = [opt("makeup"), opt("expr")].filter(Boolean); if (mk.length) ch.push("give her " + mk.join(" and "));
    var w = fromList(WEAPONS, state.weapon);
    if (w[0] !== "none") {
      var hold = holdExact(w);
      ch.push("she is armed with " + w[2] + ", " + hold + ", an accurate, true-to-life model of the real firearm");
    }
    if (poseWords()) ch.push("pose her " + poseWords());
    var extra = $("bdExtra").value.trim(); if (extra) ch.push(extra);
    parts.push("Change only: " + ch.join("; "));
    parts.push("Full body head to toe, standing, facing the camera, whole body in frame including boots");
    parts.push(fromList(STYLES, state.style)[2]);
    return parts.join(". ").replace(/\s+/g, " ").replace(/\.\./g, ".") + ".";
  }
  function buildCharStep2() {
    if (state.view === "full") return "";
    var keep = "Keep exactly the same face, glasses, age, skin color, hair, body proportions, outfit, tattoos, jewelry, boots and weapon";
    var lead = {
      sheet: "Make a character turnaround reference sheet of this exact character, shown three times side by side on one sheet: front view, side profile view and back view, all full body head to toe with boots visible. " + keep + " in every view; the back view shows the back of the same hair",
      back: "Show this exact character in a full-body three-quarter rear view, head to toe, looking back over her shoulder at the camera. " + keep,
      action: "Show this exact character in a dynamic full-body combat action pose, whole body in frame. " + keep,
      portrait: "Show this exact character in a waist-up portrait looking into the camera. " + keep
    }[state.view] || "";
    return lead + ". " + fromList(BGS, state.bg)[2] + ". " + fromList(STYLES, state.style)[2] + ".";
  }

  function buildPrompt(o) {
    o = o || {};
    if (state.char && !o.lora) return buildCharEdit();
    var V = o.duo ? VIEWS.full : state.view === "cam" ? camShot() : VIEWS[state.view];
    var skin = fromList(SKIN, state.skin)[3];
    var parts = [];
    var C = o.lora ? null : state.char;
    if (o.lora) {   // a trained character drawn straight from their LoRA (the @handle loads it on the GPU)
      parts.push(V.lead + " @" + o.lora + " as a soldier character called a Baddie, unmistakably the same person with the same face");
    } else if (o.duo) {
      parts.push("Wide full-body shot of two people together, head to toe: a stunning adult woman in her late twenties, a female soldier character called a Baddie, and @" + o.duo +
        " (exactly as they really look, in their own clothes)." + withNote(state["with"]) + " They are " + fromList(DUO, state.duo || "side")[2] + ". Everything below describes the woman");
    } else if (C) {
      parts.push("Restyle the exact person in this photo as a soldier character called a Baddie. IDENTITY FIRST: it must stay unmistakably this same person: same face, same age, same facial features and bone structure, same skin color (do not lighten or darken it), same head shape and neck, same eyes, nose, lips and eyebrows, and any glasses or distinctive features they have, recognizable in every view");
      parts.push(V.lead + " this same person as a female soldier character called a Baddie");
    } else parts.push(V.lead + " a stunning adult woman in her late twenties, a female soldier character called a Baddie");
    var apx = activePreset();
    parts.push("BODY: " + (apx && apx.x ? apx.x + ", " : "") + exagWords(state.exag) + ", " + [shapeWords("waist"), shapeWords("hips"), shapeWords("glutes"), shapeWords("thighs"), shapeWords("bust"), shapeWords("tone")].join(", "));
    parts.push(heightWords(state.height));
    parts.push(C || o.lora ? "keep their own skin tone and face, with a smooth glowing finish" : skin + " skin with a smooth glowing finish");
    var hair = opt("hair"), hc = opt("haircolor");
    if (o.lora) { var hl = hairDesc(); parts.push(hl.own ? "keeping their own natural hair" : "HAIR: " + hl.text); }
    else if (C) {
      var hd = hairDesc();
      parts.push(hd.own ? "HAIR: keep " + hd.text + ", identical in every view"
        : "HAIR: completely replace their original hair with " + hd.text + ", the same new hairstyle and color in the front, side and back views; none of their original hairstyle or hair color anywhere, including the back of the head");
    } else if ((state.pick.hair || [])[0] === "bald") parts.push(hair);
    else parts.push((hair ? hair.replace(/hair/, (hc ? hc + " hair" : "hair")) : hc + " hair") + (hair && !/hair/.test(hair) && hc ? " in " + hc : "") + (opts("hairx").length ? ", with " + opts("hairx").join(" and ") : ""));
    parts.push(C || o.lora ? [opt("makeup") ? opt("makeup") + " applied to their own face" : "", opt("expr")].filter(Boolean).join(", ")
      : [opt("makeup"), opt("eyes"), opt("expr")].filter(Boolean).join(", "));
    var camo = opt("camo");
    var outfit = "wearing " + [opt("top"), opt("bottom")].filter(Boolean).join(" and ") + " in " + camo + ", a stylish streetwear outfit with a military touch";
    var gear = opts("gear"); if (gear.length) outfit += ", with " + gear.join(", ");
    if (opt("eyewear")) outfit += ", wearing " + opt("eyewear");
    if (opt("boots")) outfit += ", " + opt("boots");
    if (C) outfit = "OUTFIT: completely replace their original clothes with this outfit, none of their original clothing, swimwear or accessories anywhere: " + outfit.replace(/^wearing /, "");
    parts.push(outfit);
    var tat = opt("tattoos");
    if (tat) parts.push(tat + " in " + (opt("inkstyle") || "full color") + " style, rich saturated ink colors, no white ink");
    var jew = opts("jewelry"); if (jew.length) parts.push("accessorized with " + jew.join(", "));
    var w = fromList(WEAPONS, state.weapon);
    if (w[0] !== "none") {
      var hold = holdExact(w);
      parts.push("armed with " + w[2] + ", " + hold + ", an accurate, true-to-life model of the real firearm with correct details and proportions");
    }
    if (poseWords()) parts.push("POSE: " + poseWords());
    var extra = $("bdExtra").value.trim(); if (extra) parts.push(extra);
    parts.push(o.duo ? "both of them fully in frame and clearly recognizable, exactly two people" : V.tail);
    if (C) parts.push("Most important: the face in every view is clearly the same person as in the photo, same age and same skin color");
    parts.push(fromList(BGS, state.bg)[2]);
    parts.push(fromList(STYLES, state.style)[2]);
    return parts.join(". ").replace(/\s+/g, " ").replace(/\.\./g, ".") + ".";
  }

  // Second Qwen Edit pass: only when the curves are pushed hard (models tend to normalise them).
  function postEdit() {
    var body = bodyEdit(), fix = "";
    if (state.char && state.view === "sheet") {
      var hd = hairDesc();
      fix = "Make it the exact same person in all three views: same face, the same new outfit with none of their original clothes showing, and the hair in every view (front, side and back, including the back of the head) must be " +
        (hd.own ? "the same hairstyle and color as in the front view" : hd.text) + ". Repaint any view whose hair does not match.";
      if (hairRef()) fix = "Make it the exact same person in all three views: same face, the same new outfit with none of their original clothes showing. Leave her hair exactly as it is in every view.";
    }
    if (!fix) return body;
    if (!body) return fix + " Keep the layout, body, skin tone, tattoos, clothes, boots, weapon, pose and background exactly the same. Seamless, same art style.";
    return body.replace("edit only the woman's body proportions", "edit the woman's body proportions").replace("edit only this woman's body proportions", "edit this woman's body proportions").replace(/ Keep her face, hair,/, " " + fix + " Keep her face,");
  }
  function bodyEdit() {
    if (state.exag < 70 || isMale()) return "";
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
    try {   // which LoRAs each @handle has (z-image / flux2 / wan22 / ltx23), from the GPU's character registry
      var tok = state.user ? await freshToken() : null;
      var fr = await fetch(RENDER() + (tok ? "/my-characters" : "/characters"), tok ? { headers: { Authorization: "Bearer " + tok } } : {});
      var fj = await fr.json(), fam = {};
      (fj.characters || []).forEach(function (x) { if (x.handle) fam[String(x.handle).toLowerCase()] = x.families || []; });
      list.forEach(function (c) { c.fams = c.handle ? (fam[String(c.handle).toLowerCase()] || []) : []; });
    } catch (e) { list.forEach(function (c) { c.fams = c.fams || []; }); }
    state.chars = list;
    if (state.char) { var fresh = list.filter(function (c) { return c.key === state.char.key; })[0]; if (fresh) state.char = fresh; }
    if (state["with"]) { var fw = list.filter(function (c) { return c.key === state["with"].key; })[0]; if (fw) state["with"] = fw; }
    if (state.char && (state.user || /^p:/.test(state.char.key)) && list.length && !list.some(function (c) { return c.key === state.char.key; })) state.char = null;
    renderChars(); sync();
  }
  function famLabel(c) {
    var f = c.fams || [], out = [];
    if (f.indexOf("zimage") >= 0) out.push("Z-Image"); if (f.indexOf("flux2") >= 0) out.push("FLUX");
    return out.length ? out.join(" · ") : "Photo only";
  }
  function charCard(c, kind, cur) {
    var off = loraMode() !== "photo" && !hasLora(c);
    return '<button type="button" class="bd-char' + (c.key === cur ? " is-on" : "") + (off ? " is-off" : "") + '" data-' + kind + '="' + esc(c.key) + '" role="radio" aria-checked="' + (c.key === cur) + '"' +
      (off ? ' aria-disabled="true"' : "") + ' title="' + esc(c.name + " · " + c.kind + (off ? " · no " + (loraMode() === "zimage" ? "Z-Image" : "FLUX") + " LoRA yet" : "")) + '">' +
      '<img src="' + esc(c.thumb) + '" alt="" loading="lazy" /><b>' + (c.handle ? "@" + esc(c.handle) : esc(c.name)) + '</b><small>' + esc(famLabel(c)) + "</small></button>";
  }
  function setLoraMode(m) {
    state.loraMode = m;
    var lbl = m === "zimage" ? "Z-Image" : "FLUX", gone = [];
    if (m !== "photo") {
      if (state.char && !hasLora(state.char)) { gone.push(whoName(state.char)); state.char = null; onCharChange(true); }
      if (state["with"] && !hasLora(state["with"])) { gone.push(whoName(state["with"])); state["with"] = null; }
    }
    renderChars(); sync();
    if (gone.length) hint(gone.join(" and ") + (gone.length > 1 ? " don't" : " doesn't") + " have a " + lbl + " LoRA yet, so " + (gone.length > 1 ? "they were" : "it was") + " unselected.");
  }
  function niceName(id) { return String(id).split("-").map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(" "); }
  function renderChars() {
    var box = $("bdChars"); if (!box) return;
    var cur = state.char ? state.char.key : "";
    var html = '<button type="button" class="bd-char' + (cur ? "" : " is-on") + '" data-char="" role="radio" aria-checked="' + !cur + '"><span class="bd-char-none">New face</span><b>None</b></button>';
    html += state.chars.map(function (c) { return charCard(c, "char", cur); }).join("");
    if (!state.chars.length) html += '<p class="bd-note">' + (state.user ? "No characters yet. Make one on the AI Influencer page." : '<a href="auth.html">Log in</a> to use your influencers.') + "</p>";
    box.innerHTML = html;
    var wb = $("bdWith"); if (!wb) return;
    var wc = state["with"] ? state["with"].key : "";
    wb.innerHTML = '<button type="button" class="bd-char' + (wc ? "" : " is-on") + '" data-with="" role="radio" aria-checked="' + !wc + '"><span class="bd-char-none">Just her</span><b>Nobody</b></button>' +
      state.chars.map(function (c) { return charCard(c, "with", wc); }).join("");
    each(document.querySelectorAll("[data-lora-seg]"), function (el) {
      el.innerHTML = LORA_MODES.map(function (m) {
        var n = m[0] === "photo" ? state.chars.length : state.chars.filter(function (c) { return hasLora(c, m[0]); }).length;
        return '<button type="button" data-lora="' + m[0] + '" class="' + (loraMode() === m[0] ? "is-on" : "") + '" title="' + esc(m[2]) + '">' + esc(m[1]) + (m[0] === "photo" ? "" : ' <i>' + n + "</i>") + "</button>";
      }).join("");
    });
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
    var d = hairDescBase(), x = opts("hairx");
    if (x.length) d.text += ", with " + x.join(" and ");
    return d;
  }
  function hairDescBase() {
    var h = (state.pick.hair || [])[0], c = (state.pick.haircolor || [])[0];
    if (h === "bald") return { own: false, text: "a smooth, completely bald shaved head" };
    var hs = opt("hair"), hc = opt("haircolor");
    if (h === "own" && c === "own") return { own: true, text: "their own original hairstyle and hair color exactly as in the photo" };
    if (h === "own") return { own: false, text: "their own original hairstyle, recolored " + hc };
    var style = hs.replace(/hair/, (c === "own" ? "hair in their own natural hair color" : hc + " hair"));
    if (!/hair/.test(hs)) style += c === "own" ? " in their own natural hair color" : " in " + hc;
    return { own: false, text: style };
  }
  function charFace() {
    var t = $("bdFaceTag"); if (!t) return;
    var bits = [];
    if (state.char) bits.push('<img src="' + esc(state.char.thumb) + '" alt="" /><span>Face: <b>' + esc(whoName(state.char)) + "</b></span>");
    if (state["with"]) bits.push('<img src="' + esc(state["with"].thumb) + '" alt="" /><span>With: <b>' + esc(whoName(state["with"])) + "</b></span>");
    if (poseMatch()) bits.push("<span>Pose: <b>matched from 3D</b></span>");
    t.hidden = !bits.length; t.innerHTML = bits.join('<i class="bd-face-sep"></i>') + (bits.length ? '<span class="bd-face-note">(used in the AI render)</span>' : "");
  }
  async function charBlob(c) {
    var r = await fetch(c.url, { mode: "cors", cache: "force-cache" });
    if (!r.ok) throw new Error("Couldn't load " + (c.handle ? "@" + c.handle : c.name) + "'s picture.");
    var b = await r.blob();
    return new File([b], "face." + (/png/.test(b.type) ? "png" : "jpg"), { type: b.type || "image/jpeg" });
  }

  // ------------------------------------------------------------ generate
  // ---- the render plan: one or more GPU jobs run one after another.
  // inputs: "face" (character photo), "pose" (3D pose snapshot), "with" (second person's photo),
  // "prev" (previous step's picture). Several inputs are placed side by side on one canvas.
  function whoName(c) { return c ? (c.handle ? "@" + c.handle : c.name) : ""; }
  // Hairstyles too unusual for words alone ride along as a reference picture (our own render, hair only, no face)
  var HAIR_REFS = { spike: "img/baddies/hair-spike.jpg" };
  // Product photos of each real weapon (left side, muzzle right). A last edit step matches the gun to its photo.
  // Real photos on Wikimedia Commons (free licences), looked up when she's generated and flattened onto white.
  var GUN_REFS = { ak47: "AK-47 type II noBG.png", akm: "AK-103.JPG", m4a1: "PEO M4 Carbine RAS M68 CCO.png", hk416: "HK416N.png",
    scar: "FN SCAR-L noBG.png", mp5: "Heckler & Koch MP5-1.jpg", uzi: "Uzi of the israeli armed forces.jpg", remington: "Remington 870 Wmaster.jpg",
    barrett: "Barrett-M82A1-Independence-Day-2017-IZE-048-white.jpg", glock: "Glock 19 (9mm), Generation 3.jpg", deagle: "Desert Eagle Chrome (cropped).JPG" };
  function gunRef() { return state.weapon && state.weapon !== "none" && GUN_REFS[state.weapon] ? GUN_REFS[state.weapon] : null; }
  async function gunRefBlob(title) {
    var api = "https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&prop=imageinfo&iiprop=url&iiurlwidth=1024&titles=" + encodeURIComponent("File:" + title);
    var j = await (await fetch(api)).json(), pg = j.query && j.query.pages ? Object.values(j.query.pages)[0] : null;
    var u = pg && pg.imageinfo && (pg.imageinfo[0].thumburl || pg.imageinfo[0].url); if (!u) throw new Error("no ref");
    var bm = await createImageBitmap(await (await fetch(u, { mode: "cors" })).blob());
    var pad = Math.round(bm.width * 0.04), c = document.createElement("canvas"); c.width = bm.width + pad * 2; c.height = bm.height + pad * 2;
    var g = c.getContext("2d"); g.fillStyle = "#ffffff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(bm, pad, pad);
    var b = await new Promise(function (res) { c.toBlob(res, "image/jpeg", 0.92); });
    return new File([b], "weapon-reference.jpg", { type: "image/jpeg" });
  }
  function gunFixPrompt(sheet) {
    var w = fromList(WEAPONS, state.weapon), name = w[1], pistol = w[3] === "pistol";
    var stowed = handsBusy() || state.hold === "sling";
    if (stowed) {   // an edit can't move a gun out of her hands unless it's told to remove it first
      var hands = handsBusy() ? (poseWords() || "her hands in the same pose as now") : "her arms relaxed at her sides";
      return "Picture 1 is the photo to edit. Picture 2 is a reference photo of the exact real " + name + ". " + (sheet ? "In each of the three views: r" : "R") + "emove any gun from her hands completely, so her hands are empty: " + hands + ". Then " +
        (pistol ? "put the exact " + name + " from Picture 2 (same shape, color, slide, grip and proportions) in a black tactical thigh holster on her right thigh, grip up."
                : "put the exact " + name + " from Picture 2 (same shape, color, stock, rail, magazine and barrel) on a black tactical sling across her back: only its stock shows above and behind one shoulder and its barrel tip behind the opposite hip, the sling strap runs diagonally across her chest.") +
        " Nothing in her hands. Keep everything else in Picture 1 exactly the same: the same person, face, hair, body, outfit, tattoos, jewelry, background, lighting and framing.";
    }
    return "Picture 1 is the photo to edit. Picture 2 is a reference photo of the exact real " + name + " she carries: make her gun exactly this weapon, copying its true shape, proportions, color, stock, receiver, rails, sights, grip, magazine and barrel from Picture 2, at real-world size relative to her body. Copy nothing else from Picture 2 (no white background, no extra gun). " +
      (sheet ? "In each of the three views, she" : "She") + " carries it " + holdExact(w) + ". The gun is one solid piece, not bent, not fused with her body or clothes, no duplicate guns; her fingers wrap naturally around the grip with five fingers per hand. " +
      "Keep everything else in Picture 1 exactly the same: the same person, face, hair, body, outfit, tattoos, jewelry, pose, background, lighting and framing.";
  }
  function hairRef() { var h = (state.pick.hair || [])[0]; return (!state.char || h !== "own") && HAIR_REFS[h] ? HAIR_REFS[h] : null; }
  function hairRefNote(n) {
    return " Picture " + n + " is only a hairstyle reference: copy that exact hairstyle from it (the same shape, the bun, and the long rigid tube of hair sticking out diagonally up and backward, not hanging down), in her chosen hair color; do not copy anything else from Picture " + n + ".";
  }
  function hairRefPrompt(sheet) {
    var hd = hairDesc();
    return "Give the woman in Picture 1 exactly the hairstyle shown in Picture 2, at the same angle as in Picture 2: " + hd.text +
      ". The tube of hair rises out of the back of her head and points diagonally UP and backward at 45 degrees, its rounded tip far above the top of her head, like in Picture 2; not horizontal, not hanging down. Copy only the hairstyle from Picture 2. " +
      (sheet ? "Do this in every view of her in Picture 1 (front, side and back). " : "Turn her head to a side profile so the hairstyle is clearly visible. ") +
      "Keep everything else in Picture 1 exactly the same: her face, identity, skin, body, outfit, tattoos, jewelry, boots, weapon, body pose, full-body framing from head to boots, camera, background and style.";
  }
  // FLUX edit models drift on clothes unless every step restates them (and Klein ignores negative prompts)
  function wearingLine() {
    var camo = opt("camo"), bits = [[opt("top"), opt("bottom")].filter(Boolean).join(" and ") + (camo ? " in " + camo : "")];
    var gear = opts("gear"); if (gear.length) bits.push(gear.join(", "));
    if (opt("eyewear")) bits.push(opt("eyewear"));
    if (opt("boots")) bits.push(opt("boots"));
    var tat = opt("tattoos"); if (tat) bits.push(tat + " (" + (opt("inkstyle") || "full color") + ")");
    var jew = opts("jewelry"); if (jew.length) bits.push(jew.join(", "));
    return " She stays fully dressed in exactly this outfit, same colors and pattern as in Picture 1: " + bits.join("; ") +
      ". Her bottoms stay fully on, covering her hips and crotch. Fully clothed, tasteful, no nudity.";
  }
  function editModel() { return state.editEngine || "klein9b_edit"; }
  function isFluxEdit() { return editModel() !== "qwen_edit2509"; }
  function poseMatch() { return !!(state.pose && (state.pose.preset === "custom" || state.pose.match)); }
  function singleShot() { return poseMatch() || !!state.with; }
  function promptAs(view) { var v = state.view; state.view = view; try { return buildPrompt(); } finally { state.view = v; } }
  function sceneLock() { return !!(window.BADDIES_3D_UP && window.BADDIES_3D_UP[state.bg]) && !!window.BADDIES_SCENE_PLATE; }
  function neckFix() {   // text-to-image copies his chain onto her: the final edit puts back exactly her own necklaces, his stays
    var N = { chain: "a gold chain necklace", tennis: "a diamond tennis necklace", dogtags: "silver dog tags on a thin silver ball chain" };
    var mine = (state.pick.jewelry || []).filter(function (k) { return N[k]; }).map(function (k) { return N[k]; });
    var h = String((state["with"] || {}).handle || "").toLowerCase(), his = withOpt("jewel") === "on";
    var hisChain = JEWEL[h] ? "his " + JEWEL[h].replace(/^his /, "") : "his own necklace";
    return (his ? "The man keeps " + hisChain + " exactly as it is in the picture: do not change, shrink or remove his chain or pendant. "
                : "The man wears no chain, necklace or pendant: remove them from him. ") +
      "Only on the woman: her neck has " + (mine.length ? "only " + mine.join(" and ") : "no necklace at all") +
      (mine.indexOf(N.chain) < 0 ? "; if the woman has a thick gold chain or a lion pendant, take it off her (only hers)" : "") + ". ";
  }
  function placePrompt() {   // the people are already pasted into the 3D scene plate on the server; this only makes it one real photo
    var two = !!state["with"];
    return "This picture is a rough photo composite: " + (two ? "two real people" : "a real woman") + " placed into a 3D scene. Turn it into one seamless real photo. " +
      "Keep everything exactly where it is: the camera angle, framing, horizon, the background, the structure under their feet, and " + (two ? "each person's" : "her") +
      " position, size, pose, face, hair, body, clothes, tattoos and jewelry. Only fix the lighting so " + (two ? "they" : "she") + " match the scene, add real contact shadows under the feet, " +
      "and give the scene real photographic detail and texture (smooth white concrete, glowing lights, a real city, water and sky). Do not add, remove or move any person, arch, tower, road or building. " +
      (two ? neckFix() : "") +
      fromList(STYLES, state.style)[2] + ".";
  }
  function scenePrompt() {
    var two = !!state["with"];
    return "Picture 1 is a 3D preview that shows the exact place, structure and camera angle to use. Picture 2 shows the real " + (two ? "people" : "woman") + ". " +
      "Make one real photo that keeps exactly Picture 1's camera position, height, angle, lens, framing, horizon and background: the same structure under her feet in the same place, running the same direction, the same city, water and sky in the same places. " +
      "Do not add, move or redraw any arch, bridge, tower, road or building that is not in Picture 1; only give everything real detail and real lighting. " +
      "The woman stands exactly where the 3D figure stands, at the same size in the frame, in the same pose" + (two ? ", and the man from Picture 2 stands right next to her on the same surface, side by side, at real human scale" : "") + ". " +
      "Copy " + (two ? "each person's" : "her") + " exact appearance from Picture 2: same face, age, skin color, hair, body proportions, clothes, tattoos and jewelry" + (two ? ", each keeping their own clothes and jewelry" : "") + ". " +
      fromList(STYLES, state.style)[2] + ".";
  }
  function planSteps() {   // the steps, sized to the chosen picture size
    var plan = planSteps0(), A = aspectDims();
    if (sceneLock() && !plan.some(function (st) { return st.inputs.indexOf("cam") >= 0; })) {
      var CVs = camShot(), b0 = plan[plan.length - 1].batch; delete plan[plan.length - 1].batch;
      plan.push({ label: "matching the 3D scene", inputs: ["plate", "prev"], multi: true, place: true, w: CVs.w, h: CVs.h, prompt: placePrompt(), batch: b0 });
    }
    else if (state["with"] && plan.some(function (st) { return st.lora; }) && !plan.some(function (st) { return st.inputs.length; })) {   // LoRA duo drawn from text: fix who wears which jewelry
      var b1 = plan[plan.length - 1].batch; delete plan[plan.length - 1].batch;
      plan.push({ label: "fixing the jewelry", inputs: ["prev"], prompt: "Keep this picture exactly as it is: the same two people, faces, bodies, poses, clothes, tattoos, background, lighting and framing. " + neckFix(), batch: b1 });
    }
    if (A) {
      var sized = false;
      plan.forEach(function (st) { if (st.w) { st.w = A.w; st.h = A.h; sized = true; } });
      if (!sized) { var L = plan[plan.length - 1]; L.w = A.w; L.h = A.h; }
    }
    return plan;
  }
  function planSteps0() {
    var V = VIEWS[state.view], F = VIEWS.full, steps = [], C = state.char, single = singleShot();
    var LC = useLora(C) ? C : null, LW = !C && useLora(state["with"]) ? state["with"] : null;
    if (LC || LW) {   // LoRA mode: the trained character is drawn from scratch by its LoRA
      var L = LC || LW, CV = state.view === "cam" && !LW ? camShot() : null, sz = LW ? { w: 1216, h: 832 } : CV || V;
      steps.push({ label: "drawing " + whoName(L) + " with their LoRA", inputs: [], model: loraModel(), lora: loraTag(L), w: sz.w, h: sz.h,
        prompt: LC ? buildPrompt({ lora: L.handle }) : buildPrompt({ duo: L.handle }), post: LC && !(CV && camLock()) ? bodyEdit() : "" });
      if (CV && camLock()) steps.push({ label: "matching your camera", inputs: ["cam", "prev"], multi: true, w: CV.w, h: CV.h, prompt: camPrompt(), post: bodyEdit() });
      if (gunRef()) steps.push({ label: "fixing the weapon", who: !!LC, inputs: ["prev", "gunref"], multi: true, prompt: gunFixPrompt(!LW && state.view === "sheet") });
      if (LC && state["with"]) steps.push({ label: "adding " + whoName(state["with"]), inputs: ["prev", "with"], w: 1216, h: 832, prompt: duoPrompt() });
      steps[steps.length - 1].batch = state.batch;
      return steps;
    }
    if (state.view === "cam" && !state.with) {   // Viewer angle: the shot from the 3D viewer's camera
      var CV = camShot();
      if (C) {
        if (hairRef() && isFluxEdit()) steps.push({ label: "dressing " + whoName(C), who: true, inputs: ["face", "hairref"], multi: true, prompt: "Picture 1 is the photo to edit." + hairRefNote(2) + " " + buildCharEdit() });
        else steps.push({ label: "dressing " + whoName(C), who: true, inputs: ["face"], prompt: buildCharEdit() });
        steps.push({ label: "matching your camera", who: true, inputs: ["cam", "prev"], multi: true, w: CV.w, h: CV.h, prompt: camPrompt(), post: bodyEdit() });
      } else {
        steps.push({ label: "", inputs: [], w: CV.w, h: CV.h, prompt: buildPrompt(), post: camLock() ? "" : bodyEdit() });
        if (hairRef()) steps.push({ label: "styling the hair", inputs: ["prev", "hairref"], multi: true, prompt: hairRefPrompt(false) });
        if (camLock()) steps.push({ label: "matching your camera", inputs: ["cam", "prev"], multi: true, w: CV.w, h: CV.h, prompt: camPrompt(), post: bodyEdit() });
      }
      if (gunRef()) steps.push({ label: "fixing the weapon", who: !!C, inputs: ["prev", "gunref"], multi: true, prompt: gunFixPrompt(false) });
      steps[steps.length - 1].batch = state.batch;
      return steps;
    }
    if (C) {
      if (hairRef() && isFluxEdit()) steps.push({ label: "dressing " + whoName(C), who: true, inputs: ["face", "hairref"], multi: true, prompt: "Picture 1 is the photo to edit." + hairRefNote(2) + " " + buildCharEdit() });
      else steps.push({ label: "dressing " + whoName(C), who: true, inputs: ["face"], prompt: buildCharEdit() });
      if (hairRef() && !isFluxEdit()) steps.push({ label: "styling the hair", who: true, inputs: ["prev", "hairref"], multi: true, prompt: hairRefPrompt(false) });
      if (poseMatch()) steps.push({ label: "posing her", who: true, inputs: ["prev", "skel"], multi: true, w: F.w, h: F.h, prompt: charPose2Prompt() });
      else if (!single) { var s2 = buildCharStep2(); if (s2) {
        if (hairRef()) steps.push({ label: "making the " + V.label.toLowerCase(), who: true, inputs: ["prev", "hairref"], multi: true, w: V.w, h: V.h, post: postEdit(),
          prompt: "Picture 1 is the character. Picture 2 is only a hairstyle reference. " + s2 + " In every view her hair has exactly the shape shown in Picture 2: slicked back into the round bun, with the long rigid tube of hair sticking out of the back of her head diagonally up and backward (seen from the side it points up and behind her; it never hangs down). Copy nothing else from Picture 2. In every view she wears her complete outfit from Picture 1 exactly, fully covered: every top layer, bodysuit, vest and jacket stay on and closed as in Picture 1." });
        else steps.push({ label: "making the " + V.label.toLowerCase(), who: true, inputs: ["prev"], w: V.w, h: V.h, prompt: s2, post: postEdit() }); } }
    } else if (poseMatch()) {
      steps.push({ label: "matching your pose", inputs: ["pose"], w: F.w, h: F.h, prompt: posePrompt(false) });
    } else {
      var pv = single ? "full" : state.view;
      steps.push({ label: "", inputs: [], w: VIEWS[pv].w, h: VIEWS[pv].h, prompt: single ? promptAs("full") : buildPrompt(), post: single ? bodyEdit() : postEdit() });
    }
    if (!C && hairRef()) steps.push({ label: "styling the hair", inputs: ["prev", "hairref"], multi: true, prompt: hairRefPrompt(!single && state.view === "sheet") });
    if (gunRef()) steps.push({ label: "fixing the weapon", who: !!C, inputs: ["prev", "gunref"], multi: true, prompt: gunFixPrompt(!C && !single && state.view === "sheet" || !!C && !single && !poseMatch() && state.view === "sheet") });
    if (state.with) steps.push({ label: "adding " + whoName(state.with), inputs: ["prev", "with"], w: 1216, h: 832, prompt: duoPrompt() });
    if (C && !steps.some(function (x) { return x.post; }) && (steps.length === 1 || steps[1].label === "styling the hair" && steps.length === 2)) steps[0].post = bodyEdit();
    steps[steps.length - 1].batch = state.batch;
    return steps;
  }
  // The 3D pose in words (from the bones), plus the preset wording and what happens to the gun.
  function poseDesc() {
    var pid = poseId(), w = fromList(WEAPONS, state.weapon), gun = "";
    var onGun = w[0] !== "none" && (pid === "hold" || pid === "kneel");   // hands are on the gun: describe the gun hold instead
    var d = window.BADDIES_POSE_DESC ? window.BADDIES_POSE_DESC({ hands: !onGun }) : "";
    if (w[0] !== "none") {
      if (pid === "custom") gun = "holding " + w[2].replace(/^a real /, "the ") + " in her right hand by its grip, right side up, finger off the trigger";
      else gun = w[2].replace(/^a real /, "the ") + " " + holdExact(w);
    }
    var seat = seatId(), lw = lookWords();
    if (/leaning back/.test(d)) lw = lw.replace(/,? ?leaning back/, "");
    return [seat !== "none" && !/sitting/.test(d) ? fromList(SEATS, seat)[2] : (pid !== "custom" && pid !== "hold" && pid !== "sit" ? fromList(POSES, pid)[2] : ""), d, lw, gun].filter(Boolean).join(", ").replace(/^, /, "");
  }
  function charPosePrompt() {
    var hd = hairDesc(), extra = $("bdExtra") ? $("bdExtra").value.trim() : "";
    var hair = hd.own ? "her own hair exactly as it is in this photo" : "exactly the same hairstyle as in this photo: " + hd.text + ", same cut, length, bangs and part";
    var facing = /camera|turned|profile|sideways/.test(lookWords()) ? "" : ", facing the camera";
    return "Change only her pose, keeping this exact same person (same face, age, skin color, glasses, body proportions, outfit, tattoos, jewelry, boots and weapon) and " + hair + ", and the same plain background. New pose, follow every detail: " + poseDesc() + facing +
      (extra ? ". Also: " + extra : "") + ". Full body head to toe in frame, one person only. " + fromList(STYLES, state.style)[2] + ".";
  }
  // Two pictures straight into Qwen Edit 2509: Picture 1 = the 3D pose, Picture 2 = the dressed person.
  // Picture 1 = the woman (already dressed), Picture 2 = an OpenPose skeleton of the 3D pose (Qwen 2509 reads it natively)
  function charPose2Prompt() {
    var hd = hairDesc(), extra = $("bdExtra") ? $("bdExtra").value.trim() : "";
    var hair = hd.own ? "her own hair exactly as in Picture 1" : "exactly this hairstyle: " + hd.text + ", same cut, length and bangs";
    return "Make the woman in Picture 1 strike exactly the pose shown by the pose skeleton in Picture 2 (an OpenPose keypoint map). Match every joint of the skeleton precisely: head and face direction, shoulders, elbows, wrists, hips, knees and ankles, at the same positions and camera angle. Pose details: " +
      poseDesc() + ". Keep her exact face, identity, age, skin color, " + hair + ", body proportions, outfit, tattoos, jewelry, boots and weapon. One person only, full body in frame from head to feet, nothing cropped" +
      (extra ? ". Also: " + extra : "") + ". " + fromList(BGS, state.bg)[2] + ". " + fromList(STYLES, state.style)[2] + ". No skeleton lines or dots in the photo.";
  }
  function posePrompt(fromLeft) {
    var look = fromList(STYLES, state.style)[2], bg = fromList(BGS, state.bg)[2];
    if (fromLeft) return "This picture has two panels. Show the woman from the LEFT panel, alone, in exactly the pose, body angle, arm, hand, leg and head positions and camera angle of the 3D figure in the RIGHT panel. Keep her face, age, skin color, hair, body proportions, outfit, tattoos, jewelry, boots and weapon exactly the same. Full body head to toe, one person only, the 3D figure itself must not appear. " + bg + ". " + look + ".";
    return "Use the 3D figure in this picture as the pose and camera reference: create the following character with exactly the same pose, body angle, arm, hand, leg and head positions and the same camera angle and framing, rendered with full real detail (real skin, fabric and metal), not a plain 3D preview. Pose: " + poseDesc() + ". " + promptAs("full");
  }
  var JEWEL = { crissp: "his thick chunky gold Cuban link chain with a large iced-out lion head pendant (the lion's face and mane paved with white diamonds, gold outlines, red ruby eyes, an open roaring gold mouth)" };
  var CHAIN_NOTE = "Every chain and pendant is real three-dimensional metal jewelry hanging around the neck on top of the shirt, catching the light, never printed, drawn or embroidered on the clothes as a logo or graphic.";
  var OUTFIT_DEF = { crissp: "a black two-button blazer with a black and white patterned pocket square over a plain tan v-neck t-shirt, black straight-leg pants, polished black leather shoes and a two-tone silver and gold wristwatch" };
  var GLASSES_DEF = { crissp: "his dark square black sunglasses" };
  var WITH_OPTS = [
    ["outfit", "Their outfit", [["own", "Their usual look"], ["match", "Match her gear"], ["suit", "Black suit"], ["street", "Streetwear"]]],
    ["jewel", "Their jewelry", [["on", "On"], ["off", "Off"]]],
    ["glasses", "Their glasses", [["keep", "Keep"], ["off", "Off"]]]];
  function withOpt(k) { var o = state.withOpts || {}; return o[k] || WITH_OPTS.filter(function (w) { return w[0] === k; })[0][2][0][0]; }
  function withNote(c) {   // what the other person wears, kept apart from hers (text-to-image mixes two people's details)
    if (!c) return "";
    var h = String(c.handle || "").toLowerCase(), who = c.handle ? "@" + c.handle : "the other person";
    var outfit = { own: OUTFIT_DEF[h] || "their own everyday clothes", match: "a tactical outfit in the same colors as hers (but none of her tattoos, jewelry or hairstyle)",
      suit: "a sharp black two-button suit with a crisp white shirt and black leather shoes", street: "streetwear: a plain black oversized t-shirt, dark jeans and clean white sneakers" }[withOpt("outfit")];
    var jewel = withOpt("jewel") === "on" ? (JEWEL[h] ? JEWEL[h] + " as real jewelry over the shirt" : "their own jewelry") : "no chain, necklace, pendant or jewelry of his own (the woman keeps all of her own jewelry)";
    var glasses = withOpt("glasses") === "keep" ? (GLASSES_DEF[h] ? ", " + GLASSES_DEF[h] : "") : ", and he has no sunglasses or glasses, his eyes visible (the woman keeps her own eyewear exactly as chosen for her)";
    return " " + who + " wears " + outfit + ", " + jewel + glasses + ". These are worn only by " + who + ": the woman does not wear his chain, pendant, watch or clothes (she wears only the jewelry listed for her, dog tags on a thin silver ball chain, no gold Cuban link chain unless listed for her), and " + who +
      " has none of her tattoos, gear, knee pads, boots or jewelry." + (withOpt("jewel") === "on" ? " " + CHAIN_NOTE : "");
  }
  function jewelNote(c) {
    var j = c && c.handle ? JEWEL[String(c.handle).toLowerCase()] : "";
    return (j ? " The other person (not the woman) wears " + j + " as real jewelry over the shirt." : "") + " " + CHAIN_NOTE;
  }
  function duoPrompt() {
    var d = fromList(DUO, state.duo || "side")[2];
    return "This picture shows two people side by side. Make one new photo of both of them together in the same scene: on the LEFT the woman soldier (keep her exact face, age, skin color, hair, body proportions, outfit, tattoos, jewelry, boots and weapon); on the RIGHT the other person (keep their exact face, age, skin color, hair, body and clothes)." + withNote(state["with"]) + " They are " + d +
      ", both full body head to toe and both clearly recognizable, exactly two people. " + fromList(BGS, state.bg)[2] + ". " + fromList(STYLES, state.style)[2] + ".";
  }
  async function composite(blobs) {
    var imgs = await Promise.all(blobs.map(function (b) { return createImageBitmap(b); }));
    var H = 1024, gap = 32, ws = imgs.map(function (im) { return Math.round(im.width * H / im.height); });
    var c = document.createElement("canvas"); c.width = ws.reduce(function (a, b) { return a + b; }, 0) + gap * (imgs.length - 1); c.height = H;
    var g = c.getContext("2d"); g.fillStyle = "#ffffff"; g.fillRect(0, 0, c.width, H);
    var x = 0; imgs.forEach(function (im, i) { g.drawImage(im, x, 0, ws[i], H); x += ws[i] + gap; });
    var b = await new Promise(function (res) { c.toBlob(res, "image/png"); });
    return new File([b], "combo.png", { type: "image/png" });
  }
  async function urlBlob(u, name) {
    var r = await fetch(absUrl(u), { mode: "cors" }); if (!r.ok) throw new Error("Couldn't load the previous picture.");
    var b = await r.blob(); return new File([b], name || "prev.png", { type: b.type || "image/png" });
  }

  async function onGenerate() {
    if (!state.user) { location.href = "auth.html"; return; }
    if (CFG.enabled === false && !isAdmin()) { hint("The Baddies Generator is switched off right now.", true); return; }
    var token = await freshToken();
    if (!token) { hint("Your session expired. Log in again to keep creating.", true); return; }
    var name = $("bdName").value.trim() || autoName();
    var plan = planSteps(), blobs = {};
    $("bdGo").disabled = true; hint("");
    try {
      if (state.char) blobs.face = await charBlob(state.char);
      if (state.with) blobs["with"] = await charBlob(state.with);
      if (hairRef()) blobs.hairref = await urlBlob(new URL(hairRef(), location.href).href, "hair-reference.jpg");
      if (gunRef()) { try { blobs.gunref = await gunRefBlob(gunRef()); } catch (e) { blobs.gunref = null; } }
      if (!blobs.gunref && plan.some(function (st) { return st.label === "fixing the weapon"; })) {   // reference unavailable: skip that step
        var b0 = plan[plan.length - 1].batch; plan = plan.filter(function (st) { return st.label !== "fixing the weapon"; }); plan[plan.length - 1].batch = b0;
      }
      if (plan.some(function (st) { return st.inputs.indexOf("cam") >= 0; })) {
        if (!window.BADDIES_CAMERA_SNAPSHOT) throw new Error("The 3D preview isn't ready yet, so the camera angle can't be captured. Wait a moment and try again.");
        var cst = plan.filter(function (st) { return st.inputs.indexOf("cam") >= 0; })[0], cv = cst && cst.w ? { w: cst.w, h: cst.h } : camShot(), cb = await window.BADDIES_CAMERA_SNAPSHOT(cv.w, cv.h); if (!cb) throw new Error("Couldn't capture the camera view.");
        blobs.cam = new File([cb], "camera-view.png", { type: "image/png" });
      }
      var pst = plan.filter(function (st) { return st.place; })[0];
      if (pst) {   // the scene plate from the viewer camera, and where she stands in it
        var pr = await window.BADDIES_SCENE_PLATE(pst.w, pst.h); if (!pr || !pr.blob) throw new Error("Couldn't capture the 3D scene.");
        if (!pr.box || pr.box.x1 < 0 || pr.box.x0 > pst.w || pr.box.y1 < 0 || pr.box.y0 > pst.h) throw new Error("She is out of the 3D view. Frame her in the 3D preview first, then Generate.");
        blobs.plate = new File([pr.blob], "scene-plate.png", { type: "image/png" }); pst.placeBox = Object.assign({ duo: !!state["with"] }, pr.box);
      }
      if (poseMatch() && state.view !== "cam") {
        if (!window.BADDIES_POSE_SNAPSHOT) throw new Error("The 3D preview isn't ready yet, so the pose can't be captured. Wait a moment and try again.");
        var pb = await window.BADDIES_POSE_SNAPSHOT(); if (!pb) throw new Error("Couldn't capture the 3D pose.");
        blobs.pose = new File([pb], "pose.png", { type: "image/png" });
        if (state.char && window.BADDIES_POSE_SKELETON) { var sk = await window.BADDIES_POSE_SKELETON(); if (sk) blobs.skel = new File([sk], "skeleton.png", { type: "image/png" }); }
      }
    } catch (e) { hint(e.message, true); $("bdGo").disabled = false; return; }
    var last = state.view === "cam" && !state.with ? camShot() : VIEWS[singleShot() ? (state.with ? "sheet" : "full") : state.view];
    var stepModel = function (st) { return st.model || (st.inputs.length ? editModel() : state.engine); };
    var settings = snapshot(), model = stepModel(plan[0]);
    settings.models = plan.map(stepModel).concat(plan.some(function (st) { return st.post; }) ? ["qwen_edit2509"] : [])
      .filter(function (m, i, a) { return a.indexOf(m) === i; });
    var card = { id: "tmp-" + Date.now(), name: name, settings: settings, view: state.view, model: model, prompt: genderize(plan.map(function (x) { return x.prompt; }).join("\n\n")),
      created_at: new Date().toISOString(), status: "queued", pending: true, progress: 2, stage: "Sending to the GPU…", urls: [], w: aspectDims() ? aspectDims().w : state.with ? 1216 : last.w, h: aspectDims() ? aspectDims().h : state.with ? 832 : last.h,
      plan: plan, si: -1, blobs: blobs, editModel: editModel(), engine: state.engine, wearing: wearingLine(), who: state.char && state.char.handle ? "@" + state.char.handle : "" };
    state.mine.unshift(card); renderMine();
    try { await runStep(card, 0, token); }
    catch (e) {
      card.pending = false; card.status = "error";
      card.error = /Failed to fetch|NetworkError|HTTP 5/.test(e.message) ? "The GPU server isn't reachable right now. Check System Status, then try again." : e.message;
      renderMine();
    } finally { $("bdGo").disabled = false; }
  }

  async function runStep(card, i, token) {
    var st = card.plan[i]; card.si = i;
    token = token || await freshToken();
    var ins = [];
    for (var k = 0; k < st.inputs.length; k++) {
      var key = st.inputs[k];
      ins.push(key === "prev" ? await urlBlob(card.urls[0], "prev.png") : card.blobs[key]);
    }
    var img = ins.length > 1 && !st.multi ? await composite(ins) : ins[0];
    var fd = new FormData();
    var mdl = st.model || (img ? (card.editModel || "qwen_edit2509") : (card.engine || state.engine));
    fd.append("model", mdl);
    fd.append("mode", img ? "edit" : "create");
    // FLUX.2 Klein: naming the trained @character loads their FLUX.2 LoRA on the server (when they have one)
    fd.append("prompt", genderize((mdl === "klein9b_edit" && card.who && st.who ? card.who + " is the woman in Picture 1. " : "") + st.prompt +
      (mdl !== "qwen_edit2509" && card.wearing && !/^(adding|matching the 3D)/.test(st.label || "") ? card.wearing : "")));
    fd.append("negative", NEGATIVE + (img && i > 0 ? ", different person, extra people, mannequin" : ""));
    fd.append("batch", String(st.batch || 1));
    if (st.w) { fd.append("width", String(st.w)); fd.append("height", String(st.h)); if (img) fd.append("size", "custom"); }
    if (img) fd.append("image", img, img.name || "input.png");
    if (st.multi) { if (ins[1]) fd.append("image2", ins[1], ins[1].name || "image2.png"); if (ins[2]) fd.append("image3", ins[2], ins[2].name || "image3.png"); }
    if (mdl === "flux2" || /_edit/.test(mdl)) { fd.append("lora", ""); fd.append("lora_strength", "1.0"); }
    if (st.post) fd.append("post_edit", genderize(st.post));
    if (st.placeBox) fd.append("place", JSON.stringify(st.placeBox));
    var r = await fetch(RENDER() + "/image-jobs", { method: "POST", headers: { Authorization: "Bearer " + token }, body: fd });
    var d = await r.json().catch(function () { return {}; });
    if (!r.ok) throw new Error(d.detail || ("HTTP " + r.status));
    card.job_id = d.job_id;
    card.stage = stepLabel(card) + "Queued";
    if (client) {
      if (i === 0) {
        var row = await client.from("baddies").insert({ user_id: state.user.id, name: card.name, settings: card.settings, view: card.view, model: card.model, prompt: card.prompt, job_id: d.job_id }).select("id").single();
        if (row.data) card.id = row.data.id;
      } else if (realId(card.id)) await client.from("baddies").update({ job_id: d.job_id }).eq("id", card.id);
    }
    renderMine(); poll(card, 0);
  }
  function stepLabel(card) {
    if (!card.plan || card.plan.length < 2) return "";
    var st = card.plan[card.si] || {};
    return "Step " + (card.si + 1) + " of " + card.plan.length + (st.label ? " (" + st.label + ")" : "") + " · ";
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
        if (j.status === "done") {
          if (card.plan && card.si < card.plan.length - 1 && (j.urls || []).length) {
            card.urls = [j.urls[0]];
            try { await runStep(card, card.si + 1, token); }
            catch (e) { done(card, "done", [j.urls[0]]); hint("The next step couldn't start (" + e.message + "). You still have the picture so far.", true); }
            return;
          }
          return done(card, "done", j.urls || []);
        }
        if (j.status === "cancelled") return done(card, "cancelled");
        if (j.status === "error") return done(card, "error", null, j.error || "The render failed.");
        var n = card.plan ? card.plan.length : 1, base = card.si / n * 100;
        card.progress = Math.max(2, Math.min(99, Math.round(base + (j.progress || 0) / n)));
        card.stage = stepLabel(card) + (j.stage || (j.status === "queued" ? "Waiting in the queue" : "Generating")) + (j.eta_seconds > 0 ? " · about " + fmtDur(j.eta_seconds) + " left" : "");
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
    $("bdViewerWhen").textContent = when(c.created_at) + " · " + ((VIEWS[c.view] || {}).label || "") + " · " + ({ flux2: "FLUX.2", zimage: "Z-Image", flux3: "FLUX 3" }[c.model] || MODEL_NAMES[c.model] || c.model || "");
    $("bdViewerSpecs").innerHTML = specs(c.settings || {}).concat([["Model", modelsLabel(c)]]).map(function (s) { return "<li><span>" + esc(s[0]) + "</span><b>" + esc(s[1]) + "</b></li>"; }).join("");
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
  var MODEL_NAMES = { flux3: "FLUX 3 Klein", zimage: "Z-Image Turbo", flux2: "FLUX.2 Dev", klein9b_edit: "FLUX.2 Klein 9B (edit)", flux2_edit: "FLUX.2 Dev (edit)", qwen_edit2509: "Qwen Image Edit 2509" };
  function modelsLabel(c) {
    var s = c.settings || {}, list = s.models && s.models.length ? s.models : [c.model || "zimage"];
    return list.map(function (m) { return MODEL_NAMES[m] || m; }).join(" + ");
  }
  function specs(s) {
    if (!s || !s.shape) return [];
    var out = [];
    if (s.char) out.push(["Character", s.char.handle ? "@" + s.char.handle : (s.char.name || "Influencer")]);
    if (s["with"]) out.push(["With", (s["with"].handle ? "@" + s["with"].handle : (s["with"].name || "Influencer")) + " · " + fromList(DUO, s.duo || "side")[1]]);
    if (s.pose && s.pose.preset && s.pose.preset !== "hold") out.push(["Pose", fromList(POSES, s.pose.preset)[1] + (s.pose.seat && s.pose.seat !== "none" && (s.pose.preset === "sit" || s.pose.preset === "custom") ? " · " + fromList(SEATS, s.pose.seat)[1] : "") + (s.pose.match || s.pose.preset === "custom" ? " (matched)" : "")]);
    out.push(["Skin", s.char ? "Their own" : fromList(SKIN, s.skin)[1]], ["Height", ftIn(s.height)], ["Exaggeration", exagLabel(s.exag) + " (" + s.exag + ")"]);
    var hh = s.pick && s.pick.hair ? fromList(LOOK[0].opts, s.pick.hair[0])[1] : "", hcol = s.pick && s.pick.haircolor ? fromList(LOOK[1].opts, s.pick.haircolor[0])[1] : "";
    if (hh) out.push(["Hair", hh + (hcol && s.pick.haircolor[0] !== "own" ? " · " + hcol : "")]);
    SHAPE.forEach(function (x) { out.push([x.label, (s.shape[x.id] != null ? s.shape[x.id] : "–") + "/10"]); });
    out.push(["Weapon", fromList(WEAPONS, s.weapon)[1]]);
    if (s.weapon && s.weapon !== "none") {
      var busy = s.pose && s.pose.preset && ["hold", "kneel", "custom"].indexOf(s.pose.preset) < 0, pst = fromList(WEAPONS, s.weapon)[3] === "pistol";
      out.push(["Carried", busy || s.hold === "sling" ? (pst ? "Thigh holster" : "Slung on her back") : fromList(HOLDS, s.hold)[1]]);
    }
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
      weapon: state.weapon, hold: state.hold, view: state.view, aspect: state.aspect || "auto", camlock: state.camlock || "on", loraMode: loraMode(), gender: state.gender || "female", style: state.style, bg: state.bg, extra: $("bdExtra") ? $("bdExtra").value.trim() : "",
      hairTouched: !!state.hairTouched, pose: clone(state.pose || DEFAULTS.pose), duo: state.duo || "side", withOpts: clone(state.withOpts || {}),
      "with": state["with"] ? { key: state["with"].key, name: state["with"].name, handle: state["with"].handle, kind: state["with"].kind, thumb: state["with"].thumb, url: state["with"].url } : null,
      char: state.char ? { key: state.char.key, name: state.char.name, handle: state.char.handle, kind: state.char.kind, thumb: state.char.thumb, url: state.char.url } : null };
  }
  function applySettings(s, quiet) {
    if (!s) return;
    ["skin", "height", "exag", "weapon", "hold", "view", "aspect", "camlock", "loraMode", "gender", "style", "bg"].forEach(function (k) { if (s[k] != null) state[k] = s[k]; });
    if (!VIEWS[state.view]) state.view = "sheet";
    if (s.shape) state.shape = Object.assign(clone(DEFAULTS.shape), s.shape);
    if (s.pick) state.pick = Object.assign(clone(DEFAULTS.pick), clone(s.pick));
    // old saves: the "Shades" gear chip became the Eyewear picker
    var gi = (state.pick.gear || []).indexOf("shades");
    if (gi >= 0) { state.pick.gear.splice(gi, 1); if (!s.pick.eyewear) state.pick.eyewear = ["shield"]; }
    if (!quiet && $("bdExtra")) $("bdExtra").value = s.extra || "";
    else if (quiet && s.extra != null) state._extra = s.extra;
    if ("char" in s) state.char = s.char || null;
    if ("with" in s) state["with"] = s["with"] || null;
    state.pose = s.pose ? clone(s.pose) : clone(DEFAULTS.pose); if (s.duo) state.duo = s.duo; state.withOpts = s.withOpts ? clone(s.withOpts) : {};
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
  function savePrefs() { try { localStorage.setItem(PREFS, JSON.stringify({ engineV: 3, engine: state.engine, editEngine: state.editEngine, batch: state.batch, last: snapshot() })); } catch (e) {} }

  // ------------------------------------------------------------ boot
  window.BADDIES_STYLES = STYLES;
  window.BADDIES_SET_POSE = function (custom) { state.pose = { preset: "custom", custom: custom, match: true, look: lookOf(), seat: (state.pose && state.pose.seat) || "none" }; sync(); };
  window.BADDIES_SET_STYLE = function (id) { if (STYLES.some(function (x) { return x[0] === id; })) { state.style = id; sync(); } };
  if (CFG.preview === false && $("bdPreview")) { $("bdPreview").remove(); $("bd").classList.add("no-preview"); }
  renderPanel();
  if (state._extra) { $("bdExtra").value = state._extra; delete state._extra; }
  state.height = clampN(state.height, +$("bdHeight").min, +$("bdHeight").max);
  addThumbs();
  setupSections();
  wire();
  sync();
  if (client) {
    client.auth.getSession().then(function (r) { setUser(r.data.session ? r.data.session.user : null); });
    client.auth.onAuthStateChange(function (_e, sess) { var n = sess ? sess.user : null; if ((n && n.id) !== (state.user && state.user.id)) setUser(n); });
  } else setUser(null);
  if (window.AIRH_GPU) AIRH_GPU.onChange(function () { syncOff(); if (state.user) refreshGpu(); });
})();

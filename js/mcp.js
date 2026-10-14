// AI Resource Hub — MCP page (Higgsfield-style).
// Agent switcher + hero, personal MCP keys (stored as SHA-256 in Supabase
// "mcp_keys"; the render server checks them), per-agent setup for macOS and
// Windows, copyable prompts, model strip, tool list and FAQ.

(function () {
  // Members: one router address that sends each request to the member's own PC
  // (GPU Connector) or, if the admin approved them, to the admin's GPU.
  // The admin keeps his direct address to his own GPU.
  var HOST_MCP = "https://render.airesourcehub.vip/mcp";
  var MEMBER_MCP = "https://flzhhgfkpdmszucoljpu.supabase.co/functions/v1/gpu-mcp";
  var MCP_URL = MEMBER_MCP;
  function pickUrl() {
    var st = window.AIRH_GPU ? window.AIRH_GPU.state() : {};
    var next = st && st.isAdmin ? HOST_MCP : MEMBER_MCP;
    if (next !== MCP_URL) {
      MCP_URL = next;
      var span = document.querySelector("#heroUrl span");
      if (span) span.textContent = MCP_URL;
      if (typeof renderAgent === "function") renderAgent();
    }
  }
  window.addEventListener("airh-gpu-change", pickUrl);
  var KEY_PH = "YOUR_KEY";
  var $ = function (id) { return document.getElementById(id); };
  if (!$("mcpPage")) return;

  var hasSupabase = !!(window.supabase && typeof SUPABASE_URL !== "undefined");
  var client = hasSupabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

  var state = { agent: "claude", os: /Win/i.test(navigator.platform || navigator.userAgent) ? "win" : "mac", key: null, user: null };

  // ------------------------------------------------------------ agents
  function keyUrl() { return MCP_URL + "/k/" + (state.key || KEY_PH); }
  function bearer() { return "Bearer " + (state.key || KEY_PH); }
  function k() { return state.key || KEY_PH; }
  function home(mac, win) { return state.os === "win" ? win : mac; }
  function term() { return state.os === "win" ? "PowerShell" : "Terminal"; }

  var AGENTS = [
    { id: "claude", name: "Claude", ic: "C", color: "#d97757", cta: "Connect to Claude", top: true,
      steps: function () { return [
        { t: "Open Claude", d: "On claude.ai or in the Claude desktop app, go to Customize → Connectors. Custom connectors work on every plan (the free plan allows one)." },
        { t: "Add a custom connector", d: "Click + Add → Add custom connector. Name it AI Resource Hub and paste this URL:", code: MCP_URL },
        { t: "Add your key", d: "Set Authentication to No sign in. Under Request headers, add the name Authorization with this value:", code: bearer() },
        { t: "Start creating", d: "Click Add, turn the connector on in a chat, then ask for an image, an influencer or a video." }
      ]; } },
    { id: "chatgpt", name: "ChatGPT", ic: "G", color: "#10a37f", cta: "Connect to ChatGPT", top: true,
      steps: function () { return [
        { t: "Open Plugins", d: "In ChatGPT, click Plugins in the left sidebar (or go to chatgpt.com/plugins). No Developer mode needed any more." },
        { t: "Add a custom MCP server", d: "Click Add (top right) → Add custom MCP server. Name it AI Resource Hub." },
        { t: "Paste your link", d: "Under Connection keep Server URL selected and paste this link. Your key is inside it, so keep it private:", code: keyUrl() },
        { t: "No authentication, then create", d: "Set Authentication to No authentication, tick I understand and want to continue, then click Create as a plugin." },
        { t: "Use it in a chat", d: "Start a new chat, type @ and pick AI Resource Hub, then ask for an image, an influencer or a video." }
      ]; } },
    { id: "claude-code", name: "Claude Code", ic: "CC", color: "#d97757", cli: true, top: true,
      prompt: function () { return "Set up AI Resource Hub for me so I can generate images and videos from here.\n1. Run: claude mcp add --transport http --scope user airh " + MCP_URL + ' --header "Authorization: ' + bearer() + '"\n2. Check it shows up in /mcp.\nThen tell me when it\'s ready.'; },
      steps: function () { return [
        { t: "Paste the prompt above into Claude Code", d: "Or run the command yourself in " + term() + ":", code: "claude mcp add --transport http --scope user airh " + MCP_URL + ' --header "Authorization: ' + bearer() + '"' },
        { t: "Check the connection", d: "Start Claude Code and type /mcp. AI Resource Hub should show as connected with 12 tools." },
        { t: "Start creating", d: "Ask: \"Use airh to make a full-body AI influencer, then show me the link.\"" }
      ]; } },
    { id: "cursor", name: "Cursor", ic: "Cu", color: "#7c7c86", top: true,
      steps: function () { return [
        { t: "Open your MCP settings file", d: "Cursor Settings → MCP → Add new MCP server opens it. Or edit it directly:", code: home("~/.cursor/mcp.json", "%USERPROFILE%\\.cursor\\mcp.json") },
        { t: "Add AI Resource Hub", d: "Put this in the file (merge it into mcpServers if you already have one):", code: JSON.stringify({ mcpServers: { airh: { url: MCP_URL, headers: { Authorization: bearer() } } } }, null, 2) },
        { t: "Start creating", d: "Save, make sure the server shows green in Cursor Settings → MCP, then ask the agent for an image or video." }
      ]; } },
    { id: "vscode", name: "VS Code", ic: "VS", color: "#2f80ed",
      steps: function () { return [
        { t: "Add an MCP server", d: "In VS Code with GitHub Copilot, open the Command Palette and run MCP: Add Server, or create this file in your project:", code: ".vscode/mcp.json" },
        { t: "Paste the config", d: "Use this server entry:", code: JSON.stringify({ servers: { airh: { type: "http", url: MCP_URL, headers: { Authorization: bearer() } } } }, null, 2) },
        { t: "Start creating", d: "Open Copilot Chat in Agent mode, make sure the airh tools are ticked, and ask for an image or video." }
      ]; } },
    { id: "windsurf", name: "Windsurf", ic: "W", color: "#0ea5a4",
      steps: function () { return [
        { t: "Open the MCP config", d: "In Windsurf, open Manage MCPs → View raw config, or edit:", code: home("~/.codeium/windsurf/mcp_config.json", "%USERPROFILE%\\.codeium\\windsurf\\mcp_config.json") },
        { t: "Add AI Resource Hub", d: "Windsurf uses serverUrl for remote servers:", code: JSON.stringify({ mcpServers: { airh: { serverUrl: MCP_URL, headers: { Authorization: bearer() } } } }, null, 2) },
        { t: "Refresh", d: "Click Refresh in Manage MCPs, then ask Cascade for an image or video." }
      ]; } },
    { id: "gemini", name: "Gemini CLI", ic: "Ge", color: "#4285f4", cli: true,
      prompt: function () { return "Set up AI Resource Hub for me so I can generate images and videos from here.\nRun: gemini mcp add -s user --transport http airh " + MCP_URL + ' --header "Authorization: ' + bearer() + '"\nThen confirm with /mcp.'; },
      steps: function () { return [
        { t: "Add the server", d: "In " + term() + ", run:", code: "gemini mcp add -s user --transport http airh " + MCP_URL + ' --header "Authorization: ' + bearer() + '"' },
        { t: "Or edit settings.json", d: "Add this to " + home("~/.gemini/settings.json", "%USERPROFILE%\\.gemini\\settings.json") + " (Gemini CLI uses httpUrl for streamable HTTP):", code: JSON.stringify({ mcpServers: { airh: { httpUrl: MCP_URL, headers: { Authorization: bearer() } } } }, null, 2) },
        { t: "Start creating", d: "Run gemini, type /mcp to check the tools, then ask for an image or video." }
      ]; } },
    { id: "codex", name: "Codex CLI", ic: "Cx", color: "#9b9ba3", cli: true,
      prompt: function () { return "Set up AI Resource Hub for me so I can generate images and videos from here.\n1. Save my key in the AIRH_MCP_KEY environment variable.\n2. Run: codex mcp add airh --url " + MCP_URL + " --bearer-token-env-var AIRH_MCP_KEY\nThen tell me when it's ready."; },
      steps: function () { return [
        { t: "Save your key as an environment variable", d: state.os === "win" ? "In PowerShell (then open a new window):" : "In Terminal (zsh):",
          code: state.os === "win" ? 'setx AIRH_MCP_KEY "' + k() + '"' : "echo 'export AIRH_MCP_KEY=\"" + k() + "\"' >> ~/.zshrc && source ~/.zshrc" },
        { t: "Add the server", d: "Codex reads the key from that variable:", code: "codex mcp add airh --url " + MCP_URL + " --bearer-token-env-var AIRH_MCP_KEY" },
        { t: "Start creating", d: "Start codex and ask for an image or video. The settings live in " + home("~/.codex/config.toml", "%USERPROFILE%\\.codex\\config.toml") + "." }
      ]; } },
    { id: "other", name: "Any MCP app", ic: "+", color: "#ff6a1f",
      steps: function () { return [
        { t: "Apps that support remote servers", d: "Use Streamable HTTP with this URL and header:", code: MCP_URL + "\nAuthorization: " + bearer() },
        { t: "Apps that can't send headers", d: "Use the URL with your key built in (keep it private):", code: keyUrl() },
        { t: "Apps that only run local servers", d: "Install Node.js 18+ from nodejs.org (macOS and Windows), then use this command as the server:", code: "npx -y mcp-remote " + keyUrl() }
      ]; } }
  ];
  var TOP = AGENTS.filter(function (a) { return a.top; });

  // ------------------------------------------------------------ prompts
  var FLOWS = [
    { cat: "Influencers", t: "Create an AI influencer", d: "A full-body character saved to your AI Influencer page.", p: "Use AI Resource Hub to create an AI influencer named Luna: a young adult Latina woman with big curly hair, gold hoops and a Y2K outfit. Full-body shot. Show me the image when it's done." },
    { cat: "Influencers", t: "Turnaround sheet", d: "Front, side and back views of one character.", p: "With AI Resource Hub, create an influencer turnaround sheet of a tall Black man with a silver buzz cut, streetwear and a gold chain." },
    { cat: "Influencers", t: "Influencer from my photo", d: "Keeps your face, changes everything else.", p: "Turn this photo of me into an AI influencer with a retro 70s look using AI Resource Hub: <photo URL>" },
    { cat: "Video", t: "Make them dance", d: "Motion transfer with WAN 2.2 Animate.", p: "Take my latest AI influencer from AI Resource Hub and make them copy the moves in this dance video: <video URL>. Portrait, 5 seconds." },
    { cat: "Audio", t: "Lip-sync a verse", d: "A photo that raps or sings your audio (LTX 2).", p: "Use AI Resource Hub to lip-sync this face to my audio. Face: <image URL> Audio: <mp3 URL>" },
    { cat: "Images", t: "Album cover", d: "Square cover art with FLUX.2.", p: "Generate a 1024x1024 album cover on AI Resource Hub with the flux2 model: neon-lit Miami street at night, rain reflections, cinematic, title space at the top." },
    { cat: "Images", t: "4 YouTube thumbnails", d: "Fast batch with Z-Image Turbo.", p: "Make 4 YouTube thumbnail options at 1344x768 with zimage on AI Resource Hub: a shocked producer in a home studio surrounded by glowing speakers." },
    { cat: "Images", t: "Edit a photo", d: "Change a photo with words (Qwen Edit).", p: "Edit this photo with qwen_edit2509 on AI Resource Hub: put the person on a yacht at sunset. Keep their face. <photo URL>" },
    { cat: "Images", t: "Reframe to 9:16", d: "Edit and change the shape in one go.", p: "With AI Resource Hub, edit this image into a 768x1344 vertical version for TikTok, extending the scene naturally: <image URL>" },
    { cat: "Images", t: "Product shot", d: "Clean studio product photo.", p: "Generate a product photo on AI Resource Hub: matte black headphones on wet stone, soft studio light, 1216x832." },
    { cat: "Utility", t: "Is the GPU free?", d: "Queue and GPU status.", p: "Check the AI Resource Hub GPU status and tell me how many jobs are waiting." },
    { cat: "Utility", t: "What did I make?", d: "Your latest images and videos.", p: "List my recent AI Resource Hub results with links." }
  ];
  var CATS = ["All", "Influencers", "Images", "Video", "Audio", "Utility"];
  var flowCat = "All";

  var MODELS = [
    ["zimage", "Z-Image Turbo"], ["flux2", "FLUX.2"], ["qwen2512", "Qwen-Image 2512"], ["krea2", "Krea 2 Turbo"],
    ["hidream", "HiDream O1"], ["sd35", "Stable Diffusion 3.5"], ["anima", "Anima"], ["qwen_edit2509", "Qwen Edit 2509"],
    ["qwen_edit2511", "Qwen Edit 2511"], ["firered", "FireRed Edit"], ["flux2_edit", "FLUX.2 Edit"], ["", "WAN 2.2 Animate"], ["", "LTX 2"]
  ];

  var TOOLS = [
    ["generate_image", "Create or edit images with any of our models."],
    ["create_influencer", "Design an AI influencer and save it to your page."],
    ["motion_transfer", "Make a character copy the moves in a video."],
    ["lip_sync", "Make a face talk or sing your audio."],
    ["wait_for_job", "Wait for a render and get the result links."],
    ["job_status", "Check on a render in progress."],
    ["cancel_job", "Stop a render you no longer need."],
    ["list_influencers", "Your saved characters with images."],
    ["recent_results", "Your latest images and videos."],
    ["gpu_status", "Is your GPU free, and how long is the line."],
    ["list_image_models", "Which models are available."],
    ["list_loras", "Styles and identities installed on the GPU."]
  ];

  var FAQ = [
    ["What is MCP?", "Model Context Protocol is the open standard AI apps use to plug in tools. Connect once and your AI can render on your GPU whenever you ask."],
    ["Which apps work?", "Claude (web, desktop and Claude Code), ChatGPT (Plugins → Add custom MCP server), Cursor, VS Code with Copilot, Windsurf, Gemini CLI, Codex CLI, and any other app that supports remote MCP servers."],
    ["Where do my renders go?", "Everything shows up on the site too: images in Image Studio and My Images, characters in AI Influencer, videos in your render archives."],
    ["Why does it take a moment?", "Jobs run on your GPU one at a time. Your AI waits for each one and shares the link when it is done."],
    ["Which GPU does my AI use?", "Your own. Connect your PC once on the My GPU page (airesourcehub.vip/gpu) and keep the GPU Connector open while your AI works. If the admin has approved you for his GPU, your AI uses that whenever your PC is offline."],
    ["Is my key safe?", "We only store a scrambled copy of it. Anyone with the key can render as you, so don't share it. Revoke a key here any time and it stops working within a minute."],
    ["Mac or Windows?", "Both. Pick your computer above the setup steps and the file paths and commands change to match."]
  ];

  // ------------------------------------------------------------ render
  function agentById(id) { return AGENTS.filter(function (a) { return a.id === id; })[0] || AGENTS[0]; }

  function renderPills() {
    var otherOn = !agentById(state.agent).top;
    var html = TOP.map(function (a) {
      return '<button type="button" class="mcp-pill' + (a.id === state.agent ? " is-on" : "") + '" data-agent="' + a.id + '">' + icon(a) + esc(a.name) + "</button>";
    }).join("");
    html += '<div class="mcp-more"><button type="button" class="mcp-pill' + (otherOn ? " is-on" : "") + '" id="moreBtn" aria-expanded="false">' +
      (otherOn ? icon(agentById(state.agent)) + esc(agentById(state.agent).name) : '<span class="mcp-dots">&middot;&middot;&middot;</span>Other') +
      ' <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>' +
      '<div class="mcp-more-menu" id="moreMenu" hidden><p>Connect AI Resource Hub to another agent</p>' +
      AGENTS.filter(function (a) { return !a.top; }).map(function (a) {
        return '<button type="button" data-agent="' + a.id + '">' + icon(a) + esc(a.name) + "</button>";
      }).join("") + "</div></div>";
    $("agentPills").innerHTML = html;
  }

  function icon(a) { return '<span class="mcp-ag-ic" style="--c:' + a.color + '">' + esc(a.ic) + "</span>"; }

  function renderAgent() {
    var a = agentById(state.agent);
    $("heroAgentName").textContent = a.name;
    $("heroAgentIc").textContent = a.ic;
    $("heroAgentIc").style.setProperty("--c", a.color);
    $("setupAgentName").textContent = a.name;
    $("modelsAgent").textContent = a.name;
    $("ctaMain").textContent = a.cta || "Set up " + a.name;
    var cli = !!a.cli;
    $("heroPrompt").hidden = !cli;
    $("heroCta").hidden = cli;
    if (cli) {
      $("heroPromptLabel").textContent = "Copy and send this to " + a.name;
      $("heroPromptText").textContent = a.prompt();
    }
    renderSteps($("setupSteps"), a);
    renderPills();
    try { history.replaceState(null, "", location.pathname + "?agent=" + a.id); } catch (e) {}
  }

  function renderSteps(ol, a) {
    ol.innerHTML = a.steps().map(function (s, i) {
      var id = "code-" + ol.id + "-" + i;
      return '<li><span class="mcp-step-n">' + (i + 1) + '</span><div class="mcp-step-body"><h3>' + esc(s.t) + "</h3><p>" + esc(s.d) + "</p>" +
        (s.code ? '<div class="mcp-code"><pre id="' + id + '">' + esc(s.code) + '</pre><button type="button" class="mcp-copy" data-copy-target="' + id + '">Copy</button></div>' : "") +
        "</div></li>";
    }).join("");
  }

  function renderFlows() {
    $("flowFilters").innerHTML = CATS.map(function (c) {
      return '<button type="button" class="mcp-filter' + (c === flowCat ? " is-on" : "") + '" data-cat="' + c + '">' + c + "</button>";
    }).join("");
    var q = ($("flowSearch").value || "").toLowerCase();
    var list = FLOWS.filter(function (f) {
      return (flowCat === "All" || f.cat === flowCat) && (!q || (f.t + " " + f.d + " " + f.p).toLowerCase().indexOf(q) > -1);
    });
    $("flowGrid").innerHTML = list.map(function (f, i) {
      var id = "flow-" + i;
      return '<article class="mcp-flow"><span class="mcp-flow-cat">' + esc(f.cat) + "</span><h3>" + esc(f.t) + "</h3><p>" + esc(f.d) + "</p>" +
        '<pre id="' + id + '">' + esc(f.p) + '</pre><button type="button" class="mcp-copy is-wide" data-copy-target="' + id + '">Copy prompt</button></article>';
    }).join("") || '<p class="mcp-note">No prompts match that search.</p>';
  }

  function renderStatic() {
    var chips = MODELS.map(function (m) {
      var img = m[0] ? '<span class="mcp-model-img" style="background-image:url(img/models/' + m[0] + '.jpg)"></span>' : '<span class="mcp-model-img is-video"></span>';
      return '<span class="mcp-model">' + img + esc(m[1]) + "</span>";
    }).join("");
    $("modelTrack").innerHTML = chips + chips;
    $("toolGrid").innerHTML = TOOLS.map(function (t) { return '<div class="mcp-tool"><code>' + t[0] + "</code><p>" + esc(t[1]) + "</p></div>"; }).join("");
    $("faqList").innerHTML = FAQ.map(function (f) { return "<details class=\"mcp-q\"><summary>" + esc(f[0]) + "</summary><p>" + esc(f[1]) + "</p></details>"; }).join("");
  }

  function openHow() {
    var a = agentById(state.agent);
    var tabs = [a].concat(TOP.filter(function (x) { return x.id !== a.id; })).slice(0, 4);
    $("howTabs").innerHTML = tabs.map(function (x, i) { return '<button type="button" data-how="' + x.id + '" class="' + (i === 0 ? "is-on" : "") + '">' + esc(x.name) + "</button>"; }).join("");
    renderSteps($("howSteps"), a);
    $("howModal").hidden = false;
    document.body.style.overflow = "hidden";
  }
  function closeHow() { $("howModal").hidden = true; document.body.style.overflow = ""; }

  // ------------------------------------------------------------ keys
  async function loadKeys() {
    if (!client || !state.user) return;
    var r = await client.from("mcp_keys").select("id, name, key_prefix, created_at, last_used_at, revoked_at").eq("user_id", state.user.id).order("created_at", { ascending: false });
    var rows = r.data || [];
    $("keyList").innerHTML = rows.length ? rows.map(function (k) {
      var off = !!k.revoked_at;
      return '<li class="' + (off ? "is-off" : "") + '"><div><strong>' + esc(k.name) + "</strong><code>" + esc(k.key_prefix) + "…</code></div>" +
        "<span>" + (off ? "Revoked" : k.last_used_at ? "Used " + when(k.last_used_at) : "Never used") + "</span>" +
        (off ? "" : '<button type="button" class="mcp-revoke" data-id="' + k.id + '">Revoke</button>') + "</li>";
    }).join("") : '<li class="mcp-empty">No keys yet.</li>';
  }

  async function createKey(e) {
    e.preventDefault();
    if (!client || !state.user) return;
    var bytes = new Uint8Array(30);
    crypto.getRandomValues(bytes);
    var raw = "airh_" + btoa(String.fromCharCode.apply(null, bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    var hashBuf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
    var hash = Array.prototype.map.call(new Uint8Array(hashBuf), function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
    var name = $("keyName").value.trim() || agentById(state.agent).name + " key";
    var ins = await client.from("mcp_keys").insert({ user_id: state.user.id, name: name.slice(0, 40), key_prefix: raw.slice(0, 12), key_hash: hash });
    if (ins.error) { alertNote("Couldn't create the key: " + ins.error.message); return; }
    state.key = raw;
    $("keyValue").textContent = raw;
    $("keyFresh").hidden = false;
    $("keyName").value = "";
    renderAgent();
    loadKeys();
  }

  async function revokeKey(id) {
    if (!window.confirm("Revoke this key? Any app using it stops working.")) return;
    await client.from("mcp_keys").update({ revoked_at: new Date().toISOString() }).eq("id", id);
    loadKeys();
  }

  function alertNote(t) {
    var p = document.createElement("p"); p.className = "mcp-note is-err"; p.textContent = t;
    $("keyForm").insertAdjacentElement("afterend", p);
    setTimeout(function () { p.remove(); }, 6000);
  }

  // ------------------------------------------------------------ wiring
  document.addEventListener("click", function (e) {
    var ag = e.target.closest("[data-agent]");
    if (ag) { state.agent = ag.getAttribute("data-agent"); renderAgent(); return; }
    if (e.target.closest("#moreBtn")) {
      var m = $("moreMenu"); m.hidden = !m.hidden; $("moreBtn").setAttribute("aria-expanded", String(!m.hidden)); return;
    }
    if (!e.target.closest(".mcp-more") && $("moreMenu")) $("moreMenu").hidden = true;
    var cp = e.target.closest("[data-copy-target]");
    if (cp) { copy($(cp.getAttribute("data-copy-target")).textContent, cp); return; }
    var how = e.target.closest("[data-how]");
    if (how) {
      Array.prototype.forEach.call($("howTabs").children, function (b) { b.classList.toggle("is-on", b === how); });
      renderSteps($("howSteps"), agentById(how.getAttribute("data-how"))); return;
    }
    if (e.target.closest("[data-close]")) { closeHow(); return; }
    var f = e.target.closest("[data-cat]");
    if (f) { flowCat = f.getAttribute("data-cat"); renderFlows(); return; }
    var rv = e.target.closest(".mcp-revoke");
    if (rv) revokeKey(rv.getAttribute("data-id"));
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("howModal").hidden) closeHow(); });
  $("ctaHow").addEventListener("click", openHow);
  $("ctaMain").addEventListener("click", function () {
    if (!state.key) $("keySection").scrollIntoView({ behavior: "smooth", block: "center" });
    else $("setup").scrollIntoView({ behavior: "smooth" });
  });
  $("heroUrl").addEventListener("click", function () { copy(MCP_URL, $("heroUrl")); });
  $("flowSearch").addEventListener("input", renderFlows);
  $("keyForm").addEventListener("submit", createKey);
  Array.prototype.forEach.call($("osSeg").querySelectorAll("button"), function (b) {
    b.addEventListener("click", function () {
      state.os = b.getAttribute("data-os");
      Array.prototype.forEach.call($("osSeg").children, function (x) { x.classList.toggle("is-on", x === b); });
      renderAgent();
    });
  });

  function copy(text, btn) {
    var done = function () { var o = btn.getAttribute("data-label") || btn.textContent; btn.setAttribute("data-label", o); btn.classList.add("is-done"); if (btn.classList.contains("mcp-copy")) btn.textContent = "Copied"; setTimeout(function () { btn.classList.remove("is-done"); if (btn.classList.contains("mcp-copy")) btn.textContent = o; }, 1400); };
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, done); else done();
  }

  // ------------------------------------------------------------ boot
  try { var qa = new URLSearchParams(location.search).get("agent"); if (qa && agentById(qa).id === qa) state.agent = qa; } catch (e) {}
  Array.prototype.forEach.call($("osSeg").children, function (x) { x.classList.toggle("is-on", x.getAttribute("data-os") === state.os); });
  renderStatic();
  renderFlows();
  renderAgent();

  function setUser(u) {
    state.user = u;
    pickUrl();
    if (window.AIRH_GPU) window.AIRH_GPU.refresh().then(pickUrl).catch(function () {});
    $("keySignedOut").hidden = !!u;
    $("keySignedIn").hidden = !u;
    if (u) loadKeys();
  }
  if (client) {
    client.auth.getSession().then(function (r) { setUser(r.data.session ? r.data.session.user : null); });
    client.auth.onAuthStateChange(function (_e, s) { var n = s ? s.user : null; if ((n && n.id) !== (state.user && state.user.id)) setUser(n); });
  } else setUser(null);

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function when(iso) {
    var d = new Date(iso), s = (Date.now() - d) / 1000;
    if (s < 60) return "just now"; if (s < 3600) return Math.floor(s / 60) + " min ago"; if (s < 86400) return Math.floor(s / 3600) + " h ago";
    return d.toLocaleDateString();
  }
})();

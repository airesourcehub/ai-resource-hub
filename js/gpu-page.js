// AI Resource Hub — My GPU page (gpu.html)
(function () {
  var $ = function (id) { return document.getElementById(id); };
  if (!$("gpuPage")) return;
  var hasSb = !!(window.supabase && typeof SUPABASE_URL !== "undefined");
  var client = hasSb ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
  var G = window.AIRH_GPU;
  var state = { user: null, os: /Win/i.test(navigator.platform || navigator.userAgent) ? "win" : (/Mac/i.test(navigator.platform || navigator.userAgent) ? "mac" : "linux"), access: null, adminMounted: false };

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function when(iso) {
    if (!iso) return "never";
    var s = (Date.now() - Date.parse(iso)) / 1000;
    if (s < 60) return "just now"; if (s < 3600) return Math.floor(s / 60) + " min ago"; if (s < 86400) return Math.floor(s / 3600) + " h ago";
    return new Date(iso).toLocaleDateString();
  }
  function hostName() { return G ? G.hostName() : "the host GPU"; }

  // ------------------------------------------------------------ setup steps per OS
  var OS = {
    win: {
      steps: [
        ["Download and unzip", "Click <b>Download GPU Connector</b>, then right-click the zip → <b>Extract All</b>. Put the folder somewhere with space, like <code>C:\\AIRH-GPU-Connector</code>."],
        ["Run the installer", "Double-click <code>Install-Windows.cmd</code>. If SmartScreen appears, click <b>More info → Run anyway</b>."],
        ["Paste your PC token", "Use the token from Step 1 on this page. Pick <b>Install ComfyUI for me</b> (or point it at your own ComfyUI), then choose model packs."],
        ["Go online", "Double-click <code>Start-Windows.cmd</code>. When it says <b>ONLINE</b>, open Image Studio. Keep that window open while you create."]
      ],
      req: [["Graphics card", "NVIDIA RTX with 12 GB+ VRAM. 24 GB (3090/4090/5090) for video tools."], ["System", "Windows 10 or 11, 16 GB+ RAM, latest NVIDIA driver."], ["Disk", "30 GB for Fast images, up to 200 GB for every pack."]]
    },
    mac: {
      steps: [
        ["Download and unzip", "Click <b>Download GPU Connector</b>. Safari unzips it into Downloads; move the folder anywhere with space."],
        ["Run the installer", "Right-click <code>Install-Mac.command</code> → <b>Open</b> → <b>Open</b> (macOS asks the first time). Or in Terminal: <code>bash Install-Mac.command</code>."],
        ["Paste your PC token", "Use the token from Step 1. Pick <b>Install ComfyUI for me</b>, then the <b>Fast images</b> pack (the one that runs on a Mac)."],
        ["Go online", "Right-click <code>Start-Mac.command</code> → <b>Open</b>. When it says <b>ONLINE</b>, open Image Studio. Keep the window open."]
      ],
      req: [["Chip", "Apple Silicon (M1 or newer) with 16 GB+ memory. 32 GB+ is smoother."], ["What runs", "Fast images (Z-Image Turbo) and AI Influencer. Video packs need an NVIDIA PC."], ["Disk", "About 30 GB."]]
    },
    linux: {
      steps: [
        ["Download and unzip", "<code>unzip AIRH-GPU-Connector.zip</code> somewhere with space."],
        ["Run the installer", "<code>bash AIRH-GPU-Connector/install-linux.sh</code>"],
        ["Paste your PC token", "Use the token from Step 1, then pick ComfyUI and model packs."],
        ["Go online", "<code>bash AIRH-GPU-Connector/start-linux.sh</code> — keep it running while you create (tmux works too)."]
      ],
      req: [["Graphics card", "NVIDIA RTX with 12 GB+ VRAM and a recent driver (CUDA 12.8 wheels)."], ["Tools", "curl, unzip. ffmpeg for video tools: <code>sudo apt install ffmpeg</code>."], ["Disk", "30–200 GB depending on packs."]]
    }
  };
  function paintOs() {
    Array.prototype.forEach.call($("osSeg").querySelectorAll("button"), function (b) { b.classList.toggle("is-on", b.getAttribute("data-os") === state.os); });
    var o = OS[state.os];
    $("osSteps").innerHTML = o.steps.map(function (s) { return "<li><b>" + s[0] + "</b><p>" + s[1] + "</p></li>"; }).join("");
    $("osReq").innerHTML = o.req.map(function (r) { return "<div><b>" + r[0] + "</b>" + r[1] + "</div>"; }).join("");
  }
  $("osSeg").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-os]"); if (!b) return;
    state.os = b.getAttribute("data-os"); paintOs();
  });
  paintOs();

  // ------------------------------------------------------------ packs
  var TOOL = { image: "Image Studio", influencer: "AI Influencer", motion: "Motion Transfer", transitions: "AI Transitions", lipsync: "Lip Sync" };
  fetch("downloads/packs.json", { cache: "no-cache" }).then(function (r) { return r.json(); }).then(function (j) {
    $("packGrid").innerHTML = j.packs.map(function (p) {
      return '<div class="gp-pack"><h3>' + esc(p.name) + "</h3><p>" + esc(p.about) + '</p><div class="gp-pack-meta">' +
        '<span class="gp-tag">' + Math.round(p.gb) + " GB download</span>" +
        '<span class="gp-tag">' + p.min_vram + " GB+ VRAM</span>" +
        (p.mac ? '<span class="gp-tag">Mac OK</span>' : "") +
        p.tools.map(function (t) { return '<span class="gp-tag">' + esc(TOOL[t] || t) + "</span>"; }).join("") + "</div></div>";
    }).join("");
  }).catch(function () {});

  // ------------------------------------------------------------ "creating on" card
  function paintNow() {
    if (!state.user) return;
    var cur = G ? G.current() : { kind: "none", name: "No GPU connected" };
    $("nowName").textContent = cur.kind === "none" ? (cur.offlinePc ? cur.name : "No GPU connected yet") : cur.name;
    $("nowDot").className = "gp-dot " + (cur.kind === "none" ? (cur.offlinePc ? "is-warn" : "") : "is-on");
    $("nowNote").innerHTML = cur.kind === "pc" ? "Your PC is online. Everything you make renders on it."
      : cur.kind === "host" ? (G.state().isAdmin ? "Your own GPU. Members never see it unless you approve them." : "Approved by the site owner.")
      : cur.offlinePc ? "Open <b>Start</b> in the GPU Connector folder on that PC to bring it online."
      : 'Connect a PC below to start creating.';
    var ch = G ? G.choices() : [];
    var pick = G ? G.pick() : "auto";
    if (ch.length < 2) { $("choiceList").innerHTML = ""; return; }
    $("choiceList").innerHTML = '<label class="gp-choice' + (pick === "auto" ? " is-on" : "") + '"><input type="radio" name="gpuPick" value="auto"' + (pick === "auto" ? " checked" : "") + " />Automatic<small>" + (G.state().isAdmin ? "your GPU" : "my PC first") + "</small></label>" +
      ch.map(function (c) {
        var on = c.kind === "host" || c.online;
        return '<label class="gp-choice' + (pick === c.id ? " is-on" : "") + (on ? "" : " is-off") + '"><input type="radio" name="gpuPick" value="' + esc(c.id) + '"' + (pick === c.id ? " checked" : "") + (on ? "" : " disabled") + " />" +
          esc(c.name) + "<small>" + (c.kind === "host" ? "host GPU" : (on ? "online" : "offline")) + "</small></label>";
      }).join("");
  }
  $("choiceList").addEventListener("change", function (e) {
    if (e.target.name === "gpuPick" && G) { G.setPick(e.target.value); paintNow(); }
  });

  // ------------------------------------------------------------ PCs
  async function loadPcs() {
    var r = await client.from("gpu_workers").select("id,name,token_prefix,url,info,last_seen_at,created_at").eq("user_id", state.user.id).is("revoked_at", null).order("created_at");
    var pcs = r.data || [];
    $("pcList").innerHTML = pcs.length ? pcs.map(function (p) {
      var on = G ? G.isOnline(p) || (p.url && p.last_seen_at && Date.now() - Date.parse(p.last_seen_at) < 150000) : false;
      var info = p.info || {}, g = info.gpu || {};
      var tags = (info.packs || []).map(function (x) { return '<span class="gp-tag">' + esc(x.replace(/_/g, " ")) + "</span>"; }).join("");
      return '<li class="gp-pc"><div class="gp-pc-top"><span class="gp-dot ' + (on ? "is-on" : "") + '"></span><span class="gp-pc-name">' + esc(p.name) + "</span>" +
        '<span class="gp-pc-state ' + (on ? "is-on" : "") + '">' + (on ? "Online" : (p.last_seen_at ? "Offline" : "Waiting for setup")) + "</span></div>" +
        '<p class="gp-pc-meta">' + esc([g.name, g.vram_gb ? g.vram_gb + " GB" : "", info.os].filter(Boolean).join(" · ") || "Not connected yet — run the installer and paste the token.") +
        "<br />Token " + esc(p.token_prefix || "") + "… · last seen " + when(p.last_seen_at) + "</p>" +
        (tags ? '<div class="gp-tags">' + tags + "</div>" : "") +
        '<div class="gp-pc-actions"><button type="button" class="gp-btn-sm" data-rename="' + p.id + '">Rename</button>' +
        '<button type="button" class="gp-btn-sm is-danger" data-remove="' + p.id + '">Remove</button></div></li>';
    }).join("") : '<li class="gp-empty">No PCs yet. Name your PC above and click <b>Connect a PC</b> to get its token.</li>';
  }

  function b64url(bytes) { var s = ""; bytes.forEach(function (b) { s += String.fromCharCode(b); }); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
  async function sha256hex(t) {
    var buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
    return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
  }
  $("pcForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    $("pcErr").hidden = true;
    var raw = "airhpc_" + b64url(crypto.getRandomValues(new Uint8Array(30)));
    var name = $("pcName").value.trim() || (state.os === "mac" ? "My Mac" : "My PC");
    var r = await client.from("gpu_workers").insert({ user_id: state.user.id, name: name.slice(0, 40), token_hash: await sha256hex(raw), token_prefix: raw.slice(0, 12) });
    if (r.error) { $("pcErr").textContent = "Couldn't add the PC: " + r.error.message; $("pcErr").hidden = false; return; }
    $("pcToken").textContent = raw;
    $("pcFresh").hidden = false;
    $("pcName").value = "";
    loadPcs();
    if (G) G.refresh();
  });
  $("pcList").addEventListener("click", async function (e) {
    var rm = e.target.closest("[data-remove]"), rn = e.target.closest("[data-rename]");
    if (rm) {
      if (!confirm("Remove this PC? It stops working right away. You can add it again with a new token.")) return;
      await client.from("gpu_workers").update({ revoked_at: new Date().toISOString() }).eq("id", rm.getAttribute("data-remove"));
      loadPcs(); if (G) G.refresh();
    }
    if (rn) {
      var n = prompt("New name for this PC:");
      if (n && n.trim()) { await client.from("gpu_workers").update({ name: n.trim().slice(0, 40) }).eq("id", rn.getAttribute("data-rename")); loadPcs(); if (G) G.refresh(); }
    }
  });

  // ------------------------------------------------------------ host GPU access (members)
  async function loadAccess() {
    var r = await client.from("gpu_access").select("status,message,requested_at,decided_at").eq("user_id", state.user.id).maybeSingle();
    state.access = r.data || null;
    paintAccess();
  }
  function paintAccess() {
    var a = state.access, box = $("hostBox");
    if (a && a.status === "granted") {
      box.innerHTML = '<span class="gp-status-pill is-granted">Approved</span><p class="gp-note" style="margin-top:10px">You can create on ' + esc(hostName()) + ". Pick it in the card at the top of this page, or leave it on Automatic.</p>";
    } else if (a && a.status === "requested") {
      box.innerHTML = '<span class="gp-status-pill is-requested">Request sent ' + when(a.requested_at) + '</span><p class="gp-note" style="margin-top:10px">You\'ll see the answer here. Meanwhile you can connect your own PC.</p>';
    } else {
      box.innerHTML = (a ? '<span class="gp-status-pill is-' + a.status + '">' + (a.status === "denied" ? "Not approved" : "Access removed") + "</span>" : "") +
        '<form id="hostForm"><label class="gp-note" for="hostMsg">Add a short note (optional)</label><textarea id="hostMsg" maxlength="300" placeholder="What you want to make"></textarea>' +
        '<button type="submit" class="btn btn-primary">' + (a ? "Ask again" : "Request access") + "</button></form>";
      $("hostForm").addEventListener("submit", async function (e) {
        e.preventDefault();
        var body = { user_id: state.user.id, status: "requested", message: $("hostMsg").value.trim().slice(0, 300) || null, requested_at: new Date().toISOString(), decided_at: null, decided_by: null, updated_at: new Date().toISOString() };
        var r = a ? await client.from("gpu_access").update(body).eq("user_id", state.user.id) : await client.from("gpu_access").insert(body);
        if (r.error) { alert("Couldn't send: " + r.error.message); return; }
        loadAccess();
      });
    }
  }

  // ------------------------------------------------------------ FAQ
  var FAQ = [
    ["Why my own GPU?", "AI images and videos need a strong graphics card. Running on yours means no waiting in someone else's line and no credits — your PC does the work, the site gives you the tools."],
    ["Is it safe?", "The connector only accepts jobs from your account. It opens a private, encrypted Cloudflare link (no ports to open on your router), and your PC token is stored only as a scrambled copy on our side. Remove the PC here and it stops instantly."],
    ["Do I need to keep a window open?", "Yes — the GPU Connector window. Close it and your PC goes offline; open Start again to come back. Your renders are saved on your PC in the connector's jobs folder."],
    ["What graphics card do I need?", "An NVIDIA RTX card with 12 GB+ VRAM for images; 24 GB (RTX 3090/4090/5090) for the video tools. Apple Silicon Macs run the Fast images pack."],
    ["I already use ComfyUI.", "Pick “I already have ComfyUI” in the installer and point it at your folder. The connector adds the models you choose to your models folder and uses your ComfyUI."],
    ["Can my AI app (Claude, ChatGPT…) use my PC?", "Yes. Make a key on the MCP page and add it to your app. Requests go to your PC whenever it's online."],
    ["Can I use the host GPU instead?", "Only if the site owner approves you. Send a request on this page."]
  ];
  $("faqList").innerHTML = FAQ.map(function (f) { return "<details><summary>" + esc(f[0]) + "</summary><p>" + esc(f[1]) + "</p></details>"; }).join("");

  // ------------------------------------------------------------ copy buttons
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-copy-target]"); if (!b) return;
    var t = $(b.getAttribute("data-copy-target")).textContent;
    (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () {
      b.textContent = "Copied"; b.classList.add("is-done");
      setTimeout(function () { b.textContent = "Copy"; b.classList.remove("is-done"); }, 1600);
    }).catch(function () {});
  });

  // ------------------------------------------------------------ session
  function paintNames() {
    Array.prototype.forEach.call(document.querySelectorAll(".host-name"), function (el) {
      el.textContent = G && G.state().isAdmin ? "your GPU" : hostName();
    });
  }
  async function setUser(u) {
    state.user = u;
    $("nowSignedOut").hidden = !!u; $("nowSignedIn").hidden = !u;
    $("pcsSignedOut").hidden = !!u; $("pcsSignedIn").hidden = !u;
    if (!u) { $("host").hidden = true; $("manage").hidden = true; return; }
    if (G) await G.refresh().catch(function () {});
    var admin = G && G.state().isAdmin;
    paintNames();
    $("host").hidden = !!admin;
    $("manage").hidden = !admin;
    if (admin && !state.adminMounted && window.AIRH_GPU_ADMIN) { window.AIRH_GPU_ADMIN.mount($("gpuAdminMount"), client); state.adminMounted = true; }
    paintNow();
    loadPcs();
    if (!admin) loadAccess();
  }
  window.addEventListener("airh-gpu-change", function () { paintNow(); paintNames(); });
  setInterval(function () { if (state.user && !document.hidden) loadPcs(); }, 30000);
  if (client) {
    client.auth.getSession().then(function (r) { setUser(r.data.session ? r.data.session.user : null); });
    client.auth.onAuthStateChange(function (_e, s) { var n = s ? s.user : null; if ((n && n.id) !== (state.user && state.user.id)) setUser(n); });
  } else setUser(null);
})();

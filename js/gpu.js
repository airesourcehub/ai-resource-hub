// AI Resource Hub — which graphics card your creations run on.
// Loaded in <head> on every page (before the tool scripts).
//   * The admin's own GPU ("host") is private: the admin and members he approves.
//   * Every other member connects their own PC with the GPU Connector (gpu.html).
// Tool scripts call AIRH_GPU.base() for the render address. State is cached in
// localStorage so the right address is known instantly, then refreshed from Supabase.

(function () {
  var HOST = "https://render.airesourcehub.vip";
  var CACHE = "airh-gpu-state", PICK = "airh-gpu-pick";
  var ONLINE_MS = 150000;
  var TOOL_PAGES = /(image-studio|influencer|motion-transfer|lip-sync|wan-video|ai-transitions|train-lora|gpu-status)\.html$/;

  function read(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } }
  function write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  var st = read(CACHE) || {};
  var listeners = [];

  function hostName() {
    var s = read("airh-site-settings") || {};
    return (s.hostGpuName || "").trim() || "Christopher's RTX 3090";
  }
  function age() { return st.t ? Date.now() - st.t : Infinity; }
  function isOnline(pc) {
    if (!pc || !pc.url || !pc.last_seen_at) return false;
    // judge against when we last checked (the cache), so a fresh page load doesn't flip it
    var ref = age() < 30 * 60000 ? st.t : Date.now();
    return ref - Date.parse(pc.last_seen_at) < ONLINE_MS;
  }
  function pcs() { return (st.pcs || []).filter(function (p) { return !p.revoked_at; }); }
  function onlinePcs() { return pcs().filter(isOnline); }
  function hostOk() { return !!(st.isAdmin || st.host === "granted"); }
  function pick() { try { return localStorage.getItem(PICK) || "auto"; } catch (e) { return "auto"; } }

  function hostChoice() { return { kind: "host", id: "host", url: HOST, name: hostName() }; }
  function pcChoice(p) { return { kind: "pc", id: p.id, url: p.url.replace(/\/+$/, ""), name: p.name || "My PC", pc: p }; }

  function current() {
    var on = onlinePcs(), p = pick();
    if (p !== "auto" && p !== "host") {
      var hit = on.filter(function (x) { return x.id === p; })[0];
      if (hit) return pcChoice(hit);
    }
    if (p === "host" && hostOk()) return hostChoice();
    if (st.isAdmin) return hostChoice();          // the admin's default: his own GPU, untouched
    if (on.length) return pcChoice(on[0]);
    if (hostOk()) return hostChoice();
    var off = pcs()[0];
    return { kind: "none", id: null, url: HOST, name: off ? (off.name || "My PC") + " (offline)" : "No GPU connected", offlinePc: off || null };
  }

  function choices() {
    var out = [];
    if (hostOk()) out.push(hostChoice());
    pcs().forEach(function (p) { var c = pcChoice(p); c.online = isOnline(p); out.push(c); });
    return out;
  }

  function setPick(id) {
    try { localStorage.setItem(PICK, id || "auto"); } catch (e) {}
    emit();
  }

  function emit() {
    paintNav(); paintBanner();
    listeners.forEach(function (fn) { try { fn(current()); } catch (e) {} });
    try { window.dispatchEvent(new CustomEvent("airh-gpu-change", { detail: current() })); } catch (e) {}
  }

  // ------------------------------------------------------------ refresh from Supabase
  var client = null;
  function getClient() {
    if (client) return client;
    if (!window.supabase || typeof SUPABASE_URL === "undefined") return null;
    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return client;
  }

  async function refresh() {
    var c = getClient();
    if (!c) return;
    var sess = (await c.auth.getSession()).data.session;
    if (!sess) {
      if (st.uid) { st = {}; write(CACHE, st); emit(); }
      return;
    }
    var uid = sess.user.id;
    var res = await Promise.all([
      c.from("profiles").select("is_admin").eq("id", uid).maybeSingle(),
      c.from("gpu_access").select("status").eq("user_id", uid).maybeSingle(),
      c.from("gpu_workers").select("id,name,url,last_seen_at,info,revoked_at,created_at").eq("user_id", uid).is("revoked_at", null).order("created_at")
    ]);
    var before = JSON.stringify([st.uid, st.isAdmin, st.host, (st.pcs || []).map(function (p) { return [p.id, p.url, isOnline(p)]; })]);
    st = {
      uid: uid, email: sess.user.email, t: Date.now(),
      isAdmin: !!(res[0].data && res[0].data.is_admin),
      host: res[1].data ? res[1].data.status : "none",
      pcs: res[2].data || []
    };
    write(CACHE, st);
    var after = JSON.stringify([st.uid, st.isAdmin, st.host, st.pcs.map(function (p) { return [p.id, p.url, isOnline(p)]; })]);
    if (before !== after) emit(); else { paintNav(); paintBanner(); }
  }

  // ------------------------------------------------------------ nav + tool-page banner
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (ch) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]; }); }

  function paintNav() {
    var a = document.querySelector(".nav-plain-link");
    if (!a) return;
    if (!a.getAttribute("data-default-html")) a.setAttribute("data-default-html", a.innerHTML);
    if (!st.uid || st.isAdmin) {            // visitors and the admin keep "System Status"
      a.innerHTML = a.getAttribute("data-default-html");
      a.setAttribute("href", "gpu-status.html");
      return;
    }
    var cur = current();
    var dot = cur.kind === "none" ? "is-off" : "is-on";
    var label = cur.kind === "pc" ? "My GPU: " + cur.name : cur.kind === "host" ? "GPU: " + cur.name : (cur.offlinePc ? "My PC is offline" : "Connect your GPU");
    a.innerHTML = '<span class="nav-status-dot ' + dot + '" aria-hidden="true"></span>' + esc(label.length > 28 ? label.slice(0, 27) + "…" : label);
    a.setAttribute("href", "gpu.html");
  }

  function paintBanner() {
    var old = document.getElementById("airhGpuBanner");
    var path = location.pathname.split("/").pop() || "index.html";
    if (!/\.html$/.test(path)) path += ".html";
    var show = st.uid && !st.isAdmin && TOOL_PAGES.test(path) && current().kind === "none";
    if (!show) { if (old) old.remove(); return; }
    if (old) return;
    var cur = current();
    var div = document.createElement("div");
    div.id = "airhGpuBanner";
    div.className = "gpu-banner";
    div.innerHTML = cur.offlinePc
      ? '<strong>' + esc(cur.offlinePc.name || "Your PC") + ' is offline.</strong> Open <em>Start</em> in your GPU Connector folder, then come back. <a href="gpu.html">My GPU</a>'
      : '<strong>Connect your GPU to start creating.</strong> Your creations run on your own graphics card — setup takes about 10 minutes. <a href="gpu.html">Connect my PC</a>';
    var nav = document.querySelector("header, .site-header, nav");
    (nav && nav.parentNode ? nav.parentNode : document.body).insertBefore(div, nav ? nav.nextSibling : document.body.firstChild);
  }

  window.AIRH_GPU = {
    HOST: HOST,
    base: function () { return current().url; },
    current: current,
    choices: choices,
    setPick: setPick,
    pick: pick,
    hostOk: hostOk,
    hostName: hostName,
    state: function () { return st; },
    isOnline: isOnline,
    refresh: refresh,
    onChange: function (fn) { listeners.push(fn); }
  };

  document.addEventListener("DOMContentLoaded", function () {
    paintNav(); paintBanner();
    refresh().catch(function () {});
    setInterval(function () { if (!document.hidden) refresh().catch(function () {}); }, 60000);
  });
})();

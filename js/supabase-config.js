// AI Resource Hub — Supabase configuration
//
// Connected to the "ai-resource-hub" Supabase project (org: airesourcehub).
// The gallery_prompts table and gallery-images storage bucket were created
// via migration — see README.md for the SQL if you ever need to recreate
// them elsewhere.
//
// Find/rotate these values in Supabase: Project Settings → API

const SUPABASE_URL = "https://flzhhgfkpdmszucoljpu.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_tU7xub6uYy-mUdFI0LI3XQ_tiyaixjw";
const SUPABASE_TABLE = "gallery_prompts";
const SUPABASE_BUCKET = "gallery-images";


// ---------- Members approval (crisspofficial.com Admin → Users & Access, area "airesourcehub") ----------
// Anyone can create an account, but only accounts Criss approves can use the hub's creative tools.
// An unapproved account is signed out on this site (its request is filed automatically) and sees a
// "waiting for approval" note. The database enforces the same rule, so this is the friendly part.
(function () {
  var KEY = "sb-flzhhgfkpdmszucoljpu-auth-token", CK = "airh-access-v1", PK = "airh-pending";
  function read(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } }
  function write(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function rpc(fn, token, body) {
    return fetch(SUPABASE_URL + "/rest/v1/rpc/" + fn, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify(body || {})
    }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }
  // returns Promise<true|false|null>  (null = could not check)
  function check(accessToken, user) {
    if (!accessToken || !user) return Promise.resolve(null);
    return rpc("crissp_has_access", accessToken, { p_area: "airesourcehub" }).then(function (ok) {
      if (ok === null) return null;
      write(CK, { uid: user.id, ok: ok === true, t: Date.now() });
      if (ok === true) { write(PK, null); return true; }
      return rpc("crissp_request_access", accessToken, { p_area: "airesourcehub", p_note: null }).then(function () {
        write(PK, { email: user.email || "", t: Date.now() });
        return false;
      });
    });
  }
  function drop() { try { localStorage.removeItem(KEY); } catch (e) {} }
  window.AIRH_ACCESS = {
    check: check,
    pending: function () { return read(PK); },
    // call after a successful sign-in: resolves true (approved) or false (signed out + waiting)
    afterSignIn: function (client, session) {
      write(CK, null);
      return check(session && session.access_token, session && session.user).then(function (ok) {
        if (ok === false) return client.auth.signOut().then(function () { drop(); return false; });
        return true;
      });
    }
  };

  // Page load: keep an unapproved session from reaching the tools.
  var t = read(KEY), u = t && t.user;
  if (u) {
    var c = read(CK);
    if (c && c.uid === u.id && c.ok === false) { drop(); }
    else if (!(c && c.uid === u.id && c.ok === true && Date.now() - c.t < 10 * 60 * 1000)) {
      check(t.access_token, u).then(function (ok) {
        if (ok === false) { drop(); if (!sessionStorage.getItem("airh-dropped")) { sessionStorage.setItem("airh-dropped", "1"); location.reload(); } }
      });
    }
  }

  // "Waiting for approval" note on every page
  document.addEventListener("DOMContentLoaded", function () {
    var p = read(PK); var cur = read(KEY);
    if (!p || (cur && cur.user)) return;
    if (sessionStorage.getItem("airh-pending-hide")) return;
    var bar = document.createElement("div");
    bar.setAttribute("role", "status");
    bar.style.cssText = "position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:9999;max-width:calc(100% - 32px);background:#1c1810;border:1px solid #6b5418;color:#ffd77a;padding:10px 14px;border-radius:12px;font:14px/1.4 Inter,system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.45);display:flex;gap:12px;align-items:center";
    bar.innerHTML = '<span>⏳ Your account' + (p.email ? ' (' + String(p.email).replace(/[<>&"]/g, "") + ')' : '') + ' is waiting for approval. Log in again once Criss approves it.</span><button type="button" aria-label="Dismiss" style="background:none;border:0;color:inherit;font-size:18px;cursor:pointer;line-height:1">×</button>';
    bar.querySelector("button").onclick = function () { sessionStorage.setItem("airh-pending-hide", "1"); bar.remove(); };
    document.body.appendChild(bar);
  });
})();

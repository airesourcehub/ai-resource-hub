// AI Resource Hub — lightweight first-party analytics
// Logs a row per pageview (path, referrer, user agent, approximate
// location from IP, and a session id) to Supabase, then periodically
// updates that row's duration while the page stays open. Only admins
// (via RLS) can ever read this data back — see admin.html.

document.addEventListener("DOMContentLoaded", function () {
  var isConfigured = typeof SUPABASE_URL !== "undefined" &&
    SUPABASE_URL.indexOf("YOUR_SUPABASE") === -1 &&
    SUPABASE_ANON_KEY.indexOf("YOUR_SUPABASE") === -1;

  if (!isConfigured) return;
  if (typeof window.supabase === "undefined") return;

  var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  var SESSION_KEY = "ai-resource-hub-analytics-session";
  var sessionId;
  try {
    sessionId = sessionStorage.getItem(SESSION_KEY);
    if (!sessionId) {
      sessionId = "s_" + Date.now() + "_" + Math.random().toString(36).slice(2);
      sessionStorage.setItem(SESSION_KEY, sessionId);
    }
  } catch (e) {
    sessionId = "s_" + Date.now();
  }

  var startTime = Date.now();
  var rowId = null;

  logVisit();

  async function logVisit() {
    var geo = await lookupGeo();

    try {
      var insertResult = await client.from("analytics_events").insert([{
        path: window.location.pathname,
        referrer: document.referrer || null,
        user_agent: navigator.userAgent,
        ip: geo.ip || null,
        city: geo.city || null,
        region: geo.region || null,
        country: geo.country || null,
        session_id: sessionId
      }]).select("id").single();

      if (!insertResult.error && insertResult.data) {
        rowId = insertResult.data.id;
        startHeartbeat();
      }
    } catch (e) {
      // Analytics failures should never affect the site itself.
    }
  }

  async function lookupGeo() {
    try {
      var res = await fetch("https://ipwho.is/", { cache: "no-store" });
      var data = await res.json();
      if (data && data.success !== false) {
        return {
          ip: data.ip,
          city: data.city,
          region: data.region,
          country: data.country
        };
      }
    } catch (e) {
      // Ignore — geo lookup is best-effort only.
    }
    return {};
  }

  function startHeartbeat() {
    setInterval(updateDuration, 20000);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") updateDuration();
    });
    window.addEventListener("pagehide", updateDuration);
  }

  function updateDuration() {
    if (!rowId) return;
    var seconds = Math.round((Date.now() - startTime) / 1000);
    client.from("analytics_events").update({ duration_seconds: seconds }).eq("id", rowId).then(function () {}, function () {});
  }
});

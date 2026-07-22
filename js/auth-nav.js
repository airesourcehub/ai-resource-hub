// AI Resource Hub — shared auth-aware nav
// Shows "Log In" or "you@email.com — Log out" in the nav slot on every page.

document.addEventListener("DOMContentLoaded", function () {
  var slot = document.getElementById("navAuthSlot");
  if (!slot) return;

  var isConfigured = typeof SUPABASE_URL !== "undefined" &&
    SUPABASE_URL.indexOf("YOUR_SUPABASE") === -1 &&
    SUPABASE_ANON_KEY.indexOf("YOUR_SUPABASE") === -1;

  if (!isConfigured || typeof window.supabase === "undefined") {
    slot.innerHTML = '<a href="auth.html">Log In</a>';
    return;
  }

  var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  render(null);

  client.auth.getSession().then(function (result) {
    render(result.data.session);
  });

  client.auth.onAuthStateChange(function (_event, session) {
    render(session);
  });

  function render(session) {
    if (session && session.user) {
      var email = session.user.email || "Account";
      slot.innerHTML =
        '<span class="nav-auth-email" title="' + escapeHtml(email) + '">' + escapeHtml(truncate(email, 20)) + '</span>' +
        '<button type="button" class="nav-auth-signout" id="navSignOutBtn">Log out</button>';
      var btn = document.getElementById("navSignOutBtn");
      if (btn) {
        btn.addEventListener("click", function () {
          client.auth.signOut().then(function () {
            window.location.href = "index.html";
          });
        });
      }
    } else {
      slot.innerHTML = '<a href="auth.html">Log In</a>';
    }
  }

  function truncate(str, n) {
    return str.length > n ? str.slice(0, n - 1) + "…" : str;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
});

// AI Resource Hub — sign up / log in logic (Supabase Auth, email + password)

document.addEventListener("DOMContentLoaded", function () {
  var isConfigured = typeof SUPABASE_URL !== "undefined" &&
    SUPABASE_URL.indexOf("YOUR_SUPABASE") === -1 &&
    SUPABASE_ANON_KEY.indexOf("YOUR_SUPABASE") === -1;

  var setupBanner = document.getElementById("authSetupBanner");
  var authTabs = document.getElementById("authTabs");
  var loggedInView = document.getElementById("authLoggedIn");
  var loggedOutView = document.getElementById("authLoggedOut");

  if (!isConfigured) {
    if (setupBanner) setupBanner.classList.add("show");
    if (authTabs) authTabs.style.display = "none";
    if (loggedOutView) loggedOutView.style.display = "none";
    return;
  }

  var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  client.auth.getSession().then(function (result) {
    if (result.data.session) {
      showLoggedIn(result.data.session);
    }
  });

  // ---------- Tabs ----------
  var tabs = document.querySelectorAll(".auth-tab");
  var panels = document.querySelectorAll(".auth-panel");
  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      tabs.forEach(function (t) { t.classList.remove("active"); });
      tab.classList.add("active");
      var target = tab.getAttribute("data-auth-tab");
      panels.forEach(function (p) {
        p.classList.toggle("active", p.id === "panel-" + target);
      });
    });
  });

  // ---------- Sign up ----------
  var signupForm = document.getElementById("signupForm");
  var signupStatus = document.getElementById("signupStatus");

  if (signupForm) {
    signupForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      var email = document.getElementById("signupEmail").value.trim();
      var password = document.getElementById("signupPassword").value;

      if (!email || !password) {
        showStatus(signupStatus, "Please enter an email and password.", "error");
        return;
      }
      if (password.length < 6) {
        showStatus(signupStatus, "Password must be at least 6 characters.", "error");
        return;
      }

      showStatus(signupStatus, "Creating your account...", "");

      var result = await client.auth.signUp({ email: email, password: password });
      if (result.error) {
        var msg = (result.error.message || "").toLowerCase();
        if (msg.indexOf("already registered") !== -1 || msg.indexOf("already exists") !== -1) {
          showStatus(signupStatus, "This email is already registered. Try logging in instead.", "error");
        } else if (msg.indexOf("password") !== -1) {
          showStatus(signupStatus, result.error.message, "error");
        } else {
          // Most likely blocked by the invite-only allowlist (or an
          // unexpected server error) — either way, point them to the
          // request-access flow below rather than showing a raw DB error.
          showStatus(
            signupStatus,
            "This email isn't approved for sign-up yet. Email the admin or submit a request below.",
            "error"
          );
          var requestEmailField = document.getElementById("requestEmail");
          if (requestEmailField && !requestEmailField.value) requestEmailField.value = email;
        }
        return;
      }

      if (result.data.session) {
        showLoggedIn(result.data.session);
      } else {
        showStatus(signupStatus, "Account created. Check your email to confirm, then log in.", "success");
        signupForm.reset();
      }
    });
  }

  // ---------- Request access ----------
  var requestForm = document.getElementById("requestAccessForm");
  var requestStatus = document.getElementById("requestStatus");

  if (requestForm) {
    requestForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      var reqEmail = document.getElementById("requestEmail").value.trim();
      var reqMessage = document.getElementById("requestMessage").value.trim();

      if (!reqEmail) {
        showStatus(requestStatus, "Please enter your email.", "error");
        return;
      }

      showStatus(requestStatus, "Sending request...", "");

      try {
        var insertResult = await client.from("access_requests").insert([{
          email: reqEmail,
          message: reqMessage || null
        }]);
        if (insertResult.error) throw insertResult.error;
        showStatus(requestStatus, "Request sent — you'll hear back once it's reviewed.", "success");
        requestForm.reset();
      } catch (err) {
        console.error(err);
        showStatus(requestStatus, "Something went wrong: " + (err.message || err), "error");
      }
    });
  }

  // ---------- Log in ----------
  var loginForm = document.getElementById("loginForm");
  var loginStatus = document.getElementById("loginStatus");

  if (loginForm) {
    loginForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      var email = document.getElementById("loginEmail").value.trim();
      var password = document.getElementById("loginPassword").value;

      showStatus(loginStatus, "Logging in...", "");

      var result = await client.auth.signInWithPassword({ email: email, password: password });
      if (result.error) {
        showStatus(loginStatus, result.error.message, "error");
        return;
      }
      showLoggedIn(result.data.session);
    });
  }

  // ---------- Log out ----------
  var signOutBtn = document.getElementById("authSignOutBtn");
  if (signOutBtn) {
    signOutBtn.addEventListener("click", function () {
      client.auth.signOut().then(function () {
        window.location.reload();
      });
    });
  }

  function showLoggedIn(session) {
    if (authTabs) authTabs.style.display = "none";
    if (loggedOutView) loggedOutView.style.display = "none";
    if (loggedInView) {
      loggedInView.style.display = "block";
      var emailEl = document.getElementById("authLoggedInEmail");
      if (emailEl) emailEl.textContent = session.user.email;
    }
  }

  function showStatus(el, msg, type) {
    if (!el) return;
    el.textContent = msg;
    el.className = "form-status show" + (type ? " " + type : "");
  }
});

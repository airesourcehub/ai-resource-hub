// AI Resource Hub — Admin panel logic
// Gated by profiles.is_admin (checked client-side for UX; the database's
// RLS policies are what actually enforce access, so every query here
// simply returns empty/denied for a non-admin regardless of this check).

document.addEventListener("DOMContentLoaded", function () {
  var isConfigured = typeof SUPABASE_URL !== "undefined" &&
    SUPABASE_URL.indexOf("YOUR_SUPABASE") === -1 &&
    SUPABASE_ANON_KEY.indexOf("YOUR_SUPABASE") === -1;

  var signedOutEl = document.getElementById("adminSignedOut");
  var forbiddenEl = document.getElementById("adminForbidden");
  var panelEl = document.getElementById("adminPanel");

  if (!isConfigured) {
    if (signedOutEl) signedOutEl.style.display = "block";
    return;
  }

  var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  init();

  async function init() {
    var sessionResult = await client.auth.getSession();
    var user = sessionResult.data.session ? sessionResult.data.session.user : null;

    if (!user) {
      signedOutEl.style.display = "block";
      return;
    }

    var profileResult = await client.from("profiles").select("is_admin").eq("id", user.id).single();
    if (profileResult.error || !profileResult.data || !profileResult.data.is_admin) {
      forbiddenEl.style.display = "block";
      return;
    }

    panelEl.style.display = "block";
    setupTabs();
    loadAccessRequests();
    loadAllowlist();
    loadUsers();
    loadGalleryMod();
    loadAnalytics();
  }

  function setupTabs() {
    var tabs = document.querySelectorAll(".admin-tab");
    var panels = document.querySelectorAll(".admin-panel");
    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        tabs.forEach(function (t) { t.classList.remove("active"); });
        tab.classList.add("active");
        var target = tab.getAttribute("data-admin-tab");
        panels.forEach(function (p) {
          p.classList.toggle("active", p.id === "admin-" + target);
        });
      });
    });
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function fmtDate(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    return d.toLocaleString();
  }

  // ---------- Access requests ----------
  async function loadAccessRequests() {
    var list = document.getElementById("requestsList");
    if (!list) return;
    list.innerHTML = "Loading...";

    var result = await client
      .from("access_requests")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (result.error) {
      list.innerHTML = "Error: " + escapeHtml(result.error.message);
      return;
    }

    var rows = result.data || [];
    if (!rows.length) {
      list.innerHTML = '<p class="admin-empty">No pending requests.</p>';
      return;
    }

    list.innerHTML = rows.map(function (r) {
      return (
        '<div class="admin-row" data-id="' + r.id + '">' +
          '<div class="admin-row-main">' +
            '<strong>' + escapeHtml(r.email) + '</strong>' +
            '<span class="admin-row-meta">' + fmtDate(r.created_at) + '</span>' +
            (r.message ? '<p class="admin-row-note">' + escapeHtml(r.message) + '</p>' : '') +
          '</div>' +
          '<div class="admin-row-actions">' +
            '<button class="btn btn-primary btn-sm req-approve">Approve</button>' +
            '<button class="btn btn-secondary btn-sm req-deny">Deny</button>' +
          '</div>' +
        '</div>'
      );
    }).join("");

    list.querySelectorAll(".req-approve").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var row = btn.closest(".admin-row");
        approveRequest(row.getAttribute("data-id"));
      });
    });
    list.querySelectorAll(".req-deny").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var row = btn.closest(".admin-row");
        denyRequest(row.getAttribute("data-id"));
      });
    });
  }

  async function approveRequest(id) {
    var reqResult = await client.from("access_requests").select("email").eq("id", id).single();
    if (reqResult.error || !reqResult.data) return;
    var email = reqResult.data.email;

    await client.from("allowed_emails").upsert(
      { email: email, status: "approved", note: "Approved from access request" },
      { onConflict: "email" }
    );
    await client.from("access_requests").update({ status: "approved" }).eq("id", id);

    loadAccessRequests();
    loadAllowlist();
  }

  async function denyRequest(id) {
    await client.from("access_requests").update({ status: "denied" }).eq("id", id);
    loadAccessRequests();
  }

  // ---------- Allowlist ----------
  var allowlistAddForm = document.getElementById("allowlistAddForm");
  if (allowlistAddForm) {
    allowlistAddForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      var email = document.getElementById("allowlistEmail").value.trim();
      var status = document.getElementById("allowlistStatus").value;
      var note = document.getElementById("allowlistNote").value.trim();
      var statusEl = document.getElementById("allowlistAddStatus");

      if (!email) return;

      var result = await client.from("allowed_emails").upsert(
        { email: email, status: status, note: note || null },
        { onConflict: "email" }
      );

      if (result.error) {
        statusEl.textContent = "Error: " + result.error.message;
        statusEl.className = "form-status show error";
      } else {
        statusEl.textContent = "Saved.";
        statusEl.className = "form-status show success";
        allowlistAddForm.reset();
        loadAllowlist();
      }
    });
  }

  async function loadAllowlist() {
    var table = document.getElementById("allowlistTable");
    if (!table) return;
    table.innerHTML = "Loading...";

    var result = await client.from("allowed_emails").select("*").order("created_at", { ascending: false });
    if (result.error) {
      table.innerHTML = "Error: " + escapeHtml(result.error.message);
      return;
    }

    var rows = result.data || [];
    if (!rows.length) {
      table.innerHTML = '<p class="admin-empty">No emails on the allowlist yet.</p>';
      return;
    }

    table.innerHTML = rows.map(function (r) {
      var badgeClass = r.status === "approved" ? "tag" : "tag private";
      return (
        '<div class="admin-row" data-email="' + escapeHtml(r.email) + '">' +
          '<div class="admin-row-main">' +
            '<strong>' + escapeHtml(r.email) + '</strong> ' +
            '<span class="' + badgeClass + '">' + r.status + '</span>' +
            '<span class="admin-row-meta">' + fmtDate(r.created_at) + '</span>' +
            (r.note ? '<p class="admin-row-note">' + escapeHtml(r.note) + '</p>' : '') +
          '</div>' +
          '<div class="admin-row-actions">' +
            '<button class="btn btn-secondary btn-sm allow-toggle">' +
              (r.status === "approved" ? "Block" : "Approve") +
            '</button>' +
            '<button class="btn btn-secondary btn-sm allow-remove">Remove</button>' +
          '</div>' +
        '</div>'
      );
    }).join("");

    table.querySelectorAll(".allow-toggle").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        var row = btn.closest(".admin-row");
        var email = row.getAttribute("data-email");
        var current = await client.from("allowed_emails").select("status").eq("email", email).single();
        var next = current.data && current.data.status === "approved" ? "blocked" : "approved";
        await client.from("allowed_emails").update({ status: next }).eq("email", email);
        loadAllowlist();
      });
    });
    table.querySelectorAll(".allow-remove").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        var row = btn.closest(".admin-row");
        var email = row.getAttribute("data-email");
        await client.from("allowed_emails").delete().eq("email", email);
        loadAllowlist();
      });
    });
  }

  // ---------- Users ----------
  async function loadUsers() {
    var table = document.getElementById("usersTable");
    if (!table) return;
    table.innerHTML = "Loading...";

    var result = await client.from("profiles").select("*").order("created_at", { ascending: false });
    if (result.error) {
      table.innerHTML = "Error: " + escapeHtml(result.error.message);
      return;
    }

    var rows = result.data || [];
    if (!rows.length) {
      table.innerHTML = '<p class="admin-empty">No registered users yet.</p>';
      return;
    }

    table.innerHTML = rows.map(function (r) {
      var badgeClass = r.status === "active" ? "tag" : "tag private";
      return (
        '<div class="admin-row" data-id="' + r.id + '">' +
          '<div class="admin-row-main">' +
            '<strong>' + escapeHtml(r.email) + '</strong> ' +
            (r.is_admin ? '<span class="tag">admin</span> ' : '') +
            '<span class="' + badgeClass + '">' + r.status + '</span>' +
            '<span class="admin-row-meta">joined ' + fmtDate(r.created_at) + '</span>' +
          '</div>' +
          '<div class="admin-row-actions">' +
            (r.is_admin ? '' :
              '<button class="btn btn-secondary btn-sm user-toggle">' +
                (r.status === "active" ? "Block" : "Unblock") +
              '</button>'
            ) +
          '</div>' +
        '</div>'
      );
    }).join("");

    table.querySelectorAll(".user-toggle").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        var row = btn.closest(".admin-row");
        var id = row.getAttribute("data-id");
        var current = await client.from("profiles").select("status").eq("id", id).single();
        var next = current.data && current.data.status === "active" ? "blocked" : "active";
        await client.from("profiles").update({ status: next }).eq("id", id);
        loadUsers();
      });
    });
  }

  // ---------- Gallery moderation ----------
  async function loadGalleryMod() {
    var list = document.getElementById("galleryModList");
    if (!list) return;
    list.innerHTML = "Loading...";

    var result = await client.from("gallery_prompts").select("*").order("created_at", { ascending: false });
    if (result.error) {
      list.innerHTML = "Error: " + escapeHtml(result.error.message);
      return;
    }

    var rows = result.data || [];
    if (!rows.length) {
      list.innerHTML = '<p class="admin-empty">No gallery entries yet.</p>';
      return;
    }

    list.innerHTML = rows.map(function (r) {
      return (
        '<div class="admin-row" data-id="' + r.id + '">' +
          '<div class="admin-row-main">' +
            (r.title ? '<strong>' + escapeHtml(r.title) + '</strong> ' : '') +
            '<span class="tag">' + escapeHtml(r.media_type) + '</span> ' +
            (r.is_public ? '' : '<span class="tag private">Private</span> ') +
            '<span class="admin-row-meta">' + fmtDate(r.created_at) + '</span>' +
            '<p class="admin-row-note">' + escapeHtml((r.prompt || "").slice(0, 160)) + '</p>' +
          '</div>' +
          '<div class="admin-row-actions">' +
            '<button class="btn btn-secondary btn-sm gallery-remove">Delete</button>' +
          '</div>' +
        '</div>'
      );
    }).join("");

    list.querySelectorAll(".gallery-remove").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        if (!confirm("Delete this gallery entry? This can't be undone.")) return;
        var row = btn.closest(".admin-row");
        var id = row.getAttribute("data-id");
        await client.from("gallery_prompts").delete().eq("id", id);
        loadGalleryMod();
      });
    });
  }

  // ---------- Analytics ----------
  async function loadAnalytics() {
    var summaryEl = document.getElementById("analyticsSummary");
    var listEl = document.getElementById("analyticsList");
    if (!summaryEl || !listEl) return;
    summaryEl.innerHTML = "Loading...";
    listEl.innerHTML = "";

    var result = await client
      .from("analytics_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);

    if (result.error) {
      summaryEl.innerHTML = "Error: " + escapeHtml(result.error.message);
      return;
    }

    var rows = result.data || [];
    if (!rows.length) {
      summaryEl.innerHTML = '<p class="admin-empty">No visits recorded yet.</p>';
      return;
    }

    var sessions = {};
    var referrers = {};
    var countries = {};
    var totalDuration = 0;
    var durationCount = 0;

    rows.forEach(function (r) {
      sessions[r.session_id] = true;
      var ref = r.referrer && r.referrer.trim() ? r.referrer : "(direct)";
      referrers[ref] = (referrers[ref] || 0) + 1;
      var country = r.country || "Unknown";
      countries[country] = (countries[country] || 0) + 1;
      if (r.duration_seconds !== null && r.duration_seconds !== undefined) {
        totalDuration += Number(r.duration_seconds);
        durationCount++;
      }
    });

    var avgDuration = durationCount ? Math.round(totalDuration / durationCount) : 0;
    var topReferrers = Object.keys(referrers).sort(function (a, b) { return referrers[b] - referrers[a]; }).slice(0, 5);
    var topCountries = Object.keys(countries).sort(function (a, b) { return countries[b] - countries[a]; }).slice(0, 5);

    summaryEl.innerHTML =
      statCard(rows.length, "Pageviews (last 500)") +
      statCard(Object.keys(sessions).length, "Unique sessions") +
      statCard(avgDuration + "s", "Avg. time on page") +
      '<div class="admin-stat-card">' +
        '<div class="admin-stat-label">Top referrers</div>' +
        '<ul class="admin-stat-list">' +
          topReferrers.map(function (r) { return "<li>" + escapeHtml(r) + " (" + referrers[r] + ")</li>"; }).join("") +
        '</ul>' +
      '</div>' +
      '<div class="admin-stat-card">' +
        '<div class="admin-stat-label">Top countries</div>' +
        '<ul class="admin-stat-list">' +
          topCountries.map(function (c) { return "<li>" + escapeHtml(c) + " (" + countries[c] + ")</li>"; }).join("") +
        '</ul>' +
      '</div>';

    listEl.innerHTML = rows.slice(0, 50).map(function (r) {
      var loc = [r.city, r.region, r.country].filter(Boolean).join(", ");
      return (
        '<div class="admin-row">' +
          '<div class="admin-row-main">' +
            '<strong>' + escapeHtml(r.path || "/") + '</strong>' +
            '<span class="admin-row-meta">' + fmtDate(r.created_at) + '</span>' +
            '<p class="admin-row-note">' +
              'IP: ' + escapeHtml(r.ip || "?") +
              (loc ? " · " + escapeHtml(loc) : "") +
              (r.referrer ? " · from " + escapeHtml(r.referrer) : " · direct") +
              (r.duration_seconds ? " · " + Math.round(r.duration_seconds) + "s" : "") +
            '</p>' +
          '</div>' +
        '</div>'
      );
    }).join("");
  }

  function statCard(value, label) {
    return (
      '<div class="admin-stat-card">' +
        '<div class="admin-stat-value">' + value + '</div>' +
        '<div class="admin-stat-label">' + label + '</div>' +
      '</div>'
    );
  }
});

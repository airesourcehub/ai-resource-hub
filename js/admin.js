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
  var adminUserId = null;
  var adminEmail = null;

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

    adminUserId = user.id;
    adminEmail = user.email || null;
    panelEl.style.display = "block";
    setupTabs();
    loadAccessRequests();
    loadAllowlist();
    loadUsers();
    loadGalleryMod();
    loadFlags();
    loadRenderSeat();
    loadAnalytics();
  }

  // ---- Render seat (AI Transitions generator) ----
  async function loadRenderSeat() {
    var currentEl = document.getElementById("renderSeatCurrent");
    var select = document.getElementById("renderSeatUser");
    if (!currentEl || !select) return;

    var seatRes = await client.from("render_seat").select("holder_id, holder_email, assigned_at").eq("id", true).single();
    var holderId = seatRes.data ? seatRes.data.holder_id : null;
    var holderEmail = seatRes.data ? seatRes.data.holder_email : null;

    currentEl.innerHTML = holderId
      ? '🔒 GPU reserved for: <strong>' + escapeHtml(holderEmail || holderId) + '</strong>' +
        (holderId === adminUserId ? ' <span class="tag">you</span>' : '') +
        ' <span class="frame-res" style="margin:0;">— everyone else is paused</span>'
      : '<em>Open to everyone — jobs queue and run one at a time.</em>';

    var usersRes = await client.from("profiles").select("id, email").order("email", { ascending: true });
    var users = (usersRes.data || []);
    select.innerHTML = users.map(function (u) {
      var sel = u.id === holderId ? " selected" : "";
      return '<option value="' + escapeHtml(u.id) + '" data-email="' + escapeHtml(u.email || "") + '"' + sel + '>' + escapeHtml(u.email || u.id) + '</option>';
    }).join("");

    var form = document.getElementById("renderSeatForm");
    var resetBtn = document.getElementById("renderSeatReset");
    var clearBtn = document.getElementById("renderSeatClear");
    if (form && !form.dataset.wired) {
      form.dataset.wired = "1";
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var opt = select.options[select.selectedIndex];
        if (!opt) return;
        assignSeat(opt.value, opt.getAttribute("data-email"));
      });
      resetBtn.addEventListener("click", function () {
        assignSeat(adminUserId, adminEmail);
      });
      if (clearBtn) clearBtn.addEventListener("click", function () { assignSeat(null, null); });
    }
  }

  async function assignSeat(userId, email) {
    var statusEl = document.getElementById("renderSeatStatus");
    if (statusEl) { statusEl.textContent = "Saving…"; statusEl.className = "form-status"; }
    var r = await client.from("render_seat").update({
      holder_id: userId,
      holder_email: email || null,
      assigned_by: adminUserId,
      assigned_at: new Date().toISOString()
    }).eq("id", true);
    if (statusEl) {
      if (r.error) { statusEl.textContent = "Couldn’t update the seat: " + r.error.message; statusEl.className = "form-status error"; }
      else if (!userId) { statusEl.textContent = "Seat cleared — the GPU is now open to everyone."; statusEl.className = "form-status success"; }
      else { statusEl.textContent = "GPU reserved for " + (email || userId) + "."; statusEl.className = "form-status success"; }
    }
    loadRenderSeat();
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
            '<button class="btn btn-secondary btn-sm user-activity" data-email="' + escapeHtml(r.email || "") + '">View activity</button> ' +
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

    table.querySelectorAll(".user-activity").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var row = btn.closest(".admin-row");
        loadUserDetail(row.getAttribute("data-id"), btn.getAttribute("data-email"));
      });
    });
  }

  // ---------- Per-user activity drill-down ----------
  async function loadUserDetail(uid, email) {
    var box = document.getElementById("userDetail");
    if (!box) return;
    box.style.display = "";
    box.innerHTML = '<p class="model-note">Loading activity for ' + escapeHtml(email) + '…</p>';
    box.scrollIntoView({ behavior: "smooth", block: "nearest" });

    var res = await Promise.all([
      client.from("image_jobs").select("id,model,prompt,status,created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(100),
      client.from("render_jobs").select("id,render_type,mode,prompt,status,created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(100),
      client.from("training_jobs").select("id,name,base,trigger_word,status,created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(100),
      client.from("analytics_events").select("id,path,ip,city,region,country,user_agent,created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(300)
    ]);
    var images = res[0].data || [], videos = res[1].data || [], loras = res[2].data || [], visits = res[3].data || [];

    // Distinct IPs with location + last-seen
    var ipMap = {};
    visits.forEach(function (v) {
      if (!v.ip) return;
      if (!ipMap[v.ip]) ipMap[v.ip] = { ip: v.ip, loc: [v.city, v.region, v.country].filter(Boolean).join(", "), count: 0, last: v.created_at };
      ipMap[v.ip].count++;
    });
    var ips = Object.keys(ipMap).map(function (k) { return ipMap[k]; });

    var VL = { ai_transition: "AI Transition", blend: "AI Transition", music_sync: "Music Sync", motion_transfer: "Motion Transfer", lipsync: "Lip Sync", wan_video: "WAN Video" };

    var timeline = []
      .concat(images.map(function (r) { return { t: r.created_at, s: "🖼️ Image — " + (r.model || "") + statusTag(r.status) + meta(r.prompt) }; }))
      .concat(videos.map(function (r) { return { t: r.created_at, s: "🎬 " + (VL[r.render_type] || r.render_type || "Video") + statusTag(r.status) + meta(r.prompt) }; }))
      .concat(loras.map(function (r) { return { t: r.created_at, s: "🧬 LoRA — " + escapeHtml(r.name || "") + " (" + (r.base || "flux") + ")" + statusTag(r.status) + meta(r.trigger_word ? "trigger: " + r.trigger_word : "") }; }))
      .concat(visits.map(function (r) { return { t: r.created_at, s: "👁️ " + escapeHtml(r.path || "/") + meta([[r.city, r.country].filter(Boolean).join(", "), r.ip].filter(Boolean).join(" · ")) }; }))
      .sort(function (a, b) { return (Date.parse(b.t) || 0) - (Date.parse(a.t) || 0); });

    var html = '<div class="status-card">' +
      '<div class="section-header" style="display:flex;justify-content:space-between;align-items:center;">' +
        '<h3 style="margin:0;">Activity — ' + escapeHtml(email) + '</h3>' +
        '<button class="btn btn-secondary btn-sm" id="userDetailClose">Close</button></div>' +
      '<div class="status-chips" style="display:flex;flex-wrap:wrap;gap:10px;margin:12px 0;">' +
        chip("Images", images.length) + chip("Videos", videos.length) + chip("LoRAs", loras.length) +
        chip("Page visits", visits.length) + chip("Distinct IPs", ips.length) +
      '</div>';

    html += '<h4 style="margin:14px 0 6px;">IP addresses &amp; locations</h4>';
    html += ips.length ? '<div class="admin-list">' + ips.map(function (i) {
      return '<div class="admin-row"><div class="admin-row-main"><strong>' + escapeHtml(i.ip) + '</strong>' +
        (i.loc ? '<span class="admin-row-meta">' + escapeHtml(i.loc) + '</span>' : '') +
        '<span class="admin-row-meta">' + i.count + ' visit' + (i.count === 1 ? '' : 's') + ' · last ' + fmtDate(i.last) + '</span></div></div>';
    }).join("") + '</div>' : '<p class="admin-empty">No IP data recorded yet (only captured on visits made after this feature went live).</p>';

    html += '<h4 style="margin:18px 0 6px;">Full timeline</h4>';
    html += timeline.length ? '<div class="admin-list">' + timeline.slice(0, 400).map(function (it) {
      return '<div class="admin-row"><div class="admin-row-main">' + it.s +
        '<span class="admin-row-meta">' + fmtDate(it.t) + '</span></div></div>';
    }).join("") + '</div>' : '<p class="admin-empty">No activity recorded for this user yet.</p>';

    html += '</div>';
    box.innerHTML = html;
    var closeBtn = document.getElementById("userDetailClose");
    if (closeBtn) closeBtn.addEventListener("click", function () { box.style.display = "none"; box.innerHTML = ""; });

    function statusTag(s) { return s ? ' <span class="tag' + (s === "done" ? "" : " private") + '">' + escapeHtml(s) + '</span>' : ""; }
    function meta(m) { m = String(m || ""); return m ? '<span class="admin-row-meta">' + escapeHtml(m.length > 100 ? m.slice(0, 99) + "…" : m) + '</span>' : ""; }
    function chip(label, n) { return '<span class="status-chip">' + label + ': ' + n + '</span>'; }
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

  // ---------- Reports / flags moderation ----------
  var NAS_GALLERY_BASE = "https://gallery.airesourcehub.vip";
  var EMAIL_ENDPOINT = SUPABASE_URL.replace(/\/+$/, "") + "/functions/v1/send-uploader-email";
  var REASON_LABELS = {
    spam: "Spam or misleading",
    nsfw: "Adult / explicit",
    violence: "Violent / graphic",
    hate: "Hate / harassment",
    ip: "Copyright / IP",
    illegal: "Illegal / dangerous",
    other: "Other"
  };
  var emailTargetId = null;

  async function getToken() {
    var s = await client.auth.getSession();
    return s.data.session ? s.data.session.access_token : null;
  }

  var flagsStatusFilter = document.getElementById("flagsStatusFilter");
  if (flagsStatusFilter) flagsStatusFilter.addEventListener("change", loadFlags);

  async function loadFlags() {
    var list = document.getElementById("flagsList");
    if (!list) return;
    list.innerHTML = "Loading...";

    var filter = flagsStatusFilter ? flagsStatusFilter.value : "open";
    var q = client.from("gallery_flags").select("*").order("created_at", { ascending: false });
    if (filter !== "all") q = q.eq("status", filter);
    var result = await q;
    if (result.error) { list.innerHTML = "Error: " + escapeHtml(result.error.message); return; }

    var flags = result.data || [];
    if (!flags.length) { list.innerHTML = '<p class="admin-empty">No reports here.</p>'; return; }

    var ids = flags.map(function (f) { return f.gallery_id; }).filter(function (v, i, a) { return a.indexOf(v) === i; });
    var postsById = {};
    if (ids.length) {
      var postsRes = await client.from("gallery_prompts").select("*").in("id", ids);
      (postsRes.data || []).forEach(function (p) { postsById[p.id] = p; });
    }

    list.innerHTML = flags.map(function (f) {
      var p = postsById[f.gallery_id];
      var thumb = "";
      if (p) {
        var thumbUrl = p.cover_url || (p.media_type === "video" ? "" : p.image_url);
        thumb = thumbUrl
          ? '<img class="admin-flag-thumb" src="' + escapeHtml(thumbUrl) + '" alt="" />'
          : '<div class="admin-flag-thumb admin-flag-thumb-video">▶</div>';
      }
      var reason = REASON_LABELS[f.reason] || f.reason;
      var statusBadge = '<span class="tag' + (f.status === "open" ? "" : " private") + '">' + escapeHtml(f.status) + '</span>';
      var removedBadge = p && p.is_removed ? '<span class="tag private">Hidden</span> ' : "";
      return (
        '<div class="admin-row admin-flag-row" data-flag-id="' + f.id + '" data-post-id="' + f.gallery_id + '">' +
          thumb +
          '<div class="admin-row-main">' +
            '<strong>' + escapeHtml(reason) + '</strong> ' + statusBadge + ' ' + removedBadge +
            '<span class="admin-row-meta">' + fmtDate(f.created_at) + ' · IP ' + escapeHtml(f.reporter_ip || "?") + '</span>' +
            (p
              ? '<p class="admin-row-note">' + (p.title ? '<strong>' + escapeHtml(p.title) + '</strong> — ' : '') + escapeHtml((p.prompt || "").slice(0, 140)) + '</p>'
              : '<p class="admin-row-note"><em>Post no longer exists.</em></p>') +
            (f.notice ? '<p class="admin-row-note">Reporter said: ' + escapeHtml(f.notice) + '</p>' : '') +
            (f.admin_note ? '<p class="admin-row-note admin-note">Your note: ' + escapeHtml(f.admin_note) + '</p>' : '') +
          '</div>' +
          '<div class="admin-row-actions admin-flag-actions">' +
            (p
              ? ('<a class="btn btn-secondary btn-sm" href="' + escapeHtml(p.image_url) + '" target="_blank" rel="noopener">View</a>' +
                 (p.is_removed
                   ? '<button class="btn btn-secondary btn-sm flag-restore">Restore</button>'
                   : '<button class="btn btn-secondary btn-sm flag-hide">Hide</button>') +
                 '<button class="btn btn-secondary btn-sm flag-email">Message</button>' +
                 '<button class="btn btn-secondary btn-sm flag-delete">Delete</button>')
              : '') +
            '<button class="btn btn-secondary btn-sm flag-note">Note</button>' +
            (f.status === "open"
              ? '<button class="btn btn-secondary btn-sm flag-dismiss">Dismiss</button><button class="btn btn-primary btn-sm flag-resolve">Resolve</button>'
              : '<button class="btn btn-secondary btn-sm flag-reopen">Reopen</button>') +
          '</div>' +
        '</div>'
      );
    }).join("");

    list.querySelectorAll(".admin-flag-row").forEach(function (row) {
      var flagId = row.getAttribute("data-flag-id");
      var postId = row.getAttribute("data-post-id");
      var post = postsById[postId];
      var byClass = function (c) { return row.querySelector("." + c); };

      var hideBtn = byClass("flag-hide");
      if (hideBtn) hideBtn.addEventListener("click", function () { setRemoved(postId, true); });
      var restoreBtn = byClass("flag-restore");
      if (restoreBtn) restoreBtn.addEventListener("click", function () { setRemoved(postId, false); });
      var delBtn = byClass("flag-delete");
      if (delBtn) delBtn.addEventListener("click", function () { permanentDelete(post); });
      var noteBtn = byClass("flag-note");
      if (noteBtn) noteBtn.addEventListener("click", function () { addFlagNote(flagId); });
      var dismissBtn = byClass("flag-dismiss");
      if (dismissBtn) dismissBtn.addEventListener("click", function () { setFlagStatus(flagId, "dismissed"); });
      var resolveBtn = byClass("flag-resolve");
      if (resolveBtn) resolveBtn.addEventListener("click", function () { setFlagStatus(flagId, "resolved"); });
      var reopenBtn = byClass("flag-reopen");
      if (reopenBtn) reopenBtn.addEventListener("click", function () { setFlagStatus(flagId, "open"); });
      var emailBtn = byClass("flag-email");
      if (emailBtn) emailBtn.addEventListener("click", function () { openEmailModal(post); });
    });
  }

  async function setRemoved(postId, removed) {
    var r = await client.from("gallery_prompts").update({ is_removed: removed }).eq("id", postId);
    if (r.error) { alert("Couldn't update: " + r.error.message); return; }
    loadFlags();
  }

  async function setFlagStatus(flagId, status) {
    var payload = { status: status, resolved_at: status === "open" ? null : new Date().toISOString() };
    var r = await client.from("gallery_flags").update(payload).eq("id", flagId);
    if (r.error) { alert("Couldn't update: " + r.error.message); return; }
    loadFlags();
  }

  async function addFlagNote(flagId) {
    var existing = "";
    var cur = await client.from("gallery_flags").select("admin_note").eq("id", flagId).single();
    if (cur.data && cur.data.admin_note) existing = cur.data.admin_note;
    var note = window.prompt("Admin note for this report:", existing);
    if (note === null) return;
    var r = await client.from("gallery_flags").update({ admin_note: note.trim() || null }).eq("id", flagId);
    if (r.error) { alert("Couldn't save note: " + r.error.message); return; }
    loadFlags();
  }

  async function permanentDelete(post) {
    if (!post) return;
    if (!confirm("Permanently delete this post and its file? This cannot be undone.")) return;
    var m = (post.image_url || "").match(/\/files\/([a-f0-9]{32})\./);
    if (m) {
      try {
        var token = await getToken();
        await fetch(NAS_GALLERY_BASE + "/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
          body: JSON.stringify({ id: m[1] })
        });
      } catch (e) { console.warn("NAS delete failed (continuing to remove DB row)", e); }
    }
    var r = await client.from("gallery_prompts").delete().eq("id", post.id);
    if (r.error) { alert("Couldn't delete: " + r.error.message); return; }
    loadFlags();
  }

  // ---- Email uploader modal ----
  var emailOverlay = document.getElementById("emailModalOverlay");
  var emailClose = document.getElementById("emailModalClose");
  var emailCancel = document.getElementById("emailCancelBtn");
  var emailSend = document.getElementById("emailSendBtn");
  var emailSubject = document.getElementById("emailSubject");
  var emailBody = document.getElementById("emailBody");
  var emailStatus = document.getElementById("emailStatus");
  var emailTarget = document.getElementById("emailModalTarget");
  var emailRecipientId = null;

  function openEmailModal(post) {
    if (!emailOverlay || !post) return;
    emailTargetId = post.id;
    emailRecipientId = post.user_id || null;
    if (emailTarget) emailTarget.textContent = post.title ? 'Re: "' + post.title + '"' : "About their gallery post";
    if (emailBody) emailBody.value = "";
    if (emailStatus) { emailStatus.textContent = ""; emailStatus.className = "form-status"; }
    if (emailSend) emailSend.disabled = false;
    emailOverlay.classList.add("open");
  }
  function closeEmailModal() { if (emailOverlay) emailOverlay.classList.remove("open"); emailTargetId = null; }
  if (emailClose) emailClose.addEventListener("click", closeEmailModal);
  if (emailCancel) emailCancel.addEventListener("click", closeEmailModal);
  if (emailOverlay) emailOverlay.addEventListener("click", function (e) { if (e.target === emailOverlay) closeEmailModal(); });
  if (emailSend) {
    emailSend.addEventListener("click", async function () {
      if (!emailTargetId) return;
      var msg = emailBody ? emailBody.value.trim() : "";
      if (!msg) { if (emailStatus) { emailStatus.textContent = "Write a message first."; emailStatus.className = "form-status show error"; } return; }
      if (!emailRecipientId) {
        if (emailStatus) { emailStatus.textContent = "This post has no associated account to message."; emailStatus.className = "form-status show error"; }
        return;
      }
      emailSend.disabled = true;
      if (emailStatus) { emailStatus.textContent = "Sending…"; emailStatus.className = "form-status show"; }
      try {
        var ins = await client.from("admin_messages").insert({
          recipient_id: emailRecipientId,
          gallery_id: emailTargetId,
          subject: emailSubject && emailSubject.value.trim() ? emailSubject.value.trim() : null,
          body: msg,
          sender_id: adminUserId
        });
        if (ins.error) throw new Error(ins.error.message || "Send failed.");
        if (emailStatus) { emailStatus.textContent = "Message sent — the uploader will see it next time they log in."; emailStatus.className = "form-status show success"; }
        setTimeout(closeEmailModal, 1600);
      } catch (err) {
        if (emailStatus) { emailStatus.textContent = err.message || "Send failed."; emailStatus.className = "form-status show error"; }
        emailSend.disabled = false;
      }
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

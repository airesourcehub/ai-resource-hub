// AI Resource Hub — "Who can use my GPU" manager (admin only).
// Used on gpu.html (admin section) and in admin.html → GPU Access.
// Data: gpu_access (requests + approvals), profiles (member search), gpu_workers (members' own PCs).

(function () {
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function when(iso) {
    if (!iso) return "";
    var s = (Date.now() - Date.parse(iso)) / 1000;
    if (s < 60) return "just now"; if (s < 3600) return Math.floor(s / 60) + " min ago"; if (s < 86400) return Math.floor(s / 3600) + " h ago";
    return new Date(iso).toLocaleDateString();
  }
  function who(p, uid) {
    var name = p && (p.display_name || "").trim();
    var email = p && p.email;
    return '<div class="ga-who"><b>' + esc(name || email || uid.slice(0, 8)) + "</b><span>" + esc(name ? email : "") + "</span></div>";
  }

  function mount(el, client) {
    if (!el || !client) return;
    el.innerHTML =
      '<div class="ga">' +
        '<div class="ga-card"><h4>Requests <span class="ga-count" data-n="req" hidden></span></h4><p>Members asking to use your GPU.</p><ul class="ga-list" data-list="req"></ul></div>' +
        '<div class="ga-card"><h4>Approved</h4><p>These members can create on your GPU. Everyone else uses their own PC.</p><ul class="ga-list" data-list="ok"></ul></div>' +
        '<div class="ga-card is-wide"><h4>Find a member</h4><p>Search by name or email and give them access.</p>' +
          '<form class="ga-search" data-form="search"><input class="gp-input" type="search" placeholder="Name or email" aria-label="Search members" /><button type="submit" class="gp-btn-sm is-primary">Search</button></form>' +
          '<ul class="ga-list" data-list="found"></ul></div>' +
        '<div class="ga-card is-wide"><h4>Members’ own PCs</h4><p>PCs members connected with the GPU Connector. Only their owner can use them.</p><ul class="ga-list" data-list="pcs"></ul></div>' +
      "</div>";
    var me = null, rows = [], profiles = {};

    async function load() {
      var s = await client.auth.getSession();
      me = s.data.session ? s.data.session.user.id : null;
      var a = await client.from("gpu_access").select("user_id,status,message,requested_at,decided_at").order("requested_at", { ascending: false });
      rows = a.data || [];
      var pcs = await client.from("gpu_workers").select("id,user_id,name,info,last_seen_at,url,created_at").is("revoked_at", null).order("created_at", { ascending: false });
      var ids = rows.map(function (r) { return r.user_id; }).concat((pcs.data || []).map(function (p) { return p.user_id; }));
      await loadProfiles(ids);
      paint(pcs.data || []);
    }

    async function loadProfiles(ids) {
      ids = ids.filter(function (id, i) { return id && ids.indexOf(id) === i && !profiles[id]; });
      if (!ids.length) return;
      var p = await client.from("profiles").select("id,email,display_name,is_admin").in("id", ids);
      (p.data || []).forEach(function (x) { profiles[x.id] = x; });
    }

    function paint(pcs) {
      var req = rows.filter(function (r) { return r.status === "requested"; });
      var ok = rows.filter(function (r) { return r.status === "granted"; });
      var n = el.querySelector('[data-n="req"]');
      n.hidden = !req.length; n.textContent = req.length;
      el.querySelector('[data-list="req"]').innerHTML = req.length ? req.map(function (r) {
        return '<li class="ga-row">' + who(profiles[r.user_id], r.user_id) + '<span class="gp-note">' + when(r.requested_at) + "</span>" +
          '<div class="ga-actions"><button type="button" class="gp-btn-sm is-primary" data-act="granted" data-uid="' + r.user_id + '">Approve</button>' +
          '<button type="button" class="gp-btn-sm" data-act="denied" data-uid="' + r.user_id + '">Deny</button></div>' +
          (r.message ? '<p class="ga-msg">“' + esc(r.message) + "”</p>" : "") + "</li>";
      }).join("") : '<li class="ga-empty">No requests right now.</li>';
      el.querySelector('[data-list="ok"]').innerHTML = ok.length ? ok.map(function (r) {
        return '<li class="ga-row">' + who(profiles[r.user_id], r.user_id) + '<span class="gp-note">since ' + when(r.decided_at) + "</span>" +
          '<div class="ga-actions"><button type="button" class="gp-btn-sm is-danger" data-act="revoked" data-uid="' + r.user_id + '">Remove access</button></div></li>';
      }).join("") : '<li class="ga-empty">Only you for now.</li>';
      el.querySelector('[data-list="pcs"]').innerHTML = pcs.length ? pcs.map(function (p) {
        var on = p.url && p.last_seen_at && Date.now() - Date.parse(p.last_seen_at) < 150000;
        var g = (p.info && p.info.gpu) || {};
        return '<li class="ga-row">' + who(profiles[p.user_id], p.user_id) +
          '<div class="ga-who"><b>' + esc(p.name) + "</b><span>" + esc([g.name, g.vram_gb ? g.vram_gb + " GB" : "", p.info && p.info.os].filter(Boolean).join(" · ")) + "</span></div>" +
          '<span class="gp-status-pill ' + (on ? "is-granted" : "") + '">' + (on ? "Online" : (p.last_seen_at ? "Seen " + when(p.last_seen_at) : "Never connected")) + "</span></li>";
      }).join("") : '<li class="ga-empty">No member PCs yet.</li>';
    }

    async function setStatus(uid, status) {
      var body = { user_id: uid, status: status, decided_at: new Date().toISOString(), decided_by: me, updated_at: new Date().toISOString() };
      var r = await client.from("gpu_access").upsert(body, { onConflict: "user_id" });
      if (r.error) { alert("Couldn't save: " + r.error.message); return; }
      await load();
      var f = el.querySelector('[data-form="search"] input');
      if (f.value.trim()) search(f.value.trim());
    }

    async function search(q) {
      var list = el.querySelector('[data-list="found"]');
      list.innerHTML = '<li class="ga-empty">Searching…</li>';
      var safe = q.replace(/[%,()*]/g, " ").trim();
      var r = await client.from("profiles").select("id,email,display_name,is_admin,created_at")
        .or("display_name.ilike.%" + safe + "%,email.ilike.%" + safe + "%").order("created_at", { ascending: false }).limit(20);
      var found = (r.data || []).filter(function (p) { return !p.is_admin; });
      found.forEach(function (p) { profiles[p.id] = p; });
      var st = {}; rows.forEach(function (x) { st[x.user_id] = x.status; });
      list.innerHTML = found.length ? found.map(function (p) {
        var s = st[p.id];
        var btn = s === "granted"
          ? '<span class="gp-status-pill is-granted">Has access</span><button type="button" class="gp-btn-sm is-danger" data-act="revoked" data-uid="' + p.id + '">Remove</button>'
          : '<button type="button" class="gp-btn-sm is-primary" data-act="granted" data-uid="' + p.id + '">Give access</button>';
        return '<li class="ga-row">' + who(p, p.id) + (s && s !== "granted" ? '<span class="gp-status-pill is-' + s + '">' + s + "</span>" : "") + '<div class="ga-actions">' + btn + "</div></li>";
      }).join("") : '<li class="ga-empty">No members match “' + esc(q) + '”.</li>';
    }

    el.addEventListener("click", function (e) {
      var b = e.target.closest("[data-act]");
      if (!b) return;
      b.disabled = true;
      setStatus(b.getAttribute("data-uid"), b.getAttribute("data-act"));
    });
    el.querySelector('[data-form="search"]').addEventListener("submit", function (e) {
      e.preventDefault();
      var q = e.target.querySelector("input").value.trim();
      if (q) search(q);
    });
    load();
    return { reload: load };
  }

  window.AIRH_GPU_ADMIN = { mount: mount };
})();

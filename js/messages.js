// AI Resource Hub — direct messages.
// Left: conversation list (grouped by the other member, with unread counts).
// Right: the open thread + a compose box. ?to=<user_id> starts/opens a chat.

(function () {
  if (!window.supabase || typeof SUPABASE_URL === "undefined") return;
  var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  var me = null, current = null, names = {}, avatars = {}, pollTimer = null;

  var gate = document.getElementById("msgGate");
  var body = document.getElementById("msgBody");

  init();

  async function init() {
    var s = await client.auth.getSession();
    me = s.data.session ? s.data.session.user : null;
    if (!me) {
      gate.innerHTML = 'Please <a href="auth.html">log in</a> to see your messages.';
      gate.classList.add("show"); gate.style.display = ""; return;
    }
    body.style.display = "";
    document.getElementById("composeForm").addEventListener("submit", onSend);

    var to = new URLSearchParams(location.search).get("to");
    if (to && to !== me.id) current = to;
    await refresh();
    pollTimer = setInterval(refresh, 5000);
  }

  async function refresh() {
    var res = await client.from("messages")
      .select("id,sender_id,recipient_id,body,read,created_at")
      .or("sender_id.eq." + me.id + ",recipient_id.eq." + me.id)
      .order("created_at", { ascending: true }).limit(1000);
    var msgs = (res.data || []);

    // group by the other party
    var convs = {};
    msgs.forEach(function (m) {
      var other = m.sender_id === me.id ? m.recipient_id : m.sender_id;
      if (!convs[other]) convs[other] = { other: other, items: [], unread: 0, last: null };
      convs[other].items.push(m);
      convs[other].last = m;
      if (m.recipient_id === me.id && !m.read) convs[other].unread++;
    });
    if (current && !convs[current]) convs[current] = { other: current, items: [], unread: 0, last: null };

    await ensureNames(Object.keys(convs));
    renderList(convs);
    if (current) renderThread(convs[current]);
  }

  async function ensureNames(ids) {
    var missing = ids.filter(function (id) { return id && !(id in names); });
    if (!missing.length) return;
    var res = await client.from("public_profiles").select("id,display_name,avatar_url").in("id", missing);
    (res.data || []).forEach(function (p) { names[p.id] = p.display_name || "Member"; avatars[p.id] = p.avatar_url || null; });
    missing.forEach(function (id) { if (!(id in names)) names[id] = "Member"; });
  }

  function renderList(convs) {
    var host = document.getElementById("convList");
    var arr = Object.keys(convs).map(function (k) { return convs[k]; })
      .sort(function (a, b) { return tp(b.last) - tp(a.last); });
    if (!arr.length) { host.innerHTML = '<p class="model-note">No conversations yet.</p>'; return; }
    host.innerHTML = arr.map(function (c) {
      var nm = names[c.other] || "Member";
      var prev = c.last ? (c.last.sender_id === me.id ? "You: " : "") + trunc(c.last.body, 34) : "New conversation";
      return '<button type="button" class="conv-item' + (c.other === current ? " active" : "") + '" data-other="' + esc(c.other) + '">' +
        '<span class="conv-name">' + esc(nm) + (c.unread ? ' <span class="conv-unread">' + c.unread + '</span>' : '') + '</span>' +
        '<span class="conv-prev">' + esc(prev) + '</span></button>';
    }).join("");
    Array.prototype.forEach.call(host.querySelectorAll(".conv-item"), function (b) {
      b.addEventListener("click", function () { current = b.getAttribute("data-other"); refresh(); });
    });
  }

  async function renderThread(conv) {
    var head = document.getElementById("threadHead");
    var scroll = document.getElementById("threadScroll");
    document.getElementById("composeForm").style.display = "";
    head.innerHTML = '<a class="thread-name" href="profile.html?u=' + esc(current) + '">' + esc(names[current] || "Member") + '</a>';
    var items = (conv && conv.items) || [];
    scroll.innerHTML = items.map(function (m) {
      var mine = m.sender_id === me.id;
      return '<div class="msg-bubble ' + (mine ? "mine" : "theirs") + '">' + esc(m.body) +
        '<span class="msg-time">' + fmt(m.created_at) + '</span></div>';
    }).join("") || '<p class="model-note">Say hello 👋</p>';
    scroll.scrollTop = scroll.scrollHeight;

    // mark their messages to me as read
    var unreadIds = items.filter(function (m) { return m.recipient_id === me.id && !m.read; }).map(function (m) { return m.id; });
    if (unreadIds.length) { client.from("messages").update({ read: true }).in("id", unreadIds).then(function () {}, function () {}); }
  }

  async function onSend(e) {
    e.preventDefault();
    var input = document.getElementById("composeInput");
    var text = (input.value || "").trim();
    if (!text || !current) return;
    input.value = "";
    var r = await client.from("messages").insert({ sender_id: me.id, recipient_id: current, body: text });
    if (r.error) { input.value = text; alert("Couldn’t send: " + r.error.message); return; }
    refresh();
  }

  function tp(m) { return m ? (Date.parse(m.created_at) || 0) : 0; }
  function fmt(iso) { try { return new Date(iso).toLocaleString(); } catch (e) { return ""; } }
  function trunc(s, n) { s = String(s || ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
})();

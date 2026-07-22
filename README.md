# AI Resource Hub

A GitHub Pages–ready website: a curated AI resource directory, a
per-model Prompt Generator (text, image, video — formatted for the specific
AI you're using), user accounts (email/password), and a Gallery for saving
your own AI photos and videos with the prompt + hashtags that made them —
public or private, searchable.

## File structure

```
index.html               Home page
resources.html            AI tools directory (filterable by category)
prompt-generator.html      Prompt Generator (per-model formatting)
gallery.html               Photo/video + prompt + hashtag gallery (Supabase-backed)
auth.html                  Log in / sign up (email + password), invite-only
admin.html                 Hidden admin panel — not linked anywhere in the nav
about.html                 Mission + contact
privacy-policy.html        Required before applying for Google AdSense
css/style.css              Shared styles
js/main.js                 Nav toggle, active link, resource filtering
js/prompt-generator.js     Prompt Generator logic (all models)
js/supabase-config.js      Live Supabase project keys (already filled in)
js/cloudinary-config.js    Cloudinary cloud name + unsigned upload preset (already filled in)
js/auth.js                 Sign up / log in / log out + request-access logic
js/auth-nav.js             Shows Log In / account state in the nav on every page
js/gallery.js              Gallery upload / search / lightbox logic
js/admin.js                Admin panel logic (requests, allowlist, users, moderation, analytics)
js/analytics.js            Lightweight first-party visit tracker, loaded on every page
```

## Deploying to GitHub Pages

1. Create a new GitHub repository (public).
2. Upload all files in this folder to the repo root (keep the `css/` and
   `js/` folders intact).
3. In the repo, go to **Settings → Pages**.
4. Under "Build and deployment", set Source to **Deploy from a branch**,
   branch `main`, folder `/ (root)`. Save.
5. GitHub will give you a URL like `https://yourusername.github.io/repo-name/`.
   The site is live there within a minute or two.

## Connecting your own domain

1. Buy a domain from any registrar (Namecheap, Cloudflare, etc.).
2. In the GitHub repo, go to **Settings → Pages → Custom domain**, enter
   your domain, and save (this creates a `CNAME` file in the repo).
3. At your domain registrar, add the DNS records GitHub's docs specify
   (typically 4 A records, or a CNAME record for a `www` subdomain).
4. Wait for DNS to propagate, then enable "Enforce HTTPS" in Pages settings.

## Prompt Generator: how the per-model formatting works

Each tab (Text, Image, Video) has a **Model** dropdown. The same guided
form fields get reformatted into that model's actual prompting convention:

- **Text:** ChatGPT/Gemini use plain conversational instructions. Claude
  uses XML-tag structuring (`<role>`, `<task>`, etc.), which Claude follows
  more reliably for structured tasks.
- **Image:** Midjourney gets a comma-separated phrase plus `--ar` / `--v` /
  `--no` parameters. DALL-E and Adobe Firefly get a full natural-language
  sentence (they ignore parameter flags). Stable Diffusion gets comma-tag
  tokens plus a separate `Negative prompt:` line.
- **Video:** LTX Video gets a chronological structure (action first, motion
  detail, then camera/lighting last — LTX's own docs recommend this order).
  Veo, Runway, and Sora get a cinematic natural-language paragraph. Kling
  gets explicit `camera_movement:` / `style:` labels plus an optional
  negative prompt. Pika gets dash parameters (`-motion`, `-gs`, `-ar`). Wan
  2.1/2.2 gets its documented 6-part structure — camera movement, subject/
  scene, motion, camera language, style, atmosphere — plus a negative prompt.

Model prompting conventions change as these products update — if a model
changes its syntax, update the matching branch in `js/prompt-generator.js`
(`buildTextPrompt`, `buildImagePrompt`, `buildVideoPrompt`).

## Accounts + Gallery setup (Supabase — already connected)

Accounts and the Gallery are wired up to a live Supabase project:

- **Organization:** airesourcehub
- **Project:** ai-resource-hub (`flzhhgfkpdmszucoljpu`, region `us-east-1`, free tier — $0/month)
- **Auth:** Supabase Auth, email/password. Sign up and log in on `auth.html`.
- **Table:** `gallery_prompts` — `id`, `created_at`, `image_url`,
  `cloudinary_public_id`, `title`, `prompt`, `hashtags text[]`, `model`,
  `user_id` (owner), `is_public` (boolean, default true), `media_type`
  (`'image'` or `'video'`), `likes_count` (integer, kept in sync by a
  trigger — see "Gallery browsing" below)
- **Table:** `gallery_likes` — one row per (user, gallery entry) like;
  a unique constraint stops double-liking, and insert/delete triggers keep
  `gallery_prompts.likes_count` up to date automatically.
- **Keys:** already filled in at `js/supabase-config.js`

Nothing further to do — deploy the site as-is and accounts + the Gallery
will work against this project. How access works:

- Anyone can browse and search **public** gallery entries without logging in.
- You must be logged in to post (photo or video).
- Each entry is posted **public** (visible to everyone) or **private**
  (visible only to you) — your choice per upload, shown as a toggle on the
  upload form. This is enforced by Postgres row-level security, not just
  hidden in the UI: logged-out visitors and other users are only ever sent
  public rows by the database.
- You can edit your own entries later: open one in the gallery lightbox and
  click **Edit** to change its title, prompt, hashtags, model, or visibility
  (the media file itself isn't replaceable — re-upload as a new entry for
  that). This is also RLS-enforced (`Update own` policy), so only the
  owner's edits are accepted by the database.

**One manual step worth doing:** open your Supabase project →
**Authentication → URL Configuration**, and set the **Site URL** to your
live GitHub Pages URL (e.g. `https://airesourcehub.github.io/ai-resource-hub/`),
plus add it under **Redirect URLs**. This makes email confirmation links
land back on your live site instead of `localhost`. Also worth knowing:
**Authentication → Providers → Email** has a "Confirm email" toggle — it's
on by default (new users must click a confirmation link before logging in).
Turn it off there if you'd rather signups be instant, at the cost of easier
fake sign-ups.

**Security note on "private":** Cloudinary URLs use a random public ID, so a
private entry's file isn't discoverable through the app (the database row
is hidden by RLS) but the raw file URL itself isn't cryptographically locked
down. That's a reasonable trade-off for an MVP; if you need true
private-file security later, ask and I can wire up signed/authenticated
delivery instead.

## Gallery browsing: sort, search, and likes

The Gallery page shows the grid first — uploading lives behind a separate
**Upload** button instead of a form sitting above the grid.

- **Upload button** (top-right of the toolbar) opens a modal with the same
  upload form as before. If you're logged out, the modal shows a
  "log in or sign up" message instead of the form.
- **Sort dropdown** next to the search box:
  - **Most Popular** (default) — highest `likes_count` first, ties broken
    by newest.
  - **Most Recent** — newest first.
  - **Most Relevant** — only meaningful while a search query is active
    (ranks hashtag matches highest, then title, then prompt text); with no
    query it falls back to Most Popular.
- **Likes** — every entry has a heart button (on the grid card and in the
  lightbox). Liking requires login (clicking it while logged out sends you
  to `auth.html`); each user can like an entry once, and un-clicking removes
  the like. The count shown is `gallery_prompts.likes_count`, kept in sync
  server-side by a trigger on the `gallery_likes` table — so it can't be
  inflated from the browser console.

**Mobile video thumbnails:** grid/hover video thumbnails use a Cloudinary
still-frame (`so_0` transform on the video's `cloudinary_public_id`) as the
`<video poster>`. This fixes a real bug where iOS Safari showed a blank box
instead of a frame — mobile Safari doesn't decode a preview frame for
`preload="metadata"` the way desktop browsers do, so an explicit poster
image is needed.

## Gallery file storage (Cloudinary)

Photos and videos in the Gallery are hosted on Cloudinary instead of
Supabase Storage — deliberately, so the Gallery is the *only* thing that
depends on it. If Cloudinary is ever down or misconfigured, the rest of
the site (Home, Resources, Prompt Generator, accounts) is unaffected;
only Gallery uploads/thumbnails would break.

- **Cloud name:** `xif5o0uw` (already set in `js/cloudinary-config.js`,
  not a secret — it's part of every delivery URL).
- **Plan:** Free (25 credits/month, which is Cloudinary's blended unit
  across storage + bandwidth + transformations). Per-file size limits on
  the free plan: **10MB for images, 100MB for videos** — enforced both
  client-side (a friendly error before upload) and by Cloudinary itself.
- **How uploads work:** the browser uploads the file directly to
  Cloudinary's unsigned upload API — no backend involved. This is why the
  one-time setup below is required: unsigned uploads only work through a
  named "upload preset" you create yourself (Cloudinary's own anti-abuse
  design; an unsigned preset can't be created via API, only the Console).

**One-time setup required** (skip if already done): in the
[Cloudinary Console](https://console.cloudinary.com) → **Settings → Upload
→ Upload presets → Add upload preset**:
1. Set **Preset name** to exactly `ai_resource_hub_gallery`.
2. Set **Signing Mode** to **Unsigned**.
3. (Optional) Set **Folder** to `gallery` to keep uploads organized.
4. Save.

If you'd rather use a different preset name, update
`CLOUDINARY_UPLOAD_PRESET` in `js/cloudinary-config.js` to match.

**Known limitation:** deleting an entry from the admin panel's Gallery
Moderation tab removes the database row (so it disappears from the site
immediately) but doesn't delete the underlying file from Cloudinary —
doing that securely requires the API secret, which can't live in
browser-side code. Orphaned files just sit in Cloudinary using up your
free quota slowly. Ask me to clean them up periodically (I have Cloudinary
access and can delete by `cloudinary_public_id`), or do it yourself from
the Cloudinary Console's Media Library.

## Invite-only sign-up + admin panel

Sign-up is gated: only emails you've explicitly approved can create an
account. This is enforced by the database itself (a Postgres trigger on
`auth.users`), not just hidden in the UI — so it can't be bypassed from the
browser console.

- If someone tries to sign up with an email that isn't on the allowlist,
  they get a friendly "not approved yet" message pointing them to your
  admin email and a **Request Access** form (also always visible under the
  Sign Up tab) that logs their email + a short note to `access_requests`.
- You manage everything from **`admin.html`** — a page that exists but
  isn't linked anywhere in the site nav (a "door," as requested). Reach it
  by typing the URL directly, e.g.
  `https://airesourcehub.github.io/ai-resource-hub/admin.html`, after
  logging in at `auth.html` with your admin account
  (`mrcrissp@gmail.com` — the password is the one you gave me; it's stored
  only in Supabase, never in this repo).
- The admin panel has five tabs:
  - **Access Requests** — approve (adds the email to the allowlist so they
    can now sign up) or deny each pending request.
  - **Allowlist** — add emails directly (approved or blocked), or
    block/remove existing ones. Blocking an email here stops *future*
    sign-ups with that address, even if it was approved before.
  - **Users** — every registered account, with a Block/Unblock toggle.
    Blocking an existing user's account (`profiles.status = 'blocked'`)
    stops them from posting to the Gallery going forward — this is also
    enforced by RLS, not just the UI.
  - **Gallery Moderation** — every gallery entry, including other people's
    *private* ones (admins can see those for moderation purposes), with a
    Delete button.
  - **Analytics** — see below.
- This client-side admin check is just for a clean UX; the actual security
  boundary is the database's row-level security, keyed off a `profiles`
  table with an `is_admin` flag. Even someone who loads `admin.html`
  without being an admin can't read or change anything — every query
  they'd make is denied by Postgres itself.
- To promote a different email to admin later, or add more admins, run in
  the Supabase SQL editor:
  ```sql
  update profiles set is_admin = true where email = 'someone@example.com';
  ```

## Analytics

Every page (via `js/analytics.js`) logs a lightweight, first-party visit
record to a Supabase table (`analytics_events`): path, referrer, browser
user agent, a session id, and an approximate IP + city/region/country
(looked up client-side via the free [ipwho.is](https://ipwho.is) API — no
key required). A small heartbeat updates how long the tab stayed open.
Only the admin can read this data back, in the Analytics tab of
`admin.html` — pageview counts, unique sessions, average time on page, top
referrers, top countries, and a recent-visits list with IP/location.

**Privacy note:** this logs visitors' IP addresses and approximate
location without a cookie-consent prompt. That's a reasonable trade-off
for a small personal site, but if you grow this or serve visitors in the
EU/UK, update `privacy-policy.html` to disclose it, and consider whether
you need a consent banner depending on your audience and legal advice.

**Recreating this elsewhere** (e.g. a different Supabase project): run this
in the SQL Editor of the new project, then update `js/supabase-config.js`
with its Project URL and anon/publishable key (**Project Settings → API**):

```sql
create table gallery_prompts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  image_url text not null,
  cloudinary_public_id text,
  title text,
  prompt text not null,
  hashtags text[] default '{}',
  model text,
  user_id uuid references auth.users(id) on delete cascade,
  is_public boolean not null default true,
  media_type text not null default 'image',
  likes_count integer not null default 0
);

alter table gallery_prompts enable row level security;

create policy "Read public or own" on gallery_prompts
  for select using (is_public = true or auth.uid() = user_id);

create policy "Insert own" on gallery_prompts
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy "Update own" on gallery_prompts
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Delete own" on gallery_prompts
  for delete to authenticated
  using (auth.uid() = user_id);

-- No Supabase Storage bucket needed — gallery files go straight to
-- Cloudinary from the browser. See "Gallery file storage (Cloudinary)"
-- above for the one-time unsigned upload preset setup.

-- Likes (see "Gallery browsing: sort, search, and likes" above)
create table gallery_likes (
  id uuid primary key default gen_random_uuid(),
  gallery_id uuid not null references gallery_prompts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (gallery_id, user_id)
);
alter table gallery_likes enable row level security;
create policy "Likes: read own" on gallery_likes
  for select using (auth.uid() = user_id);
create policy "Likes: insert own" on gallery_likes
  for insert to authenticated with check (auth.uid() = user_id);
create policy "Likes: delete own" on gallery_likes
  for delete to authenticated using (auth.uid() = user_id);

-- Keeps gallery_prompts.likes_count in sync (security definer bypasses the
-- owner-only update policy on gallery_prompts, since likers aren't owners)
create or replace function adjust_gallery_likes_count() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'INSERT') then
    update gallery_prompts set likes_count = likes_count + 1 where id = new.gallery_id;
    return new;
  elsif (tg_op = 'DELETE') then
    update gallery_prompts set likes_count = greatest(likes_count - 1, 0) where id = old.gallery_id;
    return old;
  end if;
  return null;
end;
$$;
create trigger gallery_likes_after_insert
  after insert on gallery_likes
  for each row execute function adjust_gallery_likes_count();
create trigger gallery_likes_after_delete
  after delete on gallery_likes
  for each row execute function adjust_gallery_likes_count();

-- Admin / allowlist / analytics (see "Invite-only sign-up + admin panel"
-- and "Analytics" sections above for what this enables)

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  is_admin boolean not null default false,
  status text not null default 'active' check (status in ('active','blocked')),
  created_at timestamptz not null default now()
);
alter table profiles enable row level security;

create function is_admin(uid uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select coalesce((select p.is_admin from profiles p where p.id = uid), false);
$$;

create policy "Profiles: self or admin read" on profiles
  for select using (auth.uid() = id or is_admin(auth.uid()));
create policy "Profiles: admin update" on profiles
  for update using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

create table allowed_emails (
  email text primary key,
  status text not null default 'approved' check (status in ('approved','blocked')),
  note text,
  created_at timestamptz not null default now()
);
alter table allowed_emails enable row level security;
create policy "Allowed emails: admin only" on allowed_emails
  for all using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

create table access_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  message text,
  status text not null default 'pending' check (status in ('pending','approved','denied')),
  created_at timestamptz not null default now()
);
alter table access_requests enable row level security;
create policy "Access requests: anyone can submit" on access_requests
  for insert to anon, authenticated with check (true);
create policy "Access requests: admin manage" on access_requests
  for select using (is_admin(auth.uid()));
create policy "Access requests: admin update" on access_requests
  for update using (is_admin(auth.uid())) with check (is_admin(auth.uid()));
create policy "Access requests: admin delete" on access_requests
  for delete using (is_admin(auth.uid()));

create table analytics_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  path text, referrer text, user_agent text, ip text,
  city text, region text, country text,
  session_id text, duration_seconds numeric
);
alter table analytics_events enable row level security;
create policy "Analytics: anyone can insert" on analytics_events
  for insert to anon, authenticated with check (true);
create policy "Analytics: anyone can update duration" on analytics_events
  for update to anon, authenticated using (true) with check (true);
create policy "Analytics: admin read" on analytics_events
  for select using (is_admin(auth.uid()));
create policy "Analytics: admin delete" on analytics_events
  for delete using (is_admin(auth.uid()));

-- Blocks sign-up for any email not on the allowlist
create function check_email_allowed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from allowed_emails
    where lower(email) = lower(new.email) and status = 'approved'
  ) then
    raise exception 'EMAIL_NOT_APPROVED' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger enforce_email_allowlist
before insert on auth.users
for each row execute function check_email_allowed();

-- Auto-creates a profiles row for every new user
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;
create trigger create_profile_on_signup
after insert on auth.users
for each row execute function handle_new_user();

-- Extra policies on gallery_prompts for the admin panel + blocked-user gate
drop policy "Insert own" on gallery_prompts;
create policy "Insert own" on gallery_prompts
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (select 1 from profiles p where p.id = auth.uid() and p.status = 'active')
  );
create policy "Gallery: admin read all" on gallery_prompts
  for select using (is_admin(auth.uid()));
create policy "Gallery: admin delete" on gallery_prompts
  for delete using (is_admin(auth.uid()));

-- Whitelist yourself and make yourself admin (run after you've signed up once)
insert into allowed_emails (email, status, note) values ('you@example.com', 'approved', 'Site owner / admin');
update profiles set is_admin = true, status = 'active' where email = 'you@example.com';
```

## Before applying for Google AdSense

- Update `about.html` and `privacy-policy.html` with your real details.
- Add a handful more real resource entries so the site has real content depth.
- Make sure the domain has been live for a little while with real content.
- Once approved, replace the `.ad-placeholder` divs in each page with your
  actual AdSense ad unit code.

## Next steps toward a subscription model

Accounts already exist (Supabase Auth), which is the foundation a paid tier
needs. When you're ready to add subscriptions:
- Payments: Stripe (Checkout or Billing) is the standard choice.
- Add a `subscriptions` or `plan` field tied to `auth.users` (e.g. a
  `profiles` table with a `plan` column), set by a Stripe webhook.
- Gate specific gallery features, prompt-generator models, or new tools
  behind `plan = 'pro'` checks in RLS policies and in the UI.
- Optional: add Google (or other OAuth) sign-in later via **Authentication →
  Providers** in Supabase — requires creating OAuth credentials in Google
  Cloud Console and pasting the Client ID/Secret into Supabase's dashboard.

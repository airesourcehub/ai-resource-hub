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
auth.html                  Log in / sign up (email + password)
about.html                 Mission + contact
privacy-policy.html        Required before applying for Google AdSense
css/style.css              Shared styles
js/main.js                 Nav toggle, active link, resource filtering
js/prompt-generator.js     Prompt Generator logic (all models)
js/supabase-config.js      Live Supabase project keys (already filled in)
js/auth.js                 Sign up / log in / log out logic
js/auth-nav.js             Shows Log In / account state in the nav on every page
js/gallery.js              Gallery upload / search / lightbox logic
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
- **Table:** `gallery_prompts` — `id`, `created_at`, `image_url`, `title`,
  `prompt`, `hashtags text[]`, `model`, `user_id` (owner), `is_public`
  (boolean, default true), `media_type` (`'image'` or `'video'`)
- **Storage bucket:** `gallery-images` (public; holds both images and
  videos), allowed types `image/*` and `video/*` (mp4, webm, mov), 100MB
  file size limit
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

**One manual step worth doing:** open your Supabase project →
**Authentication → URL Configuration**, and set the **Site URL** to your
live GitHub Pages URL (e.g. `https://airesourcehub.github.io/ai-resource-hub/`),
plus add it under **Redirect URLs**. This makes email confirmation links
land back on your live site instead of `localhost`. Also worth knowing:
**Authentication → Providers → Email** has a "Confirm email" toggle — it's
on by default (new users must click a confirmation link before logging in).
Turn it off there if you'd rather signups be instant, at the cost of easier
fake sign-ups.

**Security note on "private":** the storage bucket is public, and file
paths are random/unguessable, so a private entry's file isn't discoverable
through the app (the database row is hidden by RLS) but the raw file URL
itself isn't cryptographically locked down. That's a reasonable trade-off
for an MVP; if you need true private-file security later, that means moving
to a private bucket with signed URLs — ask and I can wire that up.

**Recreating this elsewhere** (e.g. a different Supabase project): run this
in the SQL Editor of the new project, then update `js/supabase-config.js`
with its Project URL and anon/publishable key (**Project Settings → API**):

```sql
create table gallery_prompts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  image_url text not null,
  title text,
  prompt text not null,
  hashtags text[] default '{}',
  model text,
  user_id uuid references auth.users(id) on delete cascade,
  is_public boolean not null default true,
  media_type text not null default 'image'
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

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'gallery-images', 'gallery-images', true, 104857600,
  array['image/png','image/jpeg','image/gif','image/webp','video/mp4','video/webm','video/quicktime']
)
on conflict (id) do nothing;

create policy "Public read access to gallery images"
  on storage.objects for select
  using (bucket_id = 'gallery-images');

create policy "Authenticated upload access to gallery images"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'gallery-images');
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

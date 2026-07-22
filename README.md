# AI Resource Hub

A GitHub Pages–ready website: a curated AI resource directory, a
per-model Prompt Generator (text, image, video — formatted for the specific
AI you're using), and a Gallery for saving your own AI photo + prompt +
hashtag combinations with search.

## File structure

```
index.html               Home page
resources.html            AI tools directory (filterable by category)
prompt-generator.html      Prompt Generator (per-model formatting)
gallery.html               Photo + prompt + hashtag gallery (Supabase-backed)
about.html                 Mission + contact
privacy-policy.html        Required before applying for Google AdSense
css/style.css              Shared styles
js/main.js                 Nav toggle, active link, resource filtering
js/prompt-generator.js     Prompt Generator logic (all models)
js/supabase-config.js      Live Supabase project keys (already filled in)
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
  negative prompt. Pika gets dash parameters (`-motion`, `-gs`, `-ar`).

Model prompting conventions change as these products update — if a model
changes its syntax, update the matching branch in `js/prompt-generator.js`
(`buildTextPrompt`, `buildImagePrompt`, `buildVideoPrompt`).

## Gallery setup (Supabase — already connected)

The Gallery is already wired up to a live Supabase project:

- **Organization:** airesourcehub
- **Project:** ai-resource-hub (`flzhhgfkpdmszucoljpu`, region `us-east-1`, free tier — $0/month)
- **Table:** `gallery_prompts` (columns: `id`, `created_at`, `image_url`, `prompt`, `hashtags text[]`, `model`), RLS enabled with public read + public insert policies
- **Storage bucket:** `gallery-images` (public), with public read + public upload policies
- **Keys:** already filled in at `js/supabase-config.js`

Nothing further to do — deploy the site as-is and the Gallery page will
upload, search, and browse against this project.

**Security note:** the "public read + public insert" policies mean anyone
with your site's public key can add or view gallery entries — there's no
login system yet. That's fine for a personal MVP, but before sharing the
site publicly or opening it to other users, add Supabase Auth and restrict
the insert policy to authenticated users.

**Recreating this elsewhere** (e.g. a different Supabase project): run this
in the SQL Editor of the new project, then update `js/supabase-config.js`
with its Project URL and anon/publishable key (**Project Settings → API**):

```sql
create table gallery_prompts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  image_url text not null,
  prompt text not null,
  hashtags text[] default '{}',
  model text
);

alter table gallery_prompts enable row level security;

create policy "Public can read gallery" on gallery_prompts
  for select using (true);

create policy "Public can insert gallery" on gallery_prompts
  for insert with check (true);

insert into storage.buckets (id, name, public)
values ('gallery-images', 'gallery-images', true)
on conflict (id) do nothing;

create policy "Public read access to gallery images"
  on storage.objects for select
  using (bucket_id = 'gallery-images');

create policy "Public upload access to gallery images"
  on storage.objects for insert
  with check (bucket_id = 'gallery-images');
```

## Before applying for Google AdSense

- Update `about.html` and `privacy-policy.html` with your real details.
- Add a handful more real resource entries so the site has real content depth.
- Make sure the domain has been live for a little while with real content.
- Once approved, replace the `.ad-placeholder` divs in each page with your
  actual AdSense ad unit code.

## Next steps toward a subscription model

This site is intentionally backend-light for now (Supabase is only used for
the Gallery). When you're ready to add subscriber accounts and gated tools:
- Payments: Stripe (Checkout or Billing) is the standard choice.
- Auth/accounts: Supabase Auth (since it's already in the stack), Auth0, or
  Memberstack are common options.
- You can gate the Gallery, extra prompt-generator features, or new tools
  behind a login once Supabase Auth is added — no full rebuild required.

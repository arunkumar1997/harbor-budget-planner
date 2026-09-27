# Deploying to Vercel

This is a TanStack Start app. It builds and runs on Vercel with **no environment
variables** — it falls back to an embedded database and ships with sign-in off.
Add a database only when you want data to persist across visits (recommended).

## 1. Push to GitHub

From this folder (works in Termux on Android, or on any computer):

```bash
git init
git add .
git commit -m "Budget app — INR + Indian statement parsing"
git branch -M main
# create an empty repo on github.com first (no README), then:
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

`.gitignore` already excludes `node_modules/` and the stale `.vercel/` build
output, so Vercel rebuilds fresh from source.

## 2. Deploy on Vercel

1. Go to vercel.com → **Add New… → Project** → import your GitHub repo.
2. Leave the build settings as detected (the repo's `vercel.json` sets the
   install command). Click **Deploy**.
3. Open the deployment URL — on your phone too.

That's it for a working demo. Data lives in an ephemeral in-process DB, so it
may reset between visits until you add a real database (next step).

## 3. (Recommended) Persist data — add a free Neon Postgres

1. Create a free Postgres at neon.tech and copy its connection string.
2. In Vercel → your project → **Settings → Environment Variables**, add:
   - `DATABASE_URL` = `postgresql://…` (the Neon string)
3. **Redeploy.** `npm run build` runs the migrations against Neon automatically,
   so the schema is created on deploy. Data now persists.

## Optional env vars

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Persist data in Postgres (Neon). Without it, an embedded fallback DB is used (does not persist reliably on serverless). |
| `XAI_API_KEY` | Enables AI-assisted statement parsing. **Not required** — the built-in regex parser handles ₹ / `Rs` / `C`, Indian date & lakh formats, and Indian merchants without it. |
| `VITE_AUTH_ENABLED` | `"true"` turns on Google / X sign-in (needs the platform's auth vars). Off by default; leave unset for a personal single-user app. |

## Run locally (optional)

```bash
npm install
npm run dev        # http://localhost:8080, embedded DB, no env needed
```

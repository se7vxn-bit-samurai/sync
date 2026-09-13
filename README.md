# Sync

MirrorFlow Sync — sync.theguide.club

Next.js app with Supabase Auth. The previous offline-first single-file
build is preserved at `legacy/index.standalone.html` for reference.

## Stack
- Next.js (App Router) on Vercel
- Supabase (Postgres + Auth)
- Resend (transactional email, via Supabase Auth SMTP)

## Local setup

```bash
npm install
cp .env.local.example .env.local   # fill in Supabase keys
npm run dev
```

## Env vars

| Var | Where |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project settings → API |

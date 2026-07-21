# Sagefinan

Daily stock audit for hotel departments — see [`SPEC.md`](SPEC.md) for the
full specification and [`design/ui-draft.html`](design/ui-draft.html) for the
authoritative design reference.

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you'll be redirected to
`/login`. Seeded admin credentials:

- Email: `admin@sagefinan.local`
- Password: `ChangeMe123!`

## Database

Migrations live in `supabase/migrations/` (plain SQL, no ORM). Apply to the
linked project:

```bash
supabase db push
```

Regenerate types after any schema change:

```bash
supabase gen types typescript --linked > lib/supabase/database.types.ts
```

Seed data (departments, products, product assignments, an admin user, and a
few sample movements):

```bash
supabase db query --linked -f supabase/seed.sql
node scripts/seed-admin.mjs
```

## Learn more

See `CLAUDE.md` for stack conventions and a running log of what each phase
delivered.

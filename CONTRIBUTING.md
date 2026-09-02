# Contributing to Kashin

Thanks for wanting to help. Kashin is a local-first personal finance app for
Akahu — the kind of software where trust matters, so reviews are welcome.

## Dev setup

```bash
npm install
cp .env.example .env.local
openssl rand -base64 32   # paste after AKAHU_ENCRYPTION_KEY=
npm run dev
```

## Quality gates

Run these before opening a PR — all three must pass:

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm run build       # next build
```

## What's where

- `src/app/` — Next.js app router (pages, server actions)
- `src/components/` — UI components (paper-themed, shadcn-style primitives in `ui/`)
- `src/lib/` — data access, Akahu client, vault/encryption, LLM layer
- `src/data/` — shipped data (e.g. `merchant-hints.json`)
- `docs/` — guides (self-hosting, etc.)

## Design & data notes

- **UI:** prefer the approved component patterns under `src/components/ui/`
  (Radix-based) and the paper design tokens in `globals.css` before hand-rolling.
- **No hardcoded personal data.** Budgets, goals, travel windows and settings
  are user-editable in Settings; keep defaults generic (empty or neutral).
- **Security is load-bearing.** Never log or commit tokens/keys. Encrypt
  anything sensitive at rest with the existing vault utilities.
- **Schema changes** go through migrations in `src/lib/db.ts`.

## Suggested areas to contribute

- More merchant hints (add to `src/data/merchant-hints.json`)
- Additional LLM providers in `src/lib/llm.ts`
- UI polish and accessibility
- Tests (currently light — a good place to add value)

## Questions

Open an issue or PR. Keep changes focused and well-described.
# Kashin

**Local-first personal finance for Akahu.**

Kashin connects your New Zealand bank accounts through [Akahu](https://akahu.nz),
keeps everything in a local SQLite file on your machine, and helps you budget,
track savings goals, and review your spending — privately, with no cloud
database and no account.

![Kashin dashboard](https://via.placeholder.com/1200x600/1c2b3a/ffffff?text=Kashin+Dashboard+Preview)

## Why Kashin

- **Private by default** — all data lives in `data/app.db` on your machine. Your
  transactions never leave your computer unless you choose to.
- **Built on Akahu** — connect any NZ bank or credit card through your own
  Akahu personal app. Read-only; Kashin never stores bank credentials.
- **Budgets that make sense** — choose which accounts feed your balanced budget,
  set monthly targets per category, and see weekly and monthly spend.
- **A review queue that learns** — local categorisation improves as you review.
  Confirm a merchant once and it's remembered for every future transaction.
- **Optional AI categorisation** — bring your own LLM API key to help with the
  tricky ones. Off by default.
- **Your categories, your rules** — add, rename, recolour and archive categories;
  define your own goals and travel windows. Nothing is hardcoded.

## Requirements

- Node.js 20.9 or newer
- OpenSSL
- An Akahu **personal app** (User Access Token + App ID Token) — free at
  [my.akahu.nz](https://my.akahu.nz). Kashin only needs read-only access.

## Quickstart

### Option A — one-command install (recommended)

**macOS / Linux** — paste this in a terminal (or double-click `Kashin.command`):

```bash
git clone https://github.com/devdass/kashin.git
cd kashin
bash install.sh
```

**Windows** — double-click `install.bat` (or run it from a terminal).

The installer checks for Node.js (and offers to install it), installs dependencies,
generates your local encryption key, and starts Kashin at
[http://localhost:3000](http://localhost:3000) — one command, no manual setup.

### Option B — manual

```bash
git clone https://github.com/devdass/kashin.git
cd kashin
npm install
cp .env.example .env.local
openssl rand -base64 32   # paste the output after AKAHU_ENCRYPTION_KEY=
npm run dev
```

### First run (guided wizard)

Open [http://localhost:3000](http://localhost:3000) and follow the wizard:

1. Create a local password (12+ characters). It's hashed with Argon2id and is
   *not* an Akahu or bank password.
2. Paste your Akahu **User Access Token** and **App ID Token** from
   [my.akahu.nz](https://my.akahu.nz). They're verified with Akahu and encrypted
   before being stored.
3. Sync your accounts, then pick which ones feed your balanced budget.
4. **Build your own categories** — the wizard suggests common ones, and you can
   rename, remove, or add your own.
5. Optionally add savings goals, set budget targets, and enable AI categorisation.

That's it — you'll land on your dashboard with your own categories and data.

## AI categorisation (optional)

Kashin can use a large language model to help label transactions the local
rules can't resolve. It is **off by default**.

In the wizard (or **Settings → AI categorisation**):

1. Tick *Enable AI categorisation*.
2. Choose a provider — **Surplus Intelligence** (recommended, pre-filled),
   **OpenAI**, **Anthropic**, or any **OpenAI-compatible** endpoint
   (Ollama, OpenRouter, etc.).
3. Enter your own API key and model.
4. **Test connection**, then run **Categorise now**.

Privacy: when enabled, the descriptions of unmatched transactions are sent to
the provider you configure — never account numbers or your tokens. AI
suggestions land in your review queue for confirmation, so nothing is
auto-committed silently.

## Configuration

| Variable | Required | Description |
| --- | --- | --- |
| `AKAHU_ENCRYPTION_KEY` | Yes | Base64 32-byte key used to encrypt stored tokens and keys. Generate with `openssl rand -base64 32`. |
| `AKAHU_DATA_DIRECTORY` | No | Where the SQLite DB lives. Defaults to `./data`. |
| `AKAHU_ALLOW_INSECURE_HTTP` | No | `true` to allow non-Secure session cookies over plain HTTP (LAN access). Localhost works with `false`. |
| `CRON_SECRET` | No | Bearer secret for the self-hosted sync endpoint. See `docs/self-hosting.md`. |
| `KASHIN_ORIGIN_URL` / `KASHIN_ALLOWED_ORIGIN` | No | For Vercel-fronting-a-self-hosted-origin setups. |

## Security model

- Passwords are salted and hashed with **Argon2id** (64 MiB memory, 3 iterations).
- Five failed attempts trigger a **15-minute lockout**.
- Sessions use 256-bit random bearer tokens; only SHA-256 digests are stored.
- Session cookies are HTTP-only, SameSite Strict, and Secure in production.
- Akahu tokens and LLM API keys are encrypted with **AES-256-GCM** and random
  nonces before storage.
- The app never requests or stores bank credentials or an Akahu account password.

Keep a secure backup of `AKAHU_ENCRYPTION_KEY` — stored tokens cannot be
recovered if it is lost.

## Documentation

- [Self-hosting guide](docs/self-hosting.md)
- [Contributing](CONTRIBUTING.md)

## License

[MIT](LICENSE)
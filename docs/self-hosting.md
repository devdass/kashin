# Self-hosting Kashin

Kashin runs anywhere Node.js 20.9+ can. The simplest deployment is a single
machine running `npm run dev` or `npm run start` with a reverse proxy in front
for HTTPS.

## Behind a reverse proxy (Caddy example)

Build and run the production server, then proxy to it:

```bash
npm run build
PORT=3000 npm run start
```

Create `/etc/caddy/Caddyfile`:

```caddyfile
your-domain.example.com {
    encode zstd gzip
    reverse_proxy 127.0.0.1:3000
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Content-Type-Options "nosniff"
        Referrer-Policy "same-origin"
    }
}
```

Caddy will obtain a Let's Encrypt certificate automatically.

## Scheduled daily syncs

Kashin ships an authenticated sync endpoint (`POST /api/internal/sync`) so you
can refresh from Akahu on a schedule without opening the UI. Set a
`CRON_SECRET` in your environment, then call it with a bearer token.

systemd timer example:

```ini
# /etc/systemd/system/kashin-sync.service
[Unit]
Description=Kashin daily finance sync
After=network-online.target

[Service]
Type=oneshot
ExecStart=/bin/sh -c 'curl -fsS -X POST -H "Authorization: Bearer ${CRON_SECRET}" http://127.0.0.1:3000/api/internal/sync'
EnvironmentFile=/path/to/your/.env.local
```

```ini
# /etc/systemd/system/kashin-sync.timer
[Unit]
Description=Trigger Kashin daily finance sync

[Timer]
OnCalendar=*-*-* 06:00:00
Persistent=true

[Install]
WantedBy=timers.target
```

## Vercel proxy setup

If you deploy the marketing/brochure page on Vercel but run the real app
self-hosted, set these environment variables on the Vercel project so the
deployed page proxies to your origin:

- `KASHIN_ORIGIN_URL` — e.g. `https://your-origin.example.com`
- `KASHIN_ALLOWED_ORIGIN` — e.g. `https://your-app.vercel.app`

## Backups

The database lives in `data/app.db` (or wherever `AKAHU_DATA_DIRECTORY`
points). Back it up regularly. The `AKAHU_ENCRYPTION_KEY` is required to decrypt
stored Akahu tokens and LLM API keys, so back that up too.
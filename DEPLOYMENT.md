# Deployment

Step by step from a fresh server to a public Wunschzettu. Background and reasons: [ARCHITECTURE.md §11](ARCHITECTURE.md#11-hosting-on-the-homelab).

What you need: a Docker host, a reverse proxy with TLS (examples use Caddy), a domain, and an SMTP account that may send from an address on your domain.

## 1. Mail sender

Login codes only work if mails arrive, so set this up first.

1. Choose an SMTP provider (your mail host, or a transactional service such as Brevo, Postmark, Scaleway TEM, Infomaniak). Note host, port (587 or 465), user, password and the sender address, e.g. `noreply@example.com`.
2. Add the DNS records the provider shows you for that domain:
   - **SPF**: TXT on the domain, e.g. `v=spf1 include:<provider> ~all`. A domain has only *one* SPF record; if one exists, add the `include:` to it.
   - **DKIM**: the TXT/CNAME record(s) from the provider.
   - **DMARC**: TXT on `_dmarc.<domain>`, e.g. `v=DMARC1; p=quarantine`. Keep an existing one.
3. Send a test mail from the provider to a Gmail address and check "Show original": SPF, DKIM and DMARC must say `PASS`.

Note who the provider is and where it stores data: the privacy policy names it (step 6).

## 2. Code and image on the server

```sh
git clone <repo-url> /opt/src/wunschzettu
mkdir -p /opt/stacks/wunschzettu/data
cd /opt/stacks/wunschzettu
```

The container runs as a fixed user and must own `./data`:

```sh
sudo chown 1000:1000 data   # or your own id -u / id -g, then use the same in compose.yaml
```

## 3. compose.yaml and .env

`/opt/stacks/wunschzettu/compose.yaml`, here for a Caddy container on a shared Docker network `proxy` (no published port at all, so only the proxy can reach the app):

```yaml
services:
  app:
    image: wunschzettu:latest
    build: /opt/src/wunschzettu
    restart: unless-stopped
    env_file: .env
    environment:
      ASPNETCORE_FORWARDEDHEADERS_ENABLED: "true"
      Logging__Console__FormatterName: json
    user: "1000:1000"
    volumes:
      - ./data:/data:z
    logging:
      driver: json-file
      options: { max-size: "5m", max-file: "2" }
    networks: [proxy]

networks:
  proxy:
    external: true
```

Proxy directly on the host instead? Drop `networks` and publish `"127.0.0.1:8080:8080"` (as in the repo's `compose.yaml`). Never publish the port on all interfaces: the app trusts `X-Forwarded-For`, and Docker ports bypass the host firewall.

`/opt/stacks/wunschzettu/.env` (keep it out of git, `chmod 600`):

```sh
App__BaseUrl=https://wunsch.example.com

Smtp__Host=smtp.example.com
Smtp__Port=587
Smtp__User=...
Smtp__Password=...
Smtp__From=Wunschzettu <noreply@example.com>

# Imprint and privacy policy
App__Operator__Name=Vorname Nachname
App__Operator__Email=kontakt@example.com
App__Operator__Address=Strasse 1, 3000 Bern, Schweiz
```

`App__BaseUrl` is the address people open; links in mails point there. Optional: `App__BackupDays` (default 7), `App__AuthRequestsPerMinute` (per IP, default 10), `App__MaxLoginMailsPerDay` (default 500).

## 4. Reverse proxy

The proxy terminates TLS, sets HSTS and must pass the **real client IP** in `X-Forwarded-For`; the app uses it for the per-IP login limits. If every request seems to come from the proxy, all visitors share one limit and lock each other out.

Caddy, directly reachable from the internet:

```caddyfile
wunsch.example.com {
    header Strict-Transport-Security "max-age=31536000"
    reverse_proxy app:8080   # service name on the proxy network, or 127.0.0.1:8080
}
```

Caddy behind a **Cloudflare Tunnel** (cloudflared → Caddy over plain HTTP): Caddy only sees cloudflared's address, so take the client IP from Cloudflare's header. Do this only in a block that nothing but cloudflared can reach, or anyone could set the header:

```caddyfile
http://wunsch.example.com:8080 {
    reverse_proxy app:8080 {
        header_up X-Forwarded-For {http.request.header.CF-Connecting-IP}
        header_up X-Forwarded-Proto https
    }
}
```

Then add the public hostname to the tunnel (Cloudflare dashboard → Tunnel → Public Hostname → `wunsch.example.com` → `http://caddy:8080`). Turn on HSTS and "Always Use HTTPS" for the zone under SSL/TLS → Edge Certificates.

## 5. Start

```sh
cd /opt/stacks/wunschzettu
docker compose up -d --build     # first build takes a few minutes
docker compose logs -f
```

The log must not contain warnings about `App:BaseUrl`, `App:Operator` or SMTP. Then:

```sh
curl -fsS https://wunsch.example.com/healthz             # Healthy
curl -sI https://wunsch.example.com | grep -iE 'strict-transport|content-security'   # both present
```

## 6. Legal texts

Open `/impressum`, `/datenschutz` and `/nutzungsbedingungen` and read them once. They are solid templates for a private, free service under Swiss DSG and GDPR, not legal advice. Check in particular:

- your name and address appear correctly,
- the mail provider and its country (section on processors),
- the off-site backup retention: the policy promises **at most 30 days**.

The texts live in `src/Wunschzettu.Web/src/app/features/legal/` (English in `public/i18n/en.json`).

## 7. Smoke test

On your phone, over the real domain:

1. Sign in with a code. The mail arrives, is not in spam, and the button works.
2. Create a list, add a wish from a shop link, and share it.
3. In a private window, open the link, choose "Ich möchte etwas schenken" and reserve a wish as a guest. The confirmation mail arrives.
4. Back in your account, the wish does **not** show as taken.
5. Install the app on the home screen and share a link from a shop into it.

## 8. Backups

The app writes a database copy to `data/backups/` every day and keeps 7. That protects against mistakes, not against a dead disk, so copy the **whole `data/` folder** off-site (restic/Backrest, rsync, …):

- `wunschzettu.db` + `backups/`: data
- `images/`: wish pictures
- `keys/`: without them all sessions and mail links become invalid after a restore

Copy `data/backups/` rather than the live `wunschzettu.db`, or stop the container during the backup. Keep off-site snapshots at most 30 days.

**Restore**:

```sh
docker compose stop
cp data/backups/wunschzettu-YYYY-MM-DD.db data/wunschzettu.db
rm -f data/wunschzettu.db-wal data/wunschzettu.db-shm
docker compose start
```

## 9. Monitoring

Add an HTTP monitor (Uptime Kuma or similar) on `https://wunsch.example.com/healthz`. Logs: `docker compose logs`, only warnings and errors.

## 10. Updates

```sh
git -C /opt/src/wunschzettu pull
cd /opt/stacks/wunschzettu && docker compose up -d --build
```

Migrations run on startup. Before that, the app copies the database to `data/wunschzettu-before-update-<time>.db`; delete it once the update is fine.

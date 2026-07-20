# infra — Portainer + Nginx Proxy Manager (HTTPS)

Homelab infrastructure that runs alongside (and in front of) the Command Center
stack on `athacker-cc`. Kept separate from `command-center/` on purpose — it
fronts multiple services and its data must never be touched by `deploy.sh`.

- **Portainer** — visual Docker management UI. Sees/manages every container on
  the host (command-center, otterwiki, infra, …).
- **Nginx Proxy Manager (NPM)** — reverse proxy terminating **real HTTPS** using
  a free Let's Encrypt cert that Tailscale issues for the MagicDNS name.

## Where it lives

- Repo (source of truth): `infra/` here.
- Server (running copy + persistent data): `~/infra/` on athacker-cc.
  Data in `~/infra/data/` (Portainer DB, NPM config/certs) — **outside** the
  rsync-deployed `~/command-center` tree, so `deploy.sh --delete` can't wipe it.

Deploy changes: `scp infra/* cc:~/infra/ && ssh cc 'cd ~/infra && docker compose up -d'`.

## URLs (all tailnet-only)

| Service | URL |
|---|---|
| Command Center | `https://athacker-cc.tail5e74e4.ts.net/` (valid cert) |
| NPM admin | `http://athacker-cc:81` |
| Portainer | `http://athacker-cc:9000` |

## One-time setup that was done

1. Freed port 443 + made athacker the Tailscale operator (needs root, run by Alden):
   ```
   sudo tailscale serve reset
   sudo tailscale set --operator=athacker
   ```
2. `docker compose up -d` (Portainer + NPM).
3. Generated the cert: `tailscale cert --cert-file ~/infra/certs/fullchain.crt \
   --key-file ~/infra/certs/private.key athacker-cc.tail5e74e4.ts.net`.
4. In NPM: added a **Custom** SSL certificate (id 1) from those files, and a
   **Proxy Host** for `athacker-cc.tail5e74e4.ts.net` → `command-center-frontend-1:80`
   (http), Force SSL + HTTP/2 + Websockets on. NPM joins the `command-center_default`
   network (see compose) so it resolves the frontend container by name — nginx
   resolves upstreams via Docker DNS, which knows container names but NOT
   `/etc/hosts` aliases like host.docker.internal (that mismatch causes a 502).
5. Cert auto-renewal: monthly cron runs `renew-tailscale-cert.sh 1`
   (regenerates via `tailscale cert`, copies into NPM via `docker cp`, reloads
   nginx). Tailscale certs last ~90 days.

## Security housekeeping (do once)

- **Portainer**: open `:9000` right after first start and set an admin password
  (it locks the setup screen if left too long — just `docker restart infra-portainer`).
- **NPM admin**: log into `:81` with `admin@example.com` / `changeme` and set
  your own email + password immediately.

## Adding another service later (e.g. Jellyfin, OtterWiki)

In NPM → Proxy Hosts → Add:
- Domain: pick a scheme. With the single Tailscale hostname you route by path or
  reuse the cert; with a real domain later you'd use subdomains + NPM's own
  Let's Encrypt (DNS challenge) instead of the custom Tailscale cert.
- Forward: OtterWiki → `otterwiki-otterwiki-1:80` (join its network too, or use
  its host port `:8080`). Jellyfin is a bare systemd service → forward to
  `host.docker.internal:8096` (works for bare-host targets; the container-name
  trick is only needed for Docker upstreams).

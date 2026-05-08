# Deployment-Setup (Debian/DietPi-VM mit Docker-Compose)

Diese App läuft als Docker-Compose-Stack mit zwei Containern: `app`
(Next.js) und `db` (Postgres 16). Der externe Caddy/Reverse-Proxy
forwardet HTTPS-Traffic auf den Host-Port `3100`, der App-Container
lauscht intern auf demselben Port.

## Erstinstallation auf der VM

```bash
# Docker + Compose-Plugin installieren (Debian 13)
apt-get update && apt-get install -y --no-install-recommends \
  ca-certificates curl gnupg git ufw
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg \
  | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/debian trixie stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update && apt-get install -y \
  docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Repo + Konfig anlegen
git clone https://github.com/Schwandyy/B2B_Leadify.git /opt/b2b-leadify
cd /opt/b2b-leadify
cp .env.production.example .env
# .env editieren — alle "changeme" mit echten Werten ersetzen
# Tipp: für jedes Secret einmal `openssl rand -base64 32` aufrufen

# Build + Start
docker compose build
docker compose up -d
docker compose exec app npx prisma db push
```

Erste Registrierung läuft dann unter der konfigurierten Domain
über `/register` mit einer `@az-delivery.com`-Adresse — diese
Person wird automatisch ADMIN.

## Daten-Migration vom lokalen Dev-System

Auf dem lokalen Rechner (wo Daten schon drin sind):

```bash
pg_dump -h localhost -p 5433 -U andreashabedank \
  --no-owner --no-acl product2lead > /tmp/p2l.sql
scp -i ~/.ssh/id_ed25519_manager_dietpi /tmp/p2l.sql \
  root@10.10.40.131:/opt/b2b-leadify/p2l.sql
```

Auf der VM:

```bash
cd /opt/b2b-leadify
# Container muss laufen
docker compose exec -T db psql -U product2lead -d product2lead < p2l.sql
rm p2l.sql
```

## Cron für Inventory-Sync (wöchentlich)

`/etc/systemd/system/b2b-inventory-sync.service`:

```ini
[Unit]
Description=B2B-Leadify Inventory-Sync (wöchentlich)
After=docker.service

[Service]
Type=oneshot
EnvironmentFile=/opt/b2b-leadify/.env
ExecStart=/usr/bin/curl -fsS -H "Authorization: Bearer ${CRON_SECRET}" http://127.0.0.1:3100/api/cron/inventory
```

`/etc/systemd/system/b2b-inventory-sync.timer`:

```ini
[Unit]
Description=Wöchentlich B2B-Leadify Inventory-Sync (Mo 06:00)

[Timer]
OnCalendar=Mon *-*-* 06:00:00
Persistent=true

[Install]
WantedBy=timers.target
```

```bash
systemctl daemon-reload
systemctl enable --now b2b-inventory-sync.timer
systemctl list-timers b2b-inventory-sync.timer
```

## Wartung

### Update auf neue Version
```bash
cd /opt/b2b-leadify
git pull
docker compose build
docker compose up -d
docker compose exec app npx prisma db push   # nur falls Schema-Änderung
```

### Logs
```bash
docker compose logs -f app
docker compose logs -f db
```

### Backup (Postgres)
```bash
docker compose exec -T db pg_dump -U product2lead --no-owner product2lead \
  > /backups/p2l-$(date +%F).sql
```

### Restore
```bash
docker compose exec -T db psql -U product2lead -d product2lead \
  < /backups/p2l-YYYY-MM-DD.sql
```

## Caddy-Beispielkonfig (auf dem vorgelagerten Reverse-Proxy)

```caddy
leads.az-delivery.com {
    reverse_proxy 10.10.40.131:3100
}
```

Wenn Caddy auf derselben VM läuft, in der `.env` `APP_BIND=127.0.0.1`
behalten und Caddy auf `127.0.0.1:3100` proxien. Sonst `APP_BIND=0.0.0.0`
und ufw so konfigurieren, dass nur der Caddy-Host TCP/3100 erreichen darf.

#!/usr/bin/env bash
set -euo pipefail
base="$(cd "$(dirname "$0")/.." && pwd)"
host="${1:?Specify vps1 or vps2}"
case "$host" in vps1|vps2) ;; *) exit 1;; esac

# All recursive removals are explicitly named below; reject symlinked targets.
remove_tree() {
    local path="$1"
    test "$(realpath -m "$path")" = "$path" || { echo "Unsafe target: $path" >&2; exit 1; }
    test ! -L "$path" || exit 1
    rm -rf --one-file-system -- "$path"
}

if [ "$host" = vps1 ]; then
    test -d /var/www/xavierfenaux/www/master
    bash "$base/ops/deploy-master-gateway.sh"
else
    test -d /opt/ft-clips
    active=/etc/nginx/sites-enabled/xavier-services
    source="$base/ops/nginx/vps2-xavier-services.conf"
    if ! cmp -s "$active" "$source" && [ "$(sha256sum "$active" | cut -d ' ' -f 1)" != 10bd2d9f94a92149af853197124e21f903c17c62bbff3ee2f4039b8b8f8e11af ]; then
        echo 'VPS2 configuration changed; inspect before deployment' >&2; exit 1
    fi
    backup="/etc/nginx/xavier-retirement-$(date +%Y%m%d-%H%M%S).conf"
    cp -L "$active" "$backup"
    cp "$source" "$active"
    if ! nginx -t; then cp "$backup" "$active"; exit 1; fi
    systemctl reload nginx
fi

for unit in ivt-newsletter-daily.timer ivt-newsletter-daily.service ivt-newsletter.service; do
    if [ -f "/etc/systemd/system/$unit" ]; then
        systemctl stop "$unit"
        systemctl disable "$unit"
        rm -- "/etc/systemd/system/$unit"
    fi
done
systemctl daemon-reload
remove_tree /opt/ivt-newsletter
remove_tree /opt/ivt-newsletter-backups
remove_tree /opt/ivt-radar/data/newsletter
remove_tree /opt/ivt-radar/data/newsletter-images
find /opt/ivt-radar/data -maxdepth 1 -type f -name 'newsletter-summary-*.json' -delete

if [ "$host" = vps2 ]; then
    compose=/opt/xavier-dashboard-mvp-parent/dashboard-mvp/docker-compose.yml
    if [ -f "$compose" ]; then
        services=$(docker compose -p dashboard-mvp -f "$compose" config --services | sort | tr '\n' ' ')
        test "$services" = 'app postgres redis worker-news worker-score worker-tradingview ' || exit 1
        docker compose -p dashboard-mvp -f "$compose" down --volumes
        for image in dashboard-mvp-app dashboard-mvp-worker-news dashboard-mvp-worker-score dashboard-mvp-worker-tradingview; do
            if docker image inspect "$image" >/dev/null 2>&1; then docker image rm "$image"; fi
        done
    fi
    remove_tree /opt/xavier-dashboard-mvp-parent
else
    if [ -f /etc/systemd/system/ivt-remote.service ]; then
        systemctl disable --now ivt-remote.service
        rm /etc/systemd/system/ivt-remote.service
        systemctl daemon-reload
    fi
    if pm2 jlist | jq -e '.[] | select(.name == "tournageivt")' >/dev/null; then
        pm2 delete tournageivt
        pm2 save
    fi
    cron=$(mktemp)
    trap 'rm -f "$cron"' EXIT
    (crontab -l 2>/dev/null || true) | awk 'index($0,"https://xavierfenaux.com/api/cron/morning-news")==0' > "$cron"
    crontab "$cron"
    remove_tree /var/www/tournageivt
    remove_tree /var/www/xavierfenaux/dashboard-mvp
    remove_tree /var/www/xavierfenaux/remote-server
    remove_tree /var/www/xavierfenaux/www/ivtday
    remove_tree /var/www/xavierfenaux/www/live
    remove_tree /var/www/xavierfenaux/www/actualités
fi
echo "Requested services removed on $host. Clips and IVT Radar retained."

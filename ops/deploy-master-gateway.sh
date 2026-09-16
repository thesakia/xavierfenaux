#!/usr/bin/env bash
set -euo pipefail
base="$(cd "$(dirname "$0")/.." && pwd)"
site=/etc/nginx/sites-enabled/xavierfenaux.com
radar=/etc/nginx/sites-enabled/ivt-radar
snippet=/etc/nginx/snippets/xavier-master-endpoints.conf
check_version() {
    local active="$1" source="$2" expected="$3"
    if ! cmp -s "$active" "$source" && [ "$(sha256sum "$active" | cut -d ' ' -f 1)" != "$expected" ]; then
        echo "Refusing to overwrite a newer Nginx configuration: $active" >&2
        exit 1
    fi
}
check_version "$site" "$base/ops/nginx/xavierfenaux.conf" 1477332a99d9d60d63c87e3876ac68e23946751eff941eecdbf87e8f97f9d91b
check_version "$radar" "$base/ops/nginx/radar.conf" c58919ff0fbf3a5a980278f0e6ab9a50fada42751840216e9f1814840ea1ce16
test -r /etc/xavier-master/tool-access.json
backup="/etc/nginx/master-backups/$(date +%Y%m%d-%H%M%S)"
install -d -m 0700 "$backup"
cp -L "$site" "$backup/xavierfenaux.conf"
cp -L "$radar" "$backup/radar.conf"
if [ -f "$snippet" ]; then cp "$snippet" "$backup/endpoints.conf"; fi
install -m 0644 "$base/ops/nginx/master-endpoints.conf" "$snippet"
cp "$base/ops/nginx/xavierfenaux.conf" "$site"
cp "$base/ops/nginx/radar.conf" "$radar"
if nginx -t; then
    systemctl reload nginx
else
    cp "$backup/xavierfenaux.conf" "$site"
    cp "$backup/radar.conf" "$radar"
    if [ -f "$backup/endpoints.conf" ]; then cp "$backup/endpoints.conf" "$snippet"; fi
    exit 1
fi

#!/usr/bin/env bash
set -euo pipefail
base="$(cd "$(dirname "$0")/.." && pwd)"
site=/etc/nginx/sites-enabled/xavierfenaux.com
radar=/etc/nginx/sites-enabled/ivt-radar
ft=/etc/nginx/sites-enabled/ftfenaux.com
snippet=/etc/nginx/snippets/xavier-master-endpoints.conf
check_version() {
    local active="$1" source="$2" expected="$3"
    if ! cmp -s "$active" "$source" && [ "$(sha256sum "$active" | cut -d ' ' -f 1)" != "$expected" ]; then
        echo "Refusing to overwrite a newer Nginx configuration: $active" >&2
        exit 1
    fi
}
check_version "$site" "$base/ops/nginx/xavierfenaux.conf" d75fe1a2875ea204d61046d13909b437b80b82f57da00671a1119ef19e8cc901
check_version "$radar" "$base/ops/nginx/radar.conf" 5c9433c157f7708980176d21de9598c89aa12fc92563e7412a4330aa09d97880
check_version "$ft" "$base/ops/nginx/ftfenaux.conf" 5b02e24a595dcf1111dee226704d13c269f13c27c5dba2f0f52f8442b4758d5f
test -r /etc/xavier-master/tool-access.json
backup="/etc/nginx/master-backups/$(date +%Y%m%d-%H%M%S)"
install -d -m 0700 "$backup"
cp -L "$site" "$backup/xavierfenaux.conf"
cp -L "$radar" "$backup/radar.conf"
cp -L "$ft" "$backup/ftfenaux.conf"
if [ -f "$snippet" ]; then cp "$snippet" "$backup/endpoints.conf"; fi
install -m 0644 "$base/ops/nginx/master-endpoints.conf" "$snippet"
cp "$base/ops/nginx/xavierfenaux.conf" "$site"
cp "$base/ops/nginx/radar.conf" "$radar"
cp "$base/ops/nginx/ftfenaux.conf" "$ft"
if nginx -t; then
    systemctl reload nginx
else
    cp "$backup/xavierfenaux.conf" "$site"
    cp "$backup/radar.conf" "$radar"
    cp "$backup/ftfenaux.conf" "$ft"
    if [ -f "$backup/endpoints.conf" ]; then cp "$backup/endpoints.conf" "$snippet"; fi
    exit 1
fi

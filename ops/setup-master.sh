#!/usr/bin/env bash
set -euo pipefail
base="$(cd "$(dirname "$0")/.." && pwd)"
install -d -o www-data -g www-data -m 0700 /var/lib/xavier-master
install -d -o root -g www-data -m 0750 /etc/xavier-master
if [ ! -f /etc/xavier-master/providers.json ]; then
  install -o root -g www-data -m 0640 "$base/ops/master-providers.example.json" /etc/xavier-master/providers.json
fi
if [ ! -f /var/log/xavier-master-sync.log ]; then
  install -o www-data -g www-data -m 0640 /dev/null /var/log/xavier-master-sync.log
fi
install -o root -g root -m 0644 "$base/ops/master-social.cron" /etc/cron.d/xavier-master-social
install -o root -g root -m 0644 "$base/ops/master-social.logrotate" /etc/logrotate.d/xavier-master-social

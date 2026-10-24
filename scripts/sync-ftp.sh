#!/usr/bin/env bash
# ============================================================
# Hamkar deploy helper — syncs server/ to the host over FTP
#
# Usage:
#   bash scripts/sync-ftp.sh           # dry-run (shows what would change)
#   bash scripts/sync-ftp.sh --apply   # upload for real
#
# Safety rules (different from a blind mirror --delete):
#   • api/config.php        NEVER uploaded — live credentials stay intact
#   • api/storage/          never uploaded (dev mail outbox)
#   • media/                never touched (uploaded user files)
#   • everything else is mirrored with --delete (removed files get cleaned)
#
# Requires lftp:  brew install lftp   |   apt install lftp
# ============================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [[ ! -f "$ROOT/scripts/ftp.env" ]]; then
  echo "❌ scripts/ftp.env not found. Copy ftp.env.example → ftp.env and fill values."
  exit 1
fi

# shellcheck disable=SC1091
set -a
source "$ROOT/scripts/ftp.env"
set +a

: "${FTP_HOST:?FTP_HOST is missing in scripts/ftp.env}"
: "${FTP_USER:?FTP_USER is missing in scripts/ftp.env}"
: "${FTP_PASS:?FTP_PASS is missing in scripts/ftp.env}"
FTP_REMOTE_DIR="${FTP_REMOTE_DIR:-/}"
FTP_PASSIVE="${FTP_PASSIVE:-true}"

DRY_RUN_FLAG="--dry-run"
if [[ "${1:-}" == "--apply" ]]; then
  DRY_RUN_FLAG=""
  echo "=== Hamkar deploy (apply) ==="
else
  echo "=== Hamkar deploy (dry-run — add --apply to upload) ==="
fi

lftp -u "$FTP_USER","$FTP_PASS" -p "${FTP_PORT:-21}" "$FTP_HOST" <<EOF
set ftp:ssl-allow no
set ftp:passive-mode ${FTP_PASSIVE}
set net:timeout 15
set net:max-retries 3
mirror -R ${DRY_RUN_FLAG} --delete --verbose \
  --exclude ^api/config\.php$ \
  --exclude ^api/storage/ \
  --exclude ^media/ \
  --exclude-glob .DS_Store \
  --exclude-glob *.md \
  "$ROOT/server" "$FTP_REMOTE_DIR"

# landing/ → ریشه‌ی پروژه (کنار api/) تا https://apps.webiro.ir/hamkar/ لندینگ باشد
# ⚠️ بدون --delete: ریشه‌ی مقصد با server/ مشترک است و پاک‌سازی حذفش می‌کرد (api/، media/، …)
mirror -R ${DRY_RUN_FLAG} --verbose \
  --exclude ^src\.css$ \
  --exclude-glob .DS_Store \
  "$ROOT/landing" "$FTP_REMOTE_DIR"
bye
EOF

echo "✅ done"

#!/usr/bin/env bash
#
# Hamkar — sync server/ to your host over FTP(S) with lftp.
#
#   1) cp scripts/ftp.env.example scripts/ftp.env   (fill it in — git-ignored)
#   2) ./scripts/sync-ftp.sh          # dry-run: shows what would change
#      ./scripts/sync-ftp.sh --apply  # actually upload
#
# Notes:
#   • server/api/config.php is NEVER uploaded, so your live credentials
#     stay untouched.
#   • Uploads under server/media/ are never deleted from the server
#     (no --delete): only local files that are newer get pushed.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT/scripts/ftp.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "✗ $ENV_FILE not found."
  echo "  cp scripts/ftp.env.example scripts/ftp.env   ← then fill it in"
  exit 1
fi
# shellcheck source=/dev/null
source "$ENV_FILE"

: "${FTP_HOST:?FTP_HOST is missing in scripts/ftp.env}"
: "${FTP_USER:?FTP_USER is missing in scripts/ftp.env}"
: "${FTP_PASS:?FTP_PASS is missing in scripts/ftp.env}"
FTP_REMOTE_DIR="${FTP_REMOTE_DIR:-/apps.webiro.ir/hamkar}"
FTP_SECURE="${FTP_SECURE:-yes}"

MODE="apply"
if [[ "${1:-}" != "--apply" ]]; then
  MODE="dry-run"
  echo "• dry-run (nothing is uploaded) — run with --apply to push for real"
fi

EXCLUDES=(
  --exclude-glob '.git*/'
  --exclude-glob '.DS_Store'
  --exclude '^api/config\.php$'
  --exclude '^api/storage/'
  --exclude-glob '*.md'
)

URL="ftp://$FTP_HOST$FTP_REMOTE_DIR"
[[ "$FTP_SECURE" == "yes" ]] && URL="ftps://$FTP_HOST$FTP_REMOTE_DIR"

MIRROR_OPTS=(--recursive --only-newer "${EXCLUDES[@]}")
[[ "$MODE" == "dry-run" ]] && MIRROR_OPTS+=(--dry-run)

echo "• syncing $ROOT/server  →  $URL"
lftp -u "$FTP_USER,$FTP_PASS" "$URL" <<EOF
  set ssl:check-hostname no
  set ftp:ssl-protect-data yes
  set net:max-retries 2
  set net:timeout 20
  mirror -R ${MIRROR_OPTS[*]} "$ROOT/server" .
  bye
EOF

echo "✓ done ($MODE)"

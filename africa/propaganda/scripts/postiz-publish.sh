#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  postiz-publish.sh --file PATH --integration ID --date ISO8601 [--caption TEXT | --caption-file PATH] [--type schedule|draft] [--settings-json PATH]

Required env:
  POSTIZ_API_KEY

Optional env:
  POSTIZ_API_URL

Examples:
  postiz-publish.sh \
    --file data/renders/final.mp4 \
    --integration instagram-123 \
    --date 2026-03-20T14:00:00Z \
    --caption-file /tmp/caption.txt

  postiz-publish.sh \
    --file data/media/reference.jpg \
    --integration instagram-123 \
    --date 2026-03-20T14:00:00Z \
    --caption "Draft caption" \
    --type draft
EOF
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing command: $1" >&2
    exit 1
  }
}

extract_upload_path() {
  python3 -c '
import json, sys
raw = sys.stdin.read().strip()
if not raw:
    raise SystemExit("Empty upload response")
obj = json.loads(raw)
for key in ("path", "url"):
    if isinstance(obj, dict) and obj.get(key):
        print(obj[key]); raise SystemExit(0)
data = obj.get("data") if isinstance(obj, dict) else None
if isinstance(data, dict):
    for key in ("path", "url"):
        if data.get(key):
            print(data[key]); raise SystemExit(0)
raise SystemExit(f"Could not find upload path/url in response: {raw}")
'
}

FILE_PATH=""
INTEGRATION_ID=""
DATE_ISO=""
CAPTION=""
CAPTION_FILE=""
POST_TYPE="schedule"
SETTINGS_JSON_PATH=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --file)
      FILE_PATH="${2:-}"
      shift 2
      ;;
    --integration)
      INTEGRATION_ID="${2:-}"
      shift 2
      ;;
    --date)
      DATE_ISO="${2:-}"
      shift 2
      ;;
    --caption)
      CAPTION="${2:-}"
      shift 2
      ;;
    --caption-file)
      CAPTION_FILE="${2:-}"
      shift 2
      ;;
    --type)
      POST_TYPE="${2:-}"
      shift 2
      ;;
    --settings-json)
      SETTINGS_JSON_PATH="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown arg: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

[[ -n "${POSTIZ_API_KEY:-}" ]] || { echo "POSTIZ_API_KEY is required" >&2; exit 1; }
[[ -n "$FILE_PATH" ]] || { echo "--file is required" >&2; exit 1; }
[[ -n "$INTEGRATION_ID" ]] || { echo "--integration is required" >&2; exit 1; }
[[ -n "$DATE_ISO" ]] || { echo "--date is required" >&2; exit 1; }
[[ -f "$FILE_PATH" ]] || { echo "File not found: $FILE_PATH" >&2; exit 1; }

if [[ -n "$CAPTION_FILE" ]]; then
  [[ -f "$CAPTION_FILE" ]] || { echo "Caption file not found: $CAPTION_FILE" >&2; exit 1; }
  CAPTION="$(cat "$CAPTION_FILE")"
fi

[[ -n "$CAPTION" ]] || { echo "Provide --caption or --caption-file" >&2; exit 1; }
[[ "$POST_TYPE" == "schedule" || "$POST_TYPE" == "draft" ]] || {
  echo "--type must be schedule or draft" >&2
  exit 1
}

require_cmd postiz
require_cmd python3

UPLOAD_RAW="$(postiz upload "$FILE_PATH")"
MEDIA_URL="$(printf '%s' "$UPLOAD_RAW" | extract_upload_path)"

CMD=(
  postiz posts:create
  -c "$CAPTION"
  -m "$MEDIA_URL"
  -s "$DATE_ISO"
  -i "$INTEGRATION_ID"
  -t "$POST_TYPE"
)

if [[ -n "$SETTINGS_JSON_PATH" ]]; then
  [[ -f "$SETTINGS_JSON_PATH" ]] || { echo "Settings JSON file not found: $SETTINGS_JSON_PATH" >&2; exit 1; }
  CMD+=(--settings "$(cat "$SETTINGS_JSON_PATH")")
fi

echo "Uploaded media: $MEDIA_URL" >&2
exec "${CMD[@]}"

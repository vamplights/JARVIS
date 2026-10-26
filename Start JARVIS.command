#!/bin/bash
cd -- "$(dirname -- "$0")" || exit 1
# Finder may not include Homebrew's Node installation in PATH.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
fail() {
  printf '\n%s\n' "$1"
  read -r -p "Press Return to close this window. "
  exit 1
}
command -v node >/dev/null 2>&1 || fail "Install Node.js 22 or newer, then open Start JARVIS.command again."
node --input-type=module -e 'if (Number(process.versions.node.split(".")[0]) < 22 || typeof WebSocket === "undefined") process.exit(1)' || fail "JARVIS requires Node.js 22 or newer with WebSocket support."
node scripts/init-settings.mjs || fail "JARVIS could not initialize its settings."
export JARVIS_PORT="${JARVIS_PORT:-8765}"
jarvis_url="http://127.0.0.1:$JARVIS_PORT"
if node health-check.mjs >/dev/null 2>&1; then
  open "$jarvis_url"
  exit 0
fi
printf 'Starting JARVIS at %s\nKeep this window open. Press Control-C to stop JARVIS.\n' "$jarvis_url"
node server.mjs &
jarvis_pid=$!
trap 'kill "$jarvis_pid" 2>/dev/null' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
for ((attempt=0; attempt<30; attempt++)); do
  kill -0 "$jarvis_pid" 2>/dev/null || break
  if node health-check.mjs >/dev/null 2>&1; then
    open "$jarvis_url"
    break
  fi
  sleep 1
done
wait "$jarvis_pid"
jarvis_status=$?
if [ "$jarvis_status" -ne 0 ]; then
  fail "JARVIS stopped with an error. Review the messages above."
fi

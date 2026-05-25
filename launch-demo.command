#!/bin/zsh
cd "$(dirname "$0")" || exit 1
echo "Preparing LegalEase investor demo..."
npm run demo:prepare || exit 1
echo ""
echo "Starting keepalive server. Leave this window open during the demo."
echo "Open: http://127.0.0.1:3001/#overview"
npm run local:keepalive

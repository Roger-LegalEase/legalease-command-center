#!/bin/zsh
cd "$(dirname "$0")" || exit 1
/usr/bin/env node scripts/local-server-manager.mjs start
/usr/bin/open "http://127.0.0.1:3001/#queue"
echo ""
echo "LegalEase Command Center is opening at:"
echo "http://127.0.0.1:3001/#queue"
echo ""
echo "You can close this window."

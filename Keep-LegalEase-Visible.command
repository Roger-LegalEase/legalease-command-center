#!/bin/zsh
cd "$(dirname "$0")" || exit 1
/usr/bin/env node scripts/local-server-manager.mjs keepalive

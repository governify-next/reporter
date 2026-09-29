#!/bin/sh
set -eu
index=/usr/share/grafana/public/views/index.html
marker='[[if .GoogleTagManagerId]]'
if grep -q '/public/governify/viewer-navigation.js' "$index"; then
    exit 0
fi
if ! grep -Fq "$marker" "$index"; then
    echo 'Grafana bootstrap template changed; review the navigation customization.' >&2
    exit 1
fi
awk '
    index($0, "[[if .GoogleTagManagerId]]") {
        print "    <link rel=\"stylesheet\" href=\"[[.AppSubUrl]]/public/governify/viewer-navigation.css\" />"
        print "    <script nonce=\"[[.Nonce]]\" src=\"[[.AppSubUrl]]/public/governify/viewer-navigation.js\"></script>"
    }
    { print }
' "$index" > /tmp/governify-index.html
cat /tmp/governify-index.html > "$index"
rm /tmp/governify-index.html

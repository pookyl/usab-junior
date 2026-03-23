#!/bin/bash
# Simulate a Vercel Analytics pageview to verify tracking is working.
# Usage:
#   ./scripts/test-analytics.sh                          # production
#   ./scripts/test-analytics.sh preview <hostname>       # preview deployment

PROD_HOST="usab-junior-cny4.vercel.app"

if [ "$1" = "preview" ] && [ -n "$2" ]; then
  HOST="$2"
  echo "Targeting preview: $HOST"
else
  HOST="$PROD_HOST"
  echo "Targeting production: $HOST"
fi

URL="https://${HOST}"
TS=$(date +%s000)
PAYLOAD="{\"o\":\"${URL}/\",\"sv\":\"0.1.3\",\"ts\":${TS}}"
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36"

echo ""
echo "1) Testing proxied endpoint: /api/a/view"
CODE_PROXY=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "User-Agent: $UA" \
  -H "Origin: ${URL}" \
  -d "$PAYLOAD" \
  "${URL}/api/a/view")
echo "   POST /api/a/view → HTTP $CODE_PROXY"

echo ""
echo "2) Testing direct endpoint: /_vercel/insights/view"
CODE_DIRECT=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "User-Agent: $UA" \
  -H "Origin: ${URL}" \
  -d "$PAYLOAD" \
  "${URL}/_vercel/insights/view")
echo "   POST /_vercel/insights/view → HTTP $CODE_DIRECT"

echo ""
if [ "$CODE_PROXY" = "200" ]; then
  echo "Proxy endpoint works — check Vercel Analytics in a few minutes."
elif [ "$CODE_DIRECT" = "200" ]; then
  echo "Direct endpoint works but proxy failed (HTTP $CODE_PROXY) — check api/a/[type].js"
else
  echo "Both endpoints failed — proxy=$CODE_PROXY, direct=$CODE_DIRECT"
fi

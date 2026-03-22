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
ENDPOINT="${URL}/_vercel/insights/view"
TS=$(date +%s000)

echo "Sending pageview to ${ENDPOINT} ..."

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36" \
  -H "Origin: ${URL}" \
  -d "{\"o\":\"${URL}/\",\"sv\":\"0.1.3\",\"ts\":${TS}}" \
  "$ENDPOINT")

if [ "$HTTP_CODE" = "200" ]; then
  echo "Success (HTTP $HTTP_CODE) — check Vercel Analytics in a few minutes."
else
  echo "Failed (HTTP $HTTP_CODE) — the endpoint rejected the request."
fi

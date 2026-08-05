#!/usr/bin/env bash
# Bootstrap Cloudflare DNS + SSL for baseapp.asia
#
# Prerequisites:
#   1. Create a free Cloudflare account and add the zone baseapp.asia
#   2. Create an API token with Zone.DNS:Edit + Zone.Zone Settings:Edit
#      https://dash.cloudflare.com/profile/api-tokens
#   3. Run:
#        export CF_API_TOKEN=...
#        ./deploy/cloudflare-bootstrap.sh
#
# After this script: change nameservers at Exabytes/MSHosting to the two
# Cloudflare nameservers printed at the end.

set -euo pipefail

ZONE_NAME="${CF_ZONE:-baseapp.asia}"
ORIGIN_IP="${ORIGIN_IP:-157.245.149.238}"
API="https://api.cloudflare.com/client/v4"

if [[ -z "${CF_API_TOKEN:-}" && ( -z "${CF_API_KEY:-}" || -z "${CF_API_EMAIL:-}" ) ]]; then
  echo "Set CF_API_TOKEN (recommended) or CF_API_KEY + CF_API_EMAIL" >&2
  exit 1
fi

cf_json() {
  local method=$1 path=$2 data=${3:-}
  local args=(-fsS -X "$method" "${API}${path}" -H "Content-Type: application/json")
  if [[ -n "${CF_API_TOKEN:-}" ]]; then
    args+=(-H "Authorization: Bearer ${CF_API_TOKEN}")
  else
    args+=(-H "X-Auth-Email: ${CF_API_EMAIL}" -H "X-Auth-Key: ${CF_API_KEY}")
  fi
  if [[ -n "$data" ]]; then
    args+=(--data "$data")
  fi
  curl "${args[@]}"
}

echo "Looking up zone ${ZONE_NAME}…"
ZONE_JSON=$(cf_json GET "/zones?name=${ZONE_NAME}")
ZONE_ID=$(python3 -c 'import json,sys; d=json.load(sys.stdin); r=d.get("result") or []; print(r[0]["id"] if r else "")' <<<"$ZONE_JSON")
if [[ -z "$ZONE_ID" ]]; then
  echo "Zone ${ZONE_NAME} not found. Add it in the Cloudflare dashboard first, then re-run." >&2
  exit 1
fi
echo "Zone ID: ${ZONE_ID}"

upsert_a() {
  local name=$1
  local fqdn
  if [[ "$name" == "@" ]]; then
    fqdn="$ZONE_NAME"
  else
    fqdn="${name}.${ZONE_NAME}"
  fi

  local list rid body
  list=$(cf_json GET "/zones/${ZONE_ID}/dns_records?type=A&name=${fqdn}")
  rid=$(python3 -c 'import json,sys; d=json.load(sys.stdin); r=d.get("result") or []; print(r[0]["id"] if r else "")' <<<"$list")
  body=$(NAME="$name" IP="$ORIGIN_IP" python3 -c 'import json,os; print(json.dumps({"type":"A","name":os.environ["NAME"],"content":os.environ["IP"],"ttl":1,"proxied":True}))')

  if [[ -n "$rid" ]]; then
    echo "Updating A ${fqdn} → ${ORIGIN_IP} (proxied)"
    cf_json PUT "/zones/${ZONE_ID}/dns_records/${rid}" "$body" >/dev/null
  else
    echo "Creating A ${fqdn} → ${ORIGIN_IP} (proxied)"
    cf_json POST "/zones/${ZONE_ID}/dns_records" "$body" >/dev/null
  fi
}

upsert_a "@"
upsert_a "www"
upsert_a "admin"
upsert_a "api"

set_setting() {
  local key=$1 value=$2
  echo "Setting ${key}=${value}"
  cf_json PATCH "/zones/${ZONE_ID}/settings/${key}" "{\"value\":${value}}" >/dev/null
}

set_setting ssl '"strict"'
set_setting always_use_https '"on"'
set_setting min_tls_version '"1.2"'
set_setting automatic_https_rewrites '"on"'
set_setting brotli '"on"'
set_setting tls_1_3 '"on"'

NS_JSON=$(cf_json GET "/zones/${ZONE_ID}")
ZONE_ID="$ZONE_ID" ORIGIN_IP="$ORIGIN_IP" NS_JSON="$NS_JSON" python3 - <<'PY'
import json, os
z = json.loads(os.environ["NS_JSON"])["result"]
print()
print("Cloudflare zone ready.")
print("Status:", z.get("status"))
print()
print("Change nameservers at Exabytes / MSHosting to:")
for ns in z.get("name_servers") or []:
    print("  -", ns)
print()
print(f"A records point at {os.environ['ORIGIN_IP']} (proxied / orange cloud).")
print("After NS propagate (often 5–30 min):")
print("  https://admin.baseapp.asia/login")
print("Edge certificate will be Cloudflare Universal SSL (Chrome-trusted).")
PY

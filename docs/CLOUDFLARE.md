# Cloudflare Universal SSL (recommended)

Puts Cloudflare in front of `baseapp.asia` so browsers get a **Cloudflare-trusted** certificate, while the DigitalOcean origin keeps talking HTTPS with its own cert (**Full strict**).

Origin IP: `157.245.149.238`

## One-time setup (about 10 minutes)

### 1. Add the site in Cloudflare

1. Sign up / log in at [dash.cloudflare.com](https://dash.cloudflare.com)
2. **Add a site** → `baseapp.asia` → Free plan
3. Cloudflare will scan DNS — continue to the nameserver step

### 2. Point DNS (or run the bootstrap script)

**Option A — script (fastest if you have an API token)**

Create a token: [API Tokens](https://dash.cloudflare.com/profile/api-tokens) →  
**Edit zone DNS** template → Zone Resources: `baseapp.asia`  
Also allow **Zone Settings:Edit** (custom token).

```bash
export CF_API_TOKEN=your_token_here
./deploy/cloudflare-bootstrap.sh
```

This creates/updates proxied A records for `@`, `www`, `admin`, `api` and sets:

- SSL/TLS mode → **Full (strict)**
- Always Use HTTPS → On
- Minimum TLS → 1.2

**Option B — manual in the dashboard**

| Type | Name | Content | Proxy |
|---|---|---|---|
| A | `@` | `157.245.149.238` | Proxied (orange) |
| A | `www` | `157.245.149.238` | Proxied |
| A | `admin` | `157.245.149.238` | Proxied |
| A | `api` | `157.245.149.238` | Proxied |

SSL/TLS → Overview → **Full (strict)**  
SSL/TLS → Edge Certificates → **Always Use HTTPS** on

### 3. Change nameservers at Exabytes / MSHosting

Replace the current NS (`ns184/185/186.mschosting.com`) with the **two nameservers Cloudflare shows** for the zone.

In Exabytes DNS / domain manager for `baseapp.asia` → Nameservers → Custom → paste Cloudflare NS → save.

Propagation is often 5–30 minutes (sometimes up to a few hours).

### 4. Verify

```bash
dig +short NS baseapp.asia
# should show *.ns.cloudflare.com

curl -sSI https://admin.baseapp.asia/login | head -20
# expect Cloudflare headers (cf-ray) and HTTP/2 200
```

Open an Incognito window → https://admin.baseapp.asia/login  
You should see a normal padlock (issuer will be Google Trust Services / Cloudflare).

## Origin notes

- Caddy on the droplet already trusts Cloudflare IP ranges and reads `CF-Connecting-IP`.
- Keep origin certs (ZeroSSL) so **Full (strict)** works.
- Do **not** set SSL mode to Flexible (that breaks API HTTPS and is insecure).

## If something fails

| Symptom | Fix |
|---|---|
| Cloudflare 526 | Origin cert missing/expired — renew ZeroSSL on the droplet |
| Cloudflare 502 | Origin down — `docker compose ps` on the server |
| Still old NS | Exabytes NS not saved / not propagated yet |
| Mixed content | Always Use HTTPS + Full strict |

## Rollback

At Exabytes, set nameservers back to `ns184/185/186.mschosting.com` and ensure A records still point to `157.245.149.238`.

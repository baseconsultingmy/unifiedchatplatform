# Authentication

## Sign-in methods

| Method | Who | Notes |
|---|---|---|
| Email + password | Master Admin, vendor owners | Default |
| Google (GIS) | Merchants (signup + login) | Enabled when `GOOGLE_CLIENT_ID` is set |

Master Admin can still create shops manually under **Vendors**.

## Enable Google for merchants

1. In [Google Cloud Console](https://console.cloud.google.com/), create (or reuse) a project.
2. Configure **OAuth consent screen** (External or Internal).
3. Create credentials → **OAuth client ID** → Application type **Web application**.
4. Authorized JavaScript origins:
   - `https://admin.baseapp.asia`
   - `http://localhost:5173` (local admin)
5. Copy the Client ID into `deploy/.env`:

```bash
GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
PUBLIC_ADMIN_BASE=https://admin.baseapp.asia
```

6. Rebuild/restart the API (and admin if needed):

```bash
cd /opt/baseapp/deploy
docker compose up -d --build api admin
```

No client secret is required for the GIS ID-token flow used by the admin app.

## Merchant flows

- **Create shop** on the login page → enter shop name + industry → **Sign up with Google**  
  Creates a vendor tenant + owner linked to that Google account.
- **Sign in** → **Continue with Google**  
  Matches by `google_sub`, or links to an existing account with the same verified email.
- Google-only owners can later set a password under **Account**.

## API

| Endpoint | Purpose |
|---|---|
| `GET /v1/auth/social` | `{ google_enabled, google_client_id }` |
| `POST /v1/auth/google` | Body: `credential` (ID token), `mode`=`login`\|`signup`, optional shop fields |
| `POST /v1/auth/login` | Email/password |
| `PATCH /v1/auth/me` | Update name / email / password |

## Apple / other providers

Same pattern: verify provider token server-side, find-or-create owner, issue BaseApp JWT. Google is first; Apple can follow when an Apple Developer client is available.

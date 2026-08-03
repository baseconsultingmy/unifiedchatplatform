# WhatsApp Cloud API setup

## Callback URL

```text
https://api.baseapp.asia/v1/webhooks/whatsapp
```

## Verify token

Use the value of `WA_VERIFY_TOKEN` from `deploy/.env` (default bootstrap: `baseapp-wa-verify`).

## Steps in Meta Developer dashboard

1. Create / open a Meta app with **WhatsApp** product
2. WhatsApp → Configuration → Webhook
3. Callback URL: `https://api.baseapp.asia/v1/webhooks/whatsapp`
4. Verify token: same as server `WA_VERIFY_TOKEN`
5. Subscribe to `messages`
6. Put the **App Secret** into `WA_APP_SECRET` on the server and recreate the API container
7. Add `META_ACCESS_TOKEN` + `META_PHONE_NUMBER_ID` when you are ready to send replies

## Policy note

Keep the WABA on legitimate appointment businesses (spa/massage/tattoo studios). Do not mix adult services on the same number.

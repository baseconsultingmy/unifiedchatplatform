# BaseApp beta — shop onboarding guide

> **Preferred for merchants:** open admin → top tab **Resources** (or profile → Resources) to
> download the illustrated **Shop Onboarding Booklet** PDF, or open the web booklet.
>
> Files: `docs/BaseApp-Shop-Onboarding-Booklet.pdf` · `apps/admin/public/guides/`

Welcome. This guide walks a new shop owner from first login to a working counter + chat channel.

**Admin:** [https://admin.baseapp.asia](https://admin.baseapp.asia)  
**Support:** reply to your BaseApp contact (or email the person who sent your login).

---

## What you will set up

| Step | Where | Who |
|---|---|---|
| 1. Sign in | `/login` | Shop owner |
| 2. Confirm shop name / country / currency | Profile → **Settings** | Shop owner (country change → ask BaseApp) |
| 3. Add catalog (services / menu / products) | Profile → **Services / Menu / Products** | Shop owner |
| 4. Add rooms & staff *(Health & Beauty)* | Profile → **Rooms & staff** | Shop owner |
| 5. Connect LINE | Profile → **Settings → LINE Messaging** | Shop owner |
| 6. Connect WhatsApp *(optional)* | Profile → **Settings → WhatsApp** | Shop owner (+ BaseApp for Flow publish) |
| 7. Connect Grab Food *(F&B only)* | **Settings** / Orders | Shop owner |
| 8. Run a test sale + booking | **POS** + **Bookings** / **Orders** | Shop owner |

Language: top-right language switcher (EN / MS / ID / TH / ZH).

---

## Before you start

You should have received from BaseApp:

1. **Login email** and **temporary password**
2. Your **shop type** (Health & Beauty, Food & Beverage, Retail, or General)
3. Your **country** (sets currency: MY→MYR, TH→THB, SG→SGD, ID→IDR)

If anything is wrong (wrong country, wrong category), ask BaseApp Master Admin to open **Vendors → Edit** and fix it before you add prices.

---

## 1. Sign in

1. Open [https://admin.baseapp.asia/login](https://admin.baseapp.asia/login)
2. Enter your email + password → **Sign in**
3. You land on **POS**

**Tip:** Use a tablet or laptop in landscape. Pull down on most pages to refresh.

---

## 2. Quick tour

### Top tabs (shop owner)

| Tab | Purpose |
|---|---|
| **POS** | Walk-in sales / counter |
| **Chat** | LINE / WhatsApp inbox |
| **Reports** | Sales summary |
| **Bookings** | Appointments *(Health & Beauty / General)* |
| **Orders** | Grab / delivery queue *(F&B)* |
| **Customers** | Customer list *(Retail top tab; others via profile)* |

### Profile menu (avatar, top-right)

- **Overview** — today’s snapshot  
- **Services / Menu / Products** — your catalog  
- **Rooms & staff** — artists, rooms *(H&B)*  
- **Settings** — shop name, LINE, WhatsApp, Grab  
- **Account** — your login profile  
- Language switcher sits beside the avatar  

---

## 3. Confirm shop details

1. Profile → **Settings**
2. Check **Shop name** — edit if needed
3. Note **Country · currency** under the shop name (e.g. `TH · THB`)
4. Save when you change the name (**Save** / shop credentials form at the bottom of Settings)

Country and currency are set by BaseApp. Contact Master Admin to change them.

---

## 4. Upload your catalog (services / menu / products)

Open Profile → **Services**, **Menu**, or **Products** (label depends on shop type).

### Health & Beauty (salon, tattoo, spa…)

1. Open **Services**
2. For each offering, fill:
   - **Name** (e.g. `Small line tattoo`)
   - **Category** (e.g. `Tattoo`, `Treatments`, `Add-ons`)
   - **Duration** (minutes)
   - **Price** (in your shop currency)
   - **Deposit** (optional; 0 if none)
3. Click **Save**
4. Repeat for packages and add-ons

### Food & Beverage

1. Open **Menu**
2. Add each item: **Name**, **Category** (Food / Drinks / …), **Price**
3. Optional: open **Customisations** on an item for modifiers (ice, size, toppings)
4. When Grab is connected later, use **Publish menu** from Settings / Menu tools

### Retail

1. Open **Products**
2. Add each product: **Name**, **Category**, **Price**
3. Save — then sell from **POS**

**Good first catalog size for beta:** 5–15 items is enough to test. You can add more anytime.

---

## 5. Rooms & staff (Health & Beauty)

1. Profile → **Rooms & staff**
2. Add at least one **Artist / therapist** (e.g. your name)
3. Add at least one **Room / bay** if you use stations
4. These show up when you create bookings and on the day board

Skip this step for F&B and Retail.

---

## 6. Connect LINE (recommended for Thailand)

Customers message your Official Account; BaseApp can take bookings in chat (`menu` / `book`).

### In LINE Developers

1. Open [https://developers.line.biz](https://developers.line.biz) → your provider → **Messaging API** channel  
   (or create a new Messaging API channel for the shop)
2. Copy:
   - **Channel ID**
   - **Channel secret**
   - **Channel access token** (long-lived — issue / copy from Messaging API tab)
3. Under Messaging API → **Webhook settings**:
   - Webhook URL: `https://api.baseapp.asia/v1/webhooks/line`
   - Enable webhook
   - Disable “Auto-reply messages” / greeting that fight the bot if you want BaseApp to own the chat (optional; ask BaseApp if unsure)

### In BaseApp

1. Profile → **Settings**
2. Scroll to **LINE Messaging**
3. Paste **Channel ID**, **Channel secret**, **Channel access token**
4. Optional: **LIFF ID** if you use a LINE mini-app (booking also works by typing `menu` / `book` without LIFF)
5. Click **Save LINE only** (or save the full Settings form)
6. Confirm status shows token / secret **on file**

### Smoke test

1. From a personal LINE account, add the shop OA and send: `menu` or `book`
2. You should get a package / booking flow reply
3. Open BaseApp → **Chat** — the conversation should appear

If nothing arrives: double-check webhook URL, that the webhook is **Enabled**, and that Channel ID / secret / token match the same channel.

---

## 7. Connect WhatsApp (optional)

Use this if you also want Meta WhatsApp booking + receipts.

1. Profile → **Settings → WhatsApp / Meta**
2. Copy into Meta Developer → WhatsApp → Configuration:
   - **Callback URL**
   - **Flows data endpoint**
   - **Verify token**
3. Subscribe to `messages`
4. Paste into BaseApp:
   - Display phone  
   - Phone number ID  
   - WhatsApp Business Account ID  
   - Permanent access token  
5. Save settings  
6. Ask BaseApp Master Admin to open your shop → **Meta** → **Publish booking Flow** (needed for the in-chat booking form)

Full Meta notes: `docs/WHATSAPP.md`.

---

## 8. Grab Food (F&B shops only)

1. Finish your **Menu** in BaseApp first  
2. **Settings** → Grab panel → **Connect Grab**  
3. Open the activation link Grab/BaseApp shows; complete outlet linking  
4. Paste **Grab merchant ID** if prompted  
5. **Publish menu**  
6. New Grab orders appear under the **Orders** tab  

Skip entirely for Health & Beauty / Retail beta unless you are F&B.

---

## 9. First day practice

### A. Walk-in sale (everyone)

1. Open **POS**
2. Tap catalog items into the ticket  
3. **Confirm order** / **Charge**  
4. Choose customer (or walk-in) → **Cash** or **QR pay**  
5. Finish — optional send receipt on WhatsApp if WA is connected  

### B. Appointment (Health & Beauty)

1. Open **Bookings** → **New**  
2. Customer name + phone  
3. Pick service, artist, room, start time → **Create booking**  
4. On the day: mark paid / complete from the booking detail  

### C. Chat booking

1. Customer messages LINE (or WhatsApp) with `menu` / `book`  
2. They pick package → date → time → confirm  
3. You see it under **Bookings** and **Chat**  

### D. F&B order queue

1. Accept a Grab test order (or create a POS order)  
2. **Orders** tab → Accept → Preparing → Ready → Complete  

---

## Day-to-day cheat sheet

| Job | Go to |
|---|---|
| Sell at the counter | **POS** |
| See today’s appointments | **Bookings** |
| Reply to customers | **Chat** |
| Add a new price / item | Profile → **Services / Menu / Products** |
| Change LINE / WhatsApp | Profile → **Settings** |
| Sales numbers | **Reports** |
| Customer list | Profile → **Customers** |

---

## Beta expectations (please read)

- Payments QR / pay links are **demo / sandbox-style** unless BaseApp told you otherwise — still practice the flow.  
- Catalog editing is create-focused; ask BaseApp if you need bulk edits or deactivations.  
- Country / currency / business category: Master Admin only (**Vendors → Edit**).  
- LINE is the primary chat path for Thailand beta; WhatsApp is optional.  
- Report anything confusing with a screenshot + what you tapped.

---

## Appendix A — Master Admin: provision a beta shop

Do this **before** sending credentials to the merchant.

1. Sign in as Master Admin → **Vendors** → **Create vendor**
2. Set:
   - Shop name  
   - **Industry** (category)  
   - **Country** (locks currency + default timezone)  
   - Owner name, email, temporary password  
3. **Create vendor + owner login**
4. Optional: **Edit** to double-check country / category / active  
5. Optional: **Meta** / **Grab** if you are pre-wiring channels for them  
6. Send the merchant:
   - Admin URL: `https://admin.baseapp.asia`  
   - Email + temp password  
   - This guide (`docs/BETA_ONBOARDING.md`) or the in-app **Getting started** page  
7. Use **View as** anytime to help them without their password  

---

## Appendix B — Suggested first-week checklist (merchant)

- [ ] Signed in successfully  
- [ ] Shop name looks right; currency matches country  
- [ ] At least 5 catalog items added  
- [ ] *(H&B)* At least 1 artist (+ room if needed)  
- [ ] LINE channel connected + `menu` test works  
- [ ] One POS cash sale completed  
- [ ] *(H&B)* One manual booking created  
- [ ] *(Optional)* WhatsApp saved + Flow published by BaseApp  
- [ ] *(F&B)* Grab connected + menu published  
- [ ] Language set for staff who will use the tablet  

---

## Appendix C — Useful URLs

| What | URL |
|---|---|
| Admin login | https://admin.baseapp.asia/login |
| In-app getting started | https://admin.baseapp.asia/getting-started |
| LINE webhook | https://api.baseapp.asia/v1/webhooks/line |
| WhatsApp webhook | https://api.baseapp.asia/v1/webhooks/whatsapp |
| WhatsApp Flows endpoint | https://api.baseapp.asia/v1/webhooks/whatsapp/flows |

# WhatsApp Notification Setup Guide

The WhatsApp notification mechanism in Tohfa is **dormant by default**. No messages are sent to any user until every step in the activation checklist below is completed. Until then, the system falls back to owner email notifications (manual mode), which is fully operational. Read this guide end-to-end before touching any environment variable.

---

## 1. Template Definitions

All templates must be created inside **WhatsApp Manager → Account → Message Templates** under your Meta Business account. Use the exact names, categories, and body texts listed below — any deviation will require re-approval.

### `tohfa_new_order_v1` — Category: UTILITY

Sent to the **seller** when a new order is placed.

**Body text:**
```
New order on Tohfa! Order #{{1}} from {{2}} for Rs {{3}}. View and update it here: https://thetohfa.in/seller/orders.html
```

| Variable | Description |
|----------|-------------|
| `{{1}}` | Order ID / reference number |
| `{{2}}` | Buyer's display name |
| `{{3}}` | Order total amount (digits only, no ₹ symbol) |

---

### `tohfa_quote_received_v1` — Category: UTILITY

Sent to the **buyer** when a seller submits a price quote for a custom request.

**Body text:**
```
{{1}} sent you a quote of Rs {{2}} for your custom request on {{3}}. Review it here: https://thetohfa.in/buyer/orders.html
```

| Variable | Description |
|----------|-------------|
| `{{1}}` | Seller's shop / display name |
| `{{2}}` | Quoted amount (digits only) |
| `{{3}}` | Name or short description of the custom request |

---

### `tohfa_proof_ready_v1` — Category: UTILITY

Sent to the **buyer** when the seller uploads a design proof for a custom order.

**Body text:**
```
{{1}} has uploaded a design proof for your custom order {{2}}. Preview it here: {{3}}. Please review and approve it before dispatch: https://thetohfa.in/buyer/orders.html
```

| Variable | Description |
|----------|-------------|
| `{{1}}` | Seller's shop / display name |
| `{{2}}` | Order ID or short order name |
| `{{3}}` | Direct URL to the proof image or preview page |

---

### `tohfa_occasion_reminder_v1` — Category: MARKETING

Sent to a **buyer** as a reminder ahead of a saved occasion (e.g. anniversary, birthday).

> **⚠️ MARKETING category requires explicit opt-in.** This template cannot be sent to a user unless they have affirmatively opted in to receive WhatsApp marketing from Tohfa. The opt-in UI is not yet built — see [Known Limits](#7-known-limits).

**Body text:**
```
Your saved occasion {{1}} for {{2}} is {{3}} days away. Browse handmade gifts on Tohfa: https://thetohfa.in
```

| Variable | Description |
|----------|-------------|
| `{{1}}` | Occasion label (e.g. "Anniversary", "Mom's Birthday") |
| `{{2}}` | Name of the person the occasion is for |
| `{{3}}` | Number of days remaining |

---

## 2. Environment Variables

Copy `.env.example` to `.env` (for local development) and set the following. On Render, add them via **Dashboard → Service → Environment**.

**Minimum required variables for API mode:**

| Variable | Description |
|----------|-------------|
| `WHATSAPP_ENABLED` | Set `true` to activate sending. Leave unset or `false` to stay in manual mode. |
| `WHATSAPP_API_TOKEN` | Permanent access token from Meta Business → System Users. |
| `WHATSAPP_PHONE_NUMBER_ID` | Numeric Phone Number ID from WhatsApp Manager. |
| `WHATSAPP_APP_SECRET` | App Secret from Meta App Dashboard (used to verify webhook signatures). |
| `WHATSAPP_REDIRECT_ALL_TO` | During testing, set to a single E.164 number (e.g. `919755329298`) to redirect all outbound messages there instead of real recipients. Clear to go live. |
| `CRON_SECRET` | Shared secret used as the Bearer token for cron job HTTP calls. |

See `.env.example` for all optional tuning variables and defaults.

---

## 3. Activation Checklist

Complete these steps **in order**. Do not set `WHATSAPP_ENABLED=true` until step 6.

1. **Verify your WhatsApp Business number** in Meta Business Manager. The number must be fully verified and linked to a WhatsApp Business Account (WABA) before templates can be submitted.

2. **Create and submit all four templates** (§1 above) inside WhatsApp Manager. Wait for Meta to approve them — UTILITY templates typically approve within minutes; MARKETING templates may take longer. Do not proceed until all four show status **Approved**.

3. **Set all environment variables on Render** (§2 above) — every variable *except* `WHATSAPP_ENABLED`. Keeping `WHATSAPP_ENABLED` unset at this stage ensures the system remains in safe manual mode while you configure the webhook.

4. **Configure the webhook:**
   - Set `WHATSAPP_APP_SECRET` in your Render environment.
   - In Meta App Dashboard → WhatsApp → Configuration, add the callback URL:
     ```
     https://<your-render-domain>/api/webhook/whatsapp
     ```
   - Set your verify token and subscribe to the following webhook fields: **messages**, **message_deliveries**, **message_reads**.
   - Confirm the webhook handshake succeeds (Meta will send a GET challenge; the endpoint responds automatically).

5. **Add a payment method** in WhatsApp Manager (Meta Business → WhatsApp → Payment Methods). The API will reject template messages until a valid payment method is on file.

6. **Test with redirect:**
   - Set `WHATSAPP_ENABLED=true` on Render.
   - Set `WHATSAPP_REDIRECT_ALL_TO=919755329298` (or your own test number in E.164 format, without the `+`).
   - Trigger each notification type (place a test order, etc.) and confirm messages arrive on the redirect number with correct content.

7. **Clear the redirect:** Set `WHATSAPP_REDIRECT_ALL_TO=` (empty string) on Render. From this point, messages will route to real recipient numbers.

8. **Go live:** `WHATSAPP_ENABLED=true` remains set and the redirect is cleared. The system is now live. Monitor the first few real notifications to confirm delivery.

---

## 4. Scheduling Cron Jobs

Two endpoints must be called on a schedule for the system to function correctly. Neither is called automatically by the server — an external scheduler must hit them.

### Endpoints

| Endpoint | Schedule | Purpose |
|----------|----------|---------|
| `POST /api/cron/whatsapp` | Every minute (`* * * * *`) | Processes the outbound WhatsApp message queue |
| `POST /api/cron/reminders` | Daily at 09:00 AM IST (`30 3 * * *` in UTC) | Scans saved occasions and sends upcoming-occasion reminders |

Both endpoints require an `Authorization` header:
```
Authorization: Bearer <CRON_SECRET>
```

### Recommended Schedulers

- **[cron-job.org](https://cron-job.org)** — Free, simple UI, supports custom headers. Recommended for quick setup.
- **GitHub Actions** — Use a workflow with `schedule: [cron: '* * * * *']` and a `curl` step. Works well if the repo is on GitHub.
- **Render Cron Jobs** — Available on paid Render plans under the service dashboard.

> **Note:** There is no `crons` block in `vercel.json`. If you deploy to Vercel, you must use an external scheduler — Vercel's built-in cron support is not configured for this project.

---

## 5. Manual Mode Runbook

When `WHATSAPP_ENABLED` is not set to `true`, Tohfa sends owner notification emails instead of WhatsApp messages. The owner must act on each email manually.

### Email Subject → Required Action

| Email Subject | What It Means | Action Required |
|---------------|--------------|-----------------|
| `New Order #<id>` | A buyer placed an order | Open seller dashboard, confirm order, contact buyer if needed |
| `Custom Request: <topic>` | A buyer submitted a customization request | Review request details, issue a quote via the dashboard |
| `Quote Received for Order #<id>` | A seller issued a quote (owner relay) | Forward quote details to buyer if automated delivery failed |
| `Proof Uploaded for Order #<id>` | A design proof needs buyer review | Notify buyer manually or use the wa.me button in the email |
| `Occasion Reminder: <occasion>` | A buyer's saved occasion is approaching | Browse and suggest relevant products if needed |

### Using the `wa.me` Button in Owner Emails

Each owner notification email contains a pre-filled **"Send via WhatsApp"** button (wa.me deep link). To use it:

1. Open the email on a device where WhatsApp is installed.
2. Click the **Send via WhatsApp** button — it will open WhatsApp Web or the mobile app with the message pre-filled and the recipient's number already set.
3. Review the pre-filled message, make any personalisation edits, then tap **Send**.

**If the button doesn't pre-fill correctly** (can happen on some browsers or desktop clients), the full message text is also shown in a copy-box inside the email. Copy it manually, open WhatsApp, find or start the chat with the recipient's number, paste, and send.

### Marking a Message as Sent

Each owner email also contains a **"Mark as Sent"** link. Clicking it records in the database that the manual WhatsApp message was dispatched, keeping the order timeline accurate. Always click it after sending — skipping it causes audit gaps and may trigger a duplicate escalation email.

### Escalation Reminders

If a notification is not marked as sent within a configured grace period (default: 30 minutes), the system sends a follow-up escalation email to the owner. This is a reminder only — no action is taken automatically. Resolve the original notification and click the Mark as Sent link to stop further escalations.

### Switching to API Mode Later

To switch from manual mode to API mode at any time, complete the full [Activation Checklist](#3-activation-checklist) from step 1. You do not need to change any application code — only environment variables and external configuration.

---

## 6. Making Owner Emails Reliable

Manual mode depends entirely on owner emails being seen quickly. Take these steps to prevent missed notifications.

- **Enable mobile push alerts** on your email inbox. Both Gmail and Outlook mobile apps support per-sender push notifications — enable them for the Tohfa sender address.
- **Mark the sender as VIP / Priority.** In Gmail, star the sender or create a filter to always mark as important. In Apple Mail, add to the VIP list.
- **Verify SPF and DKIM** for your sending domain. Use [MXToolbox](https://mxtoolbox.com/SuperTool.aspx) to confirm both pass. Without these, emails may be classified as spam.
- **Send a test email** after any DNS or SMTP configuration change to confirm end-to-end delivery before going live.
- **Gmail App Passwords:** If the sending account uses Gmail with 2-Step Verification, you must create an [App Password](https://myaccount.google.com/apppasswords) and use it as `EMAIL_PASSWORD` in the environment. OAuth-only accounts will reject standard SMTP login.

---

## 7. Known Limits

| Limitation | Detail |
|------------|--------|
| **Marketing opt-in UI not built** | The `tohfa_occasion_reminder_v1` template is MARKETING category and legally requires explicit opt-in. No opt-in flow exists in the UI yet. Occasion reminders via WhatsApp will not be sent until this is built. |
| **Quote-issuing feature not built** | `sendCustomizationQuoteNotification()` is implemented and ready, but it is never called from any route. Seller-to-buyer quote notifications via WhatsApp are effectively dead code until the quote-submission UI/route is wired up. |
| **Indian mobile numbers only** | Phone numbers are stored and used in Indian E.164 format (`91XXXXXXXXXX`). International numbers are not validated or supported. |
| **`/api/cron/bestsellers` header weakness** | This cron endpoint uses a spoofable header check rather than a cryptographic Bearer token. This is a known issue and is out of scope for the current WhatsApp work. |
| **Telegram bot removed** | The legacy Telegram bot has been completely removed from the codebase and replaced with reliable owner email alerts (`special_order`, `seller_application`). |

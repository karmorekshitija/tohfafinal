# Tohfa v2 — Threat Model
> *"What are we building? What can go wrong? How do we fix it? How did we do?"*
> Keep this file updated as new features are added.

---

## 1. What Are We Building?

Tohfa is a two-sided gifting marketplace:
- **Buyers** browse, customise, and pay for handcrafted gifts
- **Sellers (Artisans)** list products, manage orders, and receive payouts
- **Admins** manage the platform, approve KYC, and handle disputes

**Key surfaces:**
| Surface | Technology |
|---|---|
| Frontend | Vanilla JS, Vite multi-page app, hosted on Vercel |
| Backend API | Node.js + Express, hosted on Render |
| Database | Neon PostgreSQL (pooled + direct connections) |
| Payments | Razorpay (dual-gateway with failover) |
| Media storage | Cloudinary |
| AI assistant | Tanya — Google Gemini 2.0 Flash |
| Auth | JWT (access 15m + refresh 7d) + Google OAuth |
| Notifications | WhatsApp (Twilio) + in-app |

---

## 2. What Can Go Wrong?

### 🔴 Critical
| Threat | Attack Scenario | Target |
|---|---|---|
| **Payment bypass** | Attacker forges Razorpay signature to mark order as paid without paying | `/api/payments/verify` |
| **Secret key exposure** | API key (Razorpay, Cloudinary, Gemini) leaked in frontend or git | All integrations |
| **Privilege escalation** | Buyer calls seller-only or admin-only endpoints | All role-gated routes |
| **Denial of Wallet** | Anonymous bot floods Tanya AI, burns Gemini quota | `/api/tanya/chat` |

### 🟡 High
| Threat | Attack Scenario | Target |
|---|---|---|
| **Coupon abuse** | Anonymous user brute-forces discount codes | `/api/coupons/apply` |
| **SQL injection** | Malformed input sent to DB queries via unvalidated fields | All form endpoints |
| **Broken object-level auth** | Buyer reads/modifies another buyer's orders or addresses | `/api/orders/:id`, `/api/buyer/addresses/:id` |
| **Insecure file upload** | Attacker uploads malicious file disguised as product image | `/api/upload`, `/api/products/:id/images` |

### 🟢 Medium
| Threat | Attack Scenario | Target |
|---|---|---|
| **Verbose error disclosure** | Stack traces or DB errors sent to client in production | All error handlers |
| **CORS misconfiguration** | Malicious site makes credentialed requests to API | CORS policy |
| **Session token theft** | JWT stored in localStorage is stolen via XSS | Auth flow |
| **Slop squatting** | AI-generated dependency name is hijacked with malware | `package.json` |

---

## 3. How Do We Fix It?

### Payment bypass
- ✅ Server-side HMAC-SHA256 signature verification (`payment.service.js`)
- ✅ `verifyPayment` blocks placeholder keys and mock IDs (fixed Sep 2026)
- ✅ Row-level locking + idempotency guard in `markOrderPaid`

### Secret key exposure
- ✅ All secrets in `.env` (server-side only)
- ✅ `.gitignore` blocks all `.env` files; git history confirms no leak
- ✅ No secrets in frontend JS or HTML

### Privilege escalation
- ✅ `authMiddleware` on all protected routes
- ✅ `adminOnly` and `sellerOnly` role guards on sensitive routes
- ✅ `verifySellerOwnership` middleware for seller product ownership checks

### Denial of Wallet (Tanya AI)
- ✅ `tanyaRateLimiter` — 30 req/min per IP
- ✅ `authMiddleware` required on Tanya (fixed Sep 2026 — was anonymous)
- ✅ `maxOutputTokens: 500` cap on Gemini responses (fixed Sep 2026)
- ✅ Fallback to keyword catalog search when Gemini key is absent

### Coupon abuse
- ✅ `authMiddleware` on coupon apply routes (fixed Sep 2026 — aliases were missing it)
- ✅ `authRateLimiter` on auth endpoints

### SQL injection
- ✅ Parameterised queries (`$1`, `$2`) throughout — no string concatenation into SQL
- ✅ Joi validation with `stripUnknown: true` on all body inputs

### Broken object-level auth
- ✅ All order/address queries filter by `req.user.id` (buyer_id or seller_id)
- ⚠️ Audit new endpoints against this pattern as features are added

### Insecure file upload
- ✅ Multer + Cloudinary pipeline — files go to Cloudinary, never to local disk
- ✅ `upload.js` enforces MIME type allowlists and file size limits

### Verbose error disclosure
- ✅ `errorHandler.js` suppresses stack traces in production
- ✅ Cron endpoints now return generic 500 messages (fixed Sep 2026)

### CORS misconfiguration
- ✅ CORS allowlist in `server.js` — specific domains, Vercel previews, localhost dev

---

## 4. How Did We Do? (Audit Log)

| Date | Finding | Severity | Status |
|---|---|---|---|
| Sep 2026 | `mock_signature` bypass in `checkout.js` could forge payment | 🔴 Critical | ✅ Fixed |
| Sep 2026 | `verifyPayment` allowed verification with `placeholder_secret` | 🔴 Critical | ✅ Fixed |
| Sep 2026 | Tanya AI had no auth — anonymous Denial-of-Wallet possible | 🔴 High | ✅ Fixed |
| Sep 2026 | Coupon verify alias routes missing `authMiddleware` | 🔴 High | ✅ Fixed |
| Sep 2026 | No `maxOutputTokens` cap on Gemini calls | 🟡 Medium | ✅ Fixed |
| Sep 2026 | Cron endpoints leaked `err.message` in 500 responses | 🟡 Medium | ✅ Fixed |

---

## Update Instructions

> **Whenever you add a new feature or API endpoint**, update this file by answering:
> 1. What does this endpoint do and who can call it?
> 2. What's the worst thing that could go wrong?
> 3. What guard is in place? (auth, validation, rate limit, ownership check)
> 4. Has it been tested against the threat?

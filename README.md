# Tohfa v2 — Curated Gift Marketplace

> **Master File Index** — Every file in this project, its role, and exact location.
> Deployment: Frontend → Vercel | Backend → DigitalOcean Droplet | DB → Neon PostgreSQL

---

## Quick Reference

| Panel | Primary Code Location |
|---|---|
| **Buyer Panel (Desktop)** | `frontend/src/buyer/desktop/` |
| **Buyer Panel (Mobile)** | `frontend/src/buyer/mobile/` |
| **Seller Studio (Desktop)** | `frontend/src/seller/desktop/` |
| **Seller Studio (Mobile)** | `frontend/src/seller/mobile/` |
| **Admin Panel** | `frontend/src/admin/` |
| **Auth Pages** | `frontend/src/auth/` |
| **Shared CSS Tokens** | `frontend/src/styles/tokens.css` |
| **Shared JS Utilities** | `frontend/src/js/` |
| **Backend Entry Point** | `backend/src/server.js` |
| **API Routes** | `backend/src/routes/` |
| **Business Logic** | `backend/src/services/` |
| **Database Schema** | `backend/src/db/schema.sql` |
| **Config & Secrets** | `backend/src/config/` (keys loaded from `.env`) |

---

## Tech Stack

| Layer | Technology | Host |
|---|---|---|
| Frontend | Vite Multi-Page App (HTML + CSS + Vanilla JS) | Vercel |
| Backend | Node.js + Express | DigitalOcean Droplet |
| Database | Neon PostgreSQL | Neon Cloud |
| Auth | JWT (Access 15min + Refresh 7d, rotated) | — |
| AI (Tanya) | Google Gemini API | — |
| WhatsApp | Twilio WhatsApp Business API | — |
| Payments | Razorpay | — |
| Logistics | iThink Logistics API | — |
| Image Storage | Cloudinary | — |
| Email | Nodemailer + SMTP | — |

---

## Frontend File Map

### Root
| File | Role |
|---|---|
| `frontend/index.html` | Root redirect — detects mobile/desktop + user role, routes accordingly |
| `frontend/vite.config.js` | Vite build configuration (multi-page entry points) |
| `frontend/package.json` | Frontend dependencies |

### Shared Styles — `frontend/src/styles/`
| File | Role |
|---|---|
| `tokens.css` | ALL CSS custom properties — colors, fonts, spacing, radius, shadow, breakpoints |
| `reset.css` | Normalize / box-model reset |
| `components.css` | Reusable component styles: buttons, cards, badges, forms, modals, nav, footer |
| `animations.css` | GPU-safe micro-animations (transform + opacity only, respects prefers-reduced-motion) |

### Shared JavaScript — `frontend/src/js/`
| File | Role |
|---|---|
| `api.js` | Central fetch wrapper — handles auth headers, token refresh, error normalization |
| `auth.js` | JWT storage, session validity checks, role detection, auto-redirect on expiry |
| `router.js` | Mobile/desktop detection + role-based redirect on every page load |
| `utils.js` | Shared helpers: currency formatter, date formatter, skeleton loader, debounce, toast notifications |

### Buyer Panel — Desktop — `frontend/src/buyer/desktop/`
| File | Role |
|---|---|
| `home.html` | Homepage: hero slideshow, For You feed, category strips, Our Story panel |
| `categories.html` | Full category browser with subcategory filtering |
| `product.html` | Product detail: gallery, description, variants, Fixed/Open customization, Add to Cart, Wishlist |
| `search.html` | Search results with category/price/occasion filters |
| `cart.html` | Cart grouped per seller, quantities, totals |
| `checkout.html` | Address selection + order summary before payment |
| `payment-success.html` | Payment confirmation + receipt download |
| `payment-failure.html` | Payment failure with retry option |
| `profile.html` | Buyer Activity Hub: Orders, Addresses, Occasions, Followers/Following, Wishlist, Notifications, Preferences, Help, About, Join Studio |
| `orders.html` | Full order history |
| `order-detail.html` | Single order: items, address, payment status, tracking |
| `wishlist.html` | Saved products |
| `occasions.html` | Saved occasions + WhatsApp reminder schedule |
| `notifications.html` | All in-app notifications |
| `seller-profile.html` | Public seller storefront: bio, products, follow |
| `messages.html` | Order-related message threads |
| `customization-form.html` | Dynamic Open Customization request form (generated from seller config) |
| `zip-gift.html` | Coming Soon placeholder for Zip Gift feature |

### Buyer Panel — Mobile — `frontend/src/buyer/mobile/`
> Same pages as desktop, built mobile-first. Bottom tab bar navigation. Bottom-anchored CTAs on product pages. Tanya opens as full-screen sheet.

### Seller Studio — Desktop — `frontend/src/seller/desktop/`
| File | Role |
|---|---|
| `dashboard.html` | Revenue summary, order counts, top products, revenue chart |
| `orders.html` | All orders list with status actions |
| `order-detail.html` | Single order details for seller |
| `overflow.html` | Overflow/waitlist orders (capacity queue) |
| `catalog.html` | All product listings with pause/delete controls |
| `add-product.html` | 6-step product creation wizard with inline Fixed & Open Customization setup |
| `edit-product.html` | Edit existing listing, stock levels, and customization settings |
| `analytics.html` | Revenue chart, top products, avg order value, views vs sales |
| `messages.html` | Inbox: order messages + Open Customization requests + quote sending |
| `reviews.html` | All received buyer reviews and ratings |
| `payouts.html` | Payout history, payment ledger, disputes |
| `profile.html` | Edit store name, bio, photos |
| `store-config.html` | Vacation mode, shipping presets, visibility |
| `onboarding.html` | Seller application status page |

### Seller Studio — Mobile — `frontend/src/seller/mobile/`
> Mobile-optimized mirrors of all seller desktop pages.

### Admin Panel — `frontend/src/admin/`
| File | Role |
|---|---|
| `dashboard.html` | Platform KPIs: revenue, orders today, total sellers, total buyers |
| `sellers.html` | Active + pending seller list, approve/reject/ban actions |
| `orders.html` | Platform-wide order list with filters |
| `categories.html` | Category + subcategory CRUD |
| `products.html` | All products, sponsored products, hero banner management |
| `our-story.html` | Feature/unfeature sellers in the Our Story section |
| `reports.html` | User reports + resolution workflow |
| `audit-logs.html` | Full audit trail + payment health monitoring |
| `master-admin.html` | Admin account management + access control |
| `tohfa-originals.html` | Tohfa's internal brand sellers (invisible to buyers as internal) |
| `ui-settings.html` | Platform display configuration |

### Auth Pages — `frontend/src/auth/`
| File | Role |
|---|---|
| `login.html` | Email/password login (buyer + seller share; admin separate URL) |
| `signup-buyer.html` | Buyer registration |
| `signup-seller.html` | Seller registration → leads to onboarding/approval flow |
| `forgot-password.html` | Request password reset email |
| `reset-password.html` | Set new password via reset link |
| `logout.html` | Logout confirmation screen |
| `session-ended.html` | Auto-shown when JWT session expires |

---

## Backend File Map

### Entry & Config
| File | Role |
|---|---|
| `backend/server.js` | Express app entry point — mounts all routes, middleware, error handler |
| `backend/src/config/db.js` | Neon PostgreSQL connection pool (pg library) |
| `backend/src/config/cloudinary.js` | Cloudinary SDK initialization |
| `backend/src/config/razorpay.js` | Razorpay instance setup |
| `backend/src/config/gemini.js` | Google Gemini AI client |
| `backend/src/config/twilio.js` | Twilio WhatsApp client |
| `backend/src/config/ithink.js` | iThink Logistics HTTP client |

### Middleware — `backend/src/middleware/`
| File | Role |
|---|---|
| `auth.js` | Verifies JWT access token on protected routes |
| `adminOnly.js` | Restricts route to admin role only |
| `sellerOnly.js` | Restricts route to approved seller role only |
| `validate.js` | Request body validation using Joi schemas |
| `rateLimiter.js` | Rate limiting (5 auth attempts / 15 min per IP) |
| `upload.js` | Multer + Cloudinary: handles multipart file uploads |
| `errorHandler.js` | Central error handler — formats all errors consistently |

### Routes — `backend/src/routes/`
| File | Mounts At | Protected |
|---|---|---|
| `auth.routes.js` | `/api/auth` | Public |
| `product.routes.js` | `/api/products` | Mixed |
| `cart.routes.js` | `/api/cart` | Buyer JWT |
| `order.routes.js` | `/api/orders` | Buyer/Seller/Admin JWT |
| `customization.routes.js` | `/api/customization` | Buyer/Seller JWT |
| `payment.routes.js` | `/api/payments` | Buyer JWT + webhook |
| `wishlist.routes.js` | `/api/wishlist` | Buyer JWT |
| `occasion.routes.js` | `/api/occasions` | Buyer JWT |
| `buyer.routes.js` | `/api/buyer` | Buyer JWT |
| `seller.routes.js` | `/api/seller` | Seller JWT |
| `admin.routes.js` | `/api/admin` | Admin JWT |
| `review.routes.js` | `/api/reviews` | Buyer JWT |
| `notification.routes.js` | `/api/notifications` | JWT |
| `analytics.routes.js` | `/api/analytics` | Seller/Admin JWT |
| `tanya.routes.js` | `/api/tanya` | Public (rate limited) |
| `logistics.routes.js` | `/api/logistics` | Seller/Admin JWT |
| `webhook.routes.js` | `/api/webhook` | Verified webhook secret |

### Controllers — `backend/src/controllers/`
> One controller per route file. Controllers handle HTTP request/response only — business logic lives in services.

### Services — `backend/src/services/`
| File | Role |
|---|---|
| `auth.service.js` | bcrypt hashing, JWT sign/verify, refresh token rotation |
| `order.service.js` | Order creation, status updates, overflow queue logic |
| `customization.service.js` | Dynamic form config, quote flow, status transitions |
| `payment.service.js` | Razorpay order creation, HMAC signature verification |
| `whatsapp.service.js` | Twilio WhatsApp message templates for occasions + seller alerts |
| `occasion.service.js` | Reminder scheduling, cron trigger logic |
| `tanya.service.js` | Gemini prompt engineering, live product context injection |
| `logistics.service.js` | iThink API wrapper (create shipment, track); skips special sellers |
| `email.service.js` | Nodemailer: password reset, order confirmation, seller approval/rejection |

### Database — `backend/src/db/`
| File | Role |
|---|---|
| `schema.sql` | Complete PostgreSQL schema (all 25+ tables, indexes, foreign keys) |
| `seed.sql` | Development seed data (sample categories, admin user, test products) |
| `migrations/001_initial.sql` | Initial migration matching schema.sql |

---

## Environment Variables

All secrets live in `.env` (never committed). See `.env.example` for all required keys and where to get them.

---

## Deployment

| Service | What to Deploy | Command / Notes |
|---|---|---|
| **Vercel** | `frontend/` | Build: `cd frontend && npm run build` \| Output: `dist/` |
| **DigitalOcean** | `backend/` | PM2 + Nginx reverse proxy + SSL (Let's Encrypt) |
| **Neon** | Run `schema.sql` | Copy `DATABASE_URL` from Neon dashboard to `.env` |

---

## Security Notes

- Never commit `.env` — only `.env.example` is in git
- Razorpay webhook signature must be verified before processing (see `webhook.routes.js`)
- `is_tohfa_original` flag is stripped from all public-facing API responses
- Admin panel has no public link — accessed only via direct URL `/admin/login.html`
- All SQL uses parameterized queries — zero string concatenation

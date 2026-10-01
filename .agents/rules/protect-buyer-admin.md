# 🔒 PROTECTED ZONES — AI EDIT RESTRICTION RULE

> This rule is enforced by the Antigravity AI agent at all times.
> It cannot be bypassed without the explicit unlock phrase.

---

## ❌ NEVER Edit These Files/Folders

The following paths are **PERMANENTLY LOCKED**. The AI must NEVER:
- Edit, refactor, delete, rename, or modify any file in these paths
- Suggest code changes inside these paths
- Create new files inside these paths
- Move files into or out of these paths

### Locked Paths

```
frontend/src/buyer/
frontend/src/admin/
frontend/src/auth/
frontend/src/components/
frontend/dist/buyer/
frontend/dist/admin/
frontend/dist/auth/
frontend/dist/components/
frontend/dist/index.html
frontend/dist/about.html
frontend/dist/contact.html
frontend/dist/faq.html
frontend/dist/categories.html
backend/routes/
backend/controllers/
backend/db/
backend/middleware/
backend/config/
backend/services/
vercel.json
```

### What to Do When Asked to Edit Locked Paths

If the user asks you to edit any locked path WITHOUT the unlock phrase:

1. **Refuse the edit**
2. Remind the user: *"This path is in the protected buyer/admin zone. To unlock it, include the phrase: `Tohfa-LOCK-OPEN-2024` in your message."*
3. Do NOT make any partial or temporary changes

---

## ✅ Unlock Protocol

If the user includes this **exact phrase** in their message:

```
Tohfa-LOCK-OPEN-2024
```

Then and ONLY then:
- The AI may proceed with editing locked paths
- The AI must still warn the user before each individual file change: *"⚠️ I'm about to modify a protected file: [filename]. Proceeding because unlock phrase was provided."*
- The unlock applies to that single conversation message ONLY — it does NOT persist

---

## ✅ Safe Zones — Always OK to Edit

These paths are active development zones — edit freely:

```
frontend/src/seller/
frontend/dist/seller/
frontend/dist/[seller-store-slugs]/   (e.g., crochet-lady/, nails-diva/)
```

---

## 🏷️ Rule Metadata

- **Created:** 2026-10-01
- **Version locked at Git commit:** f528ff8
- **Locked by:** Kshitija (karmorekshitija)
- **Unlock password phrase:** Tohfa-LOCK-OPEN-2024

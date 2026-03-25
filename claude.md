# Petit Demi — Claude Context

## Project
Custom cake bakery backend + website for **Demi** (Amsterdam, Netherlands).
Side hustle — custom cakes, cupcakes, cheesecakes, brownies, tarts, cookies.
Website: https://www.petitdemi.com/ (Squarespace, existing)

## Always Do First
- Invoke the `frontend-design` skill before writing any frontend code, every session, no exceptions.

## Tech Stack
| Layer | Technology |
|-------|-----------|
| Frontend | `index.html`, `menu.html`, `cotizar.html` — custom CSS, mobile-first, all inline |
| Backend | `api.mjs` — Node.js + Express (ESM), port 3001 |
| Database | Supabase — `petitdemi` schema inside the Lab (ExecutionAI) project |
| AI | OpenAI GPT-4o — order summary generation |
| Email | Resend — customer confirmation + Demi notification |
| Dev server | `serve.mjs` (port 3000) |
| Screenshots | `screenshot.mjs` + Puppeteer |

## Brand & Design
- **Background:** #FAF7F2 (warm cream)
- **Ink:** #1C1208 (deep warm black)
- **Accent:** #C5956C (warm terracotta)
- **Blush:** #F2C4BB (soft pink)
- **Muted:** #8C7B72 (warm brown-grey)
- **Border:** #EAE3DB
- Font: **Cormorant Garamond** (headings, serif) + **DM Sans** (body)
- Editorial bakery aesthetic — oversized serifs, generous whitespace, warm palette
- Language: English throughout

## App Structure
```
petitdemi/
  index.html          ← public homepage
  menu.html           ← interactive cake menu
  cotizar.html        ← 3-step order quote form
  admin/
    index.html        ← order management SPA
  api.mjs             ← Express API (port 3001)
  serve.mjs           ← local dev server (port 3000)
  screenshot.mjs      ← Puppeteer screenshot tool
  data/
    menu.js           ← product catalog (sizes, prices, flavors, fillings)
    ingredients.js    ← flavor → ingredient mapping (placeholder — Demi to review)
  supabase-setup.sql  ← DB schema creation SQL
```

## Database (Supabase — petitdemi schema in Lab project)
- `petitdemi.clients` — customer info, dedup by email
- `petitdemi.orders` — all order details, status pipeline

## Status Pipeline
```
quote_received → confirmed → in_production → ready → delivered
     ↓               ↓            ↓             ↓
  cancelled       cancelled    cancelled     (terminal)
```
Transitions enforced server-side in PATCH /api/admin/orders/:id

## API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/quotes` | Public — submit quote form |
| POST | `/api/quotes/preview` | Public — AI summary preview (step 3) |
| GET | `/api/admin/stats` | Dashboard stats |
| GET | `/api/admin/orders` | List orders (?status=, ?q=) |
| GET | `/api/admin/orders/:id` | Single order + client |
| PATCH | `/api/admin/orders/:id` | Update status / price / notes |
| DELETE | `/api/admin/orders/:id` | Hard delete |
| POST | `/api/admin/shopping-list` | Consolidate ingredients for selected order IDs |
| GET | `/api/admin/clients` | List all clients |

## Admin Features
- Dashboard: stat cards + urgent orders (delivery ≤ 3 days)
- Orders: filter by status, search, slide-in detail panel
- Calendar: week view of delivery dates
- Shopping List: check orders → generate consolidated ingredient list → print
- Clients: table with WhatsApp links

## Environment Variables Required
```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
ADMIN_TOKEN          ← Demi's admin password
OPENAI_API_KEY
RESEND_API_KEY
FROM_EMAIL           ← noreply@petitdemi.com
DEMI_EMAIL           ← info@petitdemi.com
PORT                 ← optional, defaults to 3001
```

## Dev Notes
- Port 3000 may conflict with MediTrack (another local project). Use `PORT=3002 node serve.mjs` if needed.
- Admin token stored in `localStorage` as `pd_admin_token`
- WhatsApp placeholder: `0601089333` → `https://wa.me/31601089333`
- Ingredient data in `data/ingredients.js` is placeholder — Demi should review/adjust amounts

## Coding Principles
- No `window.confirm()` — always branded modals
- `localStorage` for auth token (not sessionStorage)
- English for all user-facing copy
- AI output → always parse as JSON, always include confirmation step
- Two-step Supabase FK lookups when joins unreliable
- Never push automatically — only when explicitly told

# PickNPack — LIVE Sales Dashboard (Supabase)

Separate from the old Google-Sheet dashboard (that one stays as a backup and is never touched).

- Data: Supabase `invoices` (filled by the PICKNPACK ZOHO SYNC sheet → Push)
- Login: Google or email link; only emails in Admin → Users can open it
- Default location: Delhi- Offline (Location filter: All / Delhi- Offline / Delhi- Online / Gujarat / Karnataka)
- Sales-only locations (profit not entered) are left out of margin %, never shown as "zero profit"
- Only new/changed invoices are downloaded after the first visit (cached in the browser)
- Admin settings (salary, targets, weights, photos, logo) are saved in Supabase — same on every computer

Files added vs the old dashboard: `js/cloud.js`, `js/vendor/supabase.js`. Browser storage names start with `pnp_live_` so the old dashboard is not affected.
Setup: see LIVE-DASHBOARD-SETUP.md

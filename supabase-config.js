/* =====================================================================
   ArcanaForge — Supabase configuration
   Fill in the two values below from your Supabase project:
   Dashboard → Project Settings → API
     • Project URL      → SUPABASE_URL
     • anon public key  → SUPABASE_ANON_KEY
   The anon key is DESIGNED to be public — it can only do what the
   row-level-security policies in supabase-schema.sql allow.
   Never put the service_role key here or anywhere in the site.
   ===================================================================== */
window.ARCANAFORGE_SUPABASE = {
  SUPABASE_URL: "PASTE_YOUR_PROJECT_URL_HERE",
  SUPABASE_ANON_KEY: "PASTE_YOUR_ANON_PUBLIC_KEY_HERE"
};

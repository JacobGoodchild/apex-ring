// Online settings. Leave both empty and the online screens show "under construction".
// To switch online play on, paste your Supabase project's URL and its anon public key here (see ONLINE.md).
// The publishable/anon key is meant to be public: what it can do is limited by the row-level security in supabase/schema.sql.
export const ONLINE = {
  url: "https://qkxpmxtjlkslrnzvmjic.supabase.co",
  anonKey: "sb_publishable_k8dgWvJmUA2A2FLjdtmkuA_G91w7IOp", // the PUBLISHABLE key (sb_publishable_...) or the legacy "anon public" key. NEVER the secret / service_role key.
};

import { createClient } from "@supabase/supabase-js";
import { env } from "./env.js";

export const db = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
  auth: { persistSession: false }
});

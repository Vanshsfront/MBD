// Browser Supabase client. Use this inside "use client" components that
// need to call Supabase directly from the browser. The publishable key is
// safe to ship to the client by design.

import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const createClient = () => {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Supabase env missing: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are required.",
    );
  }
  return createBrowserClient(supabaseUrl, supabaseKey);
};

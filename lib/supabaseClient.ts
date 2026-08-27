"use client";
import { createBrowserClient } from "@supabase/ssr";

// Browser-seitiger Supabase-Client (verwendet den öffentlichen anon key,
// Zugriff auf Daten wird über Row Level Security in Supabase kontrolliert).
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

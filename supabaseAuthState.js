// supabaseAuthState.js
// Custom Baileys auth state adapter for Supabase
// Requires: npm install @supabase/supabase-js

import { createClient } from '@supabase/supabase-js';

// Set these with your Supabase project credentials
const SUPABASE_URL = "https://ieonhbdnqixuomwwykcx.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imllb25oYmRucWl4dW9td3d5a2N4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTUzNzg3NywiZXhwIjoyMDcxMTEzODc3fQ.flN5Vs7BYn6zbE94-eThdDusIWAfGpoPUfFYLZ01qwg";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const TABLE = 'wa_auth_states'; // Table with columns: bot_id (text, PK), data (jsonb)

export async function useSupabaseAuthState(botId) {
  // Load state from Supabase
  async function readData() {
    const { data, error } = await supabase
      .from(TABLE)
      .select('data')
      .eq('bot_id', botId)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data ? data.data : undefined;
  }

  // Save state to Supabase
  async function writeData(data) {
    const { error } = await supabase
      .from(TABLE)
      .upsert({ bot_id: botId, data }, { onConflict: ['bot_id'] });
    if (error) throw error;
  }

  // Baileys expects this interface:
  return {
    state: {
      async read() {
        return await readData();
      },
      async write(data) {
        await writeData(data);
      },
    },
    saveCreds: async (creds) => {
      await writeData(creds);
    },
  };
}

// Usage in your server.js:
// import { useSupabaseAuthState } from './supabaseAuthState.js';
// const { state, saveCreds } = await useSupabaseAuthState(botId);
// ... pass state and saveCreds to makeWASocket ...

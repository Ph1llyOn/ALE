import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '../config.js';

// supabase-js è caricato come script classico (js/vendor/supabase.umd.js, stessa origine, niente CDN).
const lib = globalThis.supabase;
if (!lib?.createClient) throw new Error('supabase-js non caricato');

export const sb = lib.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // Flusso implicito: i link nelle email funzionano anche se si aprono in un browser diverso
    // da quello dell'app installata (con PKCE il "code verifier" resterebbe nell'altro contesto).
    flowType: 'implicit',
    detectSessionInUrl: true,
  },
});

// Configurazione pubblica. NESSUN segreto qui.
// I valori Supabase sono volutamente vuoti: verranno inseriti (solo URL e chiave
// pubblica anon/publishable) dopo conferma esplicita, nel passo 0.11.
export const SUPABASE_URL = '';
export const SUPABASE_ANON_KEY = '';

// Tutti i percorsi dell'app sono RELATIVI. Il sito vive sotto /<repo>/ su GitHub Pages.
// Questo helper risolve un percorso rispetto alla radice dell'app, qualunque essa sia.
export const BASE_URL = new URL('../', import.meta.url);
export const resolve = (path) => new URL(path, BASE_URL).toString();

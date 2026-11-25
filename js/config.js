// Configurazione PUBBLICA. Nessun segreto qui: solo URL del progetto e chiave "publishable",
// progettata per stare nel frontend. La sicurezza dei dati dipende dalla RLS del database
// (vedi supabase/migrations e i test), non dalla segretezza di questi valori.
// Mai inserire qui chiavi segrete, password o token: i test lo impediscono.

const isLocalDev = ['localhost', '127.0.0.1'].includes(globalThis.location?.hostname);

// In sviluppo locale (http://localhost:8080/ALE/) si usa lo stack Supabase locale (npm run db:start);
// altrimenti il progetto remoto "ALE".
export const SUPABASE_URL = isLocalDev
  ? 'http://127.0.0.1:54321'
  : 'https://llklcwuduimrkhhmnbxf.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = isLocalDev
  ? 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH' // chiave di default dello stack locale (nota, pubblica)
  : 'sb_publishable_wldlRhNQwYO9XdlUGdQM3A_WdB0gkRY';
export const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;

// Chiave pubblica VAPID per le notifiche Web Push (la parte privata sta solo nei segreti del server).
// Vuota finché le chiavi non sono state generate e caricate (vedi docs/NOTIFICHE.md).
export const VAPID_PUBLIC_KEY = '';

// Tutti i percorsi dell'app sono RELATIVI. Il sito vive sotto /<repo>/ su GitHub Pages.
export const BASE_URL = new URL('../', import.meta.url);
export const resolve = (path) => new URL(path, BASE_URL).toString();

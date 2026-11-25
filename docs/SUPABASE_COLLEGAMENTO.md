# Collegamento futuro a Supabase (NON ancora eseguito)

Nessun progetto remoto è stato creato. Quando verrà il momento (passi 0.10–0.11):

## Cosa serve (lo prepara il proprietario del progetto)
1. Progetto Supabase in regione UE (es. Francoforte). Password del database scelta e custodita da chi lo crea.
2. **Project ref** (identificativo nell'URL del progetto) e **Project URL** (`https://<ref>.supabase.co`).
3. Chiave **pubblica** (`anon` / publishable). È pensata per il frontend e finisce in `js/config.js`.
4. Un access token personale Supabase, creato dal proprietario, **solo** nel terminale locale (`SUPABASE_ACCESS_TOKEN`) per `npx supabase link`. Mai nel repository.

## Cosa NON deve mai entrare nel repository
`service_role` / secret key, password del DB, access token, chiave Anthropic, chiave VAPID privata.
I test (`npm test`) falliscono se nel frontend compaiono pattern di segreti.

## Passi previsti
1. `npx supabase login` (nel terminale del proprietario) e `npx supabase link --project-ref <ref>`.
2. Impostare in Supabase → Authentication → URL Configuration:
   - Site URL: `https://ph1llyon.github.io/ALE/`
   - Redirect URLs: `https://ph1llyon.github.io/ALE/**` e `http://localhost:8080/ALE/**`
3. Inserire Project URL e chiave pubblica in `js/config.js` (unici valori Supabase ammessi nel frontend) e aggiornare il test `config.js` di conseguenza.
4. `npx supabase db push` per applicare le migrazioni (dopo revisione).
5. Segreti delle Edge Function (Fase 4): `npx supabase secrets set ...` dal terminale, mai da file committati.

## Secret GitHub Actions
Per ora non ne servono: la CI usa solo lo stack locale. Se in futuro un job dovrà parlare con il progetto remoto, i secret si creano in Settings → Secrets → Actions dal proprietario.

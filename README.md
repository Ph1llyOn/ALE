# ALE.

PWA per il benessere personale. Vedi `PIANO_TECNICO.md` per architettura e fasi.

## Sviluppo locale

```
npm test              # test statici (PWA, percorsi, segreti, licenze) + test sotto /ALE/
npm run serve         # serve il sito su http://localhost:8080/ALE/ (simula GitHub Pages)
node tools/make-icons.mjs   # rigenera le icone segnaposto
```

Supabase locale (richiede Docker Desktop e Supabase CLI): `supabase start`, `supabase test db`.

## Regole

- Percorsi sempre relativi (il sito vive sotto `/<repo>/`).
- Nessun segreto nel repository. `js/config.js` contiene solo URL e chiave pubblica.
- Ogni tabella ha RLS attiva e test.

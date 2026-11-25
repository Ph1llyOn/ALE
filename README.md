# ALE.

PWA per il benessere personale. Vedi `PIANO_TECNICO.md` per architettura e fasi.

## Sviluppo locale

```
npm ci                # installa dipendenze di sviluppo (Supabase CLI, supabase-js per i test)
npm test              # test statici (PWA, CSP, segreti, licenze) + unitari (validazione, rotte, errori)
npm run serve         # serve il sito su http://localhost:8080/ALE/ (simula GitHub Pages; usa lo stack locale)
npm run vendor        # ricopia supabase-js in js/vendor/ dopo un aggiornamento di versione
npm run precache      # rigenera la lista di file in cache di sw.js dopo aver aggiunto/rimosso file
node tools/make-icons.mjs   # rigenera le icone segnaposto
```

Supabase locale (richiede Docker Desktop; la CLI è una dev dependency, `npm install`):

```
npm run db:start      # avvia lo stack locale (database, Auth, Storage, posta di test)
npm run db:test       # test pgTAP (RLS, vincoli 1:1, condivisione, privilegi, eliminazione account)
npm run test:api      # test API reali (Auth, RLS, condivisione, collegamento, concorrenza, Storage, eliminazione)
npm run db:stop
```

Modello di privacy: vedi `docs/PRIVACY.md`. Decisioni approvate: `docs/DECISIONI.md`.

## Regole

- Percorsi sempre relativi (il sito vive sotto `/<repo>/`).
- Nessun segreto nel repository. `js/config.js` contiene solo URL e chiave pubblica.
- Ogni tabella ha RLS attiva e test.

# Supabase: progetto remoto e gestione credenziali

## Stato (25/11/2026)
| Voce | Valore |
|---|---|
| Progetto | **ALE** — ref `llklcwuduimrkhhmnbxf` (il ref non è un segreto) |
| Organizzazione | Ph1llyOn's Org (piano **Free**, spend cap attivo, nessun metodo di pagamento) |
| Regione | `eu-central-1` (Francoforte) |
| Ambiente | production |
| Migrazioni applicate | `baseline`, `accounts_and_pairing`, `sharing_permissions`, `app_tables`, `account_lifecycle`, `messages_phase3` (27-28/11/2026) |
| Altro progetto nell'organizzazione | "Ph1llyOn's Project" (`madmesdxesaiyhgpfroj`, eu-west-1): non toccato |

Limiti del piano Free da ricordare: massimo 2 progetti attivi, 500 MB di database, 5 GB di egress,
**pausa automatica dopo 1 settimana di inattività**. Una pausa ferma app, cron e notifiche: va tenuta
d'occhio (o valutato in futuro un piano a pagamento, solo con decisione esplicita).
Il progetto è stato creato senza `--size`: il piano Free non permette di scegliere il calcolo.

## Dove stanno le credenziali (tutte ignorate da git)
| File | Contenuto | Visibilità |
|---|---|---|
| `supabase/.env.local` | `SUPABASE_DB_PASSWORD` (password del database) | **SEGRETO**, solo locale |
| `.env.local` | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | pubblici per natura (finiscono nel frontend), ma non ancora committati |
| keyring di sistema | access token Supabase (da `supabase login`) | SEGRETO, gestito dalla CLI |

`js/config.js` (committato) contiene **solo** URL del progetto e chiave *publishable*: è pensata per stare
nel frontend e la sicurezza dei dati dipende interamente dalla RLS (test in `supabase/tests/` e `tests/api/`),
non dalla sua segretezza. In sviluppo locale (`localhost`) la stessa pagina usa lo stack Supabase locale.

## Mai nel repository
Chiave `secret`/`service_role`, password del database, access token, chiave Anthropic, chiave VAPID privata.
`npm test` fallisce se un file tracciato da git contiene pattern di questi segreti.

## Comandi (dal terminale del proprietario)
```
npx supabase login                      # una volta; token nel keyring
# la password è in supabase/.env.local; esportarla solo nella sessione:
$env:SUPABASE_DB_PASSWORD = (Get-Content supabase/.env.local | Select-String '^SUPABASE_DB_PASSWORD=').ToString().Split('=',2)[1]
npx supabase link --project-ref llklcwuduimrkhhmnbxf
npx supabase db push --remote --dry-run # anteprima
npx supabase db push --remote           # applica le migrazioni
```
Le migrazioni si applicano al remoto **solo dopo** che i test locali (`npm run db:test`) sono verdi.
Non si esegue pgTAP sul progetto di produzione (installerebbe un'estensione): si usano le query
di sola lettura `npx supabase db query --remote --read-only "..."`.

Se la password del database va cambiata o è andata persa: Dashboard → Project Settings → Database →
Reset database password, poi aggiornare `supabase/.env.local`.

## Impostazione sicura per GitHub Actions
Oggi la CI **non** usa nessun secret: i test girano sullo stack locale in Docker.
Se in futuro un job dovrà parlare con il progetto remoto (es. deploy delle migrazioni):
1. Settings → Secrets and variables → Actions → **New repository secret** (lo crea il proprietario nel browser, non in chat).
2. Nomi previsti: `SUPABASE_ACCESS_TOKEN` (token dedicato, creato in Dashboard → Account → Access Tokens, con nome "ale-ci"), `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF` (quest'ultimo può essere una *variable*, non è segreto).
3. Usarli solo in job su `main`, con `permissions` minime e un **environment** `production` con approvazione manuale richiesta.
4. Mai stampare secret nei log; nessun secret nei workflow delle pull request da fork.

## Secret delle Edge Function (Fase 4)
`npx supabase secrets set ANTHROPIC_API_KEY=...` dal terminale del proprietario. Mai in file committati.

## Impostazioni Auth del progetto remoto (applicate dalla dashboard il 26/11/2026)
- Site URL: `https://ph1llyon.github.io/ALE/`
- Redirect URLs: `https://ph1llyon.github.io/ALE/**` (lo sviluppo locale usa lo stack locale, non il remoto)
- Lunghezza minima password: **10** (verificato: il server risponde 422 `weak_password` con 8 caratteri)
- Accesso senza email (`docs/ACCESSO.md`): **le registrazioni pubbliche vanno DISATTIVATE** (Authentication → Sign In / Providers → "Allow new users to sign up": off). Gli utenti li crea solo la funzione `access` con la chiave di servizio.

### Da sapere / da decidere
- **Email di Auth in inglese e mittente di default.** Il servizio email integrato di Supabase è pensato per prove:
  limitato a pochi invii l'ora e, sui progetti nuovi, può recapitare solo ai membri dell'organizzazione.
  Prima che Alessia si registri serve un **SMTP personalizzato** (Authentication → Emails → SMTP Settings)
  e template in italiano (Authentication → Emails → Templates). Fino ad allora conferma email e recupero
  password non arriveranno a chi non è membro dell'organizzazione.
- **Registrazione aperta.** Chiunque conosca l'URL può creare un account (vede solo i propri dati: RLS).
  Quando Alessia e Phill si sono registrati, disattivare "Allow new users to sign up"
  (Authentication → Sign In / Providers → User Signups).
- **Piano Free:** pausa dopo 1 settimana di inattività.

## Invio programmato dei messaggi (pg_cron)
Il job `ale-dispatch-scheduled-messages` esegue ogni minuto `select public.dispatch_due_scheduled_messages()` (gratuito,
dentro il database). Per fermarlo o vederlo, dal terminale del proprietario:
```
npx supabase db query --remote --read-only "select jobid, schedule, active from cron.job"
npx supabase db query --remote "select cron.unschedule('ale-dispatch-scheduled-messages')"   # ferma l'invio
```
Se il progetto va in pausa (piano Free, 1 settimana senza attività) l'invio si ferma finché non viene riattivato.

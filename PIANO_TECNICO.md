# ALE. — Piano tecnico (bozza per approvazione)

Nessun codice è stato scritto. Cartella di progetto vuota, nessun repository git.

## 1. Decisioni architetturali proposte

| Tema | Scelta | Motivo |
|---|---|---|
| Frontend | Vanilla JS con ES modules, **senza build step**; micro-router hash-based; componenti come funzioni che restituiscono DOM | Come da specifica; GitHub Pages serve file statici |
| Routing | Hash routing (`#/home`, `#/attivita`...) | GitHub Pages non supporta rewrite SPA; funziona bene in PWA iOS |
| Supabase client | `@supabase/supabase-js` v2 da CDN con versione fissata (esm), pre-cache dal service worker | Evita bundler |
| Backend | Supabase: Auth, Postgres+RLS, Storage, Realtime, Edge Functions (Deno) | Come da specifica |
| AI | Solo Edge Function → Anthropic API; chiave in `supabase secrets` | Punto 17.4 / 18.3 |
| Scheduler | `pg_cron` + `pg_net` che invoca Edge Function `dispatch-scheduled` ogni minuto; stato e tentativi in tabella | Non dipende dal browser aperto |
| Push | Web Push (VAPID) via Edge Function; chiave privata VAPID nei secrets | iOS 16.4+, solo PWA installata |
| Migrazioni | File SQL versionati in `supabase/migrations/`, applicati con Supabase CLI | Schema documentato e riproducibile |
| Test | Test SQL RLS (pgTAP o script) + test Deno per Edge Functions + checklist manuale su iPhone | Sicurezza verificabile |

## 2. Struttura del progetto

```
ALE/
├─ index.html, manifest.webmanifest, sw.js
├─ assets/ (icone, immagini esercizi, font)
├─ css/ (tokens.css, base.css, components.css, temi chiaro/scuro)
├─ js/
│  ├─ main.js, router.js, store.js, supabase.js, config.js (solo URL + anon key)
│  ├─ core/ (auth, theme, notifications, offline, ui helpers)
│  ├─ features/ (home, attivita, calendario, diario, profilo, benessere,
│  │             abitudini, messaggi, onboarding, phill/)
│  └─ components/ (card, tabbar, modal, toast, progress, empty-state...)
├─ supabase/
│  ├─ migrations/
│  ├─ functions/ (ai-daily, ai-equipment, ai-reminders, dispatch-scheduled,
│  │              send-push, accept-invite, delete-account)
│  └─ tests/
└─ docs/ (schema, privacy, checklist test)
```

## 3. Modello dati e sicurezza (punto critico)

**Principi RLS**
- RLS attiva su *ogni* tabella; nessuna policy = nessun accesso.
- Ogni riga di dati personali ha `owner_id` (Alessia o Phill).
- Il collegamento (`partnerships`: `owner_id`=Alessia, `partner_id`=Phill, stato) **non** concede nulla da solo.
- Tabella `sharing_permissions(owner_id, grantee_id, category, level, revoked_at)`; categorie: `activities`, `progress`, `habits`, `calendar`, `goals`, `wellbeing_summary`. Diario e note benessere: **mai** condivisibili a Phill di default; condivisione solo esplicita per singolo contenuto.
- Funzione `security definer` `can_view(owner, category)` usata nelle policy di SELECT di Phill; revoca = effetto immediato.
- Phill può solo INSERIRE proposte (`workout_proposals`, eventi proposti con stato `proposed`) e messaggi; solo Alessia cambia lo stato (accetta/rifiuta).
- Tabelle di servizio (`ai_generations`, `scheduled_messages` stato invio, `push_subscriptions` altrui) scritte solo da service_role nelle Edge Functions.
- Storage: bucket privati (`avatars`, `exercise-media`), path `{user_id}/...`, policy per owner; avatar leggibile dal partner collegato.
- Inviti: codice casuale hashato, scadenza (es. 48h), uso singolo, riscattato da Edge Function `accept-invite` (non via RLS diretta).

**Tabelle** (da §19, con aggiunte): `profiles` (ruolo `alessia|phill`), `invitations`, `partnerships` (nuova), `sharing_permissions`, `equipment`, `exercises` (catalogo con immagine; nuova), `workouts`, `workout_exercises`, `workout_proposals`, `workout_sessions` (+ `session_exercise_progress` per salvataggio automatico; nuova), `habits`, `habit_logs`, `calendar_events` (7 categorie, `status`: proposed/confirmed), `journal_entries`, `journal_shares` (nuova, per condivisione esplicita/AI), `wellbeing_logs`, `progress_records`, `messages`, `scheduled_messages`, `notifications`, `notification_preferences` (nuova), `ai_preferences`, `ai_generations`, `push_subscriptions`.

**Guardrail AI (lato Edge Function)**
1. Verifica JWT e `ai_preferences.enabled` + consenso esplicito.
2. Il contesto è costruito dal server *solo* con dati che Alessia ha autorizzato per l'AI (diario solo se condiviso).
3. System prompt con limiti di §10.4 (no diagnosi, diete, giudizi sul corpo, obiettivi obbligatori; non inventare stato emotivo).
4. Output JSON con schema, validato con la pipeline descritta in §7 (nessun filtro a parole chiave).
5. Rate limit per utente; log in `ai_generations`.
6. Modello consigliato: Haiku 5.5 per motivazioni giornaliere, Sonnet 5.5 per inventario/schede (da confermare in sede di costi).

## 4. Fasi di sviluppo (ognuna con criterio di verifica)

0. **Setup**: progetto Supabase, repo GitHub, git init, CLI. *Verifica*: pagina vuota pubblicata su Pages.
1. **Fondamenta**: design tokens rosa/bianco, temi chiaro/scuro/sistema, tab bar, router, PWA (manifest, sw, icone), client Supabase. *Verifica*: installabile su iPhone, Lighthouse PWA.
2. **Account**: migrazioni `profiles`, `invitations`, `partnerships`; auth, avatar, invito/link; test RLS. *Verifica*: due account collegati, nessun dato visibile.
3. **Funzionalità core**: attività/schede/sessioni con autosave, calendario, diario, benessere, abitudini, progressi. Ogni modulo con migrazione+RLS+test.
4. **Claude**: Edge Functions, consenso AI, onboarding attrezzatura, motivazione giornaliera (cron mattina), promemoria.
5. **Area Phill**: dashboard, messaggi, programmazione, proposte, UI permessi.
6. **Push/Realtime/Offline**: VAPID, Realtime su `messages`/`notifications`, cache offline con coda di scritture, test su dispositivi reali.
7. **Sicurezza e rilascio**: audit RLS, scansione segreti nel frontend, privacy policy, cancellazione account (Edge Function), checklist §23.

Consiglio: sviluppare in ordine, con una verticale minima (Fase 1+2) approvata prima di proseguire.

## 5. Rischi e punti di attenzione

- **Push iOS**: richiedono PWA installata, iOS ≥ 16.4, permesso su gesto utente; affidabilità variabile → l'app deve funzionare anche senza.
- **Immagini esercizi**: servono asset con licenza adeguata (da produrre/acquistare/generare); non possiamo copiarli da siti terzi.
- **Contenuti sanitari**: la specifica accenna a un "professionista che segue Alessia": serve un campo dove Alessia inserisca le indicazioni ricevute, usato come vincolo dall'AI; l'AI non genera esercizi "clinici".
- **Privacy**: dati di benessere e diario sono sensibili (GDPR art. 9 potenziale); servono informativa, consenso esplicito AI, cancellazione. Anthropic come sub-responsabile va citata.
- **Anon key pubblica**: è sicura solo se la RLS è corretta → test automatici obbligatori.
- **Costi**: Supabase free tier mette in pausa i progetti inattivi; pg_cron/pg_net disponibili sul free tier ma da verificare. Costo API Anthropic contenuto (1 chiamata/giorno).
- **Date**: il documento è datato 25/11/2026; nessun problema tecnico, solo da tenere coerente nelle date di consegna.

## 6. Decisioni (APPROVATE il 25/11/2026)

Abitudini predefinite + personalizzabili · logo tipografico "ALE." con punto rosa · push per messaggi di Phill, proposte e motivazione mattutina (il resto solo in-app) · onboarding interamente saltabile e riprendibile dal Profilo · collegamento 1:1 (vedi §9).

## 7. Validazione dei contenuti Claude (sostituisce il filtro a parole)

Un elenco di parole bloccherebbe testi innocui ("manubri da 2 kg", "peso corporeo" come tipo di esercizio) e lascerebbe passare giri di parole. Pipeline a strati:

1. **Prevenzione a monte**: prompt di sistema con le regole di §10.4, contesto minimo autorizzato, output vincolato a uno schema JSON (campi: `titolo`, `testo`, `tono` enum, `suggerimenti[]`). Nessun campo libero per consigli medici/dietetici.
2. **Validazione strutturale**: schema, lunghezze massime, lingua italiana, nessun URL/contenuto privato non autorizzato.
3. **Controllo semantico (secondo passaggio, modello diverso e indipendente)**: un classificatore con rubrica esplicita valuta il *significato*, non le parole: diagnosi o interpretazioni mediche, prescrizioni dietetiche o di trattamento, giudizi/obiettivi sul corpo, obiettivi obbligatori o colpevolizzanti, pressione/insistenza, invenzione dello stato emotivo, esercizi con presunta valenza clinica. Risposta JSON `{allowed, violations[{categoria, motivo}]}`. In caso di dubbio o errore del classificatore: **fail closed**.
4. **Regole deterministiche solo dove sono davvero strutturali** (non lessicali): ad es. un target numerico di peso/calorie/misure attribuito all'utente. Verifica sul contesto, non sulla singola parola.
5. **Esito**: se non consentito → un tentativo di rigenerazione con le violazioni come feedback; se fallisce ancora → messaggio di riserva da libreria curata a mano. Tutto registrato in `ai_generations` (esito, categorie, versione prompt) senza testo privato non necessario.
6. **Test di valutazione** (`supabase/tests/ai-eval/`): set di casi *positivi* (testi innocui che devono passare: "usa i manubri da 2 kg", "esercizi a corpo libero") e *negativi* (diagnosi, diete, giudizi sul corpo, pressione, anche parafrasati o con giri di parole). Il set gira a ogni modifica di prompt/modello; soglie minime documentate. Nota: i test che chiamano l'API reale costano poco ma richiedono la chiave Anthropic; in CI normale si usano risposte registrate.

## 8. Strategia di test RLS e API

Ambiente: `supabase start` (stack locale in Docker) — nessun test tocca il progetto di produzione.

**Matrice**: per **ogni tabella e categoria di dati** × attori × operazioni.
- Attori: Alessia (proprietaria), Phill collegato con permesso, Phill collegato *senza* permesso, Phill con permesso *revocato*, utente estraneo, anonimo (anon key senza login).
- Operazioni: SELECT, INSERT, UPDATE, DELETE, anche con `owner_id` falsificato nel payload e tentativi di cambiare stato (es. Phill che si auto-approva una proposta).
- Categorie coperte: profili, inviti/collegamento, permessi, attrezzatura, allenamenti/sessioni, proposte, abitudini, calendario, diario, benessere, progressi, messaggi/programmati, notifiche, preferenze/consensi/generazioni AI, push, Storage (bucket e path).

**Tre livelli**
1. **pgTAP** (`supabase test db`): policy e funzioni (`can_view`) a livello SQL, ruoli `anon`/`authenticated` con `request.jwt.claims` simulati. Verifica anche che nessuna tabella in `public` abbia RLS disattivata (test di sistema che fallisce se ne compare una nuova).
2. **Test via API reale** (Deno, `supabase-js` e `fetch` verso PostgREST/Storage/Realtime locali con JWT veri di utenti di prova): accesso diretto con anon key, con token di altri utenti, tentativi di bypass (filtri `select=*`, embed di relazioni, RPC, canali Realtime).
3. **Edge Function**: test di ogni funzione con token assente/scaduto/di altro utente, consenso AI mancante, permesso revocato, input malformato, rate limit, invito scaduto/già usato; verifica che non filtrino mai contesto non autorizzato nel prompt (il prompt costruito è ispezionabile nei test) e che nessuna risposta contenga la service role.

**CI**: GitHub Actions esegue tutto a ogni push; il rilascio su Pages è bloccato se i test falliscono. Una scansione cerca segreti (`service_role`, `sk-ant`, chiave VAPID privata) nel frontend.

## 9. Collegamento 1:1 (prima versione)

Vincoli **nel database**, non solo nell'interfaccia:
- `partnerships(owner_id, partner_id, status)`; indici unici parziali: un solo collegamento `active` per `owner_id` **e** uno per `partner_id`; `CHECK (owner_id <> partner_id)`.
- Un account non può essere contemporaneamente Alessia in un legame e Phill in un altro (controllo con trigger sul ruolo in `profiles`).
- Un solo invito `pending` per Alessia; il riscatto (`accept-invite`, transazione) fallisce se uno dei due ha già un legame attivo.
- Scollegare imposta `status = ended`, revoca tutti i permessi; ricollegarsi richiede un nuovo invito.
- Coperto dai test di §8 (doppio riscatto concorrente incluso).

## 10. GitHub Pages: percorso base, manifest, service worker

Pagina "di progetto": `https://<utente>.github.io/<repo>/`. Il sito vive sotto un sottopercorso, quindi:
- **Tutti i percorsi relativi** o derivati da un'unica costante `BASE_PATH` in `js/config.js` (nessun `/` iniziale). Il nome del repository va deciso ora (case sensitive) perché entra in `scope`.
- **Manifest**: `"start_url": "./?source=pwa"`, `"scope": "./"`, `"id": "./"`, `display: standalone`, icone 192/512 + maskable, `theme_color`/`background_color` coerenti con la palette; icone e `apple-touch-icon` 180×180 (iOS), meta `apple-mobile-web-app-capable`, immagini di avvio.
- **Service worker** in `sw.js` alla radice del sito (così `scope` = sottopercorso): `register('./sw.js', {scope: './'})`; cache versionata con precache dell'app shell, strategia stale-while-revalidate per statici, **mai in cache** chiamate Supabase/Auth/Edge; aggiornamento controllato con avviso "nuova versione".
- Hash routing (già scelto) evita 404 sui refresh; aggiungere `404.html` come rete di sicurezza.
- Deploy tramite GitHub Actions (artifact Pages) dopo i test; file `.nojekyll`.
- URL di redirect dell'Auth Supabase (Site URL + Redirect URLs) = URL esatto di Pages; più `http://localhost` per lo sviluppo.
- Verifica: installazione su iPhone reale, avvio da icona, modalità aereo, aggiornamento del SW.

## 11. Immagini degli esercizi: licenze e provenienza

Regola: **solo materiale di cui è documentata la licenza**; niente immagini prese da siti commerciali, app o risultati di ricerca.
- Fonti ammesse: (a) opere create da te o da persona che ti ceda per iscritto i diritti; (b) materiale con licenza che consente uso e modifica (CC0 / pubblico dominio, oppure CC BY / CC BY-SA con attribuzione — da valutare caso per caso, la SA impone condizioni sulle derivate); (c) illustrazioni commissionate o acquistate con licenza che copra uso in app web; (d) immagini generate da te con strumenti la cui licenza d'uso commerciale/personale sia chiara.
- Le licenze **non le do per scontate**: per ogni candidato (inclusi dataset aperti o Wikimedia Commons) verifico la pagina della licenza al momento della scelta e la registro.
- Registro obbligatorio `docs/ASSET_LICENSES.md` (una riga per immagine): file, esercizio, autore, fonte/URL, licenza e versione, data verifica, attribuzione richiesta, modifiche fatte. Pagina "Crediti" nell'app per le attribuzioni.
- Un controllo CI fallisce se in `assets/exercises/` c'è un'immagine senza voce nel registro.
- Catalogo iniziale piccolo (decina di esercizi base) per non bloccare lo sviluppo; segnaposto neutri finché le immagini non sono approvate.
- Poiché Alessia è l'unica utente iniziale, il rischio è soprattutto di diritti d'autore: meglio pochi esercizi ben documentati.

## 12. Cosa devi preparare (nulla è stato creato né inventato)

**GitHub**
- Un account GitHub (il tuo o un'organizzazione) e il suo username.
- Un repository, nome da decidere (consiglio `ALE`; il nome fa parte dell'URL). Pubblico per usare Pages gratis; il codice non conterrà segreti. Se vuoi il repo privato, Pages richiede un piano a pagamento.
- Autenticazione per il push da questo PC: `gh auth login` (lo esegui tu) oppure un token personale. Non incollarlo in chat.
- In Settings → Pages: sorgente "GitHub Actions". In Settings → Secrets: li inseriamo più avanti (vedi sotto).

**Supabase**
- Un account su supabase.com e un'organizzazione.
- Un progetto (nome es. `ale`), password del database scelta e conservata da te, regione UE (es. Francoforte) per la privacy.
- Dalla dashboard, a tempo debito: Project URL e chiave pubblica `anon`/publishable (finiscono nel frontend, sono pubbliche). **Non** servono a me `service_role`, password DB né token personali in chat.
- Supabase CLI e Docker Desktop installati sul PC (per stack locale e test). Verificherò cosa è già installato.
- Per collegare la CLI al progetto serve un access token Supabase: lo crei tu e lo inserisci nel terminale/ambiente, non in chat.

**Anthropic**
- Account su console.anthropic.com, organizzazione con metodo di pagamento e **limite di spesa mensile** impostato.
- Una API key dedicata a questo progetto (nome es. `ale-prod`), che inserisci tu come secret Supabase con `supabase secrets set ANTHROPIC_API_KEY=...` dal tuo terminale. Mai nel repository né nel frontend.
- Decisione su quali modelli usare (la scelta finale la facciamo alla Fase 4 guardando costi e qualità).

**Altro**
- Chiavi VAPID per le push: le generiamo insieme in Fase 6 con uno strumento standard; la privata va nei secrets Supabase.
- Due indirizzi email reali per gli account di test/produzione (Alessia, Phill); in sviluppo useremo account di prova locali.
- Un iPhone con iOS ≥ 16.4 per i test push.

## 13. FASE 0 — Dettaglio (in attesa di conferma)

Obiettivo: ambiente pronto, pipeline funzionante, pagina vuota "ALE." pubblicata come PWA minima. Nessun dato utente.

| # | Passo | Dove | Crea/modifica risorse esterne? |
|---|---|---|---|
| 0.1 | Verificare strumenti installati (git, Node, gh, Supabase CLI, Docker) e riportare cosa manca | Locale | No (sola lettura) |
| 0.2 | Creare struttura cartelle di §2, `.gitignore`, `.nojekyll`, `README`, `docs/` con registro licenze vuoto | Locale | No |
| 0.3 | `git init`, primo commit locale | Locale | No |
| 0.4 | Pagina minima: `index.html`, token CSS rosa/bianco, tema chiaro/scuro/sistema, logo tipografico "ALE.", `config.js` con `BASE_PATH` e **segnaposto** per URL/anon key (vuoti) | Locale | No |
| 0.5 | Manifest, `sw.js` minimale, icone segnaposto, 404.html; test in locale servendo sotto un sottopercorso (`/ALE/`) per simulare Pages | Locale | No |
| 0.6 | `supabase init` e stack locale (`supabase start`), prima migrazione vuota con test di sistema "RLS attiva su ogni tabella" | Locale (Docker) | No |
| 0.7 | Workflow GitHub Actions: test + deploy Pages + scansione segreti | Locale (file) | No finché non viene fatto push |
| **— CONFERMA RICHIESTA —** | | | |
| 0.8 | Creare il repository GitHub e fare il push | GitHub | **Sì** |
| 0.9 | Abilitare Pages (sorgente Actions) e verificare la pubblicazione | GitHub | **Sì** |
| 0.10 | Collegare la CLI al progetto Supabase già creato da te (`supabase link`), impostare Site URL/Redirect URLs | Supabase | **Sì** |
| 0.11 | Inserire `Project URL` e chiave `anon` in `config.js` (da te forniti) | Locale + push | Sì (push) |

**Criteri di completamento Fase 0**: la pagina si apre da `https://<utente>.github.io/<repo>/`, è installabile su iPhone con icona e schermata a tutto schermo, funziona offline con la shell minima, la CI è verde, nessuna chiave segreta nel repository, lo stack locale parte e il test di sistema RLS passa.

**Proposta di esecuzione**: eseguo subito i passi 0.1–0.7 (solo locali, nessuna risorsa esterna) e mi fermo prima di 0.8 aspettando che tu abbia preparato gli account di §12 e mi confermi nome del repository e username GitHub.

## 14. Decisioni ancora da prendere

- Nome del repository e username/organizzazione GitHub (impatta `scope` e URL).
- Repository pubblico o privato (Pages gratuito solo con pubblico).
- Regione Supabase (consigliata UE).
- Fonte e licenza delle prime immagini (puoi decidere dopo la Fase 0).


## 15. Stato avanzamento

- **Fase 0** — completata (repository, Pages, CI, Supabase locale e remoto).
- **Fase 1 (account e collegamento)** — completata il 26/11/2026: registrazione/login/logout/recupero password,
  profili Alessia e Phill, nome e foto, inviti con scadenza, collegamento 1:1 transazionale, rotte protette,
  prime dashboard, test pgTAP + API + unitari. Dettagli in `docs/SUPABASE_COLLEGAMENTO.md`.
  Nota: nel piano originale questa era la "Fase 2 — Account"; la numerazione è stata ricalibrata dopo la Fase 0.
- **Fase 2 (database applicativo, condivisione e privacy)** — completata il 27/11/2026: `sharing_permissions` con 7 categorie,
  24 tabelle con RLS forzata, diario a due chiavi, nota di benessere mai condivisibile, proposte e messaggi come unici canali
  di scrittura di Phill, consenso AI disattivato di default, esportazione dati ed eliminazione account senza dati orfani.
  Dettagli in `docs/PRIVACY.md`.
- **Non ancora fatto (volutamente):** interfaccia di diario, attività, calendario, benessere, abitudini, messaggi; Edge Function;
  AI; push; SMTP (Resend, prima dell'onboarding reale di Alessia).

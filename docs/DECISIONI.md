# Decisioni approvate e verifica di rispetto

Fonte: specifica di progetto (documento "ALE. — Specifica funzionale e tecnica" v1.0) e istruzioni successive.
Questa lista è il riferimento per non violare decisioni già prese. Aggiornata all'inizio della Fase 2 (26/11/2026).

## Prodotto
| Decisione | Stato |
|---|---|
| Nessuna pressione: niente classifiche, niente calorie/peso come obiettivo, niente giudizi sul corpo | `progress_records.kind` non ammette peso/misure; nessuna classifica nel modello dati |
| Abitudini sia predefinite sia personalizzate | `habits.preset_key` (predefinita) o libera |
| Logo tipografico "ALE." con punto rosa | fatto (Fase 0/1) |
| Push solo per messaggi di Phill, proposte, motivazione mattutina | tabelle `push_subscriptions`, `notifications`; invio in fase successiva |
| Onboarding saltabile e riprendibile dal Profilo | `ai_preferences` e inventario sono opzionali, nessun vincolo di completamento |
| Collegamento 1:1, un solo attivo per account | vincoli nel database (Fase 1), esteso alla Fase 2 (revoca di tutto alla fine) |
| Le proposte di Phill non sono obbligatorie; Alessia accetta/modifica/rifiuta | `workout_proposals` e `calendar_events.status = 'proposed'`: solo Alessia le decide |
| Il calendario non è uno strumento di controllo | Phill vede solo eventi *confermati* e solo se Alessia condivide `calendar` |

## Privacy e sicurezza
| Decisione | Stato |
|---|---|
| Il collegamento non dà accesso automatico ai dati | `can_view()` richiede un permesso esplicito per categoria; default: nessun permesso |
| Diario privato per impostazione predefinita | categoria `journal` + flag per singola voce (due chiavi) |
| Benessere privato per impostazione predefinita | categoria `wellbeing`; la nota libera è in una tabella separata, mai condivisibile |
| Condivisione revocabile in qualsiasi momento, effetto immediato | `revoked_at`; `can_view()` controlla anche che il collegamento sia attivo |
| RLS su ogni tabella; il database nega l'accesso, non solo l'interfaccia | RLS forzata su tutte le tabelle, verificata da test di sistema |
| Nessuna chiave segreta nel frontend | test automatici sui file tracciati |
| Consenso esplicito per l'AI; AI disattivabile; revocabile | `ai_preferences` (tutto disattivato di default) |
| Possibilità di eliminare l'account, senza dati orfani | `delete_my_account()` + test sul catalogo del database |
| Piano gratuito, nessun servizio a pagamento | invariato |
| SMTP rimandato (Mailpit in locale); prima dell'onboarding reale di Alessia: Resend gratuito con dominio verificato | rimandato; nessuna modifica alle impostazioni email remote |

## Fuori ambito della Fase 2 (non iniziato)
Interfaccia di calendario, allenamenti, diario, benessere, abitudini, messaggi; Edge Function; AI; push.

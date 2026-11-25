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

## Fase 3 — ambito e interpretazioni (27/11/2026)
Richiesto e fatto: Home di Alessia (saluto dinamico, biglietti di Phill), navigazione a cinque sezioni, Profilo con
impostazioni/benessere/progressi/attrezzatura/privacy, Home e dashboard di Phill, biglietti (crea/modifica/elimina/storico),
messaggi immediati e programmati con invio server-side, temi chiaro/scuro/sistema.

Interpretazioni da confermare (la specifica non le dice esplicitamente):
| Tema | Scelta fatta | Perché |
|---|---|---|
| Stato di lettura | privato di Alessia; Phill non lo vede mai | "motivare senza mettere pressione" |
| Firma del biglietto | «Da <nome visualizzato>» (spec: «Da Phill») | coerente con il nome scelto da Phill |
| Modifica/eliminazione | Phill può modificare/eliminare anche biglietti già inviati | richiesto "modifica, eliminazione, storico" |
| Alessia può nascondere un biglietto | sì, dalla propria vista; non cancella la cronologia di Phill | "Ale deve poter controllare i propri dati" |
| Navigazione di Phill | Home, Messaggi, Profilo (dashboard separata, non le 5 sezioni) | spec §16: dashboard dedicata |
| Sezioni Attività/Calendario/Diario | presenti in navigazione come pagine "sta arrivando", senza dati finti | spec §4: cinque sezioni; funzioni non in questa fase |
| Progressi | andamento di umore/energia e conquiste (vuote finché non esistono le fonti) | nessun peso/misure, nessuna classifica |
| Attrezzatura | elenco con nome, note e "preferisco non usarlo" (l'onboarding guidato da Claude è Fase 4) | spec §7 |
| AI nelle impostazioni | non mostrata (non esiste ancora la funzione da consentire) | il consenso va chiesto quando serve |
| Proposte di Phill (schede/eventi) | non in questa fase | non nelle priorità |

## Fuori ambito (non iniziato)
Interfaccia di calendario, allenamenti, diario, abitudini; proposte di Phill; Edge Function; AI; push; tempo reale; SMTP.

# Modello di privacy e autorizzazioni (Fase 2)

Il database è la linea di difesa: ogni regola qui sotto è imposta da RLS, privilegi per colonna, vincoli e trigger,
e verificata da test (pgTAP e API reali). Nascondere qualcosa nell'interfaccia non conta.

## Principi
1. **Il collegamento non dà accesso a nulla.** Alessia e Phill collegati vedono solo i rispettivi profili (nome, foto, ruolo).
2. **Condivisione esplicita, per categoria, revocabile.** Il proprietario dei dati concede o revoca una categoria con
   `set_sharing(categoria, true|false)`; `revoke_all_sharing()` è l'interruttore generale. La revoca ha effetto immediato.
3. **Privato per impostazione predefinita.** Dopo il collegamento non esiste alcun permesso. Diario e benessere hanno
   protezioni aggiuntive (sotto).
4. **Phill non scrive mai nei dati di Alessia.** Ha solo due canali: *proposte* (schede, eventi) e *messaggi*.
   Decide sempre la destinataria.
5. **Nessuna scrittura diretta su permessi, inviti, collegamento, notifiche, storico AI**: solo funzioni del database o il server.

## Categorie condivisibili
| Categoria | Tabelle coperte | Note |
|---|---|---|
| `activities` | workouts, workout_exercises, workout_sessions, session_exercise_progress | |
| `habits` | habits, habit_logs | |
| `calendar` | calendar_events | solo eventi **confermati**; mai le note private di altri |
| `progress` | progress_records | solo crescita personale: mai peso/misure, nessuna classifica |
| `equipment` | equipment | |
| `wellbeing` | wellbeing_logs | **solo umore ed energia**. La nota libera (`wellbeing_notes`) non è condivisibile |
| `journal` | journal_entries | **due chiavi**: categoria condivisa **e** singola voce marcata `shared_with_partner` |

Mai condivisibili: `wellbeing_notes`, `ai_preferences`, `ai_generations`, `push_subscriptions`, `notifications`,
`scheduled_messages` (la destinataria non vede ciò che è in programma: resta una sorpresa).

## Chi vede cosa (dati di Alessia)
| | Alessia | Phill collegato | Phill con categoria condivisa | Estraneo | Anonimo |
|---|---|---|---|---|---|
| Dati di una categoria | sì | no | sì (solo quella) | no | no |
| Diario | sì | no | solo voci marcate | no | no |
| Nota di benessere | sì | no | **mai** | no | no |
| Proposte che ha fatto Phill | sì | sì (le sue) | sì (le sue) | no | no |
| Messaggi | sì | sì (scambiati con lei) | idem | no | no |

## Ciclo di vita
- **Fine del collegamento** (qualsiasi dei due): in un'unica transazione si revocano i permessi, si azzerano i consensi
  per singola voce di diario, si ritirano le proposte in attesa e si annullano i messaggi programmati. Un nuovo partner —
  anche lo stesso Phill — non eredita nulla: serve una nuova condivisione.
- **Esportazione** (`export_my_data()`): restituisce tutti i propri dati (23 tabelle), senza `code_hash` né chiavi push,
  e senza contenuti altrui.
- **Eliminazione account** (`delete_my_account('ELIMINA ACCOUNT')`):
  - richiede conferma testuale e **password inserita negli ultimi 5 minuti** (letta dal token; resiste al rinnovo);
  - rifiuta se restano file in Storage (vanno cancellati prima via API: nessun file orfano);
  - elimina `auth.users`; tutto il resto segue a cascata: profilo, dati, permessi, messaggi (anche quelli scambiati con
    il partner: la conversazione sparisce per entrambi), notifiche, iscrizioni push, collegamento, inviti.
  - Un evento che Phill ha proposto e Alessia ha accettato **resta ad Alessia** (autore nullo).
  - Il test sul catalogo verifica 0 riferimenti rimasti in ogni tabella; una futura tabella con una colonna "persona"
    senza chiave esterna fa fallire i test.

## Consenso AI
Tutto **disattivato** di default (`ai_preferences`). Il consenso è registrato dal server con data; disattivare l'AI
spegne ogni consenso specifico e azzera la data. Le funzioni AI (fase successiva) leggeranno solo ciò che è consentito.

## Limiti noti e cose da sapere
- **Amministratori della piattaforma.** Il proprietario del progetto Supabase e chi ha la service role possono leggere
  il database: la privacy qui descritta è verso gli altri utenti dell'app, non verso chi la amministra.
- **Backup.** Sul piano Free non sono previsti backup automatici scaricabili; se in futuro si attivano, i dati eliminati
  restano nei backup fino alla loro scadenza.
- **Metadati visibili al partner.** Nome visualizzato, foto e ruolo; la data di inizio del collegamento.
- **Informativa privacy e consensi** per gli utenti finali: da scrivere prima dell'onboarding reale di Alessia.
- **Registrazione aperta:** da chiudere dopo la registrazione dei due account (vedi `docs/SUPABASE_COLLEGAMENTO.md`).

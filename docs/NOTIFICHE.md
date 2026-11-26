# Notifiche

## Dentro l'app (sempre attive)
Tabella `notifications`, creata solo dal database (`notify()`), nel rispetto di `notification_preferences` (biglietti, proposte, promemoria,
motivazione del mattino). Si generano per: nuovo biglietto, proposta di Phill, esito delle proposte, promemoria in scadenza.

## Invii pianificati lato server (senza browser aperto)
`pg_cron` esegue ogni minuto:
1. `dispatch_due_scheduled_messages()` — consegna i biglietti programmati (immutabili dopo l'invio);
2. `generate_due_notifications()` — crea la notifica dei promemoria in scadenza (una sola volta);
3. `call_push_dispatch()` — chiama via `pg_net` l'Edge Function `push-dispatch` con il segreto `CRON_SECRET`.

`push-dispatch` crea la **motivazione del mattino** (all'orario scelto da Alessia, una volta al giorno; con Claude solo se Alessia ha dato il
consenso, altrimenti un pensiero preparato a mano) e invia le notifiche in attesa come **Web Push** ai dispositivi iscritti.

## Web Push
- Funziona dove il browser lo supporta (Chrome/Edge/Firefox; su iPhone solo dopo aver aggiunto l'app alla Home, iOS 16.4+).
- La chiave pubblica VAPID è in `js/config.js`; la chiave privata sta **solo** nei segreti del server (`VAPID_PRIVATE_KEY`).
- Ognuno gestisce i propri dispositivi da Profilo → Impostazioni. I dispositivi scaduti (404/410) vengono rimossi.
- Se `VAPID_PRIVATE_KEY` non è configurata il push **non parte** e `push-dispatch` lo dichiara (`push: not_configured`); le notifiche in app restano.

## Configurazione sul progetto remoto (una tantum)
Segreti delle Edge Functions: `CRON_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (+ `ANTHROPIC_API_KEY`, vedi `docs/AI.md`).
Righe in `internal_config` (solo `service_role`): `functions_url` (`https://<ref>.supabase.co/functions/v1`) e `cron_secret` (stesso valore).
Finché mancano, il job non fa nulla.

## Limiti
Il piano gratuito di Supabase ha limiti di invocazioni e può mettere in pausa i progetti inattivi: in pausa, gli invii si fermano.

## Controllo automatico dell'integrità (a ogni apertura e ogni ritorno in primo piano)
`js/core/push-health.js` verifica l'intera catena, non solo `Notification.permission`: supporto del dispositivo, permesso, service worker registrato, sottoscrizione push presente e valida (stessa chiave VAPID), presenza e corrispondenza dell'endpoint su Supabase. Mai `localStorage` per decidere.
- **Ripristino automatico** (senza gesto dell'utente) se il permesso è già concesso: registra il service worker, ricrea la sottoscrizione con la VAPID pubblica, aggiorna Supabase senza duplicati e cancella dal server solo il vecchio endpoint noto.
- **Popup** (coerente con ALE.) solo se serve Alessia: permesso da riattivare (chiede quello nativo con un tocco), permesso negato (spiega come riattivarlo da Impostazioni; non si aggira), ripristino fallito, app da installare su iPhone. Con tutto a posto, o se le notifiche non sono mai state attivate, **nessun popup**.
- Limite di una verifica ogni 20 secondi, mai due insieme; «Più tardi» silenzia 24 ore.
- Testato con scenari **simulati** (cache e dati locali cancellati, service worker assente, sottoscrizione mancante o con chiave diversa, riga Supabase mancante, permesso revocato o concesso dopo il ritorno, errore di `subscribe`, tutto ok). **Da verificare su iPhone reale**: permesso nativo, `applicationServerKey` in Safari, comportamento dopo cancellazione dei dati del sito, consegna effettiva.

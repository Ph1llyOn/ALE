# Accesso privato (ALE / PHILL) — senza email né password

La prima schermata chiede «Chi sta utilizzando l'app?» con due carte: **ALE 💗** (Alessia) e **PHILL**. Non esistono email, password,
registrazione, recupero password o inviti.

## Come funziona
- Le due identità sono utenti Supabase fissi (`alessia@ale-app.local`, `phill@ale-app.local`), creati **solo** dalla Edge Function `access`
  la prima volta che un profilo viene "configurato". Il client non può registrare nessuno (le registrazioni pubbliche vanno disattivate sul
  progetto remoto, vedi `docs/SUPABASE_COLLEGAMENTO.md`).
- Alla prima configurazione si sceglie il nome e un **PIN di 6 cifre**. Il PIN è salvato solo come hash PBKDF2-SHA256 (150.000 iterazioni, sale
  casuale) in `access_pins`, tabella non leggibile dal client (RLS deny-all).
- Sullo stesso dispositivo la sessione resta salvata (supabase-js): il PIN serve **solo su un dispositivo nuovo**.
- Il PIN sbagliato blocca progressivamente i tentativi; il confronto è a tempo costante.
- Con il PIN corretto la funzione genera un link magico lato server (`auth.admin.generateLink`) e lo scambia con una sessione vera
  (`verifyOtp`): da lì in poi vale la RLS di sempre. Nessuna email viene inviata.
- Quando entrambi i profili sono configurati, il collegamento 1:1 nasce da solo.
- Opzionale: se sul server esiste il segreto `ALE_SETUP_CODE`, la prima configurazione di un profilo richiede quel codice (evita che uno
  sconosciuto configuri per primo un profilo vuoto sul sito pubblico). **Consigliato prima dell'uso reale.**

## Cosa non è possibile
- Impersonare l'altro profilo modificando le richieste: il ruolo dipende dall'utente autenticato, non dai parametri; PIN sbagliato, JWT
  falsificato e parametri aggiuntivi vengono rifiutati (test in `tests/api/access.test.mjs`).
- Leggere `access_pins` o `internal_config` dal client.

## Limiti onesti
Un PIN a 6 cifre è un'autenticazione leggera, adatta a un'app personale su dispositivi propri, non a dati ad alto rischio. Chi conosce il PIN e
l'indirizzo del sito può entrare da un nuovo dispositivo: non condividerlo e, se serve, cambialo dalle Impostazioni.

# Tutorial iniziale (27/11/2026)

**Per chi:** solo Alessia. Phill non lo riceve mai (la rotta è riservata al ruolo `alessia` e la Home di Phill non lo propone).

**Dove:** `#/tutorial` (js/features/tutorial/tutorial.js), a schermo intero, senza barra di navigazione.

**Quando appare:** alla prima Home di Alessia, quando `user_settings.app_tour_status` è vuoto. Il primo avvio prima chiede la configurazione guidata (`#/benvenuta`), poi arriva il tutorial.

**Stato salvato sull'account** (migrazione `20261203000000_app_tour.sql`, colonne `app_tour_status`, `app_tour_step`, `app_tour_at`):
- `in_progress` + passo: uscita a metà («Esci e riprendi dopo»). La Home mostra un avviso per riprenderlo.
- `skipped`: saltato con «Salta il tutorial». Non riappare da sé, si può rivedere dal Profilo.
- `done`: completato con «Iniziamo». Non riappare mai più da sé (aggiornamenti, logout/login, altri dispositivi).
- Rivisitazione dal Profilo (`#/tutorial?replay=1`): parte dall'inizio e non cambia lo stato salvato.

**Sicurezza:** nessuna modifica a RLS o autenticazione; la migrazione aggiunge solo colonne e i relativi grant di aggiornamento. Test: `supabase/tests/081_app_tour.test.sql`, `tests/api/tour.test.mjs`, `tests/unit/tutorial.test.mjs`.

**Contenuti:** le funzioni descritte sono quelle reali. Il test `tutorial.test.mjs` controlla che ogni etichetta citata tra «» esista davvero nel codice dell'app, che non ci siano frasi di pressione e che i messaggi obbligatori (controllo dei dati, diario privato, proposte di Phill da approvare, riposo, AI facoltativa e Gemini di Google) siano presenti.

**Animazioni:** solo CSS (classi `tour-*` in css/screens.css), senza librerie; con `prefers-reduced-motion` restano statiche e il contenuto resta leggibile. Niente `style` inline, per la CSP `style-src 'self'`.

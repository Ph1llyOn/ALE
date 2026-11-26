# Dati, copie di sicurezza e ripristino

## Cosa viene conservato e per quanto
- Dati di Alessia (diario, benessere, attività, calendario, progressi, impostazioni): finché non li elimina o non elimina l'account.
- Biglietti: immutabili; eliminando l'account sparisce l'intera conversazione per entrambi.
- `ai_generations` (testi generati dall'AI): **90 giorni**, poi cancellazione notturna automatica.
- Presso Google (Gemini): valgono le condizioni di Google, non verificabili da qui (vedi `docs/AI.md`).

## Esportazione
Dalla schermata Privacy (Profilo → Privacy) Alessia può esportare i propri dati in JSON. Non esiste una funzione di importazione/ripristino nell'app.

## Copie di sicurezza di Supabase
- La documentazione sul piano Free è contraddittoria: **non si deve dare per attivo alcun backup automatico né il ripristino a un istante** (PITR). Il piano gratuito mette inoltre in pausa il progetto dopo un periodo di inattività.
- Strategia affidabile: copia manuale periodica dei dati, da un terminale con `supabase` collegato al progetto:
  `npx supabase db dump --linked --data-only --schema public -f backup-dati.sql`
  (il file contiene dati personali: conservarlo in un luogo privato, non nel repository).
- Il ripristino da una copia **non è stato provato su dati reali** (non si fanno operazioni distruttive per simularlo); va provato su un progetto di prova prima di fidarsene.

## Connessione assente e modifiche non sincronizzate
L'app non ha una coda di scritture offline: se la rete manca al momento del salvataggio compare un errore e il testo resta nel campo; l'interfaccia è letta dal database, quindi non mostra come salvato ciò che non lo è. Da verificare su un dispositivo reale.

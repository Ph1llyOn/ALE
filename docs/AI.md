# Assistente AI nell'app

**Disattivato per impostazione predefinita.** Alessia lo attiva da Profilo → Impostazioni e sceglie cosa far vedere a Claude (attrezzatura,
benessere, diario). Revocando il consenso, ogni consenso specifico si spegne.

## Cosa fa
Motivazione del mattino, scheda di allenamento (solo esercizi del catalogo compatibili con attrezzatura e spazio), riflessione sugli ultimi
giorni, idee per promemoria non insistenti. Adatta il tono senza inventare emozioni e rispetta le indicazioni del professionista scritte da
Alessia. Niente diete, diagnosi, obiettivi di peso, giudizi sul corpo.

## Dove gira
Solo nelle Edge Function `ai` e `push-dispatch`. La chiave del modello non è mai nel frontend né nel repository.

## Pipeline di sicurezza
1. Contesto minimo e autorizzato (mai le note di benessere, mai i dati di Phill); i testi dell'utente stanno tra `<dati>…</dati>` contro il prompt injection.
2. Risposta JSON validata a schema; controlli strutturali (link, email, telefoni, markup, emoji, lingua).
3. **Controllo semantico indipendente** (secondo passaggio a Claude, fail-closed): se il testo non è chiaramente consentito, non esce.
4. Una sola rigenerazione con le violazioni come feedback; poi un messaggio di ripiego preparato a mano. Il testo vietato non viene conservato.
5. Massimo 12 generazioni nelle 24 ore, una motivazione al giorno, storico privato (`ai_generations`, non scrivibile dal client).

## Modello e stato (aggiornato 27/11/2026)
- **Modello attivo: Gemini (Google), `gemini-3.1-flash-lite`**, scelto dal proprietario. Segreti delle Edge Functions: `GEMINI_API_KEY` e `GEMINI_MODEL`. Il codice supporta anche Claude (`ANTHROPIC_API_KEY`): se ci sono entrambe le chiavi vince Gemini (`supabase/functions/_shared/llm.js`). La chiave Anthropic fornita in precedenza è stata rimossa dai segreti (l'account non aveva crediti).
- La chiave viaggia solo nell'intestazione `x-goog-api-key`, mai nell'URL né nei log, e solo dal server.
- **Privacy**: con un piano gratuito Google può usare i contenuti inviati per migliorare i propri prodotti. L'AI riceve solo ciò che Alessia ha consentito (umore, energia, estratti del diario, attrezzatura); le note di benessere, i feedback, lo storico e i dati di Phill non vengono mai inviati. Alessia può disattivare l'AI o togliere ogni consenso in ogni momento. Se si preferisce evitare del tutto questo rischio: rimuovere `GEMINI_API_KEY` (l'app resta completa con il motore a regole).
- Verificato con chiamate reali (motivazione, riflessione, promemoria, sessione di allenamento: tutte passate dai controlli); i test automatici usano un finto server (`tests/api/mock-anthropic.mjs`, parla il protocollo Gemini e quello Anthropic).
- Per cambiare modello: `supabase secrets set GEMINI_MODEL=…`. Senza chiavi l'AI è spenta e l'app mostra il ripiego.

## Sessione di allenamento (aggiornato)
- Il tipo `plan` chiede una **sessione strutturata** (riscaldamento, parte principale, cardio facoltativo, defaticamento) scegliendo solo da un elenco di esercizi **già filtrato dalle regole** (attrezzi, limitazioni, livello, dolore recente), con fase, posizione e livello di ciascuno.
- Il server **ricontrolla tutto** (`validateSession` in `planner-core.js`): fase, nome, ripetizioni, durata e recupero vengono sempre dal catalogo; il modello decide solo quali esercizi, in che ordine e quante serie (entro i limiti). Una sequenza non coerente viene respinta e rigenerata una volta, poi si usa il **motore a regole** (stesso risultato di quando l'AI è spenta).
- Storico e feedback degli esercizi servono solo a queste regole: **non vengono mai inviati al modello**.
- Senza `ANTHROPIC_API_KEY` il motore a regole è l'unico generatore: l'app funziona per intero (suggerimento di oggi, piano settimanale, sessioni).

## Audit dell'integrazione Gemini (27/11/2026)
- **Dati inviati al modello** (solo con consenso generale): nome di battesimo, momento della giornata, preferenza «senza attrezzi», conteggi degli ultimi 7 giorni. Con consensi specifici: nomi degli attrezzi · numeri di umore ed energia · fino a 3 estratti di diario di 300 caratteri (anche di voci private). **Mai**: note di benessere, feedback e storico degli esercizi, dati di Phill, identificativi, e — dopo l'audit — **le note libere (indicazioni del professionista, limitazioni, spazi)**: potevano contenere dati sulla salute; al modello si dice solo che esistono. Il rispetto delle limitazioni è garantito dalle regole del server, non dal prompt.
- **Condizioni di Google (da verificare da chi gestisce la chiave)**: secondo le «Gemini API Additional Terms» (versioni 2025, da ricontrollare), con i servizi *senza pagamento* Google può usare contenuti e risposte per migliorare i suoi prodotti, con revisione umana anche di ingressi e uscite, e sconsiglia di inviare informazioni sensibili o personali; per gli utenti nello SEE/Svizzera/Regno Unito è richiesto l'uso dei soli *servizi a pagamento* (con fatturazione attiva nel progetto Cloud, i dati non servono ad addestrare). **Non è stato possibile verificare se la chiave in uso appartiene a un progetto con fatturazione attiva**: finché non lo si sa, il consenso al diario e all'umore non andrebbe attivato, e Alessia (in Italia) rientra nel caso SEE. Fonte: https://ai.google.dev/gemini-api/terms
- **Conservazione**: sul nostro database i testi generati restano in \`ai_generations\` (storico privato, mai visibile a Phill). **Cancellazione automatica dopo 90 giorni** (migrazione `20261202000000_ai_retention.sql`: funzione `purge_old_ai_generations()` eseguita ogni notte alle 03:30 da pg_cron, senza permessi per gli utenti). Cancella solo `ai_generations` più vecchie di 90 giorni: diario, allenamenti, progressi, calendario non vengono toccati; il pensiero del giorno viene riletto solo per oggi e per evitare ripetizioni (ultimi 6), quindi 90 giorni non compromettono nulla. Test pgTAP `080_ai_retention`. Presso Google valgono le sue condizioni.
- **Robustezza**: timeout del modello 15 s; la Home aspetta al massimo 6 s e poi mostra il pensiero preparato a mano (il server finisce comunque e salva la risposta per la volta dopo); errori HTTP, quota, JSON rotto, controllo che non risponde → ripiego. Una generazione = 1 chiamata di scrittura + 1 di controllo (massimo 4 con una rigenerazione); il pensiero del giorno già generato non richiama il modello.
- **Schermate**: il pensiero del giorno (Home) e la riflessione (Progressi) mostrano le risposte AI con l'etichetta di origine. La scheda AI non ha una schermata che la usi (la scheda del giorno usa il motore a regole). L'interruttore «Suggerisci promemoria» è stato **rimosso** perché non aveva alcun effetto; l'endpoint resta lato server.

## Personalizzazione in base all'umore (27/11/2026)
Lo stato del giorno si ricava **solo** da umore ed energia (1–5) che Alessia ha indicato oggi o ieri **e** solo con il consenso «umore ed energia»; altrimenti è «neutro» (tono positivo, nessuna emozione inventata). Stati: felice, tranquilla, così così, giù, poca energia, stanca ma soddisfatta.
- Ogni stato ha una guida di comportamento nel prompt (contenuto, tono, tipo di motivazione): con «giù» si accoglie, senza «non mollare» né obiettivi; con poca energia si ridimensiona; da stanca ma soddisfatta si riconosce quanto fatto senza proporre altro; da felice ci si complimenta con naturalezza. Il riposo non è mai presentato come un fallimento.
- Il controllore indipendente ha la categoria `tone_mismatch` (testo incoerente con lo stato → scartato).
- Variabilità: stile a rotazione (breve, riflessione, incoraggiamento, carezza; mai incoraggiamento negli stati delicati) e gli ultimi messaggi vengono mostrati al modello per non ripeterli.
- Frequenza invariata: un pensiero al giorno; si riscrive **una sola volta** se lo stato cambia (o se il primo era di ripiego e sono passati 30 minuti).
- Ripiego senza Gemini: 5 pensieri scritti a mano per ogni stato, riflessione coerente con i numeri reali, scheda leggera (mobilità) se lo stato è delicato. Test: `tests/unit/mood.test.mjs`, `tests/api/ai.test.mjs`.

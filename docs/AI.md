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

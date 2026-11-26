# Claude nell'app

**Disattivato per impostazione predefinita.** Alessia lo attiva da Profilo → Impostazioni e sceglie cosa far vedere a Claude (attrezzatura,
benessere, diario). Revocando il consenso, ogni consenso specifico si spegne.

## Cosa fa
Motivazione del mattino, scheda di allenamento (solo esercizi del catalogo compatibili con attrezzatura e spazio), riflessione sugli ultimi
giorni, idee per promemoria non insistenti. Adatta il tono senza inventare emozioni e rispetta le indicazioni del professionista scritte da
Alessia. Niente diete, diagnosi, obiettivi di peso, giudizi sul corpo.

## Dove gira
Solo nelle Edge Function `ai` e `push-dispatch`. La chiave `ANTHROPIC_API_KEY` non è mai nel frontend né nel repository.

## Pipeline di sicurezza
1. Contesto minimo e autorizzato (mai le note di benessere, mai i dati di Phill); i testi dell'utente stanno tra `<dati>…</dati>` contro il prompt injection.
2. Risposta JSON validata a schema; controlli strutturali (link, email, telefoni, markup, emoji, lingua).
3. **Controllo semantico indipendente** (secondo passaggio a Claude, fail-closed): se il testo non è chiaramente consentito, non esce.
4. Una sola rigenerazione con le violazioni come feedback; poi un messaggio di ripiego preparato a mano. Il testo vietato non viene conservato.
5. Massimo 12 generazioni nelle 24 ore, una motivazione al giorno, storico privato (`ai_generations`, non scrivibile dal client).

## Stato e costi
- **Senza `ANTHROPIC_API_KEY` l'app non usa Claude**: mostra i messaggi di ripiego e lo dichiara nell'interfaccia. Le chiamate all'API Anthropic sono
  a consumo e **non sono state attivate né finanziate**: serve una chiave creata e finanziata da te.
- Per attivarla: `supabase secrets set ANTHROPIC_API_KEY=… ANTHROPIC_MODEL=…` (progetto remoto). Nessun'altra modifica.
- I test usano un finto server Anthropic locale (`tests/api/mock-anthropic.mjs`): verificano il comportamento, non la qualità del modello reale.

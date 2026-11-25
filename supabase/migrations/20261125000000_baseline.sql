-- ALE. — migrazione baseline (Fase 0).
-- Nessuna tabella ancora: le tabelle arrivano dalla Fase 2 e ognuna deve:
--   1) abilitare RLS nella stessa migrazione che la crea;
--   2) avere policy esplicite (nessuna policy = nessun accesso);
--   3) avere test in supabase/tests/ e nei test API (tests/api).
-- Il test 000_rls_enabled.test.sql fallisce se una tabella in `public` ha RLS disattivata.

-- Difesa in profondità: di default i ruoli anon/authenticated non ottengono privilegi
-- sulle nuove tabelle create in `public`; vanno concessi esplicitamente, tabella per tabella.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;

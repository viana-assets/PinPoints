-- Rücknahme von Migration 43.
--
-- Es gibt nichts zurückzunehmen: Migration 43 entfernt ausschließlich Reste eines Entwurfs,
-- den es nicht mehr gibt. Sie wiederherzustellen hieße, die Geisterrichtlinien zurückzuholen,
-- die eine abgehakte Berechtigung wirkungslos machen.
--
-- Wer den Stand VOR der ganzen Rechteumstellung will, nimmt `42_rollback.sql` – die stellt
-- die Richtlinien aus Migration 16, 13/15 und 41 wieder her.
--
-- Diese Datei existiert nur, damit die Regel „zu jeder Migration ein Rücknahme-Skript" nicht
-- stillschweigend gebrochen wird. Sie tut absichtlich nichts.

select 'Migration 43 entfernt nur Altlasten und hat keine sinnvolle Rücknahme. Siehe 42_rollback.sql.' as hinweis;

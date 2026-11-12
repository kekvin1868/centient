-- Money you owe a person (their tab below 0) that you keep for now: the day you plan to return it. NULL = not kept.
-- Home shows a grey "Kept" strip before that day and a warning from it on.
ALTER TABLE accounts ADD COLUMN kept_until TEXT;

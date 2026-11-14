-- How many "Send a test" reminders each person has used (src/modules/push/service.ts caps it at PUSH_TESTS).
ALTER TABLE users ADD COLUMN push_tests INTEGER NOT NULL DEFAULT 0;

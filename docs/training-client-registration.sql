-- PREPARED ONLY. No writes performed. Execute in Horizonte only after specific authorization.
-- Set the psql variable public_key_pem to the PUBLIC Ed25519 SPKI PEM.
-- Without this explicit value, syntax fails instead of storing a placeholder as a key.
-- Intentionally no upsert: an existing client must be inspected instead of overwritten.
-- Client remains disabled until an explicitly approved activation.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '10s';
INSERT INTO "IntegrationClient" ("id", "publicKeyPem", "enabled", "allowedCourseIds", "createdAt")
VALUES ('flyimob', :'public_key_pem', false, ARRAY['cmv2etzu60000s90wahxoe74k'], CURRENT_TIMESTAMP);
COMMIT;
-- Separate, authorized activation after verifying the registered public key fingerprint:
-- UPDATE "IntegrationClient" SET enabled=true WHERE id='flyimob';

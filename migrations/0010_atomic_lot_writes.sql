-- Transaction-local receipt: guards every dependent write against a lost CAS.
-- Cleared before the batch commits; never returned by the public lot serializer.
ALTER TABLE lots ADD COLUMN mutation_id TEXT;

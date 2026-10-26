-- Preserve child sharing scopes, including concurrent parent changes.
CREATE TRIGGER governance_audience_guard BEFORE UPDATE ON governance_items WHEN OLD.audience!=NEW.audience AND EXISTS(SELECT 1 FROM governance_items c WHERE c.parent_id=OLD.id) BEGIN SELECT RAISE(ABORT,'governance_parent_changed'); END;

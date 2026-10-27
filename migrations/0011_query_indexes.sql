-- Access joins and yearly snapshots; additive indexes only.
CREATE INDEX IF NOT EXISTS lot_relations_lot_dates ON lot_relations(lot_id,valid_from,valid_until);
CREATE INDEX IF NOT EXISTS records_year_updated ON records(condominium_id,fiscal_year,updated_at DESC,id);
CREATE INDEX IF NOT EXISTS document_versions_record_state ON document_versions(record_id,state,created_at DESC,id);

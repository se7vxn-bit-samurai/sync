-- The Supabase performance advisor on sync-dev: harden_and_index replaced the (org_id, …) indexes on
-- reporting_lines and acting_assignments with person-first ones, which left org_id (a foreign key,
-- and the filter every org_snapshot uses) without a covering index.
create index if not exists reporting_lines_org_idx on core.reporting_lines (org_id);
create index if not exists acting_org_id_idx on core.acting_assignments (org_id);

-- SafeTracks Live GIS Layer — Supabase / PostGIS Migration 001
-- See docs/GIS-LAYER-DESIGN.md for full schema rationale.
-- Privacy invariants:
--   • geom in service_status / route_stops = census tract centroid ONLY
--   • supply levels categorical (well_stocked/low/out) — never exact counts
--   • no worker identity stored; participant_count_band revoked from anon
--   • DB trigger rejects any geom > 100m from TIGER/Line centroid

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---- service_providers ----
CREATE TABLE IF NOT EXISTS service_providers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  program_type    text NOT NULL
    CHECK (program_type IN ('ssp','naloxone','outreach','ftir','mobile','fixed_site')),
  census_tracts   text[] NOT NULL,
  region          text NOT NULL,
  contact_hash    text,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ---- mobile_routes ----
CREATE TABLE IF NOT EXISTS mobile_routes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id     uuid NOT NULL REFERENCES service_providers(id),
  route_name      text NOT NULL,
  route_code      text NOT NULL UNIQUE,
  geom            geography(LineString, 4326),
  census_tracts   text[] NOT NULL,
  schedule_json   jsonb NOT NULL,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mobile_routes_geom ON mobile_routes USING GIST(geom);

-- ---- route_stops ----
CREATE TABLE IF NOT EXISTS route_stops (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id                 uuid NOT NULL REFERENCES mobile_routes(id) ON DELETE CASCADE,
  stop_sequence            int NOT NULL,
  census_tract             text NOT NULL,
  geom                     geography(Point, 4326) NOT NULL,
  stop_name                text NOT NULL,
  typical_duration_minutes int,
  created_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE(route_id, stop_sequence)
);
CREATE INDEX IF NOT EXISTS idx_route_stops_geom ON route_stops USING GIST(geom);

-- ---- zk_service_proofs ----
CREATE TABLE IF NOT EXISTS zk_service_proofs (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proof_input_hash      text NOT NULL UNIQUE,
  public_signals        jsonb NOT NULL,
  proof_data            text NOT NULL,
  circuit_version       text NOT NULL,
  verification_key_hash text NOT NULL,
  is_valid              boolean NOT NULL DEFAULT false,
  proof_system          text NOT NULL DEFAULT 'groth16-mock'
    CHECK (proof_system IN ('groth16-mock','groth16','aleo-halo2')),
  generated_at          timestamptz NOT NULL DEFAULT now()
);

-- ---- service_status ----
CREATE TABLE IF NOT EXISTS service_status (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id           uuid NOT NULL REFERENCES service_providers(id),
  route_id              uuid REFERENCES mobile_routes(id),
  census_tract          text NOT NULL,
  geom                  geography(Point, 4326) NOT NULL,
  service_date          date NOT NULL,
  window_start          timestamptz NOT NULL,
  window_end            timestamptz NOT NULL,
  status                text NOT NULL
    CHECK (status IN ('scheduled','active','delayed','completed','cancelled')),
  delay_minutes         int CHECK (delay_minutes >= 0 AND delay_minutes <= 240),
  narcan_level          text CHECK (narcan_level IN ('well_stocked','low','out')),
  syringe_level         text CHECK (syringe_level IN ('well_stocked','low','out')),
  fentanyl_test_level   text CHECK (fentanyl_test_level IN ('well_stocked','low','out')),
  participant_count_band text
    CHECK (participant_count_band IN ('1-4','5-9','10-19','20+')),
  shift_code            text,
  status_hash           text NOT NULL,
  hcs_topic_id          text,
  hcs_transaction_id    text,
  hcs_sequence_number   bigint,
  consensus_timestamp   timestamptz,
  hcs_status            text NOT NULL DEFAULT 'PENDING_HCS'
    CHECK (hcs_status IN ('PENDING_HCS','CONFIRMED','FAILED')),
  zk_proof_id           uuid REFERENCES zk_service_proofs(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_service_status_geom   ON service_status USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_service_status_tract  ON service_status(census_tract);
CREATE INDEX IF NOT EXISTS idx_service_status_date   ON service_status(service_date);
CREATE INDEX IF NOT EXISTS idx_service_status_hcs    ON service_status(hcs_status) WHERE hcs_status = 'PENDING_HCS';
CREATE INDEX IF NOT EXISTS idx_service_status_window ON service_status(window_start, window_end)
  WHERE status IN ('scheduled','active','delayed');

-- ---- maine_census_tracts (reference) ----
CREATE TABLE IF NOT EXISTS maine_census_tracts (
  geoid            text PRIMARY KEY,
  name             text NOT NULL,
  county_name      text NOT NULL,
  total_population int,
  geom             geography(MultiPolygon, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_maine_tracts_geom ON maine_census_tracts USING GIST(geom);

-- ---- updated_at trigger ----
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_service_providers_updated_at
  BEFORE UPDATE ON service_providers FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_mobile_routes_updated_at
  BEFORE UPDATE ON mobile_routes FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_service_status_updated_at
  BEFORE UPDATE ON service_status FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---- geometry centroid enforcement trigger ----
CREATE OR REPLACE FUNCTION enforce_tract_centroid_geometry()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE centroid geography; dist_m float;
BEGIN
  SELECT ST_Centroid(geom)::geography INTO centroid
    FROM maine_census_tracts WHERE geoid = NEW.census_tract;
  IF centroid IS NULL THEN
    RAISE EXCEPTION 'Unknown census tract: %', NEW.census_tract;
  END IF;
  dist_m := ST_Distance(NEW.geom, centroid);
  IF dist_m > 100 THEN
    RAISE EXCEPTION 'geom is %.0fm from census tract centroid — centroid geometry only', dist_m;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_service_status_geometry_check
  BEFORE INSERT OR UPDATE OF geom ON service_status
  FOR EACH ROW EXECUTE FUNCTION enforce_tract_centroid_geometry();
CREATE TRIGGER trg_route_stops_geometry_check
  BEFORE INSERT OR UPDATE OF geom ON route_stops
  FOR EACH ROW EXECUTE FUNCTION enforce_tract_centroid_geometry();

-- ---- RLS ----
ALTER TABLE service_providers  ENABLE ROW LEVEL SECURITY;
ALTER TABLE mobile_routes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE route_stops        ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_status     ENABLE ROW LEVEL SECURITY;
ALTER TABLE zk_service_proofs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE maine_census_tracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY sp_public_select    ON service_providers FOR SELECT TO anon, authenticated USING (is_active = true);
CREATE POLICY sp_service_role_all ON service_providers FOR ALL TO service_role USING (true);
REVOKE SELECT (contact_hash) ON service_providers FROM anon, authenticated;

CREATE POLICY mr_public_select    ON mobile_routes FOR SELECT TO anon, authenticated USING (is_active = true);
CREATE POLICY mr_service_role_all ON mobile_routes FOR ALL TO service_role USING (true);

CREATE POLICY rs_public_select    ON route_stops FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY rs_service_role_all ON route_stops FOR ALL TO service_role USING (true);

CREATE POLICY ss_worker_insert    ON service_status FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY ss_worker_update    ON service_status FOR UPDATE TO authenticated
  USING (service_date = CURRENT_DATE AND status NOT IN ('completed','cancelled'));
CREATE POLICY ss_public_select    ON service_status FOR SELECT TO anon
  USING (hcs_status = 'CONFIRMED' AND status != 'cancelled' AND service_date >= CURRENT_DATE - INTERVAL '1 day');
CREATE POLICY ss_auth_select      ON service_status FOR SELECT TO authenticated
  USING (service_date >= CURRENT_DATE - INTERVAL '7 days');
CREATE POLICY ss_service_role_all ON service_status FOR ALL TO service_role USING (true);
REVOKE SELECT (participant_count_band) ON service_status FROM anon;

CREATE POLICY zkp_public_select    ON zk_service_proofs FOR SELECT TO anon, authenticated USING (is_valid = true);
CREATE POLICY zkp_service_role_all ON zk_service_proofs FOR ALL TO service_role USING (true);
REVOKE SELECT (proof_data, verification_key_hash) ON zk_service_proofs FROM anon;

CREATE POLICY mct_public_select    ON maine_census_tracts FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY mct_service_role_all ON maine_census_tracts FOR ALL TO service_role USING (true);

-- ---- public view ----
CREATE OR REPLACE VIEW active_services_public AS
SELECT
  ss.id,
  sp.name                                          AS provider_name,
  sp.program_type,
  ss.census_tract,
  ST_AsGeoJSON(ss.geom::geometry)::jsonb           AS geom_geojson,
  ss.status,
  ss.window_start,
  ss.window_end,
  ss.delay_minutes,
  ss.narcan_level,
  ss.syringe_level,
  ss.fentanyl_test_level,
  ss.hcs_topic_id,
  ss.hcs_transaction_id,
  ss.hcs_sequence_number,
  ss.consensus_timestamp,
  'https://hashscan.io/mainnet/topic/' || ss.hcs_topic_id AS hcs_verify_url,
  ss.zk_proof_id,
  zkp.proof_input_hash AS zk_commitment,
  zkp.public_signals   AS zk_public_signals,
  ss.updated_at
FROM service_status ss
JOIN service_providers sp ON sp.id = ss.provider_id
LEFT JOIN zk_service_proofs zkp ON zkp.id = ss.zk_proof_id
WHERE ss.hcs_status = 'CONFIRMED'
  AND ss.status != 'cancelled'
  AND ss.window_end >= now() - INTERVAL '2 hours'
  AND ss.window_start <= now() + INTERVAL '24 hours';

GRANT SELECT ON active_services_public TO anon, authenticated;

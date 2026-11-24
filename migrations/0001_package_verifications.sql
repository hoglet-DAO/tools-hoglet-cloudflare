CREATE TABLE IF NOT EXISTS package_verifications (
  network          TEXT    NOT NULL,
  address          TEXT    NOT NULL,
  package_name     TEXT    NOT NULL,
  upgrade_number   INTEGER NOT NULL,
  status           TEXT    NOT NULL,
  exact_source     INTEGER NOT NULL DEFAULT 0,
  source_digest    TEXT    NOT NULL,
  computed_digest  TEXT,
  bundle_sha256    TEXT,
  compiler_version TEXT,
  framework_rev    TEXT,
  onchain_modules  TEXT    NOT NULL DEFAULT '{}',
  error            TEXT,
  submitted_by     TEXT,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL,
  PRIMARY KEY (network, address, package_name, upgrade_number)
);

CREATE INDEX IF NOT EXISTS idx_verifications_address
  ON package_verifications (network, address);

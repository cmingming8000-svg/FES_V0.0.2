#!/bin/sh
# Creates the least-privilege runtime role used by the API server.
# The schema is owned by fes_owner (migrations); fes_app only receives the grants
# issued by the migrations, so it can never UPDATE/DELETE audit or agreement rows
# nor disable the triggers that protect them.
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  DO \$\$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fes_app') THEN
      CREATE ROLE fes_app LOGIN PASSWORD '${FES_APP_PASSWORD}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
    END IF;
  END
  \$\$;
  GRANT CONNECT ON DATABASE ${POSTGRES_DB} TO fes_app;
EOSQL

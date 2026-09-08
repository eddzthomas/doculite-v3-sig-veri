#!/bin/bash
# DEV ONLY: creates the second logical database for the local stack.
set -euo pipefail
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" <<-EOSQL
  CREATE DATABASE docuseal;
EOSQL

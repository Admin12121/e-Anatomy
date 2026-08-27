#!/bin/sh
set -eu

dump_path="/dump/voxel_anatomy.dump"

if [ ! -f "$dump_path" ]; then
  echo "Missing PostgreSQL dump at $dump_path" >&2
  exit 1
fi

echo "Restoring $dump_path into database $POSTGRES_DB"
pg_restore \
  --verbose \
  --no-owner \
  --no-acl \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  "$dump_path"

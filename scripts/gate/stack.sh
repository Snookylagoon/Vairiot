#!/usr/bin/env bash
# The exit-gate stack (stages 1.21, 2.17): the production images with the
# standalone overlay, as a throwaway project ("vairiot-gate") with its own
# volumes and high ports, beside any dev stack.  GATE_DIR holds gate.env and
# the TLS certificate (see README.md).
#   GATE_DIR=/path/to/gate scripts/gate/stack.sh up -d --build --wait
set -euo pipefail
: "${GATE_DIR:?set GATE_DIR to the gate directory (README.md)}"
export GATE_DIR
cd "$(dirname "$0")/../../infra"
exec docker compose -p vairiot-gate --env-file "$GATE_DIR/gate.env" \
  -f docker-compose.prod.yml -f docker-compose.standalone.yml -f ../scripts/gate/gate.override.yml "$@"

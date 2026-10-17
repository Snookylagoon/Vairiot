# Exit gate on the Docker stack

The phase exit gates (test plan §8) run against the production images behind
nginx with TLS, on a fresh database seeded with `seed:tuda`, as a throwaway
Compose project beside any dev stack. Run them at a phase close and before a
release.

| Script | Checks |
| ------ | ------ |
| `phase1_gate.py` | Phase 1 (§8.2): migrations, map GeoJSON, position events, photo EXIF, stripped downloads, grades, report, the `gis` toggle (15) |
| `phase2_gate.py` | Phase 2 (§8.3): classes, components, depreciation runs by the worker with a second approver, locked periods, the schedule against the entries, impairment and the next run's base, report totals, the `ipsas` toggle, row-level security on every tenant table (14) |
| `import_gate.py` | The staged import: 10,000 rows in under 2 minutes through the worker, error rows left out and downloadable, update mode keeping asset numbers (8) |

The browser check is `vairiot-web/e2e/asset-map.stack.ts` (the map, its tiles
and the Content-Security-Policy).

## Once

```bash
export GATE_DIR=~/vairiot-gate
mkdir -p "$GATE_DIR"/{tls,le,certbot}
cp scripts/gate/gate.env.example "$GATE_DIR/gate.env"   # then fill in the secrets
openssl req -x509 -newkey rsa:2048 -nodes -days 30 -subj "/CN=assets.gate.localhost" \
  -addext "subjectAltName=DNS:assets.gate.localhost,DNS:admin.gate.localhost" \
  -keyout "$GATE_DIR/tls/key.pem" -out "$GATE_DIR/tls/cert.pem"
python3 -m venv "$GATE_DIR/venv" && "$GATE_DIR/venv/bin/pip" install -r scripts/gate/requirements.txt
```

## Each run

```bash
scripts/gate/stack.sh down -v --remove-orphans
scripts/gate/stack.sh up -d --build --wait
scripts/gate/stack.sh run --rm -T -e TUDA_ADMIN_EMAIL=gate-admin@tuda.example \
  -e APP_URL=https://assets.gate.localhost:18443 migrate npx tsx prisma/seed-tuda.ts | tee "$GATE_DIR/seed.log"
grep -oE "token=[A-Za-z0-9_-]+" "$GATE_DIR/seed.log" | head -1 | cut -d= -f2 > "$GATE_DIR/invite.token"; rm -f "$GATE_DIR/accepted"
"$GATE_DIR/venv/bin/python" scripts/gate/phase1_gate.py "$GATE_DIR"
"$GATE_DIR/venv/bin/python" scripts/gate/phase2_gate.py "$GATE_DIR"
"$GATE_DIR/venv/bin/python" scripts/gate/import_gate.py "$GATE_DIR"
E2E_BASE_URL=https://assets.gate.localhost:18443 E2E_TENANT=tuda E2E_EMAIL=gate-admin@tuda.example \
  E2E_PASSWORD="$(cat "$GATE_DIR/admin.password")" npm run test:e2e:stack --workspace vairiot-web
scripts/gate/stack.sh down -v --remove-orphans
```

`phase1_gate.py` accepts the administrator's invitation and keeps the password
in `$GATE_DIR/admin.password`; `phase2_gate.py` invites a Finance user as the
second approver (D17). The scripts write `results*.json` in `$GATE_DIR`.

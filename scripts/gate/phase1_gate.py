"""Phase 1 exit gate (test plan §8.2) against the gate stack, through nginx.

Usage: python3 scripts/gate/phase1_gate.py <gate dir>   (reads invite.token, writes password + results.json)
"""
import io, json, secrets, socket, ssl, subprocess, sys, urllib.error, urllib.request, uuid
from pathlib import Path

from PIL import Image

G = Path(sys.argv[1])
HOST, PORT = 'assets.gate.localhost', 18443
BASE = f'https://{HOST}:{PORT}/api/v1'
COMPOSE = ['docker', 'compose', '-p', 'vairiot-gate', '--env-file', str(G / 'gate.env'),
           '-f', 'docker-compose.prod.yml', '-f', 'docker-compose.standalone.yml', '-f', str(G / 'gate.override.yml')]
INFRA = str(Path(__file__).resolve().parents[2] / 'infra')

_orig = socket.getaddrinfo
socket.getaddrinfo = lambda h, *a, **k: _orig('127.0.0.1' if h.endswith('.localhost') else h, *a, **k)
CTX = ssl.create_default_context(); CTX.check_hostname = False; CTX.verify_mode = ssl.CERT_NONE

results = []
def gate(name, ok, detail=''):
    results.append({'gate': name, 'pass': bool(ok), 'detail': detail})
    print(('PASS ' if ok else 'FAIL ') + name + (f' — {detail}' if detail else ''))

token = None
def call(method, path, body=None, raw=None, ctype='application/json'):
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    req = urllib.request.Request(BASE + path, data=data, method=method)
    if data is not None: req.add_header('Content-Type', ctype)
    if token: req.add_header('Authorization', f'Bearer {token}')
    try:
        with urllib.request.urlopen(req, context=CTX, timeout=60) as r:
            b = r.read(); return r.status, (json.loads(b) if r.headers.get_content_type() == 'application/json' else b)
    except urllib.error.HTTPError as e:
        b = e.read()
        try: return e.code, json.loads(b)
        except Exception: return e.code, b

def sql(q):
    return subprocess.run(COMPOSE + ['exec', '-T', 'postgres', 'psql', '-U', 'vairiot', '-d', 'vairiot', '-Atc', q],
                          cwd=INFRA, capture_output=True, text=True, check=True).stdout.strip()

# ── Sign in as the TUDA administrator (test account on this throwaway stack) ──
pw_file = G / 'admin.password'
if not pw_file.exists():
    pw_file.write_text('Gate' + secrets.token_hex(10) + '9')
password = pw_file.read_text()
invite = (G / 'invite.token').read_text().strip()
if invite and not (G / 'accepted').exists():
    (G / 'accepted').touch()
    s, b = call('POST', '/auth/accept-invite', {'token': invite, 'password': password})
    print('accept-invite', s)
s, b = call('POST', '/auth/login', {'email': 'gate-admin@tuda.example', 'password': password, 'tenantId': 'tuda'})
assert s == 200 and 'accessToken' in b, (s, b)
token = b['accessToken']
s, me = call('GET', '/auth/me')
gate('Sign-in through nginx; administrator in the two-factor grace period', s == 200 and me.get('featureFlags', {}).get('gis') is True,
     f"gis={me.get('featureFlags', {}).get('gis')}, due {me.get('twoFactorSetupDueBy')}")

# ── S1.1: migrations on a fresh database, PostGIS, bbox GeoJSON ──
gate('S1.1 migrations applied to a fresh database', sql("select count(*) from _prisma_migrations where finished_at is null") == '0',
     f"{sql('select count(*) from _prisma_migrations')} migrations, PostGIS {sql('select extversion from pg_extension where extname=$$postgis$$')}")
assets = []
for i in range(12):
    lat, lon = 41.6990 + i * 0.0004, 44.7980 + i * 0.0003
    s, a = call('POST', '/assets', {'name': f'Rustaveli sign {i + 1}', 'latitude': lat, 'longitude': lon,
                                     'geoAccuracyMeters': 4, 'geoSource': 'device', 'clientRequestId': str(uuid.uuid4())})
    assert s in (200, 201), (s, a); assets.append(a)
s, a = call('POST', '/assets', {'name': 'Kutaisi depot gate', 'latitude': 42.2679, 'longitude': 42.6946})
assets.append(a)
s, a = call('POST', '/assets', {'name': 'Unplaced bench'}); assets.append(a)
s, fc = call('GET', '/assets/geo?bbox=44.7,41.6,44.9,41.8')
gate('S1.1 /assets/geo?bbox=44.7,41.6,44.9,41.8 returns GeoJSON of in-box assets',
     s == 200 and fc.get('type') == 'FeatureCollection' and len(fc['features']) == 12
     and fc['features'][0]['geometry']['type'] == 'Point',
     f"{len(fc.get('features', []))} features (Kutaisi and the unplaced asset excluded)")
s, _ = call('GET', '/assets/geo?bbox=44.9,41.6,44.7,41.8')
gate('S1.1 a reversed bounding box is refused', s == 400, f'HTTP {s}')
gate('S1.1 geom kept in step by the trigger', sql("select count(*) from assets where (latitude is null) <> (geom is null)") == '0')

# ── S1.4 (API half): moving an asset writes the ledger event ──
first = assets[0]
s, _ = call('PATCH', f"/assets/{first['id']}", {'latitude': 41.7001, 'longitude': 44.7990})
s2, gs1 = call('GET', f"/assets/{first['id']}/gs1")
kinds = [e['eventType'] for e in gs1.get('events', [])] if s2 == 200 else []
gate('S1.4 setting a position writes POSITION_CAPTURED, moving it POSITION_CORRECTED',
     s == 200 and 'POSITION_CAPTURED' in kinds and 'POSITION_CORRECTED' in kinds, ', '.join(sorted(set(kinds))))
s, m = call('GET', '/assets/map')
gate('S1.4 /assets/map lists positioned assets and counts the unplaced', s == 200 and m['total'] == 13 and m['unplaced'] == 1,
     f"total {m.get('total')}, unplaced {m.get('unplaced')}")

# ── S1.3: a photo taken during an audit: listed against its scan with time and position;
#    the stored original keeps EXIF, every download is stripped (D13) ──
s, site = call('POST', '/sites', {'name': 'Rustaveli Avenue'})
s, tagged = call('POST', '/assets', {'name': 'Bus shelter 7', 'siteId': site['id'], 'rfidTag': 'GATE-RFID-7',
                                      'latitude': 41.6995, 'longitude': 44.7985})
s, camp = call('POST', '/audits', {'name': 'Gate photo audit', 'siteId': site['id']})
call('POST', f"/audits/{camp['id']}/start")
key = str(uuid.uuid4())
s, scan = call('POST', f"/audits/{camp['id']}/scans", {'tagValue': 'GATE-RFID-7', 'clientRequestId': key,
                                                      'latitude': 41.6996, 'longitude': 44.7986, 'geoAccuracyMeters': 5})
img = Image.new('RGB', (64, 48), (200, 30, 90))
exif = Image.Exif()
exif[0x8825] = {1: 'N', 2: (41.0, 41.0, 59.0), 3: 'E', 4: (44.0, 47.0, 52.0)}
exif[0x8769] = {0x9003: '2026:10:16 12:30:15', 0x9011: '+04:00'}
buf = io.BytesIO(); img.save(buf, 'JPEG', exif=exif); jpeg = buf.getvalue()
assert Image.open(io.BytesIO(jpeg)).getexif().get_ifd(0x8825), 'test JPEG has no GPS'
boundary = uuid.uuid4().hex
body = (f'--{boundary}\r\nContent-Disposition: form-data; name="photo"; filename="p.jpg"\r\nContent-Type: image/jpeg\r\n\r\n'
        ).encode() + jpeg + f'\r\n--{boundary}--\r\n'.encode()
s, photo = call('POST', f"/audits/{camp['id']}/scans/{key}/photos", raw=body, ctype=f'multipart/form-data; boundary={boundary}')
s2, listing = call('GET', f"/audits/{camp['id']}/photos")
listed = next((p for p in (listing if isinstance(listing, list) else listing.get('photos', [])) if p.get('id') == photo.get('id')), {})
gate('S1.3 a scan photo is listed against its scan with time and position (from EXIF)',
     s == 201 and listed.get('scanEventId') == scan.get('id') and listed.get('capturedAt') == '2026-10-16T08:30:15.000Z' and abs((listed.get('latitude') or 0) - 41.6997) < 0.001,
     f"scan {listed.get('scanEventId') == scan.get('id')}, capturedAt {listed.get('capturedAt')}, latitude {listed.get('latitude')}")
s, dl = call('GET', f"/photos/{photo.get('id')}/download")
gps_out = Image.open(io.BytesIO(dl)).getexif().get_ifd(0x8825) if s == 200 else {'error': s}
gate('S1.3 a downloaded copy has no EXIF GPS', s == 200 and not gps_out, f'GPS IFD after download: {dict(gps_out) or "none"}')
key_obj = sql(f"select \"storageKey\" from photos where id='{photo.get('id')}'") if photo.get('id') else ''
orig = subprocess.run(['docker', 'exec', 'gate_minio', 'sh', '-c',
                       f'mc alias set g http://127.0.0.1:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null && mc cat g/vairiot-photos/{key_obj}'],
                      capture_output=True).stdout if key_obj else b''
gps_kept = Image.open(io.BytesIO(orig)).getexif().get_ifd(0x8825) if orig[:2] == b'\xff\xd8' else {}
gate('S1.3 the stored original keeps its EXIF GPS as evidence (D13)', bool(gps_kept), f'{len(orig)} bytes, GPS IFD {"present" if gps_kept else "missing"}')

# ── S1.5: grades on assets; condition report by grade ──
s, a = call('POST', '/assets', {'name': 'Graded bin', 'condition': 'poor'})
gate('S1.5 an asset written with a condition string gets the grade', s in (200, 201) and a.get('conditionGrade') == 2,
     f"condition {a.get('condition')} → grade {a.get('conditionGrade')}")
gate('S1.5 every asset carries a grade', sql("select count(*) from assets where \"tenantId\"='tuda' and \"conditionGrade\" is null") == '0')
s, rep = call('GET', '/reports/export/asset-condition?format=csv')
gate('S1.5 condition report exports by grade through the reports service', s == 200 and len(rep) > 0, f'HTTP {s}, {len(rep)} bytes')

# ── S1 toggle: gis off → 404 everywhere; on again → data unchanged ──
geo_routes = ['/assets/map', '/assets/geo?bbox=44.7,41.6,44.9,41.8', '/gis/map-settings']
before = sql("select md5(string_agg(id||latitude||longitude, ',' order by id)) from assets where latitude is not null")
sql("update tenants set \"featureFlags\" = jsonb_set(\"featureFlags\"::jsonb, '{gis}', 'false')::jsonb where id='tuda'")
off = {r: call('GET', r)[0] for r in geo_routes}
s, _ = call('PATCH', f"/assets/{assets[1]['id']}", {'latitude': 1.0, 'longitude': 1.0})
sql("update tenants set \"featureFlags\" = jsonb_set(\"featureFlags\"::jsonb, '{gis}', 'true')::jsonb where id='tuda'")
after = sql("select md5(string_agg(id||latitude||longitude, ',' order by id)) from assets where latitude is not null")
on = {r: call('GET', r)[0] for r in geo_routes}
gate('S1 toggle: with gis off every GIS route answers 404', set(off.values()) == {404}, json.dumps(off))
gate('S1 toggle: positions sent while off are ignored; on again, data unchanged', before == after and set(on.values()) == {200},
     f'asset update while off HTTP {s}; checksum unchanged {before == after}')

(G / 'results.json').write_text(json.dumps(results, indent=2))
print(f"\n{sum(r['pass'] for r in results)}/{len(results)} passed")

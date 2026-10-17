"""Phase 2 exit gate (test plan §8.3) on the gate stack, through nginx, with the
production images (worker included). Run after phase1_gate.py has signed in once.

Usage: python3 scripts/gate/phase2_gate.py <gate dir>   (writes results2.json)
"""
import hashlib, json, socket, ssl, subprocess, sys, time, urllib.error, urllib.request
from decimal import Decimal as D
from pathlib import Path

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
    print(('PASS ' if ok else 'FAIL ') + name + (f' — {detail}' if detail else ''), flush=True)

def call(method, path, body=None, tok=None):
    data = json.dumps(body).encode() if body is not None else None
    for _ in range(6):
        req = urllib.request.Request(BASE + path, data=data, method=method)
        if data is not None: req.add_header('Content-Type', 'application/json')
        if tok: req.add_header('Authorization', f'Bearer {tok}')
        try:
            with urllib.request.urlopen(req, context=CTX, timeout=120) as r:
                b = r.read(); return r.status, (json.loads(b) if b and r.headers.get_content_type() == 'application/json' else b)
        except urllib.error.HTTPError as e:
            if e.code == 429: time.sleep(10); continue
            b = e.read()
            try: return e.code, json.loads(b)
            except Exception: return e.code, b
    raise RuntimeError('rate limited')

def sql(q):
    return subprocess.run(COMPOSE + ['exec', '-T', 'postgres', 'psql', '-U', 'vairiot', '-d', 'vairiot', '-Atc', q],
                          cwd=INFRA, capture_output=True, text=True, check=True).stdout.strip()

def login(email, password):
    s, b = call('POST', '/auth/login', {'email': email, 'password': password, 'tenantId': 'tuda'})
    assert s == 200, (s, b); return b['accessToken']

def until(fn, what, limit=180):
    t0 = time.time()
    while time.time() - t0 < limit:
        v = fn()
        if v: return v
        time.sleep(2)
    raise TimeoutError(what)

admin = login('gate-admin@tuda.example', (G / 'admin.password').read_text())

# A second approver (D17): invited as Finance by the administrator, invitation accepted.
fin_pw = 'Fin' + hashlib.sha256((G / 'admin.password').read_bytes()).hexdigest()[:12] + '9'
if not sql("SELECT id FROM users WHERE email='gate-finance@tuda.example'"):
    s, roles = call('GET', '/users/roles', tok=admin)
    finance = next(r for r in roles if r['name'] == 'Finance')
    s, u = call('POST', '/users', {'email': 'gate-finance@tuda.example', 'name': 'Gate Finance', 'roleId': finance['id']}, admin)
    assert s == 201, (s, u)
    token = sql("SELECT token FROM user_invitations i JOIN users u ON u.id = i.\"userId\" WHERE u.email='gate-finance@tuda.example' ORDER BY i.\"createdAt\" DESC LIMIT 1")
    s, b = call('POST', '/auth/accept-invite', {'token': token, 'password': fin_pw})
    assert s in (200, 201), (s, b)
fin = login('gate-finance@tuda.example', fin_pw)

classes = {c['code']: c for c in call('GET', '/accounting/classes', tok=admin)[1]}
gate('Seed: the nine TUDA asset classes', len(classes) == 9 and {'SGN', 'SIG', 'FUR'} <= set(classes), ', '.join(sorted(classes)))

# ── S2.1 Classes ─────────────────────────────────────────────────────────────
s, sign = call('POST', '/assets', {'name': 'Gate stop sign', 'assetClassId': classes['SGN']['id'], 'purchaseCost': 1000, 'depreciationStartDate': '2026-09-10', 'conditionGrade': 4}, admin)
s2, cheap = call('POST', '/assets', {'name': 'Gate bracket', 'assetClassId': classes['SGN']['id'], 'purchaseCost': 200}, admin)
gate('S2.1 a sign without a life takes 84 months from its class; GEL 200 under the GEL 500 threshold is EXPENSED',
     s == 201 and sign['usefulLifeMonths'] == 84 and sign['recognitionStatus'] == 'RECOGNISED' and cheap['recognitionStatus'] == 'EXPENSED',
     f"life {sign.get('usefulLifeMonths')}, {sign.get('recognitionStatus')}; bracket {cheap.get('recognitionStatus')}")

# ── S2.2 Components ──────────────────────────────────────────────────────────
s, templates = call('GET', '/accounting/component-templates', tok=admin)
junction = next(t for t in templates if t['code'] == 'JUNCTION')
s, made = call('POST', f"/accounting/component-templates/{junction['id']}/assets", {'name': 'Gate junction Rustaveli', 'totalCost': 60000, 'depreciationStartDate': '2026-09-10'}, admin)
parent_id = made['asset']['id']
n = int(sql(f"SELECT count(*) FROM assets WHERE id = '{parent_id}' OR \"parentAssetId\" = '{parent_id}'"))
s, group = call('GET', f'/accounting/assets/{parent_id}/components', tok=admin)
parts_nbv = sum(D(str(call('GET', f"/assets/{p['id']}", tok=admin)[1]['depreciation']['netBookValue'])) for p in [group['asset'], *group['components']])
roll = D(str(group['rollUp']['netBookValue']))
gate('S2.2 the Signalised junction template creates five assets; the roll-up NBV equals the sum of the parent and its parts',
     n == 5 and roll == parts_nbv, f'{n} assets; roll-up {roll}, parts {parts_nbv}')

# ── S2.3 Depreciation ────────────────────────────────────────────────────────
def period(year, month):
    s, p = call('POST', '/accounting/periods', {'year': year, 'month': month}, admin); return p['id']
def run_of(pid):
    ps = call('GET', '/accounting/periods', tok=admin)[1]
    return next((p for p in ps if p['id'] == pid), {'runs': []})['runs']
def prepare_and_post(pid):
    s, r = call('POST', f'/accounting/periods/{pid}/runs', tok=admin); assert s == 202, (s, r)
    rid = r['id']
    until(lambda: next((x for x in run_of(pid) if x['id'] == rid and x['jobState'] == 'DONE'), None), 'prepare')
    own, _ = call('POST', f'/accounting/runs/{rid}/post', tok=admin)
    s2, b = call('POST', f'/accounting/runs/{rid}/post', tok=fin); assert s2 == 202, (s2, b)
    until(lambda: next((x for x in run_of(pid) if x['id'] == rid and x['status'] == 'POSTED'), None), 'post')
    return rid, own
sep = period(2026, 9); prepare_and_post(sep)
octp = period(2026, 10); rid, own = prepare_and_post(octp)
entries = int(sql(f"SELECT count(*) FROM depreciation_entries WHERE \"runId\" = '{rid}'"))
skipped = json.loads(sql(f"SELECT preview->'skipped' FROM depreciation_runs WHERE id = '{rid}'"))
call('POST', f'/accounting/periods/{octp}/lock', tok=fin)
s, again = call('POST', f'/accounting/periods/{octp}/runs', tok=admin)
gate('S2.3 the October 2026 run is prepared by the worker and posted by another approver, writing entries; the preparer cannot post',
     entries == 5 and skipped.get('no_cost') == 1 and own == 403,
     f'{entries} entries in October (the sign and the junction\'s four parts; the parent, whose cost is in its parts, left out as no_cost); skipped {skipped}; the preparer posting it: {own}')
gate('S2.3 a locked period refuses a run', s in (403, 409), f'{s} {again.get("code") if isinstance(again, dict) else ""}')
s, reg = call('GET', '/reports/depreciation', tok=admin)
rows = reg if isinstance(reg, list) else reg.get('rows', reg.get('assets', []))
mismatch = []
for r in rows:
    tot = sql(f"SELECT coalesce(sum(e.charge),0) FROM depreciation_entries e JOIN depreciation_runs u ON u.id = e.\"runId\" JOIN assets a ON a.id = e.\"assetId\" WHERE a.\"tenantId\" = 'tuda' AND a.\"assetNumber\" = '{r['assetNumber']}' AND u.status = 'POSTED' AND u.\"reversalOfRunId\" IS NULL")
    if D(tot) != D(str(r['accumulatedDepreciation'])).quantize(D('0.01')) and D(tot) != 0: mismatch.append((r['name'], tot, r['accumulatedDepreciation']))
gate('S2.3 the depreciation schedule matches the posted entries', s == 200 and len(rows) > 0 and not mismatch, f'{len(rows)} rows, mismatches {mismatch[:3]}')

# ── S2.4 Impairment ──────────────────────────────────────────────────────────
s, _ = call('PATCH', f"/assets/{sign['id']}", {'conditionGrade': 1}, admin)
draft = until(lambda: next((i for i in call('GET', f"/accounting/impairments?assetId={sign['id']}&status=DRAFT", tok=admin)[1]), None), 'draft')
gate('S2.4 grade 1 creates a DRAFT impairment', draft['indicator'] == 'CONDITION' and draft['conditionGrade'] == 1, f"{draft['indicator']}, grade {draft['conditionGrade']}")
nov = period(2026, 11)
s, a = call('PUT', f"/accounting/impairments/{draft['id']}/assessment", {'standard': 'IPSAS_21', 'method': 'DRC', 'recoverableAmount': 600}, admin)
before = D(str(call('GET', f"/assets/{sign['id']}", tok=admin)[1]['depreciation']['netBookValue']))
s, p = call('POST', f"/accounting/impairments/{draft['id']}/post", {'periodId': nov}, fin)
after = D(str(call('GET', f"/assets/{sign['id']}", tok=admin)[1]['depreciation']['netBookValue']))
gate('S2.4 posting it (by the second approver) reduces the carrying amount', s == 200 and before == D('976.20') and after == D('600.00'), f'{before} → {after}, loss {a.get("loss")}')
prepare_and_post(nov)
charge = D(sql(f"SELECT e.charge FROM depreciation_entries e JOIN depreciation_runs u ON u.id = e.\"runId\" JOIN accounting_periods p ON p.id = e.\"periodId\" WHERE e.\"assetId\" = '{sign['id']}' AND p.month = 11 AND u.status = 'POSTED'"))
expected = (D('600') / (84 - 2)).quantize(D('0.01'))
gate('S2.4 the next run depreciates the reduced base', charge == expected, f'November charge {charge} = 600.00 / 82 months = {expected}')

# ── Reports ──────────────────────────────────────────────────────────────────
s, fa = call('GET', '/reports/fixed-assets', tok=admin)
farows = fa if isinstance(fa, list) else fa.get('rows', [])
reg_nbv = sum(D(str(r['netBookValue'])) for r in farows)
ids = dict(l.split('|') for l in sql("SELECT \"assetNumber\" || '|' || id FROM assets WHERE \"tenantId\" = 'tuda'").splitlines())
api_nbv = sum(D(str(call('GET', f"/assets/{ids[r['assetNumber']]}", tok=admin)[1]['depreciation']['netBookValue'])) for r in farows)
gate('Reports: the register NBV equals the assets’ carrying amounts (the PPE movement note itself is S5)', reg_nbv == api_nbv and len(farows) > 0, f'{len(farows)} assets, register {reg_nbv}, assets {api_nbv}')
s, imp = call('GET', '/accounting/impairment-register', tok=admin)
gate('Reports: the impairment register shows the posted loss', imp['totals']['net'] == '376.20', f"net {imp['totals']['net']}")

# ── S2 toggle ────────────────────────────────────────────────────────────────
digest = lambda: sql("SELECT md5(string_agg(concat_ws('|', id, charge), ',' ORDER BY id)) FROM depreciation_entries") + sql("SELECT md5(string_agg(concat_ws('|', id, status, loss), ',' ORDER BY id)) FROM impairments")
d0 = digest()
sql("UPDATE tenants SET \"featureFlags\" = \"featureFlags\" || '{\"ipsas\": false}' WHERE id = 'tuda'")
routes = ['/accounting/settings', '/accounting/classes', '/accounting/periods', '/accounting/impairments', '/accounting/component-templates']
codes = {r: call('GET', r, tok=admin)[0] for r in routes}
s, me = call('GET', '/auth/me', tok=admin)
sql("UPDATE tenants SET \"featureFlags\" = \"featureFlags\" || '{\"ipsas\": true}' WHERE id = 'tuda'")
gate('S2 toggle: with ipsas off every ledger route answers 404 and the console is told to hide the ledger',
     set(codes.values()) == {404} and me['featureFlags'].get('ipsas') is False, json.dumps(codes))
gate('S2 toggle: on again, the ledger is unchanged', digest() == d0 and call('GET', '/accounting/periods', tok=admin)[0] == 200)

# ── Tenancy (W7) ─────────────────────────────────────────────────────────────
unscoped = sql("""SELECT string_agg(c.relname, ',') FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND EXISTS (SELECT 1 FROM information_schema.columns k WHERE k.table_name = c.relname AND k.column_name = 'tenantId')
  AND NOT (c.relrowsecurity AND c.relforcerowsecurity)""")
gate('Tenancy: every tenant table on the deployed database has forced row-level security', unscoped == '', unscoped or 'none unscoped')

(G / 'results2.json').write_text(json.dumps(results, indent=2))
print(f"{sum(r['pass'] for r in results)}/{len(results)} passed")

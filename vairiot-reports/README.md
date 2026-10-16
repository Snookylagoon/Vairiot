# vairiot-reports

| Item     | Detail                                                                                         |
| -------- | ---------------------------------------------------------------------------------------------- |
| Package  | `vairiot-reports` — stateless report renderer                                                  |
| Stack    | Python 3.12, FastAPI, uvicorn, ReportLab, python-docx, openpyxl, Pillow                        |
| Revision | 0.1 (16 October 2026)                                                                          |
| See also | [Technology stack](../docs/01-technology-stack.md) · [Test plan](../docs/testing/test-plan.md) |

The API sends report data as JSON to `POST /generate`; the service returns a CSV, XLSX, DOCX or PDF file in the Vairiot brand. It holds no data and has no database access. It is not an npm workspace, so `npm test` never reaches it.

## Layout

| Path               | Contents                                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/main.py`      | FastAPI app: `GET /health`, `POST /generate`, interactive docs at `/docs`                                                                         |
| `app/models.py`    | Request model (`ReportRequest`)                                                                                                                   |
| `app/config.py`    | Brand colours, column definitions, page geometry                                                                                                  |
| `app/reports/`     | Report definitions by area (`assets`, `audits`, `checkouts`, `company`, `disposals`, `exceptions`, `licences`, `maintenance`, `tenants`, `users`) |
| `app/templates/`   | Renderers: `csv_gen.py`, `xlsx.py`, `docx_gen.py`, `pdf_gen.py`, `brand.py`                                                                       |
| `requirements.txt` | Exact pins                                                                                                                                        |
| `Dockerfile`       | `python:3.12-slim` with the Debian Montserrat fonts; port 8100                                                                                    |

## Set up

```bash
cd vairiot-reports
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

PDFs use Montserrat. Without the font installed locally, ReportLab falls back to a default face; the Docker image installs `fonts-montserrat`.

## Run

| Task                           | Command                                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------ |
| Development server with reload | `uvicorn app.main:app --host 0.0.0.0 --port 8100 --reload` (from `vairiot-reports/`) |
| In the local stack             | `npm run dev` at the root starts the `reports` service (`Dockerfile.dev`)            |
| Check it is up                 | `curl http://localhost:8100/health`                                                  |

The API finds it through `REPORT_SERVICE_URL` (`http://reports:8100` in Compose).

## Test

There are **no tests yet**. The first pytest suites arrive in W5 (decision D8), and S5.1 adds `pytest vairiot-reports` to its exit gate. Planned layout: `vairiot-reports/tests/`, run with `python -m pytest vairiot-reports` from the root.

## Rules

- Report output is part of the TUDA deliverables: golden-file tests for each report type before S5.
- `pyproject.toml` records the product version only (decision D3, set by `scripts/bump-version.mjs`); dependencies stay pinned in `requirements.txt`.
- `app/templates/pdf_gen.py` (504 lines) is over the 500-line limit and is on the split list (W3).

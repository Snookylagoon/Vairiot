# Vairiot — Known-Fix Registry

All bugs found and fixed during development are recorded here.
Before starting any new module, read this file and apply relevant fixes proactively.
This prevents the same problem being solved more than once.

---

## Format

Each entry contains:
- **ID** — sequential number
- **Module** — which part of the codebase was affected
- **Root Cause** — what caused the bug
- **Fix Applied** — exactly what was changed
- **Test Added** — how to confirm it never recurs

---

## KFR-001 — docx-js PageNumber constant

| Field | Detail |
|---|---|
| **Module** | Any Node.js script generating Word (.docx) documents using the `docx` npm package |
| **Root Cause** | `PageNumber` is a constant object in docx-js v8+, not a constructor. Calling `new PageNumber()` throws `TypeError: PageNumber is not a constructor`. |
| **Fix Applied** | Use `PageNumber.CURRENT` (a plain constant value) inside a `TextRun.children` array, not `new PageNumber()`. |
| **Correct usage** | `new TextRun({ children: [PageNumber.CURRENT], font: 'Montserrat', size: 16 })` |
| **Wrong usage** | `new TextRun({ children: [new PageNumber()] })` — throws at runtime |
| **Test Added** | Any document generation script must be run with `node script.js` and the output `.docx` opened in Word to confirm page numbers render. Add to CI as a smoke test once document generation is a scheduled feature. |

---

## KFR-002 — PNG transparency stripped on claude.ai upload

| Field | Detail |
|---|---|
| **Module** | Any workflow that uploads PNG logo files to claude.ai for processing |
| **Root Cause** | The claude.ai upload pipeline converts RGBA PNGs to RGB, replacing all transparent pixels with black (0,0,0). The file mode on the server reads as `RGB` not `RGBA` even though the original file on disk has `Alpha channel: Yes` (confirmed in macOS Get Info). |
| **Fix Applied** | Reconstruct transparency from the uploaded RGB copy using saturation + brightness thresholding: pure black pixels (R=G=B=0) become fully transparent (alpha=0); very dark grey pixels (max channel ≤ 20) are treated as antialiasing and get proportional alpha; all other pixels are fully opaque (alpha=255). |
| **Code pattern** | See `vairiot_v1_5.js` Python preprocessing block for the exact NumPy implementation. |
| **Applies to** | Both `Variot-full.png` and `vairiot_only.png` — and any future logo PNGs uploaded to Claude that have transparent backgrounds. |
| **Prevention** | If re-uploading logos: use the reconstructed versions `Variot-full_transparent.png` and `vairiot_only_transparent.png` generated during Sprint 0 setup, not the raw uploads. |
| **Test Added** | After reconstruction, verify with Pillow: `assert img.mode == 'RGBA'` and sample known background coordinates for alpha=0 and known logo content coordinates for alpha=255. |

---

## KFR-003 — Vairiot gradient end colour

| Field | Detail |
|---|---|
| **Module** | All brand/design token files across web, Android, and documents |
| **Root Cause** | The gradient end colour was initially assumed to be `#333399` based on the brand guide colour sample image. Pixel-sampling the actual logo files revealed the true end colour is `#615AA0` (a softer violet), not the hard purple `#333399`. |
| **Fix Applied** | Replaced `#333399` with `#615AA0` in all design token files, Tailwind config, Android `colors.xml`, `VairiotTheme.kt`, and all document generation scripts. Gradient midpoint confirmed as `#A05B97`. |
| **Correct gradient** | `linear-gradient(90deg, #FF0DCC 0%, #A05B97 50%, #615AA0 100%)` |
| **Wrong gradient** | `linear-gradient(90deg, #FF0DCC 0%, #333399 100%)` |
| **Test Added** | All design token files now include a comment referencing the pixel-sampling source. Any PR touching brand colours must be reviewed against the logo files `Variot-full.png` and `vairiot_only.png`. |

---

*Last updated: Sprint 1, June 2026*
*Add new entries above this line in the same format.*

## KFR-004 — Docker socket on newer Docker Desktop for Mac
Run once: `sudo ln -sf /Users/marchecentral1/.docker/run/docker.sock /var/run/docker.sock`
Re-apply after Mac restart. Test: `docker ps` works without error.

## KFR-005 — Sprint files: use shell scripts not zip files
Zip downloads via claude.ai are unreliable. All sprints delivered as heredoc shell scripts pasted directly into Terminal.

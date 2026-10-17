# IPSAS Ledger — Mechanics

| Item       | Detail |
| ---------- | ------ |
| Purpose    | How Vairiot Asset Intelligence keeps the fixed-asset ledger: the mechanics the Accounting Policy Manual (TOR Deliverable D2) sets the figures for |
| Scope      | Asset classes and recognition, components, depreciation, impairment, approvals and the register import, as built in Phase 2 (version 2.13.1) |
| Module     | `ipsas`, switched per organisation; with it off every ledger route answers 404 and no ledger screen shows |
| Revision   | 0.1 (17 October 2026) |
| Sources    | [Phase 2 plan](05-phase-2-plan.md) §2 and §4 (D14–D21), [Phase 2 record](06-phase-2-record.md) |

The ledger takes its policy from data, not code: lives, thresholds, methods, residual values and GL accounts are fields that Finance sets per class. Where the Accounting Policy Manual chooses a figure, this document says where it goes. TUDA's seeded values are placeholders, marked "to be confirmed".

## 1. Roles and approvals

| Permission | Who has it at TUDA | What it allows |
| ---------- | ------------------ | -------------- |
| `accounting:read` | Finance, Administrator, Inventory Manager | See classes, periods, runs, impairments and the ledger figures |
| `accounting:write` | Finance, Administrator | Prepare: classes and their policies, depreciation runs, impairment assessments, imports in update mode |
| `accounting:approve` | Finance | Post, reverse, lock a period, override recognition |

**Segregation (D17).** The person who prepares a depreciation run cannot post it, and the person who assesses an impairment cannot post it. The API refuses (403), and a database check refuses it again.

**Immutability.** Depreciation entries and posted impairments cannot be edited or deleted; database triggers refuse it. A mistake is corrected by a reversal, which writes offsetting records, so the history stays complete. Every change is also written to the audit log, and the asset's own ledger records CREATED, MIGRATED, CONDITION_ASSESSED, CUSTODIAN_CHANGED, IMPAIRED and DISPOSED events.

**Separation of organisations.** Each organisation's ledger is kept apart by the database itself (row-level security on every table), not only by the application.

## 2. Asset classes

Each class carries its accounting policy:

| Field | Meaning |
| ----- | ------- |
| Code, name | The class as the policy manual names it (e.g. SGN, Road signs) |
| IPSAS class | INFRASTRUCTURE, OPERATIONAL, OFFICE_EQUIPMENT, FURNITURE, VEHICLES, LAND, BUILDINGS or OTHER, for disclosure |
| Capitalisation threshold | Below it an item is expensed, not recognised (§3) |
| Default useful life (months) | Taken by a new asset of the class that has none |
| Default depreciation method | Straight line, reducing balance or units of production (§5) |
| Default residual value (%) | Of cost, taken by a new asset that has none |
| Componentisation required | Whether assets of the class are held as parts (§4) |
| GL accounts | Asset, depreciation expense, accumulated depreciation and impairment accounts, carried on journals (posting to TUDA's general ledger is S5) |

A category can point to a class, so an asset created in that category takes the class.

**TUDA's seeded classes** (placeholders for D2; threshold GEL 500 for each):

| Code | Name | IPSAS class | Life (months) | Parts |
| ---- | ---- | ----------- | ------------- | ----- |
| SIG | Traffic signal systems | INFRASTRUCTURE | 120 | Yes |
| SGN | Road signs | INFRASTRUCTURE | 84 | No |
| SHL | Passenger shelters | INFRASTRUCTURE | 180 | No |
| ISL | Safety islands | INFRASTRUCTURE | 240 | No |
| BRD | Information boards | INFRASTRUCTURE | 84 | No |
| TME | Traffic management equipment | OPERATIONAL | 96 | No |
| OFF | Office equipment | OFFICE_EQUIPMENT | 60 | No |
| FUR | Furniture | FURNITURE | 120 | No |
| OTH | Other | OTHER | 60 | No |

## 3. Recognition

**Cost.** The capitalised cost is the purchase cost plus freight, installation, customs duties and other capitalised costs. For an asset received as a donation or a transfer in, it is the fair value at recognition instead.

**Status.** Each asset has one of three statuses:

| Status | When | Effect |
| ------ | ---- | ------ |
| RECOGNISED | The cost is at or above the class's threshold | On the register; depreciated and impairable |
| EXPENSED | The cost is below the threshold | Not on the register as an asset; no carrying amount, no depreciation |
| PENDING_REVIEW | No class, or no cost yet | Listed for Finance to resolve |

Finance (`accounting:approve`) can override the status with a reason, which is audited. A class change or a cost change works the status out again.

**Groups.** A parent and its parts are tested on the group's roll-up cost, and the parts take the parent's status. So a junction whose cost is all in its parts is still recognised.

## 4. Components

- An asset can be held as parts, one level deep: a database trigger refuses a part of a part.
- Each part has its own class, life, method and cost, and depreciates on its own.
- The parent's figures are rolled up: cost, accumulated depreciation and carrying amount.
- A part takes its parent's category when created. It follows the parent's site, location, position and custodian while it still shares them.
- A component template creates an asset and its parts with the cost split exactly by share. TUDA's "Signalised junction" template: controller 35 % (120 months), poles 25 % (240), signal heads 25 % (120), detectors 15 % (96), all placeholders for D2.
- A parent with active parts can only be disposed of with its parts, or after detaching them.

## 5. Depreciation

### 5.1 Conventions (D14, D15)

- **Periods.** Periods are calendar months in the organisation's time zone (Asia/Tbilisi for TUDA).
- **Start and disposal.** An asset is charged a full month in the month of its depreciation start date, and nothing from the month of its disposal.
- **Rounding.** Amounts are decimal, never floating point. Each monthly charge is rounded half-up to 2 places.
- **Last month.** The last month of a life takes whatever is left, so a life's charges add up to the depreciable base exactly.
- **Floor.** No charge takes the carrying amount below the residual value.
- **Eligibility.** Only RECOGNISED assets with a cost, a method and a start date are charged. A run's preview says how many were left out, and why.

### 5.2 Methods

| Method | Monthly charge |
| ------ | -------------- |
| Straight line | (cost − residual) ÷ life in months |
| Reducing balance | Opening carrying amount × annual rate ÷ 12. The rate is the asset's own; without one, double the straight-line rate (200 % ÷ life in years) |
| Units of production | (cost − residual) × units this month ÷ expected total units. Units are entered per asset and month (D21), one at a time or in bulk |

After an impairment, straight line and units of production spread what is left above the residual over the remaining months or remaining units (§6).

Worked example (straight line): GEL 1,000 over 84 months is 83 charges of 11.90 and 12.30 in the last month, exactly 1,000.00.

### 5.3 Periods and runs

| Step | Who | What happens |
| ---- | --- | ------------ |
| Open a month | `accounting:write` | The period is OPEN |
| Prepare a run | `accounting:write` | The background worker computes a DRAFT with a preview: the charge in total and by class, and why assets were left out |
| Post | `accounting:approve`, not the preparer | The worker computes the charges again from the ledger as it stands, writes one entry per asset (opening, charge, closing, accumulated) and closes the month |
| Reverse | `accounting:approve` | Offsetting entries in a reversal run; the month can be reopened and run again |
| Lock | `accounting:approve` | Final: nothing can be run or reversed in it |

Runs go in month order: a month cannot be posted before an earlier one, nor reversed once a later one is posted. One posted run per month. While the worker is on a run, nothing else can be asked of it.

### 5.4 Figures shown

Once an asset has posted entries, every figure comes from the ledger: the register, the asset page, the reports and the carrying amount at disposal. Before its first posted run, the figures are a projection.

- **Carrying amount** = capitalised cost − accumulated depreciation − net impairment.
- **Reports:** the depreciation schedule, the fixed asset register, the valuation summary, depreciation by class, and the impairment register.

## 6. Impairment (IPSAS 21 and 26)

| Step | Who | What happens |
| ---- | --- | ------------ |
| Raise | Automatic, or `accounting:write` | A DRAFT appears when a recognised asset's grade moves to one whose condition scale marks it as an impairment indicator (grades 1 and 2 by default), or when someone raises it by hand. Indicators: condition, physical damage, obsolescence, idle, legal or regulatory, other. One draft per asset at a time |
| Assess | `accounting:write` | The standard (IPSAS 21 non-cash-generating, IPSAS 26 cash-generating), the measurement method (depreciated replacement cost, restoration cost, service units, fair value less costs to sell) and the recoverable amount, with notes |
| Post | `accounting:approve`, not the assessor | Into an open month with no later depreciation posted. The figures are worked out again, and IMPAIRED is written on the asset's ledger |
| Dismiss | `accounting:write` | A draft judged not impaired |
| Correct | `accounting:approve` | A posted record made in error is offset by an equal and opposite record; the original is marked REVERSED |

**Loss.**
- If the recoverable amount is below the carrying amount, it is an impairment of the difference.
- If it is above, and impairment is still outstanding, it is a reversal of an impairment loss, capped at two limits (IPSAS 21.68, 26.106):
  - the impairment still outstanding;
  - the carrying amount the asset would have had with no impairment. Vairiot works this out by replaying the asset's depreciation without one.

**Effect.** The impairment takes effect from the start of the month it is posted into, so that month's run is the first on the lower base.

Worked example: carrying 976.20, recoverable 600.00, a loss of 376.20 posted into November. November then charges 600.00 ÷ 82 months left = 7.32.

## 7. Register import

| Step | What happens |
| ---- | ------------ |
| Upload | An .xlsx or .csv file of up to 25 MB and 50,000 rows (old .xls files are refused). The header row is found under any titles |
| Map | Each column is matched to a field: a first guess from the headers (English, Georgian, Russian), a saved mapping, or the register profiler's file. You also set the date order and the decimal separator, and translation tables (e.g. "Signs" → SGN) |
| Validate | Every row is checked: required fields; class, site and category lookups; dates and numbers; condition and grade; positions; cost and life; duplicates in the file and against the register. A row below its class threshold gets a warning that it will be expensed |
| Review | The rows to fix are listed with their reasons. They can be corrected on the page or in a downloaded workbook; corrected rows are checked again |
| Commit | The licence cap is checked first. Each row then becomes an asset through the same process as a manual create, with its finance reference (FINANCE_REF), its old register number (LEGACY_TAG) and a MIGRATED event. Rows with errors are left out |
| Reconcile | A workbook pairs each source row with the asset it became: asset number, GIAI, finance reference |

**Update mode** (`accounting:write`) changes existing assets from a file. Rows are matched by finance reference, no asset number changes, and every change is recorded on the asset's ledger.

The register export uses the same headers, so an exported register can be imported back.

## 8. For the Accounting Policy Manual (D2) to decide

| Choice | Where it goes |
| ------ | ------------- |
| Each class's threshold, life, method, residual value and GL accounts | The class (§2); TUDA's are placeholders |
| Component shares and lives for signalised junctions and other componentised classes | The component templates (§4) |
| Which condition grades indicate impairment | The condition scale, per organisation or category |
| The depreciation convention (a full month in the start month, none in the disposal month) | Fixed today (D15); another convention would be added as a class field |
| Revaluation (IPSAS 45) | Not built (Phase 2 plan §5); raise it with D2 if TUDA's policy uses it |
| The PPE movement note and journal export to the general ledger | S5 |

# Data Model and Module Registry

| Item                | Detail                                                                                                                                                |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product             | Vairiot Asset Intelligence                                                                                                                            |
| Phase               | 0 — stage 0.9 (documentation set, W2)                                                                                                                 |
| Status              | Draft — describes `vairiot-api/prisma/schema.prisma` and `vairiot-api/src/lib/feature-flags.ts` on 16 October 2026                                    |
| Revision            | 0.1 (16 October 2026)                                                                                                                                 |
| Date                | 16 October 2026                                                                                                                                       |
| Decisions           | D5 (row-level security), D7 (module registry; GIS behind `gis` now)                                                                                   |
| Companion documents | [00 Discovery and architecture](00-discovery-and-architecture.md) · [01 Technology stack](01-technology-stack.md) · [Test plan](testing/test-plan.md) |

---

## 1. Overview

| Measure                         | Value                                                                                                                                 |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Models                          | 57                                                                                                                                    |
| Enums                           | 15                                                                                                                                    |
| Migrations                      | 38, newest `20261012000000_asset_gis_position`                                                                                        |
| Schema file                     | 1,454 lines (the 500-line rule does not apply to the Prisma schema, but splitting is an option in Prisma 7)                           |
| Database                        | PostgreSQL 16; PostGIS image only in the standalone overlay and **not used by any migration**                                         |
| Identifiers                     | `cuid()` strings, except `ScanSession.id` (the mobile session UUID, so retries upsert)                                                |
| Tenant column                   | `tenantId String` on 38 models; the other 19 are listed in §2.13                                                                      |
| Row-level security              | **None**. Isolation is the service layer's `where: { tenantId }` (D5 adds RLS, W4)                                                    |
| Soft delete                     | `User` and `Asset` (`deletedAt`); everything else is a hard delete                                                                    |
| Constraints Prisma cannot model | Kept in migration SQL: coordinate pair and range checks, `AssetEvent` hash-chain trigger and no-update rules, GIAI derivation trigger |

## 2. Models by area

### 2.1 Identity and access (10)

| Model                    | Key fields                                                                                                                              | Notes                                                  |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `Tenant`                 | `name` (unique), `plan`, `deploymentMode`, `parentTenantId`, `featureFlags` (JSON), `active`, `onboardingComplete`                      | Root of tenancy; sub-tenants by `parentTenantId`       |
| `User`                   | `tenantId`, `email`, `passwordHash`, `twoFactorEnabled`, `mustChangePassword`, `failedLoginCount`, `lockedUntil`, `active`, `deletedAt` | Soft-deleted                                           |
| `Role`                   | `tenantId`, `name`, `permissions`, `isSystem`                                                                                           | Roles are per tenant                                   |
| `UserRole`               | `userId`, `roleId`, `grantedAt`                                                                                                         | Join table                                             |
| `UserPermissionOverride` | `userId`, `permission`, `granted`, `grantedBy`                                                                                          | Per-user exceptions                                    |
| `UserTwoFactor`          | `userId`, `secret` (encrypted), `backupCodes` (hashed), `verifiedAt`                                                                    | Legacy plaintext rows still accepted (SEC-M1 leftover) |
| `LoginAttempt`           | `userId?`, `email`, `ipAddress`, `success`, `reason`                                                                                    | Progressive lockout                                    |
| `UserInvitation`         | `tenantId`, `userId`, `token`, `expiresAt`, `accepted`                                                                                  | Invite-only sign-up on standalone installs             |
| `ApiKey`                 | `tenantId`, `name`, `prefix`, `hash` (SHA-256), `scopes`, `revokedAt`                                                                   | Public API access                                      |
| `OnboardingProgress`     | `tenantId`, step (`OnboardingStep`), `completed`                                                                                        | Four-step gate before business routes open             |

### 2.2 Organisation (3)

| Model             | Key fields                                                                          | Notes                                         |
| ----------------- | ----------------------------------------------------------------------------------- | --------------------------------------------- |
| `Company`         | `tenantId` (unique), `legalName`, address, `logoStorageKey`, `currency`, `timezone` | `timezone` added in S0.6 (TUDA: Asia/Tbilisi) |
| `ClientCompany`   | `tenantId`, `legalName`, address, contact, `active`                                 | External clients for project work             |
| `ClientAuthority` | `clientCompanyId`, `name`, `email`, `jobTitle`, `isSignatory`                       | Engagement signatory                          |

### 2.3 Register (5)

| Model                   | Key fields                                                                                                                                                                                                                                                                       | Notes                                                                                                   |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `Asset`                 | `tenantId`, `assetNumber`, name, `categoryId`, `siteId`, `locationId`, `status`, `condition` (string), barcode, `rfidTag`, GS1 fields (`individualAssetReference`, `giai`), procurement and cost components, depreciation fields, `customFields`, `clientRequestId`, `deletedAt` | Unique per tenant: `assetNumber`, `clientRequestId`, `individualAssetReference`; `giai` unique globally |
| ↳ GIS position          | `latitude`, `longitude` (`Float`, WGS 84), `geoAccuracyMeters`, `geoSource` (`manual`, `device`, `import`), `geoCapturedAt`                                                                                                                                                      | Added `20261012`; pair and range checks in SQL; **behind `gis` from W1a**                               |
| `Category`              | `tenantId`, `name`, `description`, `parentId` (hierarchy)                                                                                                                                                                                                                        | —                                                                                                       |
| `Site`                  | `tenantId`, `name`, `address`, `city`, `country`, `active`                                                                                                                                                                                                                       | —                                                                                                       |
| `Location`              | `siteId`, `parentId`, name, `type`                                                                                                                                                                                                                                               | Hierarchy within a site; also the blind-audit **zone**                                                  |
| `CustomFieldDefinition` | `tenantId`, `fieldType`, `required`, `sortOrder`                                                                                                                                                                                                                                 | Values live in `Asset.customFields`                                                                     |

Delta sync uses the `(tenantId, updatedAt)` index on `Asset` (`GET /assets?changedSince=`).

### 2.4 Asset life cycle (4)

| Model              | Key fields                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `Disposal`         | `tenantId`, `assetId` (one per asset), `disposalValue`, `netBookValueAtDisposal`, `gainLoss`                              |
| `Checkout`         | `tenantId`, `assetId`, `custodianId`, `expectedReturn`, `checkedOutAt`, `checkedInAt`                                     |
| `Transfer`         | `tenantId`, `assetId`, from and to site, location and custodian, `transferDate`, `reason`, `approvedBy`                   |
| `MaintenanceEvent` | `tenantId`, `assetId`, `maintenanceType`, `vendor`, `workOrderNumber`, `cost`, `scheduledDate`, `completedDate`, `status` |

### 2.5 Media (2)

| Model      | Key fields                                                                                                          | Notes                           |
| ---------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `Photo`    | `tenantId`, `assetId?`, `maintenanceEventId?`, `storageKey`, `thumbStorageKey`, `mimeType`, `sizeBytes`, dimensions | Not yet linked to a scan (S1.3) |
| `Document` | `tenantId`, `assetId`, `documentType`, `fileName`, `storageKey`, `mimeType`, `sizeBytes`                            | Generic attachments             |

### 2.6 Audit campaigns and blind audits (7)

| Model                     | Key fields                                                                                                                                            | Notes                                      |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `AuditCampaign`           | `tenantId`, name, `mode` (default `sighted`; blind), scope (`siteId`, `locationId`, `categoryId`), `status`, dates                                    | Blind mode needs the `blindAudit` flag     |
| `AuditCampaignAsset`      | `campaignId`, `assetId`                                                                                                                               | Explicit asset-list scope                  |
| `AuditScanEvent`          | `tenantId`, `campaignId`, `tagValue`, `assetId?`, `locationId`, `condition`, `result`, `scannedAt`, `capturedAt`, `clientRequestId` (globally unique) | `capturedAt` clamped on the server         |
| `AuditSnapshotAsset`      | `campaignId`, `assetId`, register values at snapshot time                                                                                             | Blind audit: what the register said        |
| `AuditZoneSubmission`     | `campaignId`, `locationId`, `submittedBy`                                                                                                             | A zone closed by a team                    |
| `AuditReconciliationItem` | `campaignId`, `snapshotAssetId?`, `scanEventId?`, `classification`, snapshot and found location and condition                                         | Count-to-register reconciliation           |
| `AuditAdjustment`         | `campaignId`, `reconciliationItemId`, `appliedToRegister`, `postedAt`                                                                                 | Register corrections from a reconciliation |

### 2.7 RFID sweeps (2)

| Model            | Key fields                                                                         | Notes                                             |
| ---------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------- |
| `ScanSession`    | `id` = mobile UUID, `tenantId`, `siteId`, `categoryId`, `startedAt`, `completedAt` | Uploaded once when the operator completes a sweep |
| `ScanSessionTag` | `sessionId`, `epc`, `status`, `readCount`, `firstSeenAt`, `lastSeenAt`, `assetId?` | Tags seen in the sweep                            |

### 2.8 Trail and ledger (2)

| Model        | Key fields                                                                                                                                                              | Notes                                                                                                          |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `AuditEvent` | `tenantId`, `actorId?`, `entityType`, `entityId`, `action`, `before`, `after`, `metadata`, `occurredAt`                                                                 | General audit trail; writes are not awaited; no retention (STO-4)                                              |
| `AssetEvent` | `tenantId`, `assetId`, `seq`, `eventType` (`AssetEventType`, 21 values), `occurredAt`, `recordedAt`, `actorUserId`, `deviceId`, `source`, `payload`, `prevHash`, `hash` | **Append-only and hash-chained per asset**: a trigger sets `seq` and the hashes; rules block update and delete |

### 2.9 Operations (6)

| Model               | Key fields                                                                          | Notes                                   |
| ------------------- | ----------------------------------------------------------------------------------- | --------------------------------------- |
| `AlertSubscription` | `tenantId`, `userId`, `exceptionType`, `channel`, `frequency`, `active`             | Digests sent by the worker scheduler    |
| `Webhook`           | `tenantId`, `name`, `url`, `events`, `secret`, `active`                             | HMAC-signed                             |
| `WebhookDelivery`   | `webhookId`, event, `status`, `attempts`                                            | Updated by the worker as retries run    |
| `TenantUsage`       | `tenantId`, `date`, photo and document bytes and counts, asset and user counts      | Nightly; no quota reads it yet (SAAS-8) |
| `ReportSchedule`    | `tenantId`, `reportType`, `format`, `frequency`, `nextRunAt`, `active`              | Dead stub (STO-6)                       |
| `SmtpConfig`        | `id = "singleton"`, `provider`, `host`, `port`, `secure`, `username`, `passwordEnc` | Platform-wide (SAAS-9)                  |

### 2.10 Licensing and devices (4)

| Model         | Key fields                                                                                                                              |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `LicenceTier` | `name` (`LicenceTierName`: FREE, TIER_2, TIER_3), `baseDevices`, `pricePerYear`, `pricePerDevice`, `isPerpetual`                        |
| `Licence`     | `tenantId`, `licenceNumber`, `tierId`, `status` (`LicenceStatus`), `durationMonths`, `expiresAt`, `gracePeriodDays`, `paymentConfirmed` |
| `Device`      | `tenantId`, `deviceName`, `deviceType`, `serialNumber`, `hardwareId`, `fingerprint`, `licenceId`, `lastSeenAt`, `regionalBand`          |
| `DeviceSlot`  | `licenceId`, `paidAmount`, `addedAt`                                                                                                    |

### 2.11 Mobile releases (3)

| Model           | Key fields                                                                              | Notes                           |
| --------------- | --------------------------------------------------------------------------------------- | ------------------------------- |
| `MobileRelease` | `versionCode` (unique), `versionName`, `storageKey`, `sha256`, `mandatory`, `isCurrent` | Android OTA; one global channel |
| `IosRelease`    | `versionCode`, `versionName`, `storageKey`, `isCurrent`                                 | iOS Ad Hoc OTA                  |
| `IosDevice`     | `udid`, `product`, `name`, `registered`, `signatureVerified`                            | Enrolment queue (SEC-H2)        |

### 2.12 Identification and labels (9)

| Model                      | Key fields                                                                                                                         | Notes                                    |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `TenantIdentification`     | `tenantId` (key), `slug`, `mode` (`TenantIdMode`), `filterValue`, permalock and confidence settings                                | INTERNAL mode or GS1 mode                |
| `TenantGs1Prefix`          | `tenantId`, `prefix`, `gs1MemberOrg`, `capacity`, `status` (`Gs1PrefixStatus`)                                                     | Tenant-licensed GS1 prefix               |
| `IdentifierAllocation`     | `tenantId` + `individualAssetReference`, `authority`, `status`, `blockId?`, `consumedByAssetId`                                    | A consumed reference is never reissued   |
| `IdentifierBlock`          | `tenantId`, `deviceId`, `firstSequence`, `lastSequence`, `nextUnconsumed`, `status`, `expiresAt`                                   | Ranges issued to devices for offline use |
| `RfidTag`                  | `tenantId`, `tidHex` (identity), `epcHex`, `epcScheme`, `state` (`RfidTagState`), `lockState`, commissioning and retirement fields | Keyed on TID, never EPC                  |
| `AssetTagBinding`          | `tenantId`, `assetId`, `tagId`, `carrierType`, `payload`, `boundAt`, `unboundAt`                                                   | Tag to asset                             |
| `AssetSecondaryIdentifier` | `tenantId`, `assetId`, scheme, value, `isPrimary`, `validFrom`                                                                     | Provenance, never identity               |
| `LabelPrint`               | `tenantId`, `assetId`, `templateCode`, `symbology`, `payload`, `printerId`, `printedAt`, `scanVerified`                            | Print log                                |
| `LabelTemplate`            | `tenantId`, `name`, `config` (JSON)                                                                                                | Saved label designs                      |

### 2.13 Tables without their own `tenantId`

Row-level security (D5) must reach these through their parent or treat them as platform data.

| Kind                                  | Models                                                                                                                                                                                                                                                                                              | How tenancy is reached                                  |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| The tenant itself                     | `Tenant`                                                                                                                                                                                                                                                                                            | By `id`                                                 |
| Children of a tenant-scoped parent    | `UserRole`, `UserPermissionOverride`, `UserTwoFactor` (user); `Location` (site); `ClientAuthority` (client company); `DeviceSlot` (licence); `AuditCampaignAsset`, `AuditSnapshotAsset`, `AuditZoneSubmission`, `AuditReconciliationItem`, `AuditAdjustment` (campaign); `ScanSessionTag` (session) | Join to the parent                                      |
| Platform data, shared by every tenant | `LicenceTier`, `SmtpConfig`, `MobileRelease`, `IosRelease`, `IosDevice`                                                                                                                                                                                                                             | Platform-admin routes only                              |
| Security log                          | `LoginAttempt`                                                                                                                                                                                                                                                                                      | By `userId` or e-mail; written before a tenant is known |

Adding `tenantId` to the busiest child tables (scan and reconciliation tables) would make RLS policies simpler; that is a W4 design choice.

## 3. Enums (15)

| Enum                                                                                                                                                                                            | Values (summary)                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `DeploymentMode`                                                                                                                                                                                | `standalone` (default), `saas`, `hybrid`                                                                    |
| `LicenceStatus`                                                                                                                                                                                 | active, expiring, expired, suspended, revoked                                                               |
| `LicenceTierName`                                                                                                                                                                               | FREE, TIER_2, TIER_3                                                                                        |
| `OnboardingStep`                                                                                                                                                                                | user, company, client registration; licence activation                                                      |
| `AssetEventType`                                                                                                                                                                                | 21, from `CREATED` to `POSITION_CORRECTED` (includes `CONDITION_ASSESSED`, `IMPAIRED`, `REVALUED`, `DISPOSED`; the last three not yet written by any code) |
| `TenantIdMode`, `Gs1PrefixStatus`, `AllocationAuthority`, `AllocationStatus`, `IdentifierBlockStatus`, `EpcScheme`, `TagFormFactor`, `RfidTagState`, `CarrierType`, `SecondaryIdentifierScheme` | GS1 identification and RFID tag life cycle                                                                  |

Note: `AssetEventType` has no position values yet. S1.1 plans `POSITION_CAPTURED` and `POSITION_CORRECTED`.

## 4. Feature flags and module registry

### 4.1 What exists

Per-tenant switches are a JSON column, `Tenant.featureFlags` (default `{}`), read through `vairiot-api/src/lib/feature-flags.ts`:

| Function                      | Behaviour                                                                                                                                                                                 |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `parseFeatureFlags(raw)`      | Zod schema with four optional booleans and `.passthrough()`: unknown keys are kept, so a flag can be stored before the code that reads it ships. Invalid JSON gives `{}` (everything off) |
| `tenantHasFeature(tenant, f)` | `true` only when the flag is exactly `true`                                                                                                                                               |

Clients receive the flags from `GET /api/v1/auth/me` as `featureFlags` (`vairiot-shared` `auth.types.ts`; Android `ApiModels.kt`; iOS `Models/Auth.swift`).

### 4.2 The four flags

| Flag             | Meaning (from the code comment)                                         | Set by                     | Enforced at release #84                                                                                                | Stage 0.9 (W1a) and later                                                                                                                                                                                                                                         |
| ---------------- | ----------------------------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `blindAudit`     | Blind audit campaigns                                                   | Database or platform admin | **Yes**: `audit.service.ts` refuses blind campaigns; web `AuditsPage` and Android `AuditListViewModel` hide the option | Becomes a registry entry (W5)                                                                                                                                                                                                                                     |
| `gis`            | Map views and asset coordinates (S1)                                    | `seed:tuda` (on for TUDA)  | **No**: the GIS position work showed for every tenant                                                                  | **Being put behind the flag now (W1a, D7)**: API refuses position writes and the map endpoint with 404 (`requireFeature('gis')`), web hides position fields and the map, Android and iOS skip GPS capture and hide position UI. Data is kept when the flag is off |
| `ipsas`          | IPSAS asset accounting: ledger, depreciation policies, disclosures (S2) | `seed:tuda`                | Not read by any code                                                                                                   | Guards the S2 ledger as it is built                                                                                                                                                                                                                               |
| `reconciliation` | Register-to-ledger and count-to-register reconciliation (S4)            | `seed:tuda`                | Not read by any code (blind-audit reconciliation works without it)                                                     | Guards the S4 three-way engine                                                                                                                                                                                                                                    |

There is **no screen to switch a flag**. Flags are set by a seed or directly in the database, and a change is not written to `AuditEvent` (G14).

### 4.3 W1a guard (built in stage 0.9)

| Layer  | Mechanism                                                                                                                                                                                                                    |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API    | `middleware/require-feature.ts`: `requireFeature(flag)` answers 404 when the tenant has the flag off; `services/tenant-features.service.ts` reads the flag from the database on every call, so a switch takes effect at once |
| Web    | A `hasFeature` helper on the auth store and a `RequireFeature` route; navigation, map button, detail panel and form hide GIS when off                                                                                        |
| Mobile | Read from `/auth/me` and cached (`FeatureFlags.kt`, `FeatureFlags.swift`); GPS capture and position UI skipped when off                                                                                                      |
| Tests  | `assets/asset-gis-toggle.test.ts` (on and off, data kept); web `hasFeature.test.ts`; iOS `FeatureFlagsTests`                                                                                                                 |

### 4.4 Target: the module registry (W5, D7)

Built at stage 2.2 in `vairiot-shared/src/modules/module.registry.ts`: one entry per `featureFlags` key with name, description, status (`available` or `in_development`), the API routes it guards and the web paths it hides. The platform console switches modules per tenant (`PUT /admin/platform/tenants/:id/modules/:key`, audited). Sub-features such as `gis.positions`, dependencies and per-deployment defaults are not built yet.

| Element             | Target                                                                                                           |
| ------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Registry entry      | Module key, features, dependencies, routes, navigation items, permissions, default per deployment mode           |
| Modules (first set) | `blindAudit`; `gis` with `gis.positions` (S1) and later `gis.exchange` (S5); `ipsas` (S2); `reconciliation` (S4) |
| API                 | Every module route registered with `requireFeature`; a test fails on an unguarded module route                   |
| Web and admin       | Navigation and pages read the registry; hidden when off                                                          |
| Mobile              | Same flags from `/auth/me`; screens and capture skipped when off                                                 |
| Admin               | A toggle screen per tenant in `vairiot-admin`, each change written to `AuditEvent`                               |
| Toggle behaviour    | Off hides and refuses (404) but **never deletes** data; on again shows it unchanged                              |
| Tests               | Toggle matrix: every module on and off across API, web and mobile (test plan §3.1)                               |

## 5. Planned schema changes by sprint

From the sprint files; each lands as a Prisma migration in its own stage.

| Sprint | Change                                                                                                                                                                                                                                                                            |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1     | Positions on `AuditScanEvent` and `AuditSnapshotAsset`; `Photo` linked to scans with position and type; `PhotoRule`; `ConditionScale` and `conditionGrade`; position event types. Whether production moves to PostGIS (`geom` columns, GIST indexes) is a decision still to raise |
| S2     | **Built (stage 2.3):** `AssetClass` (`asset_classes`, row-level security), `Category.assetClassId`; on `Asset`: `assetClassId`, `acquisitionType`, `fairValueAtRecognition`, `sourceEntity`, `recognitionDate`, `capitalisedCost`, `recognitionStatus`, `recognitionOverride` and its reason; enums `IpsasClass`, `AcquisitionType`, `RecognitionStatus`. **Built (stages 2.5–2.7):** `Asset.custodian` (accountable person or unit, `CUSTODIAN_CHANGED` on the ledger), `Asset.parentAssetId` (self-relation, one level by trigger) and `componentRole`; `ComponentTemplate` (`component_templates`, row-level security). **To come:** accounting periods and depreciation runs, `Impairment`, import staging                                                                                                                                                         |
| S3     | Approval requests (maker–checker), zones with boundaries, teams and routes, QA samples and recounts, translations                                                                                                                                                                 |
| S4     | New reconciliation classes, three-way reconciliation, data-quality rules and results                                                                                                                                                                                              |
| S5     | GIS exchange metadata, handover export manifest                                                                                                                                                                                                                                   |
| W4     | Row-level security policies (D5), first on `Asset`, `AuditEvent`, `Photo`; durable audit writes                                                                                                                                                                                   |

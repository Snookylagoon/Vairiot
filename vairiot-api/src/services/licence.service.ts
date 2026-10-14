/**
 * Entry point for licensing. The implementation is split by concern:
 *   licence-status.service.ts    — status, validation and listing
 *   licence-lifecycle.service.ts — activate, renew, suspend, revoke, reactivate
 *   licence-device.service.ts    — device slots, registration and heartbeat
 *   licence-helpers.ts           — tenant family, status computation, audit
 * Callers import from here so the split stays an internal detail.
 */
export { getRootTenantId, getTenantFamily } from './licence-helpers';
export {
  getLicenceStatus,
  listLicences,
  validateLicence,
  type LicenceStatusResult,
} from './licence-status.service';
export {
  activateLicence,
  changeDuration,
  confirmPaymentAndRenew,
  reactivateLicence,
  revokeLicence,
  suspendLicence,
} from './licence-lifecycle.service';
export {
  activateDevice,
  addDeviceSlot,
  deactivateDevice,
  deleteDevice,
  heartbeatDevice,
  listDevices,
  registerDevice,
  touchDeviceOnLogin,
} from './licence-device.service';

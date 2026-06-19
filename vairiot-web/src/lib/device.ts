// Stable per-browser device identifier. Persisted in localStorage so the same
// browser keeps the same Device row across logins.

const FP_KEY = 'vairiot_device_fingerprint';

export function getDeviceFingerprint(): string {
  let fp = localStorage.getItem(FP_KEY);
  if (!fp) {
    fp = (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    localStorage.setItem(FP_KEY, fp);
  }
  return fp;
}

export function getDeviceName(): string {
  const ua = navigator.userAgent;
  let browser = 'Browser';
  if (/Edg\//.test(ua))           browser = 'Edge';
  else if (/Chrome\//.test(ua))   browser = 'Chrome';
  else if (/Firefox\//.test(ua))  browser = 'Firefox';
  else if (/Safari\//.test(ua))   browser = 'Safari';

  let os = 'Unknown OS';
  if (/Windows/.test(ua))         os = 'Windows';
  else if (/Mac OS X/.test(ua))   os = 'macOS';
  else if (/Android/.test(ua))    os = 'Android';
  else if (/iPhone|iPad|iOS/.test(ua)) os = 'iOS';
  else if (/Linux/.test(ua))      os = 'Linux';

  return `${browser} on ${os}`;
}

export function getDeviceCheckIn() {
  return {
    fingerprint: getDeviceFingerprint(),
    deviceName:  getDeviceName(),
    deviceType:  'browser',
  };
}

// Public sign-up can be closed at build time (standalone installs, one
// organisation per server): VITE_ALLOW_REGISTRATION=false hides the "New
// Registration" link and the /register page. The API refuses registration
// independently (ALLOW_REGISTRATION=false), so this only tidies the UI.
export function registrationOpen(flag: string | undefined = import.meta.env.VITE_ALLOW_REGISTRATION): boolean {
  return flag !== 'false';
}

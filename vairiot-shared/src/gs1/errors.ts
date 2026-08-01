/**
 * GS1 module error. `code` is machine-readable (Appendix A of the
 * implementation spec); `detail` carries the offending value.
 */
export class Gs1Error extends Error {
  readonly code: string;
  readonly detail: string;

  constructor(code: string, detail: string) {
    super(`${code}: ${detail}`);
    this.name = 'Gs1Error';
    this.code = code;
    this.detail = detail;
  }
}

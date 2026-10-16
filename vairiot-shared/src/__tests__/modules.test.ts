import { isModuleEnabled, isModuleKey, MODULE_KEYS, MODULES, ModuleKey, moduleDefinition } from '../modules/index.js';

describe('module registry', () => {
  it('has one entry per key, each described', () => {
    expect(new Set(MODULE_KEYS).size).toBe(MODULES.length);
    expect([...MODULE_KEYS].sort()).toEqual(Object.values(ModuleKey).sort());
    for (const m of MODULES) {
      expect(m.name.length).toBeGreaterThan(0);
      expect(m.description.length).toBeGreaterThan(0);
      for (const r of m.apiRoutes) expect(r.path.startsWith('/')).toBe(true);
    }
  });

  it('recognises keys', () => {
    expect(isModuleKey('gis')).toBe(true);
    expect(isModuleKey('payroll')).toBe(false);
    expect(moduleDefinition(ModuleKey.Ipsas).builtIn).toBe('S2');
  });

  it('treats only true as on', () => {
    expect(isModuleEnabled({ gis: true }, ModuleKey.Gis)).toBe(true);
    expect(isModuleEnabled({ gis: 'true' }, ModuleKey.Gis)).toBe(false);
    expect(isModuleEnabled({}, ModuleKey.Gis)).toBe(false);
    expect(isModuleEnabled(null, ModuleKey.Ipsas)).toBe(false);
  });
});

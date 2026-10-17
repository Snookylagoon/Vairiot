// Module registry (D7, stage 2.2): the switchable parts of the product, one
// per Tenant.featureFlags key. The API guards each module's routes with
// requireFeature(key) and answers 404 when it is off; the web console and the
// apps hide its screens. The toggle-matrix test walks `apiRoutes` below, so a
// guarded route belongs here.

export const ModuleKey = {
  BlindAudit:     'blindAudit',
  Gis:            'gis',
  Ipsas:          'ipsas',
  Reconciliation: 'reconciliation',
} as const;
export type ModuleKey = (typeof ModuleKey)[keyof typeof ModuleKey];

/** `available`: built and supported. `in_development`: switchable, still being built. */
export type ModuleStatus = 'available' | 'in_development';

export interface ModuleRoute {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Under /api/v1, Express style (`:id` is a campaign or asset id). */
  path: string;
}

export interface ModuleDefinition {
  key: ModuleKey;
  name: string;
  description: string;
  /** Where it was built (sprint), for the platform console. */
  builtIn: string;
  status: ModuleStatus;
  /** Routes that answer 404 while the module is off. */
  apiRoutes: ModuleRoute[];
  /** Web console paths hidden while the module is off. */
  webRoutes: string[];
}

export const MODULES: readonly ModuleDefinition[] = [
  {
    key: ModuleKey.BlindAudit,
    name: 'Blind audits',
    description: 'Counts in which field crews do not see the expected register.',
    builtIn: 'Before S0',
    status: 'available',
    apiRoutes: [],
    webRoutes: [],
  },
  {
    key: ModuleKey.Gis,
    name: 'GIS',
    description: 'Positions on assets, scans and photos; the asset map, campaign layer and base map.',
    builtIn: 'S1',
    status: 'available',
    apiRoutes: [
      { method: 'GET', path: '/assets/map' },
      { method: 'GET', path: '/assets/geo?bbox=44.7,41.6,44.9,41.8' },
      { method: 'GET', path: '/audits/:campaignId/map' },
      { method: 'GET', path: '/audits/:campaignId/scans/geo' },
      { method: 'GET', path: '/gis/map-settings' },
    ],
    webRoutes: ['/assets/map', '/admin/map-settings'],
  },
  {
    key: ModuleKey.Ipsas,
    name: 'IPSAS ledger',
    description: 'Asset classes and accounting policies, depreciation runs, periods and impairment.',
    builtIn: 'S2',
    status: 'in_development',
    apiRoutes: [
      { method: 'GET', path: '/accounting/settings' },
      { method: 'GET', path: '/accounting/classes' },
      { method: 'GET', path: '/accounting/assets/pending-review' },
      { method: 'GET', path: '/accounting/component-templates' },
      { method: 'GET', path: '/accounting/periods' },
    ],
    webRoutes: ['/accounting/classes', '/accounting/periods'],
  },
  {
    key: ModuleKey.Reconciliation,
    name: 'Three-way reconciliation',
    description: 'Register, ledger and count reconciled together.',
    builtIn: 'S4',
    status: 'in_development',
    apiRoutes: [],
    webRoutes: [],
  },
];

export const MODULE_KEYS: readonly ModuleKey[] = MODULES.map((m) => m.key);

export function isModuleKey(value: string): value is ModuleKey {
  return (MODULE_KEYS as readonly string[]).includes(value);
}

export function moduleDefinition(key: ModuleKey): ModuleDefinition {
  return MODULES.find((m) => m.key === key)!;
}

/** On only when the tenant's flags say exactly `true`. */
export function isModuleEnabled(flags: Record<string, unknown> | null | undefined, key: ModuleKey): boolean {
  return flags?.[key] === true;
}

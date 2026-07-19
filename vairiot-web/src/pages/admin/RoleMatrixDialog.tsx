import { X, FileDown, Check } from 'lucide-react';
import { useMemo } from 'react';
import { ROLE_PERMISSION_MATRIX, ControlPlane, type Permission } from 'vairiot-shared';

import { Button } from '@/components/ui/Button';

interface ModuleDef {
  key: string;
  label: string;
  view?: Permission;
  actions: { perm: Permission; label: string }[];
}

const MODULES: ModuleDef[] = [
  { key: 'asset',     label: 'Assets',                    view: 'asset:read',     actions: [{ perm: 'asset:write', label: 'Create / Update' }, { perm: 'asset:delete', label: 'Delete' }] },
  { key: 'site',      label: 'Sites & Locations',         view: 'site:read',      actions: [{ perm: 'site:write', label: 'Create / Update' }] },
  { key: 'category',  label: 'Categories',                view: 'category:read',  actions: [{ perm: 'category:write', label: 'Create / Update' }] },
  { key: 'audit',     label: 'Audit Campaigns',           view: 'audit:read',     actions: [{ perm: 'audit:write', label: 'Run / Manage' }] },
  { key: 'scan',      label: 'Scanning (RFID / Barcode)', actions: [{ perm: 'scan:execute', label: 'Execute Scan' }] },
  { key: 'report',    label: 'Reports',                   view: 'report:read',    actions: [{ perm: 'report:export', label: 'Export' }] },
  { key: 'workorder', label: 'Work Orders',               view: 'workorder:read', actions: [{ perm: 'workorder:write', label: 'Create / Update' }, { perm: 'workorder:assigned', label: 'Complete Assigned' }] },
  { key: 'user',      label: 'Users',                     view: 'user:read',      actions: [{ perm: 'user:write', label: 'Manage' }] },
  { key: 'apikey',    label: 'API Keys',                  view: 'apikey:read',    actions: [{ perm: 'apikey:write', label: 'Manage' }] },
  { key: 'company',   label: 'Company',                   actions: [{ perm: 'company:manage', label: 'Manage' }] },
  { key: 'client',    label: 'Client Companies',          view: 'client:read',    actions: [{ perm: 'client:manage', label: 'Manage' }] },
  { key: 'licence',   label: 'Licensing',                 actions: [{ perm: 'licence:manage', label: 'Manage' }] },
  { key: 'system',    label: 'System Configuration',      actions: [{ perm: 'system:configure', label: 'Configure' }] },
];

interface Row {
  moduleLabel: string;
  rowLabel: string;
  perm: Permission;
}

function buildRows(): Row[] {
  const out: Row[] = [];
  for (const m of MODULES) {
    if (m.view) out.push({ moduleLabel: m.label, rowLabel: 'View', perm: m.view });
    for (const a of m.actions) out.push({ moduleLabel: m.label, rowLabel: a.label, perm: a.perm });
  }
  return out;
}

interface Props {
  open: boolean;
  onClose: () => void;
  plane?: ControlPlane;
}

export function RoleMatrixDialog({ open, onClose, plane }: Props) {
  const roles = useMemo(
    () => ROLE_PERMISSION_MATRIX.filter(r => !plane || r.plane === plane),
    [plane],
  );
  const rows = useMemo(buildRows, []);

  if (!open) return null;

  const downloadAsWord = () => {
    const html = buildWordHtml(roles, rows);
    const blob = new Blob(['﻿', html], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vairiot-role-permission-matrix-${new Date().toISOString().slice(0,10)}.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  let lastModule = '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl max-w-[95vw] w-full max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-v-charcoal">Role Permission Matrix</h2>
            <p className="text-xs text-gray-400 mt-1">
              Default permissions for each system role. Ticked = function available; blank = not available.
              These are role defaults — per-user overrides are shown on the user's detail page.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={downloadAsWord}>
              <FileDown size={14} className="mr-1" /> Print to Word
            </Button>
            <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="overflow-auto p-5">
          <table className="text-xs border-collapse min-w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="sticky left-0 z-10 bg-gray-50 px-3 py-2 text-left font-medium text-gray-500 border border-gray-200 w-[160px] min-w-[160px]">Function</th>
                <th className="sticky left-[160px] z-10 bg-gray-50 px-3 py-2 text-left font-medium text-gray-500 border border-gray-200 w-[140px] min-w-[140px]">Capability</th>
                {roles.map(r => (
                  <th key={r.name} className="px-2 py-2 font-medium text-gray-500 border border-gray-200 align-bottom min-w-[80px] max-w-[80px]">
                    <div className="text-[11px] leading-tight text-center break-words">{r.name}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const showModule = row.moduleLabel !== lastModule;
                lastModule = row.moduleLabel;
                return (
                  <tr key={i} className={showModule && i !== 0 ? 'border-t-2 border-t-gray-200' : ''}>
                    <td className="sticky left-0 z-10 bg-white px-3 py-1.5 text-v-charcoal font-medium border border-gray-200 align-top w-[160px] min-w-[160px]">
                      {showModule ? row.moduleLabel : ''}
                    </td>
                    <td className="sticky left-[160px] z-10 bg-white px-3 py-1.5 text-gray-600 border border-gray-200 w-[140px] min-w-[140px]">
                      {row.rowLabel}
                    </td>
                    {roles.map(r => {
                      const has = r.permissions.includes(row.perm);
                      return (
                        <td key={r.name} className="px-2 py-1.5 text-center border border-gray-200">
                          {has ? <Check size={14} className="inline text-v-pink" strokeWidth={3} /> : ''}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function buildWordHtml(roles: typeof ROLE_PERMISSION_MATRIX, rows: Row[]): string {
  const tick = '✓';
  const FUNCTION_CM = 3.5;
  const CAPABILITY_CM = 2.8;
  const ROLE_COL_CM = ((27.7 - FUNCTION_CM - CAPABILITY_CM) / roles.length).toFixed(2);

  const colgroup = `
    <colgroup>
      <col style="width:${FUNCTION_CM}cm;mso-width-source:userset;" />
      <col style="width:${CAPABILITY_CM}cm;mso-width-source:userset;" />
      ${roles.map(() => `<col style="width:${ROLE_COL_CM}cm;mso-width-source:userset;" />`).join('')}
    </colgroup>`;

  const headerCells = roles.map(r =>
    `<th style="background:#f3f4f6;border:1px solid #d1d5db;padding:2px 3px;font-size:7pt;vertical-align:bottom;line-height:1.1;text-align:center;white-space:normal;word-wrap:break-word;overflow-wrap:break-word;width:${ROLE_COL_CM}cm;">${escapeHtml(r.name)}</th>`
  ).join('');

  let lastModule = '';
  const bodyRows = rows.map((row) => {
    const showModule = row.moduleLabel !== lastModule;
    lastModule = row.moduleLabel;
    const moduleCell = `<td style="border:1px solid #d1d5db;padding:2px 4px;font-weight:${showModule ? 'bold' : 'normal'};font-size:8pt;line-height:1.15;width:${FUNCTION_CM}cm;">${showModule ? escapeHtml(row.moduleLabel) : ''}</td>`;
    const capCell    = `<td style="border:1px solid #d1d5db;padding:2px 4px;font-size:8pt;color:#374151;line-height:1.15;width:${CAPABILITY_CM}cm;">${escapeHtml(row.rowLabel)}</td>`;
    const roleCells  = roles.map(r => {
      const has = r.permissions.includes(row.perm);
      return `<td style="border:1px solid #d1d5db;padding:2px;text-align:center;font-size:9pt;color:#d6336c;line-height:1;width:${ROLE_COL_CM}cm;">${has ? tick : ''}</td>`;
    }).join('');
    return `<tr style="page-break-inside:avoid;">${moduleCell}${capCell}${roleCells}</tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head>
  <meta charset="utf-8" />
  <title>Vairiot — Role Permission Matrix</title>
  <!--[if gte mso 9]>
  <xml>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
      <w:DoNotOptimizeForBrowser/>
      <w:Compatibility>
        <w:BreakWrappedTables/>
        <w:SnapToGridInCell/>
      </w:Compatibility>
    </w:WordDocument>
  </xml>
  <![endif]-->
  <style>
    @page Section1 {
      size: 29.7cm 21cm;
      mso-page-orientation: landscape;
      margin: 1cm 1cm 1cm 1cm;
      mso-header-margin: 0.5cm;
      mso-footer-margin: 0.5cm;
      mso-paper-source: 0;
    }
    div.Section1 { page: Section1; }

    body  { font-family: 'Montserrat', sans-serif; color: #1f2937; font-size: 8pt; margin: 0; }
    h1    { font-size: 13pt; margin: 0 0 2pt; }
    .meta { color: #6b7280; font-size: 8pt; margin: 0 0 6pt; }
    table { border-collapse: collapse; width: 100%; table-layout: fixed; page-break-inside: avoid; }
    th    { background: #f3f4f6; border: 1px solid #d1d5db; padding: 2px 3px; font-size: 7pt; vertical-align: bottom; line-height: 1.1; word-wrap: break-word; }
  </style>
</head>
<body>
  <div class="Section1">
    <h1>Vairiot — Role Permission Matrix</h1>
    <p class="meta">Generated ${new Date().toLocaleString()} · ${roles.length} role${roles.length === 1 ? '' : 's'} · ✓ = function available</p>
    <table>
      ${colgroup}
      <thead>
        <tr>
          <th style="text-align:left;width:${FUNCTION_CM}cm;">Function</th>
          <th style="text-align:left;width:${CAPABILITY_CM}cm;">Capability</th>
          ${headerCells}
        </tr>
      </thead>
      <tbody>
        ${bodyRows}
      </tbody>
    </table>
  </div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}

import { Router, Request, Response } from 'express';
import { requireAnyPermission } from '../../middleware/authorise';
import { asyncHandler } from '../../middleware/error-handler';
import {
  depreciationRegister, fixedAssetRegister, disposalReport,
  assetAgingReport, maintenanceCostReport,
} from '../../services/report.service';
import { getExporter, getAvailableReportTypes } from '../../services/report-export.service';

export const reportsRouter = Router();
reportsRouter.use(requireAnyPermission('asset:read'));

const CONTENT_TYPES: Record<string, string> = {
  csv:  'text/csv',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf:  'application/pdf',
};

const EXTENSIONS: Record<string, string> = {
  csv: '.csv', xlsx: '.xlsx', docx: '.docx', pdf: '.pdf',
};

reportsRouter.get('/export/types',
  asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    res.json({ types: getAvailableReportTypes() });
  }),
);

reportsRouter.get('/export/:reportType',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { reportType } = req.params;
    const format = (req.query.format as string) ?? 'pdf';

    if (!CONTENT_TYPES[format]) {
      res.status(400).json({ error: `Unsupported format: ${format}. Use csv, xlsx, docx, or pdf.` });
      return;
    }

    const exporter = getExporter(reportType);
    if (!exporter) {
      res.status(400).json({ error: `Unknown report type: ${reportType}`, available: getAvailableReportTypes() });
      return;
    }

    const { format: _f, ...filters } = req.query as Record<string, string>;

    const buffer = await exporter(req.user!.tenantId, { format: format as any, filters });
    const filename = `${reportType}-${new Date().toISOString().slice(0, 10)}${EXTENSIONS[format]}`;

    res.setHeader('Content-Type', CONTENT_TYPES[format]);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  }),
);

reportsRouter.get('/depreciation',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { categoryId, siteId, status, search, sortBy, sortOrder } = req.query as Record<string, string>;
    res.json(await depreciationRegister(req.user!.tenantId, { categoryId, siteId, status, search, sortBy, sortOrder }));
  }),
);

reportsRouter.get('/fixed-assets',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { categoryId, siteId, status, search, sortBy, sortOrder } = req.query as Record<string, string>;
    res.json(await fixedAssetRegister(req.user!.tenantId, { categoryId, siteId, status, search, sortBy, sortOrder }));
  }),
);

reportsRouter.get('/disposals',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { from, to, search, sortBy, sortOrder } = req.query as Record<string, string>;
    res.json(await disposalReport(req.user!.tenantId, { from, to, search, sortBy, sortOrder }));
  }),
);

reportsRouter.get('/aging',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { categoryId, siteId, status, search, sortBy, sortOrder } = req.query as Record<string, string>;
    res.json(await assetAgingReport(req.user!.tenantId, { categoryId, siteId, status, search, sortBy, sortOrder }));
  }),
);

reportsRouter.get('/maintenance-costs',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { from, to, assetId, search, sortBy, sortOrder } = req.query as Record<string, string>;
    res.json(await maintenanceCostReport(req.user!.tenantId, { from, to, assetId, search, sortBy, sortOrder }));
  }),
);

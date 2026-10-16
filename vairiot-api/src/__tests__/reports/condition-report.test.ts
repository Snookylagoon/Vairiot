import axios from 'axios';

import { prisma } from '../../lib/prisma';
import { exportAssetCondition } from '../../services/report-export.service';

// The condition report counts by grade (stage 1.16), so strings from before
// the scale, such as "excellent", land in their grade's column.
jest.mock('axios');
const post = axios.post as jest.MockedFunction<typeof axios.post>;
const TID = 'test-condition-report-tenant';

beforeAll(async () => {
  await prisma.tenant.upsert({ where: { id: TID }, update: {}, create: { id: TID, name: 'Condition Report' } });
  const rows = [
    { condition: 'excellent', conditionGrade: null },
    { condition: 'new', conditionGrade: 5 },
    { condition: 'fair', conditionGrade: 3 },
    { condition: 'whatever', conditionGrade: 1 },
  ];
  await prisma.asset.createMany({ data: rows.map((r, i) => ({ tenantId: TID, assetNumber: `CR-${i}`, name: `Asset ${i}`, ...r })) });
});

afterAll(async () => {
  await prisma.asset.deleteMany({ where: { tenantId: TID } });
  await prisma.tenant.deleteMany({ where: { id: TID } });
  await prisma.$disconnect();
});

it('buckets assets by grade, falling back to the string’s grade', async () => {
  post.mockResolvedValue({ data: Buffer.from('pdf') });
  await exportAssetCondition(TID, { format: 'pdf' });
  const payload = post.mock.calls[0][1] as { totals: Record<string, number> };
  expect(payload.totals).toMatchObject({ totalAssets: 4, new: 2, good: 0, fair: 1, poor: 0, damaged: 1 });
});

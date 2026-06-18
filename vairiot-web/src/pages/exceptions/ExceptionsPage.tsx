import { useNavigate } from 'react-router-dom';
import { AlertTriangle, FileWarning, Wrench, MapPinOff, ShieldAlert } from 'lucide-react';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { useExceptions } from '@/hooks/useExceptions';

function SummaryCard({ icon: Icon, label, count, color }: { icon: typeof AlertTriangle; label: string; count: number; color: string }) {
  return (
    <Card>
      <CardBody className="flex items-center gap-4">
        <div className={`p-3 rounded-lg ${color}`}>
          <Icon size={24} className="text-white" />
        </div>
        <div>
          <p className="text-2xl font-bold text-v-charcoal">{count}</p>
          <p className="text-xs text-gray-500">{label}</p>
        </div>
      </CardBody>
    </Card>
  );
}

export function ExceptionsPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useExceptions();

  if (isLoading) return <div className="p-8 text-center text-gray-400">Loading...</div>;
  if (!data) return <div className="p-8 text-center text-gray-400">Failed to load exceptions.</div>;

  const { summary, overdueMaintenanceEvents, expiredWarrantyAssets, unlocatedAssets } = data;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-v-charcoal">Exceptions Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Items requiring attention across the asset register</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard icon={FileWarning} label="Missing Documents" count={summary.missingDocuments} color="bg-amber-500" />
        <SummaryCard icon={Wrench} label="Overdue Maintenance" count={summary.overdueMaintenanceCount} color="bg-red-500" />
        <SummaryCard icon={ShieldAlert} label="Expired Warranty" count={summary.expiredWarrantyCount} color="bg-orange-500" />
        <SummaryCard icon={MapPinOff} label="Unlocated Assets" count={summary.unlocatedAssetCount} color="bg-purple-500" />
      </div>

      {overdueMaintenanceEvents.length > 0 && (
        <Card>
          <CardHeader className="flex items-center gap-2">
            <Wrench size={16} className="text-red-500" />
            <span className="font-semibold text-v-charcoal text-sm">Overdue Maintenance</span>
          </CardHeader>
          <CardBody>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="py-2 text-left text-xs font-semibold text-gray-500 uppercase">Asset</th>
                  <th className="py-2 text-left text-xs font-semibold text-gray-500 uppercase">Type</th>
                  <th className="py-2 text-left text-xs font-semibold text-gray-500 uppercase">Scheduled</th>
                  <th className="py-2 text-left text-xs font-semibold text-gray-500 uppercase">Vendor</th>
                </tr>
              </thead>
              <tbody>
                {overdueMaintenanceEvents.map(evt => (
                  <tr key={evt.id} onClick={() => navigate(`/assets/${evt.asset.id}`)}
                    className="border-b border-gray-50 hover:bg-v-wash cursor-pointer last:border-0">
                    <td className="py-2">
                      <span className="font-mono text-xs text-v-violet">{evt.asset.assetNumber}</span>
                      <span className="ml-2">{evt.asset.name}</span>
                    </td>
                    <td className="py-2 capitalize text-gray-600">{evt.maintenanceType}</td>
                    <td className="py-2 text-red-600">{new Date(evt.scheduledDate).toLocaleDateString('en-GB')}</td>
                    <td className="py-2 text-gray-500">{evt.vendor ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}

      {expiredWarrantyAssets.length > 0 && (
        <Card>
          <CardHeader className="flex items-center gap-2">
            <ShieldAlert size={16} className="text-orange-500" />
            <span className="font-semibold text-v-charcoal text-sm">Expired Warranties</span>
          </CardHeader>
          <CardBody>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="py-2 text-left text-xs font-semibold text-gray-500 uppercase">Asset</th>
                  <th className="py-2 text-left text-xs font-semibold text-gray-500 uppercase">Warranty Expired</th>
                </tr>
              </thead>
              <tbody>
                {expiredWarrantyAssets.map(a => (
                  <tr key={a.id} onClick={() => navigate(`/assets/${a.id}`)}
                    className="border-b border-gray-50 hover:bg-v-wash cursor-pointer last:border-0">
                    <td className="py-2">
                      <span className="font-mono text-xs text-v-violet">{a.assetNumber}</span>
                      <span className="ml-2">{a.name}</span>
                    </td>
                    <td className="py-2 text-orange-600">{new Date(a.warrantyExpiry).toLocaleDateString('en-GB')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}

      {unlocatedAssets.length > 0 && (
        <Card>
          <CardHeader className="flex items-center gap-2">
            <MapPinOff size={16} className="text-purple-500" />
            <span className="font-semibold text-v-charcoal text-sm">Unlocated Assets</span>
          </CardHeader>
          <CardBody>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="py-2 text-left text-xs font-semibold text-gray-500 uppercase">Asset Number</th>
                  <th className="py-2 text-left text-xs font-semibold text-gray-500 uppercase">Name</th>
                </tr>
              </thead>
              <tbody>
                {unlocatedAssets.map(a => (
                  <tr key={a.id} onClick={() => navigate(`/assets/${a.id}`)}
                    className="border-b border-gray-50 hover:bg-v-wash cursor-pointer last:border-0">
                    <td className="py-2 font-mono text-xs text-v-violet">{a.assetNumber}</td>
                    <td className="py-2">{a.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

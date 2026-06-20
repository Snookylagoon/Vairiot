import { Bell, BellOff, Plus } from 'lucide-react';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useAlertSubscriptions, useSubscribeAlert, useToggleAlert, useUnsubscribeAlert } from '@/hooks/useAlerts';
import { ExceptionType } from 'vairiot-shared';

const EXCEPTION_TYPES = [
  { value: ExceptionType.MissingDocuments,   label: 'Missing Documents',   desc: 'Assets without any attached documents' },
  { value: ExceptionType.OverdueMaintenance, label: 'Overdue Maintenance', desc: 'Maintenance events past their scheduled date' },
  { value: ExceptionType.ExpiredWarranty,    label: 'Expired Warranty',    desc: 'Assets with expired warranty dates' },
  { value: ExceptionType.UnlocatedAssets,    label: 'Unlocated Assets',    desc: 'Assets with no site assigned' },
];

export function AlertsPage() {
  const { data: subscriptions = [], isLoading } = useAlertSubscriptions();
  const subscribe = useSubscribeAlert();
  const toggle = useToggleAlert();
  const unsubscribe = useUnsubscribeAlert();

  const subscribedTypes = new Set(subscriptions.map(s => s.exceptionType));

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-v-charcoal">Alert Subscriptions</h1>
        <p className="text-sm text-gray-500 mt-1">Choose which exception types you want to receive email digests for</p>
      </div>

      <Card>
        <CardHeader className="flex items-center gap-2">
          <Bell size={16} className="text-v-violet" />
          <span className="font-semibold text-v-charcoal text-sm">Exception Types</span>
        </CardHeader>
        <CardBody className="divide-y divide-gray-50">
          {isLoading && <p className="text-sm text-gray-400 text-center py-4">Loading...</p>}
          {EXCEPTION_TYPES.map(et => {
            const sub = subscriptions.find(s => s.exceptionType === et.value);
            const isSubscribed = subscribedTypes.has(et.value);
            return (
              <div key={et.value} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium text-v-charcoal">{et.label}</p>
                  <p className="text-xs text-gray-500">{et.desc}</p>
                  {sub && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      {sub.frequency} digest via {sub.channel}
                      {sub.lastSentAt && ` — last sent ${new Date(sub.lastSentAt).toLocaleDateString('en-GB')}`}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {isSubscribed ? (
                    <>
                      <button onClick={() => toggle.mutate({ type: et.value, active: !sub!.active })}
                        className={`p-1.5 rounded-lg transition-colors ${sub!.active ? 'text-v-violet hover:bg-v-wash' : 'text-gray-400 hover:bg-gray-100'}`}
                        title={sub!.active ? 'Pause' : 'Resume'}>
                        {sub!.active ? <Bell size={16} /> : <BellOff size={16} />}
                      </button>
                      <Button size="sm" variant="secondary" onClick={() => unsubscribe.mutate(et.value)}>
                        Unsubscribe
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" variant="secondary" onClick={() => subscribe.mutate({ exceptionType: et.value })}>
                      <Plus size={14} className="mr-1" /> Subscribe
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </CardBody>
      </Card>
    </div>
  );
}

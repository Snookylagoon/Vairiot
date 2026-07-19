import {
  ArrowLeftRight, Wrench, LogIn, LogOut, FileText, Camera,
  Trash2, Archive, PlusCircle, Pencil,
} from 'lucide-react';

import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { useTimeline } from '@/hooks/useTimeline';
import type { TimelineEntry } from '@/types';

const TYPE_CONFIG: Record<string, { icon: React.ElementType; colour: string; label: string }> = {
  created:     { icon: PlusCircle, colour: 'text-emerald-500', label: 'Created' },
  updated:     { icon: Pencil, colour: 'text-sky-500', label: 'Updated' },
  transfer:    { icon: ArrowLeftRight, colour: 'text-v-violet', label: 'Transfer' },
  maintenance: { icon: Wrench, colour: 'text-amber-500', label: 'Maintenance' },
  checkout:    { icon: LogOut, colour: 'text-v-pink', label: 'Checked Out' },
  checkin:     { icon: LogIn, colour: 'text-emerald-500', label: 'Checked In' },
  document:    { icon: FileText, colour: 'text-sky-500', label: 'Document' },
  photo:       { icon: Camera, colour: 'text-v-mauve', label: 'Photo' },
  disposed:    { icon: Trash2, colour: 'text-red-500', label: 'Disposed' },
  archived:    { icon: Archive, colour: 'text-gray-400', label: 'Archived' },
};

function TimelineItem({ entry }: { entry: TimelineEntry }) {
  const cfg = TYPE_CONFIG[entry.type] ?? TYPE_CONFIG.updated;
  const Icon = cfg.icon;
  return (
    <div className="flex gap-3 py-3">
      <div className="flex flex-col items-center">
        <div className={`p-1.5 rounded-full bg-white border border-gray-100 ${cfg.colour}`}>
          <Icon size={14} />
        </div>
        <div className="flex-1 w-px bg-gray-100 mt-1" />
      </div>
      <div className="flex-1 min-w-0 pb-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-v-charcoal">{cfg.label}</span>
          <span className="text-xs text-gray-400">{new Date(entry.date).toLocaleString('en-GB')}</span>
        </div>
        <p className="text-sm text-gray-600 mt-0.5">{entry.summary}</p>
        {entry.actor && <p className="text-xs text-gray-400 mt-0.5">by {entry.actor}</p>}
      </div>
    </div>
  );
}

export function AssetTimeline({ assetId }: { assetId: string }) {
  const { data: entries = [], isLoading } = useTimeline(assetId);

  return (
    <Card>
      <CardHeader className="flex items-center gap-2">
        <PlusCircle size={16} className="text-v-violet" />
        <span className="font-semibold text-v-charcoal text-sm">Lifecycle Timeline</span>
        <span className="ml-auto text-xs text-gray-400">{entries.length} events</span>
      </CardHeader>
      <CardBody>
        {isLoading && <p className="text-sm text-gray-400 text-center py-4">Loading timeline...</p>}
        {!isLoading && entries.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No timeline events yet.</p>}
        <div className="divide-y-0">
          {entries.map(entry => (
            <TimelineItem key={entry.id} entry={entry} />
          ))}
        </div>
      </CardBody>
    </Card>
  );
}

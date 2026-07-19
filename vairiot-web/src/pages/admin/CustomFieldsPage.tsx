import { Settings2, Plus, Trash2, GripVertical } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Textarea } from '@/components/ui/Textarea';
import { useCustomFields, useCreateCustomField, useDeleteCustomField } from '@/hooks/useCustomFields';

const FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'boolean', label: 'Yes/No' },
  { value: 'select', label: 'Dropdown' },
] as const;

export function CustomFieldsPage() {
  const { data: fields = [], isLoading } = useCustomFields();
  const createField = useCreateCustomField();
  const deleteField = useDeleteCustomField();

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [label, setLabel] = useState('');
  const [fieldType, setFieldType] = useState('text');
  const [required, setRequired] = useState(false);
  const [optionsText, setOptionsText] = useState('');

  const handleCreate = () => {
    if (!name || !label) return;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    createField.mutate({
      name: slug,
      label,
      fieldType,
      required,
      options: fieldType === 'select' ? optionsText.split('\n').map(s => s.trim()).filter(Boolean) : undefined,
    }, {
      onSuccess: () => {
        setShowForm(false);
        setName(''); setLabel(''); setFieldType('text'); setRequired(false); setOptionsText('');
      },
    });
  };

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-v-charcoal">Custom Fields</h1>
          <p className="text-sm text-gray-500 mt-1">Define additional fields for your assets</p>
        </div>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          <Plus size={14} className="mr-1" /> New Field
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardBody className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-v-charcoal mb-1">Label *</label>
                <input value={label}
                  onChange={e => { setLabel(e.target.value); if (!name) setName(e.target.value); }}
                  placeholder="e.g. Department"
                  className="w-full text-sm rounded-lg border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-v-pink" />
              </div>
              <div>
                <label className="block text-sm font-medium text-v-charcoal mb-1">Field Name (slug) *</label>
                <input value={name} onChange={e => setName(e.target.value)}
                  placeholder="e.g. department"
                  className="w-full text-sm rounded-lg border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-v-pink font-mono" />
              </div>
              <div>
                <label className="block text-sm font-medium text-v-charcoal mb-1">Type</label>
                <select value={fieldType} onChange={e => setFieldType(e.target.value)}
                  className="w-full text-sm rounded-lg border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-v-pink bg-white">
                  {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div className="flex items-end gap-4 pb-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={required} onChange={e => setRequired(e.target.checked)}
                    className="rounded border-gray-300 text-v-violet focus:ring-v-pink" />
                  <span className="text-sm text-v-charcoal">Required</span>
                </label>
              </div>
            </div>
            {fieldType === 'select' && (
              <Textarea label="Options (one per line)" value={optionsText}
                onChange={e => setOptionsText(e.target.value)}
                rows={4} placeholder={"Option A\nOption B\nOption C"} />
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button size="sm" onClick={handleCreate} loading={createField.isPending}
                disabled={!name || !label}>
                Create Field
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader className="flex items-center gap-2">
          <Settings2 size={16} className="text-v-violet" />
          <span className="font-semibold text-v-charcoal text-sm">Custom Field Definitions</span>
        </CardHeader>
        <CardBody className="divide-y divide-gray-50">
          {isLoading && <p className="text-sm text-gray-400 text-center py-4">Loading…</p>}
          {!isLoading && fields.length === 0 && (
            <div className="py-8 text-center">
              <Settings2 size={28} className="mx-auto text-gray-300 mb-2" />
              <p className="text-sm text-gray-400">No custom fields defined yet.</p>
              <p className="text-xs text-gray-400 mt-1">Custom fields appear on the asset form and are stored per asset.</p>
            </div>
          )}
          {fields.map(f => (
            <div key={f.id} className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3 min-w-0">
                <GripVertical size={14} className="text-gray-300 shrink-0" />
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-v-charcoal">{f.label}</p>
                    <Badge label={f.fieldType} variant="default" />
                    {f.required && <Badge label="required" variant="active" />}
                  </div>
                  <p className="text-xs text-gray-400 font-mono mt-0.5">{f.name}</p>
                  {f.options.length > 0 && (
                    <div className="flex gap-1 mt-1">
                      {f.options.map(o => (
                        <span key={o} className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">{o}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <button onClick={() => deleteField.mutate(f.id)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
                title="Remove">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}

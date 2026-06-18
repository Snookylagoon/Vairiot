import { useState } from 'react';
import { Plus, Trash2, Tag } from 'lucide-react';
import { useCategories, useCreateCategory, useDeleteCategory } from '@/hooks/useCategories';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardBody } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { hasPermission, useAuthStore } from '@/stores/auth.store';

export function CategoriesPage() {
  const user = useAuthStore(s => s.user);
  const canWrite = hasPermission(user, 'category:write');
  const { data: categories = [], isLoading } = useCategories();
  const createCategory = useCreateCategory();
  const deleteCategory = useDeleteCategory();
  const [name, setName]   = useState('');
  const [desc, setDesc]   = useState('');
  const [error, setError] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!name.trim()) { setError('Name is required'); return; }
    try {
      setError('');
      await createCategory.mutateAsync({ name: name.trim(), description: desc.trim() || undefined });
      setName(''); setDesc('');
    } catch {
      setError('Failed to create category — name may already exist.');
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-v-charcoal">Categories</h1>
        <p className="text-sm text-gray-500 mt-1">Organise assets into categories for easier filtering and reporting.</p>
      </div>

      {canWrite && (
        <Card>
          <CardBody className="space-y-3">
            <h3 className="font-semibold text-v-charcoal text-sm">Add New Category</h3>
            <Input label="Category Name" placeholder="e.g. IT Equipment"
              value={name} onChange={e => setName(e.target.value)} error={error} />
            <Input label="Description (optional)" placeholder="Brief description"
              value={desc} onChange={e => setDesc(e.target.value)} />
            <Button onClick={handleCreate} loading={createCategory.isPending}>
              <Plus size={15} className="mr-1.5" /> Add Category
            </Button>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardBody className="divide-y divide-gray-50">
          {isLoading && <p className="text-sm text-gray-400 py-4 text-center">Loading…</p>}
          {categories.length === 0 && !isLoading && (
            <div className="py-8 text-center">
              <Tag size={28} className="mx-auto text-gray-300 mb-2" />
              <p className="text-sm text-gray-400">No categories yet — add one above.</p>
            </div>
          )}
          {categories.map((c: { id: string; name: string; description?: string; _count?: { assets: number } }) => (
            <div key={c.id} className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium text-v-charcoal">{c.name}</p>
                {c.description && <p className="text-xs text-gray-400">{c.description}</p>}
                <p className="text-xs text-v-mauve mt-0.5">{c._count?.assets ?? 0} assets</p>
              </div>
              {canWrite && (
                <button onClick={() => setDeleteId(c.id)}
                  className="p-1.5 text-gray-300 hover:text-red-500 transition-colors rounded">
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          ))}
        </CardBody>
      </Card>

      <ConfirmDialog
        open={deleteId !== null}
        title="Delete Category"
        description="This category will be permanently deleted. Assets in this category will become uncategorised."
        confirmLabel="Delete"
        loading={deleteCategory.isPending}
        onConfirm={() => { if (deleteId) { deleteCategory.mutate(deleteId); setDeleteId(null); } }}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}

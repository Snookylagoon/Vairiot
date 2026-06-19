import clsx from 'clsx';

interface BadgeProps {
  label?: string;
  variant?: 'active' | 'inactive' | 'maintenance' | 'disposed' | 'default' | 'green' | 'yellow' | 'red' | 'gray';
  children?: React.ReactNode;
}

const variants = {
  active:      'bg-green-100 text-green-800',
  inactive:    'bg-gray-100 text-gray-600',
  maintenance: 'bg-amber-100 text-amber-800',
  disposed:    'bg-red-100 text-red-700',
  default:     'bg-v-wash text-v-violet',
  green:       'bg-green-100 text-green-800',
  yellow:      'bg-amber-100 text-amber-800',
  red:         'bg-red-100 text-red-700',
  gray:        'bg-gray-100 text-gray-600',
};

export function Badge({ label, variant = 'default', children }: BadgeProps) {
  return (
    <span className={clsx('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', variants[variant])}>
      {children ?? label}
    </span>
  );
}

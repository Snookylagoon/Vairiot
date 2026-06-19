import clsx from 'clsx';
import { HTMLAttributes } from 'react';

export function Card({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx('bg-white rounded-xl border border-gray-100 shadow-v-card', className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx('px-6 py-4 border-b border-gray-100', className)} {...props}>{children}</div>;
}

export function CardBody({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx('px-6 py-4', className)} {...props}>{children}</div>;
}

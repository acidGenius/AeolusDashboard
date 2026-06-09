import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-sm border px-2 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-[#27272a] text-[#a1a1aa]',
        hit: 'border-emerald-800/50 bg-emerald-500/10 text-emerald-400',
        miss: 'border-red-800/50 bg-red-500/10 text-red-400',
        open: 'border-[#27272a] bg-transparent text-[#71717a]',
        high: 'border-cyan-800/50 bg-cyan-500/10 text-cyan-400',
        medium: 'border-yellow-800/50 bg-yellow-500/10 text-yellow-400',
        low: 'border-orange-800/50 bg-orange-500/10 text-orange-400',
        value: 'border-purple-800/50 bg-purple-500/10 text-purple-400',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };

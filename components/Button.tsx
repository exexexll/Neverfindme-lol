'use client';

import { cn } from '@/lib/utils';
import Link from 'next/link';

interface ButtonProps {
  children: React.ReactNode;
  variant?: 'primary' | 'ghost';
  href: string;
  className?: string;
}

export function Button({ children, variant = 'primary', href, className }: ButtonProps) {
  const baseStyles = 'inline-flex items-center justify-center rounded-lg px-6 py-3 text-base font-medium transition-all duration-200 focus-ring';
  
  const variantStyles = {
    primary: 'bg-[#fcf290] text-[#0a0a0c] hover:bg-[#ff8a54] active:scale-95',
    ghost: 'bg-white/10 text-[#e6e6e9] backdrop-blur-sm hover:bg-white/20 active:scale-95',
  };

  return (
    <Link href={href} className={cn(baseStyles, variantStyles[variant], className)}>
      {children}
    </Link>
  );
}


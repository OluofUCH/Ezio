import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

// shadcn/ui's Slot + CVA composition, adapted to the existing application tokens.
const buttonVariants = cva(
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors focus-visible:[outline:revert] disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-on-primary [@media(hover:hover)]:hover:bg-primary/90',
        outline: 'border border-outline bg-surface text-on-surface [@media(hover:hover)]:hover:bg-surface-container',
        ghost: 'text-on-surface [@media(hover:hover)]:hover:bg-surface-container',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants> & { asChild?: boolean }

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, asChild = false, type, ...props }, ref) => {
    const Component = asChild ? Slot : 'button'
    return <Component ref={ref} type={asChild ? undefined : (type ?? 'button')} className={cn(buttonVariants({ variant, className }))} {...props} />
  },
)
Button.displayName = 'Button'

export { Button, buttonVariants }

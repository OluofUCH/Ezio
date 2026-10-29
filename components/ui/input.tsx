import * as React from 'react'
import { cn } from '@/lib/utils'

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type, ...props }, ref) => (
    <input ref={ref} type={type} className={cn(
      'flex min-h-11 w-full min-w-0 rounded-lg border border-outline bg-surface px-3 py-2 text-base text-on-surface placeholder:text-on-surface-variant focus-visible:[outline:revert] disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-error',
      className,
    )} {...props} />
  ),
)
Input.displayName = 'Input'

export { Input }

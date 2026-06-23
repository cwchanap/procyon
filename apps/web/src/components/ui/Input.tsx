import React from 'react';
import { cn } from '../../lib/utils';

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
	({ className, type, ...props }, ref) => {
		return (
			<input
				type={type}
				className={cn(
					'flex h-10 w-full rounded-md border border-line bg-ink-800 px-3 py-2 text-sm text-ivory placeholder:text-ivory-dim/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass focus-visible:border-line-brass disabled:cursor-not-allowed disabled:opacity-50 transition-colors',
					className
				)}
				ref={ref}
				{...props}
			/>
		);
	}
);
Input.displayName = 'Input';

export { Input };

import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

const chileNumberFormat = new Intl.NumberFormat('es-CL')

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Chilean thousands separator (.) while keeping English UI copy. */
export function formatNumber(value: number): string {
  return chileNumberFormat.format(value)
}

import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

const chileNumberFormat = new Intl.NumberFormat('es-CL')
const dateTimeFormat = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Chilean thousands separator (.) while keeping English UI copy. */
export function formatNumber(value: number): string {
  return chileNumberFormat.format(value)
}

export function formatDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso))
}

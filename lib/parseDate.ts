// iOS JSC/Hermes rejects 'YYYY-MM-DD' bare strings — replace hyphens with slashes for reliable local-time parsing
export function parseDate(dateStr: string): Date {
  return new Date(dateStr.replace(/-/g, '/') + ' 12:00:00')
}

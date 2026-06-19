// Explicit constructor — works on iOS JSC/Hermes/V8, unlike new Date('YYYY-MM-DD') or new Date('YYYY/MM/DD HH:mm:ss')
export function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d, 12, 0, 0)
}

export const COLORS = {
  primary: '#7c3aed',
  secondary: '#ec4899',
  background: '#f5f3ff',
  surface: 'rgba(255,255,255,0.85)',
  text: '#111827',
  textLight: '#6b7280',
  danger: '#ef4444',
  success: '#10b981',
  warning: '#f59e0b',
  border: 'rgba(255,255,255,0.7)',
  gradient: ['#7c3aed', '#ec4899'] as const,
}

export const RADIUS = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 24,
}

export const SHADOW = {
  card: {
    shadowColor: '#7c3aed',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },
}

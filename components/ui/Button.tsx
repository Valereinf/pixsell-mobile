// TODO: reusable Button component
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet } from 'react-native'

interface ButtonProps {
  title: string
  onPress: () => void
  loading?: boolean
  disabled?: boolean
  variant?: 'primary' | 'secondary'
}

export default function Button({ title, onPress, loading, disabled, variant = 'primary' }: ButtonProps) {
  const isPrimary = variant === 'primary'
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      style={[styles.base, isPrimary ? styles.primary : styles.secondary, (disabled || loading) && styles.disabled]}
    >
      {loading
        ? <ActivityIndicator color="#fff" size="small" />
        : <Text style={[styles.label, !isPrimary && styles.labelSecondary]}>{title}</Text>
      }
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  base:          { paddingVertical: 14, paddingHorizontal: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  primary:       { backgroundColor: '#7c3aed' },
  secondary:     { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#7c3aed' },
  disabled:      { opacity: 0.5 },
  label:         { color: '#fff', fontWeight: '600', fontSize: 15 },
  labelSecondary:{ color: '#7c3aed' },
})

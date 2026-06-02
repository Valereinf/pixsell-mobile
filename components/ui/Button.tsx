import { TouchableOpacity, Text, ViewStyle, ActivityIndicator } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { COLORS, RADIUS } from '../../constants/theme'

interface ButtonProps {
  label: string
  onPress: () => void
  variant?: 'primary' | 'danger' | 'ghost'
  style?: ViewStyle
  disabled?: boolean
  loading?: boolean
}

export default function Button({ label, onPress, variant = 'primary', style, disabled, loading }: ButtonProps) {
  if (variant === 'primary') {
    return (
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled || loading}
        style={[{ borderRadius: RADIUS.md, overflow: 'hidden', opacity: disabled || loading ? 0.5 : 1 }, style]}
      >
        <LinearGradient
          colors={[COLORS.primary, COLORS.secondary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ paddingVertical: 14, alignItems: 'center' }}
        >
          {loading
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>{label}</Text>
          }
        </LinearGradient>
      </TouchableOpacity>
    )
  }
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      style={[{
        borderRadius: RADIUS.md,
        paddingVertical: 14,
        alignItems: 'center',
        opacity: disabled || loading ? 0.5 : 1,
        backgroundColor: variant === 'danger' ? 'rgba(239,68,68,0.1)' : 'transparent',
      }, style]}
    >
      <Text style={{ color: variant === 'danger' ? COLORS.danger : COLORS.primary, fontWeight: '600', fontSize: 15 }}>
        {label}
      </Text>
    </TouchableOpacity>
  )
}

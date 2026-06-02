import { View, ViewStyle, ViewProps } from 'react-native'
import { COLORS, RADIUS, SHADOW } from '../../constants/theme'

interface CardProps extends ViewProps {
  children: React.ReactNode
  style?: ViewStyle
}

export default function Card({ children, style, ...props }: CardProps) {
  return (
    <View style={[{
      backgroundColor: COLORS.surface,
      borderRadius: RADIUS.lg,
      padding: 16,
      borderWidth: 1,
      borderColor: COLORS.border,
      ...SHADOW.card,
    }, style]} {...props}>
      {children}
    </View>
  )
}

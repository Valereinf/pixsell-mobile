// TODO: reusable Card component
import { View, StyleSheet, ViewProps } from 'react-native'

export default function Card({ children, style, ...props }: ViewProps) {
  return <View style={[styles.card, style]} {...props}>{children}</View>
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#1a1a1a', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#2a2a2a' },
})

// TODO: shared Header component
import { View, Text, StyleSheet } from 'react-native'

interface HeaderProps {
  title: string
}

export default function Header({ title }: HeaderProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#111', paddingTop: 56, paddingBottom: 16, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#1f1f1f' },
  title:     { color: '#fff', fontSize: 20, fontWeight: '700' },
})

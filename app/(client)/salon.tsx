import { WebView } from 'react-native-webview'
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'

export default function SalonWebView() {
  const { slug, domain } = useLocalSearchParams<{ slug: string; domain?: string }>()
  const router = useRouter()

  const url = domain
    ? `https://${domain}`
    : `https://app.pixsellmedia.ca/${slug}`

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#7c3aed" />
        </TouchableOpacity>
        <Text style={s.title}>{slug}</Text>
        <View style={{ width: 40 }} />
      </View>
      <WebView
        source={{ uri: url }}
        style={{ flex: 1 }}
        startInLoadingState={true}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        sharedCookiesEnabled={true}
      />
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingHorizontal: 16,
    paddingVertical: 10, borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6' },
  backBtn: { width: 40, height: 40, alignItems: 'center',
    justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '600', color: '#111827' },
})

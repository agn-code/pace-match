import React, { useMemo, useRef, useState, useEffect } from 'react'
import {
  View, Text, StyleSheet, FlatList, TextInput,
  Pressable, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { router, useLocalSearchParams, Stack } from 'expo-router'
import { useApp } from '../context/AppContext'
import { useTheme } from '../hooks/useTheme'
import { useMessages } from '../../lib/hooks/useMessages'
import { useUsersById } from '../../lib/hooks/useUsersById'
import { spacing, radius, fontSize, fontWeight } from '../theme'
import type { MessageRow } from '../../lib/database.types'

function initialsOf(name: string): string {
  return name.split(' ').map((n) => n[0]).filter(Boolean).join('').slice(0, 2).toUpperCase()
}

export default function DmThread() {
  const theme = useTheme()
  const { connection_id } = useLocalSearchParams<{ connection_id: string }>()
  const { dbUser, connections } = useApp()

  const connection = useMemo(
    () => connections.find((c) => c.id === connection_id),
    [connections, connection_id]
  )

  const partnerId = connection
    ? connection.from_user_id === dbUser?.id ? connection.to_user_id : connection.from_user_id
    : null

  const partnerIds = useMemo(() => (partnerId ? [partnerId] : []), [partnerId])
  const { users } = useUsersById(partnerIds)
  const partner = partnerId ? users[partnerId] : null

  const { messages, loading, sendMessage } = useMessages(connection_id)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const listRef = useRef<FlatList<MessageRow>>(null)

  useEffect(() => {
    if (messages.length > 0) {
      // Defer to next tick so the row is laid out before scrolling.
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50)
    }
  }, [messages.length])

  async function handleSend() {
    const body = draft.trim()
    if (!body || !dbUser || sending) return
    setSending(true)
    setDraft('')
    try {
      await sendMessage(dbUser.id, body)
    } finally {
      setSending(false)
    }
  }

  const partnerName = partner?.name ?? (partnerId ? 'Loading…' : 'Conversation')
  const blocked = connection && connection.status !== 'accepted'

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['bottom']}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: partnerName,
          headerStyle: { backgroundColor: theme.surface },
          headerTintColor: theme.text,
          headerLeft: () => (
            <Pressable onPress={() => router.back()} accessibilityLabel="Back" hitSlop={8}>
              <Ionicons name="chevron-back" size={26} color={theme.brand} />
            </Pressable>
          ),
        }}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {loading && messages.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.brand} />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => {
              const mine = item.sender_id === dbUser?.id
              return (
                <View style={[styles.bubbleRow, mine ? styles.bubbleRowMine : styles.bubbleRowTheirs]}>
                  {!mine && partner && (
                    <View style={[styles.miniAvatar, { backgroundColor: theme.brandLight }]}>
                      <Text style={[styles.miniAvatarText, { color: theme.brand }]}>
                        {initialsOf(partner.name)}
                      </Text>
                    </View>
                  )}
                  <View
                    style={[
                      styles.bubble,
                      mine
                        ? { backgroundColor: theme.brand }
                        : { backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1 },
                    ]}
                  >
                    <Text style={[styles.bubbleText, { color: mine ? '#fff' : theme.text }]}>
                      {item.body}
                    </Text>
                    <Text
                      style={[
                        styles.bubbleTime,
                        { color: mine ? 'rgba(255,255,255,0.7)' : theme.textSecondary },
                      ]}
                    >
                      {new Date(item.sent_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                    </Text>
                  </View>
                </View>
              )
            }}
            ListEmptyComponent={
              !loading ? (
                <View style={styles.empty}>
                  <Ionicons name="chatbubbles-outline" size={48} color={theme.placeholder} />
                  <Text style={[styles.emptyTitle, { color: theme.text }]}>Say hi</Text>
                  <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
                    {`Start the conversation with ${partner?.name?.split(' ')[0] ?? 'your running partner'}.`}
                  </Text>
                </View>
              ) : null
            }
          />
        )}

        {blocked ? (
          <View style={[styles.blockedBar, { backgroundColor: theme.inputBackground }]}>
            <Ionicons name="lock-closed-outline" size={16} color={theme.textSecondary} />
            <Text style={[styles.blockedText, { color: theme.textSecondary }]}>
              Messaging unlocks once the request is accepted.
            </Text>
          </View>
        ) : (
          <View style={[styles.composer, { borderTopColor: theme.border, backgroundColor: theme.background }]}>
            <TextInput
              style={[styles.input, { backgroundColor: theme.inputBackground, color: theme.text }]}
              placeholder="Message…"
              placeholderTextColor={theme.placeholder}
              value={draft}
              onChangeText={setDraft}
              multiline
              accessibilityLabel="Message input"
            />
            <Pressable
              style={({ pressed }) => [
                styles.sendBtn,
                {
                  backgroundColor: draft.trim() ? theme.brand : theme.inputBackground,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
              onPress={handleSend}
              disabled={!draft.trim() || sending}
              accessibilityLabel="Send message"
              accessibilityRole="button"
            >
              {sending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Ionicons
                  name="send"
                  size={18}
                  color={draft.trim() ? '#fff' : theme.placeholder}
                />
              )}
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.lg },
  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginVertical: 2 },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubbleRowTheirs: { justifyContent: 'flex-start' },
  miniAvatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  miniAvatarText: { fontSize: 11, fontWeight: fontWeight.bold },
  bubble: {
    maxWidth: '78%', paddingHorizontal: spacing.md, paddingVertical: 8,
    borderRadius: radius.lg, gap: 2,
  },
  bubbleText: { fontSize: fontSize.md, lineHeight: 20 },
  bubbleTime: { fontSize: 10, alignSelf: 'flex-end' },
  empty: { alignItems: 'center', marginTop: 80, gap: spacing.md, paddingHorizontal: spacing.xl },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold },
  emptySubtitle: { fontSize: fontSize.md, textAlign: 'center' },
  composer: {
    flexDirection: 'row', alignItems: 'flex-end',
    padding: spacing.md, gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1, paddingHorizontal: spacing.md, paddingVertical: 10,
    borderRadius: radius.lg, fontSize: fontSize.md,
    maxHeight: 120,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  blockedBar: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    padding: spacing.md, justifyContent: 'center',
  },
  blockedText: { fontSize: fontSize.sm },
})

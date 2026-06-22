// Q-bot widget — state local + mutație. Conversația trăiește în memorie (efemer); auditul e server-side.
// Sursa de adevăr: qbot/widget/. Sincronizat în fiecare app via qbot/sync.mjs.
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { askQbot, type QbotMessage } from './api'

export function useQbot() {
  const [messages, setMessages] = useState<QbotMessage[]>([])

  const mut = useMutation({
    mutationFn: (next: QbotMessage[]) => askQbot(next),
  })

  const send = (text: string) => {
    const t = text.trim()
    if (!t || mut.isPending) return
    const next: QbotMessage[] = [...messages, { role: 'user', content: t }]
    setMessages(next)
    mut.mutate(next, {
      onSuccess: (reply) =>
        setMessages((m) => [...m, { role: 'assistant', content: reply }]),
      onError: (e) =>
        setMessages((m) => [
          ...m,
          { role: 'assistant', content: `Ceva n-a mers: ${(e as Error).message}` },
        ]),
    })
  }

  const reset = () => {
    setMessages([])
    mut.reset()
  }

  return { messages, send, reset, pending: mut.isPending }
}

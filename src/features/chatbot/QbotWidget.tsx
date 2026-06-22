// Q-bot — widget plutitor (buton dreapta-jos + panou de chat).
// Sursa de adevăr: qbot/widget/. Sincronizat în fiecare app via qbot/sync.mjs.
import { useEffect, useRef, useState } from 'react'
import { useQbot } from './useQbot'

export function QbotWidget() {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const { messages, send, pending } = useQbot()
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, pending])

  function submit() {
    if (!text.trim() || pending) return
    send(text)
    setText('')
  }

  return (
    <>
      {/* Buton plutitor */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Q-bot — întreabă asistentul"
        className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-quasar-yellow text-quasar-black shadow-lg transition-transform hover:scale-105"
      >
        <span className="text-xl font-black">{open ? '✕' : 'Q'}</span>
      </button>

      {/* Panou */}
      {open && (
        <div className="fixed bottom-24 right-5 z-50 flex h-[32rem] max-h-[80vh] w-[22rem] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-quasar-gray-light bg-white shadow-2xl">
          <div className="flex items-center gap-2 bg-quasar-black px-4 py-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-quasar-yellow text-sm font-black text-quasar-black">
              Q
            </span>
            <div className="leading-tight">
              <p className="text-sm font-semibold text-white">Q-bot</p>
              <p className="text-[11px] text-quasar-gray-light">Asistentul Quasar Dance</p>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-quasar-gray-light/40 p-3">
            {messages.length === 0 && (
              <p className="mt-6 px-2 text-center text-sm text-quasar-gray">
                Salut! Întreabă-mă cum se face ceva în aplicație sau cere-mi o cifră.
              </p>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={
                  m.role === 'user'
                    ? 'ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-quasar-yellow px-3 py-2 text-sm text-quasar-black'
                    : 'mr-auto max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-white px-3 py-2 text-sm text-quasar-black shadow-sm'
                }
              >
                {m.content}
              </div>
            ))}
            {pending && (
              <div className="mr-auto max-w-[85%] rounded-2xl rounded-bl-sm bg-white px-3 py-2 text-sm text-quasar-gray shadow-sm">
                scrie…
              </div>
            )}
          </div>

          <div className="flex items-end gap-2 border-t border-quasar-gray-light p-2">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  submit()
                }
              }}
              rows={1}
              placeholder="Scrie o întrebare…"
              className="max-h-24 flex-1 resize-none rounded-lg border border-quasar-gray-light px-3 py-2 text-sm focus:border-quasar-yellow focus:outline-none"
            />
            <button
              type="button"
              onClick={submit}
              disabled={pending || !text.trim()}
              className="rounded-lg bg-quasar-yellow px-3 py-2 text-sm font-semibold text-quasar-black disabled:cursor-not-allowed disabled:opacity-50"
            >
              Trimite
            </button>
          </div>
        </div>
      )}
    </>
  )
}

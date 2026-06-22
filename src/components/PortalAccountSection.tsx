import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button, TextInput } from '@/components/ui'
import {
  createPortalAccount,
  resetPortalPassword,
  unlinkPortalAccount,
} from '@/lib/portalAccount'

// Secțiune staff pentru gestionarea contului de PORTAL (rol parinte) al unei
// familii sau al unui client individual. Folosită din profilul familiei/clientului.
type Props = {
  kind: 'familie' | 'client'
  id: string
  authUserId: string | null
  defaultEmail?: string | null
  invalidateKey: unknown[]
}

export function PortalAccountSection({
  kind,
  id,
  authUserId,
  defaultEmail,
  invalidateKey,
}: Props) {
  const qc = useQueryClient()
  const [email, setEmail] = useState(defaultEmail ?? '')
  const [password, setPassword] = useState('')
  const [resetPwd, setResetPwd] = useState('')
  const [showReset, setShowReset] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const target = kind === 'familie' ? { familieId: id } : { clientId: id }
  const refresh = () => qc.invalidateQueries({ queryKey: invalidateKey })

  async function run(fn: () => Promise<void>, ok: string) {
    setBusy(true)
    setMsg(null)
    setErr(null)
    try {
      await fn()
      setMsg(ok)
      refresh()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 text-sm font-bold text-quasar-black">Cont portal membru</h2>

      {!authUserId ? (
        <div className="space-y-2">
          <p className="text-sm text-quasar-gray">
            Nu există încă un cont de portal. Creează unul pentru ca {kind === 'familie' ? 'familia' : 'clientul'} să acceseze plăți, prezențe și profil.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <TextInput
              type="email"
              placeholder="Email de login"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <TextInput
              type="text"
              placeholder="Parolă (min. 8)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button
              disabled={busy || !email || password.length < 8}
              onClick={() =>
                run(async () => {
                  await createPortalAccount({ ...target, email, password })
                  setPassword('')
                }, 'Cont creat.')
              }
            >
              Creează cont
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm">
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">
              Cont portal activ
            </span>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {!showReset ? (
              <Button variant="secondary" onClick={() => setShowReset(true)}>
                Resetează parola
              </Button>
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row">
                <TextInput
                  type="text"
                  placeholder="Parolă nouă (min. 8)"
                  value={resetPwd}
                  onChange={(e) => setResetPwd(e.target.value)}
                />
                <Button
                  disabled={busy || resetPwd.length < 8}
                  onClick={() =>
                    run(async () => {
                      await resetPortalPassword(authUserId, resetPwd)
                      setResetPwd('')
                      setShowReset(false)
                    }, 'Parolă resetată.')
                  }
                >
                  Salvează parola
                </Button>
                <Button variant="ghost" onClick={() => setShowReset(false)}>
                  Anulează
                </Button>
              </div>
            )}
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => {
                if (!window.confirm('Ștergi contul de portal? Accesul va fi revocat.')) return
                run(() => unlinkPortalAccount(target), 'Cont șters.')
              }}
            >
              Șterge cont
            </Button>
          </div>
        </div>
      )}

      {msg && <p className="mt-2 text-sm text-green-700">{msg}</p>}
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
    </div>
  )
}

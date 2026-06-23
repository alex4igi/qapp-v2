import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button, TextInput } from '@/components/ui'
import {
  createPortalAccount,
  resetPortalPassword,
  suggestPortalPassword,
  unlinkPortalAccount,
} from '@/lib/portalAccount'

// Secțiune staff pentru gestionarea contului de PORTAL (rol parinte) al unei
// familii sau al unui client individual. Folosită din profilul familiei/clientului.
type Props = {
  kind: 'familie' | 'client'
  id: string
  authUserId: string | null
  defaultEmail?: string | null
  nameHint?: string | null // numele familiei/clientului → parolă sugerată
  invalidateKey: unknown[]
}

export function PortalAccountSection({
  kind,
  id,
  authUserId,
  defaultEmail,
  nameHint,
  invalidateKey,
}: Props) {
  const qc = useQueryClient()
  const [email, setEmail] = useState(defaultEmail ?? '')
  const [password, setPassword] = useState(() => suggestPortalPassword(nameHint))
  const [resetPwd, setResetPwd] = useState(() => suggestPortalPassword(nameHint))
  const [sendEmail, setSendEmail] = useState(true)
  const [showReset, setShowReset] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const target = kind === 'familie' ? { familieId: id } : { clientId: id }
  const refresh = () => qc.invalidateQueries({ queryKey: invalidateKey })

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setMsg(null)
    setErr(null)
    try {
      await fn()
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
            <div className="flex gap-1">
              <TextInput
                type="text"
                placeholder="Parolă (min. 8)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                title="Generează altă parolă"
                className="rounded-lg border border-gray-200 px-2 text-sm hover:bg-gray-50"
                onClick={() => setPassword(suggestPortalPassword(nameHint))}
              >
                🔄
              </button>
            </div>
            <Button
              disabled={busy || !email || password.length < 8}
              onClick={() =>
                run(async () => {
                  const r = await createPortalAccount({
                    ...target,
                    email,
                    password,
                    notify: sendEmail ? 'email' : undefined,
                  })
                  setMsg(
                    sendEmail && r.emailed
                      ? `Cont creat. Datele au fost trimise pe ${email}.`
                      : sendEmail
                        ? `Cont creat. ⚠️ Emailul NU a plecat (Resend neconfigurat?) — comunică manual parola: ${password}`
                        : `Cont creat. Parolă: ${password} (comunic-o membrului).`,
                  )
                  setPassword(suggestPortalPassword(nameHint))
                })
              }
            >
              Creează cont
            </Button>
          </div>
          <label className="flex items-center gap-2 text-xs text-quasar-gray">
            <input
              type="checkbox"
              checked={sendEmail}
              onChange={(e) => setSendEmail(e.target.checked)}
            />
            Trimite datele de acces pe email
          </label>
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
              <div className="flex flex-col gap-2">
                <div className="flex gap-1">
                  <TextInput
                    type="text"
                    placeholder="Parolă nouă (min. 8)"
                    value={resetPwd}
                    onChange={(e) => setResetPwd(e.target.value)}
                  />
                  <button
                    type="button"
                    title="Generează altă parolă"
                    className="rounded-lg border border-gray-200 px-2 text-sm hover:bg-gray-50"
                    onClick={() => setResetPwd(suggestPortalPassword(nameHint))}
                  >
                    🔄
                  </button>
                  <Button
                    disabled={busy || resetPwd.length < 8}
                    onClick={() =>
                      run(async () => {
                        const r = await resetPortalPassword(
                          authUserId,
                          resetPwd,
                          sendEmail ? 'email' : undefined,
                        )
                        setMsg(
                          sendEmail && r.emailed
                            ? 'Parolă resetată și trimisă pe email.'
                            : sendEmail
                              ? `Parolă resetată. ⚠️ Emailul NU a plecat — comunică manual: ${resetPwd}`
                              : `Parolă resetată: ${resetPwd} (comunic-o membrului).`,
                        )
                        setResetPwd(suggestPortalPassword(nameHint))
                        setShowReset(false)
                      })
                    }
                  >
                    Salvează parola
                  </Button>
                  <Button variant="ghost" onClick={() => setShowReset(false)}>
                    Anulează
                  </Button>
                </div>
                <label className="flex items-center gap-2 text-xs text-quasar-gray">
                  <input
                    type="checkbox"
                    checked={sendEmail}
                    onChange={(e) => setSendEmail(e.target.checked)}
                  />
                  Trimite parola nouă pe email
                </label>
              </div>
            )}
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => {
                if (!window.confirm('Ștergi contul de portal? Accesul va fi revocat.')) return
                run(async () => {
                  await unlinkPortalAccount(target)
                  setMsg('Cont șters.')
                })
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

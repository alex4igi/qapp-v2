import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { defaultRouteForRole } from '@/lib/rolesMatrix'
import { Logo } from '@/components/layout/Logo'

export function LoginPage() {
  const { session, signIn, loading, role } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!loading && session) {
    return <Navigate to={defaultRouteForRole(role)} replace />
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error: signInError } = await signIn(email, password)
    setSubmitting(false)
    if (signInError) {
      setError('Email sau parolă incorecte.')
      return
    }
    // Redirectul efectiv se face declarativ mai sus (când sesiunea + rolul sunt
    // încărcate) prin defaultRouteForRole — owner/admin aterizează pe /analytics.
    navigate('/', { replace: true })
  }

  return (
    <div className="flex h-screen items-center justify-center bg-quasar-gray-light p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-xl border border-quasar-gray-light bg-white p-8 shadow-sm"
      >
        <div className="mb-6 flex justify-center">
          <span className="rounded-md bg-quasar-black px-3 py-1.5">
            <Logo />
          </span>
        </div>
        <h1 className="mb-6 text-center text-xl font-bold text-quasar-black">
          Autentificare
        </h1>

        <label className="mb-1 block text-sm font-medium text-quasar-black">
          Email
        </label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mb-4 w-full rounded-md border border-quasar-gray-light px-3 py-2 outline-none focus:border-quasar-yellow"
        />

        <label className="mb-1 block text-sm font-medium text-quasar-black">
          Parolă
        </label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-4 w-full rounded-md border border-quasar-gray-light px-3 py-2 outline-none focus:border-quasar-yellow"
        />

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-quasar-yellow py-2 font-semibold text-quasar-black transition-colors hover:bg-quasar-yellow-dark disabled:opacity-60"
        >
          {submitting ? 'Se conectează…' : 'Intră în cont'}
        </button>
      </form>
    </div>
  )
}

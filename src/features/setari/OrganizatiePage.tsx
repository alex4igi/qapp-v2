import { PageHeader } from '@/components/ui'
import { LocatiiSection } from './LocatiiSection'
import { CronJobsSection } from './CronJobsSection'
import { FirmeSection } from './FirmeSection'

export function OrganizatiePage() {
  return (
    <div>
      <PageHeader
        title="Organizație"
        subtitle="Structură de bază a organizației — doar Owner."
      />

      <div className="space-y-8">
        <LocatiiSection />

        <FirmeSection />

        <section className="rounded-lg border border-quasar-gray-light bg-white p-5">
          <h2 className="mb-2 text-sm font-bold text-quasar-black">
            Integrări externe
          </h2>
          <ul className="space-y-2 text-sm text-quasar-black">
            <li className="flex items-center justify-between">
              <span>
                <strong>SMS — smslink.com</strong>
                <span className="ml-2 text-xs text-quasar-gray">
                  configurată via secrete edge function
                </span>
              </span>
              <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                activ
              </span>
            </li>
            <li className="flex items-center justify-between">
              <span>
                <strong>Email — Resend</strong>
                <span className="ml-2 text-xs text-quasar-gray">
                  planificat Faza 2
                </span>
              </span>
              <span className="rounded bg-quasar-gray-light px-2 py-0.5 text-xs font-medium text-quasar-gray">
                neactivat
              </span>
            </li>
          </ul>
          <p className="mt-3 text-xs text-quasar-gray">
            Cheile API pentru integrări se păstrează ca secrete în edge functions
            și nu sunt expuse în UI.
          </p>
        </section>

        <CronJobsSection />
      </div>
    </div>
  )
}

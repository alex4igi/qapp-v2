import { useState } from 'react'
import { Modal } from '@/components/ui'
import { SimpleIncasareForm } from '../../SimpleIncasareForm'
import { DatoriiUnificateTab } from './DatoriiUnificateTab'
import { OpenClassTab } from './OpenClassTab'
import { InchiriereTab, type DefaultInchiriere } from './InchiriereTab'
import { TipSelector } from './TipSelector'
import type { TipPlata } from './helpers'
import type { MetodaSel } from './MetodaPlataField'
import type { FacturaLinie } from '@/features/facturare/types'

type Props = {
  open: boolean
  onClose: () => void
  onAddInrolare?: (clientId: string) => void
  defaultClientId?: string
  defaultTip?: TipPlata
  defaultBiletId?: string
  defaultInchiriere?: DefaultInchiriere
  defaultSuma?: number
  defaultMetoda?: MetodaSel
  /** Data reală a plății (ex. data tranzacției din extrasul bancar), nu ziua înregistrării. */
  defaultData?: string
  onRecorded?: (linii: FacturaLinie[], clientId: string) => void
}

export function PlataNouaModal({
  open,
  onClose,
  onAddInrolare,
  defaultClientId,
  defaultTip,
  defaultBiletId,
  defaultInchiriere,
  defaultSuma,
  defaultMetoda,
  defaultData,
  onRecorded,
}: Props) {
  const [tip, setTip] = useState<TipPlata>(defaultTip ?? 'Abonament')

  return (
    <Modal
      open={open}
      title="Plată nouă"
      onClose={onClose}
      size="xl"
      minHeight="640px"
    >
      <TipSelector value={tip} onChange={setTip} />
      {tip === 'Abonament' ? (
        <DatoriiUnificateTab
          onClose={onClose}
          onAddInrolare={onAddInrolare}
          defaultClientId={defaultClientId}
          defaultSuma={defaultSuma}
          defaultMetoda={defaultMetoda}
          defaultData={defaultData}
          onRecorded={onRecorded}
        />
      ) : tip === 'Open' ? (
        <OpenClassTab onClose={onClose} defaultClientId={defaultClientId} />
      ) : tip === 'Inchiriere' ? (
        <InchiriereTab onClose={onClose} defaultInchiriere={defaultInchiriere} />
      ) : (
        <SimpleIncasareForm
          key={tip}
          tip={tip}
          onClose={onClose}
          defaultClientId={defaultClientId}
          defaultBiletId={tip === 'Bilet' ? defaultBiletId : undefined}
          defaultSuma={defaultSuma != null ? String(defaultSuma) : undefined}
          defaultMetoda={defaultMetoda}
          defaultData={defaultData}
          onRecorded={onRecorded}
        />
      )}
    </Modal>
  )
}

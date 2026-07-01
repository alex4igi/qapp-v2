import { useState } from 'react'
import { Modal } from '@/components/ui'
import { SimpleIncasareForm } from '../../SimpleIncasareForm'
import { DatoriiUnificateTab } from './DatoriiUnificateTab'
import { OpenClassTab } from './OpenClassTab'
import { InchiriereTab, type DefaultInchiriere } from './InchiriereTab'
import { TipSelector } from './TipSelector'
import type { TipPlata } from './helpers'

type Props = {
  open: boolean
  onClose: () => void
  onAddInrolare?: (clientId: string) => void
  defaultClientId?: string
  defaultTip?: TipPlata
  defaultBiletId?: string
  defaultInchiriere?: DefaultInchiriere
}

export function PlataNouaModal({
  open,
  onClose,
  onAddInrolare,
  defaultClientId,
  defaultTip,
  defaultBiletId,
  defaultInchiriere,
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
        />
      )}
    </Modal>
  )
}

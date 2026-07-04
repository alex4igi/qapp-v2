import { useRef, useState } from 'react'
import { Button } from '@/components/ui'

type Props = {
  hasFile: boolean
  disabled?: boolean
  uploading: boolean
  onFileSelected: (file: File) => void
}

export function PdfUploadZone({ hasFile, disabled, uploading, onFileSelected }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [err, setErr] = useState<string | null>(null)

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.type !== 'application/pdf') {
      setErr('Fișierul trebuie să fie PDF.')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setErr('PDF-ul e prea mare (max 2MB).')
      return
    }
    setErr(null)
    onFileSelected(file)
  }

  return (
    <div className="flex items-center gap-3">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={handleChange}
      />
      <Button variant="secondary" disabled={disabled || uploading} onClick={() => inputRef.current?.click()}>
        {uploading ? 'Se încarcă…' : hasFile ? 'Înlocuiește PDF' : 'Încarcă PDF'}
      </Button>
      {err && <span className="text-xs text-danger">{err}</span>}
    </div>
  )
}

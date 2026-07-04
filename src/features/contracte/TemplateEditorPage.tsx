import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { PageHeader, Spinner } from '@/components/ui'
import { humanizeError } from '@/lib/errorMessage'
import { sezoaneOptions, sezonActivId } from '@/lib/lookups'
import {
  cloneTemplateToNewVersion,
  createTemplate,
  getTemplate,
  getTemplateFileSignedUrl,
  listDistinctTipuri,
  setTemplateActiv,
  suggestNextVersiune,
  updateTemplateFields,
  updateTemplateMeta,
  uploadTemplatePdf,
  type TemplateWithSezon,
} from './api'
import { TemplateMetaForm } from './editor/TemplateMetaForm'
import { PdfUploadZone } from './editor/PdfUploadZone'
import { PdfPageCanvas } from './editor/PdfPageCanvas'
import { FieldBox } from './editor/FieldBox'
import { EditorToolbar } from './editor/EditorToolbar'
import { FieldInspector } from './editor/FieldInspector'
import { FieldListPanel } from './editor/FieldListPanel'
import { useTemplateEditorState } from './editor/useTemplateEditorState'
import { loadPdf, getPageCount } from './editor/pdfjs'

const TEMPLATE_LOCKED_MSG = 'Template blocat'

export function TemplateEditorPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isNew = !id || id === 'nou'

  const { data: sezonOptions = [] } = useQuery({
    queryKey: ['sezoane-options'],
    queryFn: sezoaneOptions,
  })
  const { data: tipSuggestions = [] } = useQuery({
    queryKey: ['contract-templates-tipuri'],
    queryFn: listDistinctTipuri,
  })

  const [tip, setTip] = useState('contract_educational')
  const [sezonId, setSezonId] = useState<string | null>(null)
  const [nume, setNume] = useState('')
  const [valabilitateZile, setValabilitateZile] = useState(30)
  const [versiune, setVersiune] = useState(1)
  const [pdfStoragePath, setPdfStoragePath] = useState<string | null>(null)
  const [lockedAt, setLockedAt] = useState<string | null>(null)
  const [activ, setActiv] = useState(false)
  const [templateId, setTemplateId] = useState<string | null>(null)
  const [sourceForClone, setSourceForClone] = useState<TemplateWithSezon | null>(null)

  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null)
  const [pageCount, setPageCount] = useState(1)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })
  const [loading, setLoading] = useState(!isNew)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const editor = useTemplateEditorState()

  // Sezon implicit = sezonul activ, doar la creare.
  useEffect(() => {
    if (!isNew) return
    sezonActivId().then((sid) => setSezonId(sid))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew])

  // Sugerează versiunea de fiecare dată când tip/sezon se schimbă (creare)
  // sau la încărcarea unui draft existent nu se recalculează (versiunea vine din rând).
  useEffect(() => {
    if (!isNew) return
    suggestNextVersiune(tip, sezonId).then(setVersiune).catch(() => {})
  }, [isNew, tip, sezonId])

  // Încarcă template existent + PDF-ul lui.
  useEffect(() => {
    if (isNew || !id) return
    let cancelled = false
    setLoading(true)
    getTemplate(id)
      .then(async (tpl) => {
        if (cancelled || !tpl) return
        setTemplateId(tpl.id)
        setTip(tpl.tip)
        setSezonId(tpl.sezon)
        setNume(tpl.nume)
        setValabilitateZile(tpl.valabilitate_zile)
        setVersiune(tpl.versiune)
        setPdfStoragePath(tpl.pdf_storage_path)
        setLockedAt(tpl.locked_at)
        setActiv(tpl.activ)
        setSourceForClone(tpl)
        editor.loadFields((tpl.fields as never) ?? [])
        const url = await getTemplateFileSignedUrl(tpl.pdf_storage_path)
        const doc = await loadPdf(url)
        if (cancelled) return
        setPdfDoc(doc)
        setPageCount(getPageCount(doc))
      })
      .catch((e) => setErr(humanizeError(e)))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isNew])

  const readOnly = lockedAt != null
  const sezonNume = useMemo(
    () => sezonOptions.find((o) => o.value === sezonId)?.label ?? null,
    [sezonOptions, sezonId],
  )

  async function handleUpload(file: File) {
    setErr(null)
    setUploading(true)
    try {
      const path = await uploadTemplatePdf({ tip, sezonNume, versiune, file })
      setPdfStoragePath(path)
      editor.setCurrentPage(1)
      const url = await getTemplateFileSignedUrl(path)
      const doc = await loadPdf(url)
      setPdfDoc(doc)
      setPageCount(getPageCount(doc))
    } catch (e) {
      setErr(humanizeError(e))
    } finally {
      setUploading(false)
    }
  }

  async function handleSave() {
    if (!pdfStoragePath) {
      setErr('Încarcă mai întâi un PDF.')
      return
    }
    setErr(null)
    setSaving(true)
    try {
      if (isNew || !templateId) {
        const newId = await createTemplate({
          tip,
          sezon: sezonId,
          nume,
          versiune,
          pdf_storage_path: pdfStoragePath,
          fields: editor.fieldsForSave,
          valabilitate_zile: valabilitateZile,
        })
        navigate(`/contracte/sabloane/${newId}`)
        return
      }
      await updateTemplateFields(templateId, {
        fields: editor.fieldsForSave,
        pdf_storage_path: pdfStoragePath,
      })
      await updateTemplateMeta(templateId, { nume, valabilitate_zile: valabilitateZile })
      editor.markSaved()
    } catch (e) {
      const msg = humanizeError(e)
      if (msg.includes(TEMPLATE_LOCKED_MSG) && templateId) {
        const tpl = await getTemplate(templateId)
        if (tpl) {
          setLockedAt(tpl.locked_at)
          setSourceForClone(tpl)
        }
      }
      setErr(msg)
    } finally {
      setSaving(false)
    }
  }

  async function handleActivate() {
    if (!templateId) return
    try {
      await setTemplateActiv(templateId, true)
      setActiv(true)
    } catch (e) {
      setErr(humanizeError(e))
    }
  }

  async function handleCreateNewVersion() {
    if (!sourceForClone) return
    setErr(null)
    setSaving(true)
    try {
      const newId = await cloneTemplateToNewVersion(sourceForClone)
      navigate(`/contracte/sabloane/${newId}`)
    } catch (e) {
      setErr(humanizeError(e))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <Spinner />
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={isNew ? 'Șablon nou' : nume || 'Editare șablon'}
        subtitle="Editor vizual — poziționează câmpurile direct pe PDF"
      />

      {err && <p className="text-sm text-danger">{err}</p>}

      <TemplateMetaForm
        tip={tip}
        sezonId={sezonId}
        nume={nume}
        versiune={versiune}
        valabilitateZile={valabilitateZile}
        sezonOptions={sezonOptions}
        tipSuggestions={tipSuggestions}
        disabled={readOnly}
        onTipChange={setTip}
        onSezonChange={setSezonId}
        onNumeChange={setNume}
        onValabilitateChange={setValabilitateZile}
      />

      {(!pdfDoc || !readOnly) && (
        <PdfUploadZone
          hasFile={!!pdfStoragePath}
          disabled={readOnly}
          uploading={uploading}
          onFileSelected={handleUpload}
        />
      )}

      {pdfDoc && (
        <>
          <EditorToolbar
            currentPage={editor.currentPage}
            pageCount={pageCount}
            onPageChange={editor.setCurrentPage}
            scale={editor.scale}
            onScaleChange={editor.setScale}
            readOnly={readOnly}
            dirty={editor.dirty}
            saving={saving}
            onAddField={editor.addField}
            onSave={() => void handleSave()}
            locked={readOnly}
            onCreateNewVersion={() => void handleCreateNewVersion()}
            activ={activ}
            onActivate={() => void handleActivate()}
          />

          <div className="flex flex-wrap items-start gap-4">
            <div className="overflow-auto rounded-2xl border border-line bg-surface p-3">
              <PdfPageCanvas
                doc={pdfDoc}
                pageNumber={editor.currentPage}
                scale={editor.scale}
                onRendered={setContainerSize}
                onCanvasClick={() => editor.setSelectedFieldId(null)}
              >
                {editor.fieldsOnCurrentPage.map((f) => (
                  <FieldBox
                    key={f._id}
                    field={f}
                    containerSize={containerSize}
                    selected={f._id === editor.selectedFieldId}
                    readOnly={readOnly}
                    onSelect={() => editor.setSelectedFieldId(f._id)}
                    onMove={(x, y) => editor.moveField(f._id, x, y)}
                    onResize={(w, h) => editor.resizeField(f._id, w, h)}
                  />
                ))}
              </PdfPageCanvas>
            </div>

            <div className="w-72 shrink-0 space-y-4">
              <div className="rounded-2xl border border-line bg-card p-3">
                <h3 className="mb-2 text-sm font-semibold text-ink">Câmpuri ({editor.fields.length})</h3>
                <FieldListPanel
                  fields={editor.fields}
                  selectedFieldId={editor.selectedFieldId}
                  onSelect={(fid, page) => {
                    editor.setCurrentPage(page)
                    editor.setSelectedFieldId(fid)
                  }}
                />
              </div>
              <FieldInspector
                field={editor.selectedField}
                pageCount={pageCount}
                readOnly={readOnly}
                onChange={(patch) => editor.selectedFieldId && editor.updateField(editor.selectedFieldId, patch)}
                onDelete={() => editor.selectedFieldId && editor.removeField(editor.selectedFieldId)}
              />
            </div>
          </div>
        </>
      )}
    </div>
  )
}

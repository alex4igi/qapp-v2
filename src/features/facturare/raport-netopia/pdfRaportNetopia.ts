import type { Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces'
import type { RaportNetopia } from './api'
import { dataRo, etichetaLuna, lei, netPlata, tipPlata, totaluri, verificari } from './calcul'

const FIRMA = 'Quasar Dance Studio SRL · CUI 49361270'
const GRI = '#777777'
const ROSU = '#b42318'
const LINIE = '#e4dfd5'

const mic = (text: string, color = GRI): Content => ({
  text,
  fontSize: 7,
  color,
})
const th = (text: string, dreapta = false): TableCell => ({
  text,
  bold: true,
  fontSize: 7.5,
  color: '#555555',
  alignment: dreapta ? 'right' : 'left',
})
const num = (text: string, extra: Record<string, unknown> = {}): TableCell => ({
  text,
  alignment: 'right',
  noWrap: true,
  ...extra,
})
const doua = (sus: string, jos: string, culoareJos = GRI): TableCell => ({
  stack: [{ text: sus }, mic(jos, culoareJos)],
})

const layoutTabel = {
  hLineWidth: (i: number, node: { table: { body: unknown[] } }) =>
    i === 1 ? 1.2 : i === 0 ? 0 : i === node.table.body.length ? 0 : 0.5,
  vLineWidth: () => 0,
  hLineColor: (i: number) => (i === 1 ? '#1a1814' : LINIE),
  paddingTop: () => 3,
  paddingBottom: () => 3,
  paddingLeft: () => 4,
  paddingRight: () => 4,
}

function construieste(r: RaportNetopia): TDocumentDefinitions {
  const t = totaluri(r)
  const luna = etichetaLuna(r.luna.slice(0, 7))
  const generat = new Date().toLocaleString('ro-RO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  const ver = verificari(r)
  const partial = t.nrDecontate < t.nrPlati

  const kpi = (valoare: string, eticheta: string): TableCell => ({
    stack: [{ text: valoare, bold: true, fontSize: 12 }, mic(eticheta, '#666666')],
    margin: [2, 2, 2, 2],
  })
  const kpiuri: TableCell[] = [
    kpi(String(t.nrPlati), 'plăți confirmate'),
    kpi(`${lei(t.incasat)} lei`, 'încasat (brut, facturat)'),
    kpi(`${t.nrFacturate} / ${t.nrPlati}`, 'cu factură FGO'),
    kpi(
      `${lei(Math.abs(t.comisioane))} lei`,
      `comisioane pe tranzacții${partial ? ` (${t.nrDecontate} din ${t.nrPlati} plăți)` : ''}`,
    ),
    kpi(`${lei(t.netDecontat)} lei`, `net după comisioane${partial ? ' (plățile virate)' : ''}`),
    ...(t.restituit ? [kpi(`−${lei(t.restituit)} lei`, 'restituit clienților')] : []),
  ]

  const plati: TableCell[][] = [
    [
      th('#', true),
      th('Data'),
      th('Plătitor (cont portal)'),
      th('Pentru'),
      th('Ce s-a plătit'),
      th('Factură'),
      th('Sumă', true),
      th('Comision', true),
      th('Net', true),
      th('Virat de Netopia'),
    ],
    ...r.plati.map((p, i): TableCell[] => {
      const areFactura = !!p.factura && p.factura_status === 'Emisa'
      const factura: TableCell = areFactura
        ? p.facturat_catre
          ? doua(p.factura!, `către ${p.facturat_catre}`)
          : { text: p.factura! }
        : {
            text: p.factura ? `${p.factura} (${p.factura_status})` : 'fără factură',
            color: ROSU,
            bold: true,
          }
      return [
        num(String(i + 1)),
        doua(dataRo(p.data), p.ora),
        { text: p.platitor ?? '—' },
        { text: p.membru ?? '—' },
        doua(p.descriere, `${tipPlata(p)} · ${p.order_ref}`),
        factura,
        num(lei(p.suma)),
        num(p.batch_id != null ? lei((p.comision ?? 0) + (p.tva_comision ?? 0)) : '—'),
        num(lei(netPlata(p))),
        p.batch_id != null ? doua(dataRo(p.data_virare), `lot ${p.batch_id}`) : mic('nevirat / fișier lipsă'),
      ]
    }),
    [
      { text: 'Total', bold: true, colSpan: 6 },
      {},
      {},
      {},
      {},
      {},
      num(lei(t.incasat), { bold: true }),
      num(t.nrDecontate ? lei(t.comisioane) : '—', { bold: true }),
      num(t.nrDecontate ? lei(t.netDecontat) : '—', { bold: true }),
      {},
    ],
  ]
  if (r.plati.length === 0) {
    plati.splice(1, 0, [
      { text: 'Nicio plată online în această lună.', colSpan: 10 },
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
    ])
  }

  const continut: Content[] = [
    { text: `Plăți online prin Netopia — ${luna}`, fontSize: 16, bold: true },
    {
      text: `${FIRMA} · generat ${generat}`,
      fontSize: 8,
      color: '#666666',
      margin: [0, 2, 0, 10],
    },
    {
      table: { widths: kpiuri.map(() => 'auto'), body: [kpiuri] },
      layout: {
        hLineWidth: () => 0.6,
        vLineWidth: () => 0.6,
        hLineColor: () => LINIE,
        vLineColor: () => LINIE,
        paddingLeft: () => 6,
        paddingRight: () => 10,
        paddingTop: () => 4,
        paddingBottom: () => 4,
      },
    },
    { text: 'Plățile lunii', bold: true, fontSize: 10, margin: [0, 14, 0, 4] },
    {
      table: {
        headerRows: 1,
        dontBreakRows: true,
        widths: [14, 46, 110, 110, '*', 'auto', 'auto', 'auto', 'auto', 'auto'],
        body: plati,
      },
      layout: layoutTabel,
    },
  ]

  if (r.loturi.length) {
    continut.push(
      {
        text: 'Virările Netopia în cont (loturile în care au intrat plățile lunii)',
        bold: true,
        fontSize: 10,
        margin: [0, 14, 0, 4],
      },
      {
        table: {
          headerRows: 1,
          dontBreakRows: true,
          widths: ['auto', 'auto', 'auto', '*', '*', '*', '*', 'auto'],
          body: [
            [
              th('Lot (BatchId)'),
              th('Data virării'),
              th('Plăți', true),
              th('Procesat', true),
              th('Comisioane tranzacții', true),
              th('Taxă transfer + TVA', true),
              th('Net virat', true),
              th('Extras ING'),
            ],
            ...r.loturi.map((l): TableCell[] => {
              const potrivit =
                l.extras_suma != null && Math.round(l.extras_suma * 100) === Math.round(l.net * 100)
              return [
                { text: String(l.batch_id) },
                { text: dataRo(l.data_platii) },
                num(String(l.nr_plati)),
                num(lei(l.procesat)),
                num(lei(l.comision_tranzactii)),
                num(lei(l.taxa_transfer + l.tva)),
                num(lei(l.net), { bold: true }),
                l.extras_suma == null
                  ? mic('extras neîncărcat')
                  : {
                      stack: [
                        {
                          text: lei(l.extras_suma),
                          color: potrivit ? '#1a7f37' : ROSU,
                          bold: !potrivit,
                        },
                        mic(`${dataRo(l.extras_data)}${potrivit ? ' · se potrivește' : ' · DIFERENȚĂ'}`),
                      ],
                    },
              ]
            }),
          ],
        },
        layout: layoutTabel,
      },
      mic(
        'Un lot poate cuprinde și plăți din luna vecină. Taxa de transfer reținută într-un lot e pentru virarea lotului anterior.',
      ),
    )
  }

  if (r.restituiri.length) {
    continut.push(
      {
        text: 'Restituiri către clienți',
        bold: true,
        fontSize: 10,
        margin: [0, 14, 0, 4],
      },
      {
        table: {
          headerRows: 1,
          dontBreakRows: true,
          widths: ['auto', '*', '*', 'auto', 'auto', 'auto', 'auto'],
          body: [
            [
              th('Data'),
              th('Membru'),
              th('Motiv'),
              th('Factura inițială'),
              th('Storno FGO'),
              th('Stare'),
              th('Sumă', true),
            ],
            ...r.restituiri.map((x): TableCell[] => [
              { text: dataRo(x.data) },
              doua(x.membru ?? '—', x.order_ref),
              { text: x.motiv ?? '' },
              { text: x.factura ?? '—' },
              x.fgo_storno
                ? { text: x.fgo_storno }
                : x.fgo_status === 'de_stornat_manual'
                  ? { text: 'de stornat manual', color: ROSU, bold: true }
                  : { text: x.fgo_status ?? '—' },
              x.status === 'in_curs'
                ? { text: 'în curs', color: ROSU, bold: true }
                : { text: x.status === 'efectuata' ? 'efectuată' : x.status },
              num(`−${lei(x.suma)}`),
            ]),
          ],
        },
        layout: layoutTabel,
      },
    )
  }

  continut.push({
    unbreakable: true,
    stack: [
      { text: 'De verificat', bold: true, fontSize: 10, margin: [0, 14, 0, 4] },
      ver.length
        ? {
            ul: ver.map((v) => ({
              text: v.text,
              color: v.nivel === 'atentie' ? ROSU : '#1a1814',
              margin: [0, 0, 0, 2] as [number, number, number, number],
            })),
          }
        : {
            text: 'Totul se leagă: toate plățile au factură, apar în deconturile Netopia cu aceeași sumă, iar virările se potrivesc cu extrasul.',
            color: '#1a7f37',
          },
    ],
  })

  continut.push({
    text:
      `Sursa: plățile confirmate în aplicația Qapp (data = ziua plății, ora României) și fișierele de decont Netopia încărcate${
        r.ultim_lot ? ` (ultimul lot: ${dataRo(r.ultim_lot)})` : ''
      }. „Plătitor” = titularul contului din portalul de membri; „Pentru” = membrul pentru care s-a plătit. ` +
      'Comisionul = comisionul fix + cel procentual reținute de Netopia pe fiecare tranzacție.',
    fontSize: 7,
    color: GRI,
    margin: [0, 16, 0, 0],
  })

  return {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [28, 28, 28, 32],
    info: {
      title: `Plăți online Netopia — ${luna}`,
      author: 'Quasar Dance Studio SRL',
    },
    defaultStyle: { font: 'Roboto', fontSize: 8, color: '#1a1814' },
    footer: (pagina: number, total: number) => ({
      text: `Plăți online Netopia — ${luna} · pagina ${pagina} din ${total}`,
      fontSize: 7,
      color: GRI,
      alignment: 'right',
      margin: [28, 8, 28, 0],
    }),
    content: continut,
  }
}

/**
 * Descarcă raportul ca fișier PDF. pdfmake (cu fontul Roboto, care are ș/ț/ă) se
 * încarcă doar la apăsarea butonului — ~1 MB pe care restul aplicației nu-l plătește.
 */
export async function descarcaRaportNetopiaPdf(r: RaportNetopia) {
  const [pdfMakeMod, vfsMod] = await Promise.all([
    import('pdfmake/build/pdfmake'),
    import('pdfmake/build/vfs_fonts'),
  ])
  const pdfMake = ((pdfMakeMod as { default?: unknown }).default ??
    pdfMakeMod) as typeof import('pdfmake/build/pdfmake')
  const vfs = ((vfsMod as { default?: unknown }).default ?? vfsMod) as Parameters<
    typeof pdfMake.addVirtualFileSystem
  >[0]
  pdfMake.addVirtualFileSystem(vfs)
  await pdfMake.createPdf(construieste(r)).download(`raport-netopia-${r.luna.slice(0, 7)}.pdf`)
}

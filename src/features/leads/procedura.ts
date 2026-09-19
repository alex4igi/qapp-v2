import type { Lead, StatusLead } from '@/types/db'
import { ziScurta } from './constants'

// Procedura pe fiecare status, așa cum o vede recepția („ℹ︎" pe coloană + „Pasul
// următor" din fișa leadului). Sursa de adevăr, cu maparea regulă → cod, e
// docs/procedura-leads-kanban.md — cele două se schimbă ÎMPREUNĂ.
//
// `aplicatia` descrie doar ce face codul ACUM. O regulă decisă, dar nelivrată
// încă, stă în document (marcată „planificat"), nu aici: un text care promite
// recepției o alertă inexistentă e mai rău decât lipsa textului.
export type ProceduraStatus = {
  inseamna: string
  /** Cele două rânduri din tooltip. Lista completă stă în `ceFaci`/`aplicatia`. */
  peScurt: { ceFaci: string; aplicatia: string }
  ceFaci: string[]
  aplicatia: string[]
  iesiri: string
  pasUrmator: string
}

export const STATUS_PROCEDURA: Record<StatusLead, ProceduraStatus> = {
  nou: {
    inseamna: 'A cerut o ședință gratuită și nu l-a sunat încă nimeni.',
    peScurt: {
      ceFaci: 'Sună-l în aceeași zi și apasă 📞 după apel.',
      aplicatia: 'Îl marchează cu ⚑ dacă rămâne nesunat. Nu îl mută singură nicăieri.',
    },
    ceFaci: [
      'Sună-l în aceeași zi. Intrat până la 18:00 → azi. Intrat seara → a doua zi, până la 12:00.',
      'Dacă ai vorbit cu el, mută cardul — mutarea se numără singură ca discuție. Butonul 📞 e pentru apelurile care NU mută cardul: „am sunat și n-a răspuns" și notițele.',
      'Ținta convorbirii: o dată de ședință gratuită → „Programat".',
      'Eticheta „⭐ DEJA CLIENT" = e deja clientul nostru. Deschide-i fișa înainte să suni: de obicei vrea un al doilea curs sau are o întrebare.',
    ],
    aplicatia: [
      'Pune stegulețul ⚑ pe leadul nesunat și îl urcă în „De lucrat azi".',
      'Înregistrează singură discuția când muți cardul într-un status care presupune că ai vorbit cu omul.',
      'Nu îl mută niciodată singură: un lead nou nesunat rămâne aici până îl sună cineva.',
    ],
    iesiri: 'Programat · Contactat (nu răspunde / de revenit) · Waiting List · Pierdut · Nurture',
    pasUrmator: 'Sună-l azi și loghează apelul cu 📞. Ținta: o dată de ședință gratuită.',
  },
  contactat: {
    inseamna: 'L-am sunat cel puțin o dată, dar nu are încă o programare.',
    peScurt: {
      ceFaci: 'Nu răspunde: 3 încercări în 5 zile. De revenit: sună-l fix în ziua cerută.',
      aplicatia: 'Urcă sus cardurile ajunse la scadență. După 3 încercări fără răspuns → Nurture. Cât timp NOI n-am sunat, nu-l mută nicăieri.',
    },
    ceFaci: [
      'Nu răspunde: 3 încercări în 5 zile — azi, mâine la altă oră, apoi peste 2–3 zile. Încearcă și pe WhatsApp.',
      'De revenit: a răspuns și a cerut să-l sunăm la o dată. Sună-l ÎN ziua aceea — omul așteaptă apelul.',
      'Un lead „Contactat" are mereu un sub-status și o dată. Dacă ați vorbit și nu s-a stabilit nimic, alege: Programat, De revenit cu dată, Waiting List, Pierdut sau Nurture.',
    ],
    aplicatia: [
      'Urcă în capul coloanei leadurile cu data de revenire ajunsă la zi și le pune ⚑.',
      'După 3 încercări la rând fără răspuns, leadul trece singur în Nurture. Un apel la care a răspuns repornește numărătoarea.',
      'Cât timp stegulețul e ignorat, leadul NU pleacă nicăieri: stegulețul crește, cardul rămâne în coloană. Vina noastră nu scoate omul din pipeline.',
    ],
    iesiri: 'Programat · Waiting List · Pierdut · Nurture',
    pasUrmator: 'Alege sub-statusul și data următoarei contactări. La „nu răspunde": 3 încercări în 5 zile.',
  },
  waiting_list: {
    inseamna: 'Vrea să vină, dar NU avem loc în grupa potrivită (sau grupa nu există încă).',
    peScurt: {
      ceFaci: 'Aici stau doar cei pentru care nu e loc. Sună-i când se eliberează unul.',
      aplicatia: 'A trimis SMS-ul de confirmare. La finalul sezonului îi mută în Nurture.',
    },
    ceFaci: [
      'Pune aici doar pe cine nu are loc. „Vreau, dar nu acum" NU e waiting list → „Contactat / De revenit", cu dată.',
      'Notează în observații grupa pe care o așteaptă.',
      'Când se eliberează un loc, sună-i în ordine: cei mai vechi sunt sus.',
    ],
    aplicatia: [
      'La intrare pleacă singur SMS-ul „te-am adăugat pe lista de așteptare — te contactăm imediat ce îți putem oferi un loc".',
      'Ține lista în ordinea sosirii (primul venit, primul sunat).',
      'La finalul sezonului, cine a rămas pe listă trece în Nurture.',
    ],
    iesiri: 'Programat · Nurture',
    pasUrmator: 'Pe lista de așteptare, fiindcă nu e loc. Când se eliberează unul, programează-l la grupă.',
  },
  programat: {
    inseamna: 'Are o dată și o grupă pentru ședința gratuită.',
    peScurt: {
      ceFaci: 'Bifează prezența în rosterul grupei, în ziua ședinței.',
      aplicatia: 'Trimite confirmarea și reminderul. Nebifat ⇒ peste noapte devine „Nu a venit”.',
    },
    ceFaci: [
      'Recepția bifează prezența leadului în rosterul grupei, în ziua demo-ului, până la finalul programului.',
      'A venit → bifă. Nu a venit → lasă nebifat; aplicația îl mută singură peste noapte.',
      'Un lead are o singură programare: reprogramarea o înlocuiește pe cea veche.',
    ],
    aplicatia: [
      'Trimite SMS de confirmare la câteva minute după programare și reminder la 10:00 în ziua ședinței (pentru weekend, cu o zi înainte).',
      'Pune leadul în rosterul grupei din ziua respectivă.',
      'Bifa din rosterul grupei îl mută singură pe „A venit" — și cea a instructorului, și cea a recepției.',
      'Dacă rămâne nebifat, peste noapte devine „Nu a venit" și intră pe lista de sunat de peste două zile. Dacă de fapt a venit, mută-l pe „A venit" — altfel îl sună recepția degeaba.',
    ],
    iesiri: 'A venit · Nu a venit',
    pasUrmator: 'Bifează-i prezența în rosterul grupei în ziua ședinței. Nebifat = „Nu a venit" + apel peste 2 zile.',
  },
  a_venit: {
    inseamna: 'A fost la ședința gratuită și nu s-a înscris încă.',
    peScurt: {
      ceFaci: 'Vorbește cu el imediat după clasă. Dacă se înscrie, convertește-l.',
      aplicatia: 'Trimite SMS la 2 zile. Lunea pune ⚑; a doua luni ignorată → Nurture.',
    },
    ceFaci: [
      'Vorbește cu părintele / cursantul imediat după clasă: cum a fost, grupa potrivită, preț, înscriere pe loc.',
      'Se înscrie → „Convertește în client" (client + înrolare, dintr-un singur flux).',
      'Se gândește sau refuză → notează cu 📞 ce a spus, ca să știi data viitoare. Refuz clar → Pierdut; „nu acum" → Nurture.',
    ],
    aplicatia: [
      'La 2 zile după demo trimite SMS-ul cu rezervarea locului (la 16:00, luni–vineri).',
      'Lunea pune ⚑ pe cei neînscriși — lista de sunat de luni.',
      'A doua luni la rând fără niciun contact logat → Nurture. Sare peste cei care au cerut să fie sunați la o dată din viitor.',
    ],
    iesiri: 'Convertit · Pierdut · Nurture',
    pasUrmator: 'Discuția de după clasă e pasul care contează. Dacă se înscrie, convertește-l în client.',
  },
  nu_a_venit: {
    inseamna: 'A avut programare și nu a ajuns.',
    peScurt: {
      ceFaci: 'Sună-l la 2 zile de la absență — joi sau vineri ⇒ luni.',
      aplicatia: 'Îi pune singură ziua apelului și ⚑ în ziua aceea. Niciun SMS.',
    },
    ceFaci: [
      'Sună-l la 2 zile de la ședința ratată. Dacă a lipsit joi sau vineri, îl suni luni — ziua exactă scrie pe card.',
      'Ținta convorbirii: o dată nouă de ședință → „Programat".',
      'Nu răspunde: 3 încercări în 5 zile, ca la „Contactat". Apasă 📞 la fiecare încercare.',
      'A spus clar că nu mai vrea → Pierdut. „Nu acum" → Nurture.',
    ],
    aplicatia: [
      'Pune singură ziua apelului pe card: 2 zile de la absență, iar dacă ar pica în weekend, luni.',
      'În ziua aceea urcă leadul în „De lucrat azi" și îi pune ⚑.',
      'După 3 încercări la rând fără răspuns, trece singur în Nurture.',
      'Cât timp nu l-a sunat nimeni, NU pleacă nicăieri: stegulețul crește, cardul rămâne în coloană.',
      'Sunat, dar tot fără niciun semn, la 10 zile de la absență → Nurture.',
      'A doua neprezentare → direct în Nurture.',
      'Nu mai trimite niciun SMS la neprezentare: din septembrie 2026 îl sunăm în loc.',
    ],
    iesiri: 'Programat · Pierdut · Nurture',
    pasUrmator: 'Sună-l la 2 zile de la absență (weekend ⇒ luni). Ținta: o dată nouă de ședință.',
  },
  convertit: {
    inseamna: 'E client cu înrolare activă. Treaba pe lead s-a încheiat.',
    peScurt: {
      ceFaci: 'Nimic — continuă din fișa clientului.',
      aplicatia: 'L-a marcat singură la înrolare și i-a șters probele viitoare.',
    },
    ceFaci: [
      'Nimic. De aici încolo se lucrează din fișa clientului (contract, plăți).',
      '„▸ Finalizează înscrierea" pe un cartonaș = conversie rămasă la jumătate: clientul există, dar fără înrolare. Termin-o.',
    ],
    aplicatia: [
      'Marchează singură leadul „Convertit" în clipa în care clientul primește o înrolare.',
      'Șterge programările de probă viitoare ale leadului.',
      'Ascunde din coloană conversiile mai vechi de 30 de zile („Arată arhivate").',
    ],
    iesiri: '— (final)',
    pasUrmator: 'Înscriere finalizată. Continuă din fișa clientului.',
  },
  pierdut: {
    inseamna: 'Nu îl mai contactăm NICIODATĂ.',
    peScurt: {
      ceFaci: 'Nimic. Pierdut = nu mai contactăm niciodată.',
      aplicatia: 'Nu îl mai mută din coloană. Motivul „opt-out” oprește orice mesaj.',
    },
    ceFaci: [
      'Pune aici doar: număr greșit, „nu mă mai contactați" (opt-out), refuz explicit, în afara țintei (vârstă, alt oraș).',
      '„Nu acum" NU e pierdut — program nepotrivit, altă activitate, preț, distanță, alt studio, „pas anul acesta" merg în Nurture, ca să-i prindem la reînscrieri.',
      'Motivul e obligatoriu. Scrie-l cât mai concret.',
    ],
    aplicatia: [
      'Un lead pierdut nu mai poate fi mutat din coloană.',
      'Motivul „opt-out" îl marchează automat ca „nu mai dorește să fie contactat".',
    ],
    iesiri: '— (final)',
    pasUrmator: 'Pierdut = nu mai contactăm. Dacă era doar „nu acum", locul lui e în Nurture.',
  },
  nurture: {
    inseamna: 'Nu acum, dar poate mai târziu: bazinul din care recuperăm la campanii și reînscrieri.',
    peScurt: {
      ceFaci: 'Reactivează-l când revine.',
      aplicatia: 'Adună singură leadurile reci și foștii clienți. Nu trimite niciun SMS de aici.',
    },
    ceFaci: [
      'Mută aici manual pe oricine spune „nu acum" — și notează motivul în observații.',
      'Când cineva revine, caută-l și apasă „Reactivează": intră din nou în „Nou", cu contoarele de la zero.',
    ],
    aplicatia: [
      'Aduce singură aici leadurile la care omul n-a răspuns, n-a venit sau nu s-a înscris după demo.',
      'Adaugă automat foștii clienți (45 de zile fără prezență) — cei cu eticheta „ex-client".',
      'Nu trimite niciun SMS automat din Nurture.',
    ],
    iesiri: 'Nou (reactivare) · Programat',
    pasUrmator: 'În Nurture. Când revine, reactivează-l în pipeline.',
  },
}

// ─── „Am un card într-o coloană: ce fac cu el?" ──────────────────────────────
// Răspunsul depinde de card, nu doar de coloană: în „Contactat", un „nu răspunde"
// scadent azi și un „de revenit" de peste o săptămână cer lucruri diferite. De
// aceea textul de pe coloană (STATUS_PROCEDURA) nu e suficient.
//
// Funcție pură, un singur adevăr pentru card, „De lucrat azi" și vederea Listă.

export type TonActiune = 'urgent' | 'azi' | 'asteptare' | 'gata'

export type ActiuneCard = {
  /** Imperativ scurt — ce face recepția cu leadul ăsta, acum. */
  text: string
  ton: TonActiune
  /** De ce / până când. Apare sub text, mai șters. */
  detaliu?: string
}

export const TON_CLASE: Record<TonActiune, string> = {
  urgent: 'text-red-300',
  azi: 'text-quasar-yellow',
  asteptare: 'text-zinc-300',
  gata: 'text-emerald-300',
}

const MS_ZI = 86_400_000

function inceputZi(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

// Termenul primului apel: intrat până la 18:00 → sfârșitul zilei; intrat seara →
// a doua zi la 12:00. Recepția lucrează după-amiaza, deci un lead de la 21:00
// n-are cum să fie sunat „în aceeași zi".
export function termenPrimulApel(created: string): Date {
  const d = new Date(created)
  const t = new Date(d)
  if (d.getHours() >= 18) {
    t.setDate(t.getDate() + 1)
    t.setHours(12, 0, 0, 0)
  } else {
    t.setHours(23, 59, 59, 999)
  }
  return t
}

export function actiuneCard(
  lead: Lead,
  opts?: { acum?: Date; areInrolare?: boolean },
): ActiuneCard {
  const acum = opts?.acum ?? new Date()
  const azi = inceputZi(acum)
  const zileDe = (iso: string | null): number | null => {
    if (!iso) return null
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return null
    return Math.round((inceputZi(d) - azi) / MS_ZI)
  }

  // Un client existent care cere ceva nu e un lead rece: nu primește SMS-uri
  // automate și nu apare în listele de sunat, deci ar putrezi aici neatins.
  if (lead.deja_client && (lead.status === 'nou' || lead.status === 'contactat')) {
    return {
      text: 'Deschide fișa clientului',
      ton: 'azi',
      detaliu:
        'E deja clientul nostru — de obicei vrea un al doilea curs (−10%) sau are o întrebare. Nu primește niciun SMS automat.',
    }
  }

  switch (lead.status) {
    case 'nou': {
      const termen = termenPrimulApel(lead.created)
      if (acum.getTime() > termen.getTime())
        return {
          text: 'Sună-l acum — termenul a trecut',
          ton: 'urgent',
          detaliu: `Trebuia sunat până pe ${ziScurta(termen.toISOString())}.`,
        }
      return {
        text:
          inceputZi(termen) === azi ? 'Sună-l azi' : 'Sună-l până mâine la 12:00',
        ton: 'azi',
        detaliu: 'Apasă 📞 după apel, și dacă nu răspunde.',
      }
    }

    case 'contactat': {
      const zile = zileDe(lead.data_callback_dorit)
      if (!lead.sub_status)
        return {
          text: 'Alege pasul următor',
          ton: 'urgent',
          detaliu:
            'Ați vorbit, dar nu s-a stabilit nimic: programare, dată de revenire, waiting list sau motiv. Altfel cardul rămâne aici la nesfârșit.',
        }
      if (lead.sub_status === 'de_revenit') {
        if (zile === null)
          return { text: 'Pune data la care îl suni', ton: 'urgent' }
        if (zile > 0)
          return {
            text: `Sună-l pe ${ziScurta(lead.data_callback_dorit)}`,
            ton: 'asteptare',
            detaliu: 'El a cerut ziua asta. Până atunci, nimic.',
          }
        return {
          text: zile === 0 ? 'Sună-l azi — a cerut-o el' : 'Sună-l acum, ai întârziat',
          ton: 'urgent',
          detaliu:
            zile === 0
              ? 'A răspuns și a cerut să-l sunăm azi.'
              : `A cerut să-l sunăm pe ${ziScurta(lead.data_callback_dorit)}.`,
        }
      }
      // nu_raspunde
      const incercari = lead.nr_contactari ?? 0
      if (zile !== null && zile > 0)
        return {
          text: `Reîncearcă pe ${ziScurta(lead.data_callback_dorit)}`,
          ton: 'asteptare',
          detaliu: `${incercari} ${incercari === 1 ? 'încercare' : 'încercări'} la rând fără răspuns.`,
        }
      return {
        text: `Încearcă a ${Math.min(incercari + 1, 3)}-a oară`,
        ton: zile !== null && zile < 0 ? 'urgent' : 'azi',
        detaliu:
          'Altă oră decât data trecută. Încearcă și pe WhatsApp. După 3 la rând fără răspuns pleacă în Nurture.',
      }
    }

    case 'waiting_list':
      return {
        text: 'Așteaptă un loc liber',
        ton: 'asteptare',
        detaliu:
          'A primit SMS-ul de confirmare. Sună-l imediat ce se eliberează un loc — cei mai vechi sunt sus.',
      }

    case 'programat': {
      const zile = zileDe(lead.data_programare)
      if (zile === null)
        return { text: 'Pune data și grupa ședinței', ton: 'urgent' }
      if (zile > 0)
        return {
          text: `Ședință pe ${ziScurta(lead.data_programare)}`,
          ton: 'asteptare',
          detaliu: 'Nimic de făcut până atunci. Confirmarea a plecat deja.',
        }
      if (zile === 0)
        return {
          text: 'Bifează prezența după oră',
          ton: 'azi',
          detaliu: 'În rosterul grupei. Nebifat ⇒ peste noapte devine „Nu a venit".',
        }
      return {
        text: 'Bifează dacă a venit',
        ton: 'urgent',
        detaliu:
          'Ședința a trecut și cardul e încă aici. Dacă a venit și nu bifezi, îl trecem „Nu a venit" și-l sunăm degeaba peste două zile.',
      }
    }

    case 'a_venit':
      if (lead.id_client && !opts?.areInrolare)
        return {
          text: 'Termină înscrierea',
          ton: 'urgent',
          detaliu:
            'Clientul e creat, dar nu are înrolare: nu apare în nicio grupă și n-are ce plăti.',
        }
      return {
        text: 'Vorbește cu el — se înscrie?',
        ton: 'azi',
        detaliu:
          'Discuția de după clasă e pasul care aduce înscrierea. Se înscrie → convertește-l. Se gândește → pune o dată. Nu vrea → motiv.',
      }

    case 'nu_a_venit': {
      // Ziua apelului o ștampilează DB-ul la intrarea în status (+2 zile de la
      // absență, weekendul împins pe luni) — aici doar se citește.
      const zile = zileDe(lead.data_callback_dorit)
      const incercari = lead.nr_contactari ?? 0
      const detaliu =
        incercari > 0
          ? `${incercari} ${incercari === 1 ? 'încercare' : 'încercări'} fără răspuns. După 3 pleacă în Nurture.`
          : 'N-a ajuns la ședință. Ținta: o dată nouă, nu o explicație.'
      if (zile === null)
        return { text: 'Sună-l — reprogramează ședința', ton: 'azi', detaliu }
      if (zile > 0)
        return {
          text: `Sună-l pe ${ziScurta(lead.data_callback_dorit)}`,
          ton: 'asteptare',
          detaliu: 'La 2 zile de la absență. Până atunci, nimic.',
        }
      return {
        text:
          zile === 0 ? 'Sună-l azi — n-a ajuns la ședință' : 'Sună-l acum, ai întârziat',
        ton: zile === 0 ? 'azi' : 'urgent',
        detaliu,
      }
    }

    case 'convertit':
      return {
        text: 'Gata — e client',
        ton: 'gata',
        detaliu: 'Continuă din fișa clientului: contract și plăți.',
      }

    case 'pierdut':
      return {
        text: 'Închis — nu se mai contactează',
        ton: 'gata',
        detaliu: lead.motiv_pierdut ?? undefined,
      }

    case 'nurture':
      return {
        text: 'Reactivează-l dacă revine',
        ton: 'asteptare',
        detaliu:
          'Bazinul de reactivare. Nu pleacă niciun SMS automat de aici; se sună doar la campanii.',
      }
  }
}

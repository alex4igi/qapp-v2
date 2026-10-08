import type { BadgeTone } from '@/components/ui'
import type { StareAbsenta } from './types'

// Procedura pe fiecare stare a unui caz „Absent 21 de zile", așa cum o vede recepția
// (tooltip pe stare + „ℹ︎ Procedura" din capul paginii). Același format ca la kanbanul
// de leads (src/features/leads/procedura.ts). Sursa de adevăr, cu maparea regulă → cod,
// e docs/procedura-absenti-21z.md — cele două se schimbă ÎMPREUNĂ.
//
// `aplicatia` descrie doar ce face codul ACUM.
export type ProceduraStare = {
  eticheta: string
  ton: BadgeTone
  inseamna: string
  peScurt: { ceFaci: string; aplicatia: string }
  ceFaci: string[]
  aplicatia: string[]
  iesiri: string
}

export const STARE_PROCEDURA: Record<StareAbsenta, ProceduraStare> = {
  de_contactat: {
    eticheta: 'De sunat',
    ton: 'danger',
    inseamna: 'Copilul n-a mai venit de 21 de zile la o grupă care a ținut ședințe. Nu l-a sunat încă nimeni.',
    peScurt: {
      ceFaci: 'Sună familia în 48 de ore lucrătoare și notează rezultatul cu 📞.',
      aplicatia: 'Pornește ceasul de 48 h luni–vineri; sâmbăta și duminica nu se numără.',
    },
    ceFaci: [
      'Sună familia în maximum 48 de ore lucrătoare de la intrarea în listă (weekendul nu se numără).',
      'Întreabă de ce nu mai vine și alege motivul din listă — e singurul loc unde se strânge „de ce pleacă oamenii".',
      'Notează rezultatul cu 📞: Revine · Nu răspunde · Amână (cu dată) · Renunță.',
      'Și „Nu răspunde" oprește ceasul de 48 h: ai încercat la timp.',
    ],
    aplicatia: [
      'Deschide cazul noaptea, la 21 de zile de la ultima prezență (sau de la începutul înscrierii, dacă n-a venit deloc).',
      'Nu deschide caz pentru cine a reziliat deja: rezilierea are motivul scris, deci s-a vorbit cu familia.',
      'Colorează cazul galben după 24 h și roșu după 48 h lucrătoare fără niciun apel notat.',
    ],
    iesiri: 'Revine · Reîncercare · Amânat · Renunță · A revenit singur · Reziliat separat',
  },
  reincercare: {
    eticheta: 'Reîncercare',
    ton: 'warn',
    inseamna: 'L-ai sunat o dată și nu a răspuns.',
    peScurt: {
      ceFaci: 'Sună din nou când reapare în listă, peste 7 zile.',
      aplicatia: 'Îl ascunde 7 zile, apoi îl readuce în „De sunat azi".',
    },
    ceFaci: [
      'Nu face nimic până reapare: aplicația îl readuce singură peste 7 zile.',
      'Când reapare, sună-l la altă oră decât prima dată.',
      'Dacă nu răspunde nici acum, notează „Nu răspunde": aplicația trimite SMS-ul și trece cazul în „Fără răspuns".',
    ],
    aplicatia: [
      'Păstrează cazul în „În așteptare" cu data următorului apel.',
      'În ziua aceea îl urcă din nou în „De sunat azi".',
      'Dacă între timp copilul vine la curs, închide cazul ca „A revenit".',
    ],
    iesiri: 'Revine · Fără răspuns · Amânat · Renunță · A revenit singur',
  },
  fara_raspuns: {
    eticheta: 'Fără răspuns',
    ton: 'warn',
    inseamna: 'Două apeluri la o săptămână distanță, niciunul cu răspuns. SMS-ul e a treia încercare.',
    peScurt: {
      ceFaci: 'Nimic de sunat. Dacă familia te sună înapoi, notează discuția pe caz.',
      aplicatia: 'Trimite SMS-ul la 16:00 (luni–vineri). La 45 de zile fără prezență, cere managerului să confirme rezilierea.',
    },
    ceFaci: [
      'Nu mai suna: încercările s-au terminat.',
      'Dacă familia răspunde la SMS sau te sună, deschide cazul și notează rezultatul (Revine / Amână / Renunță).',
    ],
    aplicatia: [
      'Trimite SMS-ul „nu v-am putut prinde la telefon" la 16:00, în aceeași zi (luni–vineri), când e cineva la sală să răspundă.',
      'Trece motivul pe „Necunoscut / fără răspuns", dacă nu era altul.',
      'La 45 de zile de la ultima prezență, dacă tot n-a venit, trimite cazul managerului să confirme rezilierea.',
    ],
    iesiri: 'De confirmat · Revine · Amânat · Renunță · A revenit singur',
  },
  de_confirmat: {
    eticheta: 'La manager',
    ton: 'danger',
    inseamna: 'Fără răspuns și fără nicio prezență de 45 de zile. Managerul decide dacă se reziliază lunile neconsumate.',
    peScurt: {
      ceFaci: 'Managerul: Reziliază sau Păstrează locul. Recepția: nimic.',
      aplicatia: 'Notificare + email zilnic managerului până decide.',
    },
    ceFaci: [
      'Managerul alege „Reziliază" sau „Păstrează locul", cu o notă dacă e cazul.',
      'Dacă familia sună între timp, recepția notează discuția pe caz: cazul iese din coada managerului.',
    ],
    aplicatia: [
      'Trimite notificarea „Reziliere de confirmat" managerilor locației și adminilor.',
      'Trimite în fiecare zi lucrătoare un email cu cazurile care așteaptă decizia, până se golește lista.',
      'La „Reziliază": anulează lunile fără nicio prezență și fără bani încasați, până la finalul sezonului. Lunile cu prezențe rămân cu datoria lor.',
      'În noaptea de după reziliere, copilul trece EXclient și intră în Nurture (dacă nu mai merge la altă grupă).',
    ],
    iesiri: 'Reziliat · Păstrat · A revenit singur',
  },
  revine: {
    eticheta: 'Revine',
    ton: 'success',
    inseamna: 'Ai vorbit cu familia și spune că revine.',
    peScurt: {
      ceFaci: 'Nimic. Dacă nu apare la ședința promisă, mai sună o dată.',
      aplicatia: 'Când vine la curs, închide cazul ca „A revenit".',
    },
    ceFaci: ['Notează în „Pas următor" când revine.', 'Dacă nu apare, poți nota încă un contact pe caz.'],
    aplicatia: [
      'Când apare prima prezență, închide cazul ca „A revenit".',
      'După 30 de zile, verdictul K3: reactivat dacă a venit și n-are restanță scadentă pe luna revenirii.',
    ],
    iesiri: 'A revenit · Reziliat separat',
  },
  amanat: {
    eticheta: 'Amânat',
    ton: 'brand',
    inseamna: 'Familia vrea să revină, dar mai târziu. Locul se eliberează; la data aleasă îi suni din nou.',
    peScurt: {
      ceFaci: 'Reziliază lunile viitoare (se deschide singur). La data aleasă, sună și discută cu managerul opțiunile.',
      aplicatia: 'Readuce cazul în „De sunat azi" la data de revenire.',
    },
    ceFaci: [
      'Alege data la care revine. După salvare se deschide rezilierea: locul din grupă se eliberează.',
      'La data aleasă cazul reapare în listă. Sună familia; dacă vrea să revină, discută cu managerul ce grupă și ce loc mai e.',
    ],
    aplicatia: [
      'Ține cazul în „În așteptare" până la data de revenire, apoi îl urcă în „De sunat azi".',
      'Dacă vine la curs mai devreme, închide cazul ca „A revenit".',
    ],
    iesiri: 'Revine · Renunță · Reîncercare · A revenit',
  },
  renunta: {
    eticheta: 'Renunță',
    ton: 'neutral',
    inseamna: 'Familia a spus că renunță. Rezilierea s-a făcut din caz.',
    peScurt: {
      ceFaci: 'Confirmă rezilierea care se deschide după salvare, apoi trimite cererea la semnat.',
      aplicatia: 'Cazul rămâne la calculul K3 (decizia s-a luat în contact).',
    },
    ceFaci: [
      'După salvare se deschide rezilierea, cu motivul completat. Confirm-o — e valabilă imediat.',
      'Bifează „Nurture" dacă familia ar putea reveni într-un sezon viitor.',
      'Dacă familia are email, apasă „Trimite cererea la semnat": o completează și o semnează, pentru dosar.',
    ],
    aplicatia: [
      'Trimite cererea de reziliere doar pe email. Dacă familia n-are email, nu se trimite nimic. O găsești apoi în Contracte.',
      'Păstrează cazul la calculul K3 ca nereactivat — decizia s-a luat în urma contactului.',
    ],
    iesiri: 'cap de drum',
  },
  a_revenit: {
    eticheta: 'A revenit',
    ton: 'success',
    inseamna: 'A venit din nou la curs (la orice grupă).',
    peScurt: { ceFaci: 'Nimic.', aplicatia: 'Închide cazul noaptea, la prima prezență nouă.' },
    ceFaci: ['Nimic.'],
    aplicatia: ['Închide cazul la prima prezență după intrarea în listă. Verdictul K3 vine după 30 de zile.'],
    iesiri: 'cap de drum',
  },
  reziliat: {
    eticheta: 'Reziliat',
    ton: 'neutral',
    inseamna: 'Managerul a confirmat rezilierea după trei încercări fără răspuns.',
    peScurt: { ceFaci: 'Nimic.', aplicatia: 'Lunile neconsumate sunt anulate; copilul intră în Nurture.' },
    ceFaci: ['Nimic.'],
    aplicatia: [
      'Lunile fără prezență și fără bani încasați sunt anulate (0 lei).',
      'Jobul de noapte îl trece EXclient și îl pune în Nurture.',
    ],
    iesiri: 'cap de drum',
  },
  pastrat: {
    eticheta: 'Păstrat',
    ton: 'neutral',
    inseamna: 'Managerul a hotărât să nu rezilieze. Înscrierea rămâne cum e.',
    peScurt: { ceFaci: 'Nimic.', aplicatia: 'Cazul se închide fără nicio schimbare la înscriere.' },
    ceFaci: ['Nimic.'],
    aplicatia: ['Nu schimbă nimic la înscriere.'],
    iesiri: 'cap de drum',
  },
  reziliat_separat: {
    eticheta: 'Reziliat separat',
    ton: 'neutral',
    inseamna: 'A fost reziliat din afara cazului (fișa clientului, suspendarea grupei). Nu intră la K3.',
    peScurt: { ceFaci: 'Nimic.', aplicatia: 'Scoate cazul din listă și din calculul K3.' },
    ceFaci: [
      'Nimic. Dacă ai vorbit cu familia, data viitoare notează discuția pe caz, nu doar în fișă.',
    ],
    aplicatia: ['Scoate cazul din listă și din calculul K3 (decizia de reziliere nu s-a luat în contactul de recuperare).'],
    iesiri: 'cap de drum',
  },
}

export const STARI_DE_LUCRU: StareAbsenta[] = ['de_contactat', 'reincercare', 'fara_raspuns', 'de_confirmat', 'amanat']
export const STARI_INCHISE: StareAbsenta[] = ['revine', 'renunta', 'a_revenit', 'reziliat', 'pastrat', 'reziliat_separat']

// Ordinea în care le arată „ℹ︎ Procedura".
export const ORDINE_STARI: StareAbsenta[] = [
  'de_contactat',
  'reincercare',
  'fara_raspuns',
  'de_confirmat',
  'revine',
  'amanat',
  'renunta',
  'a_revenit',
  'reziliat',
  'pastrat',
  'reziliat_separat',
]

// Aliasuri convenabile peste tipurile generate de Supabase (database.ts).
// database.ts se regenerează cu `npm run gen:types` — nu se editează manual.

import type { Database } from './database'

type Public = Database['public']

export type Tables<T extends keyof Public['Tables']> =
  Public['Tables'][T]['Row']
export type InsertDto<T extends keyof Public['Tables']> =
  Public['Tables'][T]['Insert']
export type UpdateDto<T extends keyof Public['Tables']> =
  Public['Tables'][T]['Update']
export type Views<T extends keyof Public['Views']> = Public['Views'][T]['Row']
export type Enums<T extends keyof Public['Enums']> = Public['Enums'][T]

// Row-uri tabele
export type Client = Tables<'clienti'>
export type Familie = Tables<'familii'>
export type Teacher = Tables<'teacheri'>
export type Curs = Tables<'cursuri'>
export type Sala = Tables<'sali'>
export type Locatie = Tables<'locatii'>
export type Sezon = Tables<'sezoane'>
export type Vacanta = Tables<'vacante'>
export type Enrollment = Tables<'enrollments'>
export type Prezenta = Tables<'prezente'>
export type Incasare = Tables<'incasari'>
export type Voucher = Tables<'vouchere'>
export type Lead = Tables<'leads'>
export type ProgramareLead = Tables<'programari_leads'>
export type Prospect = Tables<'prospecti'>
export type CampaniePromovare = Tables<'campanii_promovare'>
export type Eveniment = Tables<'evenimente'>
export type DocumentClient = Tables<'documente_client'>
export type Concurs = Tables<'concursuri'>
export type Inventar = Tables<'inventar'>
export type Cheltuiala = Tables<'cheltuieli'>
export type Feedback = Tables<'feedback'>
export type AppFeedback = Tables<'app_feedback'>
export type Anunt = Tables<'anunturi'>
export type Evaluare = Tables<'evaluari'>
export type EvaluareTeacher = Tables<'evaluari_teacher'>
export type SituatieSms = Tables<'situatie_sms_uri'>
export type ParametruAplicatie = Tables<'parametri_aplicatie'>
export type SalariuTeacher = Tables<'salarii_teacher'>
export type ReconciliereCash = Tables<'reconcilieri_cash'>
export type OpenSesiune = Tables<'open_sesiuni'>
export type OpenRezervare = Tables<'open_rezervari'>
export type CampanieReinscriere = Tables<'campanii_reinscriere'>
export type ReinscriereGate = Tables<'reinscrieri_gate'>
export type TarifPublic = Tables<'tarife_publice'>

// Enums folosite în UI
export type StatusPrezenta = Enums<'status_prezenta'>
export type StatusLead = Enums<'status_lead'>
export type SubStatusLead = Enums<'sub_status_lead'>
export type GrupaLead = Enums<'grupa_lead'>
export type InteresLead = Enums<'interes_lead'>
export type AppFeedbackTip = Enums<'app_feedback_tip'>
export type AppFeedbackStatus = Enums<'app_feedback_status'>
export type StatusRezervare = Enums<'status_rezervare'>

// Row-uri view-uri folosite în UI
export type VPlatiInrolari = Views<'plati_inrolari'>
export type VListaCursuri = Views<'lista_cursuri'>
export type VListaClienti = Views<'lista_clienti'>
export type VProfilClient = Views<'profil_client'>
export type VRaportFinanciar = Views<'raport_financiar'>
export type VTeacherCursStats = Views<'teacher_curs_stats'>

import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Spinner } from '@/components/ui'
import { AuthProvider } from '@/hooks/useAuth'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { AuthBootGate } from '@/components/AuthBootGate'
import { AppLayout } from '@/components/layout/AppLayout'
import { AdministrareIndex, AdministrareLayout } from '@/components/layout/AdministrareLayout'
import { Placeholder } from '@/components/Placeholder'
import { LoginPage } from '@/pages/LoginPage'
import { DashboardPage } from '@/pages/DashboardPage'
// Toate paginile în afară de Login și Dashboard se încarcă la cerere: bundle-ul
// inițial ținea 47 de pagini (1,5 MB) și trăgea recharts sincron prin Financiar/CFO,
// deși prima pagină nu le folosește. Chunk-urile se cache-uiesc după prima vizită.
const ClientiListPage = lazy(() =>
  import('@/features/clienti/ClientiListPage').then((m) => ({ default: m.ClientiListPage })),
)
const ClientProfilePage = lazy(() =>
  import('@/features/clienti/ClientProfilePage').then((m) => ({ default: m.ClientProfilePage })),
)
const FamiliiListPage = lazy(() =>
  import('@/features/familii/FamiliiListPage').then((m) => ({ default: m.FamiliiListPage })),
)
const FamilieProfilePage = lazy(() =>
  import('@/features/familii/FamilieProfilePage').then((m) => ({ default: m.FamilieProfilePage })),
)
const TeacheriListPage = lazy(() =>
  import('@/features/teacheri/TeacheriListPage').then((m) => ({ default: m.TeacheriListPage })),
)
const TeacherProfilePage = lazy(() =>
  import('@/features/teacheri/TeacherProfilePage').then((m) => ({ default: m.TeacherProfilePage })),
)
const CursuriListPage = lazy(() =>
  import('@/features/cursuri/CursuriListPage').then((m) => ({ default: m.CursuriListPage })),
)
const CursProfilePage = lazy(() =>
  import('@/features/cursuri/CursProfilePage').then((m) => ({ default: m.CursProfilePage })),
)
const PlatiListPage = lazy(() =>
  import('@/features/plati/PlatiListPage').then((m) => ({ default: m.PlatiListPage })),
)
const PrezentePage = lazy(() =>
  import('@/features/prezente/PrezentePage').then((m) => ({ default: m.PrezentePage })),
)
const InchirieriCalendarPage = lazy(() =>
  import('@/features/inchirieri/pages/CalendarPage').then((m) => ({ default: m.CalendarPage })),
)
const LeadsPage = lazy(() =>
  import('@/features/leads/LeadsPage').then((m) => ({ default: m.LeadsPage })),
)
const NotificariSmsPage = lazy(() =>
  import('@/features/notificari-sms/NotificariSmsPage').then((m) => ({ default: m.NotificariSmsPage })),
)
const FeedbackListPage = lazy(() =>
  import('@/features/feedback/FeedbackListPage').then((m) => ({ default: m.FeedbackListPage })),
)
const AppFeedbackListPage = lazy(() =>
  import('@/features/feedback-app/AppFeedbackListPage').then((m) => ({ default: m.AppFeedbackListPage })),
)
const AnunturiPage = lazy(() =>
  import('@/features/announcements/AnunturiPage').then((m) => ({ default: m.AnunturiPage })),
)
const FinanciarPage = lazy(() =>
  import('@/features/financiar/FinanciarPage').then((m) => ({ default: m.FinanciarPage })),
)
const CfoPage = lazy(() =>
  import('@/features/cfo/CfoPage').then((m) => ({ default: m.CfoPage })),
)
const ScorecardPage = lazy(() =>
  import('@/features/scorecard/ScorecardPage').then((m) => ({ default: m.ScorecardPage })),
)
const FacturarePage = lazy(() =>
  import('@/features/facturare/FacturarePage').then((m) => ({ default: m.FacturarePage })),
)
const FiseIncompletePage = lazy(() =>
  import('@/features/fise-incomplete/FiseIncompletePage').then((m) => ({ default: m.FiseIncompletePage })),
)
// Paginile de statistici trag recharts — code-split din bundle-ul inițial.
const DatoriiPage = lazy(() =>
  import('@/features/datorii/DatoriiPage').then((m) => ({ default: m.DatoriiPage })),
)
const Absente21zPage = lazy(() => import('@/features/absente21z/Absente21zPage'))
const GrileKpiPage = lazy(() => import('@/features/grile-kpi/GrileKpiPage'))
const GrilaEditorPage = lazy(() => import('@/features/grile-kpi/GrilaEditorPage'))
const RaportKpiPage = lazy(() => import('@/features/raport-kpi/RaportKpiPage'))
const AnalyticsPage = lazy(() =>
  import('@/features/analytics/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage })),
)
const StatisticiPage = lazy(() =>
  import('@/features/statistici/StatisticiPage').then((m) => ({ default: m.StatisticiPage })),
)
const AnsambluPage = lazy(() =>
  import('@/features/ansamblu/AnsambluPage').then((m) => ({ default: m.AnsambluPage })),
)
const StartSezonPage = lazy(() =>
  import('@/features/start-sezon/StartSezonPage').then((m) => ({
    default: m.StartSezonPage,
  })),
)
// Editorul de template-uri trage pdfjs-dist — code-split, nu intră în bundle-ul inițial.
const TemplateEditorPage = lazy(() =>
  import('@/features/contracte/TemplateEditorPage').then((m) => ({ default: m.TemplateEditorPage })),
)
const VouchereListPage = lazy(() =>
  import('@/features/vouchere/VouchereListPage').then((m) => ({ default: m.VouchereListPage })),
)
const InventarListPage = lazy(() =>
  import('@/features/inventar/InventarListPage').then((m) => ({ default: m.InventarListPage })),
)
const EvenimenteListPage = lazy(() =>
  import('@/features/evenimente/EvenimenteListPage').then((m) => ({ default: m.EvenimenteListPage })),
)
const EvenimentRosterPage = lazy(() =>
  import('@/features/evenimente/EvenimentRosterPage').then((m) => ({ default: m.EvenimentRosterPage })),
)
const ConcursuriListPage = lazy(() =>
  import('@/features/concursuri/ConcursuriListPage').then((m) => ({ default: m.ConcursuriListPage })),
)
const SpectacoleListPage = lazy(() =>
  import('@/features/spectacole/SpectacoleListPage').then((m) => ({ default: m.SpectacoleListPage })),
)
const SpectacolProfilePage = lazy(() =>
  import('@/features/spectacole/SpectacolProfilePage').then((m) => ({ default: m.SpectacolProfilePage })),
)
const CampaniiListPage = lazy(() =>
  import('@/features/campanii/CampaniiListPage').then((m) => ({ default: m.CampaniiListPage })),
)
const MarketingPage = lazy(() =>
  import('@/features/marketing/MarketingPage').then((m) => ({ default: m.MarketingPage })),
)
const ContracteListPage = lazy(() =>
  import('@/features/contracte/ContracteListPage').then((m) => ({ default: m.ContracteListPage })),
)
const ReinscrieriPage = lazy(() =>
  import('@/features/reinscrieri/ReinscrieriPage').then((m) => ({ default: m.ReinscrieriPage })),
)
const SetariPage = lazy(() =>
  import('@/features/setari/SetariPage').then((m) => ({ default: m.SetariPage })),
)
const OfertaPublicaPage = lazy(() =>
  import('@/features/oferta-publica/OfertaPublicaPage').then((m) => ({ default: m.OfertaPublicaPage })),
)
const MetodologicPage = lazy(() =>
  import('@/features/metodologic/pages/MetodologicPage').then((m) => ({ default: m.MetodologicPage })),
)
const ProgramEditorPage = lazy(() =>
  import('@/features/metodologic/pages/ProgramEditorPage').then((m) => ({ default: m.ProgramEditorPage })),
)
const OrganizatiePage = lazy(() =>
  import('@/features/setari/OrganizatiePage').then((m) => ({ default: m.OrganizatiePage })),
)
const EvaluariPage = lazy(() =>
  import('@/features/evaluari/EvaluariPage').then((m) => ({ default: m.EvaluariPage })),
)
const EvaluareGrupaPage = lazy(() =>
  import('@/features/evaluari/grupa/EvaluareGrupaPage').then((m) => ({ default: m.EvaluareGrupaPage })),
)
const SalariulMeuPage = lazy(() =>
  import('@/features/salariu-teacher/SalariulMeuPage').then((m) => ({ default: m.SalariulMeuPage })),
)
const GrupeleMelePage = lazy(() =>
  import('@/features/teacher-stats/GrupeleMelePage').then((m) => ({ default: m.GrupeleMelePage })),
)
const NotificariPage = lazy(() =>
  import('@/features/notificari/NotificariPage').then((m) => ({ default: m.NotificariPage })),
)
const AuditPage = lazy(() =>
  import('@/features/audit/AuditPage').then((m) => ({ default: m.AuditPage })),
)
const PontajStaffPage = lazy(() =>
  import('@/features/pontaj/PontajStaffPage').then((m) => ({ default: m.PontajStaffPage })),
)
const GrupaDashboardPage = lazy(() =>
  import('@/features/dashboard/GrupaDashboardPage').then((m) => ({ default: m.GrupaDashboardPage })),
)
const SituatieZilnicaPage = lazy(() =>
  import('@/features/situatie-zilnica/SituatieZilnicaPage').then((m) => ({ default: m.SituatieZilnicaPage })),
)
const OptOutListPage = lazy(() =>
  import('@/features/opt-out/OptOutListPage').then((m) => ({ default: m.OptOutListPage })),
)
import { ROUTE_ACCESS } from '@/lib/rolesMatrix'

function App() {
  return (
    <AuthProvider>
      <AuthBootGate>
      <BrowserRouter>
        <Suspense fallback={<div className="flex min-h-[60vh] items-center justify-center"><Spinner /></div>}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route element={<ProtectedRoute allowedRoles={ROUTE_ACCESS['/evaluari']} />}>
            <Route element={<AppLayout />}>
              <Route path="evaluari" element={<EvaluariPage />} />
              <Route path="evaluari/grupa/:cursId" element={<EvaluareGrupaPage />} />
            </Route>
          </Route>

          {/* Rutele „mele" de instructor — gardate pe profilul legat, nu pe rol,
              ca un manager care predă să le vadă. */}
          <Route
            element={
              <ProtectedRoute
                allowedRoles={ROUTE_ACCESS['/salariul-meu']}
                requiresTeacherProfile
              />
            }
          >
            <Route element={<AppLayout />}>
              <Route path="salariul-meu" element={<SalariulMeuPage />} />
            </Route>
          </Route>

          <Route
            element={
              <ProtectedRoute
                allowedRoles={ROUTE_ACCESS['/grupele-mele']}
                requiresTeacherProfile
              />
            }
          >
            <Route element={<AppLayout />}>
              <Route path="grupele-mele" element={<GrupeleMelePage />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute allowedRoles={ROUTE_ACCESS['/notificari']} />}>
            <Route element={<AppLayout />}>
              <Route path="notificari" element={<NotificariPage />} />
            </Route>
          </Route>

          {/* Feedback despre aplicație — accesibil tuturor rolurilor (inclusiv
              teacher): autorul își vede propriul feedback, admin/owner triază tot. */}
          <Route element={<ProtectedRoute allowedRoles={ROUTE_ACCESS['/feedback-app']} />}>
            <Route element={<AppLayout />}>
              <Route path="feedback-app" element={<AppFeedbackListPage />} />
            </Route>
          </Route>

          {/* Anunțuri staff — accesibil tuturor rolurilor (trimit + primesc). */}
          <Route element={<ProtectedRoute allowedRoles={ROUTE_ACCESS['/anunturi']} />}>
            <Route element={<AppLayout />}>
              <Route path="anunturi" element={<AnunturiPage />} />
            </Route>
          </Route>

          {/* Rute accesibile inclusiv teacher-ului (matrice WITH_TEACHER):
              dashboard, cursuri, prezente, grupa + profil cursant (via roster). */}
          <Route element={<ProtectedRoute allowedRoles={ROUTE_ACCESS['/']} />}>
            <Route element={<AppLayout />}>
              <Route index element={<DashboardPage />} />
              <Route path="cursuri" element={<CursuriListPage />} />
              <Route path="cursuri/:id" element={<CursProfilePage />} />
              <Route path="prezente" element={<PrezentePage />} />
              <Route path="inchirieri" element={<InchirieriCalendarPage />} />
              <Route path="grupa/:cursId" element={<GrupaDashboardPage />} />
              <Route path="clienti/:id" element={<ClientProfilePage />} />
            </Route>
          </Route>

          {/* Overview: staff fără teacher (teacher-ul nu are conținut aici). */}
          <Route element={<ProtectedRoute allowedRoles={ROUTE_ACCESS['/overview']} />}>
            <Route element={<AppLayout />}>
              <Route path="overview" element={<AnsambluPage />} />
            </Route>
          </Route>

          {/* Rute pentru staff (no teacher): listele globale + financial. */}
          <Route element={<ProtectedRoute allowedRoles={ROUTE_ACCESS['/clienti']} />}>
            <Route element={<AppLayout />}>
              <Route path="clienti" element={<ClientiListPage />} />
              <Route path="familii" element={<FamiliiListPage />} />
              <Route path="familii/:id" element={<FamilieProfilePage />} />
              <Route path="teacheri" element={<TeacheriListPage />} />
              <Route path="teacheri/:id" element={<TeacherProfilePage />} />
              <Route path="plati" element={<PlatiListPage />} />
              <Route path="datorii" element={<DatoriiPage />} />
              {/* /recuperare a fost absorbit de hub-ul /datorii */}
              <Route path="recuperare" element={<Navigate to="/datorii" replace />} />
              <Route path="absente-21z" element={<Absente21zPage />} />
              <Route path="sms" element={<NotificariSmsPage />} />
              <Route path="facturare" element={<FacturarePage />} />
              <Route path="feedback" element={<FeedbackListPage />} />
              <Route path="situatie-zilnica" element={<SituatieZilnicaPage />} />
            </Route>
          </Route>

          {/* Contracte — submeniu la Clienți (a ieșit din hub-ul Administrare). */}
          <Route element={<ProtectedRoute allowedRoles={ROUTE_ACCESS['/contracte']} />}>
            <Route element={<AppLayout />}>
              <Route path="contracte" element={<ContracteListPage />} />
              {/* Tab „Șabloane" trăiește în ContracteListPage; ruta separată
                  există ca intrare directă (bookmark) — auto-selectează tab-ul. */}
              <Route path="contracte/sabloane" element={<ContracteListPage />} />
            </Route>
          </Route>

          {/* Leads are gard propriu (nu blocul /clienti): agenția externă de ads
              vede fișele de lead, dar nimic din clienți/plăți/facturare. */}
          <Route element={<ProtectedRoute allowedRoles={ROUTE_ACCESS['/leads']} />}>
            <Route element={<AppLayout />}>
              <Route path="leads" element={<LeadsPage />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute allowedRoles={ROUTE_ACCESS['/campanii']} />}>
            <Route element={<AppLayout />}>
              <Route path="campanii" element={<CampaniiListPage />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute allowedRoles={ROUTE_ACCESS['/marketing']} />}>
            <Route element={<AppLayout />}>
              <Route path="marketing" element={<MarketingPage />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute allowedRoles={ROUTE_ACCESS['/contracte/sabloane']} />}>
            <Route element={<AppLayout />}>
              <Route path="contracte/sabloane/nou" element={<TemplateEditorPage />} />
              <Route path="contracte/sabloane/:id" element={<TemplateEditorPage />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute allowedRoles={ROUTE_ACCESS['/financiar']} />}>
            <Route element={<AppLayout />}>
              <Route path="financiar" element={<FinanciarPage />} />
              <Route path="statistici" element={<StatisticiPage />} />
              <Route path="scorecard" element={<ScorecardPage />} />
              <Route path="vouchere" element={<VouchereListPage />} />
              <Route path="evenimente" element={<EvenimenteListPage />} />
              <Route path="concursuri" element={<ConcursuriListPage />} />
              <Route path="reinscrieri" element={<ReinscrieriPage />} />
            </Route>
          </Route>

          {/* Spectacole / recitaluri — producție lineup (owner/admin/manager). */}
          <Route element={<ProtectedRoute allowedRoles={ROUTE_ACCESS['/spectacole']} />}>
            <Route element={<AppLayout />}>
              <Route path="spectacole" element={<SpectacoleListPage />} />
              <Route path="spectacole/:id" element={<SpectacolProfilePage />} />
            </Route>
          </Route>

          {/* Roster eveniment — accesibil întregului staff (inclusiv recepția),
              deschis din cardul de pe dashboard; gestiunea evenimentelor rămâne
              în /evenimente (privilegiat). */}
          <Route element={<ProtectedRoute allowedRoles={ROUTE_ACCESS['/eveniment']} />}>
            <Route element={<AppLayout />}>
              <Route
                path="eveniment/:evenimentId"
                element={<EvenimentRosterPage />}
              />
            </Route>
          </Route>

          {/* Dashboard analitic + zonă CFO — doar owner + admin. */}
          <Route element={<ProtectedRoute allowedRoles={ROUTE_ACCESS['/analytics']} />}>
            <Route element={<AppLayout />}>
              <Route path="analytics" element={<AnalyticsPage />} />
              <Route path="cfo" element={<CfoPage />} />
            </Route>
          </Route>

          {/* Raportul de început de sezon — citit, nu lucrat: nu scrie nimic. */}
          <Route element={<ProtectedRoute allowedRoles={ROUTE_ACCESS['/start-sezon']} />}>
            <Route element={<AppLayout />}>
              <Route path="start-sezon" element={<StartSezonPage />} />
            </Route>
          </Route>

          {/* Hub „Administrare" — cele 6 pagini de config sub un tab-bar comun
              (AdministrareLayout). Paths neschimbate → deep-link-uri & linkuri
              interne rămân valide. Organizație (owner-only) are gard propriu.
              Contracte a ieșit din hub — vezi blocul de sub /clienti. */}
          {/* Landing-ul hub-ului sare pe primul tab permis rolului — paginile de
              sub el au garduri separate (toate PRIVILEGED+). */}
          <Route element={<ProtectedRoute allowedRoles={ROUTE_ACCESS['/administrare']} />}>
            <Route element={<AppLayout />}>
              <Route path="administrare" element={<AdministrareIndex />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute allowedRoles={ROUTE_ACCESS['/setari']} />}>
            <Route element={<AppLayout />}>
              <Route element={<AdministrareLayout />}>
                <Route path="setari" element={<SetariPage />} />
                <Route path="inventar" element={<InventarListPage />} />
                <Route path="pontaj-staff" element={<PontajStaffPage />} />
                <Route path="audit" element={<AuditPage />} />
                <Route path="fise-incomplete" element={<FiseIncompletePage />} />
              </Route>
            </Route>
          </Route>

          <Route element={<ProtectedRoute allowedRoles={ROUTE_ACCESS['/organizatie']} />}>
            <Route element={<AppLayout />}>
              <Route element={<AdministrareLayout />}>
                <Route path="organizatie" element={<OrganizatiePage />} />
              </Route>
            </Route>
          </Route>

          {/* Config bonusuri: bloc propriu, admin/owner. Blocul /setari e
              PRIVILEGED, deci ar deschide grilele și managerului PL. */}
          <Route element={<ProtectedRoute allowedRoles={ROUTE_ACCESS['/grile-kpi']} />}>
            <Route element={<AppLayout />}>
              <Route element={<AdministrareLayout />}>
                <Route path="grile-kpi" element={<GrileKpiPage />} />
                <Route path="grile-kpi/:grilaId" element={<GrilaEditorPage />} />
              </Route>
            </Route>
          </Route>

          {/* Raportul lunar de bonus. Bloc propriu: nu stă în hub-ul
              Administrare (acolo se configurează grilele, admin/owner), ci în
              Rapoarte, unde managerul PL îl lucrează lunar. */}
          <Route element={<ProtectedRoute allowedRoles={ROUTE_ACCESS['/raport-kpi']} />}>
            <Route element={<AppLayout />}>
              <Route path="raport-kpi" element={<RaportKpiPage />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute allowedRoles={ROUTE_ACCESS['/oferta-publica']} />}>
            <Route element={<AppLayout />}>
              <Route path="oferta-publica" element={<OfertaPublicaPage />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute allowedRoles={ROUTE_ACCESS['/metodologic']} />}>
            <Route element={<AppLayout />}>
              <Route path="metodologic" element={<MetodologicPage />} />
              <Route path="metodologic/:programId" element={<ProgramEditorPage />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute allowedRoles={ROUTE_ACCESS['/opt-out']} />}>
            <Route element={<AppLayout />}>
              <Route path="opt-out" element={<OptOutListPage />} />
            </Route>
          </Route>

          <Route
            path="*"
            element={<Placeholder title="404" description="Pagina nu există." />}
          />
        </Routes>
        </Suspense>
      </BrowserRouter>
      </AuthBootGate>
    </AuthProvider>
  )
}

export default App

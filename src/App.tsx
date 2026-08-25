import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Spinner } from '@/components/ui'
import { AuthProvider } from '@/hooks/useAuth'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { AppLayout } from '@/components/layout/AppLayout'
import { AdministrareLayout } from '@/components/layout/AdministrareLayout'
import { Placeholder } from '@/components/Placeholder'
import { LoginPage } from '@/pages/LoginPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { ClientiListPage } from '@/features/clienti/ClientiListPage'
import { ClientProfilePage } from '@/features/clienti/ClientProfilePage'
import { FamiliiListPage } from '@/features/familii/FamiliiListPage'
import { FamilieProfilePage } from '@/features/familii/FamilieProfilePage'
import { TeacheriListPage } from '@/features/teacheri/TeacheriListPage'
import { TeacherProfilePage } from '@/features/teacheri/TeacherProfilePage'
import { CursuriListPage } from '@/features/cursuri/CursuriListPage'
import { CursProfilePage } from '@/features/cursuri/CursProfilePage'
import { PlatiListPage } from '@/features/plati/PlatiListPage'
import { PrezentePage } from '@/features/prezente/PrezentePage'
import { CalendarPage as InchirieriCalendarPage } from '@/features/inchirieri/pages/CalendarPage'
import { LeadsPage } from '@/features/leads/LeadsPage'
import { NotificariSmsPage } from '@/features/notificari-sms/NotificariSmsPage'
import { FeedbackListPage } from '@/features/feedback/FeedbackListPage'
import { AppFeedbackListPage } from '@/features/feedback-app/AppFeedbackListPage'
import { AnunturiPage } from '@/features/announcements/AnunturiPage'
import { FinanciarPage } from '@/features/financiar/FinanciarPage'
import { CfoPage } from '@/features/cfo/CfoPage'
import { ScorecardPage } from '@/features/scorecard/ScorecardPage'
import { FacturarePage } from '@/features/facturare/FacturarePage'
// Paginile de statistici trag recharts — code-split din bundle-ul inițial.
const DatoriiPage = lazy(() =>
  import('@/features/datorii/DatoriiPage').then((m) => ({ default: m.DatoriiPage })),
)
const AnalyticsPage = lazy(() =>
  import('@/features/analytics/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage })),
)
const StatisticiPage = lazy(() =>
  import('@/features/statistici/StatisticiPage').then((m) => ({ default: m.StatisticiPage })),
)
const AnsambluPage = lazy(() =>
  import('@/features/ansamblu/AnsambluPage').then((m) => ({ default: m.AnsambluPage })),
)
// Editorul de template-uri trage pdfjs-dist — code-split, nu intră în bundle-ul inițial.
const TemplateEditorPage = lazy(() =>
  import('@/features/contracte/TemplateEditorPage').then((m) => ({ default: m.TemplateEditorPage })),
)
import { VouchereListPage } from '@/features/vouchere/VouchereListPage'
import { InventarListPage } from '@/features/inventar/InventarListPage'
import { EvenimenteListPage } from '@/features/evenimente/EvenimenteListPage'
import { EvenimentRosterPage } from '@/features/evenimente/EvenimentRosterPage'
import { ConcursuriListPage } from '@/features/concursuri/ConcursuriListPage'
import { SpectacoleListPage } from '@/features/spectacole/SpectacoleListPage'
import { SpectacolProfilePage } from '@/features/spectacole/SpectacolProfilePage'
import { CampaniiListPage } from '@/features/campanii/CampaniiListPage'
import { ContracteListPage } from '@/features/contracte/ContracteListPage'
import { ReinscrieriPage } from '@/features/reinscrieri/ReinscrieriPage'
import { SetariPage } from '@/features/setari/SetariPage'
import { OfertaPublicaPage } from '@/features/oferta-publica/OfertaPublicaPage'
import { MetodologicPage } from '@/features/metodologic/pages/MetodologicPage'
import { ProgramEditorPage } from '@/features/metodologic/pages/ProgramEditorPage'
import { OrganizatiePage } from '@/features/setari/OrganizatiePage'
import { EvaluariPage } from '@/features/evaluari/EvaluariPage'
import { EvaluareGrupaPage } from '@/features/evaluari/grupa/EvaluareGrupaPage'
import { SalariulMeuPage } from '@/features/salariu-teacher/SalariulMeuPage'
import { GrupeleMelePage } from '@/features/teacher-stats/GrupeleMelePage'
import { NotificariPage } from '@/features/notificari/NotificariPage'
import { AuditPage } from '@/features/audit/AuditPage'
import { PontajStaffPage } from '@/features/pontaj/PontajStaffPage'
import { GrupaDashboardPage } from '@/features/dashboard/GrupaDashboardPage'
import { SituatieZilnicaPage } from '@/features/situatie-zilnica/SituatieZilnicaPage'
import { OptOutListPage } from '@/features/opt-out/OptOutListPage'
import { ROUTE_ACCESS } from '@/lib/rolesMatrix'

function App() {
  return (
    <AuthProvider>
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
              <Route path="leads" element={<LeadsPage />} />
              <Route path="datorii" element={<DatoriiPage />} />
              {/* /recuperare a fost absorbit de hub-ul /datorii */}
              <Route path="recuperare" element={<Navigate to="/datorii" replace />} />
              <Route path="sms" element={<NotificariSmsPage />} />
              <Route path="facturare" element={<FacturarePage />} />
              <Route path="feedback" element={<FeedbackListPage />} />
              <Route path="situatie-zilnica" element={<SituatieZilnicaPage />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute allowedRoles={ROUTE_ACCESS['/campanii']} />}>
            <Route element={<AppLayout />}>
              <Route path="campanii" element={<CampaniiListPage />} />
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

          {/* Hub „Administrare" — cele 6 pagini de config sub un tab-bar comun
              (AdministrareLayout). Paths neschimbate → deep-link-uri & linkuri
              interne rămân valide. Organizație (owner-only) are gard propriu. */}
          <Route element={<ProtectedRoute allowedRoles={ROUTE_ACCESS['/administrare']} />}>
            <Route element={<AppLayout />}>
              <Route path="administrare" element={<Navigate to="/setari" replace />} />
              <Route element={<AdministrareLayout />}>
                <Route path="setari" element={<SetariPage />} />
                <Route path="contracte" element={<ContracteListPage />} />
                {/* Tab „Șabloane" trăiește în ContracteListPage; ruta separată
                    există ca intrare directă (bookmark) — auto-selectează tab-ul. */}
                <Route path="contracte/sabloane" element={<ContracteListPage />} />
                <Route path="inventar" element={<InventarListPage />} />
                <Route path="pontaj-staff" element={<PontajStaffPage />} />
                <Route path="audit" element={<AuditPage />} />
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
    </AuthProvider>
  )
}

export default App

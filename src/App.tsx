import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from '@/hooks/useAuth'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { AppLayout } from '@/components/layout/AppLayout'
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
import { LeadsPage } from '@/features/leads/LeadsPage'
import { NotificariSmsPage } from '@/features/notificari-sms/NotificariSmsPage'
import { FeedbackListPage } from '@/features/feedback/FeedbackListPage'
import { AppFeedbackListPage } from '@/features/feedback-app/AppFeedbackListPage'
import { AnunturiPage } from '@/features/announcements/AnunturiPage'
import { FinanciarPage } from '@/features/financiar/FinanciarPage'
import { StatisticiPage } from '@/features/statistici/StatisticiPage'
import { AnsambluPage } from '@/features/ansamblu/AnsambluPage'
import { VouchereListPage } from '@/features/vouchere/VouchereListPage'
import { InventarListPage } from '@/features/inventar/InventarListPage'
import { EvenimenteListPage } from '@/features/evenimente/EvenimenteListPage'
import { ConcursuriListPage } from '@/features/concursuri/ConcursuriListPage'
import { CampaniiListPage } from '@/features/campanii/CampaniiListPage'
import { ReinscrieriPage } from '@/features/reinscrieri/ReinscrieriPage'
import { SetariPage } from '@/features/setari/SetariPage'
import { OrganizatiePage } from '@/features/setari/OrganizatiePage'
import { EvaluariListPage } from '@/features/evaluari/EvaluariListPage'
import { SalariulMeuPage } from '@/features/salariu-teacher/SalariulMeuPage'
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
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route element={<ProtectedRoute allowedRoles={ROUTE_ACCESS['/evaluari']} />}>
            <Route element={<AppLayout />}>
              <Route path="evaluari" element={<EvaluariListPage />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute allowedRoles={ROUTE_ACCESS['/salariul-meu']} />}>
            <Route element={<AppLayout />}>
              <Route path="salariul-meu" element={<SalariulMeuPage />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute allowedRoles={ROUTE_ACCESS['/notificari']} />}>
            <Route element={<AppLayout />}>
              <Route path="notificari" element={<NotificariPage />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute allowedRoles={ROUTE_ACCESS['/audit']} />}>
            <Route element={<AppLayout />}>
              <Route path="audit" element={<AuditPage />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute allowedRoles={ROUTE_ACCESS['/pontaj-staff']} />}>
            <Route element={<AppLayout />}>
              <Route path="pontaj-staff" element={<PontajStaffPage />} />
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
              <Route path="overview" element={<AnsambluPage />} />
              <Route path="cursuri" element={<CursuriListPage />} />
              <Route path="cursuri/:id" element={<CursProfilePage />} />
              <Route path="prezente" element={<PrezentePage />} />
              <Route path="grupa/:cursId" element={<GrupaDashboardPage />} />
              <Route path="clienti/:id" element={<ClientProfilePage />} />
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
              <Route path="sms" element={<NotificariSmsPage />} />
              <Route path="feedback" element={<FeedbackListPage />} />
              <Route path="situatie-zilnica" element={<SituatieZilnicaPage />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute allowedRoles={ROUTE_ACCESS['/campanii']} />}>
            <Route element={<AppLayout />}>
              <Route path="campanii" element={<CampaniiListPage />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute allowedRoles={ROUTE_ACCESS['/financiar']} />}>
            <Route element={<AppLayout />}>
              <Route path="financiar" element={<FinanciarPage />} />
              <Route path="statistici" element={<StatisticiPage />} />
              <Route path="vouchere" element={<VouchereListPage />} />
              <Route path="inventar" element={<InventarListPage />} />
              <Route path="evenimente" element={<EvenimenteListPage />} />
              <Route path="concursuri" element={<ConcursuriListPage />} />
              <Route path="reinscrieri" element={<ReinscrieriPage />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute allowedRoles={ROUTE_ACCESS['/setari']} />}>
            <Route element={<AppLayout />}>
              <Route path="setari" element={<SetariPage />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute allowedRoles={ROUTE_ACCESS['/opt-out']} />}>
            <Route element={<AppLayout />}>
              <Route path="opt-out" element={<OptOutListPage />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute allowedRoles={ROUTE_ACCESS['/organizatie']} />}>
            <Route element={<AppLayout />}>
              <Route path="organizatie" element={<OrganizatiePage />} />
            </Route>
          </Route>

          <Route
            path="*"
            element={<Placeholder title="404" description="Pagina nu există." />}
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App

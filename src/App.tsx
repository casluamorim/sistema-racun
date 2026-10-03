import { lazy, Suspense, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import Auth from "./pages/Auth";

const loaders = {
  dashboard: () => import('./pages/Dashboard'),
  financial: () => import('./pages/Financial'),
  financialPersonal: () => import('./pages/FinancialPersonal'),
  cashflow: () => import('./pages/CashFlow'),
  settings: () => import('./pages/Settings'),
  clients: () => import('./pages/Clients'),
  clientDetail: () => import('./pages/ClientDetail'),
  projects: () => import('./pages/Projects'),
  quotes: () => import('./pages/Quotes'),
  projectDetail: () => import('./pages/ProjectDetail'),
  myWork: () => import('./pages/MyWork'),
  contents: () => import('./pages/Contents'),
  tags: () => import('./pages/TagsPage'),
  activity: () => import('./pages/ActivityPage'),
  notifications: () => import('./pages/Notifications'),
};

const Dashboard = lazy(loaders.dashboard);
const Financial = lazy(loaders.financial);
const FinancialPersonal = lazy(loaders.financialPersonal);
const CashFlow = lazy(loaders.cashflow);
const Settings = lazy(loaders.settings);
const Clients = lazy(loaders.clients);
const ClientDetail = lazy(loaders.clientDetail);
const Projects = lazy(loaders.projects);
const QuotesPage = lazy(loaders.quotes);
const ProjectDetail = lazy(loaders.projectDetail);
const MyWork = lazy(loaders.myWork);
const Contents = lazy(loaders.contents);
const TagsPage = lazy(loaders.tags);
const ActivityPage = lazy(loaders.activity);
const NotificationsPage = lazy(loaders.notifications);

const ClientPortal = lazy(() => import('./pages/ClientPortal'));
const AcceptInvite = lazy(() => import('./pages/AcceptInvite'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const ClientPortalRedirect = lazy(() => import('./pages/ClientPortalRedirect'));
const NotFound = lazy(() => import('./pages/NotFound'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60_000,
      gcTime: 30 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
    },
  },
});

/** Carrega os chunks das telas em segundo plano para a troca ser instantânea. */
function useRoutePrefetch() {
  useEffect(() => {
    let cancelled = false;
    const list = Object.values(loaders);
    let i = 0;
    const next = () => {
      if (cancelled || i >= list.length) return;
      list[i++]().catch(() => {}).then(() => setTimeout(next, 80));
    };
    const id = setTimeout(next, 400);
    return () => { cancelled = true; clearTimeout(id); };
  }, []);
}

/** Indicador discreto (barra no topo) em vez de tela cheia de "Carregando...". */
function RouteFallback() {
  return (
    <div className="fixed left-0 top-0 z-[60] h-0.5 w-full overflow-hidden bg-transparent">
      <div className="h-full w-1/3 animate-pulse bg-primary" />
    </div>
  );
}

function PageFallback() {
  return (
    <div className="dark flex min-h-screen items-center justify-center bg-background">
      <div className="text-muted-foreground">Carregando...</div>
    </div>
  );
}


function AppRoutes() {
  const { user, loading, role, roleLoading, isClient } = useAuth();
  useRoutePrefetch();

  if (loading) return <PageFallback />;
  if (!user) return <Auth />;
  if (roleLoading) return <PageFallback />;

  // Clientes: rota única (redireciona para o portal). Sem acesso ao admin.
  if (isClient) {
    return (
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="*" element={<ClientPortalRedirect />} />
        </Routes>
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/clients" element={<Clients />} />
        <Route path="/clients/:id" element={<ClientDetail />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/projects/:id" element={<ProjectDetail />} />
        <Route path="/meu-trabalho" element={<MyWork />} />
        <Route path="/contents" element={<Contents />} />
        <Route path="/quotes" element={<QuotesPage />} />
        <Route path="/tags" element={<TagsPage />} />
        <Route path="/activity" element={<ActivityPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />

        <Route path="/financial" element={<Financial />} />
        <Route path="/financial/personal" element={<FinancialPersonal />} />
        <Route path="/cashflow" element={<CashFlow />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/portal/:slug" element={<ClientPortal />} />
            <Route path="/accept-invite/:token" element={<AcceptInvite />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/definir-senha" element={<ResetPassword />} />
            <Route path="/*" element={
              <AuthProvider>
                <AppRoutes />
              </AuthProvider>
            } />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

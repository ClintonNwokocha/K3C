import { useCallback, useEffect, useState } from "react";
import ReportsCentrePage from "./pages/ReportsCentrePage";
import AppShell from "./layouts/AppShell";
import AdministrationPage from "./pages/AdministrationPage";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import PublicReportsPage from "./pages/PublicReportsPage";
import PublicPortalPage from "./pages/PublicPortalPage";
import PublicClimateRiskPage from "./pages/PublicClimateRiskPage";
import PublicGHGInventoryPage from "./pages/PublicGHGInventoryExplorerPage";
import PublicProjectsPage from "./pages/PublicProjectsPage";
import GHGInventoryPage from "./pages/GHGInventoryPage";
import PlaceholderPage from "./pages/PlaceholderPage";
import ClimateRiskPage from "./pages/ClimateRiskPage";
import ProjectPortfolioPage from "./pages/ProjectPortfolioPage";
import PublicClimateAtlasPage from "./pages/PublicClimateAtlasPage";
import { canAccessAdministration } from "./utils/permissions";
import {
  getCurrentUser,
  getFoundationData,
  getGHGDashboardSummary,
  getHealthCheck,
  loginUser,
  logoutUser,
  SESSION_EXPIRED_EVENT,
} from "./services/api";
import {
  PUBLIC_ANALYTICS_ROUTES,
  PUBLIC_LOGIN_PATH,
  trackPublicPageView,
} from "./config/analytics";
import "./App.css";

const pageDetails = {
  dashboard: {
    title: "Executive Dashboard",
    description:
      "High-level platform summary for Climate Intelligence, emissions, projects, reports, and alerts.",
  },
  risk: {
    title: "Climate Intelligence Map",
    description:
      "Interactive LGA-level Climate Intelligence map showing flood, drought, heat, exposure, and vulnerability indicators.",
  },
  ghg: {
    title: "GHG Inventory",
    description:
      "Greenhouse gas data-entry, emission calculation, review, and approval workspace.",
  },
  projects: {
    title: "Project Portfolio",
    description:
      "Climate project registration, progress updates, RAG status tracking, and investment monitoring.",
  },
  reports: {
    title: "Reports Centre",
    description:
      "Official PDF reports, briefing notes, CSV exports, and scheduled analytics outputs.",
  },
  administration: {
    title: "Administration",
    description:
      "User management, approval queue, audit logs, reference tables, and system health controls.",
  },
};

function App() {
  const [, setHealth] = useState(null);
  const [foundation, setFoundation] = useState(null);
  const [ghgSummary, setGhgSummary] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [activePage, setActivePage] = useState("dashboard");
  const [error, setError] = useState("");
  const [authError, setAuthError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  // Smallest shared internal-navigation context: Climate Risk -> Project
  // Portfolio -> GHG Inventory. lgaId is the real LGARegistry integer PK
  // (never the display name) so every internal consumer can use it directly
  // against existing lga_id-keyed filters/APIs with no translation step.
  const [sharedLgaContext, setSharedLgaContext] = useState({
    lgaId: null,
    lgaName: "",
    sector: null,
  });

  // Stable reference (useCallback) is required here: ClimateRiskPage calls
  // this from a useEffect keyed partly on the callback itself. An unstable
  // reference would re-fire that effect on every App.jsx re-render it
  // triggers, which would loop.
  const handleLgaSelected = useCallback((lgaId, lgaName) => {
    setSharedLgaContext((current) => {
      if (current.lgaId === lgaId && current.lgaName === lgaName) {
        return current;
      }
      return { ...current, lgaId, lgaName };
    });
  }, []);

  async function loadDashboardData() {
    const [healthData, foundationData, ghgDashboardData] = await Promise.all([
      getHealthCheck(),
      getFoundationData(),
      getGHGDashboardSummary(),
    ]);

    setHealth(healthData);
    setFoundation(foundationData);
    setGhgSummary(ghgDashboardData);
  }

  useEffect(() => {
    async function restoreSession() {
      const token = localStorage.getItem("ksccc_access_token");

      if (!token) {
        setIsLoading(false);
        return;
      }

      try {
        const userData = await getCurrentUser();
        setCurrentUser(userData.user);
        await loadDashboardData();
      } catch (err) {
        console.error(err);
        logoutUser();
        setCurrentUser(null);
      } finally {
        setIsLoading(false);
      }
    }

    restoreSession();
  }, []);

  useEffect(() => {
    function handleSessionExpired() {
      logoutUser();
      setCurrentUser(null);
      setHealth(null);
      setGhgSummary(null);
      setFoundation(null);
      setActivePage("dashboard");
      setError("");
      setAuthError("Your session has expired. Please sign in again.");
    }

    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);

    return () =>
      window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
  }, []);

  useEffect(() => {
    // Public-only page-view tracking (Phase 1). Authenticated/admin traffic
    // is never tracked: "/" only counts as a public view once we know the
    // Staff Login screen (not the signed-in app shell) is what rendered.
    if (isLoading) {
      return;
    }

    const pathname = window.location.pathname;
    const isKnownPublicRoute = PUBLIC_ANALYTICS_ROUTES.includes(pathname);
    const isPublicLoginScreen = pathname === PUBLIC_LOGIN_PATH && !currentUser;

    if (isKnownPublicRoute || isPublicLoginScreen) {
      trackPublicPageView(pathname);
    }
  }, [isLoading, currentUser]);

  async function handleLogin(username, password) {
    setAuthError("");

    try {
      await loginUser(username, password);

      const userData = await getCurrentUser();
      setCurrentUser(userData.user);
      setActivePage("dashboard");

      await loadDashboardData();
    } catch (err) {
      console.error(err);
      logoutUser();
      setAuthError("Invalid username or password.");
    }
  }

  function handleLogout() {
    logoutUser();
    setCurrentUser(null);
    setHealth(null);
    setGhgSummary(null);
    setFoundation(null);
    setActivePage("dashboard");
    setError("");
  }

  function renderPage() {
    if (activePage === "dashboard") {
      return (
        <Dashboard
          foundation={foundation}
          ghgSummary={ghgSummary}
          currentUser={currentUser}
          onPageChange={setActivePage}
        />
      );
    }

    if (activePage === "administration") {
      if (!canAccessAdministration(currentUser)) {
        return (
          <PlaceholderPage
            title="Access Restricted"
            description="You do not have permission to access the Administration module."
          />
        );
      }

      return <AdministrationPage foundation={foundation} />;
    }

    if (activePage === "ghg") {
      return (
        <GHGInventoryPage
          foundation={foundation}
          currentUser={currentUser}
          sharedSector={sharedLgaContext.sector}
          sharedLgaName={sharedLgaContext.lgaName}
        />
      );
    }

    if (activePage === "risk") {
      return (
        <ClimateRiskPage
          currentUser={currentUser}
          onLgaSelected={handleLgaSelected}
          onPageChange={setActivePage}
        />
      );
    }

    if (activePage === "projects") {
      return (
        <ProjectPortfolioPage
          currentUser={currentUser}
          sharedLgaId={sharedLgaContext.lgaId}
          sharedLgaName={sharedLgaContext.lgaName}
        />
      );
    }

    if (activePage === "reports") {
      return <ReportsCentrePage currentUser={currentUser} />;
    }

    const selectedPage = pageDetails[activePage];

    return (
      <PlaceholderPage
        title={selectedPage?.title || "Page Not Found"}
        description={
          selectedPage?.description || "The selected page could not be found."
        }
      />
    );
  }

  const publicRoutes = {
    "/public": <PublicPortalPage />,
    "/public/climate-intelligence": <PublicClimateRiskPage />,
    "/public/climate-risk": <PublicClimateRiskPage />,
    "/public/climate-atlas": <PublicClimateAtlasPage />,
    "/public/ghg-inventory": <PublicGHGInventoryPage />,
    "/public/projects": <PublicProjectsPage />,
    "/public/reports": <PublicReportsPage />,
  };

  const publicPage = publicRoutes[window.location.pathname];

  if (publicPage) {
    return publicPage;
  }

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        Loading KS-CCC...
      </main>
    );
  }

  if (!currentUser) {
    return <Login onLogin={handleLogin} error={authError} />;
  }

  return (
    <AppShell
      currentUser={currentUser}
      onLogout={handleLogout}
      activePage={activePage}
      onPageChange={async (page) => {
        setActivePage(page);

        if (page === "dashboard") {
          await loadDashboardData();
        }
      }}
    >
      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
          {error}
        </div>
      ) : (
        renderPage()
      )}
    </AppShell>
  );
}

export default App;

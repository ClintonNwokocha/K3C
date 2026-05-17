import { useEffect, useState } from "react";
import AppShell from "./layouts/AppShell";
import AdministrationPage from "./pages/AdministrationPage";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import GHGInventoryPage from "./pages/GHGInventoryPage";
import PlaceholderPage from "./pages/PlaceholderPage";
import {
  getCurrentUser,
  getFoundationData,
  getGHGDashboardSummary,
  getHealthCheck,
  loginUser,
  logoutUser,
} from "./services/api";
import "./App.css";

const pageDetails = {
  dashboard: {
    title: "Executive Dashboard",
    description:
      "High-level platform summary for climate risk, emissions, projects, reports, and alerts.",
  },
  risk: {
    title: "Climate Risk Map",
    description:
      "Interactive LGA-level climate risk map showing flood, drought, heat, exposure, and vulnerability indicators.",
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
  const [health, setHealth] = useState(null);
  const [foundation, setFoundation] = useState(null);
  const [ghgSummary, setGhgSummary] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [activePage, setActivePage] = useState("dashboard");
  const [error, setError] = useState("");
  const [authError, setAuthError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

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
          health={health}
          foundation={foundation}
          ghgSummary={ghgSummary}
        />
      );
    }

    if (activePage === "administration") {
      return <AdministrationPage foundation={foundation} />;
    }

    if (activePage === "ghg") {
      return <GHGInventoryPage foundation={foundation} currentUser={currentUser} />;
    }

    const selectedPage = pageDetails[activePage];

    return (
      <PlaceholderPage
        title={selectedPage.title}
        description={selectedPage.description}
      />
    );
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
      onPageChange={setActivePage}
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
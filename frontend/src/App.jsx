import { useEffect, useState } from "react";
import AppShell from "./layouts/AppShell";
import Dashboard from "./pages/Dashboard";
import { getFoundationData, getHealthCheck } from "./services/api";
import "./App.css";

function App() {
  const [health, setHealth] = useState(null);
  const [foundation, setFoundation] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadData() {
      try {
        const healthData = await getHealthCheck();
        const foundationData = await getFoundationData();

        setHealth(healthData);
        setFoundation(foundationData);
      } catch (err) {
        console.error(err);
        setError("Could not connect to KS-CCC backend.");
      }
    }

    loadData();
  }, []);

  return (
    <AppShell>
      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
          {error}
        </div>
      ) : (
        <Dashboard health={health} foundation={foundation} />
      )}
    </AppShell>
  );
}

export default App;
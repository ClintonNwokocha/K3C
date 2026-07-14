import { useCallback, useEffect, useState } from "react";
import {
  getClimateRiskProfiles,
  getClimateProjects,
  getReportDocuments,
  getRemoteSensingLayers,
} from "../services/api";

const SOURCES = ["risk", "projects", "reports", "layers"];

const EMPTY_STATE = SOURCES.reduce((acc, key) => ({ ...acc, [key]: null }), {});

// Module-level (not a hook closure) so the effect below never synchronously
// invokes a function that itself sets state — the setState calls only happen
// inside the .then() continuation, which react-hooks/set-state-in-effect
// does not treat as "calling setState within the effect body".
function fetchDashboardData() {
  return Promise.allSettled([
    getClimateRiskProfiles({}),
    getClimateProjects({}),
    getReportDocuments({}),
    getRemoteSensingLayers(),
  ]).then((results) => {
    const nextData = {};
    const nextErrors = {};

    SOURCES.forEach((key, index) => {
      const result = results[index];
      if (result.status === "fulfilled") {
        nextData[key] = result.value;
        nextErrors[key] = null;
      } else {
        nextData[key] = null;
        nextErrors[key] = result.reason?.message || "Failed to load.";
      }
    });

    return { nextData, nextErrors };
  });
}

// Single coordinated fetch for the Executive Dashboard's new sections, so
// DashboardCommandMetricsRow / DashboardClimateAtlasDatasets / DashboardRecentInsights
// share one round of requests instead of each fetching the same endpoints independently.
// Promise.allSettled means one failing source never blanks the others.
export function useExecutiveDashboardData() {
  const [data, setData] = useState(EMPTY_STATE);
  const [errors, setErrors] = useState(EMPTY_STATE);
  const [loading, setLoading] = useState(true);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let ignore = false;

    fetchDashboardData().then(({ nextData, nextErrors }) => {
      if (ignore) return;
      setData(nextData);
      setErrors(nextErrors);
      setLoading(false);
    });

    return () => {
      ignore = true;
    };
  }, [refreshToken]);

  const refresh = useCallback(() => {
    setLoading(true);
    setRefreshToken((token) => token + 1);
  }, []);

  return { data, loading, errors, refresh };
}

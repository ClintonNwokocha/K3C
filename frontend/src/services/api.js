import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";
const LOGIN_ENDPOINT = "/accounts/token/";
export const SESSION_EXPIRED_EVENT = "ksccc:session-expired";

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("ksccc_access_token");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

// Single-flight guard so a burst of concurrent 401s (several widgets failing
// at once) only triggers one logout/redirect cycle, not one per request.
let sessionExpiredHandled = false;

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const requestUrl = error.config?.url || "";

    // A 401 from the login endpoint itself is a normal "wrong credentials"
    // response, not a session expiry — let the caller's own catch handle it.
    const isLoginRequest = requestUrl.includes(LOGIN_ENDPOINT);

    // Public pages are unauthenticated by design; never force a redirect there.
    const onPublicRoute = window.location.pathname.startsWith("/public");

    if (status === 401 && !isLoginRequest && !onPublicRoute) {
      if (!sessionExpiredHandled) {
        sessionExpiredHandled = true;

        localStorage.removeItem("ksccc_access_token");
        localStorage.removeItem("ksccc_refresh_token");

        window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
      }
    }

    return Promise.reject(error);
  }
);

export async function loginUser(username, password) {
  const response = await api.post(LOGIN_ENDPOINT, {
    username,
    password,
  });

  localStorage.setItem("ksccc_access_token", response.data.access);
  localStorage.setItem("ksccc_refresh_token", response.data.refresh);

  // A fresh successful login starts a new session — re-arm the guard so a
  // future expiry (after this login) can be detected and handled again.
  sessionExpiredHandled = false;

  return response.data;
}

export async function getCurrentUser() {
  const response = await api.get("/accounts/me/");
  return response.data;
}

export function logoutUser() {
  localStorage.removeItem("ksccc_access_token");
  localStorage.removeItem("ksccc_refresh_token");
}

export async function getHealthCheck() {
  const response = await api.get("/core/health/");
  return response.data;
}

export async function getFoundationData() {
  const response = await api.get("/core/foundation/");
  return response.data;
}

export async function getManagedUsers() {
  const response = await api.get("/accounts/users/");
  return response.data;
}

export async function createManagedUser(payload) {
  const response = await api.post("/accounts/users/", payload);
  return response.data;
}

export async function updateManagedUser(userId, payload) {
  const response = await api.patch(`/accounts/users/${userId}/`, payload);
  return response.data;
}

export async function getEnergyOptions() {
  const response = await api.get("/ghg/energy/options/");
  return response.data;
}

export async function getEnergyEntries() {
  const response = await api.get("/ghg/energy/entries/");
  return response.data;
}

export async function createEnergyEntry(payload) {
  const response = await api.post("/ghg/energy/entries/", payload);
  return response.data;
}

export async function updateEnergyEntry(entryId, payload) {
  const response = await api.patch(`/ghg/energy/entries/${entryId}/`, payload);
  return response.data;
}

export async function submitEnergyEntry(entryId) {
  const response = await api.post(`/ghg/energy/entries/${entryId}/submit/`);
  return response.data;
}

export async function getEnergyReviewQueue() {
  const response = await api.get("/ghg/energy/review-queue/");
  return response.data;
}

export async function reviewEnergyEntry(entryId, payload) {
  const response = await api.post(
    `/ghg/energy/entries/${entryId}/review/`,
    payload
  );
  return response.data;
}

export async function getGHGDashboardSummary() {
  const response = await api.get("/ghg/dashboard-summary/");
  return response.data;
}

export async function getAgricultureOptions() {
  const response = await api.get("/ghg/agriculture/options/");
  return response.data;
}

export async function getAgricultureEntries() {
  const response = await api.get("/ghg/agriculture/entries/");
  return response.data;
}

export async function createAgricultureEntry(payload) {
  const response = await api.post("/ghg/agriculture/entries/", payload);
  return response.data;
}

export async function updateAgricultureEntry(entryId, payload) {
  const response = await api.patch(
    `/ghg/agriculture/entries/${entryId}/`,
    payload
  );
  return response.data;
}

export async function submitAgricultureEntry(entryId) {
  const response = await api.post(
    `/ghg/agriculture/entries/${entryId}/submit/`
  );
  return response.data;
}

export async function getAgricultureReviewQueue() {
  const response = await api.get("/ghg/agriculture/review-queue/");
  return response.data;
}

export async function reviewAgricultureEntry(entryId, payload) {
  const response = await api.post(
    `/ghg/agriculture/entries/${entryId}/review/`,
    payload
  );
  return response.data;
}

export async function getWasteOptions() {
  const response = await api.get("/ghg/waste/options/");
  return response.data;
}

export async function getWasteEntries() {
  const response = await api.get("/ghg/waste/entries/");
  return response.data;
}

export async function createWasteEntry(payload) {
  const response = await api.post("/ghg/waste/entries/", payload);
  return response.data;
}

export async function updateWasteEntry(entryId, payload) {
  const response = await api.patch(`/ghg/waste/entries/${entryId}/`, payload);
  return response.data;
}

export async function submitWasteEntry(entryId) {
  const response = await api.post(`/ghg/waste/entries/${entryId}/submit/`);
  return response.data;
}

export async function getWasteReviewQueue() {
  const response = await api.get("/ghg/waste/review-queue/");
  return response.data;
}

export async function reviewWasteEntry(entryId, payload) {
  const response = await api.post(
    `/ghg/waste/entries/${entryId}/review/`,
    payload
  );
  return response.data;
}

export async function getIPPUOptions() {
  const response = await api.get("/ghg/ippu/options/");
  return response.data;
}

export async function getIPPUEntries() {
  const response = await api.get("/ghg/ippu/entries/");
  return response.data;
}

export async function createIPPUEntry(payload) {
  const response = await api.post("/ghg/ippu/entries/", payload);
  return response.data;
}

export async function updateIPPUEntry(entryId, payload) {
  const response = await api.patch(`/ghg/ippu/entries/${entryId}/`, payload);
  return response.data;
}

export async function submitIPPUEntry(entryId) {
  const response = await api.post(`/ghg/ippu/entries/${entryId}/submit/`);
  return response.data;
}

export async function getIPPUReviewQueue() {
  const response = await api.get("/ghg/ippu/review-queue/");
  return response.data;
}

export async function reviewIPPUEntry(entryId, payload) {
  const response = await api.post(
    `/ghg/ippu/entries/${entryId}/review/`,
    payload
  );
  return response.data;
}

export async function getLULUCFOptions() {
  const response = await api.get("/ghg/lulucf/options/");
  return response.data;
}

export async function getLULUCFEntries() {
  const response = await api.get("/ghg/lulucf/entries/");
  return response.data;
}

export async function createLULUCFEntry(payload) {
  const response = await api.post("/ghg/lulucf/entries/", payload);
  return response.data;
}

export async function updateLULUCFEntry(entryId, payload) {
  const response = await api.patch(`/ghg/lulucf/entries/${entryId}/`, payload);
  return response.data;
}

export async function submitLULUCFEntry(entryId) {
  const response = await api.post(`/ghg/lulucf/entries/${entryId}/submit/`);
  return response.data;
}

export async function getLULUCFReviewQueue() {
  const response = await api.get("/ghg/lulucf/review-queue/");
  return response.data;
}

export async function reviewLULUCFEntry(entryId, payload) {
  const response = await api.post(
    `/ghg/lulucf/entries/${entryId}/review/`,
    payload
  );
  return response.data;
}

export async function getClimateRiskProfiles(params = {}) {
  const response = await api.get("/risk/profiles/", { params });
  return response.data;
}

export async function updateClimateRiskProfile(profileId, payload) {
  const response = await api.patch(`/risk/profiles/${profileId}/`, payload);
  return response.data;
}

export async function getClimateRiskParameterRecords(params = {}) {
  const response = await api.get("/risk/parameters/", { params });
  return response.data;
}

export async function createClimateRiskParameterRecord(payload) {
  const response = await api.post("/risk/parameters/", payload);
  return response.data;
}

export async function updateClimateRiskParameterRecord(recordId, payload) {
  const response = await api.patch(`/risk/parameters/${recordId}/`, payload);
  return response.data;
}

export async function getClimateRiskDatasetUploads() {
  const response = await api.get("/risk/uploads/");
  return response.data;
}

export async function uploadClimateRiskDataset(payload) {
  const formData = new FormData();

  formData.append("dataset_type", payload.dataset_type);
  formData.append("year", payload.year);
  formData.append("file", payload.file);

  const response = await api.post("/risk/uploads/", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });

  return response.data;
}

export async function recalculateClimateRiskScores(payload) {
  const response = await api.post("/risk/recalculate/", payload);
  return response.data;
}

export async function normalizeClimateRiskParameters(payload) {
  const response = await api.post("/risk/normalize-parameters/", payload);
  return response.data;
}

export async function getClimateInfrastructureAssets(params = {}) {
  const response = await api.get("/risk/assets/", { params });
  return response.data;
}

export async function createClimateInfrastructureAsset(payload) {
  const response = await api.post("/risk/assets/", payload);
  return response.data;
}

export async function updateClimateInfrastructureAsset(assetId, payload) {
  const response = await api.patch(`/risk/assets/${assetId}/`, payload);
  return response.data;
}

export async function getClimateProjects(params = {}) {
  const response = await api.get("/portfolio/projects/", { params });
  return response.data;
}

export async function createClimateProject(payload) {
  const response = await api.post("/portfolio/projects/", payload);
  return response.data;
}

export async function updateClimateProject(projectId, payload) {
  const response = await api.patch(`/portfolio/projects/${projectId}/`, payload);
  return response.data;
}

export async function importClimateProjectsCsv(file) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await api.post("/portfolio/projects/import/", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });

  return response.data;
}

export async function getReportDocuments(params = {}) {
  const response = await api.get("/reports/documents/", { params });
  return response.data;
}

export async function createReportDocument(formData) {
  const response = await api.post("/reports/documents/", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });

  return response.data;
}

export async function updateReportDocument(reportId, formData) {
  const response = await api.patch(`/reports/documents/${reportId}/`, formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });

  return response.data;
}

export async function getPublicReportDocuments(params = {}) {
  const response = await api.get("/public/reports/", { params });
  return response.data;
}

export async function getPublicPortalSummary() {
  const response = await api.get("/public/summary/");
  return response.data;
}

export async function getPublicClimateRiskProfiles(params = {}) {
  const response = await api.get("/public/climate-risk/", { params });
  return response.data;
}

export async function getPublicClimateProjects(params = {}) {
  const response = await api.get("/public/projects/", { params });
  return response.data;
}

export async function getAuditLogs(params = {}) {
  const response = await api.get("/audit/logs/", { params });
  return response.data;
}

export async function getRemoteSensingLayers() {
  const response = await api.get("/layers/");
  return response.data;
}

export async function getRemoteSensingDashboardKpis() {
  const response = await api.get("/dashboard/kpis/");
  return response.data;
}

export async function getGeeStatus() {
  const response = await api.get("/gee/status/");
  return response.data;
}

export async function getRemoteSensingLgaStats(params = {}) {
  const response = await api.get("/climate/lga-stats/", { params });
  return response.data;
}

export async function getRemoteSensingLgaProfile(lgaId, params = {}) {
  const response = await api.get(`/climate/lga-profile/${lgaId}/`, { params });
  return response.data;
}

export async function getRemoteSensingTileUrl(layer) {
  const response = await api.get(`/tiles/url/${layer}/`);
  return response.data;
}

export async function getClimateHotspots(params = {}) {
  const response = await api.get("/ai/hotspots/", { params });
  return response.data;
}

export async function getRemoteSensingLulcPreview(params = {}) {
  const response = await api.get("/remote-sensing/lulc/", { params });
  return response.data;
}

export async function getRemoteSensingLulcTileUrl(params = {}) {
  const response = await api.get("/remote-sensing/lulc-tile/", { params });
  return response.data;
}

export async function getFloodOccurrencePreview() {
  const response = await api.get("/remote-sensing/flood-occurrence/");
  return response.data;
}

export async function getPublicHistoricalSurfaceWater() {
  const response = await api.get("/remote-sensing/public/historical-surface-water/");
  return response.data;
}

export async function getElevationPreview() {
  const response = await api.get("/remote-sensing/elevation/");
  return response.data;
}

export async function getPublicElevationSummary() {
  const response = await api.get("/remote-sensing/public/elevation/");
  return response.data;
}

export async function getElevationTileUrl() {
  const response = await api.get("/remote-sensing/elevation/tile/", {
    headers: { "X-KCCC-Internal-Preview": "elevation" },
  });
  return response.data;
}

export async function sampleElevationPoint(lat, lng) {
  const response = await api.get("/remote-sensing/elevation/sample/", {
    params: { lat, lng },
    headers: { "X-KCCC-Internal-Preview": "elevation" },
  });
  return response.data;
}

export async function getElevationTileUrlPublic() {
  const response = await api.get("/remote-sensing/elevation/public-tile/");
  return response.data;
}

export async function sampleElevationPointPublic(lat, lng) {
  const response = await api.get("/remote-sensing/elevation/public-sample/", {
    params: { lat, lng },
  });
  return response.data;
}

export async function getClimateIntelligence(params = {}) {
  const response = await api.get("/remote-sensing/climate-intelligence/", { params });
  return response.data;
}

export async function getClimateActionScreeningData(params = {}) {
  const response = await api.get("/remote-sensing/internal/climate-action-screening/", { params });
  return response.data;
}

export async function getClimateIntelligenceProfile(params = {}) {
  const response = await api.get("/remote-sensing/climate-intelligence/profile/", { params });
  return response.data;
}
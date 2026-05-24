import axios from "axios";

const API_BASE_URL = "http://127.0.0.1:8000/api";

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

export async function loginUser(username, password) {
  const response = await api.post("/accounts/token/", {
    username,
    password,
  });

  localStorage.setItem("ksccc_access_token", response.data.access);
  localStorage.setItem("ksccc_refresh_token", response.data.refresh);

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

export async function submitEnergyEntry(entryId) {
  const response = await api.post(`/ghg/energy/entries/${entryId}/submit/`);
  return response.data;
}

export async function getEnergyReviewQueue() {
  const response = await api.get("/ghg/energy/review-queue/");
  return response.data;
}

export async function reviewEnergyEntry(entryId, payload) {
  const response = await api.post(`/ghg/energy/entries/${entryId}/review/`, payload);
  return response.data;
}

export async function getGHGDashboardSummary() {
  const response = await api.get("/ghg/dashboard-summary/");
  return response.data;
}

export async function updateEnergyEntry(entryId, payload) {
  const response = await api.patch(`/ghg/energy/entries/${entryId}/`, payload);
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
  const response = await api.patch(`/ghg/agriculture/entries/${entryId}/`, payload);
  return response.data;
}

export async function submitAgricultureEntry(entryId) {
  const response = await api.post(`/ghg/agriculture/entries/${entryId}/submit/`);
  return response.data;
}

export async function getAgricultureReviewQueue() {
  const response = await api.get("/ghg/agriculture/review-queue/");
  return response.data;
}

export async function reviewAgricultureEntry(entryId, payload) {
  const response = await api.post(`/ghg/agriculture/entries/${entryId}/review/`, payload);
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
  const response = await api.post(`/ghg/waste/entries/${entryId}/review/`, payload);
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
  const response = await api.post(`/ghg/ippu/entries/${entryId}/review/`, payload);
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
  const response = await api.post(`/ghg/lulucf/entries/${entryId}/review/`, payload);
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

  const response = await api.post("/risk/uploads/", formData);
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
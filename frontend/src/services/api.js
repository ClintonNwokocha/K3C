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
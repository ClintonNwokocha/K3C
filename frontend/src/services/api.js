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
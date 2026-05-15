import axios from "axios";

const API_BASE_URL = "http://127.0.0.1:8000/api";

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
});

export async function getHealthCheck() {
  const response = await api.get("/core/health/");
  return response.data;
}

export async function getFoundationData() {
  const response = await api.get("/core/foundation/");
  return response.data;
}
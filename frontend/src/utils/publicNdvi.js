const LOAD_ERROR = "Could not load vegetation data. Please try again later.";

export function getPublicNdviError(seasonResults, catalogResult) {
  if (seasonResults.some((result) => result.status === "fulfilled")) return "";

  // A resource 404 is expected when no active, public NDVI layer exists.
  // Require catalogue confirmation so a broken route remains an error.
  const ndviUnavailable = catalogResult.status === "fulfilled" &&
    Array.isArray(catalogResult.value?.results) &&
    !catalogResult.value.results.some((layer) => layer.key === "ndvi");
  const resourceMissing = seasonResults.every((result) =>
    result.reason?.response?.status === 404 &&
    result.reason.response.data?.detail === "No RemoteSensingLayer matches the given query."
  );
  return ndviUnavailable && resourceMissing ? "" : LOAD_ERROR;
}

export function classifyNdvi(value) {
  if (value === null || value === undefined || value === "") return "Not yet available";
  const n = Number(value);
  if (!Number.isFinite(n)) return "Not yet available";
  if (n >= 0.55) return "Healthy vegetation";
  if (n >= 0.35) return "Moderate vegetation";
  if (n >= 0.2) return "Sparse vegetation";
  return "Low vegetation";
}

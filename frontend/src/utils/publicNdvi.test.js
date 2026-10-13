import assert from "node:assert/strict";
import test from "node:test";
import { classifyNdvi, getPublicNdviError } from "./publicNdvi.js";

const catalog = (results) => ({ status: "fulfilled", value: { results } });
const rejected = (status, detail) => ({
  status: "rejected", reason: { response: { status, data: { detail } } },
});
const missing = rejected(404, "No RemoteSensingLayer matches the given query.");

test("unavailable public NDVI is an empty state", () => {
  assert.equal(getPublicNdviError([missing, missing, missing], catalog([])), "");
});

test("successful public NDVI and empty seasonal queries remain usable", () => {
  for (const results of [[], [{ mean_value: "0.45" }]]) {
    const success = { status: "fulfilled", value: { results } };
    assert.equal(getPublicNdviError([success, success, success], catalog([{ key: "ndvi" }])), "");
    assert.equal(getPublicNdviError([success, missing, missing], catalog([{ key: "ndvi" }])), "");
  }
});

test("route, server, throttle, authentication and network failures stay errors", () => {
  for (const failure of [
    rejected(404, "Not found."), rejected(500, "Server error"),
    rejected(429, "Throttled"), rejected(401, "Unauthorized"),
    { status: "rejected", reason: new Error("Network Error") },
  ]) {
    assert.match(getPublicNdviError([failure, failure, failure], catalog([])), /Could not load/);
  }
});

test("catalogue must confirm that NDVI is unavailable", () => {
  for (const result of [catalog([{ key: "ndvi" }]), catalog(undefined), { status: "rejected" }]) {
    assert.match(getPublicNdviError([missing, missing, missing], result), /Could not load/);
  }
});

test("missing NDVI is never interpreted as a measured zero", () => {
  for (const value of [null, undefined, "", NaN]) {
    assert.equal(classifyNdvi(value), "Not yet available");
  }
  assert.equal(classifyNdvi(0), "Low vegetation");
  assert.equal(classifyNdvi("0.45"), "Moderate vegetation");
  assert.equal(classifyNdvi(0.6), "Healthy vegetation");
});

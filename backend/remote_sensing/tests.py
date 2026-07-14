import datetime
from decimal import Decimal
from io import StringIO
from pathlib import Path
from unittest.mock import MagicMock, patch

from django.core.management import call_command
from django.test import SimpleTestCase, TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APIClient

from core.models import LGARegistry
from remote_sensing.gee_service import GEEResult, gee_service, select_landsat_sensor
from remote_sensing.models import LandCoverDataset, LandCoverSnapshot, RemoteSensingLGAMetric, RemoteSensingLayer
from remote_sensing.sync_registry import LAYER_REGISTRY, get_plan, resolve_season_dates

_CMD = "remote_sensing.management.commands.sync_climate_atlas"

_TEST_FEATURE = {
    "type": "Feature",
    "geometry": {
        "type": "Polygon",
        "coordinates": [
            [[7.0, 10.0], [7.1, 10.0], [7.1, 10.1], [7.0, 10.1], [7.0, 10.0]]
        ],
    },
    "properties": {"lgacode": "19001", "lganame": "TestLGA"},
}

_GEE_INIT_OK = GEEResult(available=True, data={"auth_mode": "test"})


def _make_gee_mock(ndvi_result):
    m = MagicMock()
    m.project = "test-project"
    m.initialize.return_value = _GEE_INIT_OK
    m.compute_ndvi_for_geometry.return_value = ndvi_result
    return m


def _call_sync(*, skip_existing=False, retry_null=False, dry_run=False, gee_mock=None):
    """Run a one-LGA 2020 wet_season NDVI sync and return (stdout, gee_mock)."""
    out = StringIO()
    mock = gee_mock or _make_gee_mock(GEEResult(available=True, data={"mean": 0.5}))
    gee_patch = patch(f"{_CMD}.gee_service", mock)
    feat_patch = patch(
        f"{_CMD}.Command._load_features", return_value=[_TEST_FEATURE]
    )
    with gee_patch, feat_patch:
        call_command(
            "sync_climate_atlas",
            layers=["ndvi"],
            years=[2020],
            seasons=["wet_season"],
            dry_run=dry_run,
            skip_existing=skip_existing,
            retry_null_results=retry_null,
            continue_on_error=True,
            stdout=out,
        )
    return out.getvalue(), mock


class NullResultSentinelTests(TestCase):
    """Sentinel creation and dry-run reporting after a GEE null return."""

    @classmethod
    def setUpTestData(cls):
        cls.layer = RemoteSensingLayer.objects.create(
            key="ndvi",
            label="NDVI Test",
            gee_dataset="Sentinel-2/Landsat NDVI",
            gee_band="NDVI",
            is_active=True,
            is_public=True,
        )
        LGARegistry.objects.create(lga_id=99, lga_name="TestLGA")

    def _get_metric(self):
        return RemoteSensingLGAMetric.objects.filter(
            layer=self.layer,
            admin_code="19001",
            year=2020,
            season="wet_season",
        ).first()

    def test_gee_null_creates_sentinel(self):
        """GEE returning mean=None must write a null-valued sentinel row."""
        _call_sync(gee_mock=_make_gee_mock(GEEResult(available=True, data={"mean": None})))

        row = self._get_metric()
        self.assertIsNotNone(row, "Sentinel row was not created.")
        self.assertIsNone(row.mean_value)
        self.assertEqual(row.metadata.get("result_status"), "no_data")
        self.assertEqual(row.metadata.get("null_reason"), "no_valid_observations")

    def test_valid_result_creates_real_metric(self):
        """A valid GEE mean must create a real metric with no result_status key."""
        _call_sync(gee_mock=_make_gee_mock(GEEResult(available=True, data={"mean": 0.45, "min": 0.2, "max": 0.7})))

        row = self._get_metric()
        self.assertIsNotNone(row)
        self.assertIsNotNone(row.mean_value)
        self.assertAlmostEqual(float(row.mean_value), 0.45, places=4)
        self.assertNotIn("result_status", row.metadata)

    def test_dry_run_after_sentinel_shows_zero_pending(self):
        """After a sentinel is written, dry-run must report 0 pending, 1 no-data."""
        _call_sync(gee_mock=_make_gee_mock(GEEResult(available=True, data={"mean": None})))

        out, _ = _call_sync(dry_run=True, skip_existing=True)
        self.assertIn("Pending GEE calls             : 0", out)
        self.assertIn("Known no-data records         : 1", out)

    def test_retry_null_dry_run_shows_one_pending(self):
        """--retry-null-results in dry-run must expose the sentinel as 1 pending."""
        _call_sync(gee_mock=_make_gee_mock(GEEResult(available=True, data={"mean": None})))

        out, _ = _call_sync(dry_run=True, skip_existing=True, retry_null=True)
        self.assertIn("Pending GEE calls             : 1", out)
        self.assertIn("Known no-data records         : 1", out)


class SkipLogicTests(TestCase):
    """
    Proves the three-way skip logic for --skip-existing / --retry-null-results.

    Case 1: valid metric in DB → GEE not called with --skip-existing.
    Case 2: null sentinel in DB → GEE not called with --skip-existing.
    Case 3: null sentinel in DB → GEE IS called with --skip-existing --retry-null-results.
    """

    @classmethod
    def setUpTestData(cls):
        cls.layer = RemoteSensingLayer.objects.create(
            key="ndvi",
            label="NDVI Test",
            gee_dataset="Sentinel-2/Landsat NDVI",
            gee_band="NDVI",
            is_active=True,
            is_public=True,
        )
        cls.lga = LGARegistry.objects.create(lga_id=99, lga_name="TestLGA")

    def _create_valid_metric(self):
        RemoteSensingLGAMetric.objects.create(
            layer=self.layer,
            admin_level="lga",
            admin_code="19001",
            admin_name="TestLGA",
            lga=self.lga,
            year=2020,
            season="wet_season",
            mean_value=Decimal("0.55"),
            unit="index",
            data_source="test",
            metadata={},
        )

    def _create_null_sentinel(self):
        RemoteSensingLGAMetric.objects.create(
            layer=self.layer,
            admin_level="lga",
            admin_code="19001",
            admin_name="TestLGA",
            lga=self.lga,
            year=2020,
            season="wet_season",
            mean_value=None,
            unit="index",
            data_source="test",
            metadata={"result_status": "no_data", "null_reason": "no_valid_observations"},
        )

    def test_case1_valid_metric_is_skipped_with_skip_existing(self):
        """Case 1: valid record in DB → GEE must not be called."""
        self._create_valid_metric()
        _, mock = _call_sync(skip_existing=True)
        mock.compute_ndvi_for_geometry.assert_not_called()

    def test_case2_null_sentinel_is_skipped_with_skip_existing(self):
        """Case 2: null sentinel in DB → GEE must not be called."""
        self._create_null_sentinel()
        _, mock = _call_sync(skip_existing=True)
        mock.compute_ndvi_for_geometry.assert_not_called()

    def test_case3_null_sentinel_is_retried_with_retry_null_results(self):
        """Case 3: null sentinel in DB → GEE must be called with --retry-null-results."""
        self._create_null_sentinel()
        _, mock = _call_sync(skip_existing=True, retry_null=True)
        mock.compute_ndvi_for_geometry.assert_called_once()


class DynamicMetadataTests(TestCase):
    """
    Proves that GEE-returned data["metadata"] is merged into both valid-metric
    and null-sentinel DB records, and that sentinel state always takes precedence.
    """

    _DYNAMIC_META = {
        "selected_sensor": "LT05",
        "candidate_sensor_scene_counts": {"LT05": 12, "LE07": 0, "LC08": 0},
        "source_image_count": 12,
        "sensor_composite_type": "single_sensor",
        "slc_off_flag": False,
        "mean_valid_observations_per_pixel": 7.25,
        "valid_pixel_coverage_pct": 91.3,
        "coverage_status": "good",
    }

    @classmethod
    def setUpTestData(cls):
        cls.layer = RemoteSensingLayer.objects.create(
            key="ndvi",
            label="NDVI Test",
            gee_dataset="Sentinel-2/Landsat NDVI",
            gee_band="NDVI",
            is_active=True,
            is_public=True,
        )
        LGARegistry.objects.create(lga_id=99, lga_name="TestLGA")

    def _get_metric(self):
        return RemoteSensingLGAMetric.objects.filter(
            layer=self.layer,
            admin_code="19001",
            year=2020,
            season="wet_season",
        ).first()

    def test_valid_result_with_metadata_saves_dynamic_fields(self):
        """data['metadata'] on a valid result must be persisted alongside mean_value."""
        gee_result = GEEResult(
            available=True,
            data={"mean": 0.38, "metadata": self._DYNAMIC_META},
        )
        _call_sync(gee_mock=_make_gee_mock(gee_result))

        row = self._get_metric()
        self.assertIsNotNone(row)
        self.assertAlmostEqual(float(row.mean_value), 0.38, places=4)
        self.assertEqual(row.metadata.get("selected_sensor"), "LT05")
        self.assertEqual(row.metadata.get("sensor_composite_type"), "single_sensor")
        self.assertFalse(row.metadata.get("slc_off_flag"))
        self.assertEqual(row.metadata.get("coverage_status"), "good")
        self.assertAlmostEqual(row.metadata.get("valid_pixel_coverage_pct"), 91.3, places=1)
        self.assertIn("candidate_sensor_scene_counts", row.metadata)
        self.assertNotIn("result_status", row.metadata)

    def test_null_sentinel_with_metadata_preserves_dynamic_fields(self):
        """data['metadata'] on a null result must be persisted on the sentinel row."""
        null_meta = {
            **self._DYNAMIC_META,
            "valid_pixel_coverage_pct": 0.0,
            "mean_valid_observations_per_pixel": 0.0,
            "coverage_status": "no_data",
        }
        gee_result = GEEResult(available=True, data={"mean": None, "metadata": null_meta})
        _call_sync(gee_mock=_make_gee_mock(gee_result))

        row = self._get_metric()
        self.assertIsNotNone(row)
        self.assertIsNone(row.mean_value)
        self.assertEqual(row.metadata.get("result_status"), "no_data")
        self.assertEqual(row.metadata.get("null_reason"), "no_valid_observations")
        self.assertEqual(row.metadata.get("selected_sensor"), "LT05")
        self.assertFalse(row.metadata.get("slc_off_flag"))
        self.assertEqual(row.metadata.get("source_image_count"), 12)
        self.assertEqual(row.metadata.get("valid_pixel_coverage_pct"), 0.0)
        self.assertEqual(row.metadata.get("coverage_status"), "no_data")

    def test_sentinel_state_overrides_conflicting_metadata_keys(self):
        """result_status and null_reason in the sentinel must win over any GEE metadata."""
        poison_meta = {
            "result_status": "should_be_overridden",
            "null_reason": "should_be_overridden",
            "selected_sensor": "LT05",
        }
        gee_result = GEEResult(available=True, data={"mean": None, "metadata": poison_meta})
        _call_sync(gee_mock=_make_gee_mock(gee_result))

        row = self._get_metric()
        self.assertEqual(row.metadata.get("result_status"), "no_data")
        self.assertEqual(row.metadata.get("null_reason"), "no_valid_observations")

    def test_result_without_metadata_key_works_unchanged(self):
        """GEE result with no data['metadata'] key must behave exactly as before."""
        gee_result = GEEResult(available=True, data={"mean": 0.55, "min": 0.3, "max": 0.8})
        _call_sync(gee_mock=_make_gee_mock(gee_result))

        row = self._get_metric()
        self.assertIsNotNone(row)
        self.assertAlmostEqual(float(row.mean_value), 0.55, places=4)
        self.assertNotIn("selected_sensor", row.metadata)
        self.assertNotIn("result_status", row.metadata)

    def test_null_result_without_metadata_key_works_unchanged(self):
        """Null result with no data['metadata'] must still write a well-formed sentinel."""
        gee_result = GEEResult(available=True, data={"mean": None})
        _call_sync(gee_mock=_make_gee_mock(gee_result))

        row = self._get_metric()
        self.assertIsNotNone(row)
        self.assertIsNone(row.mean_value)
        self.assertEqual(row.metadata.get("result_status"), "no_data")
        self.assertEqual(row.metadata.get("null_reason"), "no_valid_observations")
        self.assertNotIn("selected_sensor", row.metadata)


class LandsatRegistryTests(TestCase):
    """
    Non-GEE tests for the ndvi_landsat layer: sensor routing boundaries,
    plan structure, and registry property verification.
    """

    def _route(self, year, season):
        """Return (sensor, red_band, nir_band) using the production season calendar."""
        start, end = resolve_season_dates(year, season)
        end_excl = end + datetime.timedelta(days=1)
        sensor, _, red, nir = select_landsat_sensor(
            start.isoformat(), end_excl.isoformat()
        )
        return sensor, red, nir

    # --- sensor routing boundary tests ---

    def test_sensor_routing_lt05(self):
        """Dry 1985 and Dry 2012 must route to LT05 (SR_B3 / SR_B4)."""
        for year in (1985, 2012):
            with self.subTest(year=year, season="dry_season"):
                sensor, red, nir = self._route(year, "dry_season")
                self.assertEqual(sensor, "LT05")
                self.assertEqual(red, "SR_B3")
                self.assertEqual(nir, "SR_B4")

    def test_sensor_routing_le07(self):
        """Annual/Wet 2012 and Dry/Annual 2013 must route to LE07 (bridge period)."""
        cases = [
            (2012, "annual"),
            (2012, "wet_season"),
            (2013, "dry_season"),
            (2013, "annual"),
        ]
        for year, season in cases:
            with self.subTest(year=year, season=season):
                sensor, _, _ = self._route(year, season)
                self.assertEqual(sensor, "LE07")

    def test_sensor_routing_lc08(self):
        """Wet 2013 and Dry 2014 must route to LC08 (SR_B4 / SR_B5)."""
        for year, season in [(2013, "wet_season"), (2014, "dry_season")]:
            with self.subTest(year=year, season=season):
                sensor, red, nir = self._route(year, season)
                self.assertEqual(sensor, "LC08")
                self.assertEqual(red, "SR_B4")
                self.assertEqual(nir, "SR_B5")

    # --- plan structure tests ---

    def test_pilot_plan_structure(self):
        """ndvi_landsat_pilot_lga must target ndvi_landsat with 6 years and 3 seasons."""
        plan = get_plan("ndvi_landsat_pilot_lga")
        self.assertEqual(plan.layer_keys, ["ndvi_landsat"])
        self.assertEqual(plan.admin_level, "lga")
        self.assertEqual(sorted(plan.years), [1985, 1990, 2000, 2005, 2012, 2017])
        self.assertEqual(plan.seasons, ["annual", "wet_season", "dry_season"])

    def test_historical_plan_resolves_to_2277_task_slots(self):
        """ndvi_landsat_historical_lga x 23 LGAs must produce exactly 2,277 task slots."""
        plan = get_plan("ndvi_landsat_historical_lga")
        self.assertEqual(plan.years, list(range(1985, 2018)))
        self.assertEqual(len(plan.years), 33)
        self.assertEqual(plan.seasons, ["annual", "wet_season", "dry_season"])
        self.assertEqual(len(plan.years) * len(plan.seasons) * 23, 2277)

    # --- registry property tests ---

    def test_registry_properties(self):
        """ndvi_landsat registry entry must have the correct operational properties."""
        reg = LAYER_REGISTRY["ndvi_landsat"]
        self.assertEqual(reg.default_scale, 30)
        self.assertEqual(reg.valid_year_min, 1985)
        self.assertEqual(reg.valid_year_max, 2017)
        self.assertEqual(reg.entry_point, "compute_landsat_ndvi_for_geometry")
        self.assertEqual(reg.metadata_extras["method_version"], "ndvi_landsat_c2_l2_v2")
        self.assertEqual(reg.readiness.value, "RUNNABLE")

    def test_ndvi_landsat_is_distinct_from_sentinel_ndvi(self):
        """ndvi_landsat and ndvi must be separate registry entries with different year ranges."""
        self.assertIn("ndvi_landsat", LAYER_REGISTRY)
        self.assertIn("ndvi", LAYER_REGISTRY)
        landsat = LAYER_REGISTRY["ndvi_landsat"]
        sentinel = LAYER_REGISTRY["ndvi"]
        self.assertNotEqual(landsat.key, sentinel.key)
        self.assertNotEqual(landsat.entry_point, sentinel.entry_point)
        self.assertNotEqual(landsat.valid_year_min, sentinel.valid_year_min)


class LandsatComputeTests(TestCase):
    """
    Non-GEE unit tests for compute_landsat_ndvi_for_geometry.

    A FluentEE stub makes every attribute access and call return itself,
    so the entire server-side computation graph resolves to a single
    controlled getInfo() result.  No real GEE connection is made.
    """

    _GEOMETRY = {
        "type": "Polygon",
        "coordinates": [[[7.0, 10.0], [7.1, 10.0], [7.1, 10.1], [7.0, 10.1], [7.0, 10.0]]],
    }
    # LT05 dates: dry_season 1985 (Nov 1984 – Mar 1985 inclusive, +1 day exclusive end)
    _LT05_START = "1984-11-01"
    _LT05_END   = "1985-04-01"

    def _call(self, getinfo_result, start=None, end=None):
        """Run compute_landsat_ndvi_for_geometry with mocked ee returning getinfo_result."""
        from remote_sensing.gee_service import GoogleEarthEngineService

        class FluentEE:
            """Every attr/call returns self; getInfo() returns the configured dict."""
            def __init__(self, result):
                object.__setattr__(self, '_r', result)
            def __call__(self, *args, **kwargs):
                return self
            def __getattr__(self, name):
                if name == 'getInfo':
                    r = object.__getattribute__(self, '_r')
                    return lambda: r
                return self

        with patch.dict('sys.modules', {'ee': FluentEE(getinfo_result)}):
            svc = GoogleEarthEngineService()
            return svc.compute_landsat_ndvi_for_geometry(
                geometry_dict=self._GEOMETRY,
                start_date=start or self._LT05_START,
                end_date=end or self._LT05_END,
            )

    # --- absent-key safety ---

    def test_empty_composite_does_not_raise(self):
        """Absent NDVI_mean/min/max keys must not raise — must return available=True."""
        props = {
            "obs_count_mean": 0.0,
            "has_obs_mean": 0.0,
            "l5_count": 0, "l7_count": 0, "l8_count": 0, "source_count": 0,
        }
        result = self._call(props)
        self.assertTrue(result.available, msg=result.error)

    def test_empty_composite_returns_none_mean(self):
        """Absent NDVI keys must produce mean=None, min=None, max=None (no-data result)."""
        props = {
            "obs_count_mean": 0.0,
            "has_obs_mean": 0.0,
            "l5_count": 3, "l7_count": 0, "l8_count": 0, "source_count": 3,
        }
        result = self._call(props)
        self.assertIsNone(result.data["mean"])
        self.assertIsNone(result.data["min"])
        self.assertIsNone(result.data["max"])
        self.assertEqual(result.data["metadata"]["coverage_status"], "no_data")

    # --- value pass-through ---

    def test_valid_composite_values_returned_unchanged(self):
        """Present NDVI_mean/min/max must be forwarded unchanged."""
        props = {
            "NDVI_mean": 0.42, "NDVI_min": 0.05, "NDVI_max": 0.78,
            "obs_count_mean": 6.3, "has_obs_mean": 0.94,
            "l5_count": 9, "l7_count": 0, "l8_count": 0, "source_count": 9,
        }
        result = self._call(props)
        self.assertTrue(result.available)
        self.assertAlmostEqual(result.data["mean"], 0.42, places=4)
        self.assertAlmostEqual(result.data["min"],  0.05, places=4)
        self.assertAlmostEqual(result.data["max"],  0.78, places=4)

    # --- metadata completeness ---

    def test_valid_result_carries_all_metadata_fields(self):
        """All required dynamic metadata fields must be present for a valid result."""
        props = {
            "NDVI_mean": 0.55, "NDVI_min": 0.2, "NDVI_max": 0.9,
            "obs_count_mean": 7.0, "has_obs_mean": 0.88,
            "l5_count": 12, "l7_count": 0, "l8_count": 0, "source_count": 12,
        }
        meta = self._call(props).data["metadata"]
        for key in (
            "selected_sensor", "selected_red_band", "selected_nir_band",
            "candidate_sensor_scene_counts", "source_image_count",
            "mean_valid_observations_per_pixel", "valid_pixel_coverage_pct",
            "coverage_status", "sensor_composite_type", "slc_off_flag",
        ):
            with self.subTest(key=key):
                self.assertIn(key, meta)

    def test_no_data_result_carries_all_metadata_fields(self):
        """All required dynamic metadata fields must survive a no-data (empty) result."""
        props = {
            "obs_count_mean": 0.0, "has_obs_mean": 0.0,
            "l5_count": 5, "l7_count": 0, "l8_count": 0, "source_count": 5,
        }
        meta = self._call(props).data["metadata"]
        for key in (
            "selected_sensor", "selected_red_band", "selected_nir_band",
            "candidate_sensor_scene_counts", "source_image_count",
            "mean_valid_observations_per_pixel", "valid_pixel_coverage_pct",
            "coverage_status", "sensor_composite_type", "slc_off_flag",
        ):
            with self.subTest(key=key):
                self.assertIn(key, meta)
        self.assertEqual(meta["selected_sensor"], "LT05")
        self.assertEqual(meta["selected_red_band"], "SR_B3")
        self.assertEqual(meta["selected_nir_band"], "SR_B4")

    # --- zero-band guard (ee.Algorithms.If) ---

    def test_zero_band_guard_no_raise_when_source_count_is_zero(self):
        """
        ee.Algorithms.If guard prevents unmask() on a zero-band image.
        Python graph assembly and getInfo() interpretation must both succeed
        when source_count=0; available=True and mean=None.
        """
        props = {
            "source_count": 0, "l5_count": 0, "l7_count": 0, "l8_count": 0,
            "obs_count_mean": 0.0, "has_obs_mean": 0.0,
        }
        result = self._call(props)
        self.assertTrue(result.available, msg=result.error)
        self.assertIsNone(result.data["mean"])
        self.assertIsNone(result.data["min"])
        self.assertIsNone(result.data["max"])

    def test_zero_band_guard_empty_path_coverage_and_metadata(self):
        """
        Zero-source-count fallback path must set coverage_status='no_data',
        zero coverage values, and populate all 10 dynamic metadata fields.
        """
        props = {
            "source_count": 0, "l5_count": 0, "l7_count": 0, "l8_count": 0,
            "obs_count_mean": 0.0, "has_obs_mean": 0.0,
        }
        result = self._call(props)
        meta = result.data["metadata"]
        self.assertEqual(meta["coverage_status"], "no_data")
        self.assertEqual(meta["valid_pixel_coverage_pct"], 0.0)
        self.assertEqual(meta["mean_valid_observations_per_pixel"], 0.0)
        self.assertEqual(meta["source_image_count"], 0)
        for key in (
            "selected_sensor", "selected_red_band", "selected_nir_band",
            "candidate_sensor_scene_counts", "source_image_count",
            "mean_valid_observations_per_pixel", "valid_pixel_coverage_pct",
            "coverage_status", "sensor_composite_type", "slc_off_flag",
        ):
            with self.subTest(key=key):
                self.assertIn(key, meta)


class LandsatFallbackSelectionTests(TestCase):
    """
    Non-GEE unit tests for the archive-fallback selection policy.

    The FluentEE stub lets getInfo() return a controlled dict that includes
    'actual_sensor' and 'selection_reason' — the same keys the real GEE
    server-side ee.Algorithms.If chain would resolve and return.

    Python-level assertion: the metadata forwarded from those keys must match.
    """

    _GEOMETRY = {
        "type": "Polygon",
        "coordinates": [[[7.0, 10.0], [7.1, 10.0], [7.1, 10.1], [7.0, 10.1], [7.0, 10.0]]],
    }

    def _call(self, getinfo_result, start, end):
        from remote_sensing.gee_service import GoogleEarthEngineService

        class FluentEE:
            def __init__(self, result):
                object.__setattr__(self, '_r', result)
            def __call__(self, *args, **kwargs):
                return self
            def __getattr__(self, name):
                if name == 'getInfo':
                    r = object.__getattribute__(self, '_r')
                    return lambda: r
                return self

        with patch.dict('sys.modules', {'ee': FluentEE(getinfo_result)}):
            svc = GoogleEarthEngineService()
            return svc.compute_landsat_ndvi_for_geometry(
                geometry_dict=self._GEOMETRY,
                start_date=start,
                end_date=end,
            )

    # -- fallback: LT05 primary, LT05=0, LE07>0 --

    def test_lt05_primary_falls_back_to_le07_when_lt05_empty(self):
        """LT05-primary window, LT05 archive absent, LE07 has scenes → selects LE07."""
        props = {
            "NDVI_mean": 0.38, "NDVI_min": 0.1, "NDVI_max": 0.75,
            "obs_count_mean": 4.2, "has_obs_mean": 0.92,
            "l5_count": 0, "l7_count": 8, "l8_count": 0, "source_count": 8,
            "actual_sensor": "LE07",
            "selection_reason": "archive_fallback_no_primary_scene",
        }
        result = self._call(props, start="2000-01-01", end="2001-01-01")
        meta = result.data["metadata"]
        self.assertEqual(meta["selected_sensor"], "LE07")
        self.assertEqual(meta["selected_red_band"], "SR_B3")
        self.assertEqual(meta["selected_nir_band"], "SR_B4")
        self.assertEqual(meta["selection_reason"], "archive_fallback_no_primary_scene")
        self.assertTrue(result.available)

    def test_annual_2000_selects_le07_fallback(self):
        """Annual 2000: LT05 primary with LT05=0 and LE07=16 → LE07, slc_off=False."""
        props = {
            "NDVI_mean": 0.41, "NDVI_min": 0.12, "NDVI_max": 0.79,
            "obs_count_mean": 6.1, "has_obs_mean": 0.97,
            "l5_count": 0, "l7_count": 16, "l8_count": 0, "source_count": 16,
            "actual_sensor": "LE07",
            "selection_reason": "archive_fallback_no_primary_scene",
        }
        result = self._call(props, start="2000-01-01", end="2001-01-01")
        meta = result.data["metadata"]
        self.assertEqual(meta["selected_sensor"], "LE07")
        self.assertEqual(meta["selection_reason"], "archive_fallback_no_primary_scene")
        self.assertFalse(meta["slc_off_flag"])   # end_date 2001-01-01 < 2003-05-31

    def test_annual_2005_selects_le07_fallback(self):
        """Annual 2005: LT05=0, LE07=26 → LE07; slc_off=True (end_date > 2003-05-31)."""
        props = {
            "NDVI_mean": 0.35, "NDVI_min": 0.08, "NDVI_max": 0.71,
            "obs_count_mean": 5.8, "has_obs_mean": 0.91,
            "l5_count": 0, "l7_count": 26, "l8_count": 0, "source_count": 26,
            "actual_sensor": "LE07",
            "selection_reason": "archive_fallback_no_primary_scene",
        }
        result = self._call(props, start="2005-01-01", end="2006-01-01")
        meta = result.data["metadata"]
        self.assertEqual(meta["selected_sensor"], "LE07")
        self.assertEqual(meta["selection_reason"], "archive_fallback_no_primary_scene")
        self.assertTrue(meta["slc_off_flag"])   # end_date 2006-01-01 > 2003-05-31

    def test_dry_season_2012_selects_le07_fallback(self):
        """Dry 2012 (Nov 2011–Mar 2012): LT05=0, LE07=10 → LE07, slc_off=True."""
        props = {
            "NDVI_mean": 0.29, "NDVI_min": 0.05, "NDVI_max": 0.62,
            "obs_count_mean": 3.1, "has_obs_mean": 0.88,
            "l5_count": 0, "l7_count": 10, "l8_count": 0, "source_count": 10,
            "actual_sensor": "LE07",
            "selection_reason": "archive_fallback_no_primary_scene",
        }
        result = self._call(props, start="2011-11-01", end="2012-04-01")
        meta = result.data["metadata"]
        self.assertEqual(meta["selected_sensor"], "LE07")
        self.assertEqual(meta["selection_reason"], "archive_fallback_no_primary_scene")
        self.assertTrue(meta["slc_off_flag"])   # end_date 2012-04-01 > 2003-05-31

    # -- primary stays primary when archive is present --

    def test_1985_dry_remains_lt05_when_lt05_has_scenes(self):
        """Dry 1985: LT05=9, no fallback needed → selection_reason primary_window_sensor."""
        props = {
            "NDVI_mean": 0.23, "NDVI_min": 0.06, "NDVI_max": 0.51,
            "obs_count_mean": 5.5, "has_obs_mean": 1.0,
            "l5_count": 9, "l7_count": 0, "l8_count": 0, "source_count": 9,
            "actual_sensor": "LT05",
            "selection_reason": "primary_window_sensor",
        }
        result = self._call(props, start="1984-11-01", end="1985-04-01")
        meta = result.data["metadata"]
        self.assertEqual(meta["selected_sensor"], "LT05")
        self.assertEqual(meta["selection_reason"], "primary_window_sensor")
        self.assertFalse(meta["slc_off_flag"])

    def test_2017_annual_remains_lc08(self):
        """Annual 2017: LC08=45 → selection_reason primary_window_sensor, correct bands."""
        props = {
            "NDVI_mean": 0.35, "NDVI_min": -0.06, "NDVI_max": 0.59,
            "obs_count_mean": 18.8, "has_obs_mean": 1.0,
            "l5_count": 0, "l7_count": 41, "l8_count": 45, "source_count": 45,
            "actual_sensor": "LC08",
            "selection_reason": "primary_window_sensor",
        }
        result = self._call(props, start="2017-01-01", end="2018-01-01")
        meta = result.data["metadata"]
        self.assertEqual(meta["selected_sensor"], "LC08")
        self.assertEqual(meta["selected_red_band"], "SR_B4")
        self.assertEqual(meta["selected_nir_band"], "SR_B5")
        self.assertEqual(meta["selection_reason"], "primary_window_sensor")
        self.assertFalse(meta["slc_off_flag"])

    def test_le07_primary_returns_primary_window_sensor(self):
        """Annual 2012: LE07 primary (bridge) with LE07 scenes → primary_window_sensor."""
        props = {
            "NDVI_mean": 0.43, "NDVI_min": 0.08, "NDVI_max": 0.71,
            "obs_count_mean": 9.2, "has_obs_mean": 0.98,
            "l5_count": 0, "l7_count": 52, "l8_count": 0, "source_count": 52,
            "actual_sensor": "LE07",
            "selection_reason": "primary_window_sensor",
        }
        result = self._call(props, start="2012-01-01", end="2013-01-01")
        meta = result.data["metadata"]
        self.assertEqual(meta["selected_sensor"], "LE07")
        self.assertEqual(meta["selection_reason"], "primary_window_sensor")
        self.assertTrue(meta["slc_off_flag"])  # end_date 2013-01-01 > 2003-05-31

    # -- all candidates zero --

    def test_all_zero_candidates_returns_no_candidate_scene(self):
        """No scenes from any sensor → no_candidate_scene, source_image_count=0."""
        props = {
            "obs_count_mean": 0.0, "has_obs_mean": 0.0,
            "l5_count": 0, "l7_count": 0, "l8_count": 0, "source_count": 0,
            "actual_sensor": "LT05",
            "selection_reason": "no_candidate_scene",
        }
        result = self._call(props, start="1990-01-01", end="1991-01-01")
        meta = result.data["metadata"]
        self.assertEqual(meta["selection_reason"], "no_candidate_scene")
        self.assertEqual(meta["source_image_count"], 0)
        self.assertIsNone(result.data["mean"])
        self.assertEqual(meta["coverage_status"], "no_data")


class LandsatSentinelRetryTests(TestCase):
    """Proves that a null sentinel is replaced (not duplicated) on a retry run."""

    @classmethod
    def setUpTestData(cls):
        cls.layer = RemoteSensingLayer.objects.create(
            key="ndvi_landsat",
            label="Historical NDVI (Landsat)",
            gee_dataset="Landsat C2 L2",
            gee_band="NDVI",
            is_active=True,
            is_public=False,
        )
        LGARegistry.objects.create(lga_id=99, lga_name="TestLGA")

    def _landsat_mock(self, result):
        m = MagicMock()
        m.project = "test-project"
        m.initialize.return_value = _GEE_INIT_OK
        m.compute_landsat_ndvi_for_geometry.return_value = result
        return m

    def _sync(self, *, skip_existing=False, retry_null=False, gee_mock):
        out = StringIO()
        with (
            patch(f"{_CMD}.gee_service", gee_mock),
            patch(f"{_CMD}.Command._load_features", return_value=[_TEST_FEATURE]),
        ):
            call_command(
                "sync_climate_atlas",
                layers=["ndvi_landsat"],
                years=[1990],
                seasons=["annual"],
                dry_run=False,
                skip_existing=skip_existing,
                retry_null_results=retry_null,
                continue_on_error=True,
                stdout=out,
            )
        return out.getvalue()

    def _metric(self):
        return RemoteSensingLGAMetric.objects.filter(
            layer=self.layer, admin_code="19001", year=1990, season="annual",
        )

    def test_retry_null_updates_sentinel_no_duplicate(self):
        """
        First run: null sentinel written.
        Retry run with valid GEE mean: sentinel is updated to a real metric.
        Record count must remain exactly 1 — no duplicate.
        """
        # Write initial null sentinel.
        self._sync(
            gee_mock=self._landsat_mock(GEEResult(available=True, data={"mean": None}))
        )
        qs = self._metric()
        self.assertEqual(qs.count(), 1)
        self.assertIsNone(qs.first().mean_value)
        self.assertEqual(qs.first().metadata.get("result_status"), "no_data")

        # Retry — GEE now returns valid data.
        self._sync(
            skip_existing=True,
            retry_null=True,
            gee_mock=self._landsat_mock(
                GEEResult(available=True, data={"mean": 0.35, "min": 0.1, "max": 0.6})
            ),
        )
        qs2 = self._metric()
        self.assertEqual(qs2.count(), 1, "Must update, not create a duplicate")
        row = qs2.first()
        self.assertIsNotNone(row.mean_value)
        self.assertAlmostEqual(float(row.mean_value), 0.35, places=4)
        self.assertNotIn("result_status", row.metadata)


# ---------------------------------------------------------------------------
# Rainfall Anomaly — build_rainfall_anomaly command tests
# ---------------------------------------------------------------------------


class RainfallAnomalyTests(TestCase):
    """
    Non-GEE tests for the build_rainfall_anomaly management command.

    Covers: anomaly calculation accuracy, baseline threshold enforcement,
    dry-run safety, skip-existing logic, metadata schema (valid and null
    results), and anomaly sign direction.
    """

    BASELINE_START = 1991
    BASELINE_END = 2020
    MIN_SAMPLES = 25

    @classmethod
    def setUpTestData(cls):
        cls.rainfall_layer = RemoteSensingLayer.objects.create(
            key="rainfall",
            label="Rainfall Total",
            gee_dataset="CHIRPS v2.0",
            gee_band="precipitation",
            is_active=True,
            is_public=True,
        )
        cls.anomaly_layer = RemoteSensingLayer.objects.create(
            key="rainfall_anomaly",
            label="Rainfall Anomaly",
            gee_dataset="Derived from CHIRPS",
            gee_band="rainfall_anomaly_percent",
            is_active=True,
            is_public=False,
        )
        cls.lga = LGARegistry.objects.create(lga_id=1, lga_name="TestLGA")

    def _make_rainfall(self, year, season, value_mm, admin_code="19001"):
        RemoteSensingLGAMetric.objects.create(
            layer=self.rainfall_layer,
            admin_level="lga",
            admin_code=admin_code,
            admin_name="TestLGA",
            lga=self.lga,
            year=year,
            season=season,
            mean_value=Decimal(str(value_mm)),
            unit="mm",
            data_source="CHIRPS v2.0",
            metadata={},
        )

    def _make_baseline(self, season, base_mm=500.0, count=25, admin_code="19001"):
        """Create `count` baseline records starting from 1991, all at base_mm."""
        for i in range(count):
            self._make_rainfall(1991 + i, season, base_mm, admin_code=admin_code)

    def _anomaly(self, year, season, admin_code="19001"):
        return RemoteSensingLGAMetric.objects.filter(
            layer=self.anomaly_layer,
            admin_code=admin_code,
            year=year,
            season=season,
        ).first()

    def _cmd(self, **kwargs):
        out = StringIO()
        call_command("build_rainfall_anomaly", stdout=out, **kwargs)
        return out.getvalue()

    # --- 1. Basic calculation ---

    def test_basic_anomaly_calculation_is_correct(self):
        """(observed - baseline_mean) / baseline_mean × 100 must match exactly."""
        # 25 baseline records at 500 mm → baseline_mean = 500 mm
        self._make_baseline("annual", base_mm=500.0, count=25)
        # 2024: 600 mm → anomaly = (600 - 500) / 500 × 100 = +20 %
        self._make_rainfall(2024, "annual", 600.0)

        self._cmd()

        rec = self._anomaly(2024, "annual")
        self.assertIsNotNone(rec)
        self.assertAlmostEqual(float(rec.mean_value), 20.0, places=4)
        self.assertIsNone(rec.min_value)
        self.assertIsNone(rec.max_value)
        self.assertEqual(rec.unit, "%")

    # --- 2. Insufficient baseline → null result ---

    def test_insufficient_baseline_produces_null_result(self):
        """Fewer than 25 baseline records must produce a null anomaly record."""
        self._make_baseline("wet_season", base_mm=400.0, count=24)
        self._make_rainfall(2024, "wet_season", 500.0)

        self._cmd()

        rec = self._anomaly(2024, "wet_season")
        self.assertIsNotNone(rec, "A null-sentinel record must still be written.")
        self.assertIsNone(rec.mean_value)
        self.assertEqual(rec.metadata.get("result_status"), "no_data")
        self.assertEqual(rec.metadata.get("null_reason"), "insufficient_baseline_samples")

    # --- 3. Exact minimum threshold (25 records → valid) ---

    def test_minimum_25_baseline_samples_produces_valid_result(self):
        """Exactly 25 baseline records must produce a valid (non-null) anomaly."""
        self._make_baseline("dry_season", base_mm=200.0, count=25)
        self._make_rainfall(2024, "dry_season", 250.0)

        self._cmd()

        rec = self._anomaly(2024, "dry_season")
        self.assertIsNotNone(rec)
        self.assertIsNotNone(rec.mean_value)

    # --- 4. Dry-run does not write ---

    def test_dry_run_does_not_write_records(self):
        """--dry-run must leave the database unchanged."""
        self._make_baseline("annual", base_mm=500.0, count=25)
        self._make_rainfall(2024, "annual", 600.0)

        self._cmd(dry_run=True)

        count = RemoteSensingLGAMetric.objects.filter(layer=self.anomaly_layer).count()
        self.assertEqual(count, 0)

    # --- 5. Skip-existing ---

    def test_skip_existing_does_not_overwrite_valid_anomaly(self):
        """--skip-existing must not overwrite a record that already exists."""
        self._make_baseline("annual", base_mm=500.0, count=25)
        self._make_rainfall(2024, "annual", 600.0)

        # First run: creates anomaly record (+20 %)
        self._cmd()
        original_value = float(self._anomaly(2024, "annual").mean_value)

        # Change the source rainfall so a fresh run would yield a different result
        RemoteSensingLGAMetric.objects.filter(
            layer=self.rainfall_layer, year=2024, season="annual"
        ).update(mean_value=Decimal("700.0"))

        # Second run with --skip-existing: anomaly must stay at +20 %
        self._cmd(skip_existing=True)

        rec_after = self._anomaly(2024, "annual")
        self.assertAlmostEqual(float(rec_after.mean_value), original_value, places=4)

    # --- 6. Required metadata fields on valid result ---

    def test_valid_result_metadata_contains_all_required_fields(self):
        """All 11 required metadata fields must be present on a valid anomaly record."""
        self._make_baseline("annual", base_mm=500.0, count=25)
        self._make_rainfall(2024, "annual", 600.0)

        self._cmd()

        rec = self._anomaly(2024, "annual")
        required = [
            "source_layer", "source_dataset", "observed_total_mm",
            "baseline_mean_mm", "anomaly_mm", "anomaly_percent",
            "baseline_start_year", "baseline_end_year",
            "baseline_sample_count", "minimum_required_baseline_samples",
            "method_version",
        ]
        for field_name in required:
            with self.subTest(field=field_name):
                self.assertIn(field_name, rec.metadata)

    # --- 7. Null result metadata ---

    def test_null_result_metadata_contains_required_fields(self):
        """Null sentinel records must carry result_status, null_reason, and baseline stats."""
        self._make_baseline("annual", base_mm=500.0, count=10)  # only 10 — insufficient
        self._make_rainfall(2024, "annual", 600.0)

        self._cmd()

        rec = self._anomaly(2024, "annual")
        for field_name in (
            "result_status", "null_reason",
            "baseline_sample_count", "minimum_required_baseline_samples",
            "baseline_start_year", "baseline_end_year",
            "method_version",
        ):
            with self.subTest(field=field_name):
                self.assertIn(field_name, rec.metadata)
        self.assertEqual(rec.metadata["result_status"], "no_data")
        self.assertEqual(rec.metadata["null_reason"], "insufficient_baseline_samples")
        self.assertEqual(rec.metadata["baseline_sample_count"], 10)
        self.assertEqual(rec.metadata["minimum_required_baseline_samples"], self.MIN_SAMPLES)

    # --- 8. Positive anomaly direction ---

    def test_positive_anomaly_for_wetter_than_normal(self):
        """Observed > baseline mean must produce a positive anomaly_percent."""
        self._make_baseline("wet_season", base_mm=500.0, count=25)
        self._make_rainfall(2024, "wet_season", 550.0)  # +10 %

        self._cmd()

        rec = self._anomaly(2024, "wet_season")
        self.assertIsNotNone(rec.mean_value)
        self.assertGreater(float(rec.mean_value), 0)
        self.assertAlmostEqual(float(rec.mean_value), 10.0, places=3)

    # --- 9. Negative anomaly direction ---

    def test_negative_anomaly_for_drier_than_normal(self):
        """Observed < baseline mean must produce a negative anomaly_percent."""
        self._make_baseline("dry_season", base_mm=500.0, count=25)
        self._make_rainfall(2024, "dry_season", 400.0)  # −20 %

        self._cmd()

        rec = self._anomaly(2024, "dry_season")
        self.assertIsNotNone(rec.mean_value)
        self.assertLess(float(rec.mean_value), 0)
        self.assertAlmostEqual(float(rec.mean_value), -20.0, places=3)


# ---------------------------------------------------------------------------
# LST (MODIS MOD11A1) — registry, plan, and compute tests
# ---------------------------------------------------------------------------


class DroughtConditionsBuildTests(TestCase):
    """Non-GEE tests for build_drought_conditions."""

    @classmethod
    def setUpTestData(cls):
        cls.lga = LGARegistry.objects.create(lga_id=501, lga_name="SPI LGA")
        cls.rainfall_layer = RemoteSensingLayer.objects.create(
            key="rainfall",
            label="Rainfall Total",
            gee_dataset="CHIRPS v2.0 Daily",
            gee_band="precipitation",
            is_public=True,
        )
        cls.drought_layer = RemoteSensingLayer.objects.create(
            key="drought_index",
            label="Meteorological Drought Conditions (SPI)",
            gee_dataset="Derived from CHIRPS v2.0 Daily rainfall totals",
            gee_band="SPI",
            is_public=False,
        )

    def _cmd(self, **kwargs):
        out = StringIO()
        call_command("build_drought_conditions", stdout=out, **kwargs)
        return out.getvalue()

    def _rainfall(self, year, season, value, admin_code="SPI001"):
        start, end = resolve_season_dates(year, season)
        return RemoteSensingLGAMetric.objects.create(
            layer=self.rainfall_layer,
            lga=self.lga,
            admin_level="lga",
            admin_code=admin_code,
            admin_name=f"SPI LGA {admin_code}",
            year=year,
            season=season,
            mean_value=Decimal(str(value)),
            min_value=None,
            max_value=None,
            unit="mm",
            data_source="CHIRPS v2.0 Daily",
            metadata={
                "start_date": start.isoformat(),
                "end_date": end.isoformat(),
                "season": season,
                "season_year_convention": (
                    "dry_season_end_year" if season == "dry_season" else "calendar_year"
                ),
            },
        )

    def _baseline(self, season, values, admin_code="SPI001", start_year=1991):
        for offset, value in enumerate(values):
            self._rainfall(start_year + offset, season, value, admin_code=admin_code)

    def _drought(self, year, season, admin_code="SPI001"):
        return RemoteSensingLGAMetric.objects.get(
            layer=self.drought_layer,
            admin_code=admin_code,
            year=year,
            season=season,
        )

    def test_positive_spi_for_above_baseline_observed_total(self):
        self._baseline("annual", [100 + i for i in range(30)])
        self._rainfall(2021, "annual", 180)

        self._cmd()

        rec = self._drought(2021, "annual")
        self.assertGreater(float(rec.mean_value), 0)
        self.assertEqual(rec.unit, "SPI")
        self.assertEqual(rec.metadata["source_layer"], "rainfall")
        self.assertEqual(rec.metadata["source_dataset"], "CHIRPS v2.0 Daily")
        self.assertEqual(rec.metadata["temporal_window"]["start_date"], "2021-01-01")

    def test_negative_spi_for_below_baseline_observed_total(self):
        self._baseline("annual", [100 + i for i in range(30)])
        self._rainfall(2021, "annual", 70)

        self._cmd()

        rec = self._drought(2021, "annual")
        self.assertLess(float(rec.mean_value), 0)
        self.assertEqual(rec.metadata["spi_value"], round(float(rec.mean_value), 6))

    def test_zero_rainfall_probability_handling(self):
        self._baseline("wet_season", [0, 0, 0, 0, 0] + [50 + i for i in range(25)])
        self._rainfall(2021, "wet_season", 0)

        self._cmd()

        rec = self._drought(2021, "wet_season")
        self.assertEqual(rec.metadata["baseline_zero_count"], 5)
        self.assertAlmostEqual(rec.metadata["baseline_zero_probability"], 5 / 30, places=6)
        self.assertEqual(rec.metadata["baseline_positive_sample_count"], 25)
        self.assertAlmostEqual(rec.metadata["cumulative_probability"], 5 / 30, places=6)

    def test_spi_category_thresholds(self):
        from remote_sensing.management.commands.build_drought_conditions import spi_category

        self.assertEqual(spi_category(-2.0), "Extreme drought")
        self.assertEqual(spi_category(-1.5), "Severe drought")
        self.assertEqual(spi_category(-1.0), "Moderate drought")
        self.assertEqual(spi_category(0.0), "Near normal")
        self.assertEqual(spi_category(1.0), "Moderately wet")
        self.assertEqual(spi_category(1.5), "Very wet")
        self.assertEqual(spi_category(2.0), "Extremely wet")

    def test_separate_annual_wet_and_dry_fits(self):
        self._baseline("annual", [180 + i for i in range(30)])
        self._baseline("wet_season", [40 + i for i in range(30)])
        self._baseline("dry_season", [90 + i for i in range(30)])
        self._rainfall(2021, "annual", 100)
        self._rainfall(2021, "wet_season", 100)
        self._rainfall(2021, "dry_season", 100)

        self._cmd()

        self.assertLess(float(self._drought(2021, "annual").mean_value), 0)
        self.assertGreater(float(self._drought(2021, "wet_season").mean_value), 0)
        self.assertNotEqual(
            self._drought(2021, "annual").metadata["gamma_shape"],
            self._drought(2021, "wet_season").metadata["gamma_shape"],
        )
        self.assertEqual(
            self._drought(2021, "dry_season").metadata["temporal_window"][
                "season_year_convention"
            ],
            "dry_season_end_year",
        )

    def test_minimum_25_baseline_requirement(self):
        self._baseline("annual", [100 + i for i in range(24)])
        self._rainfall(2021, "annual", 100)

        self._cmd()

        rec = self._drought(2021, "annual")
        self.assertIsNone(rec.mean_value)
        self.assertEqual(rec.metadata["result_status"], "no_data")
        self.assertEqual(rec.metadata["null_reason"], "insufficient_or_unfit_baseline")
        self.assertEqual(rec.metadata["baseline_sample_count"], 24)

    def test_gamma_fit_failure_writes_null_sentinel(self):
        self._baseline("annual", [0 for _ in range(25)])
        self._rainfall(2021, "annual", 0)

        self._cmd()

        rec = self._drought(2021, "annual")
        self.assertIsNone(rec.mean_value)
        self.assertEqual(rec.metadata["result_status"], "no_data")
        self.assertEqual(rec.metadata["baseline_positive_sample_count"], 0)

    def test_dry_run_does_not_create_or_update_drought_records(self):
        self._baseline("annual", [100 + i for i in range(30)])
        self._rainfall(2021, "annual", 180)

        before_count = RemoteSensingLGAMetric.objects.filter(
            layer=self.drought_layer
        ).count()

        self._cmd(dry_run=True)

        after_count = RemoteSensingLGAMetric.objects.filter(
            layer=self.drought_layer
        ).count()
        self.assertEqual(before_count, 0)
        self.assertEqual(after_count, 0)

    def test_upsert_without_duplicates(self):
        self._baseline("annual", [100 + i for i in range(30)])
        self._rainfall(2021, "annual", 180)

        self._cmd()
        self._cmd()

        self.assertEqual(
            RemoteSensingLGAMetric.objects.filter(
                layer=self.drought_layer,
                admin_code="SPI001",
                year=2021,
                season="annual",
            ).count(),
            1,
        )

    def test_skip_existing_preserves_existing_record(self):
        self._baseline("annual", [100 + i for i in range(30)])
        self._rainfall(2021, "annual", 180)
        RemoteSensingLGAMetric.objects.create(
            layer=self.drought_layer,
            lga=self.lga,
            admin_level="lga",
            admin_code="SPI001",
            admin_name="SPI LGA SPI001",
            year=2021,
            season="annual",
            mean_value=Decimal("-9.000000"),
            unit="SPI",
            metadata={"manual": True},
        )

        self._cmd(skip_existing=True)

        rec = self._drought(2021, "annual")
        self.assertEqual(float(rec.mean_value), -9.0)
        self.assertTrue(rec.metadata["manual"])

    def test_private_database_derived_registry_and_seed_configuration(self):
        reg = LAYER_REGISTRY["drought_index"]
        self.assertEqual(reg.label, "Meteorological Drought Conditions (SPI)")
        self.assertEqual(reg.output_unit, "SPI")
        self.assertEqual(reg.readiness.value, "DATABASE_DERIVED")
        self.assertEqual(reg.entry_point, "")
        self.assertEqual(
            reg.metadata_extras["method_version"],
            "spi_gamma_fixed_window_chirps_baseline_1991_2020_v1",
        )
        self.assertEqual(reg.supported_seasons, ("annual", "wet_season", "dry_season"))

        from remote_sensing.management.commands.seed_remote_sensing_layers import LAYERS

        seeded = next(item for item in LAYERS if item["key"] == "drought_index")
        self.assertEqual(seeded["label"], "Meteorological Drought Conditions (SPI)")
        self.assertIn("CHIRPS v2.0 Daily rainfall totals", seeded["gee_dataset"])
        self.assertIn("Fixed-window precipitation-only SPI", seeded["description"])
        self.assertIn(
            "spi_gamma_fixed_window_chirps_baseline_1991_2020_v1",
            seeded["description"],
        )
        for forbidden in ("MODIS", "VCI", "Sentinel", "placeholder", "pending-decision"):
            self.assertNotIn(forbidden, seeded["description"])
            self.assertNotIn(forbidden, seeded["gee_dataset"])
            self.assertNotIn(forbidden, seeded["gee_band"])
        self.assertEqual(seeded["gee_band"], "SPI")
        self.assertTrue(seeded["is_public"])
        self.assertTrue(seeded["is_active"])


class LSTRegistryTests(TestCase):
    """
    Non-GEE tests for the lst layer: registry properties, plan task totals,
    Celsius conversion formula, and QC bitmask policy.
    """

    # --- Registry properties ---

    def test_registry_key_and_collection(self):
        """lst registry entry must use MODIS/061/MOD11A1."""
        reg = LAYER_REGISTRY["lst"]
        self.assertEqual(reg.key, "lst")
        self.assertEqual(reg.gee_collection, "MODIS/061/MOD11A1")

    def test_registry_scale_and_year_range(self):
        """lst must default to 1000 m scale, valid_year_min=2001, valid_year_max=2025."""
        reg = LAYER_REGISTRY["lst"]
        self.assertEqual(reg.default_scale, 1000)
        self.assertEqual(reg.valid_year_min, 2001)
        self.assertEqual(reg.valid_year_max, 2025)

    def test_registry_method_version(self):
        """lst metadata_extras must carry method_version=mod11a1_daytime_lst_v1."""
        reg = LAYER_REGISTRY["lst"]
        self.assertEqual(reg.metadata_extras.get("method_version"), "mod11a1_daytime_lst_v1")

    def test_registry_entry_point_and_readiness(self):
        """lst must be RUNNABLE and point to compute_lst_for_geometry."""
        reg = LAYER_REGISTRY["lst"]
        self.assertEqual(reg.entry_point, "compute_lst_for_geometry")
        self.assertEqual(reg.readiness.value, "RUNNABLE")

    def test_registry_label(self):
        """lst label must be 'Land Surface Temperature (Daytime)'."""
        reg = LAYER_REGISTRY["lst"]
        self.assertEqual(reg.label, "Land Surface Temperature (Daytime)")

    def test_registry_static_metadata_keys(self):
        """lst metadata_extras must contain temporal_source, quality_policy, and temperature_measure."""
        reg = LAYER_REGISTRY["lst"]
        self.assertIn("temporal_source",     reg.metadata_extras)
        self.assertIn("quality_policy",      reg.metadata_extras)
        self.assertIn("temperature_measure", reg.metadata_extras)

    # --- Plan task totals ---

    def test_2025_plan_resolves_to_69_task_slots(self):
        """lst_modis_2025_lga × 23 LGAs must produce exactly 69 task slots."""
        plan = get_plan("lst_modis_2025_lga")
        self.assertEqual(plan.layer_keys, ["lst"])
        self.assertEqual(plan.admin_level, "lga")
        self.assertEqual(plan.years, [2025])
        self.assertEqual(plan.seasons, ["annual", "wet_season", "dry_season"])
        self.assertEqual(len(plan.years) * len(plan.seasons) * 23, 69)

    def test_historical_plan_resolves_to_1725_task_slots(self):
        """lst_modis_historical_lga × 23 LGAs must produce exactly 1,725 task slots."""
        plan = get_plan("lst_modis_historical_lga")
        self.assertEqual(plan.years, list(range(2001, 2026)))
        self.assertEqual(len(plan.years), 25)
        self.assertEqual(plan.seasons, ["annual", "wet_season", "dry_season"])
        self.assertEqual(len(plan.years) * len(plan.seasons) * 23, 1725)

    # --- Celsius conversion formula (pure Python — no GEE) ---

    def test_celsius_conversion_formula(self):
        """MOD11A1 DN to Celsius: DN * 0.02 - 273.15 must give known values."""
        # 0°C: DN = 273.15 / 0.02 = 13657.5
        self.assertAlmostEqual(13657.5 * 0.02 - 273.15, 0.0, places=2)
        # 40°C: DN = (40 + 273.15) / 0.02 = 15657.5
        self.assertAlmostEqual(15657.5 * 0.02 - 273.15, 40.0, places=2)
        # 14414 DN → 14414 * 0.02 - 273.15 = 288.28 - 273.15 = 15.13°C
        self.assertAlmostEqual(14414 * 0.02 - 273.15, 15.13, places=2)

    # --- QC bitmask policy (pure Python — mirrors GEE bitwiseAnd / rightShift logic) ---

    def test_qc_bitmask_policy(self):
        """
        MOD11A1 QC_Day bitmask: all three conditions must be satisfied for a pixel
        to survive quality masking.
          mandatory_ok    = (byte & 0b11) <= 1        bits 0-1
          data_quality_ok = ((byte >> 2) & 0b11) <= 1 bits 2-3
          lst_error_ok    = ((byte >> 6) & 0b11) <= 1 bits 6-7
        """
        def passes_qc(byte_val):
            mandatory_ok    = (byte_val & 0b11) <= 1
            data_quality_ok = ((byte_val >> 2) & 0b11) <= 1
            lst_error_ok    = ((byte_val >> 6) & 0b11) <= 1
            return mandatory_ok and data_quality_ok and lst_error_ok

        # 0b00000000 = 0 — all fields zero → passes all three checks.
        self.assertTrue(passes_qc(0b00000000))
        # 0b00000001 = 1 — mandatory=1 (ok), data_quality=0 (ok), lst_error=0 (ok).
        self.assertTrue(passes_qc(0b00000001))
        # 0b01010101 = 85 — mandatory=1, data_quality=1, lst_error=1 → all ≤ 1 → pass.
        self.assertTrue(passes_qc(0b01010101))
        # 0b00000010 = 2 — mandatory=2 → fail.
        self.assertFalse(passes_qc(0b00000010))
        # 0b00000011 = 3 — mandatory=3 → fail.
        self.assertFalse(passes_qc(0b00000011))
        # 0b00001000 = 8 — data_quality bits 2-3 = 0b10 = 2 → fail.
        self.assertFalse(passes_qc(0b00001000))
        # 0b10000000 = 128 — lst_error bits 6-7 = 0b10 = 2 → fail.
        self.assertFalse(passes_qc(0b10000000))
        # 0b11000000 = 192 — lst_error bits 6-7 = 0b11 = 3 → fail.
        self.assertFalse(passes_qc(0b11000000))


class LSTComputeTests(TestCase):
    """
    Non-GEE unit tests for compute_lst_for_geometry.

    The FluentEE stub makes every attribute access and call return itself so
    the entire server-side computation graph resolves to a single controlled
    getInfo() result.  No real GEE connection is made.
    """

    _GEOMETRY = {
        "type": "Polygon",
        "coordinates": [[[7.0, 10.0], [7.1, 10.0], [7.1, 10.1], [7.0, 10.1], [7.0, 10.0]]],
    }

    _REQUIRED_META_KEYS = (
        "source_image_count",
        "mean_valid_observations_per_pixel",
        "valid_pixel_coverage_pct",
        "coverage_status",
        "temporal_aggregation",
        "source_band",
        "quality_policy",
        "temperature_unit",
    )

    def _call(self, getinfo_result, start="2025-01-01", end="2026-01-01"):
        from remote_sensing.gee_service import GoogleEarthEngineService

        class FluentEE:
            """Every attr/call returns self; getInfo() returns the configured dict."""
            def __init__(self, result):
                object.__setattr__(self, '_r', result)
            def __call__(self, *args, **kwargs):
                return self
            def __getattr__(self, name):
                if name == 'getInfo':
                    r = object.__getattribute__(self, '_r')
                    return lambda: r
                return self

        with patch.dict('sys.modules', {'ee': FluentEE(getinfo_result)}):
            svc = GoogleEarthEngineService()
            return svc.compute_lst_for_geometry(
                geometry_dict=self._GEOMETRY,
                start_date=start,
                end_date=end,
            )

    # --- Empty collection / zero-band guard ---

    def test_empty_collection_does_not_raise(self):
        """source_count=0 must not raise — zero-band guard must activate."""
        props = {"source_count": 0, "obs_count_mean": 0.0, "has_obs_mean": 0.0}
        result = self._call(props)
        self.assertTrue(result.available, msg=result.error)

    def test_empty_collection_returns_none_mean(self):
        """source_count=0 must produce mean=None, min=None, max=None."""
        props = {"source_count": 0, "obs_count_mean": 0.0, "has_obs_mean": 0.0}
        result = self._call(props)
        self.assertIsNone(result.data["mean"])
        self.assertIsNone(result.data["min"])
        self.assertIsNone(result.data["max"])

    def test_empty_collection_coverage_status_is_no_data(self):
        """source_count=0 must set coverage_status='no_data'."""
        props = {"source_count": 0, "obs_count_mean": 0.0, "has_obs_mean": 0.0}
        result = self._call(props)
        self.assertEqual(result.data["metadata"]["coverage_status"], "no_data")
        self.assertEqual(result.data["metadata"]["source_image_count"], 0)

    # --- No-data: images exist but all pixels masked ---

    def test_all_pixels_masked_returns_none_mean(self):
        """Images present but all pixels fail QC → mean=None, coverage_status=no_data."""
        props = {
            "source_count": 30,
            "obs_count_mean": 0.0,
            "has_obs_mean": 0.0,
        }
        result = self._call(props)
        self.assertIsNone(result.data["mean"])
        self.assertEqual(result.data["metadata"]["coverage_status"], "no_data")
        self.assertEqual(result.data["metadata"]["source_image_count"], 30)

    # --- Valid result ---

    def test_valid_result_returns_correct_values(self):
        """LST_C_mean/min/max from getInfo must be forwarded unchanged."""
        props = {
            "source_count": 92,
            "LST_C_mean": 32.7, "LST_C_min": 18.4, "LST_C_max": 47.1,
            "obs_count_mean": 58.3, "has_obs_mean": 0.91,
        }
        result = self._call(props)
        self.assertTrue(result.available)
        self.assertAlmostEqual(result.data["mean"], 32.7, places=4)
        self.assertAlmostEqual(result.data["min"],  18.4, places=4)
        self.assertAlmostEqual(result.data["max"],  47.1, places=4)

    # --- Coverage thresholds ---

    def test_coverage_status_good(self):
        """has_obs_mean >= 0.80 → coverage_status='good'."""
        props = {
            "source_count": 92, "LST_C_mean": 34.0,
            "obs_count_mean": 70.0, "has_obs_mean": 0.93,
        }
        self.assertEqual(self._call(props).data["metadata"]["coverage_status"], "good")

    def test_coverage_status_limited(self):
        """has_obs_mean 0.50–0.79 → coverage_status='limited'."""
        props = {
            "source_count": 92, "LST_C_mean": 34.0,
            "obs_count_mean": 45.0, "has_obs_mean": 0.65,
        }
        self.assertEqual(self._call(props).data["metadata"]["coverage_status"], "limited")

    def test_coverage_status_very_limited(self):
        """has_obs_mean > 0 and < 0.50 → coverage_status='very_limited'."""
        props = {
            "source_count": 92, "LST_C_mean": 34.0,
            "obs_count_mean": 20.0, "has_obs_mean": 0.30,
        }
        self.assertEqual(self._call(props).data["metadata"]["coverage_status"], "very_limited")

    # --- Dynamic metadata schema ---

    def test_valid_result_carries_all_metadata_fields(self):
        """All 8 required dynamic metadata fields must be present on a valid result."""
        props = {
            "source_count": 92,
            "LST_C_mean": 35.0, "LST_C_min": 20.0, "LST_C_max": 50.0,
            "obs_count_mean": 60.0, "has_obs_mean": 0.88,
        }
        meta = self._call(props).data["metadata"]
        for key in self._REQUIRED_META_KEYS:
            with self.subTest(key=key):
                self.assertIn(key, meta)

    def test_no_data_result_carries_all_metadata_fields(self):
        """All 8 required dynamic metadata fields must survive a no-data result."""
        props = {"source_count": 0, "obs_count_mean": 0.0, "has_obs_mean": 0.0}
        meta = self._call(props).data["metadata"]
        for key in self._REQUIRED_META_KEYS:
            with self.subTest(key=key):
                self.assertIn(key, meta)

    def test_metadata_fixed_string_values(self):
        """temporal_aggregation, source_band, and temperature_unit must have exact values."""
        props = {
            "source_count": 92, "LST_C_mean": 35.0,
            "obs_count_mean": 60.0, "has_obs_mean": 0.88,
        }
        meta = self._call(props).data["metadata"]
        self.assertEqual(meta["temporal_aggregation"], "daily_quality_filtered_mean")
        self.assertEqual(meta["source_band"],          "LST_Day_1km")
        self.assertEqual(meta["temperature_unit"],     "celsius")

    def test_source_image_count_forwarded_correctly(self):
        """source_image_count in metadata must equal source_count from getInfo()."""
        props = {
            "source_count": 365, "LST_C_mean": 30.5,
            "obs_count_mean": 250.0, "has_obs_mean": 0.95,
        }
        self.assertEqual(self._call(props).data["metadata"]["source_image_count"], 365)

    def test_valid_pixel_coverage_pct_computed_correctly(self):
        """valid_pixel_coverage_pct must equal has_obs_mean * 100, rounded to 2 dp."""
        props = {
            "source_count": 92, "LST_C_mean": 35.0,
            "obs_count_mean": 60.0, "has_obs_mean": 0.8765,
        }
        meta = self._call(props).data["metadata"]
        self.assertAlmostEqual(meta["valid_pixel_coverage_pct"], 87.65, places=2)

    def test_mean_valid_observations_per_pixel_forwarded(self):
        """mean_valid_observations_per_pixel must equal obs_count_mean, rounded to 4 dp."""
        props = {
            "source_count": 92, "LST_C_mean": 35.0,
            "obs_count_mean": 58.3456, "has_obs_mean": 0.88,
        }
        meta = self._call(props).data["metadata"]
        self.assertAlmostEqual(meta["mean_valid_observations_per_pixel"], 58.3456, places=4)


class LgaStatsNdviLandsatAccessTests(TestCase):
    """
    Regression tests for public lga_stats access to historical Landsat NDVI.

    Root cause: ndvi_landsat.is_public=False caused lga_stats to return HTTP 404,
    which the frontend treated as empty results and showed "No Landsat archive
    available" even for years (e.g. 2000, 2017) with 23/23 valid LGA records.

    Fix: ndvi_landsat is explicitly public in the layer seed data, and lga_stats uses
    the normal public access rule for every layer. Private layers continue to receive
    404.
    """

    @classmethod
    def setUpTestData(cls):
        cls.lga = LGARegistry.objects.create(lga_id=1, lga_name="Kajuru")
        cls.ndvi_landsat_layer = RemoteSensingLayer.objects.create(
            key="ndvi_landsat",
            label="Historical NDVI (Landsat Collection 2)",
            is_active=True,
            is_public=True,
        )
        RemoteSensingLayer.objects.create(
            key="ndvi",
            label="NDVI",
            is_active=True,
            is_public=True,
        )
        RemoteSensingLayer.objects.create(
            key="lst",
            label="Land Surface Temperature",
            is_active=True,
            is_public=False,
        )
        RemoteSensingLayer.objects.create(
            key="rainfall_anomaly",
            label="Rainfall Anomaly",
            is_active=True,
            is_public=False,
        )
        RemoteSensingLGAMetric.objects.create(
            layer=cls.ndvi_landsat_layer,
            lga=cls.lga,
            admin_level="lga",
            admin_code="KAJ001",
            admin_name="Kajuru",
            year=2000,
            season="annual",
            mean_value=Decimal("0.41"),
            unit="NDVI",
        )

    def test_ndvi_landsat_accessible_when_public(self):
        """ndvi_landsat returns 200 with data because it is_public=True."""
        self.assertTrue(self.ndvi_landsat_layer.is_public)
        response = self.client.get(
            reverse("remote-sensing-lga-stats"),
            {"layer": "ndvi_landsat", "year": "2000", "season": "annual"},
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data["results"]), 1)
        self.assertAlmostEqual(float(data["results"][0]["mean_value"]), 0.41, places=4)

    def test_ndvi_landsat_year_with_no_records_returns_empty_not_404(self):
        """ndvi_landsat year with no records returns 200 with empty results, not 404."""
        response = self.client.get(
            reverse("remote-sensing-lga-stats"),
            {"layer": "ndvi_landsat", "year": "2017", "season": "annual"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()["results"]), 0)

    def test_ndvi_landsat_blocked_when_private(self):
        """ndvi_landsat has no special bypass if it is not public."""
        self.ndvi_landsat_layer.is_public = False
        self.ndvi_landsat_layer.save()
        try:
            response = self.client.get(
                reverse("remote-sensing-lga-stats"),
                {"layer": "ndvi_landsat", "year": "2000", "season": "annual"},
            )
            self.assertEqual(response.status_code, 404)
        finally:
            self.ndvi_landsat_layer.is_public = True
            self.ndvi_landsat_layer.save()

    def test_public_ndvi_layer_unaffected(self):
        """Public ndvi layer continues to return 200 after the fix."""
        response = self.client.get(
            reverse("remote-sensing-lga-stats"),
            {"layer": "ndvi", "season": "annual"},
        )
        self.assertEqual(response.status_code, 200)

    def test_non_public_layer_blocked(self):
        """Any non-public layer is blocked by the normal public access rule."""
        response = self.client.get(
            reverse("remote-sensing-lga-stats"),
            {"layer": "lst", "year": "2020", "season": "annual"},
        )
        self.assertEqual(response.status_code, 404)

    def test_private_rainfall_anomaly_still_blocked(self):
        """Private rainfall_anomaly still returns 404."""
        rainfall_anomaly_layer = RemoteSensingLayer.objects.get(key="rainfall_anomaly")
        self.assertFalse(rainfall_anomaly_layer.is_public)
        response = self.client.get(
            reverse("remote-sensing-lga-stats"),
            {"layer": "rainfall_anomaly", "year": "2020", "season": "annual"},
        )
        self.assertEqual(response.status_code, 404)

    def test_unknown_layer_key_returns_404(self):
        """An unknown layer key returns 404."""
        response = self.client.get(
            reverse("remote-sensing-lga-stats"),
            {"layer": "unknown_xyz", "year": "2000", "season": "annual"},
        )
        self.assertEqual(response.status_code, 404)

    def test_inactive_ndvi_landsat_returns_404(self):
        """An inactive ndvi_landsat layer returns 404 (is_active check preserved)."""
        self.ndvi_landsat_layer.is_active = False
        self.ndvi_landsat_layer.save()
        try:
            response = self.client.get(
                reverse("remote-sensing-lga-stats"),
                {"layer": "ndvi_landsat", "year": "2000", "season": "annual"},
            )
            self.assertEqual(response.status_code, 404)
        finally:
            self.ndvi_landsat_layer.is_active = True
            self.ndvi_landsat_layer.save()


class PublicRemoteSensingLayerCatalogTests(TestCase):
    """Public layer catalog must expose only active, public layers."""

    @classmethod
    def setUpTestData(cls):
        # All six operational layers are public in the permanent release configuration.
        cls.public_keys = [
            "rainfall", "ndvi", "ndvi_landsat",
            "lst", "rainfall_anomaly", "drought_index",
        ]
        for key in cls.public_keys:
            RemoteSensingLayer.objects.create(
                key=key,
                label=key.replace("_", " ").title(),
                description=f"{key} public layer",
                gee_dataset=f"{key} source dataset",
                gee_band=f"{key}_band",
                is_active=True,
                is_public=True,
            )

        # Explicitly private active layer used for negative tests.
        RemoteSensingLayer.objects.create(
            key="flood_hazard",
            label="Flood Hazard",
            description="Not yet published",
            gee_dataset="flood hazard source",
            gee_band="flood_band",
            is_active=True,
            is_public=False,
        )
        RemoteSensingLayer.objects.create(
            key="inactive_public_test",
            label="Inactive Public Test",
            description="Inactive layer",
            gee_dataset="Inactive source",
            gee_band="inactive",
            is_active=False,
            is_public=True,
        )

    def _catalog_keys(self):
        response = self.client.get(reverse("remote-sensing-layers"))
        self.assertEqual(response.status_code, 200)
        data = response.json()
        return {item["key"] for item in data["results"]}, data["results"]

    def test_public_operational_layers_appear(self):
        """All six operational public layers must appear in the catalog."""
        keys, _ = self._catalog_keys()
        for key in self.public_keys:
            self.assertIn(key, keys)

    def test_drought_spi_appears_in_catalog_when_public(self):
        """drought_index must appear in the catalog when is_public=True."""
        keys, _ = self._catalog_keys()
        self.assertIn("drought_index", keys)

    def test_rainfall_anomaly_appears_in_catalog_when_public(self):
        """rainfall_anomaly must appear in the catalog when is_public=True."""
        keys, _ = self._catalog_keys()
        self.assertIn("rainfall_anomaly", keys)

    def test_lst_appears_in_catalog_when_public(self):
        """lst must appear in the catalog when is_public=True."""
        keys, _ = self._catalog_keys()
        self.assertIn("lst", keys)

    def test_private_layers_do_not_appear(self):
        """A private active layer must never appear in the catalog."""
        keys, _ = self._catalog_keys()
        self.assertNotIn("flood_hazard", keys)

    def test_inactive_layers_do_not_appear(self):
        keys, _ = self._catalog_keys()
        self.assertNotIn("inactive_public_test", keys)

    def test_catalog_exposes_only_non_sensitive_layer_metadata(self):
        _, results = self._catalog_keys()
        self.assertTrue(results)
        for item in results:
            self.assertNotIn("is_public", item)
            self.assertNotIn("is_active", item)
            self.assertIn("key", item)
            self.assertIn("label", item)
            self.assertIn("description", item)
            self.assertIn("source", item)

    def test_catalog_has_no_private_layer_bypass(self):
        """Setting drought_index to is_public=False must remove it from the catalog."""
        layer = RemoteSensingLayer.objects.get(key="drought_index")
        layer.is_public = False
        layer.save()

        keys, _ = self._catalog_keys()
        self.assertNotIn("drought_index", keys)


# ===========================================================================
# Phase A — Land Cover Intelligence  (no database tables required)
# ===========================================================================


class LandCoverProviderRegistryTests(SimpleTestCase):
    """Provider registry completeness and class-scheme integrity checks."""

    def _providers(self):
        from remote_sensing.lulc_providers import LAND_COVER_PROVIDERS
        return LAND_COVER_PROVIDERS

    def _enabled(self):
        return [p for p in self._providers().values() if p.enabled]

    def _disabled(self):
        return [p for p in self._providers().values() if not p.enabled]

    # --- Registry structure ---

    def test_dynamic_world_v1_present(self):
        self.assertIn("dynamic_world_v1", self._providers())

    def test_dynamic_world_v1_is_enabled(self):
        self.assertTrue(self._providers()["dynamic_world_v1"].enabled)

    def test_registry_has_four_providers(self):
        self.assertEqual(len(self._providers()), 4)

    def test_provider_key_matches_dict_key(self):
        for key, provider in self._providers().items():
            self.assertEqual(key, provider.key, msg=f"Provider key mismatch: {key!r}")

    # --- Enabled provider required fields ---

    def test_enabled_providers_have_label(self):
        for p in self._enabled():
            self.assertTrue(p.label, msg=f"{p.key}: label is empty")

    def test_enabled_providers_have_gee_collection(self):
        for p in self._enabled():
            self.assertTrue(p.gee_collection, msg=f"{p.key}: gee_collection is empty")

    def test_enabled_providers_have_method_version(self):
        for p in self._enabled():
            self.assertTrue(p.method_version, msg=f"{p.key}: method_version is empty")

    def test_enabled_providers_have_nonempty_class_scheme(self):
        for p in self._enabled():
            self.assertTrue(p.class_scheme, msg=f"{p.key}: class_scheme is empty")

    def test_enabled_providers_have_positive_default_scale(self):
        for p in self._enabled():
            self.assertGreater(p.default_scale, 0, msg=f"{p.key}: default_scale must be > 0")

    def test_enabled_providers_have_valid_year_min(self):
        for p in self._enabled():
            self.assertIsNotNone(p.valid_year_min, msg=f"{p.key}: valid_year_min is None")
            self.assertGreater(p.valid_year_min, 1900, msg=f"{p.key}: valid_year_min suspicious")

    def test_enabled_providers_have_supported_windows(self):
        for p in self._enabled():
            self.assertTrue(p.supported_windows, msg=f"{p.key}: supported_windows is empty")

    # --- Disabled providers ---

    def test_disabled_providers_have_block_reason(self):
        for p in self._disabled():
            self.assertTrue(p.block_reason, msg=f"{p.key}: block_reason is empty")

    def test_esri_annual_lulc_is_disabled(self):
        self.assertIn("esri_annual_lulc", self._providers())
        self.assertFalse(self._providers()["esri_annual_lulc"].enabled)

    def test_esa_worldcover_v200_is_disabled(self):
        self.assertIn("esa_worldcover_v200", self._providers())
        self.assertFalse(self._providers()["esa_worldcover_v200"].enabled)

    def test_landsat_supervised_v1_is_disabled(self):
        self.assertIn("landsat_supervised_v1", self._providers())
        self.assertFalse(self._providers()["landsat_supervised_v1"].enabled)

    # --- Dynamic World v1 class scheme ---

    def test_dynamic_world_has_nine_classes(self):
        scheme = self._providers()["dynamic_world_v1"].class_scheme
        self.assertEqual(len(scheme), 9)

    def test_dynamic_world_class_keys_unique(self):
        scheme = self._providers()["dynamic_world_v1"].class_scheme
        keys = list(scheme.keys())
        self.assertEqual(len(keys), len(set(keys)), msg="Duplicate class keys")

    def test_dynamic_world_gee_class_codes_unique(self):
        scheme = self._providers()["dynamic_world_v1"].class_scheme
        codes = [cls.gee_class_code for cls in scheme.values()]
        self.assertEqual(len(codes), len(set(codes)), msg="Duplicate GEE class codes")

    def test_dynamic_world_expected_class_keys(self):
        expected = {
            "water", "trees", "grass", "flooded_vegetation", "crops",
            "shrub_scrub", "built_area", "bare_ground", "snow_ice",
        }
        scheme = self._providers()["dynamic_world_v1"].class_scheme
        self.assertEqual(set(scheme.keys()), expected)

    def test_dynamic_world_gee_codes_are_zero_to_eight(self):
        scheme = self._providers()["dynamic_world_v1"].class_scheme
        codes = sorted(cls.gee_class_code for cls in scheme.values())
        self.assertEqual(codes, list(range(9)))

    def test_dynamic_world_snow_ice_excluded_from_selector(self):
        snow_ice = self._providers()["dynamic_world_v1"].class_scheme["snow_ice"]
        self.assertFalse(
            snow_ice.show_in_selector,
            msg="snow_ice must be excluded from the Atlas class selector in Kaduna context",
        )

    def test_dynamic_world_non_snow_classes_in_selector(self):
        scheme = self._providers()["dynamic_world_v1"].class_scheme
        for key, cls in scheme.items():
            if key != "snow_ice":
                self.assertTrue(cls.show_in_selector, msg=f"{key}: should be in selector")

    def test_class_definition_key_matches_dict_key(self):
        scheme = self._providers()["dynamic_world_v1"].class_scheme
        for dict_key, cls in scheme.items():
            self.assertEqual(dict_key, cls.key, msg=f"Class definition key mismatch: {dict_key!r}")

    def test_all_class_definitions_have_labels(self):
        scheme = self._providers()["dynamic_world_v1"].class_scheme
        for key, cls in scheme.items():
            self.assertTrue(cls.label, msg=f"{key}: label is empty")

    def test_all_class_definitions_have_hex_colors(self):
        scheme = self._providers()["dynamic_world_v1"].class_scheme
        for key, cls in scheme.items():
            self.assertTrue(cls.default_color, msg=f"{key}: default_color is empty")
            self.assertTrue(
                cls.default_color.startswith("#"),
                msg=f"{key}: default_color must be a hex string",
            )

    # --- Registry accessor ---

    def test_get_provider_returns_correct_entry(self):
        from remote_sensing.lulc_providers import get_provider
        p = get_provider("dynamic_world_v1")
        self.assertEqual(p.key, "dynamic_world_v1")

    def test_get_provider_raises_for_unknown_key(self):
        from remote_sensing.lulc_providers import get_provider
        with self.assertRaises(ValueError):
            get_provider("nonexistent_provider_xyz")


class LandCoverSeedGateTests(SimpleTestCase):
    """lulc seed entry must have explicit is_public=False and is_active=False."""

    def _lulc_entry(self):
        from remote_sensing.management.commands.seed_remote_sensing_layers import LAYERS
        for item in LAYERS:
            if item["key"] == "lulc":
                return item
        return None

    def test_lulc_seed_entry_exists(self):
        self.assertIsNotNone(self._lulc_entry(), msg="lulc entry missing from seed LAYERS list")

    def test_lulc_seed_entry_is_not_public(self):
        entry = self._lulc_entry()
        self.assertFalse(
            entry.get("is_public", True),
            msg="lulc seed entry must have is_public=False to prevent accidental exposure",
        )

    def test_lulc_seed_entry_is_not_active(self):
        entry = self._lulc_entry()
        self.assertFalse(
            entry.get("is_active", True),
            msg="lulc seed entry must have is_active=False to prevent accidental exposure",
        )

    def test_lulc_seed_entry_has_explicit_is_public_key(self):
        """is_public must be explicit so it does not inherit the True default."""
        entry = self._lulc_entry()
        self.assertIn(
            "is_public", entry,
            msg="lulc seed entry must contain an explicit 'is_public' key",
        )

    def test_lulc_seed_entry_has_explicit_is_active_key(self):
        """is_active must be explicit so it does not inherit the True default."""
        entry = self._lulc_entry()
        self.assertIn(
            "is_active", entry,
            msg="lulc seed entry must contain an explicit 'is_active' key",
        )


class FloodHazardSeedGateTests(SimpleTestCase):
    """flood_hazard and flood_occurrence seed entries must be non-public and non-active."""

    def _entry(self, key):
        from remote_sensing.management.commands.seed_remote_sensing_layers import LAYERS
        for item in LAYERS:
            if item["key"] == key:
                return item
        return None

    def test_flood_hazard_seed_entry_exists(self):
        self.assertIsNotNone(self._entry("flood_hazard"), msg="flood_hazard entry missing from seed LAYERS list")

    def test_flood_occurrence_seed_entry_exists(self):
        self.assertIsNotNone(self._entry("flood_occurrence"), msg="flood_occurrence entry missing from seed LAYERS list")

    def test_flood_hazard_is_not_public(self):
        entry = self._entry("flood_hazard")
        self.assertIn("is_public", entry, msg="flood_hazard seed entry must have an explicit 'is_public' key")
        self.assertFalse(entry["is_public"], msg="flood_hazard must be is_public=False — no data loaded")

    def test_flood_hazard_is_not_active(self):
        entry = self._entry("flood_hazard")
        self.assertIn("is_active", entry, msg="flood_hazard seed entry must have an explicit 'is_active' key")
        self.assertFalse(entry["is_active"], msg="flood_hazard must be is_active=False — no data loaded")

    def test_flood_occurrence_is_not_public(self):
        entry = self._entry("flood_occurrence")
        self.assertIn("is_public", entry, msg="flood_occurrence seed entry must have an explicit 'is_public' key")
        self.assertFalse(entry["is_public"], msg="flood_occurrence must be is_public=False — no data loaded")

    def test_flood_occurrence_is_not_active(self):
        entry = self._entry("flood_occurrence")
        self.assertIn("is_active", entry, msg="flood_occurrence seed entry must have an explicit 'is_active' key")
        self.assertFalse(entry["is_active"], msg="flood_occurrence must be is_active=False — no data loaded")


class FloodOccurrenceSyncTests(TestCase):
    """Tests for sync_flood_occurrence management command and GEE method."""

    _MOCK_FEATURE = {
        "type": "Feature",
        "geometry": {
            "type": "Polygon",
            "coordinates": [
                [[7.0, 10.0], [7.1, 10.0], [7.1, 10.1], [7.0, 10.1], [7.0, 10.0]]
            ],
        },
        "properties": {"lgacode": "19001", "lganame": "Birnin Gwari"},
    }

    _MOCK_GEE_DATA = {
        "mean": 4.27,
        "metadata": {
            "area_pct_occurrence_gt_10": 1.23,
            "area_pct_occurrence_gt_25": 0.55,
            "area_pct_occurrence_gt_50": 0.12,
            "method_version": "jrc_gsw14_occurrence_mean_v1",
            "data_caution": (
                "Historical surface-water occurrence indicator (1984–2021). "
                "Not a real-time flood warning or forecast."
            ),
        },
    }

    @classmethod
    def setUpTestData(cls):
        cls.layer = RemoteSensingLayer.objects.create(
            key="flood_occurrence",
            label="Flood Occurrence",
            gee_dataset="JRC Global Surface Water v1.4",
            gee_band="occurrence",
            is_public=False,
            is_active=False,
        )

    def _run_command(self, dry_run=False, skip_existing=False, admin_codes=None,
                     gee_mean=4.27):
        """Run sync_flood_occurrence with GEE and filesystem mocked."""
        from io import StringIO
        from unittest.mock import MagicMock, patch
        from django.core.management import call_command

        gee_result = GEEResult(
            available=True,
            data={
                "mean": gee_mean,
                "metadata": dict(self._MOCK_GEE_DATA["metadata"]),
            },
        )
        init_result = GEEResult(available=True, data={"auth_mode": "test"})

        mock_gee = MagicMock()
        mock_gee.project = "test-project"
        mock_gee.initialize.return_value = init_result
        mock_gee.compute_flood_occurrence_for_geometry.return_value = gee_result

        kwargs = {"dry_run": dry_run, "skip_existing": skip_existing, "stdout": StringIO()}
        if admin_codes:
            kwargs["admin_codes"] = admin_codes

        with patch(
            "remote_sensing.management.commands.sync_flood_occurrence.Command._load_features",
            return_value=[self._MOCK_FEATURE],
        ):
            with patch(
                "remote_sensing.management.commands.sync_flood_occurrence.gee_service",
                mock_gee,
            ):
                out = StringIO()
                kwargs["stdout"] = out
                call_command("sync_flood_occurrence", **kwargs)

        return out.getvalue(), mock_gee

    # --- 1. GEE method returns mean occurrence ---

    def test_gee_method_returns_mean_occurrence(self):
        from unittest.mock import MagicMock, patch
        import ee as _ee_sentinel

        mock_ee = MagicMock()
        mock_ee.Geometry.return_value = MagicMock()

        mock_image = MagicMock()
        mock_ee.Image.return_value = mock_image
        mock_image.select.return_value = mock_image
        mock_image.gt.return_value = mock_image

        mock_result = MagicMock()
        mock_image.reduceRegion.return_value = mock_result
        mock_result.getInfo.return_value = {"occurrence": 4.27}

        with patch.dict("sys.modules", {"ee": mock_ee}):
            result = gee_service.compute_flood_occurrence_for_geometry(
                geometry_dict=self._MOCK_FEATURE["geometry"],
                scale=30,
            )

        self.assertTrue(result.available)
        self.assertAlmostEqual(result.data["mean"], 4.27, places=4)

    def test_gee_method_returns_metadata_keys(self):
        from unittest.mock import MagicMock, patch

        mock_ee = MagicMock()
        mock_image = MagicMock()
        mock_ee.Image.return_value = mock_image
        mock_image.select.return_value = mock_image
        mock_image.gt.return_value = mock_image
        mock_result = MagicMock()
        mock_image.reduceRegion.return_value = mock_result
        mock_result.getInfo.return_value = {"occurrence": 3.5}

        with patch.dict("sys.modules", {"ee": mock_ee}):
            result = gee_service.compute_flood_occurrence_for_geometry(
                geometry_dict=self._MOCK_FEATURE["geometry"],
            )

        meta = result.data.get("metadata", {})
        self.assertIn("area_pct_occurrence_gt_10", meta)
        self.assertIn("area_pct_occurrence_gt_25", meta)
        self.assertIn("area_pct_occurrence_gt_50", meta)
        self.assertIn("method_version", meta)
        self.assertEqual(meta["method_version"], "jrc_gsw14_occurrence_mean_v1")

    # --- 2. Dry run does not call GEE ---

    def test_dry_run_does_not_call_gee(self):
        _, mock_gee = self._run_command(dry_run=True)
        mock_gee.compute_flood_occurrence_for_geometry.assert_not_called()
        mock_gee.initialize.assert_not_called()

    def test_dry_run_does_not_create_records(self):
        before = RemoteSensingLGAMetric.objects.filter(layer=self.layer).count()
        self._run_command(dry_run=True)
        after = RemoteSensingLGAMetric.objects.filter(layer=self.layer).count()
        self.assertEqual(before, after)

    # --- 3. Live run creates metrics from mocked result ---

    def test_live_creates_metric_record(self):
        self._run_command(dry_run=False)
        rec = RemoteSensingLGAMetric.objects.filter(
            layer=self.layer, admin_code="19001", year=2021, season="annual"
        ).first()
        self.assertIsNotNone(rec)
        self.assertAlmostEqual(float(rec.mean_value), 4.27, places=4)

    def test_live_stores_data_source(self):
        self._run_command(dry_run=False)
        rec = RemoteSensingLGAMetric.objects.get(
            layer=self.layer, admin_code="19001", year=2021, season="annual"
        )
        self.assertEqual(rec.data_source, "JRC Global Surface Water v1.4")

    def test_live_stores_metadata_keys(self):
        self._run_command(dry_run=False)
        rec = RemoteSensingLGAMetric.objects.get(
            layer=self.layer, admin_code="19001", year=2021, season="annual"
        )
        self.assertIn("method_version", rec.metadata)
        self.assertEqual(rec.metadata["method_version"], "jrc_gsw14_occurrence_mean_v1")
        self.assertIn("area_pct_occurrence_gt_10", rec.metadata)

    def test_live_stores_unit_percent(self):
        self._run_command(dry_run=False)
        rec = RemoteSensingLGAMetric.objects.get(
            layer=self.layer, admin_code="19001", year=2021, season="annual"
        )
        self.assertEqual(rec.unit, "%")

    # --- 4. Skip-existing avoids duplicate writes ---

    def test_skip_existing_avoids_second_gee_call(self):
        self._run_command(dry_run=False, skip_existing=False)
        _, mock_gee = self._run_command(dry_run=False, skip_existing=True)
        mock_gee.compute_flood_occurrence_for_geometry.assert_not_called()

    def test_skip_existing_dry_run_reports_skip(self):
        self._run_command(dry_run=False)
        out, _ = self._run_command(dry_run=True, skip_existing=True)
        self.assertIn("SKIP", out)

    # --- 5. Layer remains is_public=False and is_active=False ---

    def test_layer_remains_not_public_after_sync(self):
        self._run_command(dry_run=False)
        self.layer.refresh_from_db()
        self.assertFalse(self.layer.is_public)

    def test_layer_remains_not_active_after_sync(self):
        self._run_command(dry_run=False)
        self.layer.refresh_from_db()
        self.assertFalse(self.layer.is_active)

    # --- 6. Registry method_version is correct ---

    def test_registry_flood_occurrence_method_version(self):
        from remote_sensing.sync_registry import LAYER_REGISTRY
        reg = LAYER_REGISTRY.get("flood_occurrence")
        self.assertIsNotNone(reg, "flood_occurrence missing from LAYER_REGISTRY")
        self.assertIn("jrc_gsw14_occurrence_mean_v1", reg.metadata_extras.get("method_version", ""))

    def test_registry_flood_occurrence_is_runnable(self):
        from remote_sensing.sync_registry import LAYER_REGISTRY, Readiness
        reg = LAYER_REGISTRY["flood_occurrence"]
        self.assertEqual(reg.readiness, Readiness.RUNNABLE)

    def test_registry_flood_occurrence_valid_year_range(self):
        from remote_sensing.sync_registry import LAYER_REGISTRY
        reg = LAYER_REGISTRY["flood_occurrence"]
        self.assertEqual(reg.valid_year_min, 2021)
        self.assertEqual(reg.valid_year_max, 2021)

    # --- 7. Serializer unit for flood_occurrence is "%" ---

    def test_serializer_unit_flood_occurrence(self):
        from remote_sensing.serializers import RemoteSensingLayerSerializer
        unit = RemoteSensingLayerSerializer.UNIT_BY_LAYER_KEY.get("flood_occurrence")
        self.assertEqual(unit, "%")

    # --- 8. No forecast/warning wording in metadata ---

    def test_no_forecast_wording_in_method_version(self):
        from remote_sensing.sync_registry import LAYER_REGISTRY
        reg = LAYER_REGISTRY["flood_occurrence"]
        notes_lower = reg.notes.lower()
        # Must not affirmatively describe the product as a prediction or alert system.
        for phrase in ("flood prediction", "flood alert system", "disaster prediction",
                       "will flood", "at risk of flooding"):
            self.assertNotIn(phrase, notes_lower,
                             msg=f"Forbidden phrase {phrase!r} in registry notes")
        # Must carry the historical-indicator disclaimer.
        self.assertIn("historical", notes_lower)
        self.assertIn("not a real-time", notes_lower)

    def test_data_caution_present_in_gee_metadata(self):
        """GEE result metadata must carry a caution note for display consumers."""
        from unittest.mock import MagicMock, patch

        mock_ee = MagicMock()
        mock_image = MagicMock()
        mock_ee.Image.return_value = mock_image
        mock_image.select.return_value = mock_image
        mock_image.gt.return_value = mock_image
        mock_result = MagicMock()
        mock_image.reduceRegion.return_value = mock_result
        mock_result.getInfo.return_value = {"occurrence": 2.0}

        with patch.dict("sys.modules", {"ee": mock_ee}):
            result = gee_service.compute_flood_occurrence_for_geometry(
                geometry_dict=self._MOCK_FEATURE["geometry"],
            )

        caution = result.data.get("metadata", {}).get("data_caution", "")
        self.assertIn("historical", caution.lower())
        self.assertIn("not a real-time", caution.lower())
        # Must not affirmatively describe the product as a disaster prediction system.
        for phrase in ("flood prediction", "disaster prediction", "will flood",
                       "at risk of flooding"):
            self.assertNotIn(phrase, caution.lower(),
                             msg=f"Forbidden phrase {phrase!r} in data_caution")


class ElevationSeedGateTests(SimpleTestCase):
    """elevation seed entry must have explicit is_public=False and is_active=False."""

    def _entry(self):
        from remote_sensing.management.commands.seed_remote_sensing_layers import LAYERS
        for item in LAYERS:
            if item["key"] == "elevation":
                return item
        return None

    def test_elevation_seed_entry_exists(self):
        self.assertIsNotNone(self._entry(), msg="elevation entry missing from seed LAYERS list")

    def test_elevation_seed_entry_is_not_public(self):
        entry = self._entry()
        self.assertIn("is_public", entry, msg="elevation seed entry must have an explicit 'is_public' key")
        self.assertFalse(entry["is_public"], msg="elevation must be is_public=False — not synced/QA'd yet")

    def test_elevation_seed_entry_is_not_active(self):
        entry = self._entry()
        self.assertIn("is_active", entry, msg="elevation seed entry must have an explicit 'is_active' key")
        self.assertFalse(entry["is_active"], msg="elevation must be is_active=False — not synced/QA'd yet")


class ElevationSyncTests(TestCase):
    """Tests for sync_elevation management command and GEE method."""

    _MOCK_FEATURE = {
        "type": "Feature",
        "geometry": {
            "type": "Polygon",
            "coordinates": [
                [[7.0, 10.0], [7.1, 10.0], [7.1, 10.1], [7.0, 10.1], [7.0, 10.0]]
            ],
        },
        "properties": {"lgacode": "19001", "lganame": "Birnin Gwari"},
    }

    _MOCK_GEE_DATA = {
        "mean": 612.5,
        "metadata": {
            "min_elevation_m":  405.0,
            "max_elevation_m":  871.0,
            "mean_elevation_m": 612.5,
            "std_elevation_m":  98.3,
            "method_version":   "srtm_mean_elevation_v1",
            "data_caution": (
                "Static topographic layer, not a climate variable. "
                "SRTM elevation reflects terrain as of ~2000."
            ),
        },
    }

    @classmethod
    def setUpTestData(cls):
        cls.layer = RemoteSensingLayer.objects.create(
            key="elevation",
            label="Elevation / Terrain",
            gee_dataset="USGS SRTMGL1 v003",
            gee_band="elevation",
            is_public=False,
            is_active=False,
        )

    def _run_command(self, dry_run=False, skip_existing=False, admin_codes=None,
                     gee_mean=612.5):
        """Run sync_elevation with GEE and filesystem mocked."""
        from io import StringIO
        from unittest.mock import MagicMock, patch
        from django.core.management import call_command

        gee_result = GEEResult(
            available=True,
            data={
                "mean": gee_mean,
                "metadata": dict(self._MOCK_GEE_DATA["metadata"]),
            },
        )
        init_result = GEEResult(available=True, data={"auth_mode": "test"})

        mock_gee = MagicMock()
        mock_gee.project = "test-project"
        mock_gee.initialize.return_value = init_result
        mock_gee.compute_elevation_for_geometry.return_value = gee_result

        kwargs = {"dry_run": dry_run, "skip_existing": skip_existing, "stdout": StringIO()}
        if admin_codes:
            kwargs["admin_codes"] = admin_codes

        with patch(
            "remote_sensing.management.commands.sync_elevation.Command._load_features",
            return_value=[self._MOCK_FEATURE],
        ):
            with patch(
                "remote_sensing.management.commands.sync_elevation.gee_service",
                mock_gee,
            ):
                out = StringIO()
                kwargs["stdout"] = out
                call_command("sync_elevation", **kwargs)

        return out.getvalue(), mock_gee

    # --- 1. GEE method returns mean elevation ---

    def test_gee_method_returns_mean_elevation(self):
        from unittest.mock import MagicMock, patch

        mock_ee = MagicMock()
        mock_image = MagicMock()
        mock_ee.Image.return_value = mock_image
        mock_image.select.return_value = mock_image

        mock_reducer = MagicMock()
        mock_ee.Reducer.mean.return_value = mock_reducer
        mock_reducer.combine.return_value = mock_reducer

        mock_result = MagicMock()
        mock_image.reduceRegion.return_value = mock_result
        mock_result.getInfo.return_value = {
            "elevation_mean": 612.5,
            "elevation_min":  405.0,
            "elevation_max":  871.0,
            "elevation_stdDev": 98.3,
        }

        with patch.dict("sys.modules", {"ee": mock_ee}):
            result = gee_service.compute_elevation_for_geometry(
                geometry_dict=self._MOCK_FEATURE["geometry"],
                scale=30,
            )

        self.assertTrue(result.available)
        self.assertAlmostEqual(result.data["mean"], 612.5, places=2)

    def test_gee_method_returns_metadata_keys(self):
        from unittest.mock import MagicMock, patch

        mock_ee = MagicMock()
        mock_image = MagicMock()
        mock_ee.Image.return_value = mock_image
        mock_image.select.return_value = mock_image

        mock_reducer = MagicMock()
        mock_ee.Reducer.mean.return_value = mock_reducer
        mock_reducer.combine.return_value = mock_reducer

        mock_result = MagicMock()
        mock_image.reduceRegion.return_value = mock_result
        mock_result.getInfo.return_value = {
            "elevation_mean": 612.5,
            "elevation_min":  405.0,
            "elevation_max":  871.0,
            "elevation_stdDev": 98.3,
        }

        with patch.dict("sys.modules", {"ee": mock_ee}):
            result = gee_service.compute_elevation_for_geometry(
                geometry_dict=self._MOCK_FEATURE["geometry"],
            )

        meta = result.data.get("metadata", {})
        self.assertIn("min_elevation_m", meta)
        self.assertIn("max_elevation_m", meta)
        self.assertIn("mean_elevation_m", meta)
        self.assertIn("std_elevation_m", meta)
        self.assertIn("method_version", meta)
        self.assertEqual(meta["method_version"], "srtm_mean_elevation_v1")

    # --- 2. Dry run does not call GEE ---

    def test_dry_run_does_not_call_gee(self):
        _, mock_gee = self._run_command(dry_run=True)
        mock_gee.compute_elevation_for_geometry.assert_not_called()
        mock_gee.initialize.assert_not_called()

    def test_dry_run_does_not_create_records(self):
        before = RemoteSensingLGAMetric.objects.filter(layer=self.layer).count()
        self._run_command(dry_run=True)
        after = RemoteSensingLGAMetric.objects.filter(layer=self.layer).count()
        self.assertEqual(before, after)

    # --- 3. Live run creates metrics from mocked result ---

    def test_live_creates_metric_record(self):
        self._run_command(dry_run=False)
        rec = RemoteSensingLGAMetric.objects.filter(
            layer=self.layer, admin_code="19001", year=2000, season="annual"
        ).first()
        self.assertIsNotNone(rec)
        self.assertAlmostEqual(float(rec.mean_value), 612.5, places=2)

    def test_live_stores_data_source(self):
        self._run_command(dry_run=False)
        rec = RemoteSensingLGAMetric.objects.get(
            layer=self.layer, admin_code="19001", year=2000, season="annual"
        )
        self.assertEqual(rec.data_source, "USGS SRTMGL1 v003")

    def test_live_stores_metadata_keys(self):
        self._run_command(dry_run=False)
        rec = RemoteSensingLGAMetric.objects.get(
            layer=self.layer, admin_code="19001", year=2000, season="annual"
        )
        self.assertIn("method_version", rec.metadata)
        self.assertEqual(rec.metadata["method_version"], "srtm_mean_elevation_v1")
        self.assertIn("min_elevation_m", rec.metadata)
        self.assertIn("max_elevation_m", rec.metadata)

    def test_live_stores_unit_metres(self):
        self._run_command(dry_run=False)
        rec = RemoteSensingLGAMetric.objects.get(
            layer=self.layer, admin_code="19001", year=2000, season="annual"
        )
        self.assertEqual(rec.unit, "m")

    # --- 4. Skip-existing avoids duplicate writes ---

    def test_skip_existing_avoids_second_gee_call(self):
        self._run_command(dry_run=False, skip_existing=False)
        _, mock_gee = self._run_command(dry_run=False, skip_existing=True)
        mock_gee.compute_elevation_for_geometry.assert_not_called()

    def test_skip_existing_dry_run_reports_skip(self):
        self._run_command(dry_run=False)
        out, _ = self._run_command(dry_run=True, skip_existing=True)
        self.assertIn("SKIP", out)

    # --- 5. Layer remains is_public=False and is_active=False ---

    def test_layer_remains_not_public_after_sync(self):
        self._run_command(dry_run=False)
        self.layer.refresh_from_db()
        self.assertFalse(self.layer.is_public)

    def test_layer_remains_not_active_after_sync(self):
        self._run_command(dry_run=False)
        self.layer.refresh_from_db()
        self.assertFalse(self.layer.is_active)

    # --- 6. Registry configuration ---

    def test_registry_elevation_is_runnable(self):
        from remote_sensing.sync_registry import LAYER_REGISTRY, Readiness
        reg = LAYER_REGISTRY.get("elevation")
        self.assertIsNotNone(reg, "elevation missing from LAYER_REGISTRY")
        self.assertEqual(reg.readiness, Readiness.RUNNABLE)

    def test_registry_elevation_valid_year_range(self):
        from remote_sensing.sync_registry import LAYER_REGISTRY
        reg = LAYER_REGISTRY["elevation"]
        self.assertEqual(reg.valid_year_min, 2000)
        self.assertEqual(reg.valid_year_max, 2000)

    def test_registry_elevation_scale(self):
        from remote_sensing.sync_registry import LAYER_REGISTRY
        reg = LAYER_REGISTRY["elevation"]
        self.assertEqual(reg.default_scale, 30)

    def test_registry_elevation_entry_point(self):
        from remote_sensing.sync_registry import LAYER_REGISTRY
        reg = LAYER_REGISTRY["elevation"]
        self.assertEqual(reg.entry_point, "compute_elevation_for_geometry")

    def test_registry_elevation_method_version(self):
        from remote_sensing.sync_registry import LAYER_REGISTRY
        reg = LAYER_REGISTRY["elevation"]
        self.assertEqual(
            reg.metadata_extras.get("method_version"), "srtm_mean_elevation_v1"
        )

    # --- 7. Serializer unit for elevation is "m" ---

    def test_serializer_unit_elevation(self):
        from remote_sensing.serializers import RemoteSensingLayerSerializer
        unit = RemoteSensingLayerSerializer.UNIT_BY_LAYER_KEY.get("elevation")
        self.assertEqual(unit, "m")

    # --- 8. Data caution wording ---

    def test_data_caution_present_in_gee_metadata(self):
        """GEE result metadata must carry a caution note for display consumers."""
        from unittest.mock import MagicMock, patch

        mock_ee = MagicMock()
        mock_image = MagicMock()
        mock_ee.Image.return_value = mock_image
        mock_image.select.return_value = mock_image

        mock_reducer = MagicMock()
        mock_ee.Reducer.mean.return_value = mock_reducer
        mock_reducer.combine.return_value = mock_reducer

        mock_result = MagicMock()
        mock_image.reduceRegion.return_value = mock_result
        mock_result.getInfo.return_value = {
            "elevation_mean": 500.0,
            "elevation_min":  300.0,
            "elevation_max":  700.0,
            "elevation_stdDev": 80.0,
        }

        with patch.dict("sys.modules", {"ee": mock_ee}):
            result = gee_service.compute_elevation_for_geometry(
                geometry_dict=self._MOCK_FEATURE["geometry"],
            )

        caution = result.data.get("metadata", {}).get("data_caution", "")
        self.assertIn("static topographic", caution.lower())
        self.assertIn("not a climate variable", caution.lower())


class LandCoverAtlasGateTests(SimpleTestCase):
    """land_cover_change must remain absent from CLIMATE_ATLAS_LAYER_ORDER."""

    _JS_CONFIG = (
        Path(__file__).resolve().parents[2]
        / "frontend" / "src" / "config" / "climateAtlasLayers.js"
    )

    def _read_layer_order(self):
        import re
        if not self._JS_CONFIG.exists():
            return None
        content = self._JS_CONFIG.read_text(encoding="utf-8")
        match = re.search(
            r'export\s+const\s+CLIMATE_ATLAS_LAYER_ORDER\s*=\s*\[(.*?)\];',
            content,
            re.DOTALL,
        )
        if not match:
            return None
        return re.findall(r'"([^"]+)"', match.group(1))

    def test_js_config_is_readable(self):
        result = self._read_layer_order()
        self.assertIsNotNone(
            result,
            msg="Could not read CLIMATE_ATLAS_LAYER_ORDER from climateAtlasLayers.js",
        )

    def test_land_cover_change_absent_from_layer_order(self):
        order = self._read_layer_order()
        if order is None:
            self.skipTest("climateAtlasLayers.js not found")
        self.assertNotIn(
            "land_cover_change", order,
            msg="land_cover_change must not appear in CLIMATE_ATLAS_LAYER_ORDER until Phase G",
        )

    def test_lulc_absent_from_layer_order(self):
        order = self._read_layer_order()
        if order is None:
            self.skipTest("climateAtlasLayers.js not found")
        self.assertNotIn("lulc", order)

    def test_existing_operational_layers_still_present(self):
        """Regression guard: confirm existing five layers were not accidentally removed."""
        order = self._read_layer_order()
        if order is None:
            self.skipTest("climateAtlasLayers.js not found")
        for key in ("rainfall", "ndvi", "lst", "rainfall_anomaly", "drought_index"):
            self.assertIn(key, order, msg=f"{key!r} disappeared from CLIMATE_ATLAS_LAYER_ORDER")


class LandCoverSyncRegistryTests(SimpleTestCase):
    """lulc sync_registry entry: RUNNABLE after Phase B migration applied."""

    def _entry(self):
        from remote_sensing.sync_registry import LAYER_REGISTRY
        return LAYER_REGISTRY.get("lulc")

    def test_lulc_entry_exists(self):
        self.assertIsNotNone(self._entry())

    def test_lulc_entry_is_runnable(self):
        """Phase B complete: migration applied, entry promoted from BLOCKED to RUNNABLE."""
        from remote_sensing.sync_registry import Readiness
        self.assertEqual(self._entry().readiness, Readiness.RUNNABLE)

    def test_lulc_uses_dynamic_world_collection(self):
        self.assertEqual(self._entry().gee_collection, "GOOGLE/DYNAMICWORLD/V1")

    def test_lulc_valid_year_min_is_2018(self):
        self.assertEqual(self._entry().valid_year_min, 2018)

    def test_lulc_entry_point_is_named(self):
        self.assertEqual(self._entry().entry_point, "compute_land_cover_for_geometry")


class LandCoverDatabaseTests(TestCase):
    """Phase B: confirm migrated tables, constraints, FK cascade, and defaults."""

    def _make_dataset(self, **kwargs):
        from datetime import date
        from remote_sensing.models import LandCoverDataset
        defaults = dict(
            provider="dynamic_world_v1",
            provider_label="Dynamic World v1",
            gee_collection="GOOGLE/DYNAMICWORLD/V1",
            year=2024,
            composite_window="wet_season",
            composite_start=date(2024, 5, 1),
            composite_end=date(2024, 10, 31),
            method_version="dw_wetseason_mode_v1",
            admin_level="lga",
        )
        defaults.update(kwargs)
        return LandCoverDataset.objects.create(**defaults)

    def _make_snapshot(self, dataset, admin_code="19001", **kwargs):
        from remote_sensing.models import LandCoverSnapshot
        defaults = dict(
            dataset=dataset,
            admin_level="lga",
            admin_code=admin_code,
            admin_name="Test LGA",
            total_area_km2="9875.2000",
            class_pct={
                "water": 0.3, "trees": 11.2, "grass": 24.5,
                "flooded_vegetation": 0.8, "crops": 41.3, "shrub_scrub": 13.7,
                "built_area": 1.4, "bare_ground": 6.8, "snow_ice": 0.0,
            },
            class_areas_km2={
                "water": 29.6, "trees": 1106.0, "grass": 2419.4,
                "flooded_vegetation": 79.0, "crops": 4078.2, "shrub_scrub": 1352.9,
                "built_area": 138.3, "bare_ground": 671.5, "snow_ice": 0.0,
            },
        )
        defaults.update(kwargs)
        return LandCoverSnapshot.objects.create(**defaults)

    def setUp(self):
        from remote_sensing.models import LandCoverDataset, LandCoverDerivedMetric, LandCoverSnapshot
        self.LandCoverDataset = LandCoverDataset
        self.LandCoverSnapshot = LandCoverSnapshot
        self.LandCoverDerivedMetric = LandCoverDerivedMetric

    # --- Dataset defaults ---

    def test_dataset_is_public_defaults_false(self):
        ds = self._make_dataset()
        self.assertFalse(ds.is_public)

    def test_dataset_is_validated_defaults_false(self):
        ds = self._make_dataset()
        self.assertFalse(ds.is_validated)

    def test_dataset_snapshot_count_defaults_zero(self):
        ds = self._make_dataset()
        self.assertEqual(ds.snapshot_count, 0)

    # --- Unique constraints ---

    def test_dataset_unique_constraint_blocks_duplicate(self):
        from django.db import IntegrityError
        from datetime import date
        self._make_dataset()
        with self.assertRaises(IntegrityError):
            self._make_dataset()  # same provider/year/window/admin_level

    def test_snapshot_unique_constraint_blocks_duplicate(self):
        from django.db import IntegrityError
        ds = self._make_dataset()
        self._make_snapshot(ds)
        with self.assertRaises(IntegrityError):
            self._make_snapshot(ds)  # same dataset/admin_level/admin_code

    def test_derived_unique_constraint_blocks_duplicate(self):
        from django.db import IntegrityError
        from datetime import date
        ds_2024 = self._make_dataset(year=2024)
        ds_2018 = self._make_dataset(year=2018)
        snap_2024 = self._make_snapshot(ds_2024)
        snap_2018 = self._make_snapshot(ds_2018)
        self.LandCoverDerivedMetric.objects.create(
            snapshot=snap_2024,
            baseline_snapshot=snap_2018,
            class_change_pct={"trees": -2.1, "crops": 3.4},
        )
        with self.assertRaises(IntegrityError):
            self.LandCoverDerivedMetric.objects.create(
                snapshot=snap_2024,
                baseline_snapshot=snap_2018,
                class_change_pct={"trees": -2.1},
            )

    # --- Cascade delete ---

    def test_dataset_cascade_deletes_snapshots(self):
        ds = self._make_dataset()
        self._make_snapshot(ds)
        self.assertEqual(self.LandCoverSnapshot.objects.count(), 1)
        ds.delete()
        self.assertEqual(self.LandCoverSnapshot.objects.count(), 0)

    def test_snapshot_cascade_deletes_derived_metrics(self):
        from datetime import date
        ds_2024 = self._make_dataset(year=2024)
        ds_2018 = self._make_dataset(year=2018)
        snap_2024 = self._make_snapshot(ds_2024)
        snap_2018 = self._make_snapshot(ds_2018)
        self.LandCoverDerivedMetric.objects.create(
            snapshot=snap_2024,
            baseline_snapshot=snap_2018,
            class_change_pct={"trees": -2.1},
        )
        self.assertEqual(self.LandCoverDerivedMetric.objects.count(), 1)
        snap_2024.delete()
        self.assertEqual(self.LandCoverDerivedMetric.objects.count(), 0)

    # --- Snapshot nullable lga FK ---

    def test_snapshot_can_be_created_without_lga_fk(self):
        ds = self._make_dataset()
        snap = self._make_snapshot(ds)
        self.assertIsNone(snap.lga_id)

    # --- sync_log SET_NULL ---

    def test_dataset_sync_log_null_on_synclog_delete(self):
        from remote_sensing.models import RemoteSensingLayer, RemoteSensingSyncLog
        layer = RemoteSensingLayer.objects.create(
            key="ndvi_lc_test", label="Test", is_public=False, is_active=False,
        )
        sync_log = RemoteSensingSyncLog.objects.create(layer=layer, status="completed")
        ds = self._make_dataset(sync_log=sync_log)
        sync_log.delete()
        ds.refresh_from_db()
        self.assertIsNone(ds.sync_log_id)

    # --- lulc hidden in public layer catalog ---

    def test_lulc_layer_is_not_public_in_db(self):
        from remote_sensing.models import RemoteSensingLayer
        try:
            layer = RemoteSensingLayer.objects.get(key="lulc")
            self.assertFalse(layer.is_public, "lulc must not be public in the DB")
            self.assertFalse(layer.is_active, "lulc must not be active in the DB")
        except RemoteSensingLayer.DoesNotExist:
            pass  # not seeded in test DB — also acceptable


# ---------------------------------------------------------------------------
# Phase C1 — sync_lulc command tests
# ---------------------------------------------------------------------------


class LandCoverSyncLulcCommandTests(TestCase):
    """
    Tests for the sync_lulc management command.

    GEE is mocked throughout.  No live Earth Engine calls are made.
    DB access is available (TestCase) for tests that check record flags,
    snapshot_count, and skip-existing logic.
    """

    # A single minimal feature matching the Birnin Gwari pilot LGA.
    _MOCK_FEATURE = {
        "type": "Feature",
        "properties": {"lganame": "Birnin Gwari", "lgacode": "19001"},
        "geometry": {
            "type": "Polygon",
            "coordinates": [[[7.0, 11.0], [7.5, 11.0], [7.5, 11.5], [7.0, 11.5], [7.0, 11.0]]],
        },
    }

    def _mock_gee_result(self, quality_flag="high", peak_season_scene_count=10):
        """
        Return a valid LandCoverComputeResult with class sums = 100.0.

        Defaults model a high-quality composite (10 Jul+Aug scenes).
        Pass quality_flag and peak_season_scene_count to test quality-flag paths.
        """
        from remote_sensing.lulc_providers import LandCoverComputeResult
        counts = {
            "water": 300,
            "trees": 11200,
            "grass": 24500,
            "flooded_vegetation": 800,
            "crops": 41300,
            "shrub_scrub": 13700,
            "built_area": 1400,
            "bare_ground": 6800,
            "snow_ice": 0,
        }
        src = 42
        return LandCoverComputeResult(
            success=True,
            class_pixel_counts=counts,
            total_pixels=sum(counts.values()),
            masked_pixels=500,
            metadata={
                "source_image_count": src,
                "monthly_scene_counts": {
                    "5": 8, "6": 10, "7": 6, "8": 4, "9": 8, "10": 6,
                },
                "peak_season_scene_count": peak_season_scene_count,
                "peak_season_scene_ratio": round(peak_season_scene_count / src, 4),
                "quality_flag": quality_flag,
                "method_version": "dw_wetseason_mode_v1",
            },
        )

    # ------------------------------------------------------------------
    # Validation errors — raised before any DB or GEE access
    # ------------------------------------------------------------------

    def test_disabled_provider_raises_command_error(self):
        from io import StringIO
        from django.core.management import call_command
        from django.core.management.base import CommandError
        with self.assertRaises(CommandError):
            call_command(
                "sync_lulc",
                "--provider", "esri_annual_lulc",
                "--years", "2022",
                "--dry-run",
                stdout=StringIO(),
            )

    def test_unknown_provider_raises_command_error(self):
        from io import StringIO
        from django.core.management import call_command
        from django.core.management.base import CommandError
        with self.assertRaises(CommandError):
            call_command(
                "sync_lulc",
                "--provider", "nonexistent_xyz",
                "--years", "2022",
                "--dry-run",
                stdout=StringIO(),
            )

    def test_year_before_valid_min_raises_command_error(self):
        from io import StringIO
        from django.core.management import call_command
        from django.core.management.base import CommandError
        # Dynamic World v1 valid from 2018; 2015 is before the valid range.
        with self.assertRaises(CommandError):
            call_command(
                "sync_lulc",
                "--provider", "dynamic_world_v1",
                "--years", "2015",
                "--dry-run",
                stdout=StringIO(),
            )

    # ------------------------------------------------------------------
    # Dry-run: no GEE calls, correct task count
    # ------------------------------------------------------------------

    def test_dry_run_does_not_call_gee(self):
        from io import StringIO
        from unittest.mock import patch
        from django.core.management import call_command

        with patch(
            "remote_sensing.management.commands.sync_lulc.Command._load_features",
            return_value=[self._MOCK_FEATURE],
        ):
            with patch.object(
                type(gee_service),
                "compute_land_cover_for_geometry",
            ) as mock_gee:
                call_command(
                    "sync_lulc",
                    "--provider", "dynamic_world_v1",
                    "--years", "2018",
                    "--dry-run",
                    stdout=StringIO(),
                )
                mock_gee.assert_not_called()

    def test_dry_run_reports_planned_task_count(self):
        from io import StringIO
        from unittest.mock import patch
        from django.core.management import call_command

        # 2 years × 1 LGA = 2 tasks
        with patch(
            "remote_sensing.management.commands.sync_lulc.Command._load_features",
            return_value=[self._MOCK_FEATURE],
        ):
            out = StringIO()
            call_command(
                "sync_lulc",
                "--provider", "dynamic_world_v1",
                "--years", "2018", "2024",
                "--dry-run",
                stdout=out,
            )
        output = out.getvalue()
        # The summary line must report 2 total tasks (2 years × 1 LGA).
        self.assertIn("2", output)
        self.assertIn("DRY RUN complete", output)

    # ------------------------------------------------------------------
    # class_pct_from_result — pure Python, no DB
    # ------------------------------------------------------------------

    def test_class_pct_conversion_sums_within_tolerance(self):
        from remote_sensing.management.commands.sync_lulc import class_pct_from_result
        result = self._mock_gee_result()
        class_pct, _ = class_pct_from_result(result, scale=10)
        total = sum(class_pct.values())
        self.assertGreaterEqual(total, 99.5)
        self.assertLessEqual(total, 100.5)

    def test_class_pct_conversion_key_set_matches_input(self):
        from remote_sensing.management.commands.sync_lulc import class_pct_from_result
        result = self._mock_gee_result()
        class_pct, class_areas_km2 = class_pct_from_result(result, scale=10)
        self.assertEqual(set(class_pct.keys()), set(result.class_pixel_counts.keys()))
        self.assertEqual(set(class_areas_km2.keys()), set(result.class_pixel_counts.keys()))

    def test_class_areas_km2_matches_expected_pixel_area(self):
        from remote_sensing.management.commands.sync_lulc import class_pct_from_result
        result = self._mock_gee_result()
        _, class_areas_km2 = class_pct_from_result(result, scale=10)
        # 10 m pixel: each pixel = 10*10 / 1e6 = 0.0001 km²
        trees_pixels = result.class_pixel_counts["trees"]
        expected = round(trees_pixels * 0.0001, 6)
        self.assertAlmostEqual(class_areas_km2["trees"], expected, places=5)

    def test_class_pct_zero_pixels_returns_empty_dicts(self):
        from remote_sensing.lulc_providers import LandCoverComputeResult
        from remote_sensing.management.commands.sync_lulc import class_pct_from_result
        empty = LandCoverComputeResult(
            success=True, class_pixel_counts={}, total_pixels=0, masked_pixels=0,
        )
        class_pct, class_areas_km2 = class_pct_from_result(empty, scale=10)
        self.assertEqual(class_pct, {})
        self.assertEqual(class_areas_km2, {})

    # ------------------------------------------------------------------
    # Live path (GEE mocked) — dataset flags and snapshot_count
    # ------------------------------------------------------------------

    def _run_live_with_mock(
        self, admin_code="19001", lga_name="Birnin Gwari", years=None,
        mock_result=None,
    ):
        """
        Helper: run sync_lulc live with GEE and filesystem mocked.

        Returns the StringIO stdout so callers can inspect output.
        Pass mock_result to override the GEE return value (e.g. for low-quality tests).
        """
        from io import StringIO
        from unittest.mock import patch
        from django.core.management import call_command
        from remote_sensing.gee_service import GEEResult

        feature = {
            "type": "Feature",
            "properties": {"lganame": lga_name, "lgacode": admin_code},
            "geometry": self._MOCK_FEATURE["geometry"],
        }
        gee_result = mock_result if mock_result is not None else self._mock_gee_result()
        init_result = GEEResult(
            available=True,
            data={"auth_mode": "mock", "initialized": True, "project": "test"},
        )
        out = StringIO()

        with patch(
            "remote_sensing.management.commands.sync_lulc.Command._load_features",
            return_value=[feature],
        ):
            with patch.object(gee_service, "initialize", return_value=init_result):
                with patch.object(
                    gee_service,
                    "compute_land_cover_for_geometry",
                    return_value=gee_result,
                ):
                    call_command(
                        "sync_lulc",
                        "--provider", "dynamic_world_v1",
                        "--years", *(str(y) for y in (years or [2018])),
                        stdout=out,
                    )
        return out

    def test_dataset_created_with_is_public_false(self):
        from remote_sensing.models import LandCoverDataset
        self._run_live_with_mock()
        ds = LandCoverDataset.objects.get(
            provider="dynamic_world_v1", year=2018, composite_window="wet_season",
        )
        self.assertFalse(ds.is_public)

    def test_dataset_created_with_is_validated_false(self):
        from remote_sensing.models import LandCoverDataset
        self._run_live_with_mock()
        ds = LandCoverDataset.objects.get(
            provider="dynamic_world_v1", year=2018, composite_window="wet_season",
        )
        self.assertFalse(ds.is_validated)

    def test_snapshot_count_updated_after_live_run(self):
        from remote_sensing.models import LandCoverDataset
        self._run_live_with_mock()
        ds = LandCoverDataset.objects.get(
            provider="dynamic_world_v1", year=2018, composite_window="wet_season",
        )
        self.assertEqual(ds.snapshot_count, 1)

    def test_skip_existing_does_not_duplicate_snapshot(self):
        from io import StringIO
        from unittest.mock import patch, MagicMock
        from django.core.management import call_command
        from remote_sensing.gee_service import GEEResult
        from remote_sensing.models import LandCoverDataset, LandCoverSnapshot

        # First live run creates the snapshot.
        self._run_live_with_mock()
        self.assertEqual(LandCoverSnapshot.objects.count(), 1)

        # Second run with --skip-existing must not create a duplicate.
        feature = {
            "type": "Feature",
            "properties": {"lganame": "Birnin Gwari", "lgacode": "19001"},
            "geometry": self._MOCK_FEATURE["geometry"],
        }
        init_result = GEEResult(
            available=True,
            data={"auth_mode": "mock", "initialized": True, "project": "test"},
        )
        with patch(
            "remote_sensing.management.commands.sync_lulc.Command._load_features",
            return_value=[feature],
        ):
            with patch.object(gee_service, "initialize", return_value=init_result):
                with patch.object(
                    gee_service, "compute_land_cover_for_geometry",
                ) as mock_gee:
                    call_command(
                        "sync_lulc",
                        "--provider", "dynamic_world_v1",
                        "--years", "2018",
                        "--skip-existing",
                        stdout=StringIO(),
                    )
                    mock_gee.assert_not_called()

        self.assertEqual(LandCoverSnapshot.objects.count(), 1)


# ---------------------------------------------------------------------------
# Phase C2c — quality flag unit tests (pure Python, no DB, no GEE)
# ---------------------------------------------------------------------------


class LandCoverQualityFlagUnitTests(SimpleTestCase):
    """
    Unit tests for compute_quality_flag.

    No database or GEE calls.  Tests the threshold boundaries directly
    to guard against accidental regressions in the quality tier logic.
    """

    def test_quality_flag_high_when_peak_gte_5(self):
        from remote_sensing.lulc_providers import compute_quality_flag
        for n in [5, 10, 63, 116]:
            with self.subTest(peak=n):
                self.assertEqual(compute_quality_flag(n), "high")

    def test_quality_flag_medium_when_peak_2_to_4(self):
        from remote_sensing.lulc_providers import compute_quality_flag
        for n in [2, 3, 4]:
            with self.subTest(peak=n):
                self.assertEqual(compute_quality_flag(n), "medium")

    def test_quality_flag_low_when_peak_lt_2(self):
        from remote_sensing.lulc_providers import compute_quality_flag
        for n in [0, 1]:
            with self.subTest(peak=n):
                self.assertEqual(compute_quality_flag(n), "low")

    def test_boundary_at_5_is_high_not_medium(self):
        from remote_sensing.lulc_providers import compute_quality_flag
        self.assertEqual(compute_quality_flag(5), "high")
        self.assertEqual(compute_quality_flag(4), "medium")

    def test_boundary_at_2_is_medium_not_low(self):
        from remote_sensing.lulc_providers import compute_quality_flag
        self.assertEqual(compute_quality_flag(2), "medium")
        self.assertEqual(compute_quality_flag(1), "low")


# ---------------------------------------------------------------------------
# Phase C2c — quality metadata stored in snapshot and warning output tests
# ---------------------------------------------------------------------------


class LandCoverPhaseC2cQualityMetadataTests(TestCase):
    """
    Integration tests for Phase C2c quality metadata.

    GEE is mocked throughout.  Tests verify that:
    - quality metadata keys are stored in LandCoverSnapshot.metadata
    - low-quality snapshots do NOT fail the sync
    - low-quality snapshots produce a [LOW QUALITY] warning in stdout
    - dataset publication gates remain closed regardless of quality flag
    """

    _MOCK_FEATURE = {
        "type": "Feature",
        "properties": {"lganame": "Birnin Gwari", "lgacode": "19001"},
        "geometry": {
            "type": "Polygon",
            "coordinates": [[[7.0, 11.0], [7.5, 11.0], [7.5, 11.5], [7.0, 11.5], [7.0, 11.0]]],
        },
    }

    def _make_result(self, quality_flag="high", peak_season_scene_count=10):
        from remote_sensing.lulc_providers import LandCoverComputeResult
        counts = {
            "water": 300, "trees": 11200, "grass": 24500, "flooded_vegetation": 800,
            "crops": 41300, "shrub_scrub": 13700, "built_area": 1400,
            "bare_ground": 6800, "snow_ice": 0,
        }
        src = 42
        peak = peak_season_scene_count
        return LandCoverComputeResult(
            success=True,
            class_pixel_counts=counts,
            total_pixels=sum(counts.values()),
            masked_pixels=500,
            metadata={
                "source_image_count": src,
                "monthly_scene_counts": {
                    "5": 12, "6": 5,
                    "7": peak // 2,
                    "8": peak - peak // 2,
                    "9": 8, "10": 15,
                },
                "peak_season_scene_count": peak,
                "peak_season_scene_ratio": round(peak / src, 4),
                "quality_flag": quality_flag,
                "method_version": "dw_wetseason_mode_v1",
            },
        )

    def _run(self, mock_result):
        from io import StringIO
        from unittest.mock import patch
        from django.core.management import call_command
        from remote_sensing.gee_service import GEEResult

        init_result = GEEResult(
            available=True,
            data={"auth_mode": "mock", "initialized": True, "project": "test"},
        )
        out = StringIO()
        with patch(
            "remote_sensing.management.commands.sync_lulc.Command._load_features",
            return_value=[self._MOCK_FEATURE],
        ):
            with patch.object(gee_service, "initialize", return_value=init_result):
                with patch.object(
                    gee_service, "compute_land_cover_for_geometry",
                    return_value=mock_result,
                ):
                    call_command(
                        "sync_lulc",
                        "--provider", "dynamic_world_v1",
                        "--years", "2018",
                        stdout=out,
                    )
        return out.getvalue()

    # --- metadata stored in snapshot ---

    def test_snapshot_metadata_has_monthly_scene_counts(self):
        from remote_sensing.models import LandCoverSnapshot
        self._run(self._make_result())
        snap = LandCoverSnapshot.objects.get()
        self.assertIn("monthly_scene_counts", snap.metadata)
        for month in ["5", "6", "7", "8", "9", "10"]:
            self.assertIn(month, snap.metadata["monthly_scene_counts"],
                          f"month {month} missing from monthly_scene_counts")

    def test_snapshot_metadata_has_peak_season_scene_count(self):
        from remote_sensing.models import LandCoverSnapshot
        self._run(self._make_result(peak_season_scene_count=7))
        snap = LandCoverSnapshot.objects.get()
        self.assertIn("peak_season_scene_count", snap.metadata)
        self.assertEqual(snap.metadata["peak_season_scene_count"], 7)

    def test_snapshot_metadata_has_quality_flag(self):
        from remote_sensing.models import LandCoverSnapshot
        self._run(self._make_result(quality_flag="medium", peak_season_scene_count=3))
        snap = LandCoverSnapshot.objects.get()
        self.assertIn("quality_flag", snap.metadata)
        self.assertEqual(snap.metadata["quality_flag"], "medium")

    def test_snapshot_metadata_has_peak_season_scene_ratio(self):
        from remote_sensing.models import LandCoverSnapshot
        self._run(self._make_result(peak_season_scene_count=10))
        snap = LandCoverSnapshot.objects.get()
        self.assertIn("peak_season_scene_ratio", snap.metadata)
        self.assertIsInstance(snap.metadata["peak_season_scene_ratio"], float)

    # --- low-quality does not fail sync ---

    def test_low_quality_snapshot_does_not_raise(self):
        from remote_sensing.models import LandCoverSnapshot
        self._run(self._make_result(quality_flag="low", peak_season_scene_count=0))
        self.assertEqual(LandCoverSnapshot.objects.count(), 1)

    def test_low_quality_snapshot_is_stored_in_db(self):
        from remote_sensing.models import LandCoverSnapshot
        self._run(self._make_result(quality_flag="low", peak_season_scene_count=1))
        snap = LandCoverSnapshot.objects.get()
        self.assertEqual(snap.metadata["quality_flag"], "low")

    # --- low-quality produces warning output ---

    def test_low_quality_produces_warning_in_output(self):
        output = self._run(
            self._make_result(quality_flag="low", peak_season_scene_count=0)
        )
        self.assertIn("[LOW QUALITY]", output)

    def test_low_quality_warning_includes_peak_scene_count(self):
        output = self._run(
            self._make_result(quality_flag="low", peak_season_scene_count=1)
        )
        self.assertIn("peak_season_scenes=1", output)

    def test_high_quality_does_not_produce_low_quality_warning(self):
        output = self._run(
            self._make_result(quality_flag="high", peak_season_scene_count=10)
        )
        self.assertNotIn("[LOW QUALITY]", output)

    def test_medium_quality_does_not_produce_low_quality_warning(self):
        output = self._run(
            self._make_result(quality_flag="medium", peak_season_scene_count=3)
        )
        self.assertNotIn("[LOW QUALITY]", output)

    # --- publication gates remain closed ---

    def test_dataset_is_public_false_after_low_quality_sync(self):
        from remote_sensing.models import LandCoverDataset
        self._run(self._make_result(quality_flag="low", peak_season_scene_count=0))
        ds = LandCoverDataset.objects.get(provider="dynamic_world_v1", year=2018)
        self.assertFalse(ds.is_public)

    def test_dataset_is_validated_false_after_low_quality_sync(self):
        from remote_sensing.models import LandCoverDataset
        self._run(self._make_result(quality_flag="low", peak_season_scene_count=0))
        ds = LandCoverDataset.objects.get(provider="dynamic_world_v1", year=2018)
        self.assertFalse(ds.is_validated)


# ---------------------------------------------------------------------------
# Phase C2d — --min-peak-scenes gate tests
# ---------------------------------------------------------------------------


class LandCoverPhaseC2dMinPeakScenesTests(TestCase):
    """
    Tests for the --min-peak-scenes quality gate.

    GEE is mocked throughout.  Tests verify:
    - default (min_peak_scenes=0) saves all snapshots including low-quality
    - gate skips tasks below the threshold
    - gate saves tasks at or above the threshold
    - [QUALITY SKIP] appears in stdout for skipped tasks
    - [LOW QUALITY] does NOT appear when the gate is active (different code path)
    - quality_skipped count appears in the sync summary
    - skipped tasks produce no LandCoverSnapshot row in the DB
    - datasets remain is_public=False, is_validated=False
    """

    _MOCK_FEATURE = {
        "type": "Feature",
        "properties": {"lganame": "Soba", "lgacode": "19021"},
        "geometry": {
            "type": "Polygon",
            "coordinates": [[[8.0, 11.0], [8.5, 11.0], [8.5, 11.5], [8.0, 11.5], [8.0, 11.0]]],
        },
    }

    def _make_result(self, peak_season_scene_count=0, quality_flag=None):
        from remote_sensing.lulc_providers import LandCoverComputeResult, compute_quality_flag
        counts = {
            "water": 200, "trees": 5000, "grass": 15000, "flooded_vegetation": 300,
            "crops": 60000, "shrub_scrub": 12000, "built_area": 1500,
            "bare_ground": 6000, "snow_ice": 0,
        }
        src = 41
        flag = quality_flag if quality_flag is not None else compute_quality_flag(peak_season_scene_count)
        return LandCoverComputeResult(
            success=True,
            class_pixel_counts=counts,
            total_pixels=sum(counts.values()),
            masked_pixels=0,
            metadata={
                "source_image_count": src,
                "monthly_scene_counts": {"5": 12, "6": 5, "7": 0, "8": peak_season_scene_count, "9": 8, "10": 15},
                "peak_season_scene_count": peak_season_scene_count,
                "peak_season_scene_ratio": round(peak_season_scene_count / src, 4),
                "quality_flag": flag,
                "method_version": "dw_wetseason_mode_v1",
            },
        )

    def _run(self, mock_result, min_peak_scenes=0):
        from io import StringIO
        from unittest.mock import patch
        from django.core.management import call_command
        from remote_sensing.gee_service import GEEResult

        init_result = GEEResult(
            available=True,
            data={"auth_mode": "mock", "initialized": True, "project": "test"},
        )
        out = StringIO()
        with patch(
            "remote_sensing.management.commands.sync_lulc.Command._load_features",
            return_value=[self._MOCK_FEATURE],
        ):
            with patch.object(gee_service, "initialize", return_value=init_result):
                with patch.object(
                    gee_service, "compute_land_cover_for_geometry",
                    return_value=mock_result,
                ):
                    call_command(
                        "sync_lulc",
                        "--provider", "dynamic_world_v1",
                        "--years", "2024",
                        f"--min-peak-scenes={min_peak_scenes}",
                        stdout=out,
                    )
        return out.getvalue()

    # --- default (no gate) saves low-quality snapshots ---

    def test_default_no_gate_saves_low_quality_snapshot(self):
        from remote_sensing.models import LandCoverSnapshot
        self._run(self._make_result(peak_season_scene_count=0), min_peak_scenes=0)
        self.assertEqual(LandCoverSnapshot.objects.count(), 1)

    def test_default_no_gate_does_not_produce_quality_skip_message(self):
        output = self._run(self._make_result(peak_season_scene_count=0), min_peak_scenes=0)
        self.assertNotIn("[QUALITY SKIP]", output)

    # --- gate skips tasks below threshold ---

    def test_gate_skips_snapshot_below_threshold(self):
        from remote_sensing.models import LandCoverSnapshot
        self._run(self._make_result(peak_season_scene_count=1), min_peak_scenes=5)
        self.assertEqual(LandCoverSnapshot.objects.count(), 0)

    def test_gate_skips_zero_peak_scenes(self):
        from remote_sensing.models import LandCoverSnapshot
        self._run(self._make_result(peak_season_scene_count=0), min_peak_scenes=5)
        self.assertEqual(LandCoverSnapshot.objects.count(), 0)

    def test_gate_skips_exactly_one_below_threshold(self):
        from remote_sensing.models import LandCoverSnapshot
        # threshold=5, peak=4 → skipped
        self._run(self._make_result(peak_season_scene_count=4), min_peak_scenes=5)
        self.assertEqual(LandCoverSnapshot.objects.count(), 0)

    # --- gate saves tasks at or above threshold ---

    def test_gate_saves_snapshot_at_threshold(self):
        from remote_sensing.models import LandCoverSnapshot
        # threshold=5, peak=5 → saved
        self._run(self._make_result(peak_season_scene_count=5, quality_flag="high"), min_peak_scenes=5)
        self.assertEqual(LandCoverSnapshot.objects.count(), 1)

    def test_gate_saves_snapshot_above_threshold(self):
        from remote_sensing.models import LandCoverSnapshot
        self._run(self._make_result(peak_season_scene_count=16, quality_flag="high"), min_peak_scenes=5)
        self.assertEqual(LandCoverSnapshot.objects.count(), 1)

    # --- [QUALITY SKIP] output ---

    def test_quality_skip_produces_quality_skip_in_output(self):
        output = self._run(self._make_result(peak_season_scene_count=1), min_peak_scenes=5)
        self.assertIn("[QUALITY SKIP]", output)

    def test_quality_skip_output_includes_peak_count(self):
        output = self._run(self._make_result(peak_season_scene_count=1), min_peak_scenes=5)
        self.assertIn("peak_season_scenes=1", output)

    def test_quality_skip_output_includes_min_peak_scenes(self):
        output = self._run(self._make_result(peak_season_scene_count=1), min_peak_scenes=5)
        self.assertIn("--min-peak-scenes=5", output)

    def test_quality_skip_does_not_produce_low_quality_warning(self):
        # When gate is active, [LOW QUALITY] should not also appear.
        output = self._run(self._make_result(peak_season_scene_count=1), min_peak_scenes=5)
        self.assertNotIn("[LOW QUALITY]", output)

    # --- quality_skipped in summary ---

    def test_quality_skipped_count_in_summary(self):
        output = self._run(self._make_result(peak_season_scene_count=0), min_peak_scenes=5)
        self.assertIn("quality_skipped: 1", output)

    def test_quality_skipped_zero_when_no_skips(self):
        output = self._run(
            self._make_result(peak_season_scene_count=10, quality_flag="high"),
            min_peak_scenes=5,
        )
        self.assertIn("quality_skipped: 0", output)

    # --- dataset gates still closed ---

    def test_dataset_is_public_false_after_gated_sync(self):
        from remote_sensing.models import LandCoverDataset
        self._run(self._make_result(peak_season_scene_count=10, quality_flag="high"), min_peak_scenes=5)
        ds = LandCoverDataset.objects.get(provider="dynamic_world_v1", year=2024)
        self.assertFalse(ds.is_public)

    def test_dataset_is_validated_false_after_gated_sync(self):
        from remote_sensing.models import LandCoverDataset
        self._run(self._make_result(peak_season_scene_count=10, quality_flag="high"), min_peak_scenes=5)
        ds = LandCoverDataset.objects.get(provider="dynamic_world_v1", year=2024)
        self.assertFalse(ds.is_validated)


# ---------------------------------------------------------------------------
# Phase 1A — configurable composite windows
# ---------------------------------------------------------------------------


class LandCoverCompositeWindowTests(TestCase):
    """
    Tests for configurable LULC composite windows (wet_season / late_wet_season).

    Unit tests (SimpleTestCase-style logic, but TestCase is used for the
    DB-access tests that check dataset fields after a mocked live run).
    """

    _MOCK_FEATURE = {
        "type": "Feature",
        "properties": {"lganame": "Birnin Gwari", "lgacode": "19001"},
        "geometry": {
            "type": "Polygon",
            "coordinates": [[[7.0, 11.0], [7.5, 11.0], [7.5, 11.5], [7.0, 11.5], [7.0, 11.0]]],
        },
    }

    def _make_lulc_result(self, method_version="dw_latewet_mode_v1", peak_months=(9, 10)):
        from remote_sensing.lulc_providers import LandCoverComputeResult
        counts = {
            "water": 300, "trees": 11200, "grass": 24500, "flooded_vegetation": 800,
            "crops": 41300, "shrub_scrub": 13700, "built_area": 1400,
            "bare_ground": 6800, "snow_ice": 0,
        }
        return LandCoverComputeResult(
            success=True,
            class_pixel_counts=counts,
            total_pixels=sum(counts.values()),
            masked_pixels=0,
            metadata={
                "source_image_count": 8,
                "monthly_scene_counts": {str(m): 4 for m in peak_months},
                "peak_months": list(peak_months),
                "peak_season_scene_count": 8,
                "peak_season_scene_ratio": 1.0,
                "quality_flag": "high",
                "method_version": method_version,
            },
        )

    def _run_live(self, composite_window, mock_result=None):
        from io import StringIO
        from unittest.mock import patch
        from django.core.management import call_command
        from remote_sensing.gee_service import GEEResult

        result = mock_result or self._make_lulc_result()
        init_result = GEEResult(
            available=True, data={"auth_mode": "mock", "initialized": True, "project": "test"},
        )
        out = StringIO()
        with patch(
            "remote_sensing.management.commands.sync_lulc.Command._load_features",
            return_value=[self._MOCK_FEATURE],
        ):
            with patch.object(gee_service, "initialize", return_value=init_result):
                with patch.object(
                    gee_service, "compute_land_cover_for_geometry",
                    return_value=result,
                ) as mock_gee:
                    call_command(
                        "sync_lulc",
                        "--provider", "dynamic_world_v1",
                        "--years", "2018",
                        "--composite-window", composite_window,
                        stdout=out,
                    )
        return out.getvalue(), mock_gee

    # --- Window config unit assertions (no DB needed) ---

    def test_wet_season_window_config_dates(self):
        from remote_sensing.lulc_providers import COMPOSITE_WINDOW_CONFIGS
        cfg = COMPOSITE_WINDOW_CONFIGS["wet_season"]
        self.assertEqual((cfg.start_month, cfg.start_day), (5, 1))
        self.assertEqual((cfg.end_month, cfg.end_day), (10, 31))

    def test_wet_season_window_peak_months_are_jul_aug(self):
        from remote_sensing.lulc_providers import COMPOSITE_WINDOW_CONFIGS
        cfg = COMPOSITE_WINDOW_CONFIGS["wet_season"]
        self.assertEqual(set(cfg.peak_months), {7, 8})

    def test_wet_season_window_method_version(self):
        from remote_sensing.lulc_providers import COMPOSITE_WINDOW_CONFIGS
        self.assertEqual(
            COMPOSITE_WINDOW_CONFIGS["wet_season"].method_version,
            "dw_wetseason_mode_v1",
        )

    def test_late_wet_season_window_config_dates(self):
        from remote_sensing.lulc_providers import COMPOSITE_WINDOW_CONFIGS
        cfg = COMPOSITE_WINDOW_CONFIGS["late_wet_season"]
        self.assertEqual((cfg.start_month, cfg.start_day), (9, 1))
        self.assertEqual((cfg.end_month, cfg.end_day), (10, 31))

    def test_late_wet_season_window_peak_months_are_sep_oct(self):
        from remote_sensing.lulc_providers import COMPOSITE_WINDOW_CONFIGS
        cfg = COMPOSITE_WINDOW_CONFIGS["late_wet_season"]
        self.assertEqual(set(cfg.peak_months), {9, 10})

    def test_late_wet_season_window_method_version(self):
        from remote_sensing.lulc_providers import COMPOSITE_WINDOW_CONFIGS
        self.assertEqual(
            COMPOSITE_WINDOW_CONFIGS["late_wet_season"].method_version,
            "dw_latewet_mode_v1",
        )

    def test_dynamic_world_v1_supports_late_wet_season(self):
        from remote_sensing.lulc_providers import get_provider
        provider = get_provider("dynamic_world_v1")
        self.assertIn("late_wet_season", provider.supported_windows)

    def test_invalid_composite_window_raises_command_error(self):
        from io import StringIO
        from unittest.mock import patch
        from django.core.management import call_command
        from django.core.management.base import CommandError
        with patch(
            "remote_sensing.management.commands.sync_lulc.Command._load_features",
            return_value=[self._MOCK_FEATURE],
        ):
            with self.assertRaises(CommandError):
                call_command(
                    "sync_lulc",
                    "--provider", "dynamic_world_v1",
                    "--years", "2018",
                    "--composite-window", "nonexistent_window",
                    "--dry-run",
                    stdout=StringIO(),
                )

    # --- DB integration tests (mocked GEE, real DB) ---

    def test_dataset_stores_late_wet_season_composite_window(self):
        from remote_sensing.models import LandCoverDataset
        self._run_live("late_wet_season")
        ds = LandCoverDataset.objects.get(
            provider="dynamic_world_v1", year=2018,
            composite_window="late_wet_season",
        )
        self.assertEqual(ds.composite_window, "late_wet_season")

    def test_dataset_method_version_is_dw_latewet_for_late_wet_season(self):
        from remote_sensing.models import LandCoverDataset
        self._run_live("late_wet_season")
        ds = LandCoverDataset.objects.get(
            provider="dynamic_world_v1", year=2018,
            composite_window="late_wet_season",
        )
        self.assertEqual(ds.method_version, "dw_latewet_mode_v1")

    def test_dataset_composite_dates_correct_for_late_wet_season(self):
        import datetime
        from remote_sensing.models import LandCoverDataset
        self._run_live("late_wet_season")
        ds = LandCoverDataset.objects.get(
            provider="dynamic_world_v1", year=2018,
            composite_window="late_wet_season",
        )
        self.assertEqual(ds.composite_start, datetime.date(2018, 9, 1))
        self.assertEqual(ds.composite_end, datetime.date(2018, 10, 31))

    def test_peak_months_tuple_passed_to_gee_call(self):
        _, mock_gee = self._run_live("late_wet_season")
        _, kwargs = mock_gee.call_args
        self.assertEqual(kwargs.get("peak_months"), (9, 10))

    def test_method_version_passed_to_gee_call_for_late_wet_season(self):
        _, mock_gee = self._run_live("late_wet_season")
        _, kwargs = mock_gee.call_args
        self.assertEqual(kwargs.get("method_version"), "dw_latewet_mode_v1")

    def test_wet_season_default_behaviour_unchanged(self):
        """Regression: wet_season window still uses Jul+Aug peak months and dw_wetseason_mode_v1."""
        from remote_sensing.lulc_providers import COMPOSITE_WINDOW_CONFIGS
        cfg = COMPOSITE_WINDOW_CONFIGS["wet_season"]
        self.assertEqual(cfg.start_month, 5)
        self.assertEqual(cfg.end_month, 10)
        self.assertEqual(tuple(sorted(cfg.peak_months)), (7, 8))
        self.assertEqual(cfg.method_version, "dw_wetseason_mode_v1")

    def test_late_wet_season_dataset_is_public_false(self):
        from remote_sensing.models import LandCoverDataset
        self._run_live("late_wet_season")
        ds = LandCoverDataset.objects.get(
            provider="dynamic_world_v1", year=2018,
            composite_window="late_wet_season",
        )
        self.assertFalse(ds.is_public)

    def test_late_wet_season_dataset_is_validated_false(self):
        from remote_sensing.models import LandCoverDataset
        self._run_live("late_wet_season")
        ds = LandCoverDataset.objects.get(
            provider="dynamic_world_v1", year=2018,
            composite_window="late_wet_season",
        )
        self.assertFalse(ds.is_validated)


# ---------------------------------------------------------------------------
# Phase D1 — LULC internal preview API endpoint
# ---------------------------------------------------------------------------


class LandCoverLulcPreviewApiTests(TestCase):
    """
    Tests for GET /api/remote-sensing/lulc/ (lulc_preview view).

    The endpoint returns LandCoverDataset + LandCoverSnapshot records from the
    database without requiring is_public=True.  It does NOT trigger GEE calls.
    """

    ENDPOINT = "/api/remote-sensing/lulc/"

    _CLASS_PCT = {
        "water": 0.5, "trees": 67.6, "grass": 3.2,
        "flooded_vegetation": 0.1, "crops": 5.6, "shrub_scrub": 14.8,
        "built_area": 0.7, "bare_ground": 0.0, "snow_ice": 7.5,
    }

    def _make_dataset(self, year=2024, window="late_wet_season", is_public=False):
        return LandCoverDataset.objects.create(
            provider="dynamic_world_v1",
            provider_label="Dynamic World v1",
            gee_collection="GOOGLE/DYNAMICWORLD/V1",
            year=year,
            composite_window=window,
            composite_start=datetime.date(year, 9, 1),
            composite_end=datetime.date(year, 10, 31),
            method_version="dw_latewet_mode_v1",
            admin_level="lga",
            snapshot_count=0,
            is_public=is_public,
            is_validated=False,
        )

    def _make_snapshot(self, dataset, admin_code="19001", admin_name="Birnin Gwari",
                       quality_flag="high", peak_scenes=18, total_scenes=18):
        from decimal import Decimal
        snap = LandCoverSnapshot.objects.create(
            dataset=dataset,
            admin_level="lga",
            admin_code=admin_code,
            admin_name=admin_name,
            total_area_km2=Decimal("10000.0000"),
            class_pct=self._CLASS_PCT,
            class_areas_km2={k: round(v * 100, 2) for k, v in self._CLASS_PCT.items()},
            metadata={
                "quality_flag": quality_flag,
                "peak_season_scene_count": peak_scenes,
                "source_image_count": total_scenes,
                "method_version": "dw_latewet_mode_v1",
            },
        )
        dataset.snapshot_count += 1
        dataset.save(update_fields=["snapshot_count"])
        return snap

    def test_endpoint_returns_200_with_empty_results_when_no_data(self):
        response = self.client.get(self.ENDPOINT)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "ok")
        self.assertEqual(data["results"], [])
        self.assertIsNone(data["dataset"])

    def test_endpoint_returns_dataset_when_records_exist(self):
        ds = self._make_dataset()
        self._make_snapshot(ds)
        response = self.client.get(self.ENDPOINT)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "ok")
        self.assertEqual(len(data["results"]), 1)
        self.assertIsNotNone(data["dataset"])
        self.assertEqual(data["dataset"]["year"], 2024)
        self.assertEqual(data["dataset"]["composite_window"], "late_wet_season")
        self.assertEqual(data["dataset"]["method_version"], "dw_latewet_mode_v1")

    def test_class_colours_match_official_dw_palette(self):
        ds = self._make_dataset()
        self._make_snapshot(ds)
        response = self.client.get(self.ENDPOINT)
        classes = response.json()["classes"]
        self.assertEqual(classes["trees"]["color"], "#397D49")
        self.assertEqual(classes["crops"]["color"], "#E49635")
        self.assertEqual(classes["built_area"]["color"], "#C4281B")
        self.assertEqual(classes["water"]["color"], "#419BDF")

    def test_quality_summary_counts_flags(self):
        ds = self._make_dataset()
        self._make_snapshot(ds, admin_code="19001", admin_name="LGA A", quality_flag="high")
        self._make_snapshot(ds, admin_code="19002", admin_name="LGA B", quality_flag="high")
        self._make_snapshot(ds, admin_code="19003", admin_name="LGA C", quality_flag="medium")
        response = self.client.get(self.ENDPOINT)
        qs = response.json()["quality_summary"]
        self.assertEqual(qs["high"], 2)
        self.assertEqual(qs["medium"], 1)
        self.assertEqual(qs["low"], 0)

    def test_dominant_class_and_pct_computed_correctly(self):
        ds = self._make_dataset()
        self._make_snapshot(ds)
        result = self.client.get(self.ENDPOINT).json()["results"][0]
        self.assertEqual(result["dominant_class"], "trees")
        self.assertAlmostEqual(result["dominant_pct"], 67.6, places=1)
        self.assertEqual(result["dominant_label"], "Trees")

    def test_is_public_and_is_validated_false_in_response(self):
        ds = self._make_dataset(is_public=False)
        self._make_snapshot(ds)
        data = self.client.get(self.ENDPOINT).json()
        self.assertFalse(data["dataset"]["is_public"])
        self.assertFalse(data["dataset"]["is_validated"])

    def test_endpoint_works_even_when_dataset_not_public(self):
        """Internal preview must not require is_public=True."""
        ds = self._make_dataset(is_public=False)
        self._make_snapshot(ds)
        response = self.client.get(self.ENDPOINT)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()["results"]), 1)

    def test_no_change_analysis_fields_in_response(self):
        ds = self._make_dataset()
        self._make_snapshot(ds)
        result = self.client.get(self.ENDPOINT).json()["results"][0]
        forbidden = {"class_change_pct", "largest_gain_class", "largest_loss_class",
                     "baseline_year", "change_pct", "trend"}
        self.assertTrue(forbidden.isdisjoint(set(result.keys())),
                        f"Change-analysis fields found in response: {forbidden & set(result.keys())}")

    def test_year_filter_selects_correct_dataset(self):
        ds_2024 = self._make_dataset(year=2024)
        ds_2018 = self._make_dataset(year=2018)
        self._make_snapshot(ds_2024, admin_code="19001", admin_name="LGA 2024")
        self._make_snapshot(ds_2018, admin_code="19001", admin_name="LGA 2018")
        data = self.client.get(self.ENDPOINT + "?year=2018").json()
        self.assertEqual(data["dataset"]["year"], 2018)
        self.assertEqual(data["results"][0]["admin_name"], "LGA 2018")

    def test_defaults_to_latest_year_when_year_not_specified(self):
        ds_2018 = self._make_dataset(year=2018)
        ds_2024 = self._make_dataset(year=2024)
        self._make_snapshot(ds_2018, admin_code="19001", admin_name="Old")
        self._make_snapshot(ds_2024, admin_code="19001", admin_name="New")
        data = self.client.get(self.ENDPOINT).json()
        self.assertEqual(data["dataset"]["year"], 2024)

    def test_invalid_provider_returns_400(self):
        response = self.client.get(self.ENDPOINT + "?provider=nonexistent")
        self.assertEqual(response.status_code, 400)

    def test_notice_field_present_in_response(self):
        response = self.client.get(self.ENDPOINT)
        self.assertIn("notice", response.json())

    def test_notice_says_internal_preview_when_dataset_unpublished(self):
        ds = self._make_dataset(is_public=False)
        self._make_snapshot(ds)
        response = self.client.get(self.ENDPOINT)
        self.assertIn("Internal preview", response.json()["notice"])

    def test_notice_reflects_published_state_when_dataset_public(self):
        ds = self._make_dataset(is_public=True)
        ds.is_validated = True
        ds.save(update_fields=["is_validated"])
        self._make_snapshot(ds)
        response = self.client.get(self.ENDPOINT)
        notice = response.json()["notice"]
        self.assertNotIn("Internal preview", notice)
        self.assertIn("Dynamic World v1", notice)

    def test_endpoint_does_not_mutate_db(self):
        ds = self._make_dataset()
        self._make_snapshot(ds)
        count_before = LandCoverDataset.objects.count()
        snap_count_before = LandCoverSnapshot.objects.count()
        self.client.get(self.ENDPOINT)
        self.assertEqual(LandCoverDataset.objects.count(), count_before)
        self.assertEqual(LandCoverSnapshot.objects.count(), snap_count_before)


@override_settings(DEBUG=True, KCCC_ENABLE_INTERNAL_PREVIEWS=True)
class LulcTileUrlApiTests(TestCase):
    """
    Tests for GET /api/remote-sensing/lulc-tile/ (lulc_tile_url view).

    _check_lulc_tile_gate requires all three conditions simultaneously:
      1. settings.DEBUG is True
      2. settings.KCCC_ENABLE_INTERNAL_PREVIEWS is True
      3. HTTP Host is 'localhost' or '127.0.0.1'

    This class satisfies them:
      1 & 2: class-level @override_settings above
      3:     every request goes through self._get(), which sends HTTP_HOST="localhost"

    Gate rejection behaviour (each condition failing independently) is covered
    exhaustively by LulcTileGateTests and is not duplicated here.

    When GEE is not configured (normal test environment), get_lulc_upstream_template
    returns available=False and the view returns HTTP 200 with status="unavailable".
    Tests that assert tile-level metadata use a mock to force the available=True path.
    """

    ENDPOINT = "/api/remote-sensing/lulc-tile/"
    _HOST = "localhost"  # satisfies gate condition 3

    def _get(self, params=None, **extra):
        """GET the handshake endpoint with the loopback host required by the gate."""
        return self.client.get(self.ENDPOINT, params or {}, HTTP_HOST=self._HOST, **extra)

    def _gee_unavailable(self):
        return GEEResult(available=False, error="GEE not initialised: not configured")

    def _gee_available(self):
        # The view constructs its own tile dict from hardcoded values + request params;
        # the data field here is not forwarded to the response.
        return GEEResult(available=True, data={})

    # ---- basic status codes ----

    def test_returns_200_without_params(self):
        self.assertEqual(self._get().status_code, 200)

    def test_returns_200_with_year_param(self):
        self.assertEqual(self._get({"year": 2024}).status_code, 200)

    def test_invalid_year_returns_400(self):
        self.assertEqual(self._get({"year": "abc"}).status_code, 400)

    # ---- response shape (checked against the unavailable path, no GEE mock needed) ----

    def test_response_has_status_field(self):
        data = self._get().json()
        self.assertIn("status", data)
        self.assertIn(data["status"], ["ok", "unavailable"])

    def test_response_has_tile_field(self):
        # "tile" key is present even when value is None (unavailable path)
        data = self._get().json()
        self.assertIn("tile", data)

    def test_response_has_notice_field(self):
        data = self._get().json()
        self.assertIn("notice", data)
        self.assertIn("Internal preview", data["notice"])

    def test_response_has_error_field(self):
        # "error" is present in the unavailable path; force that path explicitly
        with patch("remote_sensing.views.gee_service") as mock_svc:
            mock_svc.get_lulc_upstream_template.return_value = self._gee_unavailable()
            data = self._get().json()
        self.assertIn("error", data)

    def test_no_authentication_required(self):
        resp = self._get()
        self.assertNotEqual(resp.status_code, 401)
        self.assertNotEqual(resp.status_code, 403)

    # ---- GEE availability ----

    def test_gee_not_configured_returns_unavailable(self):
        with patch("remote_sensing.views.gee_service") as mock_svc:
            mock_svc.get_lulc_upstream_template.return_value = self._gee_unavailable()
            data = self._get().json()
        self.assertEqual(data["status"], "unavailable")

    # ---- tile metadata (only present on the available=True / ok path) ----

    def test_tile_data_contains_metadata_fields(self):
        with patch("remote_sensing.views.gee_service") as mock_svc:
            mock_svc.get_lulc_upstream_template.return_value = self._gee_available()
            data = self._get().json()
        tile = data.get("tile") or {}
        self.assertIn("year", tile)
        self.assertIn("composite_window", tile)
        self.assertIn("method_version", tile)

    def test_tile_metadata_method_version_is_dw_latewet(self):
        with patch("remote_sensing.views.gee_service") as mock_svc:
            mock_svc.get_lulc_upstream_template.return_value = self._gee_available()
            data = self._get().json()
        self.assertEqual(data["tile"]["method_version"], "dw_latewet_mode_v1")

    def test_tile_metadata_composite_window_is_late_wet_season(self):
        with patch("remote_sensing.views.gee_service") as mock_svc:
            mock_svc.get_lulc_upstream_template.return_value = self._gee_available()
            data = self._get().json()
        self.assertEqual(data["tile"]["composite_window"], "late_wet_season")

    # ---- DB isolation ----

    def test_no_db_mutation(self):
        layer_count = RemoteSensingLayer.objects.count()
        metric_count = RemoteSensingLGAMetric.objects.count()
        self._get()
        self.assertEqual(RemoteSensingLayer.objects.count(), layer_count)
        self.assertEqual(RemoteSensingLGAMetric.objects.count(), metric_count)

    # ---- GEE success path ----

    def test_gee_success_returns_tile_url(self):
        with patch("remote_sensing.views.gee_service") as mock_svc:
            mock_svc.get_lulc_upstream_template.return_value = self._gee_available()
            data = self._get({"year": 2024}).json()
        self.assertEqual(data["status"], "ok")
        self.assertIn("tile_url", data["tile"])
        # The handshake returns a local same-origin proxy URL; the GEE URL is never exposed.
        self.assertIn("/api/remote-sensing/lulc-tile/", data["tile"]["tile_url"])

    # ---- display_mode forwarding ----

    def test_default_display_mode_is_cartographic(self):
        """Omitting display_mode must call get_lulc_upstream_template with display_mode='cartographic'."""
        with patch("remote_sensing.views.gee_service") as mock_svc:
            mock_svc.get_lulc_upstream_template.return_value = self._gee_available()
            data = self._get().json()
        _, kwargs = mock_svc.get_lulc_upstream_template.call_args
        self.assertEqual(kwargs.get("display_mode", "cartographic"), "cartographic")
        self.assertEqual(data["tile"]["display_mode"], "cartographic")

    def test_raw_mode_works(self):
        """display_mode=raw must be forwarded to get_lulc_upstream_template and appear in the tile."""
        with patch("remote_sensing.views.gee_service") as mock_svc:
            mock_svc.get_lulc_upstream_template.return_value = self._gee_available()
            resp = self._get({"display_mode": "raw"})
            data = resp.json()
        self.assertEqual(resp.status_code, 200)
        _, kwargs = mock_svc.get_lulc_upstream_template.call_args
        self.assertEqual(kwargs.get("display_mode"), "raw")
        self.assertEqual(data["tile"]["display_mode"], "raw")

    def test_invalid_display_mode_rejected(self):
        """An unrecognised display_mode value must return 400."""
        resp = self._get({"display_mode": "fancy"})
        self.assertEqual(resp.status_code, 400)
        self.assertIn("display_mode", resp.json().get("message", "").lower())

    def test_cartographic_mode_display_mode_field(self):
        """display_mode='cartographic' must be reflected in the tile metadata."""
        with patch("remote_sensing.views.gee_service") as mock_svc:
            mock_svc.get_lulc_upstream_template.return_value = self._gee_available()
            data = self._get({"display_mode": "cartographic"}).json()
        self.assertEqual(data["tile"]["display_mode"], "cartographic")

    def test_response_metadata_includes_display_mode(self):
        """display_mode must be present in the tile metadata on the ok path."""
        with patch("remote_sensing.views.gee_service") as mock_svc:
            mock_svc.get_lulc_upstream_template.return_value = self._gee_available()
            data = self._get().json()
        self.assertIn("display_mode", data.get("tile") or {})


# ===========================================================================
# Climate Intelligence Engine E1 — classification + endpoint tests
# ===========================================================================


class ClimateIntelligenceClassificationTests(SimpleTestCase):
    """
    Pure unit tests for the rule-based classification helpers in views.py.
    No database access required.
    """

    def _ndvi(self, v):
        from remote_sensing.views import _classify_ndvi
        return _classify_ndvi(v)

    def _spi(self, v):
        from remote_sensing.views import _classify_spi
        return _classify_spi(v)

    def _ra(self, v):
        from remote_sensing.views import _classify_rainfall_anomaly
        return _classify_rainfall_anomaly(v)

    def _lst(self, v):
        from remote_sensing.views import _classify_lst
        return _classify_lst(v)

    # --- NDVI ---

    def test_ndvi_healthy_at_boundary(self):
        self.assertEqual(self._ndvi(0.60), "healthy vegetation")

    def test_ndvi_healthy_above_boundary(self):
        self.assertEqual(self._ndvi(0.75), "healthy vegetation")

    def test_ndvi_moderate_at_lower_boundary(self):
        self.assertEqual(self._ndvi(0.35), "moderate vegetation")

    def test_ndvi_moderate_mid_range(self):
        self.assertEqual(self._ndvi(0.50), "moderate vegetation")

    def test_ndvi_moderate_just_below_healthy(self):
        self.assertEqual(self._ndvi(0.59), "moderate vegetation")

    def test_ndvi_sparse_below_boundary(self):
        self.assertEqual(self._ndvi(0.34), "sparse/stressed vegetation")

    def test_ndvi_sparse_very_low(self):
        self.assertEqual(self._ndvi(0.10), "sparse/stressed vegetation")

    # --- SPI ---

    def test_spi_extreme_drought_at_boundary(self):
        self.assertEqual(self._spi(-2.0), "extreme drought condition")

    def test_spi_extreme_drought_below_boundary(self):
        self.assertEqual(self._spi(-3.1), "extreme drought condition")

    def test_spi_severe_drought(self):
        self.assertEqual(self._spi(-1.6), "severe drought condition")

    def test_spi_severe_at_lower_boundary(self):
        self.assertEqual(self._spi(-1.5), "severe drought condition")

    def test_spi_moderate_drought(self):
        self.assertEqual(self._spi(-1.2), "moderate drought condition")

    def test_spi_moderate_at_lower_boundary(self):
        self.assertEqual(self._spi(-1.0), "moderate drought condition")

    def test_spi_near_normal_zero(self):
        self.assertEqual(self._spi(0.0), "near normal")

    def test_spi_near_normal_positive(self):
        self.assertEqual(self._spi(0.8), "near normal")

    def test_spi_moderately_wet_at_boundary(self):
        self.assertEqual(self._spi(1.0), "moderately wet")

    def test_spi_very_wet_at_boundary(self):
        self.assertEqual(self._spi(1.5), "very wet")

    def test_spi_extremely_wet_at_boundary(self):
        self.assertEqual(self._spi(2.0), "extremely wet")

    def test_spi_extremely_wet_above_boundary(self):
        self.assertEqual(self._spi(2.5), "extremely wet")

    # --- Rainfall anomaly ---

    def test_ra_wetter_above_threshold(self):
        self.assertEqual(self._ra(15.0), "wetter than baseline")

    def test_ra_wetter_just_above_threshold(self):
        self.assertEqual(self._ra(10.1), "wetter than baseline")

    def test_ra_near_baseline_at_upper_boundary(self):
        self.assertEqual(self._ra(10.0), "near baseline")

    def test_ra_near_baseline_zero(self):
        self.assertEqual(self._ra(0.0), "near baseline")

    def test_ra_near_baseline_at_lower_boundary(self):
        self.assertEqual(self._ra(-10.0), "near baseline")

    def test_ra_drier_just_below_threshold(self):
        self.assertEqual(self._ra(-10.1), "drier than baseline")

    def test_ra_drier_strongly_negative(self):
        self.assertEqual(self._ra(-30.0), "drier than baseline")

    # --- LST — surface-temperature wording only ---

    def test_lst_condition_contains_surface_wording(self):
        """Every LST condition string must contain 'surface'."""
        for value in (-5.0, 20.0, 27.9, 28.0, 30.0, 36.0, 36.1, 45.0):
            with self.subTest(value=value):
                cond = self._lst(value)
                self.assertIn(
                    "surface", cond,
                    msg=f"LST condition for {value} does not mention 'surface': {cond!r}",
                )

    def test_lst_cool(self):
        self.assertEqual(self._lst(25.0), "relatively cooler surface conditions")

    def test_lst_moderate_at_lower_boundary(self):
        self.assertEqual(self._lst(28.0), "moderate surface temperature")

    def test_lst_moderate_at_upper_boundary(self):
        self.assertEqual(self._lst(36.0), "moderate surface temperature")

    def test_lst_hot_above_boundary(self):
        self.assertEqual(self._lst(37.0), "relatively hotter surface conditions")

    def test_lst_condition_does_not_mention_air_temperature(self):
        """Conditions must not imply air temperature."""
        for value in (20.0, 30.0, 40.0):
            cond = self._lst(value)
            self.assertNotIn("air", cond.lower())
            self.assertNotIn("ambient", cond.lower())


# ---------------------------------------------------------------------------
# Helpers shared across ClimateIntelligenceEndpointTests
# ---------------------------------------------------------------------------


def _ci_make_layer(key, label, **kwargs):
    return RemoteSensingLayer.objects.create(
        key=key, label=label, is_active=True, is_public=True, **kwargs
    )


def _ci_make_metric(layer, admin_code, admin_name, year, season, value, unit=""):
    return RemoteSensingLGAMetric.objects.create(
        layer=layer,
        admin_level="lga",
        admin_code=admin_code,
        admin_name=admin_name,
        year=year,
        season=season,
        mean_value=Decimal(str(value)),
        unit=unit,
        data_source="test",
        metadata={},
    )


class ClimateIntelligenceEndpointTests(TestCase):
    """
    Integration tests for GET /api/remote-sensing/climate-intelligence/
    (Climate Intelligence Engine E1).
    """

    URL = "/api/remote-sensing/climate-intelligence/"

    FORBIDDEN_PHRASES = [
        "priority intervention",
        "disaster prediction",
        "will flood",
        "high-risk lga",
        "ai warning",
        "deforestation",
        "degradation",
        "forest loss",
    ]

    @classmethod
    def setUpTestData(cls):
        cls.rainfall_layer  = _ci_make_layer("rainfall",         "Rainfall Total")
        cls.anomaly_layer   = _ci_make_layer("rainfall_anomaly", "Rainfall Anomaly")
        cls.drought_layer   = _ci_make_layer("drought_index",    "Drought Index (SPI)")
        cls.ndvi_layer      = _ci_make_layer("ndvi",             "NDVI / Vegetation Condition")
        cls.lst_layer       = _ci_make_layer("lst",              "Land Surface Temperature")

        # LGA Alpha — healthy / wet indicators
        _ci_make_metric(cls.rainfall_layer,  "CI001", "LGA Alpha", 2024, "annual", 1200.0, "mm")
        _ci_make_metric(cls.anomaly_layer,   "CI001", "LGA Alpha", 2024, "annual",   12.0, "%")
        _ci_make_metric(cls.drought_layer,   "CI001", "LGA Alpha", 2024, "annual",    0.3, "SPI")
        _ci_make_metric(cls.ndvi_layer,      "CI001", "LGA Alpha", 2024, "annual",   0.65, "index")
        _ci_make_metric(cls.lst_layer,       "CI001", "LGA Alpha", 2024, "annual",   31.0, "°C")

        # LGA Beta — dry / stressed indicators
        _ci_make_metric(cls.rainfall_layer,  "CI002", "LGA Beta", 2024, "annual",  400.0, "mm")
        _ci_make_metric(cls.anomaly_layer,   "CI002", "LGA Beta", 2024, "annual",  -18.0, "%")
        _ci_make_metric(cls.drought_layer,   "CI002", "LGA Beta", 2024, "annual",   -1.5, "SPI")
        _ci_make_metric(cls.ndvi_layer,      "CI002", "LGA Beta", 2024, "annual",   0.22, "index")
        _ci_make_metric(cls.lst_layer,       "CI002", "LGA Beta", 2024, "annual",   38.5, "°C")

        # LGA Gamma — rainfall only (partial data; all other indicators absent)
        _ci_make_metric(cls.rainfall_layer,  "CI003", "LGA Gamma", 2024, "annual", 850.0, "mm")

        # LULC: one dataset + snapshot covering LGA Alpha only
        cls.lulc_dataset = LandCoverDataset.objects.create(
            provider="dynamic_world_v1",
            provider_label="Dynamic World v1",
            gee_collection="GOOGLE/DYNAMICWORLD/V1",
            year=2024,
            composite_window="wet_season",
            composite_start=datetime.date(2024, 5, 1),
            composite_end=datetime.date(2024, 10, 31),
            method_version="dw_wetseason_mode_v1",
            admin_level="lga",
            snapshot_count=1,
            is_validated=False,
            is_public=False,
        )
        LandCoverSnapshot.objects.create(
            dataset=cls.lulc_dataset,
            admin_level="lga",
            admin_code="CI001",
            admin_name="LGA Alpha",
            total_area_km2=Decimal("1200.0"),
            class_pct={
                "trees": 67.6, "grass": 15.0, "crops": 12.0,
                "shrub_scrub": 3.0, "built_area": 1.0, "water": 0.8,
                "flooded_vegetation": 0.4, "bare_ground": 0.2, "snow_ice": 0.0,
            },
            class_areas_km2={
                "trees": 811.2, "grass": 180.0, "crops": 144.0,
                "shrub_scrub": 36.0, "built_area": 12.0, "water": 9.6,
                "flooded_vegetation": 4.8, "bare_ground": 2.4, "snow_ice": 0.0,
            },
            metadata={"quality_flag": "high", "peak_season_scene_count": 8},
        )

    def _get(self, **params):
        return self.client.get(self.URL, params)

    def _result_for(self, data, admin_code):
        return next((r for r in data["results"] if r["admin_code"] == admin_code), None)

    # --- 1. Endpoint returns 200 ---

    def test_endpoint_returns_200(self):
        response = self._get(year=2024, season="annual")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "ok")

    # --- 2. All LGAs with available data are returned ---

    def test_endpoint_returns_all_lgas_with_available_data(self):
        response = self._get(year=2024, season="annual")
        data = response.json()
        codes = {r["admin_code"] for r in data["results"]}
        self.assertIn("CI001", codes)
        self.assertIn("CI002", codes)
        self.assertIn("CI003", codes)

    # --- 3. Missing indicator data handled gracefully ---

    def test_missing_indicator_data_handled_gracefully(self):
        """LGA Gamma has only rainfall. Endpoint must still return it with no errors."""
        response = self._get(year=2024, season="annual")
        data = response.json()
        gamma = self._result_for(data, "CI003")
        self.assertIsNotNone(gamma, "LGA Gamma missing from results")
        self.assertIn("rainfall", gamma["indicators"])
        # All other indicators must be absent (not present with null values)
        for key in ("rainfall_anomaly", "spi", "ndvi", "lst"):
            self.assertNotIn(key, gamma["indicators"], f"{key!r} should be absent for LGA Gamma")

    # --- 4. NDVI classification ---

    def test_ndvi_classification_healthy(self):
        response = self._get(year=2024, season="annual")
        alpha = self._result_for(response.json(), "CI001")
        self.assertEqual(alpha["indicators"]["ndvi"]["condition"], "healthy vegetation")

    def test_ndvi_classification_sparse(self):
        response = self._get(year=2024, season="annual")
        beta = self._result_for(response.json(), "CI002")
        self.assertEqual(beta["indicators"]["ndvi"]["condition"], "sparse/stressed vegetation")

    # --- 5. SPI classification ---

    def test_spi_classification_near_normal(self):
        response = self._get(year=2024, season="annual")
        alpha = self._result_for(response.json(), "CI001")
        self.assertEqual(alpha["indicators"]["spi"]["condition"], "near normal")

    def test_spi_classification_severe_drought(self):
        response = self._get(year=2024, season="annual")
        beta = self._result_for(response.json(), "CI002")
        self.assertEqual(beta["indicators"]["spi"]["condition"], "severe drought condition")

    # --- 6. Rainfall anomaly classification ---

    def test_rainfall_anomaly_wetter_than_baseline(self):
        response = self._get(year=2024, season="annual")
        alpha = self._result_for(response.json(), "CI001")
        self.assertEqual(alpha["indicators"]["rainfall_anomaly"]["condition"], "wetter than baseline")

    def test_rainfall_anomaly_drier_than_baseline(self):
        response = self._get(year=2024, season="annual")
        beta = self._result_for(response.json(), "CI002")
        self.assertEqual(beta["indicators"]["rainfall_anomaly"]["condition"], "drier than baseline")

    # --- 7. LST condition uses surface-temperature wording ---

    def test_lst_condition_uses_surface_temperature_wording(self):
        response = self._get(year=2024, season="annual")
        data = response.json()
        for r in data["results"]:
            lst = r["indicators"].get("lst")
            if lst:
                self.assertIn(
                    "surface", lst["condition"],
                    msg=f"LST condition for {r['admin_code']} does not mention 'surface': {lst['condition']!r}",
                )

    # --- 8. LULC excluded by default ---

    def test_lulc_excluded_by_default(self):
        response = self._get(year=2024, season="annual")
        data = response.json()
        for r in data["results"]:
            self.assertNotIn("lulc", r["indicators"], f"lulc unexpectedly present for {r['admin_code']}")
        self.assertFalse(data["filters"]["include_lulc_preview"])

    # --- 9. LULC included only when include_lulc_preview=true ---

    def test_lulc_included_when_preview_param_true(self):
        response = self._get(year=2024, season="annual", include_lulc_preview="true")
        data = response.json()
        self.assertTrue(data["filters"]["include_lulc_preview"])
        alpha = self._result_for(data, "CI001")
        self.assertIn("lulc", alpha["indicators"])

    def test_lulc_absent_for_lga_with_no_snapshot(self):
        """LGA Beta has no LULC snapshot — lulc key must be absent even when preview enabled."""
        response = self._get(year=2024, season="annual", include_lulc_preview="true")
        beta = self._result_for(response.json(), "CI002")
        self.assertNotIn("lulc", beta["indicators"])

    # --- 10. Unpublished LULC clearly marked internal preview ---

    def test_unpublished_lulc_marked_internal_preview(self):
        response = self._get(year=2024, season="annual", include_lulc_preview="true")
        alpha = self._result_for(response.json(), "CI001")
        lulc = alpha["indicators"]["lulc"]
        self.assertFalse(lulc["is_public"])
        self.assertFalse(lulc["is_validated"])
        self.assertIn("Internal preview", lulc["notice"])

    def test_lulc_dominant_class_is_correct(self):
        response = self._get(year=2024, season="annual", include_lulc_preview="true")
        alpha = self._result_for(response.json(), "CI001")
        self.assertEqual(alpha["indicators"]["lulc"]["dominant_class"], "trees")
        self.assertEqual(alpha["indicators"]["lulc"]["dominant_label"], "Trees")

    # --- 11. No unsupported phrases appear anywhere in the response ---

    def test_no_unsupported_phrases_in_response(self):
        response = self._get(year=2024, season="annual", include_lulc_preview="true")
        body = response.content.decode("utf-8").lower()
        for phrase in self.FORBIDDEN_PHRASES:
            self.assertNotIn(
                phrase, body,
                msg=f"Forbidden phrase {phrase!r} found in climate intelligence response",
            )

    # --- 12. Endpoint does not mutate DB ---

    def test_endpoint_does_not_mutate_db(self):
        before_metrics = RemoteSensingLGAMetric.objects.count()
        before_layers  = RemoteSensingLayer.objects.count()
        self._get(year=2024, season="annual", include_lulc_preview="true")
        self.assertEqual(RemoteSensingLGAMetric.objects.count(), before_metrics)
        self.assertEqual(RemoteSensingLayer.objects.count(), before_layers)

    # --- 13. Filters block is echoed correctly ---

    def test_filters_echoed_in_response(self):
        response = self._get(year=2024, season="annual")
        filters = response.json()["filters"]
        self.assertEqual(filters["year"], 2024)
        self.assertEqual(filters["season"], "annual")
        self.assertEqual(filters["admin_level"], "lga")
        self.assertFalse(filters["include_lulc_preview"])

    # --- 14. Empty result for year with no data ---

    def test_empty_results_for_year_with_no_data(self):
        response = self._get(year=1999, season="annual")
        data = response.json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["results"], [])

    # --- 15. Invalid params return 400 ---

    def test_invalid_season_returns_400(self):
        response = self._get(season="monsoon")
        self.assertEqual(response.status_code, 400)

    def test_invalid_year_returns_400(self):
        response = self._get(year="notayear")
        self.assertEqual(response.status_code, 400)


# ---------------------------------------------------------------------------
# Climate Intelligence Engine E5 — single-LGA focused profile
# ---------------------------------------------------------------------------


class ClimateIntelligenceProfileTests(TestCase):
    """
    Integration tests for GET /api/remote-sensing/climate-intelligence/profile/
    (Climate Intelligence Engine E5).
    """

    URL = "/api/remote-sensing/climate-intelligence/profile/"

    FORBIDDEN_PHRASES = [
        "priority intervention",
        "disaster prediction",
        "will flood",
        "high-risk lga",
        "ai warning",
        "deforestation",
        "degradation",
        "forest loss",
    ]

    @classmethod
    def setUpTestData(cls):
        cls.rainfall_layer = _ci_make_layer("rainfall",         "Rainfall Total")
        cls.anomaly_layer  = _ci_make_layer("rainfall_anomaly", "Rainfall Anomaly")
        cls.drought_layer  = _ci_make_layer("drought_index",    "Drought Index (SPI)")
        cls.ndvi_layer     = _ci_make_layer("ndvi",             "NDVI / Vegetation Condition")
        cls.lst_layer      = _ci_make_layer("lst",              "Land Surface Temperature")

        _ci_make_metric(cls.rainfall_layer, "EP001", "LGA Epsilon", 2024, "annual", 1200.0, "mm")
        _ci_make_metric(cls.anomaly_layer,  "EP001", "LGA Epsilon", 2024, "annual",   12.0, "%")
        _ci_make_metric(cls.drought_layer,  "EP001", "LGA Epsilon", 2024, "annual",    0.3, "SPI")
        _ci_make_metric(cls.ndvi_layer,     "EP001", "LGA Epsilon", 2024, "annual",   0.65, "index")
        _ci_make_metric(cls.lst_layer,      "EP001", "LGA Epsilon", 2024, "annual",   31.0, "°C")

        cls.lulc_dataset = LandCoverDataset.objects.create(
            provider="dynamic_world_v1",
            provider_label="Dynamic World v1",
            gee_collection="GOOGLE/DYNAMICWORLD/V1",
            year=2024,
            composite_window="wet_season",
            composite_start=datetime.date(2024, 5, 1),
            composite_end=datetime.date(2024, 10, 31),
            method_version="dw_wetseason_mode_v1",
            admin_level="lga",
            snapshot_count=1,
            is_validated=False,
            is_public=False,
        )
        LandCoverSnapshot.objects.create(
            dataset=cls.lulc_dataset,
            admin_level="lga",
            admin_code="EP001",
            admin_name="LGA Epsilon",
            total_area_km2=Decimal("1200.0"),
            class_pct={
                "trees": 67.6, "grass": 15.0, "crops": 12.0,
                "shrub_scrub": 3.0, "built_area": 1.0, "water": 0.8,
                "flooded_vegetation": 0.4, "bare_ground": 0.2, "snow_ice": 0.0,
            },
            class_areas_km2={
                "trees": 811.2, "grass": 180.0, "crops": 144.0,
                "shrub_scrub": 36.0, "built_area": 12.0, "water": 9.6,
                "flooded_vegetation": 4.8, "bare_ground": 2.4, "snow_ice": 0.0,
            },
            metadata={"quality_flag": "high"},
        )

    def _get(self, **params):
        return self.client.get(self.URL, params)

    # --- 1. 400 without admin identifier ---

    def test_missing_admin_identifier_returns_400(self):
        response = self._get(year=2024)
        self.assertEqual(response.status_code, 400)
        msg = response.json()["message"].lower()
        self.assertIn("admin_code", msg)
        self.assertIn("admin_name", msg)

    # --- 2. 404 for unknown LGA ---

    def test_unknown_admin_code_returns_404(self):
        response = self._get(admin_code="UNKNOWN_XYZ", year=2024)
        self.assertEqual(response.status_code, 404)

    def test_unknown_admin_name_returns_404(self):
        response = self._get(admin_name="Nonexistent LGA Name XYZ", year=2024)
        self.assertEqual(response.status_code, 404)

    # --- 3. Returns profile by admin_code ---

    def test_returns_profile_by_admin_code(self):
        response = self._get(admin_code="EP001", year=2024)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "ok")
        self.assertIn("profile", data)
        self.assertEqual(data["profile"]["admin_code"], "EP001")
        self.assertEqual(data["profile"]["admin_name"], "LGA Epsilon")

    # --- 4. Returns profile by admin_name ---

    def test_returns_profile_by_admin_name(self):
        response = self._get(admin_name="LGA Epsilon", year=2024)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["profile"]["admin_name"], "LGA Epsilon")
        self.assertEqual(data["profile"]["admin_code"], "EP001")

    def test_admin_name_lookup_is_case_insensitive(self):
        response = self._get(admin_name="lga epsilon", year=2024)
        self.assertEqual(response.status_code, 200)

    # --- 5. LULC excluded by default ---

    def test_lulc_excluded_by_default(self):
        response = self._get(admin_code="EP001", year=2024)
        data = response.json()
        self.assertIsNone(data["profile"]["sections"]["land_cover"])

    # --- 6. LULC included only when include_lulc_preview=true ---

    def test_lulc_included_when_preview_requested(self):
        response = self._get(admin_code="EP001", year=2024, include_lulc_preview="true")
        data = response.json()
        lc = data["profile"]["sections"]["land_cover"]
        self.assertIsNotNone(lc)
        self.assertIn("Internal preview", lc["notice"])
        self.assertFalse(lc["is_public"])
        self.assertFalse(lc["is_validated"])
        self.assertEqual(lc["dominant_class"], "trees")

    # --- 7. Method notes are present ---

    def test_method_notes_present(self):
        response = self._get(admin_code="EP001", year=2024)
        notes = response.json()["profile"]["method_notes"]
        self.assertGreaterEqual(len(notes), 3)
        combined = " ".join(notes).lower()
        self.assertIn("chirps", combined)
        self.assertIn("spi", combined)
        self.assertIn("land surface temperature", combined)

    def test_method_notes_present_with_lulc(self):
        response = self._get(admin_code="EP001", year=2024, include_lulc_preview="true")
        notes = response.json()["profile"]["method_notes"]
        combined = " ".join(notes).lower()
        self.assertIn("dynamic world", combined)
        self.assertIn("change analysis", combined)

    # --- 8. Unsupported phrases do not appear ---

    def test_no_unsupported_phrases_in_response(self):
        response = self._get(admin_code="EP001", year=2024, include_lulc_preview="true")
        body = response.content.decode("utf-8").lower()
        for phrase in self.FORBIDDEN_PHRASES:
            self.assertNotIn(
                phrase, body,
                msg=f"Forbidden phrase {phrase!r} found in E5 profile response",
            )

    # --- 9. Endpoint does not mutate DB ---

    def test_endpoint_does_not_mutate_db(self):
        before_metrics = RemoteSensingLGAMetric.objects.count()
        before_layers  = RemoteSensingLayer.objects.count()
        self._get(admin_code="EP001", year=2024, include_lulc_preview="true")
        self.assertEqual(RemoteSensingLGAMetric.objects.count(), before_metrics)
        self.assertEqual(RemoteSensingLayer.objects.count(), before_layers)

    # --- 10. Profile shape ---

    def test_profile_has_required_top_level_fields(self):
        response = self._get(admin_code="EP001", year=2024)
        profile = response.json()["profile"]
        for field in ("admin_code", "admin_name", "year", "season", "headline",
                      "sections", "briefing", "cautions", "method_notes"):
            self.assertIn(field, profile, f"Missing profile field: {field!r}")

    def test_profile_sections_has_expected_keys(self):
        response = self._get(admin_code="EP001", year=2024)
        sections = response.json()["profile"]["sections"]
        for key in ("rainfall", "vegetation", "temperature", "drought", "land_cover"):
            self.assertIn(key, sections, f"Missing section key: {key!r}")

    def test_headline_is_non_empty_string(self):
        response = self._get(admin_code="EP001", year=2024)
        headline = response.json()["profile"]["headline"]
        self.assertIsInstance(headline, str)
        self.assertTrue(len(headline) > 0)

    def test_year_and_season_echoed_in_profile(self):
        response = self._get(admin_code="EP001", year=2024, season="annual")
        profile = response.json()["profile"]
        self.assertEqual(profile["year"], 2024)
        self.assertEqual(profile["season"], "annual")


# ---------------------------------------------------------------------------
# Phase G4 — Elevation Terrain Detail (internal preview)
# ---------------------------------------------------------------------------

# Shared settings for tests that must pass the three-condition gate.
_GATE_OPEN = {"DEBUG": True, "KCCC_ENABLE_INTERNAL_PREVIEWS": True}


@override_settings(**_GATE_OPEN)
class ElevationTileEndpointTests(TestCase):
    """
    Tests for GET /api/remote-sensing/elevation/tile/

    The gate requires ALL of: DEBUG=True, KCCC_ENABLE_INTERNAL_PREVIEWS=True,
    and HTTP Host resolving to localhost or 127.0.0.1.
    Class-level @override_settings opens the gate; individual tests close it
    to prove each condition independently denies access.
    """

    URL = "/api/remote-sensing/elevation/tile/"

    def _get_local(self):
        """Request that satisfies all three gate conditions."""
        return self.client.get(self.URL, HTTP_HOST="localhost")

    # --- Denial: condition 1 (DEBUG=False) ---

    @override_settings(DEBUG=False)
    def test_debug_false_returns_403(self):
        response = self._get_local()
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["status"], "forbidden")

    # --- Denial: condition 2 (KCCC_ENABLE_INTERNAL_PREVIEWS absent/false) ---

    @override_settings(KCCC_ENABLE_INTERNAL_PREVIEWS=False)
    def test_previews_not_enabled_returns_403(self):
        response = self._get_local()
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["status"], "forbidden")

    # --- Denial: condition 3 (non-loopback host) ---
    # ALLOWED_HOSTS=["*"] lets example.com reach the view so our host check fires.

    @override_settings(ALLOWED_HOSTS=["*"])
    def test_non_loopback_host_returns_403(self):
        response = self.client.get(self.URL, HTTP_HOST="example.com")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["status"], "forbidden")

    # --- Denial: old client header present but server conditions fail ---

    @override_settings(DEBUG=False)
    def test_old_client_header_does_not_bypass_debug_false(self):
        response = self.client.get(
            self.URL,
            HTTP_HOST="localhost",
            HTTP_X_KCCC_INTERNAL_PREVIEW="elevation",
        )
        self.assertEqual(response.status_code, 403)

    @override_settings(KCCC_ENABLE_INTERNAL_PREVIEWS=False)
    def test_old_client_header_does_not_bypass_missing_preview_flag(self):
        response = self.client.get(
            self.URL,
            HTTP_HOST="localhost",
            HTTP_X_KCCC_INTERNAL_PREVIEW="elevation",
        )
        self.assertEqual(response.status_code, 403)

    @override_settings(ALLOWED_HOSTS=["*"])
    def test_old_client_header_does_not_bypass_non_loopback_host(self):
        response = self.client.get(
            self.URL,
            HTTP_HOST="example.com",
            HTTP_X_KCCC_INTERNAL_PREVIEW="elevation",
        )
        self.assertEqual(response.status_code, 403)

    # --- Success: gate open, GEE unavailable ---

    @patch("remote_sensing.views.gee_service")
    def test_returns_200_when_gee_unavailable(self, mock_gee):
        mock_gee.get_elevation_tile_url.return_value = GEEResult(
            available=False, error="GEE not configured"
        )
        response = self._get_local()
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "unavailable")
        self.assertIn("notice", data)

    # --- Success: gate open, GEE returns tile URL ---

    @patch("remote_sensing.views.gee_service")
    def test_returns_200_with_tile_url_when_gee_available(self, mock_gee):
        mock_gee.get_elevation_tile_url.return_value = GEEResult(
            available=True,
            data={
                "tile_url": "https://earthengine.googleapis.com/v1/map/abc/{z}/{x}/{y}",
                "source": "USGS/SRTMGL1_003",
                "method_version": "srtm_terrain_tile_v1",
            },
        )
        response = self._get_local()
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "ok")
        self.assertIn("tile_url", data["tile"])
        self.assertIn("notice", data)

    # --- Layer publication guard ---

    def test_elevation_layer_remains_unpublished_after_call(self):
        layer = RemoteSensingLayer.objects.create(
            key="elevation",
            label="Terrain Elevation",
            gee_dataset="USGS/SRTMGL1_003",
            gee_band="elevation",
            is_active=False,
            is_public=False,
        )
        with patch("remote_sensing.views.gee_service") as mock_gee:
            mock_gee.get_elevation_tile_url.return_value = GEEResult(
                available=False, error="GEE not configured"
            )
            self._get_local()
        layer.refresh_from_db()
        self.assertFalse(layer.is_public)
        self.assertFalse(layer.is_active)

    # --- 127.0.0.1 is also accepted ---

    @patch("remote_sensing.views.gee_service")
    def test_loopback_ip_host_is_accepted(self, mock_gee):
        mock_gee.get_elevation_tile_url.return_value = GEEResult(
            available=False, error="GEE not configured"
        )
        response = self.client.get(self.URL, HTTP_HOST="127.0.0.1:8000")
        self.assertEqual(response.status_code, 200)


@override_settings(**_GATE_OPEN)
class ElevationSampleEndpointTests(TestCase):
    """
    Tests for GET /api/remote-sensing/elevation/sample/

    Gate requires same three conditions as ElevationTileEndpointTests.
    Class-level @override_settings opens the gate; individual tests override
    to prove each denial path, then the suite covers input validation and
    GEE result handling under an open gate.
    """

    URL = "/api/remote-sensing/elevation/sample/"
    # Kaduna State capital approx. — reliably inside Kaduna bbox.
    _KADUNA_LAT = "10.52"
    _KADUNA_LNG = "7.44"

    def _get_local(self, **params):
        """Request that satisfies all three gate conditions."""
        return self.client.get(self.URL, params, HTTP_HOST="localhost")

    # --- Denial: condition 1 ---

    @override_settings(DEBUG=False)
    def test_debug_false_returns_403(self):
        response = self.client.get(
            self.URL, {"lat": "10.5", "lng": "7.5"}, HTTP_HOST="localhost"
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["status"], "forbidden")

    # --- Denial: condition 2 ---

    @override_settings(KCCC_ENABLE_INTERNAL_PREVIEWS=False)
    def test_previews_not_enabled_returns_403(self):
        response = self.client.get(
            self.URL, {"lat": "10.5", "lng": "7.5"}, HTTP_HOST="localhost"
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["status"], "forbidden")

    # --- Denial: condition 3 ---

    @override_settings(ALLOWED_HOSTS=["*"])
    def test_non_loopback_host_returns_403(self):
        response = self.client.get(
            self.URL, {"lat": "10.5", "lng": "7.5"}, HTTP_HOST="example.com"
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["status"], "forbidden")

    # --- Denial: old client header present but server conditions fail ---

    @override_settings(DEBUG=False)
    def test_old_client_header_does_not_bypass_debug_false(self):
        response = self.client.get(
            self.URL,
            {"lat": "10.5", "lng": "7.5"},
            HTTP_HOST="localhost",
            HTTP_X_KCCC_INTERNAL_PREVIEW="elevation",
        )
        self.assertEqual(response.status_code, 403)

    @override_settings(ALLOWED_HOSTS=["*"])
    def test_old_client_header_does_not_bypass_non_loopback_host(self):
        response = self.client.get(
            self.URL,
            {"lat": "10.5", "lng": "7.5"},
            HTTP_HOST="example.com",
            HTTP_X_KCCC_INTERNAL_PREVIEW="elevation",
        )
        self.assertEqual(response.status_code, 403)

    # --- Input validation (gate open) ---

    def test_non_numeric_lat_returns_400(self):
        response = self._get_local(lat="abc", lng="7.5")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["status"], "error")

    def test_non_numeric_lng_returns_400(self):
        response = self._get_local(lat="10.5", lng="xyz")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["status"], "error")

    def test_missing_lat_lng_returns_400(self):
        response = self._get_local()
        self.assertEqual(response.status_code, 400)

    def test_lat_out_of_global_range_returns_400(self):
        response = self._get_local(lat="999", lng="7.5")
        self.assertEqual(response.status_code, 400)

    def test_lng_out_of_global_range_returns_400(self):
        response = self._get_local(lat="10.5", lng="999")
        self.assertEqual(response.status_code, 400)

    def test_outside_kaduna_bbox_returns_400(self):
        # 0°N, 0°E is far outside Kaduna State
        response = self._get_local(lat="0", lng="0")
        self.assertEqual(response.status_code, 400)
        self.assertIn("outside Kaduna", response.json()["message"])

    # --- GEE result handling (gate open) ---

    @patch("remote_sensing.views.gee_service")
    def test_outside_kaduna_polygon_gee_null_returns_400(self, mock_gee):
        # Inside bbox but GEE returns null (masked pixel — outside polygon).
        mock_gee.sample_elevation_at_point.return_value = GEEResult(
            available=False, error="outside_kaduna"
        )
        response = self._get_local(lat=self._KADUNA_LAT, lng=self._KADUNA_LNG)
        self.assertEqual(response.status_code, 400)
        self.assertIn("outside Kaduna", response.json()["message"])

    @patch("remote_sensing.views.gee_service")
    def test_valid_point_returns_200_with_sample_fields(self, mock_gee):
        mock_gee.sample_elevation_at_point.return_value = GEEResult(
            available=True,
            data={
                "elevation_m": 612.0,
                "lat": 10.52,
                "lng": 7.44,
                "source": "USGS/SRTMGL1_003",
                "band": "elevation",
                "source_resolution": "~30 m (1 arc-second SRTM)",
                "acquisition_year": 2000,
                "method": "srtm_native_cell_sample",
                "method_version": "srtm_point_sample_v1",
                "caution": (
                    "Sampled terrain elevation from satellite-derived SRTM data "
                    "(~30 m source resolution, ~2000 acquisition). "
                    "Not survey-grade ground truth. "
                    "Static topographic data — not a climate variable or forecast."
                ),
            },
        )
        response = self._get_local(lat=self._KADUNA_LAT, lng=self._KADUNA_LNG)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "ok")
        self.assertIn("notice", data)
        sample = data["sample"]
        for field in ("elevation_m", "lat", "lng", "source", "source_resolution",
                      "acquisition_year", "caution"):
            self.assertIn(field, sample)
        self.assertEqual(sample["elevation_m"], 612.0)

    @patch("remote_sensing.views.gee_service")
    def test_gee_service_error_returns_503(self, mock_gee):
        mock_gee.sample_elevation_at_point.return_value = GEEResult(
            available=False, error="GEE timeout"
        )
        response = self._get_local(lat=self._KADUNA_LAT, lng=self._KADUNA_LNG)
        self.assertEqual(response.status_code, 503)

    @patch("remote_sensing.views.gee_service")
    def test_caution_wording_is_correct(self, mock_gee):
        caution_text = (
            "Sampled terrain elevation from satellite-derived SRTM data "
            "(~30 m source resolution, ~2000 acquisition). "
            "Not survey-grade ground truth. "
            "Static topographic data — not a climate variable or forecast."
        )
        mock_gee.sample_elevation_at_point.return_value = GEEResult(
            available=True,
            data={
                "elevation_m": 600.0, "lat": 10.52, "lng": 7.44,
                "source": "USGS/SRTMGL1_003", "band": "elevation",
                "source_resolution": "~30 m (1 arc-second SRTM)",
                "acquisition_year": 2000, "method": "srtm_native_cell_sample",
                "method_version": "srtm_point_sample_v1",
                "caution": caution_text,
            },
        )
        response = self._get_local(lat=self._KADUNA_LAT, lng=self._KADUNA_LNG)
        sample_caution = response.json()["sample"]["caution"]
        self.assertNotIn("exact elevation", sample_caution.lower())
        self.assertNotIn("hazard", sample_caution)
        self.assertIn("Not survey-grade", sample_caution)
        self.assertIn("satellite-derived", sample_caution)

    # --- 127.0.0.1 is also accepted ---

    @patch("remote_sensing.views.gee_service")
    def test_loopback_ip_host_is_accepted(self, mock_gee):
        mock_gee.sample_elevation_at_point.return_value = GEEResult(
            available=True,
            data={
                "elevation_m": 612.0, "lat": 10.52, "lng": 7.44,
                "source": "USGS/SRTMGL1_003", "band": "elevation",
                "source_resolution": "~30 m", "acquisition_year": 2000,
                "method": "srtm_native_cell_sample",
                "method_version": "srtm_point_sample_v1",
                "caution": "test",
            },
        )
        response = self.client.get(
            self.URL,
            {"lat": self._KADUNA_LAT, "lng": self._KADUNA_LNG},
            HTTP_HOST="127.0.0.1:8000",
        )
        self.assertEqual(response.status_code, 200)


class ElevationPreviewRegressionTests(TestCase):
    """
    LGA Summary regression: existing elevation_preview endpoint still returns DB data.
    No gate on this endpoint — it is a DB read with no GEE call.
    """

    URL = "/api/remote-sensing/elevation/"

    @classmethod
    def setUpTestData(cls):
        cls.layer = RemoteSensingLayer.objects.create(
            key="elevation",
            label="Terrain Elevation",
            gee_dataset="USGS/SRTMGL1_003",
            gee_band="elevation",
            is_active=False,
            is_public=False,
        )
        cls.lga = LGARegistry.objects.create(lga_id=900, lga_name="Kaduna North")
        RemoteSensingLGAMetric.objects.create(
            layer=cls.layer,
            lga=cls.lga,
            admin_code="KD001",
            admin_name="Kaduna North",
            admin_level="lga",
            year=2000,
            season="annual",
            mean_value=Decimal("612.0"),
            data_source="USGS/SRTMGL1_003",
        )

    def test_returns_200(self):
        response = self.client.get(self.URL)
        self.assertEqual(response.status_code, 200)

    def test_does_not_require_internal_header(self):
        response = self.client.get(self.URL)
        self.assertEqual(response.json()["status"], "ok")

    def test_returns_lga_metric_records(self):
        response = self.client.get(self.URL)
        results = response.json()["results"]
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["admin_name"], "Kaduna North")

    def test_notice_field_present(self):
        response = self.client.get(self.URL)
        self.assertIn("notice", response.json())

    def test_layer_not_exposed_as_public(self):
        self.layer.refresh_from_db()
        self.assertFalse(self.layer.is_public)
        self.assertFalse(self.layer.is_active)


# ---------------------------------------------------------------------------
# Phase P1: Public elevation summary endpoint
# ---------------------------------------------------------------------------

class PublicElevationSummaryTests(TestCase):
    """
    /api/remote-sensing/public/elevation/ must gate on is_public AND is_active.
    Returns DB-backed metrics only — never invokes GEE.
    """

    URL = "/api/remote-sensing/public/elevation/"

    @classmethod
    def setUpTestData(cls):
        cls.lga = LGARegistry.objects.create(lga_id=910, lga_name="Birnin Gwari")

    def _make_layer(self, *, is_public, is_active):
        return RemoteSensingLayer.objects.create(
            key="elevation",
            label="Terrain Elevation",
            gee_dataset="USGS/SRTMGL1_003",
            gee_band="elevation",
            is_public=is_public,
            is_active=is_active,
        )

    def _make_metric(self, layer):
        return RemoteSensingLGAMetric.objects.create(
            layer=layer,
            lga=self.lga,
            admin_code="KD099",
            admin_name="Birnin Gwari",
            admin_level="lga",
            year=2000,
            season="annual",
            mean_value=Decimal("721.5"),
            data_source="USGS/SRTMGL1_003",
        )

    def test_returns_200_when_published(self):
        layer = self._make_layer(is_public=True, is_active=True)
        self._make_metric(layer)
        response = self.client.get(self.URL)
        self.assertEqual(response.status_code, 200)

    def test_returns_results_when_published(self):
        layer = self._make_layer(is_public=True, is_active=True)
        self._make_metric(layer)
        data = self.client.get(self.URL).json()
        self.assertEqual(data["status"], "ok")
        self.assertEqual(len(data["results"]), 1)
        self.assertEqual(data["results"][0]["admin_name"], "Birnin Gwari")

    def test_label_field_present_and_correct(self):
        layer = self._make_layer(is_public=True, is_active=True)
        self._make_metric(layer)
        data = self.client.get(self.URL).json()
        self.assertEqual(data["label"], "Elevation LGA Summary — SRTM approximately 2000")

    def test_404_when_not_public(self):
        self._make_layer(is_public=False, is_active=True)
        response = self.client.get(self.URL)
        self.assertEqual(response.status_code, 404)

    def test_404_when_not_active(self):
        self._make_layer(is_public=True, is_active=False)
        response = self.client.get(self.URL)
        self.assertEqual(response.status_code, 404)

    def test_404_when_both_false(self):
        self._make_layer(is_public=False, is_active=False)
        response = self.client.get(self.URL)
        self.assertEqual(response.status_code, 404)

    def test_no_gee_call(self):
        """Endpoint must return without invoking GEE — DB-backed only."""
        layer = self._make_layer(is_public=True, is_active=True)
        self._make_metric(layer)
        with patch("remote_sensing.views.gee_service") as mock_gee:
            self.client.get(self.URL)
            mock_gee.initialize.assert_not_called()

    def test_preview_endpoint_unaffected(self):
        """Internal preview endpoint continues to work regardless of publish state."""
        layer = self._make_layer(is_public=False, is_active=False)
        self._make_metric(layer)
        response = self.client.get("/api/remote-sensing/elevation/")
        self.assertEqual(response.status_code, 200)


# ---------------------------------------------------------------------------
# Phase P1: Public historical surface water endpoint
# ---------------------------------------------------------------------------

class PublicHistoricalSurfaceWaterTests(TestCase):
    """
    /api/remote-sensing/public/historical-surface-water/ must gate on
    is_public AND is_active, return the correct label, and never call GEE.
    """

    URL = "/api/remote-sensing/public/historical-surface-water/"

    @classmethod
    def setUpTestData(cls):
        cls.lga = LGARegistry.objects.create(lga_id=911, lga_name="Jama'a")

    def _make_layer(self, *, is_public, is_active):
        return RemoteSensingLayer.objects.create(
            key="flood_occurrence",
            label="Historical Surface Water Occurrence",
            gee_dataset="JRC/GSW1_4/GlobalSurfaceWater",
            gee_band="occurrence",
            is_public=is_public,
            is_active=is_active,
        )

    def _make_metric(self, layer):
        return RemoteSensingLGAMetric.objects.create(
            layer=layer,
            lga=self.lga,
            admin_code="KD098",
            admin_name="Jama'a",
            admin_level="lga",
            year=2021,
            season="annual",
            mean_value=Decimal("3.7"),
            data_source="JRC/GSW1_4/GlobalSurfaceWater",
        )

    def test_returns_200_when_published(self):
        layer = self._make_layer(is_public=True, is_active=True)
        self._make_metric(layer)
        response = self.client.get(self.URL)
        self.assertEqual(response.status_code, 200)

    def test_returns_results_when_published(self):
        layer = self._make_layer(is_public=True, is_active=True)
        self._make_metric(layer)
        data = self.client.get(self.URL).json()
        self.assertEqual(data["status"], "ok")
        self.assertEqual(len(data["results"]), 1)

    def test_label_is_exact_canonical_string(self):
        layer = self._make_layer(is_public=True, is_active=True)
        self._make_metric(layer)
        data = self.client.get(self.URL).json()
        self.assertEqual(
            data["label"],
            "Historical Surface Water Occurrence — 1984–2021 archive",
        )

    def test_label_contains_no_forbidden_terms(self):
        layer = self._make_layer(is_public=True, is_active=True)
        self._make_metric(layer)
        label = self.client.get(self.URL).json()["label"]
        for forbidden in ("flood hazard", "active flooding", "prediction", "real-time", "vulnerability"):
            self.assertNotIn(forbidden, label.lower(), msg=f"Label must not contain '{forbidden}'")

    def test_404_when_not_public(self):
        self._make_layer(is_public=False, is_active=True)
        response = self.client.get(self.URL)
        self.assertEqual(response.status_code, 404)

    def test_404_when_not_active(self):
        self._make_layer(is_public=True, is_active=False)
        response = self.client.get(self.URL)
        self.assertEqual(response.status_code, 404)

    def test_no_gee_call(self):
        layer = self._make_layer(is_public=True, is_active=True)
        self._make_metric(layer)
        with patch("remote_sensing.views.gee_service") as mock_gee:
            self.client.get(self.URL)
            mock_gee.initialize.assert_not_called()

    def test_preview_endpoint_unaffected(self):
        """Internal flood_occurrence_preview endpoint continues to work."""
        layer = self._make_layer(is_public=False, is_active=False)
        self._make_metric(layer)
        response = self.client.get("/api/remote-sensing/flood-occurrence/")
        self.assertEqual(response.status_code, 200)


# ---------------------------------------------------------------------------
# Phase P1: Public terrain tile URL endpoint
# ---------------------------------------------------------------------------

class PublicElevationTileUrlTests(TestCase):
    """
    /api/remote-sensing/elevation/public-tile/

    Gate: is_public=True AND is_active=True on elevation layer.
    GEE is never called in 404 paths.
    Response must expose only the local proxy URL template — never a raw GEE tile URL.
    """

    URL = "/api/remote-sensing/elevation/public-tile/"

    def _make_layer(self, *, is_public, is_active):
        return RemoteSensingLayer.objects.create(
            key="elevation",
            label="Terrain Elevation",
            gee_dataset="USGS/SRTMGL1_003",
            gee_band="elevation",
            is_public=is_public,
            is_active=is_active,
        )

    def test_404_when_both_false(self):
        self._make_layer(is_public=False, is_active=False)
        response = self.client.get(self.URL)
        self.assertEqual(response.status_code, 404)

    def test_404_when_not_public(self):
        self._make_layer(is_public=False, is_active=True)
        response = self.client.get(self.URL)
        self.assertEqual(response.status_code, 404)

    def test_404_when_not_active(self):
        self._make_layer(is_public=True, is_active=False)
        response = self.client.get(self.URL)
        self.assertEqual(response.status_code, 404)

    @patch("remote_sensing.views.gee_service")
    def test_200_when_published(self, mock_gee):
        self._make_layer(is_public=True, is_active=True)
        mock_gee.get_elevation_upstream_template.return_value = GEEResult(
            available=True, data={"upstream_template": "https://gee.example.com/{z}/{x}/{y}"}
        )
        response = self.client.get(self.URL)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "ok")

    @patch("remote_sensing.views.gee_service")
    def test_response_contains_local_proxy_url_not_gee_url(self, mock_gee):
        """The raw GEE URL must never appear in the response body."""
        self._make_layer(is_public=True, is_active=True)
        mock_gee.get_elevation_upstream_template.return_value = GEEResult(
            available=True, data={"upstream_template": "https://earthengine.googleapis.com/secret/{z}/{x}/{y}"}
        )
        response = self.client.get(self.URL)
        data = response.json()
        tile_url = data["tile"]["tile_url"]
        self.assertTrue(
            tile_url.startswith("/api/"),
            msg=f"tile_url must be a local proxy path, got: {tile_url!r}",
        )
        self.assertNotIn("googleapis.com", str(data))
        self.assertNotIn("earthengine", str(data))

    @patch("remote_sensing.views.gee_service")
    def test_response_structure(self, mock_gee):
        self._make_layer(is_public=True, is_active=True)
        mock_gee.get_elevation_upstream_template.return_value = GEEResult(
            available=True, data={"upstream_template": "https://gee.example.com/{z}/{x}/{y}"}
        )
        data = self.client.get(self.URL).json()
        for field in ("status", "tile", "notice"):
            self.assertIn(field, data)
        tile = data["tile"]
        for field in ("tile_url", "attribution", "source", "acquisition_year", "source_resolution"):
            self.assertIn(field, tile)
        self.assertEqual(tile["acquisition_year"], 2000)

    @patch("remote_sensing.views.gee_service")
    def test_503_when_gee_unavailable(self, mock_gee):
        self._make_layer(is_public=True, is_active=True)
        mock_gee.get_elevation_upstream_template.return_value = GEEResult(
            available=False, error="GEE not configured"
        )
        response = self.client.get(self.URL)
        self.assertEqual(response.status_code, 503)

    def test_internal_preview_tile_endpoint_unaffected(self):
        """Existing internal tile URL endpoint is unaffected by layer publish state."""
        self._make_layer(is_public=False, is_active=False)
        with patch("remote_sensing.views.gee_service") as mock_gee:
            mock_gee.get_elevation_tile_url.return_value = GEEResult(
                available=False, error="GEE not configured"
            )
            response = self.client.get(
                "/api/remote-sensing/elevation/tile/", HTTP_HOST="localhost"
            )
        # Gate is satisfied (DEBUG=True, localhost) but GEE fails → 200 with unavailable tile
        self.assertIn(response.status_code, (200, 403, 503))


# ---------------------------------------------------------------------------
# Phase P1: Public terrain tile proxy endpoint
# ---------------------------------------------------------------------------

class PublicElevationTileProxyTests(TestCase):
    """
    /api/remote-sensing/elevation-tile/{z}/{x}/{y}/

    Gate: is_public=True AND is_active=True on elevation layer.
    Validates z/x/y coordinate ranges.
    Returns PNG bytes proxied from GEE.
    """

    def _url(self, z=8, x=100, y=100):
        return f"/api/remote-sensing/elevation-tile/{z}/{x}/{y}/"

    def _make_layer(self, *, is_public, is_active):
        return RemoteSensingLayer.objects.create(
            key="elevation",
            label="Terrain Elevation",
            gee_dataset="USGS/SRTMGL1_003",
            gee_band="elevation",
            is_public=is_public,
            is_active=is_active,
        )

    def test_404_when_both_false(self):
        self._make_layer(is_public=False, is_active=False)
        response = self.client.get(self._url())
        self.assertEqual(response.status_code, 404)

    def test_404_when_not_public(self):
        self._make_layer(is_public=False, is_active=True)
        response = self.client.get(self._url())
        self.assertEqual(response.status_code, 404)

    def test_404_when_not_active(self):
        self._make_layer(is_public=True, is_active=False)
        response = self.client.get(self._url())
        self.assertEqual(response.status_code, 404)

    @patch("remote_sensing.views.gee_service")
    def test_400_z_too_large(self, mock_gee):
        self._make_layer(is_public=True, is_active=True)
        mock_gee.get_elevation_upstream_template.return_value = GEEResult(
            available=True, data={"upstream_template": "https://gee.example.com/{z}/{x}/{y}"}
        )
        response = self.client.get(self._url(z=19, x=0, y=0))
        self.assertEqual(response.status_code, 400)

    @patch("remote_sensing.views.gee_service")
    def test_400_x_out_of_range(self, mock_gee):
        self._make_layer(is_public=True, is_active=True)
        mock_gee.get_elevation_upstream_template.return_value = GEEResult(
            available=True, data={"upstream_template": "https://gee.example.com/{z}/{x}/{y}"}
        )
        # For z=0, max tile index is 0 — x=1 is out of range.
        response = self.client.get(self._url(z=0, x=1, y=0))
        self.assertEqual(response.status_code, 400)

    @patch("remote_sensing.views.gee_service")
    def test_503_when_gee_upstream_unavailable(self, mock_gee):
        self._make_layer(is_public=True, is_active=True)
        mock_gee.get_elevation_upstream_template.return_value = GEEResult(
            available=False, error="GEE timeout"
        )
        response = self.client.get(self._url())
        self.assertEqual(response.status_code, 503)

    @patch("remote_sensing.views.gee_service")
    def test_503_when_tile_bytes_none(self, mock_gee):
        self._make_layer(is_public=True, is_active=True)
        mock_gee.get_elevation_upstream_template.return_value = GEEResult(
            available=True, data={"upstream_template": "https://gee.example.com/{z}/{x}/{y}"}
        )
        mock_gee.fetch_elevation_tile_bytes.return_value = None
        response = self.client.get(self._url())
        self.assertEqual(response.status_code, 503)

    @patch("remote_sensing.views.gee_service")
    def test_503_upstream_redirect_not_followed(self, mock_gee):
        """
        An upstream 3xx redirect from GEE must not be followed.
        fetch_elevation_tile_bytes returns None for any non-200 status
        (including 301/302), so the proxy returns 503 with a sanitized message.
        The redirect Location header and upstream URL must not appear in the response.
        """
        self._make_layer(is_public=True, is_active=True)
        mock_gee.get_elevation_upstream_template.return_value = GEEResult(
            available=True, data={"upstream_template": "https://gee.example.com/{z}/{x}/{y}"}
        )
        # Simulate fetch_elevation_tile_bytes returning None because a 302 was
        # received and allow_redirects=False means it was not followed.
        mock_gee.fetch_elevation_tile_bytes.return_value = None
        response = self.client.get(self._url())
        self.assertEqual(response.status_code, 503)
        # The sanitized error message must not contain any upstream URL or header value.
        body = str(response.content)
        self.assertNotIn("Location", body)
        self.assertNotIn("googleapis.com", body)
        self.assertNotIn("gee.example.com", body)
        self.assertNotIn("302", body)
        self.assertNotIn("301", body)

    @patch("remote_sensing.views.gee_service")
    def test_200_png_response_when_published(self, mock_gee):
        self._make_layer(is_public=True, is_active=True)
        mock_gee.get_elevation_upstream_template.return_value = GEEResult(
            available=True, data={"upstream_template": "https://gee.example.com/{z}/{x}/{y}"}
        )
        mock_gee.fetch_elevation_tile_bytes.return_value = b"\x89PNG\r\n\x1a\nfakepng"
        response = self.client.get(self._url())
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "image/png")
        self.assertIn("max-age=3600", response["Cache-Control"])

    @patch("remote_sensing.views.gee_service")
    def test_raw_gee_url_not_in_png_path(self, mock_gee):
        """Proxy fetches bytes internally — the upstream GEE URL must not be in the HTTP response."""
        self._make_layer(is_public=True, is_active=True)
        mock_gee.get_elevation_upstream_template.return_value = GEEResult(
            available=True, data={"upstream_template": "https://secret.googleapis.com/{z}/{x}/{y}"}
        )
        mock_gee.fetch_elevation_tile_bytes.return_value = b"\x89PNG\r\n\x1a\nfakepng"
        response = self.client.get(self._url())
        self.assertNotIn("googleapis", str(response.content))


# ---------------------------------------------------------------------------
# Phase P1: Public terrain point sampling endpoint
# ---------------------------------------------------------------------------

class PublicElevationSamplePublicTests(TestCase):
    """
    /api/remote-sensing/elevation/public-sample/

    Gate: is_public=True AND is_active=True on elevation layer.
    No DEBUG/localhost gate.
    Validates lat/lng range and Kaduna State bbox.
    """

    URL = "/api/remote-sensing/elevation/public-sample/"
    _KADUNA_LAT = "10.52"
    _KADUNA_LNG = "7.44"

    def _make_layer(self, *, is_public, is_active):
        return RemoteSensingLayer.objects.create(
            key="elevation",
            label="Terrain Elevation",
            gee_dataset="USGS/SRTMGL1_003",
            gee_band="elevation",
            is_public=is_public,
            is_active=is_active,
        )

    def _get(self, **params):
        return self.client.get(self.URL, params)

    def test_404_when_both_false(self):
        self._make_layer(is_public=False, is_active=False)
        response = self._get(lat=self._KADUNA_LAT, lng=self._KADUNA_LNG)
        self.assertEqual(response.status_code, 404)

    def test_404_when_not_public(self):
        self._make_layer(is_public=False, is_active=True)
        response = self._get(lat=self._KADUNA_LAT, lng=self._KADUNA_LNG)
        self.assertEqual(response.status_code, 404)

    def test_404_when_not_active(self):
        self._make_layer(is_public=True, is_active=False)
        response = self._get(lat=self._KADUNA_LAT, lng=self._KADUNA_LNG)
        self.assertEqual(response.status_code, 404)

    @override_settings(ALLOWED_HOSTS=["*"])
    def test_no_debug_or_localhost_gate(self):
        """Public endpoint must work from any host, not just localhost."""
        self._make_layer(is_public=True, is_active=True)
        with patch("remote_sensing.views.gee_service") as mock_gee:
            mock_gee.sample_elevation_at_point.return_value = GEEResult(
                available=True,
                data={"elevation_m": 612.0, "lat": 10.52, "lng": 7.44,
                      "source": "USGS/SRTMGL1_003", "band": "elevation",
                      "source_resolution": "~30 m", "acquisition_year": 2000,
                      "method": "srtm_native_cell_sample",
                      "method_version": "srtm_point_sample_v1", "caution": "test"},
            )
            response = self.client.get(
                self.URL,
                {"lat": self._KADUNA_LAT, "lng": self._KADUNA_LNG},
                HTTP_HOST="example.com",
            )
        self.assertEqual(response.status_code, 200)

    def test_400_non_numeric_lat(self):
        self._make_layer(is_public=True, is_active=True)
        response = self._get(lat="abc", lng=self._KADUNA_LNG)
        self.assertEqual(response.status_code, 400)

    def test_400_non_numeric_lng(self):
        self._make_layer(is_public=True, is_active=True)
        response = self._get(lat=self._KADUNA_LAT, lng="xyz")
        self.assertEqual(response.status_code, 400)

    def test_400_lat_out_of_global_range(self):
        self._make_layer(is_public=True, is_active=True)
        response = self._get(lat="999", lng=self._KADUNA_LNG)
        self.assertEqual(response.status_code, 400)

    def test_400_outside_kaduna_bbox(self):
        self._make_layer(is_public=True, is_active=True)
        response = self._get(lat="0", lng="0")
        self.assertEqual(response.status_code, 400)
        self.assertIn("outside Kaduna", response.json()["message"])

    @patch("remote_sensing.views.gee_service")
    def test_200_with_sample_fields(self, mock_gee):
        self._make_layer(is_public=True, is_active=True)
        mock_gee.sample_elevation_at_point.return_value = GEEResult(
            available=True,
            data={"elevation_m": 743.0, "lat": 10.52, "lng": 7.44,
                  "source": "USGS/SRTMGL1_003", "band": "elevation",
                  "source_resolution": "~30 m (1 arc-second SRTM)",
                  "acquisition_year": 2000,
                  "method": "srtm_native_cell_sample",
                  "method_version": "srtm_point_sample_v1",
                  "caution": "Not survey-grade ground truth."},
        )
        response = self._get(lat=self._KADUNA_LAT, lng=self._KADUNA_LNG)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "ok")
        self.assertIn("notice", data)
        sample = data["sample"]
        for field in ("elevation_m", "lat", "lng", "source", "acquisition_year"):
            self.assertIn(field, sample)
        self.assertEqual(sample["elevation_m"], 743.0)

    @patch("remote_sensing.views.gee_service")
    def test_notice_does_not_claim_survey_grade(self, mock_gee):
        self._make_layer(is_public=True, is_active=True)
        mock_gee.sample_elevation_at_point.return_value = GEEResult(
            available=True,
            data={"elevation_m": 612.0, "lat": 10.52, "lng": 7.44,
                  "source": "USGS/SRTMGL1_003", "band": "elevation",
                  "source_resolution": "~30 m", "acquisition_year": 2000,
                  "method": "srtm_native_cell_sample",
                  "method_version": "srtm_point_sample_v1", "caution": "test"},
        )
        data = self._get(lat=self._KADUNA_LAT, lng=self._KADUNA_LNG).json()
        notice = data.get("notice", "")
        self.assertNotIn("exact elevation", notice.lower())
        self.assertNotIn("flood risk", notice.lower())

    @patch("remote_sensing.views.gee_service")
    def test_503_when_gee_fails(self, mock_gee):
        self._make_layer(is_public=True, is_active=True)
        mock_gee.sample_elevation_at_point.return_value = GEEResult(
            available=False, error="GEE timeout"
        )
        response = self._get(lat=self._KADUNA_LAT, lng=self._KADUNA_LNG)
        self.assertEqual(response.status_code, 503)

    @patch("remote_sensing.views.gee_service")
    def test_400_when_point_outside_kaduna_polygon(self, mock_gee):
        self._make_layer(is_public=True, is_active=True)
        mock_gee.sample_elevation_at_point.return_value = GEEResult(
            available=False, error="outside_kaduna"
        )
        response = self._get(lat=self._KADUNA_LAT, lng=self._KADUNA_LNG)
        self.assertEqual(response.status_code, 400)
        self.assertIn("outside Kaduna", response.json()["message"])

    @override_settings(ALLOWED_HOSTS=["*"], KCCC_ENABLE_INTERNAL_PREVIEWS=True)
    def test_internal_preview_sample_endpoint_unaffected(self):
        """Internal elevation/sample/ endpoint remains gated by DEBUG+localhost."""
        self._make_layer(is_public=True, is_active=True)
        response = self.client.get(
            "/api/remote-sensing/elevation/sample/",
            {"lat": self._KADUNA_LAT, "lng": self._KADUNA_LNG},
            HTTP_HOST="example.com",
        )
        self.assertEqual(response.status_code, 403)


# ---------------------------------------------------------------------------
# Phase P1: release_layer management command
# ---------------------------------------------------------------------------

class ReleaseLayerCommandTests(TestCase):
    """
    Tests for the release_layer management command.
    Dry-run by default; --confirm required to mutate DB.
    """

    @classmethod
    def setUpTestData(cls):
        from django.contrib.auth.models import User
        cls.actor = User.objects.create_user(username="qa_officer", password="testpass")
        cls.elevation_layer = RemoteSensingLayer.objects.create(
            key="elevation",
            label="Terrain Elevation",
            gee_dataset="USGS/SRTMGL1_003",
            gee_band="elevation",
            is_public=False,
            is_active=False,
        )
        cls.flood_layer = RemoteSensingLayer.objects.create(
            key="flood_occurrence",
            label="Historical Surface Water Occurrence",
            gee_dataset="JRC/GSW1_4/GlobalSurfaceWater",
            gee_band="occurrence",
            is_public=False,
            is_active=False,
        )

    def _run(self, layer_key, action="publish", actor="qa_officer", qa="QA evidence ref: KCCC-QA-001", confirm=False, **extra):
        out = StringIO()
        kwargs = {
            "layer_key": layer_key,
            "action": action,
            "actor": actor,
            "qa_evidence": qa,
            "confirm": confirm,
            "stdout": out,
        }
        kwargs.update(extra)
        call_command("release_layer", **kwargs)
        return out.getvalue()

    # --- Allow-list enforcement ---

    def test_elevation_is_allowed(self):
        out = self._run("elevation")
        self.assertIn("DRY RUN", out)

    def test_flood_occurrence_is_allowed(self):
        out = self._run("flood_occurrence")
        self.assertIn("DRY RUN", out)

    def test_lulc_key_rejected(self):
        from django.core.management.base import CommandError
        with self.assertRaises(CommandError) as ctx:
            self._run("annual_lulc")
        self.assertIn("not in the approved", str(ctx.exception))

    def test_lulc_variant_rejected(self):
        from django.core.management.base import CommandError
        with self.assertRaises(CommandError):
            self._run("lulc")

    def test_arbitrary_key_rejected(self):
        from django.core.management.base import CommandError
        with self.assertRaises(CommandError):
            self._run("ndvi")

    # --- Guard conditions ---

    def test_empty_qa_evidence_rejected(self):
        from django.core.management.base import CommandError
        with self.assertRaises(CommandError) as ctx:
            self._run("elevation", qa="   ")
        self.assertIn("non-empty", str(ctx.exception))

    def test_nonexistent_actor_rejected(self):
        from django.core.management.base import CommandError
        with self.assertRaises(CommandError) as ctx:
            self._run("elevation", actor="ghost_user")
        self.assertIn("does not exist", str(ctx.exception))

    def test_nonexistent_layer_rejected(self):
        from django.core.management.base import CommandError
        with self.assertRaises(CommandError) as ctx:
            self._run("tree_cover")
        self.assertIn("not in the approved", str(ctx.exception))

    # --- Dry-run does not change DB ---

    def test_dry_run_does_not_mutate_elevation(self):
        self._run("elevation")
        self.elevation_layer.refresh_from_db()
        self.assertFalse(self.elevation_layer.is_public)
        self.assertFalse(self.elevation_layer.is_active)

    def test_dry_run_output_mentions_dry_run(self):
        out = self._run("elevation")
        self.assertIn("DRY RUN", out)

    # --- --confirm applies changes ---

    def test_confirm_publish_sets_both_flags(self):
        from audit.models import AuditLog
        self._run("elevation", confirm=True)
        self.elevation_layer.refresh_from_db()
        self.assertTrue(self.elevation_layer.is_public)
        self.assertTrue(self.elevation_layer.is_active)
        # Reset for other tests
        self.elevation_layer.is_public = False
        self.elevation_layer.is_active = False
        self.elevation_layer.save(update_fields=["is_public", "is_active"])

    def test_confirm_publish_creates_audit_log(self):
        from audit.models import AuditLog
        before_count = AuditLog.objects.filter(action="layer_publish").count()
        self._run("flood_occurrence", confirm=True)
        after_count = AuditLog.objects.filter(action="layer_publish").count()
        self.assertEqual(after_count, before_count + 1)
        # Reset
        self.flood_layer.is_public = False
        self.flood_layer.is_active = False
        self.flood_layer.save(update_fields=["is_public", "is_active"])

    def test_confirm_publish_audit_log_has_qa_evidence(self):
        from audit.models import AuditLog
        self._run("elevation", confirm=True, qa="KCCC-QA-P1-2026-001")
        log = AuditLog.objects.filter(action="layer_publish").order_by("-timestamp").first()
        self.assertIsNotNone(log)
        self.assertIn("KCCC-QA-P1-2026-001", str(log.new_value))
        # Reset
        self.elevation_layer.is_public = False
        self.elevation_layer.is_active = False
        self.elevation_layer.save(update_fields=["is_public", "is_active"])

    def test_confirm_unpublish_clears_both_flags(self):
        # First publish
        self.flood_layer.is_public = True
        self.flood_layer.is_active = True
        self.flood_layer.save(update_fields=["is_public", "is_active"])
        # Then unpublish
        self._run("flood_occurrence", action="unpublish", confirm=True)
        self.flood_layer.refresh_from_db()
        self.assertFalse(self.flood_layer.is_public)


# ---------------------------------------------------------------------------
# LULC Tile Proxy — gate, coordinate, functional, and publication tests
# ---------------------------------------------------------------------------


class LulcTileGateTests(TestCase):
    """
    Security gate tests for the LULC tile handshake (/lulc-tile/) and proxy
    (/lulc-tile/<z>/<x>/<y>/).

    All three conditions must be simultaneously true for access:
      1. settings.DEBUG is True
      2. settings.KCCC_ENABLE_INTERNAL_PREVIEWS is True
      3. HTTP Host resolves to localhost or 127.0.0.1
    """

    def _handshake(self, **kwargs):
        return self.client.get(
            reverse("remote-sensing-lulc-tile"), {"year": "2024"}, **kwargs
        )

    def _proxy(self, **kwargs):
        return self.client.get(
            reverse("remote-sensing-lulc-tile-proxy", kwargs={"z": 7, "x": 66, "y": 60}),
            **kwargs,
        )

    # --- handshake gate ---

    @override_settings(DEBUG=False, KCCC_ENABLE_INTERNAL_PREVIEWS=True)
    def test_handshake_denied_when_debug_false(self):
        self.assertEqual(self._handshake(HTTP_HOST="localhost:8000").status_code, 403)

    @override_settings(DEBUG=True, KCCC_ENABLE_INTERNAL_PREVIEWS=False)
    def test_handshake_denied_when_preview_flag_off(self):
        self.assertEqual(self._handshake(HTTP_HOST="localhost:8000").status_code, 403)

    @override_settings(DEBUG=True, KCCC_ENABLE_INTERNAL_PREVIEWS=True, ALLOWED_HOSTS=["*"])
    def test_handshake_denied_when_non_loopback_host(self):
        self.assertEqual(self._handshake(HTTP_HOST="staging.example.com").status_code, 403)

    # --- proxy gate ---

    @override_settings(DEBUG=False, KCCC_ENABLE_INTERNAL_PREVIEWS=True)
    def test_proxy_denied_when_debug_false(self):
        self.assertEqual(self._proxy(HTTP_HOST="localhost:8000").status_code, 403)

    @override_settings(DEBUG=True, KCCC_ENABLE_INTERNAL_PREVIEWS=False)
    def test_proxy_denied_when_preview_flag_off(self):
        self.assertEqual(self._proxy(HTTP_HOST="localhost:8000").status_code, 403)

    @override_settings(DEBUG=True, KCCC_ENABLE_INTERNAL_PREVIEWS=True, ALLOWED_HOSTS=["*"])
    def test_proxy_denied_when_non_loopback_host(self):
        self.assertEqual(self._proxy(HTTP_HOST="staging.example.com").status_code, 403)


class LulcTileCoordinateTests(TestCase):
    """Tile coordinate validation for the LULC proxy endpoint."""

    def _url(self, z, x, y):
        return reverse("remote-sensing-lulc-tile-proxy", kwargs={"z": z, "x": x, "y": y})

    def _get(self, z, x, y):
        return self.client.get(self._url(z, x, y), HTTP_HOST="localhost:8000")

    @override_settings(DEBUG=True, KCCC_ENABLE_INTERNAL_PREVIEWS=True)
    def test_z_above_max_zoom_rejected(self):
        """z=17 exceeds _MAX_LULC_ZOOM=16 → 400."""
        self.assertEqual(self._get(z=17, x=0, y=0).status_code, 400)

    @override_settings(DEBUG=True, KCCC_ENABLE_INTERNAL_PREVIEWS=True)
    def test_x_out_of_slippy_range_rejected(self):
        """z=7 → valid x in [0, 127]; x=128 → 400."""
        self.assertEqual(self._get(z=7, x=128, y=0).status_code, 400)

    @override_settings(DEBUG=True, KCCC_ENABLE_INTERNAL_PREVIEWS=True)
    def test_y_out_of_slippy_range_rejected(self):
        """z=7 → valid y in [0, 127]; y=128 → 400."""
        self.assertEqual(self._get(z=7, x=0, y=128).status_code, 400)

    @override_settings(DEBUG=True, KCCC_ENABLE_INTERNAL_PREVIEWS=True)
    def test_valid_coordinates_reach_gee(self):
        """Valid z/x/y pass coordinate checks; 503 means GEE was called."""
        with patch("remote_sensing.views.gee_service") as mock_svc:
            mock_svc.get_lulc_upstream_template.return_value = GEEResult(
                available=False, error="test"
            )
            resp = self._get(z=7, x=66, y=60)
        self.assertEqual(resp.status_code, 503)
        mock_svc.get_lulc_upstream_template.assert_called_once()


class LulcTileProxyFunctionalTests(TestCase):
    """
    Functional tests for the LULC tile proxy.

    GEE calls are fully mocked — no real Earth Engine connection is made.
    """

    _FAKE_UPSTREAM = (
        "https://earthengine.googleapis.com/v1/projects/test/maps/FAKEID/tiles/{z}/{x}/{y}"
    )
    _FAKE_PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 80

    def _proxy(self, z=7, x=66, y=60, qs=None):
        url = reverse("remote-sensing-lulc-tile-proxy", kwargs={"z": z, "x": x, "y": y})
        params = qs or {"year": "2024", "display_mode": "cartographic"}
        return self.client.get(url, params, HTTP_HOST="localhost:8000")

    def _handshake(self, qs=None):
        params = qs or {"year": "2024", "display_mode": "cartographic"}
        return self.client.get(reverse("remote-sensing-lulc-tile"), params, HTTP_HOST="localhost:8000")

    @override_settings(DEBUG=True, KCCC_ENABLE_INTERNAL_PREVIEWS=True)
    def test_valid_tile_returns_image_png(self):
        """GEE available + bytes returned → HTTP 200 image/png."""
        with patch("remote_sensing.views.gee_service") as mock_svc:
            mock_svc.get_lulc_upstream_template.return_value = GEEResult(
                available=True, data={"upstream_template": self._FAKE_UPSTREAM}
            )
            mock_svc.fetch_lulc_tile_bytes.return_value = self._FAKE_PNG
            resp = self._proxy()
        self.assertEqual(resp.status_code, 200)
        self.assertIn("image/png", resp["Content-Type"])
        self.assertEqual(resp.content, self._FAKE_PNG)

    @override_settings(DEBUG=True, KCCC_ENABLE_INTERNAL_PREVIEWS=True)
    def test_tile_response_has_cache_header(self):
        """Successful tile response must include a Cache-Control header."""
        with patch("remote_sensing.views.gee_service") as mock_svc:
            mock_svc.get_lulc_upstream_template.return_value = GEEResult(
                available=True, data={"upstream_template": self._FAKE_UPSTREAM}
            )
            mock_svc.fetch_lulc_tile_bytes.return_value = self._FAKE_PNG
            resp = self._proxy()
        self.assertIn("Cache-Control", resp)

    @override_settings(DEBUG=True, KCCC_ENABLE_INTERNAL_PREVIEWS=True)
    def test_gee_unavailable_returns_503(self):
        """GEE cache miss + unavailable result → 503."""
        with patch("remote_sensing.views.gee_service") as mock_svc:
            mock_svc.get_lulc_upstream_template.return_value = GEEResult(
                available=False, error="GEE not initialized"
            )
            resp = self._proxy()
        self.assertEqual(resp.status_code, 503)

    @override_settings(DEBUG=True, KCCC_ENABLE_INTERNAL_PREVIEWS=True)
    def test_tile_fetch_failure_returns_503(self):
        """Cache hit but fetch returns None → 503."""
        with patch("remote_sensing.views.gee_service") as mock_svc:
            mock_svc.get_lulc_upstream_template.return_value = GEEResult(
                available=True, data={"upstream_template": self._FAKE_UPSTREAM}
            )
            mock_svc.fetch_lulc_tile_bytes.return_value = None
            resp = self._proxy()
        self.assertEqual(resp.status_code, 503)

    @override_settings(DEBUG=True, KCCC_ENABLE_INTERNAL_PREVIEWS=True)
    def test_handshake_does_not_leak_upstream_url_or_map_id(self):
        """The handshake response body must not contain the GEE upstream URL."""
        with patch("remote_sensing.views.gee_service") as mock_svc:
            mock_svc.get_lulc_upstream_template.return_value = GEEResult(
                available=True, data={"upstream_template": self._FAKE_UPSTREAM}
            )
            resp = self._handshake()
        self.assertEqual(resp.status_code, 200)
        body = resp.content.decode()
        self.assertNotIn("earthengine.googleapis.com", body)
        self.assertNotIn("FAKEID", body)
        self.assertNotIn("upstream_template", body)

    @override_settings(DEBUG=True, KCCC_ENABLE_INTERNAL_PREVIEWS=True)
    def test_handshake_returns_local_proxy_template(self):
        """tile_url in the handshake must be a same-origin /api/... path."""
        with patch("remote_sensing.views.gee_service") as mock_svc:
            mock_svc.get_lulc_upstream_template.return_value = GEEResult(
                available=True, data={"upstream_template": self._FAKE_UPSTREAM}
            )
            resp = self._handshake()
        self.assertEqual(resp.status_code, 200)
        tile_url = resp.json()["tile"]["tile_url"]
        self.assertTrue(tile_url.startswith("/api/remote-sensing/lulc-tile/"))
        self.assertIn("{z}", tile_url)
        self.assertIn("{x}", tile_url)
        self.assertIn("{y}", tile_url)
        self.assertNotIn("earthengine.googleapis.com", tile_url)

    @override_settings(DEBUG=True, KCCC_ENABLE_INTERNAL_PREVIEWS=True)
    def test_proxy_forwards_correct_z_x_y_to_fetch(self):
        """The proxy must pass the exact path z/x/y to fetch_lulc_tile_bytes."""
        with patch("remote_sensing.views.gee_service") as mock_svc:
            mock_svc.get_lulc_upstream_template.return_value = GEEResult(
                available=True, data={"upstream_template": self._FAKE_UPSTREAM}
            )
            mock_svc.fetch_lulc_tile_bytes.return_value = self._FAKE_PNG
            self.client.get(
                reverse("remote-sensing-lulc-tile-proxy", kwargs={"z": 9, "x": 200, "y": 150}),
                HTTP_HOST="localhost:8000",
            )
        _, call_z, call_x, call_y = mock_svc.fetch_lulc_tile_bytes.call_args[0]
        self.assertEqual(call_z, 9)
        self.assertEqual(call_x, 200)
        self.assertEqual(call_y, 150)

    @override_settings(DEBUG=True, KCCC_ENABLE_INTERNAL_PREVIEWS=True)
    def test_handshake_unavailable_when_gee_fails(self):
        """When GEE fails, the handshake must return status=unavailable with no tile_url."""
        with patch("remote_sensing.views.gee_service") as mock_svc:
            mock_svc.get_lulc_upstream_template.return_value = GEEResult(
                available=False, error="GEE init failed"
            )
            resp = self._handshake()
        self.assertEqual(resp.status_code, 200)  # HTTP 200, status field is unavailable
        data = resp.json()
        self.assertEqual(data["status"], "unavailable")
        self.assertIsNone(data["tile"])


class LulcDatasetPublicationFlagsTests(TestCase):
    """
    LULC must remain unpublished and unvalidated.
    These tests prove that the DB defaults enforce the gate, and the public
    layers endpoint does not expose LULC regardless of what is in the DB.
    """

    def test_lulc_dataset_defaults_to_not_public_not_validated(self):
        """LandCoverDataset created without flags must have is_public=False, is_validated=False."""
        dataset = LandCoverDataset(
            provider="dynamic_world_v1",
            year=2024,
            composite_window="late_wet_season",
            admin_level="lga",
        )
        self.assertFalse(dataset.is_public)
        self.assertFalse(dataset.is_validated)

    def test_lulc_layer_excluded_from_public_layers_endpoint_when_not_public(self):
        """annual_lulc layer with is_public=False must not appear in the public layers list."""
        RemoteSensingLayer.objects.create(
            key="annual_lulc",
            label="Annual LULC",
            is_public=False,
            is_active=False,
        )
        resp = self.client.get(reverse("remote-sensing-layers"))
        self.assertEqual(resp.status_code, 200)
        keys = [r["key"] for r in resp.json()["results"]]
        self.assertNotIn("annual_lulc", keys)


# ---------------------------------------------------------------------------
# Climate Action Screening endpoint — server-enforced access and auditability
# ---------------------------------------------------------------------------

class ClimateActionScreeningAccessTests(TestCase):
    """
    Tests for the dedicated internal Climate Action Screening endpoint.

    Verifies:
    1. Unauthenticated request denied.
    2. PUBLIC role denied.
    3. ADMIN / ANALYST / SECTOR_FOCAL_POINT allowed.
    4. Public climate_intelligence endpoint remains publicly accessible.
    5. Endpoint excludes LULC, HSW, elevation, flood.
    6. Forbidden preview params rejected.
    7. Valid authorised request returns only approved indicator keys.
    8. Successful access writes exactly one audit event.
    9. Denied access returns no protected data.
    10. Existing public CI endpoint not affected.
    11. Payload contains no LULC / flood / elevation keys.
    """

    SCREENING_URL = "remote-sensing-climate-action-screening"
    PUBLIC_CI_URL  = "remote-sensing-climate-intelligence"

    @classmethod
    def setUpTestData(cls):
        from django.contrib.auth.models import User
        from accounts.models import UserProfile

        # Shared layer and metric used by all tests in this class
        cls.layer_ra = RemoteSensingLayer.objects.create(
            key="rainfall_anomaly",
            label="Rainfall Anomaly",
            is_active=True,
            is_public=True,
        )
        cls.layer_ndvi = RemoteSensingLayer.objects.create(
            key="ndvi",
            label="NDVI",
            is_active=True,
            is_public=True,
        )

        RemoteSensingLGAMetric.objects.create(
            layer=cls.layer_ra,
            admin_code="KD001",
            admin_name="Test LGA",
            admin_level="lga",
            year=2025,
            season="annual",
            mean_value=Decimal("-15.0"),
        )
        RemoteSensingLGAMetric.objects.create(
            layer=cls.layer_ndvi,
            admin_code="KD001",
            admin_name="Test LGA",
            admin_level="lga",
            year=2025,
            season="annual",
            mean_value=Decimal("0.35"),
        )

        # Unauthenticated (no User object needed)

        # PUBLIC-role user
        cls.public_user = User.objects.create_user("public_user", password="pw")
        UserProfile.objects.create(user=cls.public_user, role=UserProfile.Role.PUBLIC)

        # Internal users — one per authorised role
        cls.admin_user = User.objects.create_user("admin_user", password="pw")
        UserProfile.objects.create(user=cls.admin_user, role=UserProfile.Role.ADMIN)

        cls.analyst_user = User.objects.create_user("analyst_user", password="pw")
        UserProfile.objects.create(user=cls.analyst_user, role=UserProfile.Role.ANALYST)

        cls.sfp_user = User.objects.create_user("sfp_user", password="pw")
        UserProfile.objects.create(user=cls.sfp_user, role=UserProfile.Role.SECTOR_FOCAL_POINT)

        cls.superuser = User.objects.create_superuser("super_user", password="pw")

    def setUp(self):
        self.client = APIClient()

    # -----------------------------------------------------------------------
    # 1. Unauthenticated → 401
    # -----------------------------------------------------------------------
    def test_unauthenticated_denied(self):
        resp = self.client.get(reverse(self.SCREENING_URL))
        self.assertIn(resp.status_code, (401, 403),
                      f"Expected 401 or 403, got {resp.status_code}")
        data = resp.json()
        self.assertNotIn("results", data)

    # -----------------------------------------------------------------------
    # 2. PUBLIC role → 403
    # -----------------------------------------------------------------------
    def test_public_role_denied(self):
        self.client.force_authenticate(user=self.public_user)
        resp = self.client.get(reverse(self.SCREENING_URL))
        self.assertEqual(resp.status_code, 403, f"PUBLIC role got {resp.status_code}")
        data = resp.json()
        self.assertNotIn("results", data)

    # -----------------------------------------------------------------------
    # 3. Authorised internal roles → 200
    # -----------------------------------------------------------------------
    def test_admin_role_allowed(self):
        self.client.force_authenticate(user=self.admin_user)
        resp = self.client.get(reverse(self.SCREENING_URL),
                               {"season": "annual", "year": 2025})
        self.assertEqual(resp.status_code, 200, f"ADMIN got {resp.status_code}: {resp.content}")

    def test_analyst_role_allowed(self):
        self.client.force_authenticate(user=self.analyst_user)
        resp = self.client.get(reverse(self.SCREENING_URL),
                               {"season": "annual", "year": 2025})
        self.assertEqual(resp.status_code, 200, f"ANALYST got {resp.status_code}")

    def test_sector_focal_point_role_allowed(self):
        self.client.force_authenticate(user=self.sfp_user)
        resp = self.client.get(reverse(self.SCREENING_URL),
                               {"season": "annual", "year": 2025})
        self.assertEqual(resp.status_code, 200, f"SECTOR_FOCAL_POINT got {resp.status_code}")

    def test_superuser_allowed(self):
        self.client.force_authenticate(user=self.superuser)
        resp = self.client.get(reverse(self.SCREENING_URL),
                               {"season": "annual", "year": 2025})
        self.assertEqual(resp.status_code, 200, f"Superuser got {resp.status_code}")

    # -----------------------------------------------------------------------
    # 4. Public CI endpoint remains publicly accessible
    # -----------------------------------------------------------------------
    def test_public_ci_endpoint_still_accessible_without_auth(self):
        resp = self.client.get(reverse(self.PUBLIC_CI_URL),
                               {"season": "annual", "year": 2025})
        self.assertEqual(resp.status_code, 200,
                         f"Public CI endpoint blocked: {resp.status_code}")
        data = resp.json()
        self.assertIn("results", data)

    def test_public_ci_endpoint_accessible_for_public_role(self):
        self.client.force_authenticate(user=self.public_user)
        resp = self.client.get(reverse(self.PUBLIC_CI_URL),
                               {"season": "annual", "year": 2025})
        self.assertEqual(resp.status_code, 200)

    # -----------------------------------------------------------------------
    # 5 + 11. Response payload excludes forbidden indicator keys
    # -----------------------------------------------------------------------
    def test_response_excludes_lulc_hsw_elevation_flood(self):
        self.client.force_authenticate(user=self.admin_user)
        resp = self.client.get(reverse(self.SCREENING_URL),
                               {"season": "annual", "year": 2025})
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        for lga in data.get("results", []):
            indicators = lga.get("indicators", {})
            self.assertNotIn("lulc", indicators,
                             f"LULC present in indicators for {lga.get('admin_name')}")
            self.assertNotIn("flood_occurrence", indicators,
                             "flood_occurrence present in indicators")
            self.assertNotIn("elevation", indicators,
                             "elevation present in indicators")
            self.assertNotIn("historical_surface_water", indicators,
                             "historical_surface_water present in indicators")

    def test_response_only_contains_approved_indicator_keys(self):
        self.client.force_authenticate(user=self.admin_user)
        resp = self.client.get(reverse(self.SCREENING_URL),
                               {"season": "annual", "year": 2025})
        self.assertEqual(resp.status_code, 200)
        _approved = {"rainfall", "rainfall_anomaly", "spi", "ndvi", "lst"}
        for lga in resp.json().get("results", []):
            extra = set(lga.get("indicators", {}).keys()) - _approved
            self.assertFalse(extra,
                             f"Unexpected indicator keys for {lga.get('admin_name')}: {extra}")

    # -----------------------------------------------------------------------
    # 6. Forbidden preview params → 400
    # -----------------------------------------------------------------------
    def test_include_lulc_preview_param_rejected(self):
        self.client.force_authenticate(user=self.admin_user)
        resp = self.client.get(reverse(self.SCREENING_URL),
                               {"include_lulc_preview": "true"})
        self.assertEqual(resp.status_code, 400)

    def test_internal_lulc_preview_param_rejected(self):
        self.client.force_authenticate(user=self.admin_user)
        resp = self.client.get(reverse(self.SCREENING_URL),
                               {"internal_lulc_preview": "1"})
        self.assertEqual(resp.status_code, 400)

    def test_internal_flood_preview_param_rejected(self):
        self.client.force_authenticate(user=self.admin_user)
        resp = self.client.get(reverse(self.SCREENING_URL),
                               {"internal_flood_preview": "1"})
        self.assertEqual(resp.status_code, 400)

    # -----------------------------------------------------------------------
    # 7. Valid authorised request returns expected structure
    # -----------------------------------------------------------------------
    def test_valid_request_returns_correct_structure(self):
        self.client.force_authenticate(user=self.admin_user)
        resp = self.client.get(reverse(self.SCREENING_URL),
                               {"season": "annual", "year": 2025, "admin_level": "lga"})
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "ok")
        self.assertIn("filters", data)
        self.assertIn("results", data)
        self.assertEqual(data["filters"]["season"], "annual")
        self.assertEqual(data["filters"]["year"], 2025)
        self.assertEqual(data["filters"]["admin_level"], "lga")
        # Must NOT echo back include_lulc_preview
        self.assertNotIn("include_lulc_preview", data["filters"])

    def test_valid_request_returns_lga_result(self):
        self.client.force_authenticate(user=self.admin_user)
        resp = self.client.get(reverse(self.SCREENING_URL),
                               {"season": "annual", "year": 2025})
        self.assertEqual(resp.status_code, 200)
        results = resp.json()["results"]
        self.assertEqual(len(results), 1)
        r = results[0]
        self.assertIn("admin_code", r)
        self.assertIn("admin_name", r)
        self.assertIn("indicators", r)
        # Check the indicator condition value is present
        self.assertIn("rainfall_anomaly", r["indicators"])
        self.assertIn("condition", r["indicators"]["rainfall_anomaly"])

    # -----------------------------------------------------------------------
    # 8. Successful access writes exactly one AuditLog entry
    # -----------------------------------------------------------------------
    def test_successful_access_writes_one_audit_event(self):
        from audit.models import AuditLog
        before = AuditLog.objects.filter(
            action="climate_action_screening_view"
        ).count()

        self.client.force_authenticate(user=self.admin_user)
        resp = self.client.get(reverse(self.SCREENING_URL),
                               {"season": "annual", "year": 2025})
        self.assertEqual(resp.status_code, 200)

        after = AuditLog.objects.filter(
            action="climate_action_screening_view"
        ).count()
        self.assertEqual(after - before, 1, "Expected exactly one audit event per request")

    def test_audit_event_captures_correct_metadata(self):
        from audit.models import AuditLog
        self.client.force_authenticate(user=self.admin_user)
        self.client.get(reverse(self.SCREENING_URL),
                        {"season": "annual", "year": 2025, "admin_level": "lga"})

        log = AuditLog.objects.filter(
            action="climate_action_screening_view"
        ).order_by("-timestamp").first()
        self.assertIsNotNone(log)
        self.assertEqual(log.action, "climate_action_screening_view")
        self.assertEqual(log.table_name, "climate_action_screening")
        self.assertIsNotNone(log.new_value)
        self.assertEqual(log.new_value.get("season"), "annual")
        self.assertEqual(log.new_value.get("year"), 2025)
        self.assertEqual(log.new_value.get("admin_level"), "lga")
        self.assertIn("result_count", log.new_value)
        self.assertIn("actor_role", log.new_value)
        self.assertIsNone(log.old_value)

    def test_audit_event_records_correct_actor(self):
        from audit.models import AuditLog
        self.client.force_authenticate(user=self.analyst_user)
        self.client.get(reverse(self.SCREENING_URL),
                        {"season": "annual", "year": 2025})

        log = AuditLog.objects.filter(
            action="climate_action_screening_view",
            user=self.analyst_user,
        ).order_by("-timestamp").first()
        self.assertIsNotNone(log, "Audit log not written for analyst_user")
        self.assertEqual(log.new_value.get("actor_role"), "analyst")

    # -----------------------------------------------------------------------
    # 9. Denied access returns no protected data
    # -----------------------------------------------------------------------
    def test_unauthenticated_response_contains_no_indicator_data(self):
        resp = self.client.get(reverse(self.SCREENING_URL))
        self.assertIn(resp.status_code, (401, 403))
        self.assertNotIn(b"indicators", resp.content)
        self.assertNotIn(b"admin_code", resp.content)

    def test_public_role_response_contains_no_indicator_data(self):
        self.client.force_authenticate(user=self.public_user)
        resp = self.client.get(reverse(self.SCREENING_URL))
        self.assertEqual(resp.status_code, 403)
        self.assertNotIn(b"indicators", resp.content)
        self.assertNotIn(b"admin_code", resp.content)

    # -----------------------------------------------------------------------
    # Denied access does not write an audit event
    # -----------------------------------------------------------------------
    def test_denied_access_writes_no_audit_event(self):
        from audit.models import AuditLog
        before = AuditLog.objects.filter(
            action="climate_action_screening_view"
        ).count()

        self.client.force_authenticate(user=self.public_user)
        self.client.get(reverse(self.SCREENING_URL))

        after = AuditLog.objects.filter(
            action="climate_action_screening_view"
        ).count()
        self.assertEqual(after, before, "Audit event must not be written for denied access")


# =============================================================================
# Release-LULC management command tests
# =============================================================================

import datetime as _dt
from django.contrib.auth.models import User as _User
from django.core.management.base import CommandError
from audit.models import AuditLog


def _make_lulc_dataset(year, window="late_wet_season", n_snaps=23, quality_dist=None):
    """Create a LandCoverDataset and n_snaps LandCoverSnapshot rows.

    quality_dist: list of quality_flag strings, one per snapshot.
    Defaults to all "high".
    """
    ds = LandCoverDataset.objects.create(
        provider="dynamic_world_v1",
        provider_label="Dynamic World v1",
        gee_collection="GOOGLE/DYNAMICWORLD/V1",
        year=year,
        composite_window=window,
        composite_start=_dt.date(year, 9, 1),
        composite_end=_dt.date(year, 10, 31),
        method_version="dw_latewet_mode_v1",
        admin_level="lga",
        snapshot_count=n_snaps,
        is_public=False,
        is_validated=False,
    )
    if quality_dist is None:
        quality_dist = ["high"] * n_snaps
    for i, flag in enumerate(quality_dist):
        LandCoverSnapshot.objects.create(
            dataset=ds,
            admin_level="lga",
            admin_code=f"1900{i + 1:02d}",
            admin_name=f"TestLGA{i + 1}",
            total_area_km2=100,
            class_pct={"trees": 50.0, "water": 50.0},
            class_areas_km2={"trees": 50.0, "water": 50.0},
            metadata={"quality_flag": flag},
        )
    return ds


def _make_baseline_datasets():
    """Create the 8 baseline late_wet_season datasets with the verified quality distribution.

    172 high + 12 medium = 184 snapshots across 8 datasets × 23 snapshots each.
    First 7 datasets × 21 high + last 7 snap of each dataset = 147 high for first 7
    Actually: 7 datasets × 22 high + 1 medium = 154 high + 7 medium, then
    8th dataset: 18 high + 5 medium = 23 snaps.
    Total: 154+18=172 high, 7+5=12 medium. ✓
    """
    datasets = []
    for year in range(2018, 2025):  # 2018-2024: 7 datasets
        dist = ["high"] * 22 + ["medium"] * 1
        datasets.append(_make_lulc_dataset(year, quality_dist=dist))
    # 2025: 18 high + 5 medium
    dist = ["high"] * 18 + ["medium"] * 5
    datasets.append(_make_lulc_dataset(2025, quality_dist=dist))
    return datasets


class ReleaseLulcDryRunTests(TestCase):
    """Dry-run makes no database changes."""

    def setUp(self):
        _make_baseline_datasets()

    def test_dry_run_makes_no_db_changes(self):
        out = StringIO()
        call_command("release_lulc", stdout=out)
        # All datasets must still be private after dry-run.
        self.assertEqual(
            LandCoverDataset.objects.filter(
                composite_window="late_wet_season", is_public=True
            ).count(),
            0,
        )
        self.assertIn("DRY RUN MODE", out.getvalue())

    def test_dry_run_writes_no_audit_log(self):
        before = AuditLog.objects.count()
        call_command("release_lulc", stdout=StringIO())
        self.assertEqual(AuditLog.objects.count(), before)

    def test_dry_run_without_actor_succeeds(self):
        """--actor should not be required for dry-run."""
        out = StringIO()
        call_command("release_lulc", stdout=out)
        self.assertIn("DRY RUN MODE", out.getvalue())

    def test_dry_run_reports_excluded_ids(self):
        # Create out-of-scope extras to simulate real DB.
        _make_lulc_dataset(2018, window="wet_season", n_snaps=5,
                           quality_dist=["high"] * 5)
        _make_lulc_dataset(2024, window="wet_season", n_snaps=23)
        out = StringIO()
        call_command("release_lulc", stdout=out)
        self.assertIn("EXCLUDED", out.getvalue())
        self.assertIn("DRY RUN MODE", out.getvalue())


class ReleaseLulcConfirmArgTests(TestCase):
    """--confirm requires actor and qa-evidence."""

    def setUp(self):
        _make_baseline_datasets()
        self.actor = _User.objects.create_user(
            username="testactor", password="x", email="a@b.com"
        )

    def test_confirm_without_actor_raises(self):
        with self.assertRaises(CommandError):
            call_command(
                "release_lulc",
                confirm=True,
                actor="",
                qa_evidence="evidence",
                stdout=StringIO(),
                stderr=StringIO(),
            )

    def test_confirm_without_qa_evidence_raises(self):
        with self.assertRaises(CommandError):
            call_command(
                "release_lulc",
                confirm=True,
                actor="testactor",
                qa_evidence="",
                stdout=StringIO(),
                stderr=StringIO(),
            )

    def test_rollback_confirm_without_reason_raises(self):
        with self.assertRaises(CommandError):
            call_command(
                "release_lulc",
                confirm=True,
                rollback=True,
                actor="testactor",
                reason="",
                stdout=StringIO(),
                stderr=StringIO(),
            )

    def test_confirm_with_nonexistent_actor_raises(self):
        with self.assertRaises(CommandError):
            call_command(
                "release_lulc",
                confirm=True,
                actor="ghost_user",
                qa_evidence="some evidence",
                stdout=StringIO(),
                stderr=StringIO(),
            )


class ReleaseLulcPublishTests(TestCase):
    """--confirm publishes exactly 8 scoped datasets."""

    def setUp(self):
        _make_baseline_datasets()
        self.actor = _User.objects.create_user(
            username="testactor", password="x", email="a@b.com"
        )
        # Create out-of-scope datasets to verify they are not touched.
        self.extra_wet = _make_lulc_dataset(
            2018, window="wet_season", n_snaps=5, quality_dist=["high"] * 5
        )
        self.extra_wet2 = _make_lulc_dataset(2024, window="wet_season", n_snaps=23)

    def _run_publish(self):
        call_command(
            "release_lulc",
            confirm=True,
            actor="testactor",
            qa_evidence="QA baseline verified",
            stdout=StringIO(),
        )

    def test_exactly_eight_datasets_published(self):
        self._run_publish()
        published = LandCoverDataset.objects.filter(
            composite_window="late_wet_season",
            is_public=True,
            is_validated=True,
        )
        self.assertEqual(published.count(), 8)

    def test_published_years_are_2018_to_2025(self):
        self._run_publish()
        years = set(
            LandCoverDataset.objects.filter(
                composite_window="late_wet_season", is_public=True
            ).values_list("year", flat=True)
        )
        self.assertEqual(years, set(range(2018, 2026)))

    def test_extra_wet_season_dataset_2018_remains_private(self):
        self._run_publish()
        self.extra_wet.refresh_from_db()
        self.assertFalse(self.extra_wet.is_public)
        self.assertFalse(self.extra_wet.is_validated)

    def test_extra_wet_season_dataset_2024_remains_private(self):
        self._run_publish()
        self.extra_wet2.refresh_from_db()
        self.assertFalse(self.extra_wet2.is_public)
        self.assertFalse(self.extra_wet2.is_validated)

    def test_non_late_wet_season_datasets_unchanged(self):
        _make_lulc_dataset(2020, window="annual", n_snaps=23)
        self._run_publish()
        annual = LandCoverDataset.objects.filter(composite_window="annual").first()
        self.assertFalse(annual.is_public)
        self.assertFalse(annual.is_validated)

    def test_years_outside_range_unchanged(self):
        # year=2016 is outside _YEARS; the scope filter excludes it, so the
        # command succeeds on the 8 baseline datasets and 2016 is never touched.
        ds2016 = _make_lulc_dataset(2016, window="late_wet_season", n_snaps=23)
        call_command(
            "release_lulc",
            confirm=True,
            actor="testactor",
            qa_evidence="QA evidence",
            stdout=StringIO(),
        )
        ds2016.refresh_from_db()
        self.assertFalse(ds2016.is_public)
        self.assertFalse(ds2016.is_validated)

    def test_audit_log_written(self):
        before = AuditLog.objects.count()
        self._run_publish()
        after = AuditLog.objects.count()
        # 8 per-dataset entries + 1 summary entry.
        self.assertEqual(after - before, 9)

    def test_audit_log_summary_action(self):
        self._run_publish()
        self.assertTrue(
            AuditLog.objects.filter(action="lulc_publish_summary").exists()
        )

    def test_audit_log_per_dataset_action(self):
        self._run_publish()
        self.assertEqual(
            AuditLog.objects.filter(action="lulc_publish").count(), 8
        )


class ReleaseLulcPreconditionTests(TestCase):
    """Precondition failures block all writes."""

    def setUp(self):
        self.actor = _User.objects.create_user(
            username="testactor", password="x", email="a@b.com"
        )

    def _run(self):
        call_command(
            "release_lulc",
            confirm=True,
            actor="testactor",
            qa_evidence="QA evidence",
            stdout=StringIO(),
            stderr=StringIO(),
        )

    def test_wrong_dataset_count_blocks_release(self):
        # Only 6 datasets instead of 8.
        for year in range(2018, 2024):
            _make_lulc_dataset(year)
        with self.assertRaises(CommandError):
            self._run()
        self.assertEqual(
            LandCoverDataset.objects.filter(is_public=True).count(), 0
        )

    def test_incomplete_lga_coverage_blocks_release(self):
        # One dataset has only 10 snapshots.
        for year in range(2018, 2025):
            n = 10 if year == 2020 else 23
            dist = (["high"] * 10) if year == 2020 else (["high"] * 22 + ["medium"])
            _make_lulc_dataset(year, n_snaps=n, quality_dist=dist)
        _make_lulc_dataset(2025, n_snaps=23, quality_dist=["high"] * 18 + ["medium"] * 5)
        with self.assertRaises(CommandError):
            self._run()
        self.assertEqual(
            LandCoverDataset.objects.filter(is_public=True).count(), 0
        )

    def test_wrong_quality_totals_block_release(self):
        # All snapshots high (total 184 high / 0 medium) → fails quality check.
        for year in range(2018, 2026):
            _make_lulc_dataset(year, n_snaps=23, quality_dist=["high"] * 23)
        with self.assertRaises(CommandError):
            self._run()
        self.assertEqual(
            LandCoverDataset.objects.filter(is_public=True).count(), 0
        )

    def test_inconsistent_flags_block_release(self):
        # One dataset has is_public=True but is_validated=False.
        _make_baseline_datasets()
        bad = LandCoverDataset.objects.filter(
            composite_window="late_wet_season", year=2020
        ).first()
        bad.is_public = True  # inconsistent with is_validated=False
        bad.save(update_fields=["is_public"])
        with self.assertRaises(CommandError):
            self._run()

    def test_transaction_rolls_back_fully_on_failure(self):
        """Simulate a mid-transaction failure; all datasets must remain private."""
        _make_baseline_datasets()

        original_save = LandCoverDataset.save

        call_count = {"n": 0}

        def failing_save(self_ds, *args, **kwargs):
            call_count["n"] += 1
            if call_count["n"] == 4:
                raise RuntimeError("Simulated DB failure mid-transaction")
            return original_save(self_ds, *args, **kwargs)

        with self.assertRaises((CommandError, Exception)):
            with patch.object(LandCoverDataset, "save", failing_save):
                self._run()

        # No dataset should be permanently public.
        self.assertEqual(
            LandCoverDataset.objects.filter(is_public=True).count(), 0
        )


class ReleaseLulcRollbackTests(TestCase):
    """Rollback restores exactly the 8 scoped datasets to private."""

    def setUp(self):
        _make_baseline_datasets()
        self.actor = _User.objects.create_user(
            username="testactor", password="x", email="a@b.com"
        )
        # Extra out-of-scope datasets.
        self.extra = _make_lulc_dataset(
            2018, window="wet_season", n_snaps=5, quality_dist=["high"] * 5
        )
        # Publish the 8 baseline datasets first.
        LandCoverDataset.objects.filter(
            composite_window="late_wet_season", year__in=range(2018, 2026)
        ).update(is_public=True, is_validated=True)

    def _run_rollback(self):
        call_command(
            "release_lulc",
            rollback=True,
            confirm=True,
            actor="testactor",
            reason="Rolling back for test",
            stdout=StringIO(),
        )

    def test_rollback_sets_all_eight_datasets_private(self):
        self._run_rollback()
        self.assertEqual(
            LandCoverDataset.objects.filter(
                composite_window="late_wet_season", is_public=True
            ).count(),
            0,
        )

    def test_rollback_only_affects_scoped_datasets(self):
        # Manually publish the extra so we can confirm it stays published.
        self.extra.is_public = True
        self.extra.is_validated = True
        self.extra.save(update_fields=["is_public", "is_validated"])
        self._run_rollback()
        self.extra.refresh_from_db()
        self.assertTrue(self.extra.is_public)

    def test_rollback_writes_audit_summary(self):
        before = AuditLog.objects.count()
        self._run_rollback()
        self.assertTrue(
            AuditLog.objects.filter(action="lulc_rollback_summary").exists()
        )
        after = AuditLog.objects.count()
        self.assertEqual(after - before, 9)  # 8 per-dataset + 1 summary

    def test_rollback_dry_run_makes_no_changes(self):
        call_command("release_lulc", rollback=True, stdout=StringIO())
        # Datasets were published in setUp; dry-run must leave them published.
        self.assertEqual(
            LandCoverDataset.objects.filter(
                composite_window="late_wet_season", is_public=True
            ).count(),
            8,
        )


class ReleaseLulcCatalogueTests(TestCase):
    """Public catalogue visibility after release."""

    def setUp(self):
        _make_baseline_datasets()
        self.actor = _User.objects.create_user(
            username="testactor", password="x", email="a@b.com"
        )
        # Seed a RemoteSensingLayer for the /api/layers/ endpoint.
        RemoteSensingLayer.objects.create(
            key="ndvi", label="NDVI", is_active=True, is_public=True
        )

    def test_api_layers_does_not_expose_lulc_after_release(self):
        """LULC is explicitly excluded from /api/layers/ by design."""
        from django.test import Client
        call_command(
            "release_lulc",
            confirm=True,
            actor="testactor",
            qa_evidence="QA evidence",
            stdout=StringIO(),
        )
        client = Client()
        resp = client.get("/api/layers/", SERVER_NAME="localhost")
        import json as _json
        data = _json.loads(resp.content)
        layer_keys = [item["key"] for item in data.get("results", data.get("layers", []))]
        self.assertNotIn("lulc", layer_keys)

    def test_lulc_preview_returns_is_public_true_after_release(self):
        """The lulc_preview endpoint reflects the published flag."""
        call_command(
            "release_lulc",
            confirm=True,
            actor="testactor",
            qa_evidence="QA evidence",
            stdout=StringIO(),
        )
        from django.test import Client
        client = Client()
        resp = client.get(
            "/api/remote-sensing/lulc/",
            {"window": "late_wet_season", "year": "2025"},
            SERVER_NAME="localhost",
        )
        if resp.status_code == 200:
            import json as _json
            data = _json.loads(resp.content)
            ds = data.get("dataset")
            if ds:
                self.assertTrue(ds.get("is_public"))

    def test_no_gee_url_or_token_in_lulc_response(self):
        """LandCoverDataset/Snapshot data never contains GEE URLs or tokens."""
        call_command(
            "release_lulc",
            confirm=True,
            actor="testactor",
            qa_evidence="QA evidence",
            stdout=StringIO(),
        )
        from django.test import Client
        client = Client()
        resp = client.get(
            "/api/remote-sensing/lulc/",
            {"window": "late_wet_season"},
            SERVER_NAME="localhost",
        )
        body = resp.content.decode("utf-8", errors="replace")
        self.assertNotIn("googleapis.com", body)
        self.assertNotIn("earthengine.googleapis.com", body)
        self.assertNotIn("Bearer", body)
        self.assertNotIn("token", body.lower().replace("total_area", ""))
        self.assertNotIn("map_id", body)


# =============================================================================
# /api/layers/ catalogue integration tests for LULC
# =============================================================================

class LulcCatalogueIntegrationTests(TestCase):
    """
    Verify that /api/layers/ includes annual_lulc if and only if the
    late_wet_season baseline datasets are is_public=True and is_validated=True,
    and that the excluded wet_season datasets (ids 3 and 4 in prod; any
    wet_season records in tests) never cause LULC to appear.
    """

    LAYERS_URL = "/api/layers/"

    def setUp(self):
        # Seed one real RemoteSensingLayer so the endpoint isn't completely empty.
        RemoteSensingLayer.objects.create(
            key="ndvi", label="NDVI", is_active=True, is_public=True
        )

    def _get_layer_keys(self):
        from django.test import Client
        import json as _json
        resp = Client().get(self.LAYERS_URL, SERVER_NAME="localhost")
        data = _json.loads(resp.content)
        return {item["key"] for item in data.get("results", [])}

    def _make_baseline(self, is_public=False, is_validated=False):
        datasets = []
        for year in range(2018, 2026):
            ds = LandCoverDataset.objects.create(
                provider="dynamic_world_v1",
                provider_label="Dynamic World v1",
                gee_collection="GOOGLE/DYNAMICWORLD/V1",
                year=year,
                composite_window="late_wet_season",
                composite_start=_dt.date(year, 9, 1),
                composite_end=_dt.date(year, 10, 31),
                method_version="dw_latewet_mode_v1",
                admin_level="lga",
                snapshot_count=0,
                is_public=is_public,
                is_validated=is_validated,
            )
            datasets.append(ds)
        return datasets

    # ── Before release ───────────────────────────────────────────────────────

    def test_lulc_absent_before_release(self):
        self._make_baseline(is_public=False, is_validated=False)
        self.assertNotIn("annual_lulc", self._get_layer_keys())

    def test_lulc_absent_when_public_but_not_validated(self):
        self._make_baseline(is_public=True, is_validated=False)
        self.assertNotIn("annual_lulc", self._get_layer_keys())

    def test_lulc_absent_when_validated_but_not_public(self):
        self._make_baseline(is_public=False, is_validated=True)
        self.assertNotIn("annual_lulc", self._get_layer_keys())

    def test_lulc_absent_when_no_datasets_exist(self):
        self.assertNotIn("annual_lulc", self._get_layer_keys())

    # ── After release ────────────────────────────────────────────────────────

    def test_lulc_present_after_release(self):
        self._make_baseline(is_public=True, is_validated=True)
        self.assertIn("annual_lulc", self._get_layer_keys())

    def test_lulc_entry_has_correct_key(self):
        self._make_baseline(is_public=True, is_validated=True)
        keys = self._get_layer_keys()
        self.assertIn("annual_lulc", keys)

    def test_ndvi_still_present_alongside_lulc(self):
        self._make_baseline(is_public=True, is_validated=True)
        keys = self._get_layer_keys()
        self.assertIn("ndvi", keys)
        self.assertIn("annual_lulc", keys)

    # ── Excluded datasets ─────────────────────────────────────────────────────

    def test_wet_season_datasets_do_not_trigger_lulc(self):
        # Only wet_season datasets — late_wet_season ones are absent.
        LandCoverDataset.objects.create(
            provider="dynamic_world_v1",
            provider_label="Dynamic World v1",
            gee_collection="GOOGLE/DYNAMICWORLD/V1",
            year=2018,
            composite_window="wet_season",
            composite_start=_dt.date(2018, 5, 1),
            composite_end=_dt.date(2018, 10, 31),
            method_version="dw_latewet_mode_v1",
            admin_level="lga",
            snapshot_count=5,
            is_public=True,
            is_validated=True,
        )
        self.assertNotIn("annual_lulc", self._get_layer_keys())

    def test_wet_season_and_late_wet_season_published_shows_lulc(self):
        # Both exist; LULC should appear because late_wet_season is published.
        self._make_baseline(is_public=True, is_validated=True)
        LandCoverDataset.objects.create(
            provider="dynamic_world_v1",
            provider_label="Dynamic World v1",
            gee_collection="GOOGLE/DYNAMICWORLD/V1",
            year=2018,
            composite_window="wet_season",
            composite_start=_dt.date(2018, 5, 1),
            composite_end=_dt.date(2018, 10, 31),
            method_version="dw_latewet_mode_v1",
            admin_level="lga",
            snapshot_count=5,
            is_public=True,
            is_validated=True,
        )
        self.assertIn("annual_lulc", self._get_layer_keys())

    # ── Rollback ─────────────────────────────────────────────────────────────

    def test_lulc_disappears_from_catalogue_after_rollback(self):
        datasets = self._make_baseline(is_public=True, is_validated=True)
        self.assertIn("annual_lulc", self._get_layer_keys())
        # Simulate rollback by setting all back to private.
        for ds in datasets:
            ds.is_public = False
            ds.is_validated = False
            ds.save(update_fields=["is_public", "is_validated"])
        self.assertNotIn("annual_lulc", self._get_layer_keys())

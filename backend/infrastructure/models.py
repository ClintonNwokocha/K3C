from django.db import models


# PostGIS upgrade path (when ready):
#
#   1. Install GDAL/GEOS system packages (e.g. OSGeo4W on Windows, libgdal-dev on Linux).
#   2. Add "django.contrib.gis" to INSTALLED_APPS.
#   3. Switch DATABASE ENGINE to "django.contrib.gis.db.backends.postgis".
#   4. Run: CREATE EXTENSION IF NOT EXISTS postgis; in PostgreSQL.
#   5. Replace latitude+longitude DecimalFields with:
#          from django.contrib.gis.db import models as gis_models
#          geometry = gis_models.PointField(srid=4326, null=True, blank=True)
#      and add: gis_models.Index(using="gist", fields=["geometry"]) to Meta.indexes.
#   6. Generate and run the geometry migration.
#
# The serializer already emits a GeoJSON "geometry" field computed from lat/lng,
# so the API surface will not change when the upgrade happens.


class HealthFacility(models.Model):
    """
    A health facility serving Kaduna State residents.

    Supports future climate vulnerability and risk analysis — e.g. how many
    health facilities fall within a flood hazard zone or an LST hotspot.
    No risk scoring is implemented here; this model stores facility facts only.
    """

    class FacilityType(models.TextChoices):
        PRIMARY_HEALTH_CENTRE = "phc", "Primary Health Centre"
        SECONDARY_HOSPITAL = "secondary", "Secondary Hospital"
        TERTIARY_HOSPITAL = "tertiary", "Tertiary Hospital"
        CLINIC = "clinic", "Clinic"
        MATERNITY = "maternity", "Maternity Home"
        DISPENSARY = "dispensary", "Dispensary"
        OTHER = "other", "Other"

    class Ownership(models.TextChoices):
        PUBLIC = "public", "Public (Government)"
        PRIVATE = "private", "Private"
        FAITH_BASED = "faith_based", "Faith-Based"
        NGO = "ngo", "NGO / International"

    class FunctionalStatus(models.TextChoices):
        FUNCTIONAL = "functional", "Functional"
        PARTIAL = "partial", "Partially Functional"
        NON_FUNCTIONAL = "non_functional", "Non-Functional"
        UNKNOWN = "unknown", "Unknown"

    name = models.CharField(max_length=255)
    facility_type = models.CharField(
        max_length=30,
        choices=FacilityType.choices,
        default=FacilityType.OTHER,
    )
    ownership = models.CharField(
        max_length=20,
        choices=Ownership.choices,
        default=Ownership.PUBLIC,
    )

    state = models.CharField(max_length=100, default="Kaduna")
    lga = models.ForeignKey(
        "core.LGARegistry",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="health_facilities",
    )
    lga_name = models.CharField(max_length=100, blank=True)
    ward = models.CharField(max_length=150, blank=True)

    # Decimal precision: 7 decimal places gives ~1 cm accuracy at equatorial scale.
    latitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    longitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)

    functional_status = models.CharField(
        max_length=20,
        choices=FunctionalStatus.choices,
        default=FunctionalStatus.UNKNOWN,
    )
    bed_capacity = models.PositiveIntegerField(null=True, blank=True)
    population_served = models.PositiveIntegerField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["lga_name", "name"]
        verbose_name = "Health Facility"
        verbose_name_plural = "Health Facilities"
        indexes = [
            models.Index(fields=["lga"], name="infra_hf_lga_idx"),
            models.Index(fields=["facility_type"], name="infra_hf_type_idx"),
            models.Index(fields=["functional_status"], name="infra_hf_status_idx"),
            models.Index(fields=["state", "lga_name"], name="infra_hf_state_lga_idx"),
            # Bounding-box approximation index until PostGIS SpatialIndex is available.
            models.Index(fields=["latitude", "longitude"], name="infra_hf_latlon_idx"),
        ]

    def __str__(self):
        return f"{self.name} ({self.get_facility_type_display()}) — {self.lga_name or self.state}"

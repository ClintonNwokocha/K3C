import csv
from decimal import Decimal, InvalidOperation

from django.core.management.base import BaseCommand, CommandError

from infrastructure.models import HealthFacility

REQUIRED_COLUMNS = {"name", "lga_name", "facility_type"}

VALID_FACILITY_TYPES = {c[0] for c in HealthFacility.FacilityType.choices}
VALID_OWNERSHIPS = {c[0] for c in HealthFacility.Ownership.choices}
VALID_FUNCTIONAL_STATUSES = {c[0] for c in HealthFacility.FunctionalStatus.choices}


def _clean(value):
    return str(value or "").strip()


def _to_decimal(value):
    s = _clean(value)
    if not s:
        return None
    try:
        return Decimal(s)
    except InvalidOperation:
        return None


def _to_int(value):
    s = _clean(value)
    if not s:
        return None
    try:
        return int(float(s))
    except ValueError:
        return None


class Command(BaseCommand):
    help = (
        "Import health facilities from a CSV file. "
        "Matches on name + lga_name. By default skips existing rows; "
        "pass --update-existing to upsert. "
        "Template: docs/templates/health_facilities_template.csv"
    )

    def add_arguments(self, parser):
        parser.add_argument("csv_path", type=str, help="Path to the CSV file.")
        parser.add_argument(
            "--update-existing",
            action="store_true",
            default=False,
            help="Update existing records matched by name + lga_name. Default: skip.",
        )

    def handle(self, *args, **options):
        csv_path = options["csv_path"]
        update_existing = options["update_existing"]

        try:
            with open(csv_path, "r", encoding="utf-8-sig", newline="") as fh:
                reader = csv.DictReader(fh)
                rows = list(reader)
                headers = set(reader.fieldnames or [])
        except FileNotFoundError:
            raise CommandError(f"CSV file not found: {csv_path}")

        missing_cols = REQUIRED_COLUMNS - headers
        if missing_cols:
            raise CommandError(
                f"CSV is missing required columns: {', '.join(sorted(missing_cols))}"
            )

        if not rows:
            raise CommandError("CSV file is empty.")

        created = updated = skipped = 0
        errors = []

        for lineno, row in enumerate(rows, start=2):
            name = _clean(row.get("name"))
            lga_name = _clean(row.get("lga_name"))
            facility_type = _clean(row.get("facility_type"))

            if not name:
                errors.append(f"Row {lineno}: 'name' is empty.")
                skipped += 1
                continue

            if not lga_name:
                errors.append(f"Row {lineno}: 'lga_name' is empty.")
                skipped += 1
                continue

            if facility_type not in VALID_FACILITY_TYPES:
                errors.append(
                    f"Row {lineno}: Invalid facility_type '{facility_type}'. "
                    f"Valid: {', '.join(sorted(VALID_FACILITY_TYPES))}"
                )
                skipped += 1
                continue

            functional_status = _clean(row.get("functional_status")) or HealthFacility.FunctionalStatus.UNKNOWN
            if functional_status not in VALID_FUNCTIONAL_STATUSES:
                errors.append(
                    f"Row {lineno}: Invalid functional_status '{functional_status}'. "
                    f"Valid: {', '.join(sorted(VALID_FUNCTIONAL_STATUSES))}"
                )
                skipped += 1
                continue

            ownership = _clean(row.get("ownership")) or HealthFacility.Ownership.PUBLIC
            if ownership not in VALID_OWNERSHIPS:
                errors.append(f"Row {lineno}: Invalid ownership '{ownership}'.")
                skipped += 1
                continue

            defaults = {
                "facility_type": facility_type,
                "ownership": ownership,
                "functional_status": functional_status,
                "state": _clean(row.get("state")) or "Kaduna",
                "ward": _clean(row.get("ward")),
                "latitude": _to_decimal(row.get("latitude")),
                "longitude": _to_decimal(row.get("longitude")),
                "bed_capacity": _to_int(row.get("bed_capacity")),
                "population_served": _to_int(row.get("population_served")),
            }

            if update_existing:
                try:
                    obj, was_created = HealthFacility.objects.update_or_create(
                        name=name, lga_name=lga_name, defaults=defaults
                    )
                except HealthFacility.MultipleObjectsReturned:
                    errors.append(
                        f"Row {lineno}: Multiple records for '{name}' in '{lga_name}'. Skipping."
                    )
                    skipped += 1
                    continue
                if was_created:
                    created += 1
                else:
                    updated += 1
            else:
                if HealthFacility.objects.filter(name=name, lga_name=lga_name).exists():
                    skipped += 1
                    continue
                HealthFacility.objects.create(name=name, lga_name=lga_name, **defaults)
                created += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Import complete. Created: {created}. Updated: {updated}. Skipped: {skipped}."
            )
        )

        if errors:
            self.stdout.write(self.style.WARNING("Skipped rows:"))
            for msg in errors[:20]:
                self.stdout.write(f"  - {msg}")
            if len(errors) > 20:
                self.stdout.write(f"  ...and {len(errors) - 20} more.")

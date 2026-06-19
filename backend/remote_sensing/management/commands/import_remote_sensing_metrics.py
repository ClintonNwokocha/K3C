import csv
from decimal import Decimal, InvalidOperation

from django.core.management.base import BaseCommand, CommandError

from core.models import LGARegistry
from remote_sensing.models import RemoteSensingLayer, RemoteSensingLGAMetric


def clean_text(value):
    return str(value or "").strip()


def to_decimal(value):
    value = clean_text(value)

    if value == "":
        return None

    try:
        return Decimal(value)
    except InvalidOperation:
        return None


def to_int(value):
    value = clean_text(value)

    if value == "":
        return None

    try:
        return int(float(value))
    except ValueError:
        return None


def normalize_name(value):
    return (
        clean_text(value)
        .lower()
        .replace("’", "'")
        .replace("`", "'")
        .replace("-", " ")
        .replace("_", " ")
    )


def get_lga(row):
    lga_id = clean_text(row.get("lga_id") or row.get("lga") or row.get("LGA_ID"))

    if lga_id:
        try:
            return LGARegistry.objects.get(lga_id=int(float(lga_id)))
        except (ValueError, LGARegistry.DoesNotExist):
            return None

    lga_name = clean_text(
        row.get("lga_name")
        or row.get("LGA_NAME")
        or row.get("lganame")
        or row.get("name")
        or row.get("NAME")
    )

    if lga_name:
        normalized_input = normalize_name(lga_name)

        for lga in LGARegistry.objects.all():
            if normalize_name(lga.lga_name) == normalized_input:
                return lga

    return None


class Command(BaseCommand):
    help = "Import real remote sensing LGA metrics from CSV. No fake values are generated."

    def add_arguments(self, parser):
        parser.add_argument("csv_path", type=str)
        parser.add_argument(
            "--layer",
            type=str,
            help="Layer key, e.g. ndvi, lst, rainfall. If omitted, CSV must contain a layer column.",
        )

    def handle(self, *args, **options):
        csv_path = options["csv_path"]
        default_layer_key = options.get("layer")

        created_count = 0
        updated_count = 0
        skipped_count = 0
        errors = []

        try:
            with open(csv_path, "r", encoding="utf-8-sig", newline="") as file:
                reader = csv.DictReader(file)
                rows = list(reader)
        except FileNotFoundError:
            raise CommandError(f"CSV file not found: {csv_path}")

        if not rows:
            raise CommandError("CSV file is empty.")

        for index, row in enumerate(rows, start=2):
            layer_key = clean_text(default_layer_key or row.get("layer"))

            if not layer_key:
                skipped_count += 1
                errors.append(f"Row {index}: Missing layer key.")
                continue

            try:
                layer = RemoteSensingLayer.objects.get(key=layer_key, is_active=True)
            except RemoteSensingLayer.DoesNotExist:
                skipped_count += 1
                errors.append(f"Row {index}: Layer not found: {layer_key}")
                continue

            lga = get_lga(row)

            if not lga:
                skipped_count += 1
                errors.append(f"Row {index}: Could not match LGA.")
                continue

            year = to_int(row.get("year"))

            if not year:
                skipped_count += 1
                errors.append(f"Row {index}: Missing or invalid year.")
                continue

            month = to_int(row.get("month"))

            mean_value = to_decimal(row.get("mean_value") or row.get("mean"))
            min_value = to_decimal(row.get("min_value") or row.get("min"))
            max_value = to_decimal(row.get("max_value") or row.get("max"))
            anomaly_value = to_decimal(row.get("anomaly_value") or row.get("anomaly"))

            metric, created = RemoteSensingLGAMetric.objects.update_or_create(
                layer=layer,
                lga=lga,
                year=year,
                month=month,
                defaults={
                    "mean_value": mean_value,
                    "min_value": min_value,
                    "max_value": max_value,
                    "anomaly_value": anomaly_value,
                    "unit": clean_text(row.get("unit")),
                    "data_source": clean_text(row.get("data_source")) or csv_path,
                    "metadata": {
                        "imported_from": csv_path,
                        "row_number": index,
                    },
                },
            )

            if created:
                created_count += 1
            else:
                updated_count += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Import completed. Created: {created_count}. Updated: {updated_count}. Skipped: {skipped_count}."
            )
        )

        if errors:
            self.stdout.write(self.style.WARNING("Skipped rows:"))
            for error in errors[:20]:
                self.stdout.write(f"- {error}")

            if len(errors) > 20:
                self.stdout.write(f"...and {len(errors) - 20} more errors.")
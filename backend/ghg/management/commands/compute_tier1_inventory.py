"""
Compute the IPCC 2006 Tier 1 inventory from stored activity data.

Order of a full run:
    python manage.py sync_inventory_activity --years 2018-2025
    python manage.py load_open_activity_data --years 2018-2025
    python manage.py compute_tier1_inventory --years 2018-2025 --dry-run
    python manage.py compute_tier1_inventory --years 2018-2025

Entries go to the review queue (pending_review) unless --status approved is
given.  LULUCF (3.B) entries are always drafts and never reach public totals.
"""

from django.core.management.base import BaseCommand, CommandError

from ghg.management.commands.sync_inventory_activity import parse_years
from ghg.models import GHGInventoryEntry
from ghg.tier1 import METHOD_VERSION, engine
from ghg.tier1 import factors as F


class Command(BaseCommand):
    help = "Compute Tier 1 GHG inventory entries from ActivityData (replaces this method's entries for the years)."

    def add_arguments(self, parser):
        parser.add_argument("--years", default="2018-2025")
        parser.add_argument(
            "--status",
            default=GHGInventoryEntry.Status.PENDING_REVIEW,
            choices=[GHGInventoryEntry.Status.PENDING_REVIEW, GHGInventoryEntry.Status.APPROVED],
        )
        parser.add_argument("--dry-run", action="store_true", default=False)

    def handle(self, *args, **options):
        years = parse_years(options["years"])
        try:
            result = engine.run(years, status=options["status"], dry_run=options["dry_run"])
        except ValueError as exc:
            raise CommandError(str(exc))

        mode = "DRY RUN" if options["dry_run"] else f"written as {options['status']}"
        self.stdout.write(f"Tier 1 inventory {METHOD_VERSION}: {result['lines']} lines ({mode})")
        for year in years:
            row = {s: v for (y, s), v in result["by_year_sector"].items() if y == year}
            total = sum(row.values())
            parts = "  ".join(f"{s}={v:,.0f}" for s, v in sorted(row.items()))
            self.stdout.write(f"  {year}: total {total:,.0f} tCO2e   {parts}")
        self.stdout.write(
            f"  LULUCF (provisional, excluded): {result['lulucf_provisional_tco2e']:,.0f} tCO2e over all years"
        )
        self.stdout.write("Values to verify before official use:")
        for item in F.VERIFY:
            self.stdout.write(f"  - {item}")

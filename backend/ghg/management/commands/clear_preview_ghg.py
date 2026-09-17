from django.core.management.base import BaseCommand, CommandError

from ghg.models import GHGInventoryEntry
from ghg.preview_dataset import PREVIEW_BATCH_ID


class Command(BaseCommand):
    help = "Remove temporary public GHG preview inventory records by batch id."

    def add_arguments(self, parser):
        parser.add_argument("--batch-id", required=True)
        parser.add_argument("--dry-run", action="store_true")
        parser.add_argument("--confirm", action="store_true")

    def handle(self, *args, **options):
        batch_id = options["batch_id"]
        dry_run = options["dry_run"]
        confirm = options["confirm"]

        if batch_id != PREVIEW_BATCH_ID:
            raise CommandError(f"Unsupported preview batch id: {batch_id}")

        if not dry_run and not confirm:
            raise CommandError("Use --confirm to delete preview GHG records.")

        queryset = GHGInventoryEntry.objects.filter(notes=batch_id)
        matching_count = queryset.count()
        removed = 0

        if confirm and not dry_run:
            removed, _deleted_by_model = queryset.delete()

        self.stdout.write(
            "Preview GHG batch {batch_id}: matching={matching}, "
            "removed={removed}, dry_run={dry_run}".format(
                batch_id=batch_id,
                matching=matching_count,
                removed=removed,
                dry_run=str(dry_run).lower(),
            )
        )

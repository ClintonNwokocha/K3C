from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from core.geography import KADUNA_LGAS
from core.models import EmissionFactor, LGARegistry
from ghg.models import GHGInventoryEntry
from ghg.preview_dataset import (
    PREVIEW_BATCH_ID,
    PREVIEW_CATEGORIES,
    PREVIEW_SOURCE_LABEL,
    iter_preview_specs,
    preview_factor_values,
    preview_record_count,
)


class Command(BaseCommand):
    help = "Seed the temporary public GHG preview inventory batch."

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
            raise CommandError("Use --confirm to write preview GHG records.")

        factors = self._get_or_plan_factors(dry_run)
        lgas = self._get_or_plan_lgas(dry_run)
        created = 0
        updated = 0
        unchanged = 0
        desired_keys = set()

        with transaction.atomic():
            specs = list(iter_preview_specs())
            for spec in specs:
                desired_keys.add(self._entry_key_from_spec(spec, lgas))

            preview_entries = list(
                GHGInventoryEntry.objects
                .select_related("emission_factor", "lga")
                .filter(notes=batch_id)
            )
            obsolete_preview = [
                entry.id
                for entry in preview_entries
                if self._entry_key(entry) not in desired_keys
            ]
            obsolete = len(obsolete_preview)
            if obsolete_preview and not dry_run:
                GHGInventoryEntry.objects.filter(id__in=obsolete_preview).delete()

            existing_entries = {
                self._entry_key(entry): entry
                for entry in preview_entries
                if entry.id not in obsolete_preview
            }
            entries_to_create = []
            entries_to_update = []

            for spec in specs:
                lookup = {
                    "sector": spec["sector"],
                    "sub_category": spec["sub_category"],
                    "fuel_or_activity": self._source_name(spec),
                    "lga": None if spec["is_statewide"] else lgas[spec["lga_name"]],
                    "year": spec["year"],
                    "unit": "preview_tco2e",
                    "notes": batch_id,
                }
                defaults = {
                    "quantity": spec["quantity"],
                    "emission_factor": factors[spec["sub_category"]],
                    "status": GHGInventoryEntry.Status.APPROVED,
                    "approved_at": timezone.now(),
                    "reviewer_comment": (
                        f"{PREVIEW_SOURCE_LABEL}; batch={batch_id}; "
                        f"{'statewide aggregate' if spec['is_statewide'] else 'lga preview'}"
                    ),
                }
                existing = existing_entries.get(self._entry_key_from_lookup(lookup))

                if existing is None:
                    created += 1
                    if not dry_run:
                        entry = GHGInventoryEntry(**lookup, **defaults)
                        entry.calculate_emissions()
                        entries_to_create.append(entry)
                    continue

                if self._entry_matches(existing, defaults):
                    unchanged += 1
                    continue

                updated += 1
                if not dry_run:
                    for field, value in defaults.items():
                        setattr(existing, field, value)
                    existing.calculate_emissions()
                    entries_to_update.append(existing)

            if entries_to_create:
                GHGInventoryEntry.objects.bulk_create(entries_to_create, batch_size=500)

            if entries_to_update:
                GHGInventoryEntry.objects.bulk_update(
                    entries_to_update,
                    [
                        "quantity",
                        "emission_factor",
                        "status",
                        "approved_at",
                        "reviewer_comment",
                        "co2_kg",
                        "ch4_kg",
                        "n2o_kg",
                        "co2e_tonnes",
                    ],
                    batch_size=500,
                )

            if dry_run:
                transaction.set_rollback(True)

        self.stdout.write(
            "Preview GHG batch {batch_id}: proposed={proposed}, "
            "created={created}, updated={updated}, unchanged={unchanged}, "
            "obsolete_preview={obsolete}, dry_run={dry_run}".format(
                batch_id=batch_id,
                proposed=preview_record_count(),
                created=created,
                updated=updated,
                unchanged=unchanged,
                obsolete=obsolete,
                dry_run=str(dry_run).lower(),
            )
        )

    def _get_or_plan_factors(self, dry_run):
        factors = {}

        for category in PREVIEW_CATEGORIES:
            factor_defaults = {
                **preview_factor_values(category),
                "ipcc_source": f"{PREVIEW_SOURCE_LABEL}; batch={PREVIEW_BATCH_ID}",
                "is_active": True,
            }
            lookup = {
                "sector": category["sector"],
                "sub_category": category["sub_category"],
                "fuel_or_species": self._factor_name(category),
                "unit": "preview_tco2e",
                "tier": EmissionFactor.Tier.TIER_1,
            }

            if dry_run:
                factor = EmissionFactor.objects.filter(**lookup).first()
                factors[category["sub_category"]] = factor
                continue

            factor, _created = EmissionFactor.objects.update_or_create(
                **lookup,
                defaults=factor_defaults,
            )
            factors[category["sub_category"]] = factor

        return factors

    def _get_or_plan_lgas(self, dry_run):
        lgas = {}

        for index, lga_name in enumerate(KADUNA_LGAS, start=1):
            if dry_run:
                lgas[lga_name] = LGARegistry.objects.filter(lga_name=lga_name).first()
                continue

            lga_id = self._available_lga_id(index)
            lga, _created = LGARegistry.objects.get_or_create(
                lga_name=lga_name,
                defaults={
                    "lga_id": lga_id,
                    "state": "Kaduna",
                },
            )
            if lga.state != "Kaduna":
                lga.state = "Kaduna"
                lga.save(update_fields=["state"])
            lgas[lga_name] = lga

        return lgas

    def _factor_name(self, category):
        return f"{PREVIEW_SOURCE_LABEL} - {category['label']}"

    def _source_name(self, spec):
        suffix = "Statewide aggregate" if spec["is_statewide"] else spec["lga_name"]
        return f"{PREVIEW_SOURCE_LABEL} - {suffix} - {spec['category_label']}"

    def _entry_matches(self, entry, defaults):
        if defaults["emission_factor"] is None:
            return False

        return (
            entry.quantity == defaults["quantity"]
            and entry.emission_factor_id == defaults["emission_factor"].id
            and entry.status == defaults["status"]
            and entry.reviewer_comment == defaults["reviewer_comment"]
        )

    def _entry_key_from_spec(self, spec, lgas):
        lga = None if spec["is_statewide"] else lgas.get(spec["lga_name"])
        return (
            spec["sector"],
            spec["sub_category"],
            self._source_name(spec),
            None if lga is None else lga.pk,
            spec["year"],
            "preview_tco2e",
            PREVIEW_BATCH_ID,
        )

    def _entry_key(self, entry):
        return (
            entry.sector,
            entry.sub_category,
            entry.fuel_or_activity,
            entry.lga_id,
            entry.year,
            entry.unit,
            entry.notes,
        )

    def _entry_key_from_lookup(self, lookup):
        return (
            lookup["sector"],
            lookup["sub_category"],
            lookup["fuel_or_activity"],
            None if lookup["lga"] is None else lookup["lga"].pk,
            lookup["year"],
            lookup["unit"],
            lookup["notes"],
        )

    def _available_lga_id(self, preferred_id):
        lga_id = preferred_id
        while LGARegistry.objects.filter(lga_id=lga_id).exists():
            lga_id += 1

        return lga_id

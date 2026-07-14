"""
Management command: release_lulc

Publishes or unpublishes the Dynamic World v1 LULC baseline datasets
(composite_window="late_wet_season", years 2018-2025) as an atomic unit.

Usage:
    python manage.py release_lulc
    python manage.py release_lulc --rollback
    python manage.py release_lulc --confirm --actor=<username> --qa-evidence="<text>"
    python manage.py release_lulc --rollback --confirm --actor=<username> --reason="<text>"

Dry-run is the default. --confirm is required for any database write.
"""
from django.contrib.auth.models import User
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from audit.models import AuditLog
from audit.utils import make_json_safe
from remote_sensing.models import LandCoverDataset, LandCoverSnapshot

# ── Release scope constants ────────────────────────────────────────────────────
_COMPOSITE_WINDOW = "late_wet_season"
_YEARS = frozenset(range(2018, 2026))          # 2018-2025 inclusive
_EXPECTED_DATASET_COUNT = 8
_EXPECTED_SNAPSHOT_COUNT = 184
_EXPECTED_LGA_COUNT_PER_DATASET = 23
_EXPECTED_QUALITY = {"high": 172, "medium": 12, "low": 0, "unknown": 0}
# IDs of out-of-scope datasets that must never appear in the scoped queryset.
_EXCLUDED_IDS = frozenset({3, 4})


class Command(BaseCommand):
    help = (
        "Publish or unpublish the Dynamic World v1 LULC baseline "
        f"({_COMPOSITE_WINDOW}, 2018-2025). Dry-run by default."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--confirm",
            action="store_true",
            default=False,
            help="Apply changes to the database. Default is dry-run.",
        )
        parser.add_argument(
            "--rollback",
            action="store_true",
            default=False,
            help="Reverse a previous release: set is_public=False, is_validated=False.",
        )
        parser.add_argument(
            "--actor",
            type=str,
            default="",
            help="Username of the administrator performing this action (required with --confirm).",
        )
        parser.add_argument(
            "--qa-evidence",
            type=str,
            default="",
            help="QA evidence or audit note for a publish action (required with --confirm).",
        )
        parser.add_argument(
            "--reason",
            type=str,
            default="",
            help="Reason for rollback (required with --confirm --rollback).",
        )

    def handle(self, *args, **options):
        confirm = options["confirm"]
        rollback = options["rollback"]
        actor_username = options["actor"].strip()
        qa_evidence = options["qa_evidence"].strip()
        reason = options["reason"].strip()

        # ── Argument validation for confirmed runs ─────────────────────────────
        if confirm:
            if not actor_username:
                raise CommandError("--actor is required when using --confirm.")
            if rollback:
                if not reason:
                    raise CommandError("--reason is required when using --confirm --rollback.")
            else:
                if not qa_evidence:
                    raise CommandError("--qa-evidence is required when using --confirm.")

        # ── Resolve actor (only needed for confirmed runs) ─────────────────────
        actor_user = None
        if confirm:
            try:
                actor_user = User.objects.get(username=actor_username)
            except User.DoesNotExist:
                raise CommandError(f"Actor user '{actor_username}' does not exist.")

        # ── Build scoped queryset ──────────────────────────────────────────────
        scoped = LandCoverDataset.objects.filter(
            composite_window=_COMPOSITE_WINDOW,
            year__in=_YEARS,
        ).order_by("year")

        # ── Run all preconditions (read-only; raise on any failure) ───────────
        self._check_preconditions(scoped)

        # ── Determine target flag state ────────────────────────────────────────
        target_public = not rollback
        target_validated = not rollback
        action_label = "ROLLBACK" if rollback else "PUBLISH"
        audit_action = "lulc_rollback" if rollback else "lulc_publish"
        audit_note = reason if rollback else qa_evidence

        # ── Dry-run report ─────────────────────────────────────────────────────
        self.stdout.write(f"\nAction         : {action_label}")
        self.stdout.write(f"Scope          : composite_window={_COMPOSITE_WINDOW!r}, years 2018-2025")
        self.stdout.write(f"Dataset count  : {scoped.count()}")
        self.stdout.write(f"Snapshot count : {_EXPECTED_SNAPSHOT_COUNT}")
        self.stdout.write(
            f"Quality        : high={_EXPECTED_QUALITY['high']}, "
            f"medium={_EXPECTED_QUALITY['medium']}, "
            f"low={_EXPECTED_QUALITY['low']}, "
            f"unknown={_EXPECTED_QUALITY['unknown']}"
        )
        self.stdout.write(
            f"Proposed flags : is_public={target_public}, is_validated={target_validated}"
        )
        if confirm:
            self.stdout.write(f"Actor          : {actor_username}")
            if rollback:
                self.stdout.write(f"Reason         : {reason}")
            else:
                self.stdout.write(f"QA Evidence    : {qa_evidence}")

        self.stdout.write("\n--- Dataset detail ---")
        for d in scoped:
            self.stdout.write(
                f"  id={d.id:4d}  year={d.year}  "
                f"is_public={d.is_public!s:5s} -> {target_public!s:5s}  "
                f"is_validated={d.is_validated!s:5s} -> {target_validated!s:5s}"
            )

        self.stdout.write("\n--- Excluded datasets (safety check, must be unchanged) ---")
        for exc_id in sorted(_EXCLUDED_IDS):
            try:
                exc = LandCoverDataset.objects.get(pk=exc_id)
                self.stdout.write(
                    f"  id={exc.id}  year={exc.year}  window={exc.composite_window}  "
                    f"snapshots={exc.snapshots.count()}  "
                    f"is_public={exc.is_public}  is_validated={exc.is_validated}  "
                    "[EXCLUDED - WILL NOT BE MODIFIED]"
                )
            except LandCoverDataset.DoesNotExist:
                self.stdout.write(f"  id={exc_id}  NOT IN DATABASE  [EXCLUDED]")

        self.stdout.write(
            "\n--- /api/layers/ visibility ---\n"
            "  LULC is served as a synthetic entry injected by remote_sensing_layers()\n"
            "  when late_wet_season datasets are is_public=True AND is_validated=True.\n"
            "  No RemoteSensingLayer row is created or modified.\n"
            f"  After this {'rollback' if rollback else 'publish'}: "
            f"annual_lulc {'ABSENT from' if rollback else 'VISIBLE in'} /api/layers/"
        )

        if not confirm:
            self.stdout.write(
                self.style.WARNING(
                    "\n*** DRY RUN MODE ***\n"
                    "No database records modified. Run with --confirm to apply changes."
                )
            )
            return

        # ── Apply changes inside a single atomic transaction ───────────────────
        try:
            with transaction.atomic():
                dataset_ids = []

                for d in scoped:
                    old_flags = {
                        "is_public": d.is_public,
                        "is_validated": d.is_validated,
                    }
                    d.is_public = target_public
                    d.is_validated = target_validated
                    d.save(update_fields=["is_public", "is_validated", "updated_at"])
                    dataset_ids.append(d.id)

                    AuditLog.objects.create(
                        user=actor_user,
                        action=audit_action,
                        table_name=LandCoverDataset._meta.db_table,
                        record_id=str(d.pk),
                        old_value=make_json_safe(old_flags),
                        new_value=make_json_safe({
                            "is_public": target_public,
                            "is_validated": target_validated,
                            "year": d.year,
                            "composite_window": _COMPOSITE_WINDOW,
                            "snapshot_count": d.snapshot_count,
                            "audit_note": audit_note,
                        }),
                        ip_address="127.0.0.1",
                    )

                # One summary audit entry for the batch.
                AuditLog.objects.create(
                    user=actor_user,
                    action=f"{audit_action}_summary",
                    table_name=LandCoverDataset._meta.db_table,
                    record_id=f"lulc/{_COMPOSITE_WINDOW}/2018-2025",
                    old_value=None,
                    new_value=make_json_safe({
                        "action": audit_action,
                        "dataset_ids": dataset_ids,
                        "years": sorted(_YEARS),
                        "composite_window": _COMPOSITE_WINDOW,
                        "dataset_count": len(dataset_ids),
                        "snapshot_count": _EXPECTED_SNAPSHOT_COUNT,
                        "quality": dict(_EXPECTED_QUALITY),
                        "is_public": target_public,
                        "is_validated": target_validated,
                        "excluded_ids": sorted(_EXCLUDED_IDS),
                        "audit_note": audit_note,
                    }),
                    ip_address="127.0.0.1",
                )

        except Exception as exc:
            raise CommandError(
                f"Transaction failed and was fully rolled back: {exc}"
            ) from exc

        self.stdout.write(
            self.style.SUCCESS(
                f"\nSuccessfully {action_label.lower()}ed {len(dataset_ids)} "
                f"LULC dataset(s). "
                f"{len(dataset_ids) + 1} audit log entries written."
            )
        )

    # ── Precondition checks ────────────────────────────────────────────────────

    def _check_preconditions(self, scoped):
        """Verify all release preconditions. Makes no database writes. Raises
        CommandError on any failure."""

        # 1. Exactly 8 scoped datasets.
        count = scoped.count()
        if count != _EXPECTED_DATASET_COUNT:
            raise CommandError(
                f"Precondition failed: expected {_EXPECTED_DATASET_COUNT} scoped datasets, "
                f"found {count}. "
                f"(composite_window={_COMPOSITE_WINDOW!r}, years 2018-2025)"
            )

        # 2. Years are exactly 2018-2025.
        actual_years = set(scoped.values_list("year", flat=True))
        if actual_years != _YEARS:
            missing = sorted(_YEARS - actual_years)
            extra = sorted(actual_years - _YEARS)
            raise CommandError(
                f"Precondition failed: year mismatch. "
                f"Missing: {missing}. Extra: {extra}."
            )

        # 3. Every scoped dataset has exactly 23 snapshots; total is 184.
        total_snaps = 0
        for d in scoped:
            n = d.snapshots.count()
            total_snaps += n
            if n != _EXPECTED_LGA_COUNT_PER_DATASET:
                raise CommandError(
                    f"Precondition failed: dataset id={d.id} year={d.year} "
                    f"has {n} snapshots, expected {_EXPECTED_LGA_COUNT_PER_DATASET}."
                )

        if total_snaps != _EXPECTED_SNAPSHOT_COUNT:
            raise CommandError(
                f"Precondition failed: total snapshot count is {total_snaps}, "
                f"expected {_EXPECTED_SNAPSHOT_COUNT}."
            )

        # 4. Quality totals from snapshot metadata match baseline.
        tiers = {"high": 0, "medium": 0, "low": 0, "unknown": 0}
        other_flags: dict = {}
        for s in LandCoverSnapshot.objects.filter(dataset__in=scoped):
            flag = (s.metadata or {}).get("quality_flag", "unknown")
            if flag in tiers:
                tiers[flag] += 1
            else:
                other_flags[flag] = other_flags.get(flag, 0) + 1

        if tiers != dict(_EXPECTED_QUALITY):
            raise CommandError(
                f"Precondition failed: quality mismatch. "
                f"Expected {dict(_EXPECTED_QUALITY)}, found {dict(tiers)}."
            )
        if other_flags:
            raise CommandError(
                f"Precondition failed: unexpected quality_flag values: {other_flags}."
            )

        # 5. Excluded IDs must not appear in the scoped queryset.
        scoped_ids = set(scoped.values_list("pk", flat=True))
        overlap = _EXCLUDED_IDS & scoped_ids
        if overlap:
            raise CommandError(
                f"Precondition failed: excluded dataset ID(s) {sorted(overlap)} "
                f"appeared in the scoped queryset. The scope filter is incorrect."
            )

        # 6. No dataset in scope is in a partially-released inconsistent state.
        for d in scoped:
            if d.is_public != d.is_validated:
                raise CommandError(
                    f"Precondition failed: dataset id={d.id} year={d.year} "
                    f"has inconsistent flags: "
                    f"is_public={d.is_public}, is_validated={d.is_validated}. "
                    "Resolve the inconsistency before running this command."
                )

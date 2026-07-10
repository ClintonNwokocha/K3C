import json
from django.core.management.base import BaseCommand, CommandError
from django.contrib.auth.models import User
from remote_sensing.models import RemoteSensingLayer
from audit.models import AuditLog
from audit.utils import make_json_safe

_ALLOW_LIST = frozenset({"elevation", "flood_occurrence"})


class Command(BaseCommand):
    help = (
        "Publish or unpublish selected Climate Atlas layers. "
        "Enforces allow-lists, dry-run by default, and writes traceable audit records."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--layer-key",
            type=str,
            required=True,
            help="The layer key to target (e.g., elevation, flood_occurrence).",
        )
        parser.add_argument(
            "--action",
            type=str,
            required=True,
            choices=["publish", "unpublish"],
            help="The action to perform: 'publish' or 'unpublish'.",
        )
        parser.add_argument(
            "--actor",
            type=str,
            required=True,
            help="The username of the administrator performing the action.",
        )
        parser.add_argument(
            "--qa-evidence",
            type=str,
            required=True,
            help="QA evidence reference or notes for this release action.",
        )
        parser.add_argument(
            "--confirm",
            action="store_true",
            default=False,
            help="Actually apply changes to the database instead of dry-run.",
        )

    def handle(self, *args, **options):
        layer_key = options["layer_key"]
        action = options["action"]
        actor_username = options["actor"]
        qa_evidence = options["qa_evidence"]
        confirm = options["confirm"]

        # 1. Enforce allow-list
        if layer_key not in _ALLOW_LIST:
            raise CommandError(
                f"Layer '{layer_key}' is not in the approved public release allow-list. "
                f"Approved layers: {', '.join(sorted(_ALLOW_LIST))}."
            )

        # 2. Enforce non-empty evidence
        if not qa_evidence.strip():
            raise CommandError("A non-empty --qa-evidence reference is required.")

        # 3. Retrieve the actor
        try:
            actor_user = User.objects.get(username=actor_username)
        except User.DoesNotExist:
            raise CommandError(f"Actor user '{actor_username}' does not exist.")

        # 4. Fetch target layer
        try:
            layer = RemoteSensingLayer.objects.get(key=layer_key)
        except RemoteSensingLayer.DoesNotExist:
            raise CommandError(f"Remote sensing layer '{layer_key}' not found in the database.")

        # 5. Capture current state (for audit comparison)
        old_public = layer.is_public
        old_active = layer.is_active

        # Determine target state
        if action == "publish":
            new_public = True
            new_active = True
        else:
            new_public = False
            new_active = False

        self.stdout.write(f"Target Layer  : {layer_key} ({layer.label})")
        self.stdout.write(f"Action        : {action.upper()}")
        self.stdout.write(f"Actor         : {actor_username}")
        self.stdout.write(f"QA Evidence   : {qa_evidence}")
        self.stdout.write(f"Current State : is_public={old_public}, is_active={old_active}")
        self.stdout.write(f"Proposed State: is_public={new_public}, is_active={new_active}")

        if not confirm:
            self.stdout.write(
                self.style.WARNING(
                    "\n*** DRY RUN MODE ***\n"
                    "No database records modified. Run with --confirm to apply changes."
                )
            )
            return

        # 6. Apply database changes
        layer.is_public = new_public
        layer.is_active = new_active
        layer.save(update_fields=["is_public", "is_active", "updated_at"])

        # 7. Write audit log trail
        AuditLog.objects.create(
            user=actor_user,
            action=f"layer_{action}",
            table_name=layer._meta.db_table,
            record_id=str(layer.pk),
            old_value=make_json_safe({"is_public": old_public, "is_active": old_active}),
            new_value=make_json_safe({
                "is_public": new_public,
                "is_active": new_active,
                "qa_evidence": qa_evidence
            }),
            ip_address="127.0.0.1",
        )

        self.stdout.write(
            self.style.SUCCESS(
                f"\nSuccessfully modified and audited layer '{layer_key}' state."
            )
        )

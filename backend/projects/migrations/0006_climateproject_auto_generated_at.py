from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("projects", "0005_add_climate_ghg_linkage"),
    ]

    operations = [
        migrations.AddField(
            model_name="climateproject",
            name="auto_generated_at",
            field=models.DateTimeField(
                blank=True,
                editable=False,
                help_text="Set when this proposal was created or last refreshed by generate_climate_proposals. Blank for staff-created projects.",
                null=True,
            ),
        ),
    ]

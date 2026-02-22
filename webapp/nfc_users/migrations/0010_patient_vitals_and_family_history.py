# Generated migration for historical vitals and family history tables

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("nfc_users", "0009_patient_important_test_results"),
    ]

    operations = [
        migrations.AddField(
            model_name="patient",
            name="_historical_blood_pressure",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="patient",
            name="_historical_heart_rate",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="patient",
            name="_historical_body_weight",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="patient",
            name="_family_history",
            field=models.TextField(blank=True, default=""),
        ),
    ]

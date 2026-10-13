"""
Centralized On Track / At Risk / Off Track performance calculation for
ClimateProject, derived from the existing workflow `status` field, the
project's start/end dates, and its latest real ProjectProgressUpdate —
never from invented progress data.

Kept as a single pure function (no DB access, no side effects) so the exact
same rule applies everywhere it's used (serializer fields, summary
aggregation) and is trivially unit-testable without a database.
"""

from decimal import Decimal


ON_TRACK = "on_track"
AT_RISK = "at_risk"
OFF_TRACK = "off_track"
NOT_ASSESSED = "not_assessed"


def compute_performance_status(
    status,
    start_date,
    end_date,
    latest_physical_completion_pct,
    today,
):
    """
    Rules, evaluated in order:

    1. workflow status is "completed" -> on_track, regardless of dates/progress.
    2. missing start_date, end_date, or a progress reading -> not_assessed
       (there isn't enough real data to say anything).
    3. end_date has passed and physical completion is still below 100% ->
       off_track, regardless of how close the schedule-adjusted numbers are
       — a project is simply late once its own end date has gone by.
    4. otherwise, compare actual completion to the schedule-expected
       completion:
           expected% = elapsed_duration / total_duration * 100, capped [0, 100]
           diff = actual% - expected%
           diff >= -10  -> on_track
           diff >= -25  -> at_risk
           else         -> off_track

    total_duration <= 0 (bad/equal dates) is treated as not_assessed — it's
    not a real schedule to measure against.
    """
    if status == "completed":
        return ON_TRACK

    if start_date is None or end_date is None or latest_physical_completion_pct is None:
        return NOT_ASSESSED

    actual_pct = Decimal(latest_physical_completion_pct)

    if end_date < today and actual_pct < 100:
        return OFF_TRACK

    total_duration = (end_date - start_date).days
    if total_duration <= 0:
        return NOT_ASSESSED

    elapsed = (today - start_date).days
    elapsed = max(0, min(elapsed, total_duration))
    expected_pct = Decimal(elapsed) / Decimal(total_duration) * Decimal(100)
    expected_pct = max(Decimal(0), min(expected_pct, Decimal(100)))

    diff = actual_pct - expected_pct

    if diff >= Decimal(-10):
        return ON_TRACK
    if diff >= Decimal(-25):
        return AT_RISK
    return OFF_TRACK

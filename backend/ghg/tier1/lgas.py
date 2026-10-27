"""
Match boundary-file LGA codes (kaduna_lga.geojson `lgacode`, e.g. 19011) to
LGARegistry rows.  Registry ids are not the boundary codes, so the join is on
the normalised LGA name.
"""

from core.geography import normalize_kaduna_geography_name
from core.models import LGARegistry


def registry_by_lgacode(code_to_name):
    """
    code_to_name: {lgacode: lganame}.  Returns {lgacode: LGARegistry} and
    raises ValueError naming any LGA missing from the registry.
    """
    by_name = {
        normalize_kaduna_geography_name(lga.lga_name): lga
        for lga in LGARegistry.objects.all()
    }
    matched, missing = {}, []
    for code, name in code_to_name.items():
        lga = by_name.get(normalize_kaduna_geography_name(name))
        if lga is None:
            missing.append(f"{name} ({code})")
        else:
            matched[str(code)] = lga
    if missing:
        raise ValueError(f"LGARegistry has no row for: {', '.join(sorted(missing))}. Run seed_core first.")
    return matched

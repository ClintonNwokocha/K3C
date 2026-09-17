KADUNA_STATE_NAME = "Kaduna State"

KADUNA_LGAS = [
    "Birnin Gwari",
    "Chikun",
    "Giwa",
    "Igabi",
    "Ikara",
    "Jaba",
    "Jema'a",
    "Kachia",
    "Kaduna North",
    "Kaduna South",
    "Kagarko",
    "Kajuru",
    "Kaura",
    "Kauru",
    "Kubau",
    "Kudan",
    "Lere",
    "Makarfi",
    "Sabon Gari",
    "Sanga",
    "Soba",
    "Zangon Kataf",
    "Zaria",
]


def normalize_kaduna_geography_name(value):
    normalized = (
        str(value or "")
        .strip()
        .lower()
        .replace("’", "'")
        .replace("`", "'")
        .replace("-", " ")
        .replace("_", " ")
    )
    return " ".join(normalized.split())


def get_kaduna_geography_options(include_all=True):
    options = []

    if include_all:
        options.append({"value": "all", "label": "All geographies"})

    options.append({"value": "statewide", "label": KADUNA_STATE_NAME})
    options.extend(
        {"value": f"lga:{lga_name}", "label": lga_name}
        for lga_name in KADUNA_LGAS
    )

    return options

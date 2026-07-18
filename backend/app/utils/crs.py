def normalize_crs(value: str | None) -> str | None:
    if not value:
        return None
    clean = value.strip()
    return clean or None

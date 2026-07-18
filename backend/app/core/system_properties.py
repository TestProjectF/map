SYSTEM_PROPERTY_PREFIX = "MAP_"
CAD_PROPERTY_NAMESPACE = "CAD_"


def system_property(name: str) -> str:
    return f"{SYSTEM_PROPERTY_PREFIX}{name}"


def cad_property(name: str) -> str:
    return system_property(f"{CAD_PROPERTY_NAMESPACE}{name}")


APP_SOURCE_LAYER_PROPERTY = system_property("sourceLayer")
APP_SOURCE_LAYER_KIND_PROPERTY = system_property("sourceLayerKind")
CAD_LAYER_PROPERTY = cad_property("layer")
CAD_TYPE_PROPERTY = cad_property("type")

LEGACY_SOURCE_LAYER_PROPERTY = "sourceLayer"
LEGACY_CAD_LAYER_PROPERTY = "CAD_layer"

RESTORE_LAYER_FIELDS = (
    APP_SOURCE_LAYER_PROPERTY,
    CAD_LAYER_PROPERTY,
    LEGACY_SOURCE_LAYER_PROPERTY,
    LEGACY_CAD_LAYER_PROPERTY,
)

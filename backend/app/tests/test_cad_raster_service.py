import json

from PIL import Image

from app.services.cad_raster_service import render_geojson_preview


def test_render_geojson_preview_has_alpha_and_bbox(tmp_path):
    source = tmp_path / "preview.geojson"
    source.write_text(
        json.dumps(
            {
                "type": "FeatureCollection",
                "features": [
                    {
                        "type": "Feature",
                        "properties": {},
                        "geometry": {"type": "LineString", "coordinates": [[10, 20], [30, 40]]},
                    }
                ],
            }
        ),
        encoding="utf-8",
    )
    output = tmp_path / "cad-preview.png"

    result = render_geojson_preview([source], output, size=256)

    image = Image.open(output)
    assert image.mode == "RGBA"
    assert image.getpixel((0, 0))[3] == 0
    assert result["bbox"][0] < 10
    assert result["bbox"][1] < 20
    assert result["bbox"][2] > 30
    assert result["bbox"][3] > 40


def test_overview_can_exclude_point_features(tmp_path):
    source = tmp_path / "points.geojson"
    source.write_text(
        json.dumps(
            {
                "type": "FeatureCollection",
                "features": [
                    {
                        "type": "Feature",
                        "properties": {},
                        "geometry": {"type": "Point", "coordinates": [105.85, 21.03]},
                    }
                ],
            }
        ),
        encoding="utf-8",
    )
    output = tmp_path / "cad-overview.png"

    render_geojson_preview([source], output, size=256, include_points=False)

    assert Image.open(output).getbbox() is None


def test_overview_can_exclude_hatch_features(tmp_path):
    source = tmp_path / "hatch.geojson"
    source.write_text(
        json.dumps(
            {
                "type": "FeatureCollection",
                "features": [
                    {
                        "type": "Feature",
                        "properties": {"MAP_CAD_type": "HATCH"},
                        "geometry": {
                            "type": "Polygon",
                            "coordinates": [[[105.8, 21.0], [105.9, 21.0], [105.9, 21.1], [105.8, 21.0]]],
                        },
                    }
                ],
            }
        ),
        encoding="utf-8",
    )
    output = tmp_path / "cad-overview.png"

    render_geojson_preview([source], output, size=256, include_hatches=False)

    assert Image.open(output).getbbox() is None

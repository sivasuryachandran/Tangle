"""Per-panel pixel scale and the checker's limits restated in pixels, for the spec sheet and README.

Pixel pitch and the angle one LED pixel subtends at the TRUE eye are computed from the screen file
itself (panel size in metres / panel res; panel centre distance; angle off the panel's normal), so
nothing is copied by hand. A viewer who is off-axis sees a pixel step shrink with the angle, which is
why the demo corner (54.6 deg off-axis, 17.3 m away) shows 0.49 x 0.83 arcmin per pixel, not 1.0.

Pixels are only meaningful when named. `reference_camera_scale` is the one used for the proof view
(street.png): arcmin per reference-camera pixel at the image centre, vertical field of view / height.
"""

from __future__ import annotations

import math

import numpy as np

from checker import geometry as geo


def panel_pixel_scale(screen: dict, panel: dict) -> dict:
    """Pixel pitch (mm) and what one pixel step subtends at screen["eye"], at the panel's centre."""
    pa, pb, pc = (np.asarray(panel[k], dtype=float) for k in ("pa", "pb", "pc"))
    eye = np.asarray(screen["eye"], dtype=float)
    width_m, height_m = float(np.linalg.norm(pb - pa)), float(np.linalg.norm(pc - pa))
    right, up = (pb - pa) / width_m, (pc - pa) / height_m
    normal = geo.normalize(np.cross(right, up))
    centre = pa + 0.5 * (pb - pa) + 0.5 * (pc - pa)
    to_centre = centre - eye
    distance = float(np.linalg.norm(to_centre))
    sight = to_centre / distance
    pitch_w_m, pitch_h_m = width_m / panel["res"][0], height_m / panel["res"][1]

    def arcmin(pitch_m: float, axis: np.ndarray) -> float:
        # a step along `axis`, seen from the eye: only the part perpendicular to the line of sight counts
        return math.degrees(pitch_m * math.sqrt(max(0.0, 1.0 - float(np.dot(axis, sight)) ** 2)) / distance) * 60.0

    return {
        "panel": panel["name"],
        "size_m": [width_m, height_m],
        "res": list(panel["res"]),
        "pitch_mm": [pitch_w_m * 1000.0, pitch_h_m * 1000.0],
        "centre_distance_m": distance,
        "incidence_deg": math.degrees(math.acos(min(1.0, abs(float(np.dot(normal, -sight)))))),
        "arcmin_per_pixel": [arcmin(pitch_w_m, right), arcmin(pitch_h_m, up)],
    }


def screen_pixel_scale(screen: dict) -> list[dict]:
    return [panel_pixel_scale(screen, p) for p in screen["panels"]]


def reference_camera_scale(screen: dict) -> float:
    """Arcmin per reference-camera pixel (vertical FOV / image height, at the image centre)."""
    cam = screen["ref_camera"]
    return cam["fov_y_deg"] / cam["res"][1] * 60.0


def limits_in_reference_pixels(thresholds: dict, screen: dict) -> dict:
    """The checker's angular limits as degrees, arcmin and (named) reference-camera pixels.
    C4 (a fraction) and C5 (already arcmin of text height) are passed through unchanged."""
    per_px = reference_camera_scale(screen)

    def entry(deg: float) -> dict:
        return {"deg": deg, "arcmin": deg * 60.0, "reference_camera_px": deg * 60.0 / per_px}

    return {
        "pixel": f"reference-camera pixel ({screen['ref_camera']['res'][0]}x{screen['ref_camera']['res'][1]}, "
                 f"{screen['ref_camera']['fov_y_deg']:g} deg vertical FOV, {per_px:.2f} arcmin)",
        "C2_mean": entry(thresholds["C2"]["mean_deg"]),
        "C2_max": entry(thresholds["C2"]["max_deg"]),
        "C3": entry(thresholds["C3"]["max_deg"]),
        "C4_max_fraction": thresholds["C4"]["max_fraction"],
        "C5_min_arcmin": thresholds["C5"]["min_arcmin"],
    }

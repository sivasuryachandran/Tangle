"""Shared volume rule (CLAUDE.md §3.3). Used by A1 validation and by the guard."""

INSIDE = {"x": (-8, 0), "z": (-8, 0), "y": (0, 6)}
POPOUT = {"x": (0, 3), "z": (0, 3), "y": (1, 5)}
EPS = 1e-9


def _in(p, box):
    return all(box[a][0] - EPS <= v <= box[a][1] + EPS for a, v in zip("xyz", p))


def pos_ok(p):
    return _in(p, INSIDE) or _in(p, POPOUT)


def text_pos_ok(p):
    """Text lies on ONE panel: L at z in [-0.5,0] (x in [-8,0]) or R at x in [-0.5,0] (z in [-8,0])."""
    x, y, z = p
    on_l = -0.5 - EPS <= z <= EPS and -8 - EPS <= x <= EPS
    on_r = -0.5 - EPS <= x <= EPS and -8 - EPS <= z <= EPS
    return (on_l or on_r) and 0 - EPS <= y <= 6 + EPS


def position_ok(obj_type, p):
    return text_pos_ok(p) if obj_type == "text" else pos_ok(p)


def volume_violations(scene):
    """List of human-readable violations for every keyframe position in a scene."""
    out = []
    for o in scene.get("objects", []):
        for i, k in enumerate(o.get("keyframes", [])):
            if not position_ok(o.get("type"), k["pos"]):
                out.append(f"object '{o['id']}' keyframe {i} (t={k['t']}) pos {k['pos']} is outside the allowed volume"
                           + (" (text must sit at z in [-0.5,0] on L or x in [-0.5,0] on R)" if o.get("type") == "text" else ""))
    return out

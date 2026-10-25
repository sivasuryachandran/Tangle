"""Independent numpy re-implementation of Tangle's projection geometry.

This module is the checker's own math, derived from CLAUDE.md Sections 3 and 5
directly (Kooima, *Generalized Perspective Projection*; standard pinhole
projection). It does not read or port web/render/offaxis.js — the checker's
job is to verify P1's renderer from a separate implementation, not reuse it.

Conventions: meters, right-handed, Y up. A panel's `pa` is its lower-left
corner, `pb` lower-right, `pc` upper-left, as seen from the front (CLAUDE.md
Section 3.2). Panel-local (u, v) runs u in [0, 1] from pa->pb, v in [0, 1]
from pa->pc.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np

EPS = 1e-9


def normalize(v) -> np.ndarray:
    v = np.asarray(v, dtype=float)
    n = np.linalg.norm(v)
    if n < EPS:
        raise ValueError(f"cannot normalize a near-zero vector: {v}")
    return v / n


@dataclass(frozen=True)
class PanelBasis:
    name: str
    pa: np.ndarray
    pb: np.ndarray
    pc: np.ndarray
    vr: np.ndarray  # unit vector pa -> pb
    vu: np.ndarray  # unit vector pa -> pc
    vn: np.ndarray  # unit outward normal, vr x vu
    width: float    # |pb - pa|
    height: float   # |pc - pa|


def panel_basis(panel: dict) -> PanelBasis:
    pa = np.array(panel["pa"], dtype=float)
    pb = np.array(panel["pb"], dtype=float)
    pc = np.array(panel["pc"], dtype=float)
    width_vec = pb - pa
    height_vec = pc - pa
    width = float(np.linalg.norm(width_vec))
    height = float(np.linalg.norm(height_vec))
    if width < EPS or height < EPS:
        raise ValueError(f"panel {panel.get('name')!r} has a degenerate edge")
    vr = width_vec / width
    vu = height_vec / height
    vn = normalize(np.cross(vr, vu))
    return PanelBasis(panel.get("name", "?"), pa, pb, pc, vr, vu, vn, width, height)


def assert_panel_faces_eye(panel: dict, eye) -> float:
    """CLAUDE.md Section 3.2: dot(normalize(cross(pb-pa, pc-pa)), eye - pa) > 0."""
    basis = panel_basis(panel)
    eye = np.array(eye, dtype=float)
    d = float(np.dot(basis.vn, eye - basis.pa))
    if d <= 0:
        raise ValueError(
            f"panel {basis.name!r} does not face the eye (dot={d:.6g}); "
            "check pa/pb/pc winding or eye position"
        )
    return d


def load_screen(path) -> dict:
    """Load a screens/<id>.json spec and assert every panel faces the eye."""
    screen = json.loads(Path(path).read_text())
    for panel in screen["panels"]:
        assert_panel_faces_eye(panel, screen["eye"])
    return screen


# --------------------------------------------------------------------------
# Ray <-> panel intersection (used by C2, C4)
# --------------------------------------------------------------------------

@dataclass(frozen=True)
class RayHit:
    panel: str
    u: float
    v: float
    t: float          # ray parameter; point = eye + t * (target - eye)
    point: np.ndarray  # the 3D hit point, on the panel plane


def ray_panel_hit(eye, target, panel: dict, *, tol: float = 1e-6) -> RayHit | None:
    """Intersect the ray eye->target with one panel's plane and bounds.

    Returns None if the ray is parallel to the panel, the hit is behind the
    eye (t <= 0), or the hit falls outside the panel's [0,1]x[0,1] extent
    (within `tol`).
    """
    basis = panel_basis(panel)
    eye = np.asarray(eye, dtype=float)
    target = np.asarray(target, dtype=float)
    direction = target - eye
    denom = float(np.dot(basis.vn, direction))
    if abs(denom) < EPS:
        return None
    t = float(np.dot(basis.vn, basis.pa - eye) / denom)
    if t <= tol:
        return None
    point = eye + t * direction
    local = point - basis.pa
    u = float(np.dot(local, basis.vr) / basis.width)
    v = float(np.dot(local, basis.vu) / basis.height)
    if -tol <= u <= 1 + tol and -tol <= v <= 1 + tol:
        return RayHit(basis.name, min(max(u, 0.0), 1.0), min(max(v, 0.0), 1.0), t, point)
    return None


def find_panel_hit(eye, target, panels: list[dict]) -> RayHit | None:
    """Nearest valid in-bounds hit (smallest positive t) across all panels."""
    hits = [h for p in panels if (h := ray_panel_hit(eye, target, p)) is not None]
    if not hits:
        return None
    return min(hits, key=lambda h: h.t)


def panel_point_from_uv(panel: dict, u: float, v: float) -> np.ndarray:
    """Map panel-local (u, v) to a 3D point on that panel."""
    basis = panel_basis(panel)
    return basis.pa + u * basis.width * basis.vr + v * basis.height * basis.vu


def panel_by_name(panels: list[dict], name: str) -> dict:
    for p in panels:
        if p["name"] == name:
            return p
    raise KeyError(f"no panel named {name!r}")


# --------------------------------------------------------------------------
# Pinhole projection for ref_camera (used by C2 angle check, C4, C5 image work)
# --------------------------------------------------------------------------

def ref_camera_basis(ref_camera: dict, eye):
    """Right-handed look_at basis: forward, right, up (all unit)."""
    eye = np.array(eye, dtype=float)
    look_at = np.array(ref_camera["look_at"], dtype=float)
    forward = normalize(look_at - eye)
    world_up = np.array([0.0, 1.0, 0.0])
    if abs(np.dot(forward, world_up)) > 0.999:
        world_up = np.array([0.0, 0.0, 1.0])
    right = normalize(np.cross(forward, world_up))
    up = np.cross(right, forward)
    return forward, right, up


def pinhole_project(point, eye, ref_camera: dict):
    """Project a world point into ref_camera pixel space.

    Returns (px, py, depth) with (0, 0) at the top-left pixel, or None if the
    point is at/behind the eye along the view direction.
    """
    forward, right, up = ref_camera_basis(ref_camera, eye)
    eye = np.array(eye, dtype=float)
    rel = np.array(point, dtype=float) - eye
    depth = float(np.dot(rel, forward))
    if depth <= EPS:
        return None
    x = float(np.dot(rel, right))
    y = float(np.dot(rel, up))
    fov_y = np.radians(ref_camera["fov_y_deg"])
    res_x, res_y = ref_camera["res"]
    tan_half_fov_y = np.tan(fov_y / 2)
    tan_half_fov_x = tan_half_fov_y * (res_x / res_y)
    ndc_x = x / (depth * tan_half_fov_x)
    ndc_y = y / (depth * tan_half_fov_y)
    px = (ndc_x * 0.5 + 0.5) * res_x
    py = (1.0 - (ndc_y * 0.5 + 0.5)) * res_y
    return px, py, depth


def ray_angle_deg(eye, p1, p2) -> float:
    """Angle, in degrees, between rays eye->p1 and eye->p2."""
    eye = np.array(eye, dtype=float)
    v1 = normalize(np.array(p1, dtype=float) - eye)
    v2 = normalize(np.array(p2, dtype=float) - eye)
    cos_angle = float(np.clip(np.dot(v1, v2), -1.0, 1.0))
    return float(np.degrees(np.arccos(cos_angle)))


# --------------------------------------------------------------------------
# Kooima generalized perspective projection matrix (CLAUDE.md Section 5.1)
# --------------------------------------------------------------------------
# Not used by the C2 angular check itself (that's pure ray/plane geometry),
# but required by the brief as an independent re-derivation, and used to
# sanity-check that panel corners land exactly on the frustum edges.

def _frustum_matrix(l: float, r: float, b: float, t: float, near: float, far: float) -> np.ndarray:
    m = np.zeros((4, 4))
    m[0, 0] = 2 * near / (r - l)
    m[0, 2] = (r + l) / (r - l)
    m[1, 1] = 2 * near / (t - b)
    m[1, 2] = (t + b) / (t - b)
    m[2, 2] = -(far + near) / (far - near)
    m[2, 3] = -2 * far * near / (far - near)
    m[3, 2] = -1.0
    return m


def kooima_matrix(panel: dict, eye, near: float = 0.1, far: float = 100.0) -> np.ndarray:
    """Off-axis (Kooima) projection matrix for one panel, mapping world-space
    homogeneous points to clip space, as in CLAUDE.md Section 5.1:
    P = frustum(l,r,b,t,n,f) . M^T(vr,vu,vn) . T(-e)
    """
    basis = panel_basis(panel)
    eye = np.asarray(eye, dtype=float)
    va = basis.pa - eye
    vb = basis.pb - eye
    vc = basis.pc - eye
    d = -float(np.dot(va, basis.vn))
    if d <= 0:
        raise ValueError(f"eye is behind panel {basis.name!r}'s plane (d={d:.6g})")
    l = float(np.dot(basis.vr, va)) * near / d
    r = float(np.dot(basis.vr, vb)) * near / d
    b = float(np.dot(basis.vu, va)) * near / d
    t = float(np.dot(basis.vu, vc)) * near / d
    frustum = _frustum_matrix(l, r, b, t, near, far)
    rot = np.eye(4)
    rot[0, :3] = basis.vr
    rot[1, :3] = basis.vu
    rot[2, :3] = basis.vn
    translate = np.eye(4)
    translate[:3, 3] = -eye
    return frustum @ rot @ translate


def project_clip(matrix: np.ndarray, point) -> np.ndarray:
    """Apply a 4x4 clip-space matrix to a world point; returns (x, y, z, w)."""
    p = np.array([*point, 1.0], dtype=float)
    return matrix @ p


def clip_to_ndc(clip: np.ndarray) -> np.ndarray:
    w = clip[3]
    if abs(w) < EPS:
        raise ValueError("clip w is ~0; point is at the eye")
    return clip[:3] / w

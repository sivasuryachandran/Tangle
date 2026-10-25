"""Guard: decide whether an Argon patch may be applied. Argon proposes; the guard + checker decide."""
import copy, re

import jsonpatch
import jsonschema

from agent.gemini import ROOT
from agent.volumes import POPOUT, _in, volume_violations
import json

SCENE_SCHEMA = json.loads((ROOT / "schemas" / "scene.schema.json").read_text())
MAX_OPS = 6
ALLOWED_OPS = {"replace", "add", "remove"}
ALLOWED_PATH = re.compile(r"^/objects/\d+/(keyframes(/(\d+|-)(/(t|pos|rot|scale)(/[012])?)?)?|scale|height_m|color)$")


class PatchRejected(ValueError):
    pass


def hero_index(scene):
    """The hero object: the one with label_text, else the first can/box."""
    objs = scene["objects"]
    for i, o in enumerate(objs):
        if o.get("label_text"):
            return i
    for i, o in enumerate(objs):
        if o.get("type") in ("can", "box"):
            return i
    return None


def _scale_at(keyframes, t):
    kf = sorted(keyframes, key=lambda k: k["t"])
    if t <= kf[0]["t"]:
        return kf[0]["scale"]
    for a, b in zip(kf, kf[1:]):
        if t <= b["t"]:
            return a["scale"] + (b["scale"] - a["scale"]) * (t - a["t"]) / (b["t"] - a["t"])
    return kf[-1]["scale"]


def _zeroed(scene):
    return {o["id"] for o in scene["objects"] if any(k["scale"] == 0 for k in o["keyframes"])}


def hero_violations(new, reference):
    """Hero rule. `reference` is the v1 scene. Returns a list of violations (empty = ok)."""
    out = []
    hi = hero_index(reference)
    if hi is None:
        return out
    hid = reference["objects"][hi]["id"]
    ref_h = reference["objects"][hi]
    new_h = next((o for o in new["objects"] if o["id"] == hid), None)
    if new_h is None:
        return [f"hero '{hid}' missing"]
    for k in new_h["keyframes"]:
        floor = 0.9 * _scale_at(ref_h["keyframes"], k["t"])
        if k["scale"] == 0:
            out.append(f"hero '{hid}' may never be scale 0 (t={k['t']})")
        elif k["scale"] < floor - 1e-9:
            out.append(f"hero '{hid}' scale {k['scale']} at t={k['t']} is below 0.9x its v1 scale ({floor:.2f})")
    if any(_in(k["pos"], POPOUT) for k in ref_h["keyframes"]) and not any(_in(k["pos"], POPOUT) for k in new_h["keyframes"]):
        out.append(f"hero '{hid}' must keep at least one keyframe in the pop-out volume")
    newly = _zeroed(new) - _zeroed(reference) - {hid}
    if len(newly) > 1:
        out.append(f"at most one non-hero object may go to scale 0 per run; newly zeroed: {sorted(newly)}")
    return out


def check(scene, patch, reference=None):
    """Raise PatchRejected with a reason, else return the patched scene (a new dict).
    `reference` = the v1 scene for the hero rule (defaults to `scene`)."""
    if not isinstance(patch, list):
        raise PatchRejected("patch must be a list of RFC 6902 ops")
    if len(patch) > MAX_OPS:
        raise PatchRejected(f"{len(patch)} ops > {MAX_OPS} allowed")
    for i, op in enumerate(patch):
        if op.get("op") not in ALLOWED_OPS:
            raise PatchRejected(f"op {i}: '{op.get('op')}' not allowed (use replace/add/remove)")
        path = op.get("path", "")
        if not ALLOWED_PATH.match(path):
            raise PatchRejected(f"op {i}: path '{path}' not allowed (only /objects/N/keyframes/..., scale, height_m, color)")
        if op["op"] in ("add", "remove") and re.fullmatch(r"/objects/\d+/(scale|height_m|color)", path) and op["op"] == "remove":
            raise PatchRejected(f"op {i}: cannot remove {path}")
        if op["op"] == "remove" and re.fullmatch(r"/objects/\d+/keyframes", path):
            raise PatchRejected(f"op {i}: cannot remove all keyframes")
    try:
        new = jsonpatch.apply_patch(copy.deepcopy(scene), patch)
    except (jsonpatch.JsonPatchException, jsonpatch.JsonPointerException, KeyError, IndexError, TypeError) as e:
        raise PatchRejected(f"patch does not apply: {e}") from e
    if len(new["objects"]) != len(scene["objects"]) or [o["id"] for o in new["objects"]] != [o["id"] for o in scene["objects"]]:
        raise PatchRejected("objects may not be added, removed or reordered")
    try:
        jsonschema.validate(new, SCENE_SCHEMA)
    except jsonschema.ValidationError as e:
        raise PatchRejected(f"patched scene fails schema: {e.message}") from e
    bad = volume_violations(new)
    if bad:
        raise PatchRejected("volume rule violated: " + "; ".join(bad[:3]))
    hv = hero_violations(new, reference or scene)
    if hv:
        raise PatchRejected("hero rule violated: " + "; ".join(hv[:3]))
    return new

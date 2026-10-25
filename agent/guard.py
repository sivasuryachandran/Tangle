"""Guard: decide whether an Argon patch may be applied. Argon proposes; the guard + checker decide."""
import copy, re

import jsonpatch
import jsonschema

from agent.gemini import ROOT
from agent.volumes import volume_violations
import json

SCENE_SCHEMA = json.loads((ROOT / "schemas" / "scene.schema.json").read_text())
MAX_OPS = 6
ALLOWED_OPS = {"replace", "add", "remove"}
ALLOWED_PATH = re.compile(r"^/objects/\d+/(keyframes(/(\d+|-)(/(t|pos|rot|scale)(/[012])?)?)?|scale|height_m|color)$")


class PatchRejected(ValueError):
    pass


def check(scene, patch):
    """Raise PatchRejected with a reason, else return the patched scene (a new dict)."""
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
    return new

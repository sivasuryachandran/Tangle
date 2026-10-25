"""Compare the times where Argon says the illusion breaks (cited from street.mp4) with the checker's failing times."""

TOL_S = 0.5


def checker_failure_times(report):
    """Failing times in seconds. Prefers report['failure_times_s'] if P2 provides it; otherwise derives them from check details:
    C2 anchors above the max limit, C4 times above the fraction limit, C5 times below the arcmin limit."""
    if report.get("failure_times_s"):
        return sorted({round(float(t), 1) for t in report["failure_times_s"]})
    out = set()
    for c in report.get("checks", []):
        det, lim = c.get("details"), c.get("limit") or {}
        if c.get("check") not in ("C2", "C4", "C5") or c.get("status") != "FAIL" or not isinstance(det, list):
            continue
        for d in det:
            if c["check"] == "C2" and d.get("err_deg", 0) > lim.get("max_deg", 1e9):
                out.add(round(d["t"], 1))
            elif c["check"] == "C4" and d.get("fraction_outside", 0) > lim.get("max_fraction", 1e9):
                out.add(round(d["t"], 1))
            elif c["check"] == "C5" and d.get("arcmin", 1e9) < lim.get("min_arcmin", 0):
                out.add(round(d["t"], 1))
    return sorted(out)


def agreement(argon_times, checker_times, tol=TOL_S):
    """precision = share of Argon's cited times within tol of a checker failure; recall = share of checker failures covered by an Argon time."""
    a = [float(t) for t in argon_times or []]
    c = [float(t) for t in checker_times or []]
    near = lambda x, ys: any(abs(x - y) <= tol + 1e-9 for y in ys)
    ma = sum(near(x, c) for x in a)
    mc = sum(near(y, a) for y in c)
    return {"tolerance_s": tol, "argon_n": len(a), "checker_n": len(c), "argon_matched": ma, "checker_covered": mc,
            "precision": round(ma / len(a), 3) if a else None, "recall": round(mc / len(c), 3) if c else None}

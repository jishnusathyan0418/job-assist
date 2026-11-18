"""Conservative pay labels from explicit posting statements, never inferred from benefits."""

import re


def classify_pay(title, description, compensation=None):
    evidence = []
    paid = False
    unpaid = False
    for line in (title + "\n" + description).splitlines():
        if re.search(r"\bnot\s+(?:a\s+)?paid\b", line, re.I):
            unpaid = True
            evidence.append(line[:500])
            continue
        if re.search(
            r"\b(?:unpaid|unremunerated)\s+(?:internship|intern|position|role)\b|\b(?:internship|position|role)\s+(?:is\s+)?unpaid\b|\b(?:no stipend|without pay|not paid)\b",
            line,
            re.I,
        ):
            unpaid = True
            evidence.append(line[:500])
        if re.search(
            r"\bpaid\s+(?:internship|intern|position|role)\b|\b(?:internship|position|role)\s+(?:is\s+)?paid\b",
            line,
            re.I,
        ):
            paid = True
            evidence.append(line[:500])
        amount = re.search(
            r"\b(?:stipend|salary|pay)\s*[:=-]?\s*(?:(?:INR|Rs\.?|USD|EUR|GBP)\s*|[$\u20b9\u20ac\u00a3]\s*)([0-9][0-9,]*(?:\.[0-9]+)?)",
            line,
            re.I,
        )
        if amount:
            value = float(amount.group(1).replace(",", ""))
            if value > 0:
                paid = True
            else:
                unpaid = True
            evidence.append(line[:500])
    if isinstance(compensation, dict):
        for component in compensation.get("summaryComponents", []) or []:
            if (
                not isinstance(component, dict)
                or component.get("compensationType") != "Salary"
            ):
                continue
            minimum = component.get("minValue")
            if (
                isinstance(minimum, (int, float))
                and not isinstance(minimum, bool)
                and minimum > 0
            ):
                paid = True
                evidence.append(
                    "Provider salary: "
                    + str(minimum)
                    + " "
                    + str(component.get("currencyCode") or "")
                    + " / "
                    + str(component.get("interval") or "period unspecified")
                )
    status = "unknown" if paid == unpaid else "paid" if paid else "unpaid"
    return status, list(dict.fromkeys(evidence))

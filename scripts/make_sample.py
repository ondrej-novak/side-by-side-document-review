"""Generates the sample financial statement PDF and the mock AI extraction that points into it.

Every value is drawn and its box recorded in the same step, so the regions always line up with the page.
Run: python3 scripts/make_sample.py  (needs reportlab)
"""
import json
from pathlib import Path
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

OUT = Path(__file__).resolve().parent.parent / "public" / "sample"
FILE_ID = "statement-2025"
W, H = A4
c = canvas.Canvas(str(OUT / "financial-statement-2025.pdf"), pagesize=A4)
c.setTitle("Northwind Components s.r.o. - Financial statement 2025 (sample)")
sources = {}


def box(field, page, x, y, w, h, value, confidence, content=None):
    """Records a region in normalized page coordinates, origin top-left like the extractor reports it."""
    nx, ny, nw, nh = x / W, (H - y - h) / H, w / W, h / H
    sources[field] = {
        "fileId": FILE_ID,
        "value": value,
        "content": content if content is not None else str(value),
        "confidence": confidence,
        "boundingBoxes": [{
            "pageNumber": page,
            "polygon": [nx, ny, nx + nw, ny, nx + nw, ny + nh, nx, ny + nh],
            "bbox": {"x": round(nx, 4), "y": round(ny, 4), "width": round(nw, 4), "height": round(nh, 4)},
        }],
    }


def text(field, page, x, y, s, value, confidence, size=10, font="Helvetica", right=False):
    c.setFont(font, size)
    w = c.stringWidth(s, font, size)
    if right:
        x -= w
    c.drawString(x, y, s)
    pad = 2
    box(field, page, x - pad, y - 3 - pad, w + 2 * pad, size + 2 * pad, value, confidence, s)


# Low confidence has to mean something in the demo: each field the mock AI is unsure of is actually wrong,
# with a mistake an extractor really makes. The quote and box still point at the printed text.
READ_PRIOR_YEAR = {"depreciation"}
MISREAD_VALUES = {
    "interestExpense": 2_310,  # dropped the minus sign of "-2 310"
    "bankLoans": 39_800,  # swapped two digits of "38 900"
}

# Same rules as server/DocumentReview.Api/Extraction/ConsistencyRules.cs, evaluated on the AI values the way the API
# does, so the static demo shows the same warnings. Every sample value is a number, so none is skipped.
RULES = [
    ("balance", "Total assets = total liabilities and equity", ["totalAssets"], "totalLiabilities"),
    ("assetsAddUp", "Fixed assets + current assets = total assets", ["fixedAssets", "currentAssets"], "totalAssets"),
    ("liabilitiesAddUp", "Equity + bank loans + other liabilities = total liabilities and equity",
     ["equity", "bankLoans", "otherLiabilities"], "totalLiabilities"),
    ("operatingProfitAddsUp", "Revenue + cost of sales + personnel costs + depreciation = operating profit",
     ["revenue", "costOfSales", "personnelCosts", "depreciation"], "operatingProfit"),
    ("netProfitAddsUp", "Operating profit + interest expense + income tax = net profit",
     ["operatingProfit", "interestExpense", "incomeTax"], "netProfit"),
]


def check(rule_id, label, parts, total):
    total_sum = sum(sources[name]["value"] for name in parts)
    expected = sources[total]["value"]
    difference = total_sum - expected
    status = "passed" if abs(difference) <= (len(parts) + 1) / 2 else "failed"
    return {"id": rule_id, "label": label, "parts": parts, "total": total, "status": status,
            "sum": total_sum, "expected": expected, "difference": difference}


def fmt(n):
    return f"{n:,.0f}".replace(",", " ")


# ---- page 1: header + profit and loss
c.setFont("Helvetica-Bold", 16)
c.drawString(50, H - 60, "Financial statement 2025")
c.setFont("Helvetica", 9)
c.drawString(50, H - 75, "Sample document generated for a demo. All names and figures are fictional.")
c.setFont("Helvetica", 10)
c.drawString(50, H - 110, "Company:")
text("companyName", 1, 140, H - 110, "Northwind Components s.r.o.", "Northwind Components s.r.o.", 0.98, font="Helvetica-Bold")
c.drawString(50, H - 128, "Registration no.:")
text("registrationNumber", 1, 140, H - 128, "087 41 225", "08741225", 0.91)
c.drawString(50, H - 146, "Period:")
text("periodEnd", 1, 140, H - 146, "1 Jan 2025 - 31 Dec 2025", "2025-12-31", 0.86)
# Both ends of the period are read off the one printed range, so they share its region.
period_end = sources.pop("periodEnd")
sources["periodStart"] = {**period_end, "value": "2025-01-01"}
sources["periodEnd"] = period_end
c.drawString(50, H - 164, "Currency:")
text("currency", 1, 140, H - 164, "CZK thousands", "CZK", 0.95)

c.setFont("Helvetica-Bold", 12)
c.drawString(50, H - 210, "Profit and loss statement")
c.setLineWidth(0.5)
c.line(50, H - 216, W - 50, H - 216)
c.setFont("Helvetica-Bold", 9)
c.drawRightString(W - 160, H - 232, "2025")
c.drawRightString(W - 50, H - 232, "2024")

rows = [
    ("revenue", "Revenue from sales", 184_250, 0.97, 162_310),
    ("costOfSales", "Cost of sales", -112_480, 0.93, -101_040),
    ("personnelCosts", "Personnel costs", -38_920, 0.89, -35_200),
    ("depreciation", "Depreciation", -6_140, 0.64, -5_870),
    ("operatingProfit", "Operating profit (EBIT)", 26_710, 0.92, 20_200),
    ("interestExpense", "Interest expense", -2_310, 0.58, -2_650),
    ("incomeTax", "Income tax", -4_640, 0.88, -3_410),
    ("netProfit", "Net profit", 19_760, 0.95, 14_140),
]
y = H - 252
for field, label, v25, conf, v24 in rows:
    bold = field in ("operatingProfit", "netProfit")
    c.setFont("Helvetica-Bold" if bold else "Helvetica", 10)
    c.drawString(50, y, label)
    text(field, 1, W - 160, y, fmt(v25), v25, conf, font="Helvetica-Bold" if bold else "Helvetica", right=True)
    if field in READ_PRIOR_YEAR:
        # The mock AI read the wrong column: its value and box are the 2024 figure, not the 2025 one.
        text(field, 1, W - 50, y, fmt(v24), v24, conf, right=True)
    else:
        c.setFont("Helvetica", 10)
        c.drawRightString(W - 50, y, fmt(v24))
    y -= 20
c.showPage()

# ---- page 2: balance sheet
c.setFont("Helvetica-Bold", 12)
c.drawString(50, H - 60, "Balance sheet as of 31 Dec 2025")
c.line(50, H - 66, W - 50, H - 66)
rows = [
    ("fixedAssets", "Fixed assets", 58_300, 0.94),
    ("currentAssets", "Current assets", 71_450, 0.9),
    ("totalAssets", "Total assets", 129_750, 0.96),
    ("equity", "Equity", 64_200, 0.93),
    ("bankLoans", "Bank loans", 38_900, 0.71),
    ("otherLiabilities", "Other liabilities", 26_650, 0.83),
    ("totalLiabilities", "Total liabilities and equity", 129_750, 0.96),
]
y = H - 92
for field, label, v, conf in rows:
    bold = field.startswith("total")
    c.setFont("Helvetica-Bold" if bold else "Helvetica", 10)
    c.drawString(50, y, label)
    text(field, 2, W - 50, y, fmt(v), v, conf, font="Helvetica-Bold" if bold else "Helvetica", right=True)
    y -= 20
    if field == "totalAssets":
        y -= 12
c.showPage()
c.save()

for field, value in MISREAD_VALUES.items():
    sources[field]["value"] = value

extraction = {
    "document": {"id": FILE_ID, "fileName": "financial-statement-2025.pdf", "mimeType": "application/pdf",
                 "size": (OUT / "financial-statement-2025.pdf").stat().st_size},
    "fieldSources": sources,
    "checks": [check(*rule) for rule in RULES],
}
(OUT / "extraction.json").write_text(json.dumps(extraction, indent=2))
print(len(sources), "fields")

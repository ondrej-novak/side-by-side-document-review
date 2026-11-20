namespace DocumentReview.Api.Extraction;

/// <summary>
/// Answers every request with what a model reads from public/sample/financial-statement-2025.pdf, without calling
/// one, so the app runs without an API key or credit. The answers still go through grounding: on the sample PDF
/// every value gets a box; on any other PDF the quotes are not found and every value comes back flagged.
///
/// Like public/sample/extraction.json, the answers below 75 % confidence are wrong on purpose, each with a mistake
/// extractors really make, so the review has something to correct: depreciation is read from the 2024 column,
/// interest expense lost its minus sign, and bank loans has two digits swapped.
/// </summary>
public sealed class SampleFieldExtractor : IFieldExtractor
{
    public string Model => "sample answers (no model call)";

    private static readonly IReadOnlyList<LlmField> Answers =
    [
        new("companyName", "Northwind Components s.r.o.", "Northwind Components s.r.o.", "Company:", 1, 0.98),
        new("registrationNumber", "08741225", "087 41 225", "Registration no.:", 1, 0.91),
        new("periodStart", "2025-01-01", "1 Jan 2025 - 31 Dec 2025", "Period:", 1, 0.86),
        new("periodEnd", "2025-12-31", "1 Jan 2025 - 31 Dec 2025", "Period:", 1, 0.86),
        new("currency", "CZK", "CZK thousands", "Currency:", 1, 0.95),
        new("revenue", "184250", "184 250", "Revenue from sales", 1, 0.97),
        new("costOfSales", "-112480", "-112 480", "Cost of sales", 1, 0.93),
        new("personnelCosts", "-38920", "-38 920", "Personnel costs", 1, 0.89),
        new("depreciation", "-5870", "-5 870", "Depreciation", 1, 0.64),
        new("operatingProfit", "26710", "26 710", "Operating profit (EBIT)", 1, 0.92),
        new("interestExpense", "2310", "-2 310", "Interest expense", 1, 0.58),
        new("incomeTax", "-4640", "-4 640", "Income tax", 1, 0.88),
        new("netProfit", "19760", "19 760", "Net profit", 1, 0.95),
        new("fixedAssets", "58300", "58 300", "Fixed assets", 2, 0.94),
        new("currentAssets", "71450", "71 450", "Current assets", 2, 0.90),
        new("totalAssets", "129750", "129 750", "Total assets", 2, 0.96),
        new("equity", "64200", "64 200", "Equity", 2, 0.93),
        new("bankLoans", "39800", "38 900", "Bank loans", 2, 0.71),
        new("otherLiabilities", "26650", "26 650", "Other liabilities", 2, 0.83),
        new("totalLiabilities", "129750", "129 750", "Total liabilities and equity", 2, 0.96),
    ];

    public Task<IReadOnlyList<LlmField>> ExtractAsync(
        byte[] pdf, IReadOnlyList<FieldDefinition> fields, CancellationToken cancellationToken)
    {
        var requested = fields.Select(f => f.Name).ToHashSet();
        IReadOnlyList<LlmField> answers = Answers.Where(a => requested.Contains(a.Name)).ToList();
        return Task.FromResult(answers);
    }
}

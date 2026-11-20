namespace DocumentReview.Api.Extraction;

public sealed record FieldDefinition(string Name, string Description, string Kind);

/// <summary>The fields the review form shows. The LLM is asked for exactly these and nothing else.</summary>
public static class FieldCatalog
{
    public static readonly IReadOnlyList<FieldDefinition> FinancialStatement =
    [
        new("companyName", "Legal name of the company", "text"),
        new("registrationNumber", "Company registration number (digits only)", "text"),
        new("periodStart", "First day of the reporting period, ISO date YYYY-MM-DD", "date"),
        new("periodEnd", "Last day of the reporting period, ISO date YYYY-MM-DD", "date"),
        new("currency", "ISO 4217 currency code of the figures", "text"),
        new("revenue", "Revenue from sales, current period", "number"),
        new("costOfSales", "Cost of sales, current period (negative when it reduces profit)", "number"),
        new("personnelCosts", "Personnel costs, current period (negative when it reduces profit)", "number"),
        new("depreciation", "Depreciation, current period (negative when it reduces profit)", "number"),
        new("operatingProfit", "Operating profit (EBIT), current period", "number"),
        new("interestExpense", "Interest expense, current period (negative when it reduces profit)", "number"),
        new("incomeTax", "Income tax, current period (negative when it reduces profit)", "number"),
        new("netProfit", "Net profit, current period", "number"),
        new("fixedAssets", "Fixed assets at period end", "number"),
        new("currentAssets", "Current assets at period end", "number"),
        new("totalAssets", "Total assets at period end", "number"),
        new("equity", "Equity at period end", "number"),
        new("bankLoans", "Bank loans at period end", "number"),
        new("otherLiabilities", "Other liabilities at period end", "number"),
        new("totalLiabilities", "Total liabilities and equity at period end", "number"),
    ];
}

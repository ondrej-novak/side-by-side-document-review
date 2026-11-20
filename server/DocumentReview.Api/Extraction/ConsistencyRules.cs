using System.Globalization;

namespace DocumentReview.Api.Extraction;

/// <summary>The parts must add up to the total. A balance check is the case with a single part.</summary>
public sealed record ConsistencyRule(string Id, string Label, IReadOnlyList<string> Parts, string Total);

/// <summary>
/// Relations between catalog fields that hold in every correct statement. A failed check does not say which value
/// is wrong, only which group to recheck. Costs are negative (see the field descriptions), so every rule is a sum.
/// </summary>
public static class ConsistencyRules
{
    public static readonly IReadOnlyList<ConsistencyRule> FinancialStatement =
    [
        new("balance", "Total assets = total liabilities and equity", ["totalAssets"], "totalLiabilities"),
        new("assetsAddUp", "Fixed assets + current assets = total assets",
            ["fixedAssets", "currentAssets"], "totalAssets"),
        new("liabilitiesAddUp", "Equity + bank loans + other liabilities = total liabilities and equity",
            ["equity", "bankLoans", "otherLiabilities"], "totalLiabilities"),
        new("operatingProfitAddsUp", "Revenue + cost of sales + personnel costs + depreciation = operating profit",
            ["revenue", "costOfSales", "personnelCosts", "depreciation"], "operatingProfit"),
        new("netProfitAddsUp", "Operating profit + interest expense + income tax = net profit",
            ["operatingProfit", "interestExpense", "incomeTax"], "netProfit"),
    ];

    private const NumberStyles AmountStyle = NumberStyles.AllowLeadingSign | NumberStyles.AllowDecimalPoint;

    public static ConsistencyCheckDto Evaluate(ConsistencyRule rule, IReadOnlyDictionary<string, string?> values)
    {
        var parts = rule.Parts.Select(name => ParseAmount(values.GetValueOrDefault(name))).ToList();
        if (ParseAmount(values.GetValueOrDefault(rule.Total)) is not { } expected || parts.Contains(null))
            return new(rule.Id, rule.Label, rule.Parts, rule.Total, CheckStatus.Skipped, null, null, null);

        var sum = parts.Sum(part => part!.Value);
        var difference = sum - expected;
        // Every printed figure, the total included, may be off by half a unit from rounding.
        var tolerance = (rule.Parts.Count + 1) / 2m;
        var status = Math.Abs(difference) <= tolerance ? CheckStatus.Passed : CheckStatus.Failed;
        return new(rule.Id, rule.Label, rule.Parts, rule.Total, status, sum, expected, difference);
    }

    /// <summary>
    /// Digits with an optional sign and decimal point, however spaced. No thousands separator: "38,900" could be
    /// 38900 or 38.9, so it is not read at all.
    /// </summary>
    private static decimal? ParseAmount(string? value)
    {
        if (value is null) return null;
        var compact = string.Concat(value.Where(c => !char.IsWhiteSpace(c))).Replace('−', '-');
        return decimal.TryParse(compact, AmountStyle, CultureInfo.InvariantCulture, out var amount) ? amount : null;
    }
}

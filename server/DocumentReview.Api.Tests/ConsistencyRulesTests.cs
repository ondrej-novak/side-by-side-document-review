using System.Globalization;
using DocumentReview.Api.Extraction;

namespace DocumentReview.Api.Tests;

public class ConsistencyRulesTests
{
    // What the sample statement prints; the sample answers get three of these wrong.
    private static readonly Dictionary<string, string?> Printed = new()
    {
        ["revenue"] = "184250",
        ["costOfSales"] = "-112480",
        ["personnelCosts"] = "-38920",
        ["depreciation"] = "-6140",
        ["operatingProfit"] = "26710",
        ["interestExpense"] = "-2310",
        ["incomeTax"] = "-4640",
        ["netProfit"] = "19760",
        ["fixedAssets"] = "58300",
        ["currentAssets"] = "71450",
        ["totalAssets"] = "129750",
        ["equity"] = "64200",
        ["bankLoans"] = "38900",
        ["otherLiabilities"] = "26650",
        ["totalLiabilities"] = "129750",
    };

    private static Dictionary<string, string?> PrintedWith(params (string Field, string? Value)[] changes)
    {
        var values = new Dictionary<string, string?>(Printed);
        foreach (var (field, value) in changes) values[field] = value;
        return values;
    }

    private static ConsistencyCheckDto Check(string id, IReadOnlyDictionary<string, string?> values) =>
        ConsistencyRules.Evaluate(ConsistencyRules.FinancialStatement.Single(r => r.Id == id), values);

    [Fact]
    public void Every_check_passes_on_the_printed_statement()
    {
        Assert.All(ConsistencyRules.FinancialStatement, rule =>
        {
            var check = ConsistencyRules.Evaluate(rule, Printed);
            Assert.Equal(CheckStatus.Passed, check.Status);
            Assert.Equal(0m, check.Difference);
        });
    }

    [Fact]
    public void Reports_the_sum_the_total_and_how_far_apart_they_are()
    {
        var check = Check("liabilitiesAddUp", PrintedWith(("bankLoans", "39800")));

        Assert.Equal(CheckStatus.Failed, check.Status);
        Assert.Equal(130650m, check.Sum);
        Assert.Equal(129750m, check.Expected);
        Assert.Equal(900m, check.Difference);
    }

    [Fact]
    public void A_missing_value_skips_the_check_instead_of_counting_as_zero()
    {
        var check = Check("liabilitiesAddUp", PrintedWith(("otherLiabilities", null)));

        Assert.Equal(CheckStatus.Skipped, check.Status);
        Assert.Null(check.Sum);
        Assert.Null(check.Difference);
    }

    [Theory]
    [InlineData("n/a")]
    [InlineData("")]
    [InlineData("38,900")]
    [InlineData("38.900,0")]
    public void A_value_that_is_not_a_plain_number_skips_the_check(string bankLoans)
    {
        Assert.Equal(CheckStatus.Skipped, Check("liabilitiesAddUp", PrintedWith(("bankLoans", bankLoans))).Status);
    }

    [Fact]
    public void Reads_numbers_however_they_are_spaced_or_signed()
    {
        var values = PrintedWith(("bankLoans", "38 900"), ("equity", "64 200"), ("interestExpense", "−2 310"));

        Assert.Equal(CheckStatus.Passed, Check("liabilitiesAddUp", values).Status);
        Assert.Equal(CheckStatus.Passed, Check("netProfitAddsUp", values).Status);
    }

    [Fact]
    public void Reads_a_decimal_point_the_same_whatever_the_server_culture()
    {
        var values = PrintedWith(("depreciation", "-6140.0"), ("operatingProfit", "26710.00"));
        var original = CultureInfo.CurrentCulture;
        try
        {
            // In de-DE the point is the thousands separator, so a culture-sensitive parse would read -61400.
            CultureInfo.CurrentCulture = CultureInfo.GetCultureInfo("de-DE");
            Assert.Equal(CheckStatus.Passed, Check("operatingProfitAddsUp", values).Status);
        }
        finally
        {
            CultureInfo.CurrentCulture = original;
        }
    }

    [Theory]
    [InlineData("129752", CheckStatus.Passed)]
    [InlineData("129748", CheckStatus.Passed)]
    [InlineData("129753", CheckStatus.Failed)]
    public void Allows_half_a_unit_of_rounding_for_every_figure_in_the_sum(string total, CheckStatus expected)
    {
        // Three parts and a total, each rounded to the nearest unit: they may drift apart by up to 2.
        Assert.Equal(expected, Check("liabilitiesAddUp", PrintedWith(("totalLiabilities", total))).Status);
    }

    [Fact]
    public void Rules_use_only_number_fields_from_the_catalog()
    {
        var kinds = FieldCatalog.FinancialStatement.ToDictionary(f => f.Name, f => f.Kind);

        Assert.All(ConsistencyRules.FinancialStatement.SelectMany(r => r.Parts.Append(r.Total)),
            field => Assert.Equal("number", kinds.GetValueOrDefault(field)));
    }
}

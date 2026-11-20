using System.Text.Json;
using DocumentReview.Api.Extraction;

namespace DocumentReview.Api.Tests;

public class ExtractionServiceTests
{
    private static readonly PdfTextLocator Locator =
        PdfTextLocator.Load(File.ReadAllBytes(PdfTextLocatorTests.SamplePdf));

    private static readonly DocumentDto Document = new("doc-1", "statement.pdf", "application/pdf", 100);

    private static ExtractionResponse Build(params LlmField[] answers) => ExtractionService.Build(
        Document, FieldCatalog.FinancialStatement, ConsistencyRules.FinancialStatement, answers, Locator, "test-model");

    [Fact]
    public void Every_catalog_field_is_in_the_response_even_when_the_model_skipped_it()
    {
        var response = Build(new LlmField("revenue", "184250", "184 250", "Revenue from sales", 1, 0.95));

        Assert.Equal(FieldCatalog.FinancialStatement.Count, response.FieldSources.Count);
        Assert.Null(response.FieldSources["netProfit"].Value);
        Assert.Empty(response.FieldSources["netProfit"].BoundingBoxes);
    }

    [Fact]
    public void A_grounded_value_keeps_the_model_confidence_and_gets_a_box()
    {
        var revenue = Build(new LlmField("revenue", "184250", "184 250", "Revenue from sales", 1, 0.95))
            .FieldSources["revenue"];

        Assert.Equal(0.95, revenue.Confidence);
        Assert.Single(revenue.BoundingBoxes);
        Assert.Equal("doc-1", revenue.FileId);
    }

    [Fact]
    public void A_value_whose_quote_is_not_in_the_pdf_is_flagged_by_low_confidence()
    {
        // The model "read" a number that is not printed anywhere (a hallucination or a calculation).
        var ebitda = Build(new LlmField("operatingProfit", "32850", "32 850", "EBITDA", 1, 0.9))
            .FieldSources["operatingProfit"];

        Assert.Equal("32850", ebitda.Value);
        Assert.Empty(ebitda.BoundingBoxes);
        Assert.True(ebitda.Confidence <= 0.3);
    }

    [Fact]
    public void Every_rule_is_checked_and_skipped_without_its_values()
    {
        var response = Build(new LlmField("revenue", "184250", "184 250", "Revenue from sales", 1, 0.95));

        Assert.Equal(ConsistencyRules.FinancialStatement.Select(r => r.Id), response.Checks.Select(c => c.Id));
        Assert.All(response.Checks, check => Assert.Equal(CheckStatus.Skipped, check.Status));
    }

    [Fact]
    public void Fields_outside_the_catalog_are_dropped()
    {
        var response = Build(new LlmField("ceoName", "Jane", "Jane", null, 1, 0.9));
        Assert.False(response.FieldSources.ContainsKey("ceoName"));
    }

    [Fact]
    public void Schema_limits_names_to_the_catalog_and_requires_every_property()
    {
        var schema = JsonSerializer.Serialize(ClaudeExtractor.BuildSchema(FieldCatalog.FinancialStatement));
        using var doc = JsonDocument.Parse(schema);
        var item = doc.RootElement.GetProperty("properties").GetProperty("fields").GetProperty("items");

        var names = item.GetProperty("properties").GetProperty("name").GetProperty("enum")
            .EnumerateArray().Select(e => e.GetString()).ToList();
        Assert.Equal(FieldCatalog.FinancialStatement.Select(f => f.Name), names);

        var required = item.GetProperty("required").EnumerateArray().Select(e => e.GetString()!).ToHashSet();
        var properties = item.GetProperty("properties").EnumerateObject().Select(p => p.Name).ToHashSet();
        Assert.Equal(properties, required);
        Assert.False(item.GetProperty("additionalProperties").GetBoolean());
    }
}

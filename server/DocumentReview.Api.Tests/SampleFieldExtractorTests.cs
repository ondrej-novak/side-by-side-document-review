using DocumentReview.Api.Extraction;

namespace DocumentReview.Api.Tests;

public class SampleFieldExtractorTests
{
    private static readonly byte[] SamplePdf = File.ReadAllBytes(PdfTextLocatorTests.SamplePdf);

    private static Task<ExtractionResponse> Extract() =>
        new ExtractionService(new SampleFieldExtractor()).ExtractAsync(
            new DocumentDto("doc-1", "statement.pdf", "application/pdf", SamplePdf.Length),
            SamplePdf, PdfTextLocator.Load(SamplePdf), CancellationToken.None);

    [Fact]
    public async Task Every_sample_answer_is_grounded_in_the_sample_pdf()
    {
        var response = await Extract();

        Assert.All(FieldCatalog.FinancialStatement, field =>
        {
            var source = response.FieldSources[field.Name];
            Assert.NotNull(source.Value);
            Assert.Single(source.BoundingBoxes);
            Assert.True(source.Confidence > 0.3, $"{field.Name} lost its confidence, so its quote was not found");
        });
    }

    [Fact]
    public async Task The_sample_mistakes_break_the_sums_but_not_the_balance()
    {
        var checks = (await Extract()).Checks.ToDictionary(c => c.Id);

        Assert.Equal(CheckStatus.Passed, checks["balance"].Status);
        Assert.Equal(CheckStatus.Passed, checks["assetsAddUp"].Status);
        Assert.Equal((CheckStatus.Failed, 900m), (checks["liabilitiesAddUp"].Status, checks["liabilitiesAddUp"].Difference));
        Assert.Equal((CheckStatus.Failed, 270m),
            (checks["operatingProfitAddsUp"].Status, checks["operatingProfitAddsUp"].Difference));
        Assert.Equal((CheckStatus.Failed, 4620m), (checks["netProfitAddsUp"].Status, checks["netProfitAddsUp"].Difference));
    }

    [Fact]
    public async Task Says_in_the_response_that_no_model_was_called()
    {
        Assert.Equal("sample answers (no model call)", (await Extract()).Model);
    }
}

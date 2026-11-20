using DocumentReview.Api.Extraction;

namespace DocumentReview.Api.Tests;

public class PdfTextLocatorTests
{
    internal static readonly string SamplePdf = Path.GetFullPath(Path.Combine(
        AppContext.BaseDirectory, "../../../../../public/sample/financial-statement-2025.pdf"));

    private static readonly PdfTextLocator Locator = PdfTextLocator.Load(File.ReadAllBytes(SamplePdf));

    [Fact]
    public void Reads_the_text_layer_of_both_pages()
    {
        Assert.True(Locator.HasText);
        Assert.Equal(2, Locator.PageCount);
    }

    [Fact]
    public void Finds_a_value_split_into_several_words()
    {
        var box = Assert.Single(Locator.Locate("087 41 225", 1));

        Assert.Equal(1, box.PageNumber);
        // The sample's hand-made boxes are padded; glyph boxes are tight, so compare with a small tolerance.
        Assert.InRange(box.Bbox.X, 0.2318 - 0.01, 0.2318 + 0.01);
        Assert.InRange(box.Bbox.Y, 0.1413 - 0.01, 0.1413 + 0.01);
    }

    [Fact]
    public void Ignores_spacing_differences_between_the_quote_and_the_pdf()
    {
        Assert.Single(Locator.Locate("184250", 1));
        Assert.Single(Locator.Locate("Northwind   Components s.r.o.", 1));
    }

    [Fact]
    public void Looks_on_other_pages_when_the_model_miscounts()
    {
        var box = Assert.Single(Locator.Locate("38 900", 1));
        Assert.Equal(2, box.PageNumber);
    }

    [Fact]
    public void Returns_nothing_for_text_that_is_not_printed()
    {
        Assert.Empty(Locator.Locate("999 999", 1));
        Assert.Empty(Locator.Locate(null, 1));
        Assert.Empty(Locator.Locate("   ", 1));
    }

    [Fact]
    public void Uses_the_label_to_choose_between_repeated_values()
    {
        // "129 750" is printed twice: total assets and total liabilities and equity.
        var assets = Assert.Single(Locator.Locate("129 750", 2, "Total assets"));
        var liabilities = Assert.Single(Locator.Locate("129 750", 2, "Total liabilities and equity"));

        Assert.InRange(assets.Bbox.Y, 0.1461 - 0.01, 0.1461 + 0.01);
        Assert.InRange(liabilities.Bbox.Y, 0.2554 - 0.01, 0.2554 + 0.01);
    }

    [Fact]
    public void Polygon_and_bbox_describe_the_same_rectangle()
    {
        var box = Locator.Locate("Net profit", 1).Single();
        Assert.Equal(box.Bbox.X, box.Polygon[0]);
        Assert.Equal(box.Bbox.Y, box.Polygon[1]);
        Assert.Equal(box.Bbox.X + box.Bbox.Width, box.Polygon[2], 4);
        Assert.Equal(box.Bbox.Y + box.Bbox.Height, box.Polygon[5], 4);
    }
}

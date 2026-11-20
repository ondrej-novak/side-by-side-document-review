using UglyToad.PdfPig;
using UglyToad.PdfPig.Content;

namespace DocumentReview.Api.Extraction;

/// <summary>
/// Finds where a piece of printed text sits on a PDF page, using the PDF's own text layer.
///
/// The LLM decides <i>what</i> a value is; this class decides <i>where</i> it is. Models read documents well but
/// guess coordinates poorly, so the extractor asks for the text exactly as printed and the page it is on, and the
/// box comes from the glyph positions in the file. A value the model paraphrased or invented has no match and gets
/// no box, which the UI then shows as "no source" instead of a confident rectangle in the wrong place.
/// </summary>
public sealed class PdfTextLocator
{
    private readonly IReadOnlyList<PageWords> _pages;

    private PdfTextLocator(IReadOnlyList<PageWords> pages) => _pages = pages;

    public int PageCount => _pages.Count;

    public static PdfTextLocator Load(byte[] pdf)
    {
        using var document = PdfDocument.Open(pdf);
        var pages = document.GetPages()
            .Select(p => new PageWords(p.Number, p.Width, p.Height, p.GetWords().ToList()))
            .ToList();
        return new PdfTextLocator(pages);
    }

    /// <summary>True when the PDF carries a text layer at all (a scan without OCR does not).</summary>
    public bool HasText => _pages.Any(p => p.Words.Count > 0);

    /// <summary>
    /// Boxes for <paramref name="sourceText"/> on <paramref name="pageNumber"/>, or on any page when that page has
    /// no match (models sometimes miscount pages). Empty when the text is not printed in the document.
    ///
    /// The same number is often printed more than once (total assets equals total liabilities and equity), so a
    /// quote alone can be ambiguous. When it is, <paramref name="label"/> (the row label as printed) breaks the tie:
    /// the match closest to that label's line wins.
    /// </summary>
    public IReadOnlyList<BoundingBoxDto> Locate(string? sourceText, int? pageNumber, string? label = null)
    {
        var target = Normalize(sourceText);
        if (target.Length == 0) return [];

        var ordered = _pages.OrderBy(p => p.Number == pageNumber ? 0 : 1);
        foreach (var page in ordered)
        {
            var matches = FindRuns(page.Words, target);
            if (matches.Count == 0) continue;

            var best = matches.Count == 1 ? matches[0] : PickByLabel(page, matches, label) ?? matches[0];
            return [ToBox(page, best)];
        }
        return [];
    }

    /// <summary>Every run of consecutive words whose normalized text equals the target.</summary>
    private static List<IReadOnlyList<Word>> FindRuns(IReadOnlyList<Word> words, string target)
    {
        var runs = new List<IReadOnlyList<Word>>();
        for (var start = 0; start < words.Count; start++)
        {
            var joined = "";
            for (var end = start; end < words.Count; end++)
            {
                joined += Normalize(words[end].Text);
                if (joined == target)
                {
                    runs.Add(words.Skip(start).Take(end - start + 1).ToList());
                    break;
                }
                if (joined.Length >= target.Length || !target.StartsWith(joined, StringComparison.Ordinal)) break;
            }
        }
        return runs;
    }

    private static IReadOnlyList<Word>? PickByLabel(PageWords page, List<IReadOnlyList<Word>> matches, string? label)
    {
        var labelTarget = Normalize(label);
        if (labelTarget.Length == 0) return null;

        var labelRuns = FindRuns(page.Words, labelTarget);
        if (labelRuns.Count == 0) return null;

        // Distance between line centres; a value sits on its label's row, usually to the right of it.
        static double CenterY(IReadOnlyList<Word> run) =>
            run.Average(w => (w.BoundingBox.Top + w.BoundingBox.Bottom) / 2);

        return matches
            .OrderBy(m => labelRuns.Min(l => Math.Abs(CenterY(m) - CenterY(l))))
            .First();
    }

    private static BoundingBoxDto ToBox(PageWords page, IReadOnlyList<Word> words)
    {
        var left = words.Min(w => w.BoundingBox.Left);
        var right = words.Max(w => w.BoundingBox.Right);
        var bottom = words.Min(w => w.BoundingBox.Bottom);
        var top = words.Max(w => w.BoundingBox.Top);

        // PDF space has its origin bottom-left; the viewer expects top-left, normalized to the page.
        var x = left / page.Width;
        var y = (page.Height - top) / page.Height;
        var w = (right - left) / page.Width;
        var h = (top - bottom) / page.Height;

        var rect = new RectDto(Round(x), Round(y), Round(w), Round(h));
        return new BoundingBoxDto(page.Number, [rect.X, rect.Y, rect.X + rect.Width, rect.Y, rect.X + rect.Width,
            rect.Y + rect.Height, rect.X, rect.Y + rect.Height], rect);
    }

    /// <summary>Whitespace and case never decide a match: "38 900" in the PDF is "38900" from the model.</summary>
    internal static string Normalize(string? text) =>
        text is null ? "" : new string(text.Where(c => !char.IsWhiteSpace(c)).ToArray()).ToLowerInvariant();

    private static double Round(double v) => Math.Round(v, 4);

    private sealed record PageWords(int Number, double Width, double Height, IReadOnlyList<Word> Words);
}

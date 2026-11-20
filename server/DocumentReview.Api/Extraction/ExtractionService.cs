namespace DocumentReview.Api.Extraction;

/// <summary>
/// Turns what the model said into what the review UI needs: one entry per catalog field, with a box only where the
/// quoted text was actually found in the PDF.
/// </summary>
public sealed class ExtractionService(IFieldExtractor extractor)
{
    public async Task<ExtractionResponse> ExtractAsync(
        DocumentDto document, byte[] pdf, PdfTextLocator locator, CancellationToken cancellationToken)
    {
        var fields = FieldCatalog.FinancialStatement;
        var answers = await extractor.ExtractAsync(pdf, fields, cancellationToken);
        return Build(document, fields, ConsistencyRules.FinancialStatement, answers, locator, extractor.Model);
    }

    internal static ExtractionResponse Build(
        DocumentDto document,
        IReadOnlyList<FieldDefinition> fields,
        IReadOnlyList<ConsistencyRule> rules,
        IReadOnlyList<LlmField> answers,
        PdfTextLocator locator,
        string model)
    {
        // First answer wins if the model repeats a field; fields it skipped still appear, empty.
        var byName = answers.GroupBy(a => a.Name).ToDictionary(g => g.Key, g => g.First());
        var sources = new Dictionary<string, FieldSourceDto>();

        foreach (var field in fields)
        {
            byName.TryGetValue(field.Name, out var answer);
            var boxes = locator.Locate(answer?.SourceText, answer?.Page, answer?.Label);

            // A value whose quote is not in the document is ungrounded: keep it for the analyst, but say so by
            // capping confidence, because the model's own number does not know it misquoted.
            var confidence = Math.Clamp(answer?.Confidence ?? 0, 0, 1);
            if (answer?.Value is not null && boxes.Count == 0) confidence = Math.Min(confidence, 0.3);

            sources[field.Name] = new FieldSourceDto(
                document.Id, answer?.Value, answer?.SourceText, Math.Round(confidence, 2), boxes);
        }

        // On every value the model gave, grounded or not: an unboxed value can still be the one that breaks a sum.
        var values = sources.ToDictionary(source => source.Key, source => source.Value.Value);
        var checks = rules.Select(rule => ConsistencyRules.Evaluate(rule, values)).ToList();

        return new ExtractionResponse(document, sources, checks, model);
    }
}

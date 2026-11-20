namespace DocumentReview.Api.Extraction;

// Same shape the frontend already renders (src/types.ts), so the sample JSON and a live extraction are interchangeable.

public sealed record DocumentDto(string Id, string FileName, string MimeType, long Size);

public sealed record FieldSourceDto(
    string FileId,
    string? Value,
    string? Content,
    double Confidence,
    IReadOnlyList<BoundingBoxDto> BoundingBoxes);

public sealed record BoundingBoxDto(int PageNumber, IReadOnlyList<double> Polygon, RectDto Bbox);

/// <summary>Normalized to the page (0–1 on both axes), origin top-left.</summary>
public sealed record RectDto(double X, double Y, double Width, double Height);

public enum CheckStatus { Passed, Failed, Skipped }

/// <summary>
/// One consistency rule evaluated on the AI's values. The rule itself (parts and total) comes along so the UI can
/// evaluate it again as the analyst corrects values. Sum, expected and difference are null when it was skipped.
/// </summary>
public sealed record ConsistencyCheckDto(
    string Id,
    string Label,
    IReadOnlyList<string> Parts,
    string Total,
    CheckStatus Status,
    decimal? Sum,
    decimal? Expected,
    decimal? Difference);

public sealed record ExtractionResponse(
    DocumentDto Document,
    IReadOnlyDictionary<string, FieldSourceDto> FieldSources,
    IReadOnlyList<ConsistencyCheckDto> Checks,
    string Model);

/// <summary>What the LLM returns for one field: the value and where it read it, but not the coordinates.</summary>
public sealed record LlmField(
    string Name, string? Value, string? SourceText, string? Label, int? Page, double Confidence);

namespace DocumentReview.Api.Extraction;

/// <summary>
/// The only place the app talks to a model. Everything around it (validation, locating sources, the HTTP contract)
/// is ordinary deterministic code that can be tested without a network or an API key.
/// </summary>
public interface IFieldExtractor
{
    string Model { get; }

    Task<IReadOnlyList<LlmField>> ExtractAsync(
        byte[] pdf, IReadOnlyList<FieldDefinition> fields, CancellationToken cancellationToken);
}

/// <summary>The model declined, or its answer did not match the schema. Mapped to 502 by the endpoint.</summary>
public sealed class ExtractionFailedException(string message) : Exception(message);

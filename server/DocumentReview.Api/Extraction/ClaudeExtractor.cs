using System.Text.Json;
using Anthropic;
using Anthropic.Models.Messages;

namespace DocumentReview.Api.Extraction;

/// <summary>
/// One request per document: the PDF goes in as a document block, the answer comes back as JSON that must match a
/// schema built from <see cref="FieldCatalog"/>.
/// </summary>
public sealed class ClaudeExtractor(AnthropicClient client, ILogger<ClaudeExtractor> logger) : IFieldExtractor
{
    public string Model => "claude-opus-5-5";

    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };

    // Stable text first, the document after it: identical prefixes are what prompt caching can reuse.
    private const string Instructions = """
        You extract fields from a company's financial statement for an analyst who will review every value.

        For each requested field return:
        - value: the normalized value (numbers as plain digits with an optional leading minus and decimal point,
          no thousands separators or currency; dates as YYYY-MM-DD). Null when the document does not state it.
        - sourceText: the shortest span copied character for character from the document that the value was read
          from, exactly as printed (keep the original spacing and separators). Null when value is null.
        - label: the row or field label printed next to sourceText, copied exactly (for example "Total assets").
          Null when there is none.
        - page: the 1-based page number of sourceText. Null when value is null.
        - confidence: 0 to 1, how sure you are that value is correct for this field.

        Rules:
        - Never compute or infer a value that is not printed. A missing field is null, not an estimate.
        - Use the current period column, not the comparative (prior year) column.
        - Return every requested field exactly once, in the order given.
        """;

    public async Task<IReadOnlyList<LlmField>> ExtractAsync(
        byte[] pdf, IReadOnlyList<FieldDefinition> fields, CancellationToken cancellationToken)
    {
        var fieldList = string.Join('\n', fields.Select(f => $"- {f.Name} ({f.Kind}): {f.Description}"));

        var response = await client.Messages.Create(new MessageCreateParams
        {
            Model = Model,
            MaxTokens = 16000,
            System = new List<TextBlockParam> { new() { Text = Instructions } },
            OutputConfig = new OutputConfig { Format = new JsonOutputFormat { Schema = BuildSchema(fields) } },
            Messages =
            [
                new UserMessageParam
                {
                    Content = new List<ContentBlockParam>
                    {
                        new DocumentBlockParam { Source = new Base64PdfSource { Data = Convert.ToBase64String(pdf) } },
                        new TextBlockParam { Text = $"Fields to extract:\n{fieldList}" },
                    },
                },
            ],
        }, cancellationToken);

        logger.LogInformation(
            "Extraction finished: stop={StopReason} input={Input} output={Output} tokens",
            response.StopReason, response.Usage.InputTokens, response.Usage.OutputTokens);

        if (response.StopReason == "refusal")
            throw new ExtractionFailedException("The model declined to process this document.");
        if (response.StopReason == "max_tokens")
            throw new ExtractionFailedException("The answer was cut off before it was complete.");

        var json = string.Concat(response.Content.Select(b => b.Value).OfType<TextBlock>().Select(t => t.Text));
        var answer = JsonSerializer.Deserialize<LlmAnswer>(json, JsonOptions)
            ?? throw new ExtractionFailedException("The model returned an empty answer.");
        return answer.Fields;
    }

    /// <summary>
    /// The schema is the contract: field names are an enum, so the model cannot invent a field, and every property
    /// is required (nullable instead of optional), so a missing value is an explicit null rather than a gap.
    /// </summary>
    internal static Dictionary<string, JsonElement> BuildSchema(IReadOnlyList<FieldDefinition> fields)
    {
        var nullableString = new { type = new[] { "string", "null" } };
        var field = new
        {
            type = "object",
            additionalProperties = false,
            required = new[] { "name", "value", "sourceText", "label", "page", "confidence" },
            properties = new Dictionary<string, object>
            {
                ["name"] = new { type = "string", @enum = fields.Select(f => f.Name).ToArray() },
                ["value"] = nullableString,
                ["sourceText"] = nullableString,
                ["label"] = nullableString,
                ["page"] = new { type = new[] { "integer", "null" } },
                ["confidence"] = new { type = "number" },
            },
        };

        return new Dictionary<string, JsonElement>
        {
            ["type"] = JsonSerializer.SerializeToElement("object"),
            ["additionalProperties"] = JsonSerializer.SerializeToElement(false),
            ["required"] = JsonSerializer.SerializeToElement(new[] { "fields" }),
            ["properties"] = JsonSerializer.SerializeToElement(new { fields = new { type = "array", items = field } }),
        };
    }

    private sealed record LlmAnswer(List<LlmField> Fields);
}

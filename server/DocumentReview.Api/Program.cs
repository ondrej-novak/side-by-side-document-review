using System.Text.Json;
using System.Text.Json.Serialization;
using Anthropic;
using Anthropic.Exceptions;
using DocumentReview.Api.Extraction;

const long MaxPdfBytes = 20 * 1024 * 1024;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddProblemDetails();
builder.Services.ConfigureHttpJsonOptions(o =>
{
    o.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
    o.SerializerOptions.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.CamelCase));
});
if (builder.Configuration.GetValue<bool>("Extraction:UseSampleAnswers"))
{
    builder.Services.AddSingleton<IFieldExtractor, SampleFieldExtractor>();
}
else
{
    builder.Services.AddSingleton(_ => new AnthropicClient());
    builder.Services.AddSingleton<IFieldExtractor, ClaudeExtractor>();
}
builder.Services.AddSingleton<ExtractionService>();

var app = builder.Build();
app.UseExceptionHandler();

app.MapGet("/api/health", () => Results.Ok(new { status = "ok" }));

app.MapPost("/api/extractions", async (IFormFile file, ExtractionService service, ILogger<Program> logger,
    CancellationToken ct) =>
{
    if (file.Length == 0)
        return Results.Problem("The file is empty.", statusCode: StatusCodes.Status400BadRequest);
    if (file.Length > MaxPdfBytes)
        return Results.Problem("PDFs up to 20 MB are accepted.", statusCode: StatusCodes.Status413PayloadTooLarge);

    using var buffer = new MemoryStream();
    await file.CopyToAsync(buffer, ct);
    var pdf = buffer.ToArray();

    if (!pdf.AsSpan().StartsWith("%PDF-"u8))
        return Results.Problem("Only PDF files are accepted.", statusCode: StatusCodes.Status415UnsupportedMediaType);

    PdfTextLocator locator;
    try { locator = PdfTextLocator.Load(pdf); }
    catch (Exception e)
    {
        logger.LogWarning(e, "Could not parse PDF");
        return Results.Problem("The PDF could not be read.", statusCode: StatusCodes.Status422UnprocessableEntity);
    }

    // Without a text layer nothing can be grounded; a scan needs OCR first.
    if (!locator.HasText)
        return Results.Problem("The PDF has no text layer (a scan?). OCR it first.",
            statusCode: StatusCodes.Status422UnprocessableEntity);

    var document = new DocumentDto(Guid.NewGuid().ToString("n"), file.FileName, "application/pdf", pdf.Length);

    try
    {
        return Results.Ok(await service.ExtractAsync(document, pdf, locator, ct));
    }
    catch (ExtractionFailedException e)
    {
        return Results.Problem(e.Message, statusCode: StatusCodes.Status502BadGateway);
    }
    catch (AnthropicUnauthorizedException e)
    {
        logger.LogError(e, "Model call rejected the credentials");
        return Results.Problem("The model is not configured on the server (set ANTHROPIC_API_KEY).",
            statusCode: StatusCodes.Status503ServiceUnavailable);
    }
    catch (AnthropicException e) when (e is AnthropicBadRequestException or AnthropicForbiddenException)
    {
        // Billing, model access or a request bug: retrying cannot help, the operator has to act.
        logger.LogError(e, "Model call refused the request");
        return Results.Problem("The model service refused the request (billing, model access or configuration). " +
            "Details are in the server log.", statusCode: StatusCodes.Status503ServiceUnavailable);
    }
    catch (AnthropicException e)
    {
        // Rate limits, overload and timeouts are already retried by the SDK before they get here.
        logger.LogError(e, "Model call failed");
        return Results.Problem("The model call failed. Try again.", statusCode: StatusCodes.Status502BadGateway);
    }
}).DisableAntiforgery();

app.Run();

public partial class Program;

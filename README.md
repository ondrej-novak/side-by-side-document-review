# side-by-side-document-review

Review what an AI extracted from a document, side by side with the document itself. The PDF sits on the left,
the extracted values on the right, and each value is linked to the region of the page it was read from.

## Features

- **Two-way highlighting.** Hover or focus a field to see its source region on the page, with a connector line
  between the two. Hover a region to highlight every field read from it.
- **Grounded extraction.** The model has to return the exact text it read each value from, along with the value.
  The server looks that text up in the PDF's text layer to place the bounding box. If the quote isn't found, the
  value isn't grounded, so a value the model invented can't point at a real region.
- **Field review statuses.** Each value starts as an AI suggestion. The reviewer confirms or corrects it, can
  confirm a section's confident values at once, and approves the document at the end. There is no confirming the whole document at once, so the reviewer goes through it section by section.
  Each section's double-check button sits above the column of field check buttons: blue when it has values to
  confirm, grey when only low-confidence values are left, green when the section is done. Its tooltip says which.
- **Consistency checks.** Deterministic accounting checks (total assets equal total liabilities and equity, line
  items add up to their totals) show warnings on the field groups that break them. Confirming a section skips fields in groups that fail a check.
  An icon in the header sums them up: a warning with the number of failing checks, green when every check adds
  up, grey when some could not run. Clicking it lists the checks.
- **Works without a backend.** With no server running, the demo shows a bundled sample extraction. A few of its
  low-confidence values are wrong on purpose, so the checks have something to catch.

## Stack

- **Frontend:** React 19, TypeScript, Vite, pdf.js, TanStack Query. Tests use Vitest and Testing Library.
- **Backend:** ASP.NET Core minimal API on .NET 10. It uses the Anthropic SDK for extraction and PdfPig for the
  PDF text layer. Tests use xUnit.

## Run the demo

```
npm install
npm run dev      # http://localhost:5173, shows the bundled sample
```

## Run with the extraction API

Uploading your own PDF needs the .NET server. The Vite dev server proxies `/api` to `http://localhost:5053`.

```
# real extraction with Claude
export ANTHROPIC_API_KEY=...
dotnet run --project server/DocumentReview.Api

# or canned answers for the sample PDF: no API key, no cost
dotnet run --project server/DocumentReview.Api --launch-profile sample
```

Then run `npm run dev` and use **Upload PDF**.

The API accepts PDFs up to 20 MB that have a text layer. Scanned PDFs need OCR first.

| Endpoint | Description |
|---|---|
| `GET /api/health` | Liveness check |
| `POST /api/extractions` | Multipart upload (`file`). Returns the values, their source regions and the check results |

## Tests

```
npm test                                # frontend
npm run lint
npm run build                           # type-check and production build
dotnet test server/DocumentReview.slnx  # backend
```

## Sample data

`scripts/make_sample.py` (requires reportlab) generates the sample financial statement in
`public/sample/financial-statement-2025.pdf` and the mock extraction in `public/sample/extraction.json`. It
writes each value and records its region in the same step, so the regions always match the page. The company
in it is fictional.

## License

[MIT](LICENSE)

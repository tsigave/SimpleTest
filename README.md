# Citanger Values Test

A configurable 8values-style website with:

- Scale questions with customizable axis labels.
- Dot-based bipolar scale questions with 3, 5, or 7 dots and configurable points per dot.
- Optional question subtitles shown above the prompt.
- Multiple-choice questions with per-option effects, including multi-select mode.
- Server-side hidden question triggers.
- Hidden axes that appear only after trigger conditions pass.
- Result medals with answer and value requirements.
- A guaranteed final result from a nested `if` / `then` / `else` decision tree.
- Encrypted, shareable result links.
- Multilingual test content.
- Language switching without restarting the current page.
- Custom result colors with built-in fallback color pairs.
- Opposition axes that show both side percentages.
- Report-hidden axes that users can reveal with a checkbox.
- Back navigation during a live test, including from the local result page.

## Run

```powershell
npm start
```

Open `http://localhost:3000`.

For persistent share links in production, set a stable secret before starting the server:

```powershell
$env:RESULT_SECRET = "replace-with-a-long-random-secret"
npm start
```

## Data

Test JSON files live in `data/tests`. Static frontend files live in `public`. The server reads scoring data and sends only public question text and answer labels to the browser.

See [docs/data-format.md](docs/data-format.md) for the full schema.

Validate test profiles before running:

```powershell
npm run validate:data
```

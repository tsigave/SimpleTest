# Test Data Format

Test definitions live in `data/tests/*.json`. They are loaded only by `server.js`; the browser never imports these files, so scoring values, trigger rules, and medal requirements are not shipped as static frontend assets.

Validate all test profiles with:

```powershell
npm run validate:data
```

Invalid JSON or invalid profile references stop validation with file/path-specific errors. The server uses the same validation during startup, so a broken profile fails early instead of producing partial questionnaire behavior.

## Top-Level Shape

```json
{
  "id": "sample-values",
  "defaultLocale": "en",
  "locales": ["en", "zh"],
  "title": { "en": "Citanger Values Test", "zh": "Citanger 价值测试" },
  "description": { "en": "Description", "zh": "说明" },
  "axes": [],
  "questions": [],
  "finalResult": {},
  "medals": []
}
```

Localized strings can be plain strings or locale maps. Locale maps fall back to `defaultLocale`, then `en`, then the first available value.

## Axes

Axes are the values shown on the result page.

```json
{
  "id": "fruit_affinity",
  "defaultEnabled": true,
  "initial": 0,
  "color": "#2F6FA3",
  "opposition": false,
  "hideWhenAxesEnabled": ["sweetness"],
  "name": { "en": "Fruit Affinity" },
  "leftLabel": { "en": "Avoids fruit" },
  "rightLabel": { "en": "Enjoys fruit" }
}
```

Set `defaultEnabled` to `false` for hidden axes. Hidden axes can define `enabledBy` with the same trigger format used by questions. If the trigger becomes true, the axis appears in the final result.

### Result Percentages

Result percentages are based on the possible score range for the questions the user actually answered, not on static axis bounds.

For each answered question, the server computes the minimum and maximum possible contribution to each axis by checking every answer or option for that question. Options that do not affect an axis count as `0` for that axis.

Non-opposition axes use a one-polar range:

```text
percent = score / maxPossible
```

The minimum possible value for a one-polar axis is treated as `0`, so negative scores clamp to `0%`.

Opposition axes use the full bipolar range:

```text
percent = (score + abs(minPossible)) / (abs(minPossible) + maxPossible)
```

This is the same general formula as one-polar axes, because a one-polar axis has `minPossible = 0`. Result values are clamped to the computed possible range before percentages are displayed.

### Report-Hidden Axes

An enabled axis can be hidden from the report by default when another axis is enabled. This is useful when a broad axis only exists to decide whether a more specific axis should appear.

```json
{
  "id": "fruit_affinity",
  "hideWhenAxesEnabled": ["sweetness"]
}
```

In this example, `fruit_affinity` is still scored and included in the encrypted result payload, but the report hides it by default if `sweetness` is enabled. The result page shows a checkbox that lets the user reveal report-hidden axes.

### Axis Colors

Final result bars support either a single color or a contrasting color pair.

Single-color progress bar:

```json
{
  "id": "fruit_affinity",
  "color": "#2F6FA3"
}
```

Equivalent object form:

```json
{
  "id": "fruit_affinity",
  "colors": {
    "primary": "#2F6FA3"
  }
}
```

Contrasting pair:

```json
{
  "id": "sweetness",
  "colors": {
    "left": "#4E83B8",
    "right": "#C56A52"
  }
}
```

If no color is specified, the server assigns one from a built-in library of 16 visually distinct, moderately saturated color pairs. If a result needs more than 16 colors, the server assigns deterministic random-looking pairs based on the axis id so shared result links remain stable.

### Opposition Axes

Set `opposition` to `true` when the two sides are opposing values and the result should show side percentages instead of one overall percentage.

```json
{
  "id": "sweetness",
  "opposition": true,
  "leftLabel": { "en": "Sour" },
  "rightLabel": { "en": "Sweet" }
}
```

An opposition result displays both sides, for example `Sour 75%` and `Sweet 25%`. A non-opposition axis displays one progress percentage using `percent`.

## Scale Questions

Scale questions add or subtract value on one axis. The two ends of the scale are controlled by `leftLabel` and `rightLabel`.

`subtitle` is optional on every question type. When present, it is shown above the question prompt and supports the same localized string format as `text`.

```json
{
  "id": "apple_attitude",
  "type": "scale",
  "axisId": "fruit_affinity",
  "relatedAxes": ["fruit_affinity"],
  "subtitle": { "en": "General fruit preference" },
  "text": { "en": "How much do you like apples?" },
  "leftLabel": { "en": "Least favourable" },
  "rightLabel": { "en": "Most favourable" },
  "answers": [
    { "id": "hate", "value": -2, "label": { "en": "Hate them" } },
    { "id": "neutral", "value": 0, "label": { "en": "Neutral" } },
    { "id": "love", "value": 2, "label": { "en": "Love them" } }
  ]
}
```

Only public answer metadata is sent to the browser. The `value` field remains server-side and is applied by `/api/session/:id/answer`.

### Dot-Based Bipolar Scale Questions

For bipolar questions, use a generated dot scale instead of writing answer text. The browser shows only the question prompt, the two side labels, and 3, 5, or 7 selectable dots. The scoring values are generated and remain server-side.

```json
{
  "id": "sweet_or_sour",
  "type": "scale",
  "axisId": "sweetness",
  "relatedAxes": ["sweetness"],
  "subtitle": { "en": "Triggered by positive fruit interest" },
  "text": { "en": "Do you prefer a sour edge or a sweet finish?" },
  "leftLabel": { "en": "Sour" },
  "rightLabel": { "en": "Sweet" },
  "scale": {
    "type": "dots",
    "dots": 7,
    "pointsPerDot": 1
  }
}
```

Supported `dots` values are `3`, `5`, and `7`. `pointsPerDot` controls the score step between adjacent dots.

Generated answer ids are based on the dot offset from center:

```text
3 dots: dot_-1, dot_0, dot_1
5 dots: dot_-2, dot_-1, dot_0, dot_1, dot_2
7 dots: dot_-3, dot_-2, dot_-1, dot_0, dot_1, dot_2, dot_3
```

For a 7-dot scale with `pointsPerDot: 2`, values are `-6, -4, -2, 0, 2, 4, 6`. These generated ids can be used in answer triggers and medal requirements.

## Multiple-Choice Questions

Multiple-choice options can affect any axis, and different options do not need to affect the same axis.

```json
{
  "id": "favorite_fruit",
  "type": "choice",
  "relatedAxes": ["fruit_affinity", "novelty"],
  "text": { "en": "What fruit do you like the most?" },
  "options": [
    {
      "id": "apple",
      "label": { "en": "Apple" },
      "effects": [
        { "axisId": "fruit_affinity", "value": 1 },
        { "axisId": "novelty", "value": -1 }
      ]
    }
  ]
}
```

To allow selecting more than one option, set `multiSelect` to `true`.

You can also define bounds with `minSelections` and `maxSelections`.

```json
{
  "id": "fruit_pairings",
  "type": "choice",
  "multiSelect": true,
  "minSelections": 1,
  "maxSelections": 3,
  "relatedAxes": ["fruit_affinity", "novelty", "texture"],
  "text": { "en": "Which fruits would you pick together?" },
  "options": [
    {
      "id": "apple",
      "label": { "en": "Apple" },
      "effects": [
        { "axisId": "fruit_affinity", "value": 1 },
        { "axisId": "texture", "value": -1 }
      ]
    },
    {
      "id": "dragonfruit",
      "label": { "en": "Dragon fruit" },
      "effects": [
        { "axisId": "fruit_affinity", "value": 1 },
        { "axisId": "novelty", "value": 2 }
      ]
    }
  ]
}
```

For single-select questions, omit `multiSelect` (default behavior) or set it to `false`.

## Triggers

Questions and hidden axes can use `enabledBy`.

Answer trigger:

```json
{
  "type": "answer",
  "questionId": "fruit_interest",
  "answerIds": ["agree", "strong_agree"]
}
```

Value trigger:

```json
{
  "type": "value",
  "axisId": "fruit_affinity",
  "op": ">=",
  "value": 2
}
```

Deferred value trigger, used when no currently available questions remain for one or more values:

```json
{
  "type": "value",
  "axisId": "fruit_affinity",
  "op": ">=",
  "value": 2,
  "whenNoPendingRelated": true,
  "relatedAxisIds": ["fruit_affinity", "novelty"]
}
```

Combine triggers with `all` or `any`:

```json
{
  "all": [
    { "type": "answer", "questionId": "fruit_interest", "answerId": "strong_agree" },
    { "type": "value", "axisId": "novelty", "op": ">=", "value": 1 }
  ]
}
```

Supported value operators are `>`, `>=`, `<`, `<=`, `==`, and `!=`.

## Medals

Medals appear on the result page when requirements pass. Answer and value requirements can coexist in the same `all` block.

```json
{
  "id": "apple_loyalist",
  "icon": "A",
  "title": { "en": "Apple Loyalist" },
  "description": { "en": "You chose apple and reached a positive fruit score." },
  "requirements": {
    "all": [
      { "type": "answer", "questionId": "favorite_fruit", "answerId": "apple" },
      { "type": "value", "axisId": "fruit_affinity", "op": ">=", "value": 2 }
    ]
  }
}
```

## Final Result

`finalResult` defines the single final classification shown on the result page. It uses an `if` / `then` / `else` decision tree, and `then` or `else` can contain another decision node.

Every tree should end in result leaves so the user always receives a final result.

```json
{
  "finalResult": {
    "if": { "axisId": "fruit_affinity", "metric": "percent", "op": ">=", "value": 70 },
    "then": {
      "if": { "axisId": "sweetness", "metric": "score", "op": "<", "value": 0 },
      "then": {
        "id": "bright_sour_fruit_fan",
        "title": { "en": "Bright Sour Fruit Fan" },
        "description": { "en": "You like fruit strongly, especially sharper flavors." }
      },
      "else": {
        "id": "balanced_fruit_lover",
        "title": { "en": "Balanced Fruit Lover" },
        "description": { "en": "You like fruit and keep a balanced taste profile." }
      }
    },
    "else": {
      "id": "selective_minimalist",
      "title": { "en": "Selective Minimalist" },
      "description": { "en": "You are selective about fruit." }
    }
  }
}
```

Condition fields:

- `axisId`: axis to read.
- `metric`: `score`, `value`, or `percent`. `value` is treated as an alias for `score`.
- `op`: one of `>`, `>=`, `<`, `<=`, `==`, or `!=`.
- `value`: numeric comparison target.

Conditions can also use `all` or `any`:

```json
{
  "all": [
    { "axisId": "fruit_affinity", "metric": "percent", "op": ">=", "value": 70 },
    { "axisId": "sweetness", "metric": "score", "op": ">=", "value": 1 }
  ]
}
```

## Result Sharing

When a session completes, the server builds a result payload, encrypts it with AES-256-GCM, and returns:

```json
{
  "token": "encrypted_result_string",
  "result": {}
}
```

The frontend places the token in `/?result=encrypted_result_string`. Opening that URL calls `/api/result/:token`; the server decrypts the token and returns localized result display data.

Set `RESULT_SECRET` in production. Changing `RESULT_SECRET` invalidates old shared links.

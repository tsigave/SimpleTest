const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const TESTS_DIR = path.join(ROOT, "data", "tests");
const RESULT_SECRET = process.env.RESULT_SECRET || "change-this-dev-result-secret";
const RESULT_KEY = crypto.createHash("sha256").update(RESULT_SECRET).digest();
const BUILT_IN_COLOR_PAIRS = [
  { left: "#B65F5F", right: "#3C8D73" },
  { left: "#6F6DB2", right: "#D09245" },
  { left: "#A35C93", right: "#5B9A6F" },
  { left: "#4E83B8", right: "#C56A52" },
  { left: "#8A6FB0", right: "#C4A348" },
  { left: "#B9577E", right: "#4B9A9B" },
  { left: "#5F7FAE", right: "#8B9650" },
  { left: "#A96B56", right: "#5E91C4" },
  { left: "#7B8E49", right: "#9F6FB2" },
  { left: "#C06B6B", right: "#4D9187" },
  { left: "#7470A8", right: "#B9874A" },
  { left: "#4A8C62", right: "#B85D8F" },
  { left: "#927042", right: "#5F87BF" },
  { left: "#AF6550", right: "#6D8E52" },
  { left: "#596FA8", right: "#BB6F9E" },
  { left: "#A05F73", right: "#4C9180" }
];

const sessions = new Map();
let tests;
try {
  tests = loadTests();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

function loadTests() {
  const loaded = new Map();
  if (!fs.existsSync(TESTS_DIR)) {
    return loaded;
  }

  for (const filename of fs.readdirSync(TESTS_DIR)) {
    if (!filename.endsWith(".json")) continue;
    const fullPath = path.join(TESTS_DIR, filename);
    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(fullPath, "utf8"));
    } catch (error) {
      throw new Error(`${filename}: invalid JSON: ${error.message}`);
    }
    validateTest(raw, filename);
    loaded.set(raw.id, raw);
  }
  return loaded;
}

function validateTest(test, filename) {
  const errors = [];
  const fail = message => errors.push(`${filename}: ${message}`);

  if (!test.id || !/^[a-z0-9_-]+$/i.test(test.id)) {
    fail("test.id must be present and URL-safe.");
  }
  if (!Array.isArray(test.questions) || test.questions.length === 0) {
    fail("questions must be a non-empty array.");
  }
  if (!Array.isArray(test.axes) || test.axes.length === 0) {
    fail("axes must be a non-empty array.");
  }

  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }

  const axes = new Set();
  const questions = new Map();

  for (const [index, axis] of test.axes.entries()) {
    const path = `axes[${index}]`;
    if (!axis.id) {
      fail(`${path}.id is required.`);
      continue;
    }
    if (axes.has(axis.id)) fail(`${path}.id duplicates axis '${axis.id}'.`);
    axes.add(axis.id);
    validateLocalizedText(axis.name, `${path}.name`, fail, true);
    validateLocalizedText(axis.leftLabel, `${path}.leftLabel`, fail, true);
    validateLocalizedText(axis.rightLabel, `${path}.rightLabel`, fail, true);
  }

  for (const [index, question] of test.questions.entries()) {
    const path = `questions[${index}]`;
    if (!question.id) {
      fail(`${path}.id is required.`);
      continue;
    }
    if (questions.has(question.id)) fail(`${path}.id duplicates question '${question.id}'.`);
    questions.set(question.id, question);
  }

  for (const [index, axis] of test.axes.entries()) {
    const path = `axes[${index}]`;
    validateAxisReferences(axis, path, axes, questions, fail);
  }

  for (const [index, question] of test.questions.entries()) {
    validateQuestion(question, `questions[${index}]`, axes, questions, fail);
  }

  for (const [index, medal] of (test.medals || []).entries()) {
    const path = `medals[${index}]`;
    if (!medal.id) fail(`${path}.id is required.`);
    validateLocalizedText(medal.title, `${path}.title`, fail, true);
    validateLocalizedText(medal.description, `${path}.description`, fail, false);
    validateRequirementTree(medal.requirements, `${path}.requirements`, axes, questions, fail);
  }

  if (test.finalResult) {
    validateFinalResultNode(test.finalResult, "finalResult", axes, fail);
  }

  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }
}

function validateLocalizedText(value, path, fail, required) {
  if (value == null) {
    if (required) fail(`${path} is required.`);
    return;
  }
  if (typeof value === "string") return;
  if (typeof value !== "object" || Array.isArray(value)) {
    fail(`${path} must be a string or locale map.`);
    return;
  }
  if (Object.keys(value).length === 0) fail(`${path} locale map cannot be empty.`);
}

function validateAxisReferences(axis, path, axes, questions, fail) {
  for (const axisId of axis.hideWhenAxesEnabled || []) {
    if (!axes.has(axisId)) fail(`${path}.hideWhenAxesEnabled references unknown axis '${axisId}'.`);
  }
  validateTriggerTree(axis.enabledBy, `${path}.enabledBy`, axes, questions, fail);
}

function questionAnswerIds(question) {
  if (question.type === "scale") return getScaleAnswers(question).map(answer => answer.id);
  if (question.type === "choice") return (question.options || []).map(option => option.id);
  return [];
}

function choiceSelectionBounds(question) {
  const optionCount = Array.isArray(question.options) ? question.options.length : 0;
  const multiSelect = question.type === "choice" && Boolean(question.multiSelect);
  if (!multiSelect) {
    return { multiSelect: false, min: 1, max: 1, optionCount };
  }

  const requestedMin = Number(question.minSelections ?? 1);
  const requestedMax = Number(question.maxSelections ?? optionCount);
  const min = Number.isFinite(requestedMin) ? Math.max(1, Math.floor(requestedMin)) : 1;
  const maxBase = Number.isFinite(requestedMax) ? Math.floor(requestedMax) : optionCount;
  const max = Math.max(min, Math.min(optionCount, Math.max(1, maxBase)));
  return { multiSelect: true, min, max, optionCount };
}

function validateQuestion(question, path, axes, questions, fail) {
  if (!["scale", "choice"].includes(question.type)) {
    fail(`${path}.type must be 'scale' or 'choice'.`);
    return;
  }

  validateLocalizedText(question.text, `${path}.text`, fail, true);
  validateLocalizedText(question.subtitle, `${path}.subtitle`, fail, false);
  for (const axisId of question.relatedAxes || []) {
    if (!axes.has(axisId)) fail(`${path}.relatedAxes references unknown axis '${axisId}'.`);
  }
  validateTriggerTree(question.enabledBy, `${path}.enabledBy`, axes, questions, fail);

  if (question.type === "scale") {
    if (!axes.has(question.axisId)) fail(`${path}.axisId references unknown axis '${question.axisId}'.`);
    validateLocalizedText(question.leftLabel, `${path}.leftLabel`, fail, true);
    validateLocalizedText(question.rightLabel, `${path}.rightLabel`, fail, true);
    if (question.scale?.type === "dots") {
      const dots = Number(question.scale.dots || 5);
      if (![3, 5, 7].includes(dots)) fail(`${path}.scale.dots must be 3, 5, or 7.`);
      if (!Number.isFinite(Number(question.scale.pointsPerDot || 1))) fail(`${path}.scale.pointsPerDot must be numeric.`);
    } else if (!Array.isArray(question.answers) || question.answers.length === 0) {
      fail(`${path}.answers must be a non-empty array unless scale.type is 'dots'.`);
    } else {
      validateAnswerList(question.answers, `${path}.answers`, fail);
    }
  }

  if (question.type === "choice") {
    if (!Array.isArray(question.options) || question.options.length === 0) {
      fail(`${path}.options must be a non-empty array.`);
      return;
    }
    validateAnswerList(question.options, `${path}.options`, fail);
    const selection = choiceSelectionBounds(question);
    if (question.multiSelect != null && typeof question.multiSelect !== "boolean") {
      fail(`${path}.multiSelect must be boolean when provided.`);
    }
    if (question.minSelections != null && !Number.isInteger(Number(question.minSelections))) {
      fail(`${path}.minSelections must be an integer when provided.`);
    }
    if (question.maxSelections != null && !Number.isInteger(Number(question.maxSelections))) {
      fail(`${path}.maxSelections must be an integer when provided.`);
    }
    if (selection.min > selection.optionCount) {
      fail(`${path}.minSelections cannot exceed options length.`);
    }
    if (selection.max > selection.optionCount) {
      fail(`${path}.maxSelections cannot exceed options length.`);
    }
    if (selection.max < selection.min) {
      fail(`${path}.maxSelections cannot be less than minSelections.`);
    }
    for (const [index, option] of question.options.entries()) {
      for (const [effectIndex, effect] of (option.effects || []).entries()) {
        const effectPath = `${path}.options[${index}].effects[${effectIndex}]`;
        if (!axes.has(effect.axisId)) fail(`${effectPath}.axisId references unknown axis '${effect.axisId}'.`);
        if (!Number.isFinite(Number(effect.value || 0))) fail(`${effectPath}.value must be numeric.`);
      }
    }
  }
}

function validateAnswerList(items, path, fail) {
  const ids = new Set();
  for (const [index, item] of items.entries()) {
    const itemPath = `${path}[${index}]`;
    if (!item.id) fail(`${itemPath}.id is required.`);
    if (ids.has(item.id)) fail(`${itemPath}.id duplicates '${item.id}'.`);
    ids.add(item.id);
    validateLocalizedText(item.label, `${itemPath}.label`, fail, false);
    if (item.value != null && !Number.isFinite(Number(item.value))) fail(`${itemPath}.value must be numeric.`);
  }
}

function validateTriggerTree(definition, path, axes, questions, fail) {
  if (!definition) return;
  if (Array.isArray(definition.all)) {
    definition.all.forEach((item, index) => validateTriggerTree(item, `${path}.all[${index}]`, axes, questions, fail));
    return;
  }
  if (Array.isArray(definition.any)) {
    definition.any.forEach((item, index) => validateTriggerTree(item, `${path}.any[${index}]`, axes, questions, fail));
    return;
  }
  validateConditionLike(definition, path, axes, questions, fail);
}

function validateRequirementTree(definition, path, axes, questions, fail) {
  if (!definition) return;
  validateTriggerTree(definition, path, axes, questions, fail);
}

function validateConditionLike(condition, path, axes, questions, fail) {
  if (condition.type === "answer") {
    const question = questions.get(condition.questionId);
    if (!question) {
      fail(`${path}.questionId references unknown question '${condition.questionId}'.`);
      return;
    }
    const ids = new Set(questionAnswerIds(question));
    const answerIds = condition.answerIds || (condition.answerId ? [condition.answerId] : []);
    for (const answerId of answerIds) {
      if (!ids.has(answerId)) fail(`${path} references unknown answer '${answerId}' on question '${condition.questionId}'.`);
    }
    return;
  }
  if (condition.type === "value") {
    if (!axes.has(condition.axisId)) fail(`${path}.axisId references unknown axis '${condition.axisId}'.`);
    if (!isValidOperator(condition.op || ">=")) fail(`${path}.op is invalid.`);
    if (!Number.isFinite(Number(condition.value || 0))) fail(`${path}.value must be numeric.`);
    for (const axisId of condition.relatedAxisIds || []) {
      if (!axes.has(axisId)) fail(`${path}.relatedAxisIds references unknown axis '${axisId}'.`);
    }
    return;
  }
  fail(`${path}.type must be 'answer' or 'value'.`);
}

function validateFinalResultNode(node, path, axes, fail) {
  if (!node || typeof node !== "object" || Array.isArray(node)) {
    fail(`${path} must be an object.`);
    return;
  }
  if (node.if) {
    validateFinalResultCondition(node.if, `${path}.if`, axes, fail);
    if (!node.then) fail(`${path}.then is required.`);
    if (!node.else) fail(`${path}.else is required so users always get a result.`);
    validateFinalResultNode(node.then, `${path}.then`, axes, fail);
    validateFinalResultNode(node.else, `${path}.else`, axes, fail);
    return;
  }
  if (!node.id) fail(`${path}.id is required on final result leaves.`);
  validateLocalizedText(node.title, `${path}.title`, fail, true);
  validateLocalizedText(node.description, `${path}.description`, fail, true);
}

function validateFinalResultCondition(condition, path, axes, fail) {
  if (Array.isArray(condition.all)) {
    condition.all.forEach((item, index) => validateFinalResultCondition(item, `${path}.all[${index}]`, axes, fail));
    return;
  }
  if (Array.isArray(condition.any)) {
    condition.any.forEach((item, index) => validateFinalResultCondition(item, `${path}.any[${index}]`, axes, fail));
    return;
  }
  if (!axes.has(condition.axisId)) fail(`${path}.axisId references unknown axis '${condition.axisId}'.`);
  if (!["score", "value", "percent", undefined].includes(condition.metric)) fail(`${path}.metric must be 'score', 'value', or 'percent'.`);
  if (!isValidOperator(condition.op || ">=")) fail(`${path}.op is invalid.`);
  if (!Number.isFinite(Number(condition.value || 0))) fail(`${path}.value must be numeric.`);
}

function isValidOperator(op) {
  return [">", ">=", "<", "<=", "==", "!="].includes(op);
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function sendText(res, status, text) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error("Request body too large."));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function localize(value, locale, fallbackLocale) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  return value[locale] || value[fallbackLocale] || value.en || Object.values(value)[0] || "";
}

function publicTestMetadata(test) {
  return {
    id: test.id,
    title: test.title,
    description: test.description,
    locales: test.locales,
    defaultLocale: test.defaultLocale
  };
}

function localizedTestMetadata(test, locale) {
  const fallback = test.defaultLocale || "en";
  return {
    id: test.id,
    title: localize(test.title, locale, fallback),
    description: localize(test.description, locale, fallback),
    locales: test.locales,
    defaultLocale: fallback
  };
}

function createSession(testId, locale) {
  const test = tests.get(testId);
  if (!test) return null;

  const selectedLocale = test.locales?.includes(locale) ? locale : test.defaultLocale || "en";
  const session = {
    id: crypto.randomUUID(),
    testId,
    locale: selectedLocale,
    answers: {},
    history: [],
    scores: {},
    startedAt: new Date().toISOString()
  };

  for (const axis of test.axes) {
    session.scores[axis.id] = Number(axis.initial || 0);
  }

  sessions.set(session.id, session);
  return session;
}

function selectLocale(test, locale) {
  return test.locales?.includes(locale) ? locale : test.defaultLocale || "en";
}

function setSessionLocale(session, locale) {
  const test = tests.get(session.testId);
  session.locale = selectLocale(test, locale);
}

function getQuestionById(test, id) {
  return test.questions.find(question => question.id === id);
}

function getAxisById(test, id) {
  return test.axes.find(axis => axis.id === id);
}

function normalizeDotCount(question) {
  const dots = Number(question.scale?.dots || 5);
  return [3, 5, 7].includes(dots) ? dots : 5;
}

function getScaleAnswers(question) {
  if (Array.isArray(question.answers)) return question.answers;
  if (question.scale?.type !== "dots") return [];

  const dots = normalizeDotCount(question);
  const pointsPerDot = Number(question.scale.pointsPerDot || 1);
  const center = Math.floor(dots / 2);
  return Array.from({ length: dots }, (_, index) => {
    const offset = index - center;
    return {
      id: `dot_${offset}`,
      value: offset * pointsPerDot,
      position: index + 1,
      offset
    };
  });
}

function getAnswerDef(question, answerId) {
  if (question.type === "scale") {
    return getScaleAnswers(question).find(answer => answer.id === answerId);
  }
  if (question.type === "choice") {
    return question.options.find(option => option.id === answerId);
  }
  return null;
}

function getAnswerEffects(question, answer) {
  if (question.type === "scale") {
    return [{ axisId: question.axisId, value: Number(answer.value || 0) }];
  }
  if (question.type === "choice") {
    return (answer.effects || []).map(effect => ({
      axisId: effect.axisId,
      value: Number(effect.value || 0)
    }));
  }
  return [];
}

function questionAnswerOptions(question) {
  if (question.type === "scale") return getScaleAnswers(question);
  if (question.type === "choice") return question.options || [];
  return [];
}

function answerValueForAxis(question, answer, axisId) {
  return getAnswerEffects(question, answer)
    .filter(effect => effect.axisId === axisId)
    .reduce((total, effect) => total + Number(effect.value || 0), 0);
}

function choiceAxisRange(question, axisId) {
  const values = (question.options || []).map(option => answerValueForAxis(question, option, axisId));
  if (values.length === 0 || values.every(value => value === 0)) {
    return { min: 0, max: 0 };
  }

  const selection = choiceSelectionBounds(question);
  const sortedAsc = [...values].sort((a, b) => a - b);
  const sortedDesc = [...values].sort((a, b) => b - a);
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (let count = selection.min; count <= selection.max; count += 1) {
    const minSum = sortedAsc.slice(0, count).reduce((total, value) => total + value, 0);
    const maxSum = sortedDesc.slice(0, count).reduce((total, value) => total + value, 0);
    min = Math.min(min, minSum);
    max = Math.max(max, maxSum);
  }

  return {
    min: Number.isFinite(min) ? min : 0,
    max: Number.isFinite(max) ? max : 0
  };
}

function possibleScoreRanges(test, answers) {
  const ranges = {};
  for (const axis of test.axes) {
    ranges[axis.id] = { min: 0, max: 0 };
  }

  for (const questionId of Object.keys(answers || {})) {
    const question = getQuestionById(test, questionId);
    if (!question) continue;

    for (const axis of test.axes) {
      if (question.type === "choice" && choiceSelectionBounds(question).multiSelect) {
        const range = choiceAxisRange(question, axis.id);
        if (range.min === 0 && range.max === 0) continue;
        ranges[axis.id].min += range.min;
        ranges[axis.id].max += range.max;
        continue;
      }

      const values = questionAnswerOptions(question).map(answer => answerValueForAxis(question, answer, axis.id));
      if (values.length === 0 || values.every(value => value === 0)) continue;
      ranges[axis.id].min += Math.min(...values);
      ranges[axis.id].max += Math.max(...values);
    }
  }

  return ranges;
}

function normalizeChosenAnswers(chosen) {
  if (Array.isArray(chosen)) return chosen;
  if (chosen == null || chosen === "") return [];
  return [chosen];
}

function compareValue(actual, op, expected) {
  switch (op) {
    case ">": return actual > expected;
    case ">=": return actual >= expected;
    case "<": return actual < expected;
    case "<=": return actual <= expected;
    case "==": return actual === expected;
    case "!=": return actual !== expected;
    default: return false;
  }
}

function noPendingRelatedQuestion(test, session, axisIds, currentQuestionId) {
  return !test.questions.some(question => {
    if (question.id === currentQuestionId || session.answers[question.id]) return false;
    const related = question.relatedAxes || (question.axisId ? [question.axisId] : []);
    if (!related.some(axisId => axisIds.includes(axisId))) return false;
    return triggersMet(test, session, question.enabledBy, question.id, true);
  });
}

function triggerMet(test, session, trigger, currentQuestionId, skipNoPending) {
  if (!trigger) return true;

  // Support nested trigger trees, e.g. { all: [{ all: [...] }, { any: [...] }] }.
  // Previously only triggersMet() handled all/any at the top level.
  if (Array.isArray(trigger.all)) {
    return trigger.all.every(item => triggerMet(test, session, item, currentQuestionId, skipNoPending));
  }
  if (Array.isArray(trigger.any)) {
    return trigger.any.some(item => triggerMet(test, session, item, currentQuestionId, skipNoPending));
  }

  if (trigger.type === "answer") {
    const chosenIds = normalizeChosenAnswers(session.answers[trigger.questionId]);
    if (trigger.answerId) return chosenIds.includes(trigger.answerId);
    if (Array.isArray(trigger.answerIds)) return trigger.answerIds.some(answerId => chosenIds.includes(answerId));
    return chosenIds.length > 0;
  }

  if (trigger.type === "value") {
    const actual = Number(session.scores[trigger.axisId] || 0);
    const expected = Number(trigger.value || 0);
    if (!compareValue(actual, trigger.op || ">=", expected)) return false;
    if (trigger.whenNoPendingRelated && !skipNoPending) {
      const axisIds = trigger.relatedAxisIds || [trigger.axisId];
      return noPendingRelatedQuestion(test, session, axisIds, currentQuestionId);
    }
    return true;
  }

  return false;
}

function triggersMet(test, session, definition, currentQuestionId, skipNoPending = false) {
  return triggerMet(test, session, definition, currentQuestionId, skipNoPending);
}

function enabledAxes(test, session) {
  return test.axes
    .filter(axis => axis.defaultEnabled || triggersMet(test, session, axis.enabledBy, axis.id))
    .map(axis => axis.id);
}

function availableQuestions(test, session) {
  const activeAxes = enabledAxes(test, session);
  return test.questions.filter(question => {
    if (session.answers[question.id]) return false;
    if (!triggersMet(test, session, question.enabledBy, question.id)) return false;

    const related = question.relatedAxes || (question.axisId ? [question.axisId] : []);
    if (related.length === 0) return true;
    return related.some(axisId => activeAxes.includes(axisId) || axisIsTriggerable(test, session, axisId));
  });
}

function axisIsTriggerable(test, session, axisId) {
  const axis = getAxisById(test, axisId);
  return Boolean(axis && axis.enabledBy && triggersMet(test, session, axis.enabledBy, axis.id));
}

function publicQuestion(question, locale, fallbackLocale) {
  const base = {
    id: question.id,
    type: question.type,
    subtitle: localize(question.subtitle, locale, fallbackLocale),
    text: localize(question.text, locale, fallbackLocale)
  };

  if (question.type === "scale") {
    const answers = getScaleAnswers(question);
    const isDotScale = question.scale?.type === "dots";
    return {
      ...base,
      leftLabel: localize(question.leftLabel, locale, fallbackLocale),
      rightLabel: localize(question.rightLabel, locale, fallbackLocale),
      scaleStyle: isDotScale ? "dots" : "labels",
      dots: isDotScale ? normalizeDotCount(question) : undefined,
      answers: answers.map(answer => ({
        id: answer.id,
        label: isDotScale ? "" : localize(answer.label, locale, fallbackLocale),
        position: isDotScale ? answer.position : undefined,
        side: isDotScale ? Math.sign(answer.offset || 0) : undefined,
        distance: isDotScale ? Math.abs(answer.offset || 0) : undefined,
        maxDistance: isDotScale ? Math.floor(normalizeDotCount(question) / 2) : undefined
      }))
    };
  }

  return {
    ...base,
    multiSelect: choiceSelectionBounds(question).multiSelect,
    minSelections: choiceSelectionBounds(question).min,
    maxSelections: choiceSelectionBounds(question).max,
    options: question.options.map(option => ({
      id: option.id,
      label: localize(option.label, locale, fallbackLocale)
    }))
  };
}

function sessionState(session) {
  const test = tests.get(session.testId);
  const fallback = test.defaultLocale || "en";
  const available = availableQuestions(test, session);
  const next = available[0] || null;
  const completed = !next;
  const answered = Object.keys(session.answers).length;
  return {
    sessionId: session.id,
    test: localizedTestMetadata(test, session.locale),
    question: next ? publicQuestion(next, session.locale, fallback) : null,
    progress: {
      answered,
      current: completed ? answered : answered + 1,
      total: answered + available.length,
      canGoBack: session.history.length > 0,
      completed
    }
  };
}

function applyAnswer(session, questionId, answerId, answerIds) {
  const test = tests.get(session.testId);
  const question = getQuestionById(test, questionId);
  if (!question) {
    throw new Error("Question does not exist.");
  }

  const available = availableQuestions(test, session).some(item => item.id === questionId);
  if (!available) {
    throw new Error("Question is not currently available.");
  }

  const submittedIds = Array.isArray(answerIds) ? answerIds : (answerId ? [answerId] : []);
  const uniqueIds = [...new Set(submittedIds)];
  const selection = question.type === "choice" ? choiceSelectionBounds(question) : { multiSelect: false, min: 1, max: 1 };

  if (!selection.multiSelect && uniqueIds.length !== 1) {
    throw new Error("Exactly one answer is required.");
  }
  if (selection.multiSelect && (uniqueIds.length < selection.min || uniqueIds.length > selection.max)) {
    throw new Error(`Please select between ${selection.min} and ${selection.max} options.`);
  }

  const selectedAnswers = uniqueIds.map(id => getAnswerDef(question, id));
  if (selectedAnswers.some(answer => !answer)) {
    throw new Error("Answer does not exist.");
  }

  const effects = selectedAnswers.flatMap(answer => getAnswerEffects(question, answer));
  session.answers[questionId] = selection.multiSelect ? uniqueIds : uniqueIds[0];
  for (const effect of effects) {
    if (session.scores[effect.axisId] == null) {
      session.scores[effect.axisId] = 0;
    }
    session.scores[effect.axisId] += effect.value;
  }
  session.history.push({
    questionId,
    answerId: selection.multiSelect ? null : uniqueIds[0],
    answerIds: selection.multiSelect ? uniqueIds : undefined,
    effects
  });
}

function goBack(session) {
  const last = session.history.pop();
  if (!last) {
    throw new Error("No previous question.");
  }

  delete session.answers[last.questionId];
  for (const effect of last.effects) {
    if (session.scores[effect.axisId] == null) {
      session.scores[effect.axisId] = 0;
    }
    session.scores[effect.axisId] -= effect.value;
  }
}

function requirementMet(test, session, requirement) {
  if (!requirement) return true;

  // Medal requirements use the same tree shape as triggers, so nested all/any
  // must be evaluated recursively here too.
  if (Array.isArray(requirement.all)) {
    return requirement.all.every(item => requirementMet(test, session, item));
  }
  if (Array.isArray(requirement.any)) {
    return requirement.any.some(item => requirementMet(test, session, item));
  }

  if (requirement.type === "answer") {
    const chosenIds = normalizeChosenAnswers(session.answers[requirement.questionId]);
    if (requirement.answerId) return chosenIds.includes(requirement.answerId);
    if (Array.isArray(requirement.answerIds)) return requirement.answerIds.some(answerId => chosenIds.includes(answerId));
    return chosenIds.length > 0;
  }

  if (requirement.type === "value") {
    const actual = Number(session.scores[requirement.axisId] || 0);
    return compareValue(actual, requirement.op || ">=", Number(requirement.value || 0));
  }

  return false;
}

function requirementsMet(test, session, requirements) {
  return requirementMet(test, session, requirements);
}

function calculateResult(session) {
  const test = tests.get(session.testId);
  const activeAxisIds = enabledAxes(test, session);
  const medals = (test.medals || [])
    .filter(medal => requirementsMet(test, session, medal.requirements))
    .map(medal => medal.id);

  return {
    testId: session.testId,
    locale: session.locale,
    answers: session.answers,
    scores: session.scores,
    enabledAxes: activeAxisIds,
    medals,
    completedAt: new Date().toISOString()
  };
}

function seededNumber(seed) {
  const hash = crypto.createHash("sha256").update(seed).digest();
  return hash.readUInt32BE(0);
}

function randomColorPair(seed) {
  const value = seededNumber(seed);
  const hueA = value % 360;
  const hueB = (hueA + 145 + ((value >>> 8) % 70)) % 360;
  return {
    left: `hsl(${hueA} 42% 52%)`,
    right: `hsl(${hueB} 42% 48%)`
  };
}

function defaultAxisColors(axis, index) {
  return BUILT_IN_COLOR_PAIRS[index] || randomColorPair(axis.id);
}

function resolveAxisColors(axis, index) {
  const fallback = defaultAxisColors(axis, index);
  if (typeof axis.color === "string") {
    return {
      mode: "single",
      primary: axis.color,
      left: axis.color,
      right: axis.color
    };
  }

  if (axis.colors && typeof axis.colors === "object") {
    if (typeof axis.colors.primary === "string") {
      return {
        mode: "single",
        primary: axis.colors.primary,
        left: axis.colors.primary,
        right: axis.colors.primary
      };
    }
    if (typeof axis.colors.left === "string" && typeof axis.colors.right === "string") {
      return {
        mode: "pair",
        primary: axis.colors.right,
        left: axis.colors.left,
        right: axis.colors.right
      };
    }
  }

  return {
    mode: "pair",
    primary: fallback.right,
    left: fallback.left,
    right: fallback.right
  };
}

function hasCustomAxisColors(axis) {
  return typeof axis.color === "string" ||
    typeof axis.colors?.primary === "string" ||
    (typeof axis.colors?.left === "string" && typeof axis.colors?.right === "string");
}

function isAxisHiddenByDefault(axis, activeAxisIds) {
  if (!Array.isArray(axis.hideWhenAxesEnabled)) return false;
  return axis.hideWhenAxesEnabled.some(axisId => activeAxisIds.includes(axisId));
}

function axisResult(axis, score, locale, fallback, index, hiddenByDefault, possibleRange) {
  const rawScore = Number(score || 0);
  const rangeMin = axis.opposition ? Number(possibleRange?.min || 0) : 0;
  const rangeMax = Number(possibleRange?.max || 0);
  const denominator = Math.abs(rangeMin) + rangeMax;
  const clamped = Math.max(rangeMin, Math.min(rangeMax, rawScore));
  const percent = denominator === 0 ? 0 : Math.round(((clamped + Math.abs(rangeMin)) / denominator) * 100);
  const colors = resolveAxisColors(axis, index);
  return {
    id: axis.id,
    name: localize(axis.name, locale, fallback),
    leftLabel: localize(axis.leftLabel, locale, fallback),
    rightLabel: localize(axis.rightLabel, locale, fallback),
    opposition: Boolean(axis.opposition),
    hiddenByDefault,
    colors,
    score: rawScore,
    possibleMin: rangeMin,
    possibleMax: rangeMax,
    percent,
    leftPercent: 100 - percent,
    rightPercent: percent
  };
}

function conditionMetric(axisResultData, metric) {
  if (!axisResultData) return 0;
  if (metric === "percent") return Number(axisResultData.percent || 0);
  return Number(axisResultData.score || 0);
}

function finalResultConditionMet(axisResultsById, condition) {
  if (!condition) return false;
  if (Array.isArray(condition.all)) {
    return condition.all.every(item => finalResultConditionMet(axisResultsById, item));
  }
  if (Array.isArray(condition.any)) {
    return condition.any.some(item => finalResultConditionMet(axisResultsById, item));
  }

  const actual = conditionMetric(axisResultsById[condition.axisId], condition.metric || "score");
  return compareValue(actual, condition.op || ">=", Number(condition.value || 0));
}

function localizeFinalResult(node, locale, fallback) {
  return {
    id: node.id || "result",
    title: localize(node.title, locale, fallback),
    description: localize(node.description, locale, fallback)
  };
}

function evaluateFinalResult(node, axisResultsById, locale, fallback) {
  if (!node) return null;
  if (node.if) {
    const branch = finalResultConditionMet(axisResultsById, node.if) ? node.then : node.else;
    return evaluateFinalResult(branch, axisResultsById, locale, fallback);
  }
  return localizeFinalResult(node, locale, fallback);
}

function publicResult(resultPayload, localeOverride) {
  const test = tests.get(resultPayload.testId);
  if (!test) throw new Error("Unknown test.");
  const fallback = test.defaultLocale || "en";
  const requestedLocale = localeOverride || resultPayload.locale;
  const locale = test.locales?.includes(requestedLocale) ? requestedLocale : fallback;
  const activeAxisIds = resultPayload.enabledAxes || [];
  const activeAxes = test.axes.filter(axis => activeAxisIds.includes(axis.id));
  const ranges = possibleScoreRanges(test, resultPayload.answers);
  let defaultColorIndex = 0;
  const axes = activeAxes.map(axis => {
    const colorIndex = hasCustomAxisColors(axis) ? 0 : defaultColorIndex++;
    const hiddenByDefault = isAxisHiddenByDefault(axis, activeAxisIds);
    return axisResult(axis, resultPayload.scores[axis.id], locale, fallback, colorIndex, hiddenByDefault, ranges[axis.id]);
  });
  const axesById = Object.fromEntries(axes.map(axis => [axis.id, axis]));

  return {
    test: localizedTestMetadata(test, locale),
    completedAt: resultPayload.completedAt,
    finalResult: evaluateFinalResult(test.finalResult, axesById, locale, fallback),
    axes,
    medals: (test.medals || [])
      .filter(medal => (resultPayload.medals || []).includes(medal.id))
      .map(medal => ({
        id: medal.id,
        icon: medal.icon || "*",
        title: localize(medal.title, locale, fallback),
        description: localize(medal.description, locale, fallback)
      }))
  };
}

function encryptResult(payload) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", RESULT_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}

function decryptResult(token) {
  const packed = Buffer.from(token, "base64url");
  if (packed.length < 29) throw new Error("Invalid token.");
  const iv = packed.subarray(0, 12);
  const tag = packed.subarray(12, 28);
  const encrypted = packed.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", RESULT_KEY, iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8"));
}

function completeSession(session) {
  if (!sessionState(session).progress.completed) {
    throw new Error("Session is not complete.");
  }
  const payload = calculateResult(session);
  return {
    token: encryptResult(payload),
    result: publicResult(payload)
  };
}

function staticFilePath(pathname) {
  const cleanPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, cleanPath));
  if (!filePath.startsWith(PUBLIC_DIR)) return null;
  return filePath;
}

function serveStatic(req, res, pathname) {
  const filePath = staticFilePath(pathname);
  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    sendText(res, 404, "Not found");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const types = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png"
  };
  res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
}

async function handleApi(req, res, pathname) {
  if (req.method === "GET" && pathname === "/api/tests") {
    sendJson(res, 200, { tests: [...tests.values()].map(publicTestMetadata) });
    return;
  }

  if (req.method === "POST" && pathname === "/api/session") {
    const body = await readBody(req);
    const session = createSession(body.testId, body.locale);
    if (!session) {
      sendJson(res, 404, { error: "Test not found." });
      return;
    }
    sendJson(res, 200, sessionState(session));
    return;
  }

  const answerMatch = pathname.match(/^\/api\/session\/([^/]+)\/answer$/);
  if (req.method === "POST" && answerMatch) {
    const session = sessions.get(answerMatch[1]);
    if (!session) {
      sendJson(res, 404, { error: "Session not found." });
      return;
    }
    const body = await readBody(req);
    try {
      applyAnswer(session, body.questionId, body.answerId, body.answerIds);
      sendJson(res, 200, sessionState(session));
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  const localeMatch = pathname.match(/^\/api\/session\/([^/]+)\/locale$/);
  if (req.method === "POST" && localeMatch) {
    const session = sessions.get(localeMatch[1]);
    if (!session) {
      sendJson(res, 404, { error: "Session not found." });
      return;
    }
    const body = await readBody(req);
    setSessionLocale(session, body.locale);
    sendJson(res, 200, sessionState(session));
    return;
  }

  const completeMatch = pathname.match(/^\/api\/session\/([^/]+)\/complete$/);
  if (req.method === "POST" && completeMatch) {
    const session = sessions.get(completeMatch[1]);
    if (!session) {
      sendJson(res, 404, { error: "Session not found." });
      return;
    }
    try {
      sendJson(res, 200, completeSession(session));
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  const backMatch = pathname.match(/^\/api\/session\/([^/]+)\/back$/);
  if (req.method === "POST" && backMatch) {
    const session = sessions.get(backMatch[1]);
    if (!session) {
      sendJson(res, 404, { error: "Session not found." });
      return;
    }
    try {
      goBack(session);
      sendJson(res, 200, sessionState(session));
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  const resultMatch = pathname.match(/^\/api\/result\/(.+)$/);
  if (req.method === "GET" && resultMatch) {
    try {
      const payload = decryptResult(decodeURIComponent(resultMatch[1]));
      const localeOverride = new URL(req.url, `http://${req.headers.host}`).searchParams.get("locale");
      sendJson(res, 200, { result: publicResult(payload, localeOverride) });
    } catch (error) {
      sendJson(res, 400, { error: "Result token could not be decrypted." });
    }
    return;
  }

  sendJson(res, 404, { error: "API route not found." });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url.pathname);
      return;
    }
    serveStatic(req, res, url.pathname);
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
});

if (process.argv.includes("--validate")) {
  console.log(`Validated ${tests.size} test profile(s).`);
} else {
  server.listen(PORT, () => {
    console.log(`Citanger values test running at http://localhost:${PORT}`);
  });
}
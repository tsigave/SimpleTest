const uiText = {
  en: {
    start: "Start test",
    back: "Back",
    answered: "Question {current} / {total}",
    finalResultTitle: "Final Result",
    axesTitle: "Values",
    medalsTitle: "Medals",
    shareTitle: "Link and Share",
    shareToken: "Result token",
    copyLink: "Copy link",
    copyToken: "Copy token",
    copied: "Copied",
    testAgain: "Test again",
    showHiddenAxes: "Show hidden axes",
    languageUnavailable: "The test is not available for this language, please choose alternative.",
    noMedals: "No special medals reached.",
    error: "Something went wrong. Please restart the test.",
    continue: "Continue",
    selectOne: "Select 1 option",
    selectExactly: "Select {count} options",
    selectAtLeast: "Select at least {min} options",
    selectBetween: "Select {min} to {max} options"
  },
  zh: {
    start: "开始测试",
    back: "返回",
    answered: "问题 {current} / {total}",
    finalResultTitle: "最终结果",
    axesTitle: "数值",
    medalsTitle: "徽章",
    shareTitle: "链接与分享",
    shareToken: "结果代码",
    copyLink: "复制链接",
    copyToken: "复制结果代码",
    copied: "已复制",
    testAgain: "重新测试",
    showHiddenAxes: "显示隐藏轴",
    languageUnavailable: "该测试不支持此语言，请选择其他语言。",
    noMedals: "未达成特殊徽章。",
    error: "出现错误，请重新开始测试。",
    continue: "继续",
    selectOne: "请选择 1 项",
    selectExactly: "请选择 {count} 项",
    selectAtLeast: "请至少选择 {min} 项",
    selectBetween: "请选择 {min} 到 {max} 项"
  },
  es: {
    start: "Iniciar test",
    back: "Volver",
    answered: "Pregunta {current} / {total}",
    finalResultTitle: "Resultado final",
    axesTitle: "Valores",
    medalsTitle: "Medallas",
    shareTitle: "Enlace y compartir",
    shareToken: "Token de resultado",
    copyLink: "Copiar enlace",
    copyToken: "Copiar token",
    copied: "Copiado",
    testAgain: "Repetir test",
    showHiddenAxes: "Mostrar ejes ocultos",
    languageUnavailable: "The test is not available for this language, please choose alternative.",
    noMedals: "No se alcanzaron medallas especiales.",
    error: "Algo salió mal. Reinicia el test.",
    continue: "Continuar",
    selectOne: "Selecciona 1 opción",
    selectExactly: "Selecciona {count} opciones",
    selectAtLeast: "Selecciona al menos {min} opciones",
    selectBetween: "Selecciona de {min} a {max} opciones"
  }
};

const state = {
  tests: [],
  selectedTestId: null,
  locale: "en",
  view: "intro",
  sessionId: null,
  currentQuestion: null,
  currentResult: null,
  showHiddenAxes: false,
  token: ""
};

const elements = {
  title: document.querySelector("#test-title"),
  description: document.querySelector("#test-description"),
  intro: document.querySelector("#intro-view"),
  questionView: document.querySelector("#question-view"),
  questionFooter: document.querySelector("#question-footer"),
  resultView: document.querySelector("#result-view"),
  errorView: document.querySelector("#error-view"),
  start: document.querySelector("#start-button"),
  languageWarning: document.querySelector("#language-warning"),
  testAgain: document.querySelector("#test-again-button"),
  restart: document.querySelector("#restart-button"),
  testSelect: document.querySelector("#test-select"),
  back: document.querySelector("#back-button"),
  language: document.querySelector("#language-select"),
  progress: document.querySelector("#progress-label"),
  questionSubtitle: document.querySelector("#question-subtitle"),
  questionText: document.querySelector("#question-text"),
  axisLabels: document.querySelector("#axis-labels"),
  leftLabel: document.querySelector("#left-label"),
  rightLabel: document.querySelector("#right-label"),
  answers: document.querySelector("#answers"),
  finalResultCard: document.querySelector("#final-result-card"),
  finalResultTitle: document.querySelector("#final-result-title"),
  finalResultDescription: document.querySelector("#final-result-description"),
  resultToken: document.querySelector("#result-token"),
  resultBack: document.querySelector("#result-back-button"),
  copyLink: document.querySelector("#copy-link-button"),
  copyToken: document.querySelector("#copy-token-button"),
  showHiddenAxesWrap: document.querySelector("#show-hidden-axes-wrap"),
  showHiddenAxes: document.querySelector("#show-hidden-axes"),
  axesResult: document.querySelector("#axes-result"),
  medalsResult: document.querySelector("#medals-result")
};

function t(key, replacements = {}) {
  const dict = uiText[state.locale] || uiText.en;
  let value = dict[key] || uiText.en[key] || key;
  for (const [name, replacement] of Object.entries(replacements)) {
    value = value.replace(`{${name}}`, replacement);
  }
  return value;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }
  return data;
}

function localize(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value[state.locale] || value.en || Object.values(value)[0] || "";
}

function currentTest() {
  return state.tests.find(item => item.id === state.selectedTestId);
}

function localizeForTest(value, test, locale) {
  if (!value) return "";
  if (typeof value === "string") return value;
  const fallback = test?.defaultLocale || "en";
  return value[locale] || value[fallback] || value.en || Object.values(value)[0] || "";
}

function populateTestOptions() {
  elements.testSelect.innerHTML = "";
  for (const test of state.tests) {
    const option = document.createElement("option");
    option.value = test.id;
    option.textContent = localizeForTest(test.title, test, state.locale);
    elements.testSelect.append(option);
  }
  if (state.selectedTestId) {
    elements.testSelect.value = state.selectedTestId;
  }
  // Hide test selection if currently only one test available
  elements.testSelect.classList.toggle("hidden", state.tests.length <= 1);
}

function populateLanguageOptions(test, preferredLocale) {
  const fallback = test?.defaultLocale || "en";
  const localeSet = new Set([...Object.keys(uiText), ...(test?.locales || [])]);
  elements.language.innerHTML = "";
  for (const locale of localeSet) {
    const option = document.createElement("option");
    option.value = locale;
    option.textContent = locale.toUpperCase();
    elements.language.append(option);
  }

  const requested = preferredLocale || state.locale || fallback;
  state.locale = localeSet.has(requested) ? requested : fallback;
  elements.language.value = state.locale;
}

function changeTest(nextTestId) {
  if (!nextTestId || nextTestId === state.selectedTestId) return;
  state.selectedTestId = nextTestId;
  const test = currentTest();
  if (!test) return;
  populateLanguageOptions(test, state.locale);
  populateTestOptions();
  history.replaceState(null, "", "/");
  state.sessionId = null;
  state.currentResult = null;
  state.showHiddenAxes = false;
  state.token = "";
  renderIntro();
}

function isTestLocaleAvailable() {
  const test = currentTest();
  return Boolean(test?.locales?.includes(state.locale));
}

function setView(name) {
  state.view = name;
  elements.intro.classList.toggle("hidden", name !== "intro");
  elements.questionView.classList.toggle("hidden", name !== "question");
  if (name !== "question") {
    elements.questionFooter.classList.add("hidden");
  }
  elements.resultView.classList.toggle("hidden", name !== "result");
  elements.errorView.classList.toggle("hidden", name !== "error");
}

function applyUiText() {
  document.documentElement.lang = state.locale;
  document.querySelectorAll("[data-i18n]").forEach(node => {
    node.textContent = t(node.dataset.i18n);
  });
}

function renderIntro() {
  const test = currentTest();
  if (!test) return;
  const available = isTestLocaleAvailable();
  const fallbackLocale = test.defaultLocale || "en";
  elements.title.textContent = available ? localize(test.title) : (test.title[fallbackLocale] || localize(test.title));
  elements.description.textContent = available ? localize(test.description) : "";
  elements.languageWarning.classList.toggle("hidden", available);
  elements.start.disabled = !available;
  applyUiText();
  setView("intro");
}

function renderQuestion(payload) {
  state.sessionId = payload.sessionId;
  state.currentQuestion = payload.question;
  elements.title.textContent = payload.test.title;
  elements.progress.textContent = t("answered", {
    count: payload.progress.answered,
    current: payload.progress.current,
    total: payload.progress.total
  });
  elements.questionFooter.classList.toggle("hidden", !payload.progress.canGoBack);

  if (payload.progress.completed) {
    completeSession();
    return;
  }

  const question = payload.question;
  elements.questionSubtitle.textContent = question.subtitle || "";
  elements.questionText.textContent = question.text;
  elements.answers.innerHTML = "";
  elements.answers.className = "answers";
  if (question.type === "scale") {
    elements.answers.classList.add(question.scaleStyle === "dots" ? "answer-dots" : "answer-scale");
    if (question.scaleStyle === "dots") {
      elements.answers.style.setProperty("--dot-count", question.dots || question.answers.length);
    } else {
      elements.answers.style.removeProperty("--dot-count");
    }
  } else {
    elements.answers.style.removeProperty("--dot-count");
  }
  elements.axisLabels.classList.toggle("hidden", question.type !== "scale" || question.scaleStyle === "dots");

  if (question.type === "scale" && question.scaleStyle !== "dots") {
    elements.leftLabel.textContent = question.leftLabel;
    elements.rightLabel.textContent = question.rightLabel;
  }

  const answers = question.type === "scale" ? question.answers : question.options;
  const answerTarget = question.scaleStyle === "dots" ? renderDotScaleShell(question) : elements.answers;
  const isChoice = question.type === "choice";
  const isMultiChoice = isChoice && Boolean(question.multiSelect);
  const autoSubmitOnSelect = !isMultiChoice;
  const minSelections = Number(question.minSelections || 1);
  const maxSelections = Number(question.maxSelections || answers.length);
  const selectedAnswerIds = new Set();
  let selectedAnswerId = "";
  const buttonStates = [];

  const showActions = !autoSubmitOnSelect;
  const actions = showActions ? document.createElement("div") : null;
  if (actions) actions.className = "question-actions";

  const hint = showActions ? document.createElement("p") : null;
  if (hint) {
    hint.className = "choice-hint";
    actions.append(hint);
  }

  const continueButton = showActions ? document.createElement("button") : null;
  if (continueButton) {
    continueButton.type = "button";
    continueButton.className = "primary-button";
    continueButton.textContent = t("continue");
    continueButton.disabled = true;
    actions.append(continueButton);
  }

  const hasValidSelection = () => {
    if (isMultiChoice) {
      const count = selectedAnswerIds.size;
      return count >= minSelections && count <= maxSelections;
    }
    return Boolean(selectedAnswerId);
  };

  const updateActionHint = () => {
    if (!showActions || !hint || !continueButton) return;
    if (isMultiChoice) {
      if (minSelections === maxSelections) {
        hint.textContent = t("selectExactly", { count: String(minSelections) });
      } else if (minSelections <= 1) {
        hint.textContent = t("selectBetween", { min: String(minSelections), max: String(maxSelections) });
      } else {
        hint.textContent = t("selectAtLeast", { min: String(minSelections) });
      }
    } else {
      hint.textContent = t("selectOne");
    }
    continueButton.disabled = !hasValidSelection();
  };

  const updateSelectedStyles = () => {
    for (const state of buttonStates) {
      const selected = isMultiChoice ? selectedAnswerIds.has(state.id) : selectedAnswerId === state.id;
      state.button.classList.toggle("is-selected", selected);
      state.button.setAttribute("aria-pressed", selected ? "true" : "false");
      if (state.marker) {
        state.marker.textContent = isMultiChoice ? (selected ? "☑" : "☐") : (selected ? "◉" : "◯");
      }
    }
    updateActionHint();
  };

  for (const answer of answers) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = question.scaleStyle === "dots" ? "dot-button" : "answer-button";
    button.setAttribute("aria-pressed", "false");
    let marker = null;

    if (question.scaleStyle === "dots") {
      const maxDistance = answer.maxDistance || 1;
      const size = 18 + (18 * ((answer.distance || 0) / maxDistance));
      button.dataset.side = String(answer.side);
      button.style.setProperty("--dot-size", `${size}px`);
      button.setAttribute("aria-label", `${question.leftLabel} ${answer.position} ${question.rightLabel}`);
      const dot = document.createElement("span");
      dot.className = "dot";
      button.append(dot);
    } else if (isChoice) {
      button.classList.add("answer-choice-toggle");
      marker = document.createElement("span");
      marker.className = "choice-marker";
      marker.textContent = isMultiChoice ? "☐" : "◯";
      const label = document.createElement("span");
      label.className = "choice-label";
      label.textContent = answer.label;
      button.append(marker, label);
    } else {
      button.textContent = answer.label;
    }

    button.addEventListener("click", () => {
      if (isMultiChoice) {
        if (selectedAnswerIds.has(answer.id)) {
          selectedAnswerIds.delete(answer.id);
        } else if (selectedAnswerIds.size < maxSelections) {
          selectedAnswerIds.add(answer.id);
        }
      } else {
        selectedAnswerId = answer.id;
      }
      updateSelectedStyles();
      if (autoSubmitOnSelect && selectedAnswerId) {
        for (const item of buttonStates) {
          item.button.disabled = true;
        }
        submitAnswer(question.id, { answerId: selectedAnswerId });
      }
    });

    buttonStates.push({ id: answer.id, button, marker });
    answerTarget.append(button);
  }

  if (continueButton) {
    continueButton.addEventListener("click", () => {
      if (!hasValidSelection()) return;
      if (isMultiChoice) {
        submitAnswer(question.id, { answerIds: [...selectedAnswerIds] });
        return;
      }
      submitAnswer(question.id, { answerId: selectedAnswerId });
    });
  }

  if (actions) {
    elements.answers.append(actions);
  }
  updateSelectedStyles();

  setView("question");
}

function renderDotScaleShell(question) {
  const row = document.createElement("div");
  row.className = "bipolar-scale";

  const left = document.createElement("span");
  left.className = "bipolar-label bipolar-label-left";
  left.textContent = question.leftLabel;

  const dots = document.createElement("div");
  dots.className = "bipolar-dots";
  dots.style.setProperty("--dot-count", question.dots || question.answers.length);

  const right = document.createElement("span");
  right.className = "bipolar-label bipolar-label-right";
  right.textContent = question.rightLabel;

  row.append(left, dots, right);
  elements.answers.append(row);
  return dots;
}

function axisCard(axis) {
  const article = document.createElement("article");
  article.className = `axis-card ${axis.opposition ? "axis-opposition" : "axis-progress"}`;
  article.innerHTML = `
    <div class="axis-head">
      <h3></h3>
      <strong></strong>
    </div>
    <div class="bar" aria-hidden="true">
      <div class="bar-left"></div>
      <div class="bar-right"></div>
    </div>
    <div class="axis-poles">
      <span></span>
      <span></span>
    </div>
  `;
  article.querySelector("h3").textContent = axis.name;
  const headingValue = article.querySelector("strong");
  const leftBar = article.querySelector(".bar-left");
  const rightBar = article.querySelector(".bar-right");
  const poles = article.querySelectorAll(".axis-poles span");

  if (axis.opposition) {
    headingValue.textContent = "";
    leftBar.style.width = `${axis.leftPercent}%`;
    rightBar.style.width = `${axis.rightPercent}%`;
    leftBar.style.background = axis.colors.left;
    rightBar.style.background = axis.colors.right;
    poles[0].textContent = `${axis.leftLabel} ${axis.leftPercent}%`;
    poles[1].textContent = `${axis.rightLabel} ${axis.rightPercent}%`;
  } else {
    headingValue.textContent = `${axis.percent}%`;
    leftBar.style.width = `${axis.percent}%`;
    rightBar.style.width = `${100 - axis.percent}%`;
    leftBar.style.background = axis.colors.primary;
    rightBar.style.background = "transparent";
    poles[0].textContent = axis.leftLabel;
    poles[1].textContent = axis.rightLabel;
  }

  return article;
}

function medalCard(medal) {
  const article = document.createElement("article");
  article.className = "medal-card";
  article.innerHTML = `
    <div class="medal-icon"></div>
    <div>
      <h3></h3>
      <p></p>
    </div>
  `;
  article.querySelector(".medal-icon").textContent = medal.icon;
  article.querySelector("h3").textContent = medal.title;
  article.querySelector("p").textContent = medal.description;
  return article;
}

function renderAxes() {
  elements.axesResult.innerHTML = "";
  if (!state.currentResult) return;

  const axes = state.currentResult.axes.filter(axis => state.showHiddenAxes || !axis.hiddenByDefault);
  for (const axis of axes) {
    elements.axesResult.append(axisCard(axis));
  }
}

function renderResult(result, token = "", options = {}) {
  elements.title.textContent = result.test.title;
  elements.medalsResult.innerHTML = "";
  state.currentResult = result;
  if (!options.preserveHiddenAxes) {
    state.showHiddenAxes = false;
  }
  state.token = token;
  elements.resultToken.value = token;
  elements.resultBack.classList.toggle("hidden", !state.sessionId);
  elements.showHiddenAxes.checked = state.showHiddenAxes;
  elements.showHiddenAxesWrap.classList.toggle("hidden", !result.axes.some(axis => axis.hiddenByDefault));
  elements.finalResultCard.classList.toggle("hidden", !result.finalResult);
  if (result.finalResult) {
    elements.finalResultTitle.textContent = result.finalResult.title;
    elements.finalResultDescription.textContent = result.finalResult.description;
  }
  renderAxes();

  if (result.medals.length === 0) {
    const empty = document.createElement("p");
    empty.className = "lead";
    empty.textContent = t("noMedals");
    elements.medalsResult.append(empty);
  } else {
    for (const medal of result.medals) {
      elements.medalsResult.append(medalCard(medal));
    }
  }

  applyUiText();
  setView("result");
}

async function startSession() {
  if (!isTestLocaleAvailable()) {
    renderIntro();
    return;
  }
  try {
    const payload = await api("/api/session", {
      method: "POST",
      body: JSON.stringify({ testId: state.selectedTestId, locale: state.locale })
    });
    renderQuestion(payload);
  } catch (error) {
    showError(error);
  }
}

async function submitAnswer(questionId, selection) {
  try {
    const payloadBody = { questionId };
    if (Array.isArray(selection?.answerIds)) {
      payloadBody.answerIds = selection.answerIds;
    } else {
      payloadBody.answerId = selection?.answerId;
    }
    const payload = await api(`/api/session/${state.sessionId}/answer`, {
      method: "POST",
      body: JSON.stringify(payloadBody)
    });
    renderQuestion(payload);
  } catch (error) {
    showError(error);
  }
}

async function goBack() {
  try {
    const payload = await api(`/api/session/${state.sessionId}/back`, {
      method: "POST",
      body: JSON.stringify({})
    });
    history.replaceState(null, "", "/");
    state.token = "";
    renderQuestion(payload);
  } catch (error) {
    showError(error);
  }
}

async function completeSession() {
  try {
    const payload = await api(`/api/session/${state.sessionId}/complete`, {
      method: "POST",
      body: JSON.stringify({})
    });
    renderResult(payload.result, payload.token);
    history.replaceState(null, "", resultUrl(payload.token));
  } catch (error) {
    showError(error);
  }
}

async function loadSharedResult(token) {
  try {
    const payload = await api(`/api/result/${encodeURIComponent(token)}?locale=${encodeURIComponent(state.locale)}`);
    renderResult(payload.result, token);
  } catch (error) {
    showError(error);
  }
}

function resultUrl(token) {
  return `/?result=${encodeURIComponent(token)}&locale=${encodeURIComponent(state.locale)}`;
}

async function setSessionLocale(locale) {
  if (!state.sessionId) return null;
  return api(`/api/session/${state.sessionId}/locale`, {
    method: "POST",
    body: JSON.stringify({ locale })
  });
}

async function refreshCurrentLanguage() {
  applyUiText();
  populateTestOptions();
  if (!isTestLocaleAvailable()) {
    if (state.view === "intro") {
      renderIntro();
    } else {
      showError(new Error(t("languageUnavailable")));
    }
    return;
  }

  if (state.view === "intro") {
    renderIntro();
    return;
  }

  if (state.view === "question" && state.sessionId) {
    const payload = await setSessionLocale(state.locale);
    renderQuestion(payload);
    return;
  }

  if (state.view === "result") {
    if (state.sessionId) {
      await setSessionLocale(state.locale);
      const payload = await api(`/api/session/${state.sessionId}/complete`, {
        method: "POST",
        body: JSON.stringify({})
      });
      renderResult(payload.result, payload.token, { preserveHiddenAxes: true });
      history.replaceState(null, "", resultUrl(payload.token));
      return;
    }

    if (state.token) {
      const payload = await api(`/api/result/${encodeURIComponent(state.token)}?locale=${encodeURIComponent(state.locale)}`);
      renderResult(payload.result, state.token, { preserveHiddenAxes: true });
      history.replaceState(null, "", resultUrl(state.token));
    }
  }
}

async function changeLanguage(nextLocale) {
  const previousLocale = state.locale;
  state.locale = nextLocale;

  if (!isTestLocaleAvailable() && state.view !== "intro") {
    alert(t("languageUnavailable"));
    state.locale = previousLocale;
    elements.language.value = previousLocale;
    applyUiText();
    return;
  }

  await refreshCurrentLanguage();
}

function showError(error) {
  elements.errorView.textContent = `${t("error")} ${error.message}`;
  setView("error");
}

async function copyText(value, button) {
  await navigator.clipboard.writeText(value);
  const original = button.textContent;
  button.textContent = t("copied");
  setTimeout(() => {
    button.textContent = original;
  }, 1200);
}

function restartTest() {
  history.replaceState(null, "", "/");
  state.sessionId = null;
  state.currentResult = null;
  state.showHiddenAxes = false;
  state.token = "";
  renderIntro();
}

async function init() {
  const data = await api("/api/tests");
  state.tests = data.tests;
  const params = new URLSearchParams(location.search);
  const requestedTest = params.get("test");
  state.selectedTestId = state.tests.some(testItem => testItem.id === requestedTest)
    ? requestedTest
    : data.tests[0]?.id;
  const test = currentTest();
  state.locale = test?.defaultLocale || "en";
  populateLanguageOptions(test, state.locale);
  populateTestOptions();

  elements.start.addEventListener("click", startSession);
  elements.testAgain.addEventListener("click", restartTest);
  elements.back.addEventListener("click", goBack);
  elements.resultBack.addEventListener("click", goBack);
  elements.restart.addEventListener("click", restartTest);
  elements.showHiddenAxes.addEventListener("change", () => {
    state.showHiddenAxes = elements.showHiddenAxes.checked;
    renderAxes();
  });
  elements.testSelect.addEventListener("change", () => {
    changeTest(elements.testSelect.value);
  });
  elements.language.addEventListener("change", () => {
    changeLanguage(elements.language.value).catch(showError);
  });
  elements.copyLink.addEventListener("click", () => {
    copyText(`${location.origin}${resultUrl(state.token)}`, elements.copyLink);
  });
  elements.copyToken.addEventListener("click", () => {
    copyText(state.token, elements.copyToken);
  });

  const requestedLocale = params.get("locale");
  if (requestedLocale && (uiText[requestedLocale] || test?.locales?.includes(requestedLocale))) {
    state.locale = requestedLocale;
    elements.language.value = state.locale;
    populateTestOptions();
  }

  const sharedToken = params.get("result");
  if (sharedToken) {
    state.sessionId = null;
    await loadSharedResult(sharedToken);
  } else {
    renderIntro();
  }
}

init().catch(showError);

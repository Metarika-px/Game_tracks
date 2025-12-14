const LEVELS = {
  easy: {
    id: "easy",
    name: "Легко",
    rounds: 5,
    baseScore: 10,
    wrongPenalty: 5,
    timeLimitSec: 90,
  },
  normal: {
    id: "normal",
    name: "Нормально",
    rounds: 5,
    baseScore: 15,
    wrongPenalty: 7,
    timeLimitSec: 60,
  },
  hard: {
    id: "hard",
    name: "Сложно",
    rounds: 5,
    baseScore: 25,
    wrongPenalty: 10,
    timeLimitSec: 45,
  },
};

// Порог очков для разблокировки уровней
const UNLOCK_SCORES = {
  normal: 30,
  hard: 40,
};

let forceUnlockLevels = false; // админка
let currentLevelId = "easy";
let currentConfig = LEVELS.easy;

let currentRound = 1;
let score = 0;
let currentCorrectId = null;
let selectedOptionId = null;

let timerId = null;
let timeLeftSec = 0;
let timeExpired = false;

let endModal = null;
let modalTitle = null;
let modalText = null;
let modalReplayBtn = null;
let modalNextBtn = null;
let modalLevelSelectBtn = null;
let modalLeaderboardBtn = null;
let roundSelectModal = null;
let roundSelectList = null;
let roundSelectCancel = null;
let nextLevelToStart = null;
let feedbackTimeoutId = null;
let feedbackHideTimeoutId = null;
let audioCtx = null;
let roundStates = [];
let roundsListEl = null;
let modalRoundsListEl = null;
let viewingRound = null;
let roundLocked = false;
let savedLevelProgress = {};
let restartBtn = null;

function loadRoundProgressFromStorage() {
  try {
    const raw = localStorage.getItem("roundProgress");
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      savedLevelProgress = parsed;
    }
  } catch (e) {}
}

function saveRoundProgressToStorage() {
  try {
    localStorage.setItem("roundProgress", JSON.stringify(savedLevelProgress));
  } catch (e) {}
}

function calculateScoreFromStates(states) {
  if (!currentConfig) return 0;
  let total = 0;
  states.forEach((st) => {
    if (!st || st.result === null) return;
    if (st.result) {
      total += currentConfig.baseScore;
    } else {
      total = Math.max(0, total - currentConfig.wrongPenalty);
    }
  });
  return total;
}

// Подбираем модификаторы сложности для картинок
function getRandomModifierForRound(round) {
  const midMods = [
    "mod-rot-15",
    "mod-rot--15",
    "mod-rot-30",
    "mod-small",
    "mod-tilt",
    "mod-blur",
  ];
  const maskMods = ["mod-mask"];
  const blurMods = ["mod-blur"];
  const cutMods = ["mod-cut"];
  const shakeMods = ["mod-shake"];
  const spinMods = ["mod-spin"];

  // случайный элемент из массива
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  // собрать пул классов и вернуть один случайный
  function buildMods(arrayOfGroups) {
    const pool = arrayOfGroups.flat();
    if (!pool.length) return "";
    return pick(pool);
  }

  // ЛЕГКО
  if (currentLevelId === "easy") {
    if (round === 1) {
      return ""; // без модификаторов
    }
    if (round === 2 || round === 3) {
      // лёгкие повороты/масштаб
      return buildMods([midMods]);
    }
    if (round === 4) {
      // повороты/масштаб + иногда маска
      return buildMods([midMods, midMods, maskMods]); // маска реже
    }
    // round 5
    return buildMods([midMods, maskMods, spinMods]); // маска почти всегда
  }

  // НОРМАЛЬНО
  if (currentLevelId === "normal") {
    if (round === 1) {
      // сразу лёгкие модификаторы
      return buildMods([midMods]);
    }
    if (round === 2) {
      // повороты + маска
      return buildMods([midMods, maskMods, spinMods]);
    }
    if (round === 3) {
      // повороты + маска или блюр
      return buildMods([midMods, maskMods, blurMods]);
    }
    if (round === 4) {
      return buildMods([
        midMods,
        maskMods,
        maskMods,
        blurMods,
        shakeMods,
        spinMods,
      ]);
    }
    // round 5 — добавляем обрезанный угол и shake
    return buildMods([
      midMods,
      maskMods,
      blurMods,
      cutMods,
      shakeMods,
      spinMods,
    ]);
  }

  // СЛОЖНО
  // на сложном всегда есть минимум маска/блюр, часто ещё и cut, shake или spin
  if (currentLevelId === "hard") {
    if (round === 1) {
      return buildMods([midMods, maskMods, blurMods]);
    }
    if (round === 2) {
      return buildMods([midMods, maskMods, blurMods, cutMods]);
    }
    if (round === 3) {
      return buildMods([
        midMods,
        midMods,
        maskMods,
        blurMods,
        cutMods,
        shakeMods,
      ]);
    }
    if (round === 4) {
      return buildMods([
        midMods,
        maskMods,
        maskMods,
        blurMods,
        cutMods,
        shakeMods,
      ]);
    }
    // round 5
    return buildMods([
      midMods,
      midMods,
      maskMods,
      blurMods,
      cutMods,
      cutMods,
      shakeMods,
      spinMods,
    ]);
  }

  // на всякий случай, если что-то пойдёт не так
  return "";
}

// таймер
function updateTimerLabel() {
  const el = document.getElementById("timer-label");
  if (!el) return;
  const m = String(Math.floor(timeLeftSec / 60)).padStart(2, "0");
  const s = String(timeLeftSec % 60).padStart(2, "0");
  el.textContent = `${m}:${s}`;
}

function startTimer() {
  clearInterval(timerId);
  timeExpired = false;
  timeLeftSec = currentConfig.timeLimitSec;
  updateTimerLabel();

  timerId = setInterval(() => {
    timeLeftSec--;
    if (timeLeftSec <= 0) {
      handleTimeExpired();
      return;
    }
    updateTimerLabel();
  }, 1000);
}

function handleTimeExpired() {
  if (timeExpired) return;
  timeExpired = true;
  clearInterval(timerId);
  timeLeftSec = 0;
  updateTimerLabel();

  const penalty = currentConfig.wrongPenalty * 2;
  score = Math.max(0, score - penalty);

  uiUpdateHeader({
    playerName: getCurrentPlayerName(),
    score,
    round: currentRound,
    totalRounds: currentConfig.rounds,
  });

  setCurrentGameState(score, currentConfig.id);
}

// инициализация страницы
document.addEventListener("DOMContentLoaded", () => {
  let playerName = getCurrentPlayerName();
  if (!playerName) {
    playerName = "Гость";
    localStorage.setItem("currentPlayerName", playerName);
  }

  const nameLabel = document.getElementById("player-name-label");
  if (nameLabel) nameLabel.textContent = playerName;
  const changePlayerBtn = document.getElementById("change-player-btn");
  if (changePlayerBtn) {
    changePlayerBtn.addEventListener("click", () => {
      localStorage.removeItem("currentPlayerName");
      window.location.href = "index.html";
    });
  }

  endModal = document.getElementById("level-end-modal");
  modalTitle = document.getElementById("modal-title");
  modalText = document.getElementById("modal-text");
  modalReplayBtn = document.getElementById("modal-replay-btn");
  modalNextBtn = document.getElementById("modal-next-btn");
  modalLevelSelectBtn = document.getElementById("modal-level-select-btn");
  modalLeaderboardBtn = document.getElementById("modal-leaderboard-btn");
  modalRoundsListEl = document.getElementById("modal-rounds-list");
  roundSelectModal = document.getElementById("round-select-modal");
  roundSelectList = document.getElementById("round-select-list");
  roundSelectCancel = document.getElementById("round-select-cancel");
  roundsListEl = document.getElementById("rounds-list");
  restartBtn = document.getElementById("restart-round-btn");
  if (modalReplayBtn) {
    modalReplayBtn.addEventListener("click", () => {
      hideEndModal();
      showRoundSelectModal(currentLevelId, cloneRoundStates(roundStates));
    });
  }

  if (modalNextBtn) {
    modalNextBtn.addEventListener("click", () => {
      if (!nextLevelToStart) return;
      hideEndModal();
      startLevel(nextLevelToStart, true);
    });
  }

  if (modalLevelSelectBtn) {
    modalLevelSelectBtn.addEventListener("click", () => {
      hideEndModal();
      showLevelSelectMenu();
    });
  }

  if (modalLeaderboardBtn) {
    modalLeaderboardBtn.addEventListener("click", () => {
      window.location.href = "results.html";
    });
  }

  if (roundSelectCancel && roundSelectModal) {
    roundSelectCancel.addEventListener("click", () => {
      hideRoundSelectModal();
    });
  }

  if (restartBtn) {
    restartBtn.addEventListener("click", () => restartCurrentRound());
  }

  document.addEventListener("keydown", handleAdminToggle);

  loadRoundProgressFromStorage();
  setupLevelMenu();
});

function handleAdminToggle(event) {
  if (!event.key || event.key.toLowerCase() !== "o") return;
  forceUnlockLevels = !forceUnlockLevels;
  setupLevelMenu();
}

// меню выбора уровня
function setupLevelMenu() {
  const bestEasy = getBestScoreForLevel("easy");
  const bestNormal = getBestScoreForLevel("normal");

  const easyBtn = document.getElementById("level-easy-btn");
  const normalBtn = document.getElementById("level-normal-btn");
  const hardBtn = document.getElementById("level-hard-btn");
  const hint = document.getElementById("level-hint");
  const leaderboardBtn = document.getElementById("leaderboard-btn");
  const defaultHint =
    'Уровень "Нормально" и "Сложно" откроются после набора нужного количества очков.';

  if (hint) {
    if (forceUnlockLevels) {
      hint.textContent = 'Админ режим: уровни разблокированы (клавиша "O").';
    } else {
      hint.textContent = defaultHint;
    }
  }

  if (easyBtn) {
    easyBtn.disabled = false;
    easyBtn.classList.remove("level-locked");
    easyBtn.title = 'Уровень "Легко"';
    easyBtn.onclick = () => requestRoundStart("easy");
  }

  if (normalBtn) {
    if (forceUnlockLevels || bestEasy >= UNLOCK_SCORES.normal) {
      normalBtn.disabled = false;
      normalBtn.classList.remove("level-locked");
      normalBtn.title = 'Уровень "Нормально" доступен';
      normalBtn.onclick = () => requestRoundStart("normal");
    } else {
      normalBtn.disabled = true;
      normalBtn.classList.add("level-locked");
      normalBtn.title = `Откроется, когда вы наберёте не менее ${UNLOCK_SCORES.normal} очков на уровне "Легко".`;
      if (hint && !forceUnlockLevels) {
        hint.textContent = `Уровень "Нормально" откроется, когда вы наберёте не менее ${UNLOCK_SCORES.normal} очков на уровне "Легко".`;
      }
    }
  }

  if (hardBtn) {
    if (forceUnlockLevels || bestNormal >= UNLOCK_SCORES.hard) {
      hardBtn.disabled = false;
      hardBtn.classList.remove("level-locked");
      hardBtn.title = 'Уровень "Сложно" доступен';
      hardBtn.onclick = () => requestRoundStart("hard");
    } else {
      hardBtn.disabled = true;
      hardBtn.classList.add("level-locked");
      hardBtn.title = `Откроется, когда вы наберёте не менее ${UNLOCK_SCORES.hard} очков на уровне "Нормально".`;
      if (hint && !forceUnlockLevels && bestEasy >= UNLOCK_SCORES.normal) {
        hint.textContent = `Уровень "Сложно" откроется, когда вы наберёте не менее ${UNLOCK_SCORES.hard} очков на уровне "Нормально".`;
      }
    }
  }

  if (leaderboardBtn) {
    leaderboardBtn.onclick = () => {
      window.location.href = "results.html";
    };
  }
}
function showLevelSelectMenu() {
  const selectBlock = document.getElementById("level-select");
  const gameWrapper = document.getElementById("game-main-wrapper");
  if (selectBlock) selectBlock.classList.remove("hidden");
  if (gameWrapper) gameWrapper.classList.add("hidden");
  setupLevelMenu();
}

function getOptionsCountForLevel(levelId) {
  if (levelId === "easy") return 3;
  if (levelId === "normal") return 4;
  return 5;
}
// старт конкретного уровня
function startLevel(levelId, reset = false, startFromRound = 1) {
  currentLevelId = levelId;
  currentConfig = LEVELS[levelId];
  currentCorrectId = null;
  selectedOptionId = null;
  viewingRound = null;
  roundLocked = false;

  if (reset) {
    delete savedLevelProgress[levelId];
    saveRoundProgressToStorage();
    roundStates = [];
    score = 0;
    currentRound = startFromRound;
  } else {
    const saved = savedLevelProgress[levelId];
    if (saved && saved.roundStates && saved.roundStates.length) {
      roundStates = cloneRoundStates(saved.roundStates);
      score = calculateScoreFromStates(roundStates);
      currentRound = startFromRound;
    } else {
      currentRound = 1;
      score = 0;
      roundStates = [];
    }
  }

  // показываем основную игру, прячем меню
  const selectBlock = document.getElementById("level-select");
  const gameWrapper = document.getElementById("game-main-wrapper");
  if (selectBlock) selectBlock.classList.add("hidden");
  if (gameWrapper) gameWrapper.classList.remove("hidden");

  // обновляем заголовки
  const levelLabel = document.getElementById("level-label");
  if (levelLabel) levelLabel.textContent = currentConfig.name;

  uiUpdateHeader({
    playerName: getCurrentPlayerName(),
    score,
    round: currentRound,
    totalRounds: currentConfig.rounds,
  });
  updateRoundListUI();

  const endBtn = document.getElementById("end-level-btn");
  if (endBtn) {
    endBtn.onclick = () => finishLevel("manual");
  }

  startTimer();
  startRound();
}

// Р»РѕРіРёРєР° СЂР°СѓРЅРґР°
function startRound() {
  uiClearSelection();
  let existing = roundStates[currentRound];
  if (existing && existing.result !== null) {
    // если раунд уже пройден, при авто-переходе генерируем его заново
    roundStates[currentRound] = null;
    existing = null;
  }
  if (existing && existing.options) {
    if (existing.result === null) {
      currentCorrectId = existing.correctId;
      selectedOptionId = existing.selectedId;
      roundLocked = false;
      setQuestionText(existing.questionType || "track");
      uiShowOwner(existing.owner, existing.questionType || "track");
      renderRoundFromState(existing, false);
      updateRoundListUI();
      return;
    } else {
      viewingRound = currentRound;
      currentCorrectId = existing.correctId;
      selectedOptionId = existing.selectedId;
      roundLocked = true;
      setQuestionText(existing.questionType || "track");
      uiShowOwner(existing.owner, existing.questionType || "track");
      renderRoundFromState(existing, true);
      updateRoundListUI();
      return;
    }
  }

  const owner = getRandomItem(ANIMALS);
  currentCorrectId = owner.id;
  selectedOptionId = null;
  roundLocked = false;

  const questionType =
    isMazeMode() || Math.random() < 0.5 ? "track" : "animal";

  setQuestionText(questionType);
  uiShowOwner(owner, questionType);

  const optionsCount = getOptionsCountForLevel(currentLevelId);
  const wrongNeeded = Math.max(2, optionsCount - 1);
  const sharedModifier = getRandomModifierForRound(currentRound);

  let options = [];
  if (questionType === "track") {
    const correctTrack = {
      id: owner.id,
      src: owner.track,
      correct: true,
      cssClass: sharedModifier,
    };

    const wrongTracks = [];
    const usedIds = new Set([owner.id]);

    while (wrongTracks.length < wrongNeeded) {
      const candidate = getRandomItem(ANIMALS);
      if (usedIds.has(candidate.id)) continue;
      usedIds.add(candidate.id);

      wrongTracks.push({
        id: candidate.id,
        src: candidate.track,
        correct: false,
        cssClass: sharedModifier,
      });
    }

    options = shuffle([correctTrack, ...wrongTracks]).slice(0, optionsCount);
  } else {
    const correctOption = {
      id: owner.id,
      src: owner.src,
      correct: true,
      cssClass: sharedModifier,
    };
    const wrong = [];
    const usedIds = new Set([owner.id]);
    while (wrong.length < wrongNeeded) {
      const candidate = getRandomItem(ANIMALS);
      if (usedIds.has(candidate.id)) continue;
      usedIds.add(candidate.id);
      wrong.push({
        id: candidate.id,
        src: candidate.src,
        correct: false,
        cssClass: sharedModifier,
      });
    }
    options = shuffle([correctOption, ...wrong]).slice(0, optionsCount);
  }

  const mode = isMazeMode() ? "maze" : "click";
  roundStates[currentRound] = {
    round: currentRound,
    owner,
    options,
    mode,
    questionType,
    correctId: owner.id,
    selectedId: null,
    result: null,
  };
  viewingRound = null;

  renderRoundFromState(roundStates[currentRound], false);
  updateRoundListUI();
  persistLevelProgress();

  if (isMazeMode()) {
    startMazePhase({
      rows: 3,
      cols: 3,
      onDropToStart: (trackId) => {
        // игрок бросил след в стартовую клетку
        selectedOptionId = trackId;
        const cssClass = getOptionClassForTrack(trackId);
        setMazeCursorImage(trackId, cssClass);
      },
      onSuccess: () => {
        // лабиринт пройден — проверяем, правильный ли след
        checkAnswer();
      },
      onFail: () => {
        // задел стену — считаем попытку провальной
        selectedOptionId = "__wrong__";
        checkAnswer();
      },
    });
  }
}

function renderRoundFromState(state, viewOnly = false) {
  if (!state) return;
  uiClearSelection();

  currentCorrectId = state.correctId;
  selectedOptionId = viewOnly ? state.selectedId : null;
  roundLocked = viewOnly || state.result !== null;

  const mode = viewOnly ? "click" : state.mode;
  setQuestionText(state.questionType || "track");
  uiShowOwner(state.owner, state.questionType || "track");

  uiRenderTrackOptions(
    state.options,
    viewOnly ? () => {} : handleSelectOption,
    viewOnly ? () => {} : handleConfirmOption,
    mode,
    state.questionType || "track"
  );

  const container = document.getElementById("tracks-container");
  if (container) {
    if (viewOnly) container.classList.add("view-only");
    else container.classList.remove("view-only");
  }

  if (viewOnly) {
    const mazeArea = document.getElementById("maze-area");
    if (mazeArea) mazeArea.classList.add("hidden");
    applyRoundSelectionState(state);
  }

  const hint = document.getElementById("view-mode-hint");
  if (hint) {
    if (viewOnly) {
      hint.classList.remove("hidden");
    } else {
      hint.classList.add("hidden");
    }
  }
}

function applyRoundSelectionState(state) {
  if (!state || !state.selectedId) return;
  document.querySelectorAll(".track-option").forEach((el) => {
    const id = el.dataset.id;
    if (id === String(state.selectedId)) {
      el.classList.add("selected");
      if (state.selectedId === state.correctId) {
        el.classList.add("correct");
      } else {
        el.classList.add("wrong");
      }
    }
  });
}

function viewRound(roundNumber) {
  const state = roundStates[roundNumber];
  if (!state || state.selectedId === null) return;
  viewingRound = roundNumber;
  roundLocked = true;
  renderRoundFromState(state, true);
  uiUpdateHeader({
    playerName: getCurrentPlayerName(),
    score,
    round: roundNumber,
    totalRounds: currentConfig.rounds,
  });
  updateRoundListUI();
}

function resumeCurrentRound() {
  const state = roundStates[currentRound];
  if (!state) return;
  viewingRound = null;
  roundLocked = state.result !== null;
  renderRoundFromState(state, false);
  uiUpdateHeader({
    playerName: getCurrentPlayerName(),
    score,
    round: currentRound,
    totalRounds: currentConfig.rounds,
  });
  updateRoundListUI();
}

function restartFromRound(roundNumber) {
  if (!currentConfig) return;
  hideEndModal();
  viewingRound = null;
  roundLocked = false;

  // сбрасываем выбранный раунд, остальное оставляем
  roundStates[roundNumber] = null;
  score = calculateScoreFromStates(roundStates);
  currentRound = roundNumber;
  setCurrentGameState(score, currentConfig.id);
  uiUpdateHeader({
    playerName: getCurrentPlayerName(),
    score,
    round: currentRound,
    totalRounds: currentConfig.rounds,
  });

  persistLevelProgress();
  startRound();
}

function restartCurrentRound() {
  restartFromRound(currentRound);
}

function viewCompletedRound(roundNumber) {
  const state = roundStates[roundNumber];
  if (!state || state.result === null) {
    restartFromRound(roundNumber);
    return;
  }
  currentRound = roundNumber;
  viewingRound = roundNumber;
  roundLocked = true;
  setQuestionText(state.questionType || "track");
  uiShowOwner(state.owner, state.questionType || "track");
  renderRoundFromState(state, true);
  uiUpdateHeader({
    playerName: getCurrentPlayerName(),
    score,
    round: currentRound,
    totalRounds: currentConfig.rounds,
  });
  updateRoundListUI();
}

function handleSelectOption(element) {
  if (roundLocked) return;
  document.querySelectorAll(".track-option").forEach((el) => {
    el.classList.remove("selected");
  });
  element.classList.add("selected");
  selectedOptionId = element.dataset.id;
}
function handleConfirmOption(element) {
  if (roundLocked) return;
  // В режиме лабиринта выбор подтверждается через onSuccess/onFail
  if (isMazeMode()) {
    return;
  }

  // Обычные уровни (клик / двойной клик)
  if (!element) {
    selectedOptionId = "__wrong__";
    checkAnswer();
    return;
  }

  if (!selectedOptionId) {
    handleSelectOption(element);
  }
  checkAnswer();
}

function checkAnswer() {
  if (roundLocked) return;
  roundLocked = true;
  const isCorrect = selectedOptionId === currentCorrectId;

  uiShowAnswer(currentCorrectId);

  playFeedbackSound(isCorrect);
  showFeedbackOverlay(isCorrect);

  const state = roundStates[currentRound];
  if (state) {
    state.selectedId = selectedOptionId;
    state.result = isCorrect;
  }
  score = calculateScoreFromStates(roundStates);
  uiUpdateHeader({
    playerName: getCurrentPlayerName(),
    score,
    round: currentRound,
    totalRounds: currentConfig.rounds,
  });

  setCurrentGameState(score, currentConfig.id);
  updateRoundListUI();
  persistLevelProgress();

  const nextDelay = 2300;
  setTimeout(() => {
    const next = findNextIncompleteRound();
    if (!next) {
      finishLevel("rounds");
    } else {
      currentRound = next;
      uiUpdateHeader({
        playerName: getCurrentPlayerName(),
        score,
        round: currentRound,
        totalRounds: currentConfig.rounds,
      });
      startRound();
    }
  }, nextDelay);
}

function showEndModal(reason) {
  if (!endModal || !modalTitle || !modalText) return;
  const picker = document.getElementById("modal-rounds-picker");
  if (picker) picker.classList.add("hidden");

  let title = "Уровень завершён";
  if (reason === "time") title = "Время вышло";
  if (reason === "manual") title = "Уровень прерван";
  modalTitle.textContent = title;

  const levelName = currentConfig.name;
  modalText.textContent = `Вы набрали ${score} очков на уровне "${levelName}".`;

  // по умолчанию следующего уровня нет
  nextLevelToStart = null;

  // проверяем, можно ли предложить следующий уровень
  if (
    currentLevelId === "easy" &&
    (forceUnlockLevels || score >= UNLOCK_SCORES.normal)
  ) {
    nextLevelToStart = "normal";
  } else if (
    currentLevelId === "normal" &&
    (forceUnlockLevels || score >= UNLOCK_SCORES.hard)
  ) {
    nextLevelToStart = "hard";
  }

  const isLastLevel = currentLevelId === "hard";

  if (modalNextBtn) {
    if (isLastLevel) {
      modalNextBtn.disabled = true;
      modalNextBtn.classList.add("level-locked");
      modalNextBtn.textContent = "Следующий уровень";
      modalNextBtn.style.display = "none";
    } else if (nextLevelToStart) {
      modalNextBtn.disabled = false;
      modalNextBtn.classList.remove("level-locked");
      modalNextBtn.textContent = "Следующий уровень";
      modalNextBtn.style.display = "inline-block";
    } else {
      modalNextBtn.disabled = true;
      modalNextBtn.classList.add("level-locked");
      modalNextBtn.textContent = "Следующий уровень недоступен";
      modalNextBtn.style.display = "inline-block";
    }
  }

  endModal.classList.remove("hidden");
}

function hideEndModal() {
  if (!endModal) return;
  endModal.classList.add("hidden");
}

function renderModalRounds() {
  if (!modalRoundsListEl || !currentConfig) return;
  modalRoundsListEl.innerHTML = "";
  for (let i = 1; i <= currentConfig.rounds; i++) {
    const btn = document.createElement("button");
    btn.className = "round-chip";
    btn.textContent = `Раунд ${i}`;
    const state = roundStates[i];
    if (state && state.result !== null) {
      btn.dataset.status = state.result ? "win" : "fail";
    }
    btn.addEventListener("click", () => {
      hideEndModal();
      restartFromRound(i);
    });
    modalRoundsListEl.appendChild(btn);
  }
  const picker = document.getElementById("modal-rounds-picker");
  if (picker) picker.classList.remove("hidden");
}

function requestRoundStart(levelId) {
  const gameWrapper = document.getElementById("game-main-wrapper");
  const alreadyPlaying =
    levelId === currentLevelId &&
    gameWrapper &&
    !gameWrapper.classList.contains("hidden");
  if (alreadyPlaying) {
    hideRoundSelectModal();
    hideEndModal();
    return;
  }

  const saved = savedLevelProgress[levelId];
  if (saved && saved.roundStates && saved.roundStates.length) {
    showRoundSelectModal(levelId, saved.roundStates);
  } else {
    hideRoundSelectModal();
    startLevel(levelId, true, 1);
  }
}

function showRoundSelectModal(levelId, savedStates = []) {
  if (!roundSelectModal || !roundSelectList) {
    startLevel(levelId, true, 1);
    return;
  }
  roundSelectList.innerHTML = "";
  const total = LEVELS[levelId]?.rounds || 5;
  for (let i = 1; i <= total; i++) {
    const btn = document.createElement("button");
    btn.className = "round-chip";
    btn.textContent = `Раунд ${i}`;
    const st = savedStates[i];
    if (st && st.result !== null) {
      btn.dataset.status = st.result ? "win" : "fail";
    }
    btn.addEventListener("click", () => {
      hideRoundSelectModal();
      startLevel(levelId, false, i);
    });
    roundSelectList.appendChild(btn);
  }
  roundSelectModal.classList.remove("hidden");
}

function hideRoundSelectModal() {
  if (roundSelectModal) {
    roundSelectModal.classList.add("hidden");
  }
}

function getOptionClassForTrack(trackId) {
  const st = roundStates[currentRound];
  if (!st || !st.options) return "";
  const opt = st.options.find((o) => o.id === trackId);
  return opt?.cssClass || "";
}

function findNextIncompleteRound() {
  if (!currentConfig) return null;
  // сначала ищем после текущего
  for (let i = currentRound + 1; i <= currentConfig.rounds; i++) {
    const st = roundStates[i];
    if (!st || st.result === null) return i;
  }
  // затем с начала
  for (let i = 1; i <= currentConfig.rounds; i++) {
    const st = roundStates[i];
    if (!st || st.result === null) return i;
  }
  return null;
}

function persistLevelProgress() {
  const cloned = cloneRoundStates(roundStates);
  savedLevelProgress[currentLevelId] = {
    roundStates: cloned,
    score,
  };
  saveRoundProgressToStorage();
}

function cloneRoundStates(states) {
  return states.map((s) =>
    s
      ? {
          ...s,
          owner: { ...s.owner },
          options: s.options ? s.options.map((o) => ({ ...o })) : [],
        }
      : s
  );
}
// завершение уровня
function finishLevel(reason) {
  clearInterval(timerId);

  const playerName = getCurrentPlayerName();
  saveGameResultToRating(playerName, score, currentLevelId);

  showEndModal(reason);
}
function isMazeMode() {
  return currentLevelId === "hard" && currentRound >= 3;
}

let mazeRunning = false; // игрок сейчас проходит лабиринт
let mazeFailed = false; // уже задел стену
let mazeCallbacks = {
  onDropToStart: null, // (trackId) => {}
  onSuccess: null, // () => {}
  onFail: null, // () => {}
};
let mazeCursorEl = null;
let mazeMouseMoveHandler = null;

// ячейка
class Cell {
  constructor(r, c) {
    this.r = r;
    this.c = c;
    this.walls = { top: true, right: true, bottom: true, left: true };
    this.visited = false;
  }
}

function generateGrid(rows, cols) {
  const grid = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      row.push(new Cell(r, c));
    }
    grid.push(row);
  }
  return grid;
}

// соседи для алгоритма генерации
function neighbors(grid, cell) {
  const list = [];
  const { r, c } = cell;
  const rows = grid.length;
  const cols = grid[0].length;

  if (r > 0 && !grid[r - 1][c].visited) list.push(grid[r - 1][c]);
  if (c < cols - 1 && !grid[r][c + 1].visited) list.push(grid[r][c + 1]);
  if (r < rows - 1 && !grid[r + 1][c].visited) list.push(grid[r + 1][c]);
  if (c > 0 && !grid[r][c - 1].visited) list.push(grid[r][c - 1]);

  return list;
}

function removeWall(a, b) {
  const dr = b.r - a.r;
  const dc = b.c - a.c;

  if (dr === -1) {
    a.walls.top = false;
    b.walls.bottom = false;
  } else if (dr === 1) {
    a.walls.bottom = false;
    b.walls.top = false;
  } else if (dc === 1) {
    a.walls.right = false;
    b.walls.left = false;
  } else if (dc === -1) {
    a.walls.left = false;
    b.walls.right = false;
  }
}

function generateMaze(rows, cols) {
  const grid = generateGrid(rows, cols);
  const stack = [];
  const start = grid[0][0];

  start.visited = true;
  stack.push(start);

  while (stack.length) {
    const current = stack[stack.length - 1];
    const neigh = neighbors(grid, current);

    if (neigh.length) {
      const next = neigh[Math.floor(Math.random() * neigh.length)];
      removeWall(current, next);
      next.visited = true;
      stack.push(next);
    } else {
      stack.pop();
    }
  }

  return grid;
}

// рендер лабиринта + наведение на стены / финиш
function renderMaze(grid, { onDropToStart, onSuccess, onFail }) {
  mazeCallbacks.onDropToStart = onDropToStart;
  mazeCallbacks.onSuccess = onSuccess;
  mazeCallbacks.onFail = onFail;

  mazeRunning = false;
  mazeFailed = false;

  const maze = document.getElementById("maze");
  maze.innerHTML = "";
  maze.style.setProperty("--cols", grid[0].length);

  const rows = grid.length;
  const cols = grid[0].length;

  if (mazeMouseMoveHandler) {
    maze.removeEventListener("mousemove", mazeMouseMoveHandler);
    maze.removeEventListener("mouseleave", hideMazeCursor);
    mazeMouseMoveHandler = null;
  }

  ensureMazeCursor(maze);

  let startCellEl = null;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = grid[r][c];
      const el = document.createElement("div");
      el.className = "cell";

      // стартовая клетка (левый верхний угол)
      if (r === 0 && c === 0) {
        el.classList.add("start");
        startCellEl = el;
      }

      // финиш (правый нижний угол)
      if (r === rows - 1 && c === cols - 1) {
        el.classList.add("finish");
        finishCellEl = el;
      }

      // стены
      ["top", "right", "bottom", "left"].forEach((side) => {
        const w = document.createElement("div");
        w.className = "wall " + side;
        if (!cell.walls[side]) {
          w.classList.add("hidden");
        }

        // касание стены во время прохождения
        w.addEventListener("mouseenter", () => {
          if (!mazeRunning || mazeFailed) return;
          mazeFailed = true;
          mazeRunning = false;
          hideMazeCursor();
          if (mazeCallbacks.onFail) mazeCallbacks.onFail();
        });

        el.appendChild(w);
      });

      // наведение на финиш — успех, если не было касания стен
      el.addEventListener("mouseenter", () => {
        if (!mazeRunning || mazeFailed) return;
        if (r === rows - 1 && c === cols - 1) {
          mazeRunning = false;
          hideMazeCursor();
          if (mazeCallbacks.onSuccess) mazeCallbacks.onSuccess();
        }
      });

      maze.appendChild(el);
    }
  }

  // dnd: бросаем след в стартовую клетку, чтобы начать
  if (startCellEl) {
    startCellEl.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.img
      startCellEl.classList.add("drag-over");
    });

    startCellEl.addEventListener("dragleave", () => {
      startCellEl.classList.remove("drag-over");
    });

    startCellEl.addEventListener("drop", (e) => {
      e.preventDefault();
      startCellEl.classList.remove("drag-over");

      const trackId = e.dataTransfer.getData("text/plain");
      if (!trackId) return;

      mazeFailed = false;
      mazeRunning = true;
      showMazeCursor();
      updateMazeCursorPosition(e, maze);

      if (mazeCallbacks.onDropToStart) {
        mazeCallbacks.onDropToStart(trackId);
      }
    });
  }

  mazeMouseMoveHandler = (e) => {
    if (!mazeRunning || mazeFailed) return;
    updateMazeCursorPosition(e, maze);
  };

  maze.addEventListener("mousemove", mazeMouseMoveHandler);
  maze.addEventListener("mouseleave", hideMazeCursor);
}

// rows, cols можно менять по желанию
function startMazePhase({
  rows = 2,
  cols = 2,
  onDropToStart,
  onSuccess,
  onFail,
}) {
  const mazeArea = document.getElementById("maze-area");
  if (mazeArea) {
    mazeArea.classList.remove("hidden");
  }
  const grid = generateMaze(rows, cols);
  renderMaze(grid, { onDropToStart, onSuccess, onFail });
}

function ensureMazeCursor(maze) {
  if (mazeCursorEl) {
    maze.appendChild(mazeCursorEl);
    return;
  }
  mazeCursorEl = document.createElement("div");
  mazeCursorEl.className = "maze-cursor hidden";
  const img = document.createElement("img");
  img.className = "maze-cursor-img";
  mazeCursorEl.appendChild(img);
  maze.appendChild(mazeCursorEl);
}

function updateMazeCursorPosition(event, maze) {
  if (!mazeCursorEl) return;
  const rect = maze.getBoundingClientRect();
  const x = event.clientX - rect.left - mazeCursorEl.offsetWidth / 2;
  const y = event.clientY - rect.top - mazeCursorEl.offsetHeight / 2;
  mazeCursorEl.style.transform = `translate(${x}px, ${y}px)`;
}

function showMazeCursor() {
  if (mazeCursorEl) {
    mazeCursorEl.classList.remove("hidden");
  }
}

function hideMazeCursor() {
  if (mazeCursorEl) {
    mazeCursorEl.classList.add("hidden");
  }
}

function setMazeCursorImage(trackId, cssClass = "") {
  if (!mazeCursorEl) return;
  const img = mazeCursorEl.querySelector(".maze-cursor-img");
  if (!img) return;
  const found = ANIMALS.find((a) => a.id === trackId);
  if (found) {
    img.src = found.track;
    Array.from(img.classList)
      .filter((c) => c.startsWith("mod-"))
      .forEach((c) => img.classList.remove(c));
    if (cssClass) {
      cssClass
        .split(" ")
        .filter(Boolean)
        .forEach((c) => img.classList.add(c));
    }
    img.classList.remove("hidden");
  }
}

function setQuestionText(questionType) {
  const el = document.getElementById("question-text");
  if (!el) return;
  if (questionType === "animal") {
    el.textContent = "Кому принадлежит этот след?";
  } else {
    el.textContent = "Выбери след, который принадлежит этому существу:";
  }
}

function updateRoundListUI() {
  if (!roundsListEl || !currentConfig) return;
  roundsListEl.innerHTML = "";
  for (let i = 1; i <= currentConfig.rounds; i++) {
    const btn = document.createElement("button");
    btn.className = "round-chip";
    btn.textContent = `Раунд ${i}`;

    const state = roundStates[i];
    const isCurrentActive = i === currentRound && viewingRound === null;
    const isViewing = i === viewingRound;

    if (isCurrentActive) btn.classList.add("active");
    if (isViewing) btn.classList.add("viewing");

    if (state && state.result !== null) {
      btn.dataset.status = state.result ? "win" : "fail";
      btn.classList.add("completed");
    }
    btn.disabled = false;
    btn.addEventListener("click", () => {
      hideEndModal();
      if (i === currentRound && (!state || state.result === null)) {
        return;
      }
      if (state && state.result === null && i === currentRound) {
        resumeCurrentRound();
      } else if (state && state.result !== null) {
        viewCompletedRound(i);
      } else {
        restartFromRound(i);
      }
    });

    roundsListEl.appendChild(btn);
  }
}

function showFeedbackOverlay(isCorrect) {
  const overlay = document.getElementById("feedback-overlay");
  const icon = document.getElementById("feedback-icon");
  if (!overlay || !icon) return;

  if (feedbackTimeoutId) clearTimeout(feedbackTimeoutId);
  if (feedbackHideTimeoutId) clearTimeout(feedbackHideTimeoutId);

  icon.textContent = isCorrect ? "✔" : "✖";
  icon.style.color = isCorrect ? "#4caf50" : "#e53935";
  icon.style.border = "3px solid " + (isCorrect ? "#4caf50" : "#e53935");

  overlay.classList.remove("hidden");
  icon.classList.remove("hide", "show", "animating");
  // restart animation
  void icon.offsetWidth;
  icon.classList.add("animating");

  feedbackTimeoutId = setTimeout(() => {
    icon.classList.remove("animating");
    feedbackHideTimeoutId = setTimeout(() => {
      overlay.classList.add("hidden");
    }, 200);
  }, 2000);
}

function playFeedbackSound(isCorrect) {
  try {
    if (!audioCtx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        audioCtx = new AudioCtx();
      }
    }
    if (!audioCtx) return;

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.value = isCorrect ? 880 : 220;
    gain.gain.value = 0.2;

    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.25);
  } catch (err) {}
}

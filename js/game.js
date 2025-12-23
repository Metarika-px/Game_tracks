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

const MODE_TITLES = {
  quiz: "Викторина",
  maze: "Марафон лабиринтов",
  reaction: "Реакция",
};

const TIME_CLEAR_BONUS = 15;

let currentLevelId = "easy";
let currentConfig = LEVELS.easy;
let currentGameMode = "quiz"; // quiz | maze | reaction

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
let instructionModal = null;
let instructionCloseBtn = null;
let confirmBtn = null;
let optionMotionFrame = null;
let optionMotionData = new Map();
let reactionTimerId = null;
let reactionSpawns = 0;
let reactionOptions = [];
let reactionLastId = null;

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
  const midMods = ["mod-rot-15", "mod-rot--15", "mod-rot-30", "mod-tilt"];
  const maskMods = ["mod-mask"];
  const blurMods = ["mod-blur"];
  const cutMods = ["mod-cut"];
  const shakeMods = ["mod-shake"];
  const spinMods = ["mod-spin"];
  const animMods = [...shakeMods, ...spinMods];
  const shapeMods = [...cutMods, ...maskMods];

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  // количество модификаторов: раунд - 1 (первый без), максимум 3
  let count = Math.max(0, round - 1);
  if (count > 3) count = 3;
  if (count === 0) return "";

  // базовый пул по сложности
  let pool = [...midMods, ...maskMods];
  if (currentLevelId !== "easy") {
    pool.push(...blurMods, ...cutMods);
  }
  // с 3-го раунда добавляем анимации с повышенным весом
  if (round >= 3) {
    pool.push(...animMods, ...animMods);
    pool.push(...shapeMods);
  }

  const seen = new Set();
  const result = [];
  while (result.length < count && pool.length) {
    const m = pick(pool);
    if (!seen.has(m)) {
      seen.add(m);
      result.push(m);
    }
  }

  // гарантируем хотя бы одну анимацию с 3-го раунда
  if (round >= 3 && !result.some((m) => animMods.includes(m))) {
    result[0] = pick(animMods);
  }

  return result.join(" ");
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

  setCurrentGameState(score, getProgressKey());
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
  instructionModal = document.getElementById("instruction-modal");
  instructionCloseBtn = document.getElementById("instruction-close-btn");
  confirmBtn = document.getElementById("confirm-answer-btn");
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
      startLevel(nextLevelToStart, true, 1, currentGameMode);
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
  if (confirmBtn) {
    confirmBtn.addEventListener("click", () => handleConfirmOption());
  }
  if (instructionCloseBtn) {
    instructionCloseBtn.addEventListener("click", hideInstructionModal);
  }

  document.addEventListener("keydown", handleHelpToggle);

  loadRoundProgressFromStorage();
  setupLevelMenu();
  initFloatingBackground();
});

function handleHelpToggle(event) {
  if (!event.key) return;
  const key = event.key.toLowerCase();
  if (key === "i" || key === "ш") {
    showInstructionModal();
  }
}

// меню выбора уровня
function setupLevelMenu() {
  const hint = document.getElementById("level-hint");
  if (hint) {
    hint.textContent = 'Чтоб открыть заметки следопыта, нажми на клавишу "I".';
  }

  const diffButtons = document.querySelectorAll("#difficulty-toggle .diff-btn");
  diffButtons.forEach((btn) => {
    btn.onclick = () => {
      diffButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const diff = btn.dataset.diff;
      if (diff && LEVELS[diff]) {
        currentLevelId = diff;
        currentConfig = LEVELS[diff];
        updateBestScoreLabel();
      }
    };
  });

  const leaderboardBtn = document.getElementById("leaderboard-btn");
  if (leaderboardBtn) {
    leaderboardBtn.onclick = () => {
      window.location.href = "results.html";
    };
  }

  const quizBtn = document.getElementById("mode-quiz-btn");
  const mazeBtn = document.getElementById("mode-maze-btn");
  const reactionBtn = document.getElementById("mode-reaction-btn");

  const modeButtons = [quizBtn, mazeBtn, reactionBtn].filter(Boolean);
  const setModeActive = (mode) => {
    modeButtons.forEach((btn) =>
      btn.classList.toggle("mode-btn-active", btn.dataset.modeBtn === mode)
    );
    if (mode && MODE_TITLES[mode]) {
      currentGameMode = mode;
      updateBestScoreLabel();
    }
  };

  modeButtons.forEach((btn) => {
    const mode = btn.dataset.modeBtn;
    btn.onclick = () => {
      setModeActive(mode);
    };
    btn.ondblclick = () => {
      setModeActive(mode);
      startGameMode(mode);
    };
  });

  setModeActive(currentGameMode);

  updateBestScoreLabel();
}
function showLevelSelectMenu() {
  stopGameplayTimers();
  const selectBlock = document.getElementById("level-select");
  const gameWrapper = document.getElementById("game-main-wrapper");
  if (selectBlock) selectBlock.classList.remove("hidden");
  if (gameWrapper) gameWrapper.classList.add("hidden");
  setupLevelMenu();
}

function startGameMode(mode) {
  currentGameMode = mode || "quiz";
  startLevel(currentLevelId, true, 1, currentGameMode);
}

function updateBestScoreLabel() {
  const label = document.getElementById("best-score-label");
  if (!label) return;
  const best = getBestScoreForLevel(currentLevelId, currentGameMode);
  const modeName = MODE_TITLES[currentGameMode] || currentGameMode;
  const levelName = LEVELS[currentLevelId]?.name || currentLevelId;
  label.textContent = `Лучший результат (${modeName}, ${levelName}): ${best}`;
}

function initFloatingBackground() {
  let container = document.getElementById("global-floating-bg");
  if (!container || !Array.isArray(ANIMALS)) return;
  container.innerHTML = "";
  const count = 14;
  for (let i = 0; i < count; i++) {
    const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
    const useTrack = Math.random() > 0.5 && animal.track;
    const src = useTrack ? animal.track : animal.src;
    if (!src) continue;
    const img = document.createElement("img");
    img.src = src;
    img.className = "floating-item";
    const size = 90 + Math.random() * 70;
    img.style.width = `${size}px`;
    img.style.height = "auto";
    const opacity = 0.25 + Math.random() * 0.35;
    img.style.opacity = opacity.toFixed(2);

    const w = window.innerWidth || 1200;
    const h = window.innerHeight || 800;

    const edge = Math.floor(Math.random() * 4); // 0 top,1 right,2 bottom,3 left
    let startX, startY, endX, endY;
    if (edge === 0) {
      startX = Math.random() * 100;
      startY = -30;
      endX = Math.random() * 100;
      endY = 130;
    } else if (edge === 1) {
      startX = 130;
      startY = Math.random() * 100;
      endX = -30;
      endY = Math.random() * 100;
    } else if (edge === 2) {
      startX = Math.random() * 100;
      startY = 130;
      endX = Math.random() * 100;
      endY = -30;
    } else {
      startX = -30;
      startY = Math.random() * 100;
      endX = 130;
      endY = Math.random() * 100;
    }

    const dxPx = ((endX - startX) / 100) * w;
    const dyPx = ((endY - startY) / 100) * h;

    img.style.left = `${startX}%`;
    img.style.top = `${startY}%`;
    img.style.setProperty("--dx", `${dxPx}px`);
    img.style.setProperty("--dy", `${dyPx}px`);
    img.style.animationDuration = `${18 + Math.random() * 14}s`;
    img.style.animationDelay = `${Math.random() * 6}s`;
    container.appendChild(img);
  }
}

function getOptionsCountForLevel(levelId) {
  if (levelId === "easy") return 3;
  if (levelId === "normal") return 4;
  return 5;
}
// старт конкретного уровня
function startLevel(
  levelId,
  reset = false,
  startFromRound = 1,
  gameMode = null
) {
  currentLevelId = levelId;
  currentConfig = LEVELS[levelId];
  if (gameMode) {
    currentGameMode = gameMode;
  }
  currentCorrectId = null;
  selectedOptionId = null;
  viewingRound = null;
  roundLocked = false;

  const progressKey = getProgressKey(levelId, currentGameMode);

  if (reset) {
    delete savedLevelProgress[progressKey];
    saveRoundProgressToStorage();
    roundStates = [];
    score = 0;
    currentRound = startFromRound;
  } else {
    const saved = savedLevelProgress[progressKey];
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
  if (levelLabel)
    levelLabel.textContent = `${
      MODE_TITLES[currentGameMode] || currentGameMode
    } / ${currentConfig.name}`;

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

// логика раунда
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
      if (!isMazeMode() && currentGameMode === "quiz") {
        applyQuizMotion(currentRound);
      } else {
        resetOptionMotion();
      }
      updateRoundListUI();
      if (isMazeMode()) {
        launchMazeForCurrentRound();
      }
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

  // стараемся не повторять вопросы в рамках уровня
  const usedOwners = roundStates
    .filter((s) => s && s.owner && s.owner.id)
    .map((s) => s.owner.id);
  const owner = getUniqueOwner(ANIMALS, usedOwners) || getRandomItem(ANIMALS);
  currentCorrectId = owner.id;
  selectedOptionId = null;
  roundLocked = false;

  const questionType = isMazeMode()
    ? "track"
    : Math.random() < 0.5
    ? "track"
    : "animal";

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
  // реакция - отдельный режим
  const isReaction = currentGameMode === "reaction";
  if (isReaction) {
    const desired = getReactionOptionsCount(currentLevelId);
    const correctOpt = options.find((o) => o.correct);
    const wrong = shuffle(options.filter((o) => !o.correct));
    const limited = [correctOpt, ...wrong.slice(0, Math.max(0, desired - 1))].filter(
      Boolean
    );
    options = shuffle(limited);
  }
  const reactionConfig = {
    ttl: getReactionTTL(currentRound, currentLevelId),
    spawnInterval: getReactionSpawnInterval(currentRound, currentLevelId),
    maxSpawns: getReactionMaxSpawns(currentRound, currentLevelId),
  };

  roundStates[currentRound] = {
    round: currentRound,
    owner,
    options,
    mode: isReaction ? "reaction" : mode,
    questionType,
    correctId: owner.id,
    selectedId: null,
    result: null,
  };
  viewingRound = null;

  renderRoundFromState(roundStates[currentRound], false, {
    reactionConfig: isReaction ? reactionConfig : null,
  });
  if (!isReaction) {
    applyQuizMotion(currentRound);
  } else {
    resetOptionMotion();
  }
  updateRoundListUI();
  persistLevelProgress();

  if (isMazeMode()) {
    launchMazeForCurrentRound();
  }
}

function renderRoundFromState(state, viewOnly = false, extra = {}) {
  if (!state) return;
  uiClearSelection();
  if (viewOnly) {
    resetOptionMotion();
  }
  const showConfirm =
    currentGameMode === "quiz" && !viewOnly && state.result === null;
  if (confirmBtn) {
    confirmBtn.disabled = !showConfirm;
    confirmBtn.style.display = showConfirm ? "inline-flex" : "none";
  }

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

  if (state.mode === "reaction" && !viewOnly) {
    startReactionFlow(state, extra?.reactionConfig || {});
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

function resetOptionMotion() {
  if (optionMotionFrame) {
    cancelAnimationFrame(optionMotionFrame);
    optionMotionFrame = null;
  }
  optionMotionData.clear();
  document.querySelectorAll(".track-option").forEach((el) => {
    el.classList.remove("option-float");
    el.style.animationDuration = "";
    el.style.animationDelay = "";
    el.style.setProperty("--dx", "");
    el.style.setProperty("--dy", "");
    el.style.left = "";
    el.style.top = "";
    el.style.transform = "";
  });
  const container = document.getElementById("tracks-container");
  if (container) {
    container.classList.remove("motion-abs");
    container.style.height = "";
  }
}

function getLevelSpeedFactor(levelId) {
  if (levelId === "easy") return 0.5;
  if (levelId === "normal") return 1;
  if (levelId === "hard") return 1.5;
  return 1;
}

function getLevelSpeedCap(levelId) {
  if (levelId === "easy") return 3;
  if (levelId === "normal") return 4;
  if (levelId === "hard") return 7;
  return 4;
}

function applyQuizMotion(roundNumber) {
  // всегда сбрасываем старое движение, чтобы скорость не накапливалась
  resetOptionMotion();
  if (currentGameMode !== "quiz") {
    return;
  }
  const options = document.querySelectorAll(".track-option");
  const container = document.getElementById("tracks-container");
  if (!container) return;

  const containerRect = container.getBoundingClientRect();
  const measuredWidth =
    container.clientWidth ||
    containerRect.width ||
    container.scrollWidth ||
    400;
  const measuredHeight = Math.max(
    container.clientHeight,
    container.offsetHeight,
    containerRect.height,
    container.scrollHeight,
    320
  );
  const initialHeight = measuredHeight;
  container.classList.add("motion-abs");
  container.style.height = `${initialHeight}px`;

  const movementEnabled = roundNumber >= 2;
  const levelSpeedFactor = getLevelSpeedFactor(currentLevelId);
  options.forEach((el) => {
    const rect = el.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    const maxX = Math.max(0, measuredWidth - w);
    const maxY = Math.max(0, measuredHeight - h);
    const startX = Math.random() * maxX;
    const startY = Math.random() * maxY;
    el.style.left = `${startX}px`;
    el.style.top = `${startY}px`;
    el.classList.remove("option-float");

    const speedCap = getLevelSpeedCap(currentLevelId);
    const speedBase = movementEnabled
      ? Math.min(speedCap, Math.max(0.8, roundNumber * levelSpeedFactor))
      : 0;
    const vx = movementEnabled ? (Math.random() * 2 - 1) * speedBase * 1.25 : 0;
    const vy = movementEnabled ? (Math.random() * 2 - 1) * speedBase * 1.25 : 0;

    optionMotionData.set(el, {
      x: startX,
      y: startY,
      vx,
      vy,
      w,
      h,
    });
  });

  const tick = () => {
    const width = container.clientWidth;
    const height = container.clientHeight;
    optionMotionData.forEach((data, el) => {
      data.x += data.vx;
      data.y += data.vy;

      if (data.x <= 0 || data.x + data.w >= width) {
        data.vx *= -1;
        data.x = Math.min(Math.max(data.x, 0), width - data.w);
      }
      if (data.y <= 0 || data.y + data.h >= height) {
        data.vy *= -1;
        data.y = Math.min(Math.max(data.y, 0), height - data.h);
      }
      el.style.left = `${data.x}px`;
      el.style.top = `${data.y}px`;
    });
    optionMotionFrame = requestAnimationFrame(tick);
  };
  optionMotionFrame = requestAnimationFrame(tick);
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
  setCurrentGameState(score, getProgressKey());
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
  let targetEl = element;
  if (!targetEl && selectedOptionId) {
    targetEl = document.querySelector(
      `.track-option[data-id="${selectedOptionId}"]`
    );
  }
  if (!targetEl) return;
  if (!selectedOptionId) {
    handleSelectOption(targetEl);
  }
  checkAnswer();
}

function checkAnswer() {
  if (roundLocked) return;
  roundLocked = true;
  if (currentGameMode === "reaction") {
    resetReactionFlow();
  }
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

  setCurrentGameState(score, getProgressKey());
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

function showEndModal(reason, extra = {}) {
  if (!endModal || !modalTitle || !modalText) return;
  const picker = document.getElementById("modal-rounds-picker");
  if (picker) picker.classList.add("hidden");

  let title = "Уровень завершён";
  if (reason === "time") title = "Время вышло";
  if (reason === "manual") title = "Уровень прерван";
  modalTitle.textContent = title;

  const levelName = currentConfig.name;
  const modeName = MODE_TITLES[currentGameMode] || currentGameMode;
  if (extra.timeBonus && extra.timeBonus > 0) {
    modalText.textContent = `Вы набрали ${score} очков в режиме "${modeName}" на сложности "${levelName}". Бонус за прохождение в отведённое время: +${extra.timeBonus}.`;
  } else {
    modalText.textContent = `Вы набрали ${score} очков в режиме "${modeName}" на сложности "${levelName}".`;
  }

  // по умолчанию следующего уровня нет
  nextLevelToStart = null;

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

// показ модалки если уровень уже был открыт
function requestRoundStart(levelId, mode = currentGameMode) {
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

  const saved = savedLevelProgress[getProgressKey(levelId, mode)];
  if (saved && saved.roundStates && saved.roundStates.length) {
    showRoundSelectModal(levelId, saved.roundStates, mode);
  } else {
    hideRoundSelectModal();
    startLevel(levelId, true, 1, mode);
  }
}

function showRoundSelectModal(
  levelId,
  savedStates = [],
  mode = currentGameMode
) {
  if (!roundSelectModal || !roundSelectList) {
    startLevel(levelId, true, 1, mode);
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
      startLevel(levelId, false, i, mode);
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

function getUniqueOwner(all, usedIds) {
  const pool = all.filter((a) => !usedIds.includes(a.id));
  if (pool.length === 0) return null;
  return getRandomItem(pool);
}

function stopGameplayTimers() {
  clearInterval(timerId);
  timerId = null;
  resetReactionFlow();
  resetOptionMotion();
  if (feedbackTimeoutId) {
    clearTimeout(feedbackTimeoutId);
    feedbackTimeoutId = null;
  }
  if (feedbackHideTimeoutId) {
    clearTimeout(feedbackHideTimeoutId);
    feedbackHideTimeoutId = null;
  }
  const overlay = document.getElementById("feedback-overlay");
  const icon = document.getElementById("feedback-icon");
  if (overlay) overlay.classList.add("hidden");
  if (icon) icon.classList.remove("animating");
}

function getMazeDimensions(round, levelId) {
  // базовые сетки по раундам и сложности
  if (levelId === "easy") {
    if (round <= 2) return { rows: 3, cols: 3 };
    if (round <= 4) return { rows: 3, cols: 4 };
    return { rows: 4, cols: 4 };
  }
  if (levelId === "normal") {
    if (round === 1) return { rows: 3, cols: 3 };
    if (round === 2) return { rows: 3, cols: 4 };
    if (round === 3) return { rows: 4, cols: 4 };
    if (round === 4) return { rows: 4, cols: 5 };
    return { rows: 5, cols: 5 };
  }
  // hard
  if (round === 1) return { rows: 3, cols: 4 };
  if (round === 2) return { rows: 4, cols: 4 };
  if (round === 3) return { rows: 4, cols: 5 };
  if (round === 4) return { rows: 5, cols: 5 };
  return { rows: 5, cols: 6 };
}

function getReactionTTL(round, levelId) {
  // время жизни одной всплывающей карточки (мс)
  if (levelId === "easy") return Math.max(1400, 2200 - round * 140);
  if (levelId === "normal") return Math.max(1100, 1900 - round * 150);
  return Math.max(900, 1700 - round * 160); // hard
}

function getReactionSpawnInterval(round, levelId) {
  // интервал между всплытиями (мс)
  if (levelId === "easy") return Math.max(1000, 1600 - round * 120);
  if (levelId === "normal") return Math.max(850, 1500 - round * 130);
  return Math.max(750, 1400 - round * 140); // hard
}

function getReactionMaxSpawns(round, levelId) {
  // сколько всплытий за раунд
  if (levelId === "easy") return 8 + round;
  if (levelId === "normal") return 9 + round;
  return 10 + round;
}

function getReactionOptionsCount(levelId) {
  if (levelId === "easy") return 3;
  if (levelId === "normal") return 4;
  return 5;
}

function showInstructionModal() {
  if (instructionModal) {
    instructionModal.classList.remove("hidden");
  }
}

function hideInstructionModal() {
  if (instructionModal) {
    instructionModal.classList.add("hidden");
  }
}

function getProgressKey(levelId = currentLevelId, mode = currentGameMode) {
  return `${mode}:${levelId}`;
}

function persistLevelProgress() {
  const cloned = cloneRoundStates(roundStates);
  const key = getProgressKey();
  savedLevelProgress[key] = {
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
  stopGameplayTimers();

  // бонус за прохождение всех раундов в пределах таймера (и не по ручному завершению)
  const allCorrect =
    currentConfig &&
    Array.from({ length: currentConfig.rounds }).every((_, idx) => {
      const st = roundStates[idx + 1];
      return st && st.result === true;
    });
  const timeBonus =
    reason === "rounds" && !timeExpired && allCorrect ? TIME_CLEAR_BONUS : 0;
  if (timeBonus > 0) {
    score += timeBonus;
    uiUpdateHeader({
      playerName: getCurrentPlayerName(),
      score,
      round: currentRound,
      totalRounds: currentConfig ? currentConfig.rounds : 0,
    });
  }

  const playerName = getCurrentPlayerName();
  const ratingKey = getProgressKey();
  saveGameResultToRating(playerName, score, ratingKey);
  updateBestScoreLabel();

  showEndModal(reason, { timeBonus });
}
function isMazeMode() {
  return currentGameMode === "maze";
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
      e.dataTransfer.img;
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
    // не наследуем модификаторы от ответов
    Array.from(img.classList)
      .filter((c) => c.startsWith("mod-"))
      .forEach((c) => img.classList.remove(c));
    img.classList.remove("hidden");
  }
}

function launchMazeForCurrentRound() {
  const { rows, cols } = getMazeDimensions(currentRound, currentLevelId);
  startMazePhase({
    rows,
    cols,
    onDropToStart: (trackId) => {
      // игрок бросил след в стартовую клетку
      selectedOptionId = trackId;
      const cssClass = getOptionClassForTrack(trackId);
      setMazeCursorImage(trackId, cssClass);
    },
    onSuccess: () => {
      // лабиринт пройден - проверяем, правильный ли след
      checkAnswer();
    },
    onFail: () => {
      // задел стену - считаем попытку провальной
      selectedOptionId = "__wrong__";
      checkAnswer();
    },
  });
}

function startReactionFlow(state, config) {
  resetReactionFlow();
  reactionOptions = state.options;
  reactionSpawns = 0;
  reactionLastId = null;
  const container = document.getElementById("tracks-container");
  if (!container) return;
  container.classList.add("motion-abs");
  const parent = container.parentElement;
  const measuredHeight =
    (parent && (parent.clientHeight || parent.offsetHeight)) ||
    container.clientHeight ||
    container.scrollHeight ||
    320;
  const measuredWidth =
    (parent && (parent.clientWidth || parent.offsetWidth)) ||
    container.clientWidth ||
    container.scrollWidth ||
    400;
  container.style.height = `${measuredHeight}px`;
  container.style.width = `${measuredWidth}px`;

  // прячем все варианты перед первым появлением, чтобы ничего не мелькало внутри контейнера
  Array.from(container.querySelectorAll(".track-option")).forEach((el) => {
    el.style.visibility = "hidden";
    el.style.opacity = "0";
    el.style.left = "-9999px";
    el.style.top = "-9999px";
    el.style.position = "absolute";
  });

  const spawn = () => {
    if (roundLocked) return;
    if (reactionSpawns >= config.maxSpawns) {
      resetReactionFlow();
      selectedOptionId = "__wrong__";
      checkAnswer();
      return;
    }
    reactionSpawns++;

    // выбираем случайную опцию, избегая повтора подряд
    let opt = reactionOptions[Math.floor(Math.random() * reactionOptions.length)];
    if (reactionOptions.length > 1) {
      let attempts = 0;
      while (opt.id === reactionLastId && attempts < 10) {
        opt = reactionOptions[Math.floor(Math.random() * reactionOptions.length)];
        attempts++;
      }
    }
    reactionLastId = opt.id;
    const el = container.querySelector(`.track-option[data-id="${opt.id}"]`);
    if (!el) return;

    // позиционируем: старт снаружи, прилёт ближе к центру
    const contRect = container.getBoundingClientRect();
    const cw = contRect.width || measuredWidth || 400;
    const ch = contRect.height || measuredHeight || 320;
    const w = el.offsetWidth > 1 ? el.offsetWidth : 140;
    const h = el.offsetHeight > 1 ? el.offsetHeight : 140;
    const targetX = cw * (0.3 + Math.random() * 0.4) - w / 2;
    const targetY = ch * (0.3 + Math.random() * 0.4) - h / 2;

    const side = Math.floor(Math.random() * 4); // 0 top,1 right,2 bottom,3 left
    let startX = targetX;
    let startY = targetY;
    const offset = Math.max(w, h, 120);
    // все карточки стартуют за пределами контейнера и влетают внутрь
    if (side === 0) {
      startX = Math.random() * cw;
      startY = -h - offset;
    } else if (side === 1) {
      startX = cw + offset;
      startY = Math.random() * ch;
    } else if (side === 2) {
      startX = Math.random() * cw;
      startY = ch + offset;
    } else {
      startX = -w - offset;
      startY = Math.random() * ch;
    }

    const isFirstSpawn = reactionSpawns === 1;

    const rotStart = -45 + Math.random() * 90;
    const rotEnd = -25 + Math.random() * 50;

    // сбросим предыдущие переходы, чтобы не было "рывков"
    el.classList.remove("reaction-active", "reaction-animated");
    el.style.visibility = "hidden";
    el.style.transition = "none";
    el.style.left = `${startX}px`;
    el.style.top = `${startY}px`;
    el.style.opacity = "0";
    el.style.transform = `rotate(${rotStart}deg)`;
    // принудительный рефлоу
    void el.offsetWidth;

    // первая карточка может быть скрыта, чтобы не мигала внутри
    if (isFirstSpawn) {
      el.style.visibility = "hidden";
      el.style.opacity = "0";
      el.style.left = `${startX}px`;
      el.style.top = `${startY}px`;
      el.style.transform = `rotate(${rotStart}deg)`;
      // запускаем следующую без задержки
      reactionTimerId = setTimeout(() => spawn(), 50);
      return;
    }

    el.style.transition = "";
    el.classList.add("reaction-animated");
    // принудительный рефлоу перед анимацией
    void el.offsetWidth;
    el.classList.add("reaction-active");
    el.style.visibility = "visible";
    el.style.left = `${targetX}px`;
    el.style.top = `${targetY}px`;
    el.style.opacity = "1";
    el.style.transform = `rotate(${rotEnd}deg)`;

    // таймер скрытия
    const hideTimer = setTimeout(() => {
      el.classList.remove("reaction-active");
      el.style.opacity = "0";
    }, config.ttl);

    // следующее всплытие
    reactionTimerId = setTimeout(() => {
      spawn();
    }, config.spawnInterval);
  };

  spawn();
}

function resetReactionFlow() {
  if (reactionTimerId) {
    clearTimeout(reactionTimerId);
    reactionTimerId = null;
  }
  reactionOptions = [];
  const container = document.getElementById("tracks-container");
  if (container) {
    Array.from(container.querySelectorAll(".track-option")).forEach((el) => {
      el.classList.remove("reaction-active");
      el.classList.remove("reaction-animated");
      el.style.opacity = "0";
      el.style.visibility = "hidden";
    });
  }
}

function setQuestionText(questionType) {
  const el = document.getElementById("question-text");
  if (!el) return;
  if (currentGameMode === "reaction") {
    el.textContent = "Реакция: кликай по правильному следу.";
  } else if (questionType === "animal") {
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

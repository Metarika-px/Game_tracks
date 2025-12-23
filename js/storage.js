function getCurrentPlayerName() {
  return localStorage.getItem("currentPlayerName") || "Гость";
}

function setCurrentPlayerName(name) {
  localStorage.setItem("currentPlayerName", name);
}

function setCurrentGameState(score, levelId) {
  localStorage.setItem("currentGameScore", String(score));
  localStorage.setItem("currentGameLevel", levelId);
}

function getCurrentGameScore() {
  const raw = localStorage.getItem("currentGameScore");
  return raw ? Number(raw) : 0;
}

function saveGameResultToRating(name, score, levelId) {
  const key = "game_results";
  const existing = JSON.parse(localStorage.getItem(key) || "[]");

  const now = new Date().toISOString();
  const prevIndex = existing.findIndex(
    (r) => r.name === name && r.level === levelId
  );

  if (prevIndex === -1) {
    existing.push({ name, score, level: levelId, date: now });
  } else if (score > existing[prevIndex].score) {
    existing[prevIndex] = { ...existing[prevIndex], score, date: now };
  }

  localStorage.setItem(key, JSON.stringify(existing));
}

function loadRating() {
  const key = "game_results";
  return JSON.parse(localStorage.getItem(key) || "[]");
}

function clearRating() {
  localStorage.removeItem("game_results");
  localStorage.removeItem("roundProgress");
}
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
function getBestScoreForLevel(levelId, mode) {
  const levelKey = mode ? `${mode}:${levelId}` : levelId;
  const data = JSON.parse(localStorage.getItem("game_results") || "[]");
  const playerName = getCurrentPlayerName();
  if (!playerName) return 0;

  let best = 0;
  for (const rec of data) {
    if (
      rec.name === playerName &&
      rec.level === levelKey &&
      rec.score > best
    ) {
      best = rec.score;
    }
  }
  return best;
}

// сумма лучших результатов игрока по уровням/режимам
function getTotalBestScore(name) {
  const data = JSON.parse(localStorage.getItem("game_results") || "[]");
  const bestPerKey = new Map();
  data.forEach((rec) => {
    if (rec.name !== name) return;
    const key = rec.level || "unknown";
    const prev = bestPerKey.get(key);
    if (!prev || rec.score > prev) {
      bestPerKey.set(key, rec.score);
    }
  });
  let total = 0;
  bestPerKey.forEach((v) => (total += v));
  return total;
}

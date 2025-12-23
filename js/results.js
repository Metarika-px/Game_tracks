const LEVEL_NAMES = {
  easy: "Легко",
  normal: "Нормально",
  hard: "Сложно",
};

document.addEventListener("DOMContentLoaded", () => {
  const tbody = document.getElementById("results-tbody");
  const currentBlock = document.getElementById("current-result-block");

  const allGames = loadRating();

  if (allGames.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5">Пока нет результатов.</td></tr>';
    currentBlock.textContent = "Сыграйте первую игру, чтобы увидеть результат.";
  } else {
    // агрегируем по игроку: сумма лучших результатов по каждому уровню (без учёта режима)
    const bestPerPlayerLevel = new Map(); // name|level => {score, date}
    allGames.forEach((rec) => {
      const levelBase = (rec.level || "").toString().split(":").pop();
      const key = `${rec.name}|${levelBase}`;
      const prev = bestPerPlayerLevel.get(key);
      if (!prev || rec.score > prev.score) {
        bestPerPlayerLevel.set(key, { score: rec.score, date: rec.date });
      }
    });

    const totalsByPlayer = new Map(); // name => {score, lastDate}
    bestPerPlayerLevel.forEach((val, key) => {
      const [name] = key.split("|");
      const prev = totalsByPlayer.get(name) || { score: 0, lastDate: null };
      const lastDate =
        !prev.lastDate || new Date(val.date) > new Date(prev.lastDate)
          ? val.date
          : prev.lastDate;
      totalsByPlayer.set(name, {
        score: prev.score + val.score,
        lastDate,
      });
    });

    const ratingSorted = Array.from(totalsByPlayer.entries())
      .map(([name, info]) => ({ name, score: info.score, date: info.lastDate }))
      .sort((a, b) => b.score - a.score);

    const lastGame = allGames[allGames.length - 1];
    const lastPlayerTotal = totalsByPlayer.get(lastGame.name);
    const formattedLastDate = new Date(lastGame.date).toLocaleString("ru-RU", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

    currentBlock.textContent = `Последняя игра: ${lastGame.name}, суммарный лучший результат: ${
      lastPlayerTotal ? lastPlayerTotal.score : lastGame.score
    }, дата: ${formattedLastDate}`;

    tbody.innerHTML = "";

    ratingSorted.forEach((rec, index) => {
      const tr = document.createElement("tr");

      const tdIndex = document.createElement("td");

      if (index === 0 || index === 1 || index === 2) {
        const span = document.createElement("span");
        span.classList.add("medal");

        if (index === 0) span.classList.add("medal-gold");
        else if (index === 1) span.classList.add("medal-silver");
        else if (index === 2) span.classList.add("medal-bronze");

        span.textContent = index + 1;
        tdIndex.appendChild(span);
      } else {
        tdIndex.textContent = index + 1;
        tdIndex.style.textAlign = "center";
      }

      const tdName = document.createElement("td");
      tdName.textContent = rec.name;

      const tdScore = document.createElement("td");
      tdScore.textContent = rec.score;

      const tdDate = document.createElement("td");
      tdDate.textContent = new Date(rec.date).toLocaleString("ru-RU", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });

      tr.appendChild(tdIndex);
      tr.appendChild(tdName);
      tr.appendChild(tdScore);
      tr.appendChild(tdDate);

      tbody.appendChild(tr);
    });
  }

  const playAgainBtn = document.getElementById("play-again-btn");
  const clearRatingBtn = document.getElementById("clear-rating-btn");

  if (playAgainBtn) {
    playAgainBtn.addEventListener("click", () => {
      window.location.href = "game.html";
    });
  }

  if (clearRatingBtn) {
    clearRatingBtn.addEventListener("click", () => {
      if (confirm("Точно очистить рейтинг?")) {
        clearRating();
        window.location.reload();
      }
    });
  }
});

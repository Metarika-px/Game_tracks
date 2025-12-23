function uiUpdateHeader({ playerName, score, round, totalRounds }) {
  const nameLabel = document.getElementById("player-name-label");
  const scoreLabel = document.getElementById("score-label");
  const roundLabel = document.getElementById("round-label");
  const totalLabel = document.getElementById("round-total-label");

  if (nameLabel) nameLabel.textContent = playerName ?? "";
  if (scoreLabel) scoreLabel.textContent = score ?? 0;
  if (roundLabel) roundLabel.textContent = round ?? 1;
  if (totalLabel) totalLabel.textContent = totalRounds ?? 1;
}

function uiShowOwner(owner, questionType = "track") {
  const img = document.getElementById("owner-image");
  const name = document.getElementById("owner-name");
  if (questionType === "animal") {
    if (img) img.src = owner.track;
    if (name) name.textContent = "Чей это след?";
  } else {
    if (img) img.src = owner.src;
    if (name) name.textContent = owner.name;
  }
}

function uiCreateTrackOption(option) {
  const img = document.createElement("img");
  img.className = "track-option";
  img.dataset.id = option.id;
  img.dataset.correct = option.correct ? "1" : "0";
  img.src = option.src;
  img.alt = "След";
  img.draggable = false;

  if (option.cssClass) {
    option.cssClass
      .split(" ")
      .filter(Boolean)
      .forEach((cls) => img.classList.add(cls));
  }

  return img;
}

function uiClearSelection() {
  const container = document.getElementById("tracks-container");
  if (container) {
    container.innerHTML = "";
  }

  document.querySelectorAll(".track-option").forEach((el) => {
    el.classList.remove("selected", "correct", "wrong", "dragging");
  });

  const optionsTitle = document.getElementById("options-title");
  const mazeArea = document.getElementById("maze-area");

  // всегда прячем лабиринт при начале нового раунда/уровня
  if (mazeArea) {
    mazeArea.classList.add("hidden");
  }

  if (optionsTitle) {
    optionsTitle.textContent = "Выберите и подтвердите ответ:";
  }
}

function uiShowAnswer(correctId) {
  const cards = document.querySelectorAll(".track-option");

  cards.forEach((el) => {
    const id = el.dataset.id;
    if (!el.classList.contains("selected")) return;
    if (id === String(correctId)) {
      el.classList.add("correct");
    } else {
      el.classList.add("wrong");
    }
  });
}

function uiRenderTrackOptions(
  options,
  onSelect,
  onConfirm,
  mode = "click",
  questionType = "track"
) {
  const container = document.getElementById("tracks-container");
  if (!container) return;

  container.innerHTML = "";
  container.style.height = "";

  const optionsTitle = document.getElementById("options-title");

  if (optionsTitle) {
    if (mode === "maze") {
      optionsTitle.textContent =
        "Выбери след и перетащи его в старт лабиринта:";
    } else if (mode === "reaction") {
      optionsTitle.textContent = "Успей кликнуть верный ответ";
    } else if (questionType === "animal") {
      optionsTitle.textContent =
        "Выберите и подтвердите ответ:";
    } else {
      optionsTitle.textContent = "Выберите и подтвердите ответ:";
    }
  }

  const rendered = [];
  options.forEach((opt) => {
    const el = uiCreateTrackOption(opt);

    // для реакции прячем и уводим элементы сразу, чтобы первое появление было из-за контейнера
    if (mode === "reaction") {
      el.style.visibility = "hidden";
      el.style.opacity = "0";
      el.style.position = "absolute";
      el.style.left = "-9999px";
      el.style.top = "-9999px";
    }

    if (mode === "click") {
      el.addEventListener("click", () => onSelect(el));
      el.addEventListener("dblclick", (e) => {
        e.preventDefault();
        e.stopPropagation();
        onConfirm(el);
      });
      // избегаем нативного drag изображения
      el.addEventListener("dragstart", (e) => e.preventDefault());
    } else if (mode === "reaction") {
      el.addEventListener("click", () => {
        onSelect(el);
        onConfirm(el);
      });
      el.addEventListener("dragstart", (e) => e.preventDefault());
    } else if (mode === "maze") {
      el.setAttribute("draggable", "true");
      el.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", opt.id);
        onSelect(el);
      });
    }

    container.appendChild(el);
    rendered.push(el);
  });

  if (mode === "click") {
    container.classList.add("random-abs");
    container.classList.remove("view-only");
    placeRandomNoOverlap(container, rendered);
  } else {
    container.classList.remove("random-abs");
    container.classList.remove("view-only");
    rendered.forEach((el) => {
      el.style.margin = "8px";
      el.style.left = "";
      el.style.top = "";
    });
  }
}

function placeRandomNoOverlap(container, elements) {
  if (!elements.length) return;

  const padding = 12;
  const attemptsMax = 120;
  const cardW = 154;
  const cardH = 144;

  const contRect = container.getBoundingClientRect();
  const contWidth = Math.max(container.clientWidth, contRect.width, 620);
  const contHeight = Math.max(container.clientHeight, contRect.height, 400);

  const colsFallback = Math.max(1, Math.floor(contWidth / (cardW + padding)));
  const rowsFallback = Math.ceil(elements.length / colsFallback);
  const computedHeight = rowsFallback * (cardH + padding) + padding;
  const finalHeight = Math.max(contHeight, computedHeight);

  const placed = [];

  elements.forEach((el, idx) => {
    let x = 0;
    let y = 0;
    let attempts = 0;
    let placedOk = false;

    while (attempts < attemptsMax && !placedOk) {
      x = Math.random() * Math.max(10, contWidth - cardW - padding);
      y = Math.random() * Math.max(10, contHeight - cardH - padding);

      const overlap = placed.some(
        (p) =>
          x < p.x + cardW + padding &&
          x + cardW + padding > p.x &&
          y < p.y + cardH + padding &&
          y + cardH + padding > p.y
      );

      if (!overlap) placedOk = true;
      attempts++;
    }

    if (!placedOk) {
      const row = Math.floor(idx / colsFallback);
      const col = idx % colsFallback;
      x = padding + col * (cardW + padding);
      y = padding + row * (cardH + padding);
    }

    el.style.margin = "0";
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;

    placed.push({ x, y });
  });

  // лёгкая итеративная "растяжка" — раздвигаем близкие карточки
  const iterations = 24;
  const minX = 0;
  const minY = 0;
    const maxX = Math.max(0, contWidth - cardW);
    const maxY = Math.max(0, finalHeight - cardH);

  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i];
        const b = placed[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const overlapX = cardW + padding - Math.abs(dx);
        const overlapY = cardH + padding - Math.abs(dy);
        if (overlapX > 0 && overlapY > 0) {
          const pushX = (overlapX / 2) * Math.sign(dx || Math.random() - 0.5);
          const pushY = (overlapY / 2) * Math.sign(dy || Math.random() - 0.5);
          a.x = clamp(a.x - pushX, minX, maxX);
          a.y = clamp(a.y - pushY, minY, maxY);
          b.x = clamp(b.x + pushX, minX, maxX);
          b.y = clamp(b.y + pushY, minY, maxY);
        }
      }
    }
  }

  placed.forEach((p, idx) => {
    const el = elements[idx];
    el.style.left = `${p.x}px`;
    el.style.top = `${p.y}px`;
  });

  container.style.height = `${finalHeight}px`;
}

function clamp(val, min, max) {
  return Math.min(max, Math.max(min, val));
}

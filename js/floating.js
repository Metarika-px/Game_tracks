function initGlobalFloatingBackground(containerId = "global-floating-bg", count = 14) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = "";

  const hasAnimals = typeof ANIMALS !== "undefined" && Array.isArray(ANIMALS);

  for (let i = 0; i < count; i++) {
    const el = document.createElement(hasAnimals ? "img" : "div");

    if (hasAnimals) {
      const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
      const useTrack = Math.random() > 0.5 && animal.track;
      const src = useTrack ? animal.track : animal.src;
      if (!src) continue;
      el.src = src;
    } else {
      el.style.background = `hsl(${Math.random() * 360}, 70%, 60%)`;
      el.style.borderRadius = "50%";
    }

    el.className = "floating-item";
    const size = 80 + Math.random() * 70;
    el.style.width = `${size}px`;
    el.style.height = hasAnimals ? "auto" : `${size}px`;
    el.style.left = `${Math.random() * 100}%`;
    el.style.top = `${Math.random() * 100}%`;
    el.style.opacity = (0.25 + Math.random() * 0.35).toFixed(2);
    el.style.setProperty("--dx", `${-300 + Math.random() * 600}px`);
    el.style.setProperty("--dy", `${-250 + Math.random() * 500}px`);
    el.style.animationDuration = `${16 + Math.random() * 12}s`;
    el.style.animationDelay = `${Math.random() * 6}s`;

    container.appendChild(el);
  }
}

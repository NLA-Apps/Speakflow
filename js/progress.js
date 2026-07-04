/* SpeakFlow — daily stats, streak & progress chart */
window.SF_PROGRESS = (function () {
  const store = window.SF_STORAGE;

  function todayKey(offsetDays) {
    const d = new Date();
    if (offsetDays) d.setDate(d.getDate() - offsetDays);
    return d.getFullYear() + "-" +
      String(d.getMonth() + 1).padStart(2, "0") + "-" +
      String(d.getDate()).padStart(2, "0");
  }

  function recordWords(words, newWords) {
    const daily = store.getDaily();
    const key = todayKey();
    const day = daily[key] || { words: 0, newWords: 0 };
    day.words += words;
    day.newWords += newWords;
    daily[key] = day;
    store.setDaily(daily);
  }

  function recordLevel(level) {
    const daily = store.getDaily();
    const key = todayKey();
    const day = daily[key] || { words: 0, newWords: 0 };
    day.level = level;
    daily[key] = day;
    store.setDaily(daily);
  }

  function todayWords() {
    return (store.getDaily()[todayKey()] || {}).words || 0;
  }

  /** Consecutive days (ending today or yesterday) meeting the daily goal */
  function streak(goal) {
    const daily = store.getDaily();
    let count = 0;
    // today counts only if goal already met; a still-running today doesn't break the streak
    let start = ((daily[todayKey()] || {}).words || 0) >= goal ? 0 : 1;
    for (let i = start; i < 730; i++) {
      const day = daily[todayKey(i)];
      if (day && day.words >= goal) count++;
      else break;
    }
    return count;
  }

  function totals() {
    const daily = store.getDaily();
    const days = Object.values(daily);
    return {
      activeDays: days.filter((d) => d.words > 0).length,
      bestDay: days.reduce((m, d) => Math.max(m, d.words || 0), 0)
    };
  }

  /** Render a 14-day bar chart as inline SVG into the given element */
  function renderChart(container, goal) {
    const daily = store.getDaily();
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const key = todayKey(i);
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push({
        key,
        label: d.getDate() + "/" + (d.getMonth() + 1),
        words: (daily[key] || {}).words || 0,
        isToday: i === 0
      });
    }

    const W = 560, H = 190;
    const padL = 8, padR = 8, padTop = 22, padBottom = 26;
    const chartH = H - padTop - padBottom;
    const maxVal = Math.max(goal * 1.3, ...days.map((d) => d.words), 10);
    const slot = (W - padL - padR) / days.length;
    const barW = Math.min(26, slot * 0.62);

    const y = (v) => padTop + chartH - (v / maxVal) * chartH;

    let bars = "";
    days.forEach((d, i) => {
      const x = padL + i * slot + (slot - barW) / 2;
      const h = Math.max(d.words > 0 ? 3 : 1.5, (d.words / maxVal) * chartH);
      const cls = "chart-bar" + (d.isToday ? " today" : d.words >= goal ? " goal-met" : "");
      bars += `<rect class="${cls}" x="${x.toFixed(1)}" y="${(padTop + chartH - h).toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="3"></rect>`;
      if (d.words > 0) {
        bars += `<text class="chart-value" x="${(x + barW / 2).toFixed(1)}" y="${(padTop + chartH - h - 5).toFixed(1)}" text-anchor="middle">${d.words}</text>`;
      }
      bars += `<text class="chart-label" x="${(x + barW / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle">${d.label}</text>`;
    });

    const goalY = y(goal).toFixed(1);
    container.innerHTML =
      `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
        <line class="chart-goal-line" x1="${padL}" y1="${goalY}" x2="${W - padR}" y2="${goalY}"></line>
        <text class="chart-label" x="${padL + 2}" y="${goalY - 4}">🎯 ${goal}</text>
        ${bars}
      </svg>`;
  }

  return { recordWords, recordLevel, todayWords, streak, totals, renderChart, todayKey };
})();

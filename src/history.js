import './styles/design-system.css';
import './styles/history.css';
import { initTheme } from './lib/theme.js';
import { requireAuth, mountUserButton, getUserId } from './lib/clerk.js';
import { getUserStats, getUserSessions } from './lib/supabase.js';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

async function init() {
  // Theme toggle — runs immediately
  initTheme('btn-theme-toggle');

  // Render empty charts immediately so page looks good
  renderAlertChart([]);
  renderDurationChart([]);

  // Load auth + data in background — NEVER block the page
  try {
    const clerk = await requireAuth();

    // Mount user button in sidebar
    const userBtnEl = document.getElementById('clerk-user-btn');
    if (userBtnEl) mountUserButton(userBtnEl);

    const userId = getUserId();

    // If no userId (no auth configured), keep empty state
    if (!userId) {
      console.warn('[History] No user ID — showing empty state');
      return;
    }

    // Fetch data
    const stats = await getUserStats(userId);
    const sessions = await getUserSessions(userId);

    // Update stat cards
    updateStatCards(stats);

    // Re-render charts with real data
    renderAlertChart(sessions);
    renderDurationChart(sessions);

    // Render table
    renderSessionTable(sessions);
  } catch (err) {
    console.warn('[History] Auth or data loading failed:', err);
  }
}

function updateStatCards(stats) {
  animateNumber('stat-total-sessions', stats.totalSessions);
  const hours = (stats.totalMinutes / 60).toFixed(1);
  const driveEl = document.getElementById('stat-drive-time');
  if (driveEl) driveEl.textContent = `${hours}h`;
  animateNumber('stat-total-alerts', stats.totalAlerts);
  const earEl = document.getElementById('stat-avg-ear');
  if (earEl) earEl.textContent = stats.avgEar.toFixed(2);
}

function animateNumber(elementId, target) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const duration = 800;
  const start = performance.now();
  const from = parseInt(el.textContent) || 0;

  function update(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    el.textContent = Math.round(from + (target - from) * eased);
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

function getChartColors() {
  const isLight = document.body.classList.contains('light-theme');
  return {
    gridColor: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.04)',
    tickColor: isLight ? '#475569' : '#6b7a99',
  };
}

function renderAlertChart(sessions) {
  const canvas = document.getElementById('chart-alerts');
  if (!canvas) return;

  const colors = getChartColors();

  // Group by day (last 7 days)
  const days = [];
  const counts = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const label = d.toLocaleDateString('en-US', { weekday: 'short' });
    days.push(label);
    const dayStr = d.toISOString().slice(0, 10);
    const dayAlerts = sessions
      .filter(s => s.created_at && s.created_at.slice(0, 10) === dayStr)
      .reduce((sum, s) => sum + (s.alert_count || 0), 0);
    counts.push(dayAlerts);
  }

  new Chart(canvas, {
    type: 'line',
    data: {
      labels: days,
      datasets: [{
        label: 'Alerts',
        data: counts,
        borderColor: '#ff3b3b',
        backgroundColor: 'rgba(255, 59, 59, 0.1)',
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointBackgroundColor: '#ff3b3b',
        pointBorderWidth: 0,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          ticks: { color: colors.tickColor, font: { family: 'Inter', size: 11 } },
          grid: { color: colors.gridColor },
          border: { display: false }
        },
        y: {
          beginAtZero: true,
          ticks: { color: colors.tickColor, font: { family: 'JetBrains Mono', size: 11 } },
          grid: { color: colors.gridColor },
          border: { display: false }
        }
      }
    }
  });
}

function renderDurationChart(sessions) {
  const canvas = document.getElementById('chart-duration');
  if (!canvas) return;

  const colors = getChartColors();

  const recent = sessions.slice(0, 10).reverse();
  const labels = recent.map((s, i) => `#${i + 1}`);
  const durations = recent.map(s => parseFloat((s.duration_minutes || 0).toFixed(1)));

  new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Duration (min)',
        data: durations,
        backgroundColor: 'rgba(0, 255, 136, 0.25)',
        borderColor: '#00ff88',
        borderWidth: 1,
        borderRadius: 4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          ticks: { color: colors.tickColor, font: { family: 'Inter', size: 11 } },
          grid: { color: colors.gridColor },
          border: { display: false }
        },
        y: {
          beginAtZero: true,
          ticks: { color: colors.tickColor, font: { family: 'JetBrains Mono', size: 11 } },
          grid: { color: colors.gridColor },
          border: { display: false }
        }
      }
    }
  });
}

function renderSessionTable(sessions) {
  const tbody = document.getElementById('sessions-table-body');
  if (!tbody) return;

  if (!sessions.length) {
    // Keep the default empty state from HTML
    return;
  }

  // Update count badge
  const badge = document.getElementById('session-count');
  if (badge) badge.textContent = sessions.length;

  tbody.innerHTML = sessions.map(s => {
    const date = new Date(s.created_at).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    const duration = `${(s.duration_minutes || 0).toFixed(1)} min`;
    const alertCount = s.alert_count || 0;
    const status = alertCount > 3 ? 'Risky' : alertCount > 0 ? 'Caution' : 'Safe';
    const statusClass = status === 'Risky' ? 'status-danger' : status === 'Caution' ? 'status-warning' : 'status-safe';
    return `<tr>
      <td>${date}</td>
      <td class="font-mono">${duration}</td>
      <td class="font-mono">${alertCount}</td>
      <td class="font-mono">${s.yawn_count || 0}</td>
      <td class="font-mono">${(s.avg_ear || 0).toFixed(2)}</td>
      <td><span class="status-badge ${statusClass}">${status}</span></td>
    </tr>`;
  }).join('');
}

init();

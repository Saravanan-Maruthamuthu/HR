/* =====================================================================
   app.js — Shared API Client, Utilities, and Session Helper
   ===================================================================== */

window.App = (() => {
  const API_BASE = '';  // relative — Flask serves at root

  // ── API ──────────────────────────────────────────────────────────────

  async function getQuestions(role, difficulty, count) {
    const url = `${API_BASE}/api/questions?role=${encodeURIComponent(role)}&difficulty=${encodeURIComponent(difficulty)}&count=${count}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch questions');
    return res.json();
  }

  async function analyzeAnswer(question, transcript, keywords) {
    const res = await fetch(`${API_BASE}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, transcript, keywords }),
    });
    if (!res.ok) throw new Error('Analysis failed');
    return res.json();
  }

  async function analyzeBatch(qaPairs) {
    const res = await fetch(`${API_BASE}/api/analyze/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ qa_pairs: qaPairs }),
    });
    if (!res.ok) throw new Error('Batch analysis failed');
    return res.json();
  }



  async function getApiStatus() {
    const res = await fetch(`${API_BASE}/api/status`);
    return res.json();
  }

  // ── Session Storage ───────────────────────────────────────────────────

  function saveConfig(config) {
    sessionStorage.setItem('interviewConfig', JSON.stringify(config));
  }

  function getConfig() {
    const raw = sessionStorage.getItem('interviewConfig');
    return raw ? JSON.parse(raw) : null;
  }

  function saveSession(data) {
    sessionStorage.setItem('interviewSession', JSON.stringify(data));
  }

  function getSession() {
    const raw = sessionStorage.getItem('interviewSession');
    return raw ? JSON.parse(raw) : null;
  }

  function clearSession() {
    sessionStorage.removeItem('interviewConfig');
    sessionStorage.removeItem('interviewSession');
  }

  // ── Utilities ─────────────────────────────────────────────────────────

  function showToast(msg, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }
    const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${msg}</span>`;
    container.appendChild(el);
    setTimeout(() => {
      el.style.animation = 'toast-in 0.3s var(--ease) reverse';
      setTimeout(() => el.remove(), 280);
    }, 3500);
  }

  function getGrade(score) {
    if (score >= 90) return { grade: 'A+', color: '#10b981', label: 'Outstanding' };
    if (score >= 80) return { grade: 'A', color: '#3b82f6', label: 'Excellent' };
    if (score >= 70) return { grade: 'B', color: '#818cf8', label: 'Good' };
    if (score >= 60) return { grade: 'C', color: '#f59e0b', label: 'Average' };
    if (score >= 50) return { grade: 'D', color: '#f97316', label: 'Below Average' };
    return { grade: 'F', color: '#ef4444', label: 'Needs Improvement' };
  }

  const DIMENSIONS = [
    { key: 'communication', label: 'Communication', icon: '🗣', barClass: 'bar-communication', cardColor: '#3b82f6' },
    { key: 'confidence', label: 'Confidence', icon: '💪', barClass: 'bar-confidence', cardColor: '#8b5cf6' },
    { key: 'fluency', label: 'Fluency', icon: '🌊', barClass: 'bar-fluency', cardColor: '#06b6d4' },
    { key: 'clarity', label: 'Clarity', icon: '🎯', barClass: 'bar-clarity', cardColor: '#10b981' },
    { key: 'relevance', label: 'Relevance', icon: '📌', barClass: 'bar-relevance', cardColor: '#f59e0b' },
  ];

  function getScoreClass(score) {
    if (score >= 80) return 'score-excellent';
    if (score >= 65) return 'score-good';
    if (score >= 45) return 'score-average';
    return 'score-poor';
  }

  function roleName(roleKey) {
    const map = {
      software_engineer: 'Software Engineer',
      product_manager: 'Product Manager',
      data_scientist: 'Data Scientist',
      marketing: 'Marketing',
      hr: 'Human Resources',
      general: 'General',
    };
    return map[roleKey] || roleKey;
  }

  return {
    getQuestions, analyzeAnswer, analyzeBatch, getApiStatus,
    saveConfig, getConfig, saveSession, getSession, clearSession,
    showToast, getGrade, getScoreClass, DIMENSIONS, roleName,
  };
})();

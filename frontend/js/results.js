/* =====================================================================
   results.js — Results Page Renderer
   ===================================================================== */

(function () {
    const session = App.getSession();
    if (!session) { window.location.href = '/'; return; }

    const { candidateName, jobDescription, sessionId, questions, averages, overall, completedAt } = session;

    // ── Set header info ─────────────────────────────────────────────────
    document.getElementById('candidate-name-badge').textContent = `👤 ${candidateName}`;
    const answeredCount = questions.filter(q => q.transcript && q.transcript.trim()).length;
    const jdShort = jobDescription ? jobDescription.substring(0, 80) + (jobDescription.length > 80 ? '…' : '') : 'Custom JD';
    document.getElementById('session-info').innerHTML =
        `JD: <em style="color:var(--text-secondary)">${jdShort}</em> &nbsp;|&nbsp; Questions: <strong>${questions.length}</strong> &nbsp;|&nbsp; Answered: <strong>${answeredCount}</strong>`;
    if (completedAt) {
        const d = new Date(completedAt);
        document.getElementById('session-time').textContent = 'Completed: ' + d.toLocaleTimeString();
    }

    // ── Score Ring ──────────────────────────────────────────────────────
    const grade = App.getGrade(overall);
    const circumference = 503;
    const offset = circumference - (overall / 100) * circumference;

    document.getElementById('ring-score-num').textContent = overall;
    document.getElementById('ring-grade').textContent = grade.grade;
    document.getElementById('ring-grade').style.color = grade.color;
    document.getElementById('ring-label').textContent = grade.label;

    setTimeout(() => {
        const fill = document.getElementById('score-ring-fill');
        fill.style.strokeDashoffset = offset;
    }, 200);

    // ── Metric Cards ────────────────────────────────────────────────────
    App.DIMENSIONS.forEach(d => {
        const score = averages[d.key] ?? 0;
        const el = document.getElementById(`metric-card-${d.key}`);
        if (!el) return;
        el.style.borderLeftColor = d.cardColor;
        el.querySelector('.large-score-num').textContent = score;
        el.querySelector('.large-score-num').style.color = d.cardColor;
        el.querySelector('.result-bar-fill').style.background = d.cardColor;
        setTimeout(() => {
            el.querySelector('.result-bar-fill').style.width = score + '%';
        }, 300);
    });

    // ── Charts ──────────────────────────────────────────────────────────
    const radarLabels = App.DIMENSIONS.map(d => d.label);
    const radarScores = App.DIMENSIONS.map(d => averages[d.key] ?? 0);

    // Only include answered questions in bar chart
    const answeredQs = questions.filter(q => q.transcript && q.transcript.trim());

    setTimeout(() => {
        Charts.drawRadar('radar-canvas', radarScores, radarLabels);

        const barLabels = answeredQs.map((q, i) => `Q${questions.indexOf(q) + 1}`);
        const barScores = answeredQs.map(q => {
            const s = q.scores || {};
            return Math.round((s.communication + s.confidence + s.fluency + s.clarity + s.relevance) / 5) || 0;
        });
        Charts.drawBar('bar-canvas', barLabels, [barScores]);
    }, 400);

    // ── Transcript ──────────────────────────────────────────────────────
    const transcriptList = document.getElementById('transcript-list');

    // Only show questions that have an answer
    const answered = questions.filter(q => q.transcript && q.transcript.trim());
    const skipped = questions.length - answered.length;

    if (skipped > 0) {
        const note = document.createElement('div');
        note.style.cssText = 'font-size:0.83rem;color:var(--text-muted);padding:8px 0 16px;font-style:italic';
        note.textContent = `⚠️ ${skipped} question${skipped > 1 ? 's were' : ' was'} skipped or unanswered and ${skipped > 1 ? 'are' : 'is'} not shown below.`;
        transcriptList.appendChild(note);
    }

    answered.forEach((q, idx) => {
        // Find original Q number
        const qNum = questions.indexOf(q) + 1;
        const s = q.scores || {};
        const avgScore = Math.round((s.communication + s.confidence + s.fluency + s.clarity + s.relevance) / 5) || 0;
        const scoreClass = App.getScoreClass(avgScore);

        const div = document.createElement('div');
        div.className = 'qa-item';
        div.innerHTML = `
      <div class="qa-question">
        <span style="color:var(--text-muted);font-weight:700">Q${qNum}</span>
        ${q.text}
        <span class="score-badge ${scoreClass}" style="margin-left:auto;flex-shrink:0">${avgScore}</span>
      </div>
      <div class="qa-answer">${q.transcript}</div>
      ${q.scores?.feedback ? `<div style="font-size:0.83rem;color:var(--accent-cyan);margin-top:10px;padding-left:24px;font-style:italic">💡 ${q.scores.feedback}</div>` : ''}
      <div class="qa-scores">
        ${App.DIMENSIONS.map(d => `<span class="qa-score-chip">${d.icon} ${d.label}: <strong>${s[d.key] ?? '—'}</strong></span>`).join('')}
      </div>`;
        transcriptList.appendChild(div);
    });

    if (answered.length === 0) {
        transcriptList.innerHTML = '<div style="color:var(--text-muted);padding:24px 0;text-align:center;">No answers were recorded during this session.</div>';
    }

    // ── Facial Expression Report ─────────────────────────────────────────
    const EXPR_CONFIG = {
        happy: { icon: '😊', label: 'Happy', color: '#10b981' },
        neutral: { icon: '😐', label: 'Neutral', color: '#3b82f6' },
        surprised: { icon: '😮', label: 'Surprised', color: '#f59e0b' },
        fearful: { icon: '😰', label: 'Fearful', color: '#8b5cf6' },
        sad: { icon: '😢', label: 'Sad', color: '#64748b' },
        angry: { icon: '😠', label: 'Angry', color: '#ef4444' },
        disgusted: { icon: '🤢', label: 'Disgusted', color: '#78716c' },
    };

    const EXPR_TIPS = {
        happy: { color: '#10b981', text: '🎉 Excellent! You maintained a warm, positive expression throughout. This builds great rapport with interviewers.' },
        neutral: { color: '#3b82f6', text: '💡 Try smiling more naturally — warmth and enthusiasm leave a lasting impression on interviewers.' },
        surprised: { color: '#f59e0b', text: '😮 You appeared frequently surprised. Practice staying composed and calm when faced with unexpected questions.' },
        fearful: { color: '#8b5cf6', text: '🧘 Nervousness was visible. Try slow deep breathing before and during interviews to project calm confidence.' },
        sad: { color: '#64748b', text: '⚡ You appeared low-energy. Work on projecting enthusiasm — sit up straight and engage with animated expressions.' },
        angry: { color: '#ef4444', text: '😌 Tension was detected in your expression. Consciously relax your jaw and brow muscles during interviews.' },
        disgusted: { color: '#78716c', text: '🎭 Try to maintain a neutral or positive expression consistently, even when questions feel uncomfortable.' },
    };

    function renderFaceExpressions() {
        const face = session.faceExpressions;
        const card = document.getElementById('face-results-card');

        if (!face || face.frames === 0) {
            card.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:32px;font-style:italic;">📷 Camera data unavailable — facial expression analysis was not recorded.</div>';
            return;
        }

        const cfg = EXPR_CONFIG[face.dominant] || EXPR_CONFIG.neutral;
        const tip = EXPR_TIPS[face.dominant] || EXPR_TIPS.neutral;

        // Dominant emoji + label
        document.getElementById('face-dominant-emoji').textContent = cfg.icon;
        document.getElementById('face-dominant-label').textContent = cfg.label;
        document.getElementById('face-dominant-label').style.color = cfg.color;

        // Positivity score
        const posEl = document.getElementById('face-positivity-score');
        posEl.textContent = face.positivityScore;
        posEl.style.color = face.positivityScore >= 60 ? '#10b981' : face.positivityScore >= 35 ? '#f59e0b' : '#ef4444';
        posEl.style.borderColor = posEl.style.color;

        // Per-emotion bars
        const grid = document.getElementById('face-expr-grid');
        grid.innerHTML = '';
        const EXPR_KEYS = ['happy', 'neutral', 'surprised', 'fearful', 'sad', 'angry', 'disgusted'];
        EXPR_KEYS.forEach(key => {
            const pct = face.averages[key] ?? 0;
            const c = EXPR_CONFIG[key];
            const row = document.createElement('div');
            row.className = 'face-expr-result-row';
            row.innerHTML = `
                <span class="face-expr-result-label">${c.icon} ${c.label}</span>
                <div class="face-expr-result-bar-bg">
                    <div class="face-expr-result-bar-fill" style="background:${c.color};width:0%" data-target="${pct}"></div>
                </div>
                <span class="face-expr-result-val">${pct}%</span>`;
            grid.appendChild(row);
        });
        // Animate bars after a tick
        setTimeout(() => {
            grid.querySelectorAll('.face-expr-result-bar-fill').forEach(el => {
                el.style.width = el.dataset.target + '%';
            });
        }, 350);

        // Suggestion tip
        const tipBox = document.getElementById('face-tip-box');
        tipBox.style.borderLeftColor = tip.color;
        tipBox.textContent = tip.text;
    }

    renderFaceExpressions();

    // ── Buttons ──────────────────────────────────────────────────────────
    document.getElementById('new-interview-btn').addEventListener('click', () => {
        App.clearSession();
        window.location.href = '/';
    });

    document.getElementById('print-btn').addEventListener('click', () => window.print());

    // ── Helpers ──────────────────────────────────────────────────────────
    function titleCase(s) {
        if (!s) return '';
        return s.charAt(0).toUpperCase() + s.slice(1);
    }

})();


/* =====================================================================
   charts.js — Canvas Radar Chart + Bar Chart
   ===================================================================== */

window.Charts = (() => {

    // ── Radar Chart ────────────────────────────────────────────────────

    function drawRadar(canvasId, scores, labels) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        const dpr = window.devicePixelRatio || 1;
        const size = Math.min(canvas.parentElement.clientWidth, 320);
        canvas.width = size * dpr;
        canvas.height = size * dpr;
        canvas.style.width = size + 'px';
        canvas.style.height = size + 'px';

        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.scale(dpr, dpr);

        const cx = size / 2, cy = size / 2;
        const radius = size * 0.35;
        const n = labels.length;
        const angleStep = (Math.PI * 2) / n;
        const startAngle = -Math.PI / 2;

        ctx.clearRect(0, 0, size, size);

        // Grid rings
        for (let r = 1; r <= 5; r++) {
            ctx.beginPath();
            for (let i = 0; i < n; i++) {
                const angle = startAngle + i * angleStep;
                const x = cx + (radius * r / 5) * Math.cos(angle);
                const y = cy + (radius * r / 5) * Math.sin(angle);
                i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.strokeStyle = 'rgba(255,255,255,0.06)';
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        // Axes
        for (let i = 0; i < n; i++) {
            const angle = startAngle + i * angleStep;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle));
            ctx.strokeStyle = 'rgba(255,255,255,0.08)';
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        // Data polygon (animated)
        const values = scores.map(s => Math.max(0, Math.min(100, s)) / 100);
        let frame = 0;
        const totalFrames = 40;

        function animateRadar() {
            ctx.clearRect(0, 0, size, size);

            // Redraw grid
            for (let r = 1; r <= 5; r++) {
                ctx.beginPath();
                for (let i = 0; i < n; i++) {
                    const angle = startAngle + i * angleStep;
                    const x = cx + (radius * r / 5) * Math.cos(angle);
                    const y = cy + (radius * r / 5) * Math.sin(angle);
                    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
                }
                ctx.closePath();
                ctx.strokeStyle = 'rgba(255,255,255,0.06)';
                ctx.lineWidth = 1;
                ctx.stroke();
            }
            for (let i = 0; i < n; i++) {
                const angle = startAngle + i * angleStep;
                ctx.beginPath();
                ctx.moveTo(cx, cy);
                ctx.lineTo(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle));
                ctx.strokeStyle = 'rgba(255,255,255,0.08)';
                ctx.lineWidth = 1;
                ctx.stroke();
            }

            const progress = Math.min(frame / totalFrames, 1);
            const eased = 1 - Math.pow(1 - progress, 3);

            // Filled area
            ctx.beginPath();
            for (let i = 0; i < n; i++) {
                const angle = startAngle + i * angleStep;
                const r = radius * values[i] * eased;
                const x = cx + r * Math.cos(angle);
                const y = cy + r * Math.sin(angle);
                i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            }
            ctx.closePath();
            const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
            grad.addColorStop(0, 'rgba(59,130,246,0.35)');
            grad.addColorStop(1, 'rgba(139,92,246,0.15)');
            ctx.fillStyle = grad;
            ctx.fill();
            ctx.strokeStyle = 'rgba(99,160,255,0.8)';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Data point dots
            for (let i = 0; i < n; i++) {
                const angle = startAngle + i * angleStep;
                const r = radius * values[i] * eased;
                const x = cx + r * Math.cos(angle);
                const y = cy + r * Math.sin(angle);
                ctx.beginPath();
                ctx.arc(x, y, 5, 0, Math.PI * 2);
                ctx.fillStyle = '#60a5fa';
                ctx.fill();
                ctx.strokeStyle = 'white';
                ctx.lineWidth = 1.5;
                ctx.stroke();
            }

            // Labels
            for (let i = 0; i < n; i++) {
                const angle = startAngle + i * angleStep;
                const labelR = radius + 28;
                const x = cx + labelR * Math.cos(angle);
                const y = cy + labelR * Math.sin(angle);
                ctx.font = '600 11px Inter, sans-serif';
                ctx.fillStyle = 'rgba(148,163,184,0.9)';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(labels[i], x, y);

                // Score value
                ctx.font = '700 12px Roboto Mono, monospace';
                ctx.fillStyle = '#93c5fd';
                ctx.fillText(Math.round(scores[i]), x, y + 14);
            }

            if (frame < totalFrames) {
                frame++;
                requestAnimationFrame(animateRadar);
            }
        }
        animateRadar();
    }

    // ── Bar Chart ──────────────────────────────────────────────────────

    function drawBar(canvasId, labels, datasets) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        const dpr = window.devicePixelRatio || 1;
        const w = canvas.parentElement.clientWidth;
        const h = 220;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';

        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.scale(dpr, dpr);

        const paddingL = 30, paddingR = 20, paddingT = 20, paddingB = 50;
        const chartW = w - paddingL - paddingR;
        const chartH = h - paddingT - paddingB;
        const n = labels.length;
        const barGroupW = chartW / n;
        const barW = Math.min(barGroupW * 0.6, 36);
        const colors = ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b'];

        ctx.clearRect(0, 0, w, h);

        // Y grid lines
        for (let i = 0; i <= 4; i++) {
            const y = paddingT + (chartH * i / 4);
            ctx.beginPath();
            ctx.moveTo(paddingL, y);
            ctx.lineTo(paddingL + chartW, y);
            ctx.strokeStyle = 'rgba(255,255,255,0.04)';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.font = '10px Roboto Mono, monospace';
            ctx.fillStyle = 'rgba(148,163,184,0.5)';
            ctx.textAlign = 'right';
            ctx.fillText(100 - i * 25, paddingL - 6, y + 4);
        }

        // Animate bars
        let frame = 0, totalFrames = 40;

        function animateBars() {
            ctx.clearRect(paddingL, paddingT, chartW, chartH + 1);

            // Redraw grid
            for (let i = 0; i <= 4; i++) {
                const y = paddingT + (chartH * i / 4);
                ctx.beginPath();
                ctx.moveTo(paddingL, y);
                ctx.lineTo(paddingL + chartW, y);
                ctx.strokeStyle = 'rgba(255,255,255,0.04)';
                ctx.lineWidth = 1;
                ctx.stroke();
            }

            const progress = Math.min(frame / totalFrames, 1);
            const eased = 1 - Math.pow(1 - progress, 3);

            for (let i = 0; i < n; i++) {
                const gx = paddingL + i * barGroupW + barGroupW / 2;
                const val = (datasets[0][i] || 0) * eased;
                const barH = (val / 100) * chartH;
                const x = gx - barW / 2;
                const y = paddingT + chartH - barH;

                // Gradient bar
                const grad = ctx.createLinearGradient(x, y, x, y + barH);
                const col = colors[i % colors.length];
                grad.addColorStop(0, col + 'ff');
                grad.addColorStop(1, col + '44');
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.roundRect(x, y, barW, barH, [4, 4, 0, 0]);
                ctx.fill();

                // Label
                ctx.font = '600 10px Inter, sans-serif';
                ctx.fillStyle = 'rgba(148,163,184,0.8)';
                ctx.textAlign = 'center';
                ctx.fillText(labels[i], gx, h - paddingB + 16);

                // Value on top
                if (progress > 0.8) {
                    ctx.font = '700 11px Roboto Mono, monospace';
                    ctx.fillStyle = col;
                    ctx.fillText(Math.round(datasets[0][i]), gx, y - 6);
                }
            }

            if (frame < totalFrames) {
                frame++;
                requestAnimationFrame(animateBars);
            }
        }
        animateBars();
    }

    return { drawRadar, drawBar };
})();

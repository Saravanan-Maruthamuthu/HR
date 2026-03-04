/* =====================================================================
   interview.js — Interview Session State Machine Controller
   ===================================================================== */

// Expose face expression scores so interview.js can blend them into Confidence
window.faceExpressionScore = null; // set by face detection script

(async function () {
    // ── Guard: need config ─────────────────────────────────────────────
    const config = App.getConfig();
    if (!config) { window.location.href = '/'; return; }

    const { candidateName, jobDescription, sessionId } = config;

    // ── State ──────────────────────────────────────────────────────────
    let questions = [];
    let currentQIndex = 0;
    let transcripts = [];         // finalised transcript per question
    let currentTranscript = '';
    let liveScores = {};
    let isMuted = false;
    let audioContext = null, analyserNode = null, waveformRAF = null;
    let isAiSpeaking = false;
    let isWaitingForNext = false;
    let transcriptQueue = [];
    let displayedTranscript = '';
    let typewriterInterval = null;
    let silenceLeft = 5;
    let silenceCountdown = null;
    let autoNextInterval = null;

    // ── DOM refs ───────────────────────────────────────────────────────
    const els = {
        steps: document.querySelectorAll('.step-dot'),
        qCounter: document.getElementById('q-counter'),
        questionText: document.getElementById('question-text'),
        aiStatusDot: document.getElementById('ai-status-dot'),
        aiStatusText: document.getElementById('ai-status-text'),
        aiAvatarRing: document.getElementById('ai-avatar-ring'),
        transcriptBox: document.getElementById('transcript-box'),
        waveCanvas: document.getElementById('waveform-canvas'),
        submitBtn: document.getElementById('submit-answer-btn'),
        nextQuestionBtn: document.getElementById('next-question-btn'),
        skipBtn: document.getElementById('skip-btn'),
        micBtn: document.getElementById('mic-btn'),
        silenceEl: document.getElementById('silence-timer'),
        candName: document.getElementById('candidate-name-display'),
        roleEl: document.getElementById('role-display'),
        analyzingOverlay: document.getElementById('analyzing-overlay'),
        webcamVideo: document.getElementById('webcam-video'),
        replayBtn: document.getElementById('replay-btn'),
        captureFaceBtn: document.getElementById('capture-face-btn'),
        webcamWrapper: document.getElementById('webcam-wrapper'),
        faceAiPlaceholder: document.getElementById('face-ai-placeholder'),
        avatarSpeakingLabel: document.getElementById('avatar-speaking-label'),
        dominantExpr: document.getElementById('dominant-expr'),
        faceCountText: document.getElementById('face-count-text')
    };

    // Metric bars
    const metricEls = {};
    App.DIMENSIONS.forEach(d => {
        metricEls[d.key] = {
            fill: document.getElementById(`bar-${d.key}`),
            score: document.getElementById(`score-${d.key}`),
        };
        liveScores[d.key] = 0;
    });

    // ── Init ───────────────────────────────────────────────────────────
    els.candName.textContent = candidateName;
    // Show short JD excerpt in the header instead of a role name
    const jdShort = jobDescription ? jobDescription.substring(0, 60) + (jobDescription.length > 60 ? '…' : '') : 'Custom JD';
    els.roleEl.textContent = jdShort;

    // Check speech support
    if (!SpeechRec.isSupported()) {
        App.showToast('Speech recognition not supported. Please use Chrome or Edge.', 'error');
        return;
    }

    // Fetch questions from backend (Job Description → Gemini generated)
    try {
        const res = await fetch('/api/questions/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ job_description: jobDescription, count: 10 }),
        });
        if (!res.ok) throw new Error('Server error: ' + res.status);
        const data = await res.json();
        questions = data.questions;
    } catch (e) {
        App.showToast('Failed to generate questions: ' + e.message, 'error');
        return;
    }

    // ── Media Initialization (Webcam & Mic) ──────────────────────────
    async function requestMediaWithRetry(constraints, maxRetries = 3, delay = 1000) {
        let lastErr;
        for (let i = 0; i < maxRetries; i++) {
            try {
                return await navigator.mediaDevices.getUserMedia(constraints);
            } catch (err) {
                lastErr = err;
                console.warn(`Media request failed (${i + 1}/${maxRetries}):`, err.message || err.name);
                if (i < maxRetries - 1) {
                    await new Promise(res => setTimeout(res, delay));
                }
            }
        }
        throw lastErr;
    }

    async function initMedia() {
        // We try to request both video and audio in one go to avoid hardware contention timeouts
        // especially on Windows/Chrome. We add a retry loop because Webcams often throw 'Could not start video source'
        // if they take too long to wake up or are briefly locked by another process.
        try {
            const stream = await requestMediaWithRetry({ video: true, audio: true }, 3, 1000);

            // Success: Handle both
            if (els.webcamVideo) {
                els.webcamVideo.srcObject = stream;
            }

            // The stream contains both tracks. We use it for waveform but 
            // the transcript system (SpeechRec) handles its own mic access usually.
            // However, we can pass this audio track to setupWaveform.
            setupWaveform(stream);

            if (els.dominantExpr) els.dominantExpr.textContent = 'Camera Active';
            if (els.faceStatus) els.faceStatus.textContent = 'Initializing Face AI...';

        } catch (err) {
            console.warn('Combined media request failed after retries, trying fallbacks:', err.message || err);

            // Fallback 1: Try video only with retry
            try {
                const videoStream = await requestMediaWithRetry({ video: true, audio: false }, 2, 1000);
                if (els.webcamVideo) els.webcamVideo.srcObject = videoStream;
                if (els.dominantExpr) els.dominantExpr.textContent = 'Camera Active (No Audio Waveform)';
            } catch (vErr) {
                console.warn('Webcam fallback failed:', vErr.message || vErr);
                if (els.dominantExpr) els.dominantExpr.textContent = 'Camera Unavailable';
                if (els.faceCountText) els.faceCountText.textContent = 'Hardware Error';
                App.showToast('Camera not available. Facial analysis will be disabled.', 'warning');
            }

            // Fallback 2: Try audio only for waveform
            try {
                const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
                setupWaveform(audioStream);
            } catch (aErr) {
                console.warn('Mic fallback for waveform failed:', aErr.message || aErr);
                App.showToast('Microphone for waveform not available.', 'warning');
            }
        }
    }

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        initMedia();
    } else {
        const msg = window.isSecureContext ? 'Media APIs not supported.' : 'Media requires HTTPS or localhost.';
        console.warn(msg);
        if (els.dominantExpr) els.dominantExpr.textContent = 'Camera Locked (Insecure context)';
    }

    // Start first question
    buildProgressDots();
    await startQuestion(0);

    // ── Progress Dots ──────────────────────────────────────────────────
    function buildProgressDots() {
        const container = document.querySelector('.progress-steps');
        container.innerHTML = '';
        questions.forEach((_, i) => {
            const dot = document.createElement('div');
            dot.className = 'step-dot';
            dot.id = `step-dot-${i}`;
            container.appendChild(dot);
        });
        els.qCounter.textContent = `Q1 of ${questions.length}`;
    }

    function updateProgressDots(idx) {
        questions.forEach((_, i) => {
            const dot = document.getElementById(`step-dot-${i}`);
            if (!dot) return;
            dot.className = 'step-dot' + (i < idx ? ' done' : i === idx ? ' active' : '');
        });
        els.qCounter.textContent = `Q${idx + 1} of ${questions.length}`;
    }

    // ── Question Flow ──────────────────────────────────────────────────
    async function startQuestion(idx) {
        currentQIndex = idx;
        SpeechRec.stop();
        SpeechRec.reset();
        currentTranscript = '';
        displayedTranscript = '';
        transcriptQueue = [];
        if (typewriterInterval) {
            clearInterval(typewriterInterval);
            typewriterInterval = null;
        }
        transcripts[idx] = transcripts[idx] || '';
        isWaitingForNext = false;

        // Buttons are hidden in UI, so we only need to manage intervals
        if (autoNextInterval) {
            clearInterval(autoNextInterval);
            autoNextInterval = null;
        }

        // Both buttons always visible — Submit enabled, Next disabled
        els.submitBtn.textContent = '✅ Submit Answer';
        els.submitBtn.disabled = false;
        els.submitBtn.style.display = '';
        els.nextQuestionBtn.textContent = 'Next Question ⏭';
        els.nextQuestionBtn.disabled = true;
        els.nextQuestionBtn.style.display = '';
        els.skipBtn.disabled = false;
        els.skipBtn.style.display = '';
        clearSilenceCountdown();

        updateProgressDots(idx);

        // Display question
        const q = questions[idx];
        els.questionText.textContent = q.text;
        els.transcriptBox.innerHTML = '<span style="color:var(--text-muted);font-style:italic;">Listening…</span>';
        updateAiState('speaking');

        // AI reads question aloud
        resetMetricBars();

        let playbackFinished = false;

        // Try Avatar first, fallback to SpeechSyn if avatar fails or is OFF
        if (typeof AvatarController !== 'undefined' && AvatarController.mode) {
            AvatarController.playQuestion(q.text).then(() => {
                updateAiState('listening');
                beginListening(idx);
            });
        } else {
            SpeechSyn.speak(q.text, () => {
                updateAiState('listening');
                beginListening(idx);
            });
        }
    }

    function beginListening(idx) {
        if (isMuted) return;
        els.micBtn.classList.add('active');

        SpeechRec.start({
            onFinal: (text) => {
                currentTranscript = text;
                transcripts[idx] = text;
                renderTranscript(text, '');
            },
            onInterim: (interim) => {
                renderTranscript(transcripts[idx] || '', interim);
            },
            onSilence: () => {
                startSilenceCountdown();
            },
            onError: (err) => {
                if (err === 'not-allowed') App.showToast('Microphone permission denied.', 'error');
            },
        });

    }

    function renderTranscript(final, interim) {
        // Handle typewriter for final text
        if (final && final !== (displayedTranscript + transcriptQueue.join(' ')).trim()) {
            // New final text arrived (or changed)
            const words = final.split(/\s+/).filter(Boolean);
            const displayedWords = displayedTranscript.split(/\s+/).filter(Boolean);

            // Find what's new
            const newWords = words.slice(displayedWords.length + transcriptQueue.length);
            transcriptQueue.push(...newWords);

            if (!typewriterInterval && transcriptQueue.length > 0) {
                typewriterInterval = setInterval(() => {
                    if (transcriptQueue.length > 0) {
                        const word = transcriptQueue.shift();
                        displayedTranscript += (displayedTranscript ? ' ' : '') + word;
                        updateTranscriptUI(displayedTranscript, interim);
                    } else {
                        clearInterval(typewriterInterval);
                        typewriterInterval = null;
                        updateTranscriptUI(displayedTranscript, interim);
                    }
                }, 100); // 100ms per word delay
            }
        }

        updateTranscriptUI(displayedTranscript, interim);
    }

    function updateTranscriptUI(final, interim) {
        els.transcriptBox.innerHTML =
            (final ? `<span>${final}</span> ` : '') +
            (interim ? `<span class="interim-text">${interim}</span>` : '') ||
            '<span style="color:var(--text-muted);font-style:italic;">Listening…</span>';
        els.transcriptBox.scrollTop = els.transcriptBox.scrollHeight;
    }



    // ── Silence countdown (Disabled for manual submit) ───────────────────
    function startSilenceCountdown() {
        clearSilenceCountdown();
        // User requested manual submit, so we no longer auto-advance:
        els.silenceEl.textContent = '';
    }

    function clearSilenceCountdown() {
        clearInterval(silenceCountdown);
        els.silenceEl.textContent = '';
    }

    // ── Submit Answer ───────────────────────────────────────────────────
    async function submitAnswer() {
        clearSilenceCountdown();
        if (autoNextInterval) {
            clearInterval(autoNextInterval);
            autoNextInterval = null;
        }

        // Stop recording
        SpeechSyn.cancel();
        const final = SpeechRec.stop();
        if (final) transcripts[currentQIndex] = final;

        // Visual feedback — disable Submit while analyzing
        els.submitBtn.disabled = true;
        els.submitBtn.textContent = '⏳ Analyzing…';
        els.skipBtn.disabled = true;
        updateAiState('analyzing');

        try {
            const result = await App.analyzeAnswer(
                questions[currentQIndex].text,
                transcripts[currentQIndex] || '',
                questions[currentQIndex].keywords
            );
            animateMetricBars(result);

            // Disable Submit, enable Next Question
            isWaitingForNext = true;
            els.submitBtn.disabled = true;
            els.nextQuestionBtn.textContent = currentQIndex + 1 < questions.length ? 'Next Question ⏭' : 'Finish Interview 🏁';
            els.nextQuestionBtn.disabled = false;
            updateAiState('listening');
            App.showToast('Response analyzed ✅ Review your scores, then click Next.', 'success');

        } catch (err) {
            console.error('Per-question analysis failed:', err);
            App.showToast('Analysis failed, but you can still proceed.', 'warning');
            isWaitingForNext = true;
            els.submitBtn.disabled = true;
            els.nextQuestionBtn.textContent = 'Next Question ⏭';
            els.nextQuestionBtn.disabled = false;
        }
    }

    // ── Next Question / Finish ─────────────────────────────────────────
    function goToNextQuestion() {
        if (currentQIndex + 1 < questions.length) {
            startQuestion(currentQIndex + 1);
        } else {
            finishInterview();
        }
    }

    async function finishInterview() {
        SpeechRec.stop();
        els.micBtn.classList.remove('active');
        els.submitBtn.disabled = true;
        els.nextQuestionBtn.disabled = true;
        els.skipBtn.disabled = true;
        showAnalyzing(true);

        // Build Q&A pairs for batch analysis
        const qaPairs = questions.map((q, i) => ({
            question: q.text,
            transcript: transcripts[i] || '',
            keywords: q.keywords,
        }));

        // ── Compute face expression summary ───────────────────────────
        const EXPR_KEYS = ['happy', 'neutral', 'surprised', 'fearful', 'sad', 'angry', 'disgusted'];
        const log = window.faceExpressionLog || [];
        let faceExpressions = null;

        if (log.length > 0) {
            const sums = {};
            EXPR_KEYS.forEach(k => { sums[k] = 0; });
            log.forEach(frame => { EXPR_KEYS.forEach(k => { sums[k] += frame[k] || 0; }); });

            const averages = {};
            EXPR_KEYS.forEach(k => { averages[k] = Math.round((sums[k] / log.length) * 100); });

            const dominant = EXPR_KEYS.reduce((a, b) => averages[a] >= averages[b] ? a : b);
            // Positivity: happy counts full, neutral counts half
            const positivityScore = Math.min(100, Math.round(averages.happy + averages.neutral * 0.5));

            faceExpressions = { averages, dominant, positivityScore, frames: log.length };
        }

        try {
            const analysisResult = await App.analyzeBatch(qaPairs);
            const session = {
                ...config,
                questions: questions.map((q, i) => ({
                    ...q,
                    transcript: transcripts[i] || '',
                    scores: analysisResult.per_question[i],
                })),
                averages: analysisResult.averages,
                overall: analysisResult.overall,
                weightsApplied: analysisResult.weights_applied,
                faceExpressions,
                completedAt: new Date().toISOString(),
            };
            App.saveSession(session);
            window.location.href = 'results.html';
        } catch (e) {
            showAnalyzing(false);
            App.showToast('Analysis failed: ' + e.message, 'error');
        }
    }

    function showAnalyzing(show) {
        els.analyzingOverlay.style.display = show ? 'flex' : 'none';
    }

    // ── UI Helpers ─────────────────────────────────────────────────────
    function updateAiState(state) {
        const ring = els.aiAvatarRing;
        const dot = els.aiStatusDot;
        const text = els.aiStatusText;
        ring.className = 'ai-avatar-ring';
        dot.className = 'status-indicator';

        if (state === 'speaking') {
            isAiSpeaking = true;
            ring.classList.add('speaking');
            dot.classList.add('speaking');
            text.textContent = 'AI is speaking…';
        } else if (state === 'listening') {
            isAiSpeaking = false;
            dot.classList.add('listening');
            text.textContent = 'Listening to candidate…';
        } else {
            isAiSpeaking = false;
            text.textContent = 'Analyzing…';
        }
    }



    function animateMetricBars(scores) {
        App.DIMENSIONS.forEach(d => {
            const raw = scores[d.key];
            if (raw === undefined || raw === null) return;
            liveScores[d.key] = raw;
            const val = Math.max(raw, 1);
            if (metricEls[d.key]) {
                const fill = metricEls[d.key].fill;
                const score = metricEls[d.key].score;
                if (fill) fill.style.width = val + '%';
                if (score) {
                    score.textContent = raw;
                    score.style.color = raw >= 75 ? 'var(--accent-green)' : raw >= 50 ? 'var(--accent-yellow)' : 'var(--accent-red)';
                }
            }
        });
    }

    function resetMetricBars() {
        App.DIMENSIONS.forEach(d => {
            liveScores[d.key] = 0;
            if (metricEls[d.key]) {
                const fill = metricEls[d.key].fill;
                const score = metricEls[d.key].score;
                if (fill) fill.style.width = '0%';
                if (score) { score.textContent = '—'; score.style.color = ''; }
            }
        });
    }

    // ── Waveform ───────────────────────────────────────────────────────
    function setupWaveform(stream) {
        const canvas = els.waveCanvas;
        if (!canvas) return;

        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioContext.createMediaStreamSource(stream);
        analyserNode = audioContext.createAnalyser();
        analyserNode.fftSize = 256;
        source.connect(analyserNode);

        const dpr = window.devicePixelRatio || 1;
        canvas.width = canvas.parentElement.clientWidth * dpr;
        canvas.height = 70 * dpr;
        canvas.style.height = '70px';
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.scale(dpr, dpr);

        const bufferLen = analyserNode.frequencyBinCount;
        const dataArr = new Uint8Array(bufferLen);

        function draw() {
            waveformRAF = requestAnimationFrame(draw);

            if (isAiSpeaking) {
                // Simulate wave data for AI speaking
                const time = Date.now() / 100;
                for (let i = 0; i < bufferLen; i++) {
                    // Combine a few sine waves for a semi-realistic look
                    const val = Math.sin(i * 0.2 + time) * 0.3 + Math.sin(i * 0.5 - time * 2) * 0.2;
                    dataArr[i] = 128 + (val * 64);
                }
            } else {
                analyserNode.getByteTimeDomainData(dataArr);
            }

            ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
            const grad = ctx.createLinearGradient(0, 0, canvas.width / dpr, 0);
            grad.addColorStop(0, '#3b82f6');
            grad.addColorStop(0.5, '#8b5cf6');
            grad.addColorStop(1, '#06b6d4');

            ctx.lineWidth = 2;
            ctx.strokeStyle = grad;
            ctx.shadowColor = '#3b82f6';
            ctx.shadowBlur = 8;
            ctx.beginPath();

            const sliceW = (canvas.width / dpr) / bufferLen;
            let x = 0;
            for (let i = 0; i < bufferLen; i++) {
                const v = dataArr[i] / 128.0;
                const y = (v * (canvas.height / dpr)) / 2;
                i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
                x += sliceW;
            }
            ctx.lineTo(canvas.width / dpr, (canvas.height / dpr) / 2);
            ctx.stroke();
        }
        draw();
    }

    // ── Button Events ──────────────────────────────────────────────────
    els.submitBtn.addEventListener('click', () => submitAnswer());
    els.nextQuestionBtn.addEventListener('click', () => goToNextQuestion());

    els.skipBtn.addEventListener('click', () => {
        transcripts[currentQIndex] = transcripts[currentQIndex] || '';
        submitAnswer();
    });

    // ── Replay button: re-read current question via avatar or TTS ──
    if (els.replayBtn) {
        els.replayBtn.addEventListener('click', () => {
            const q = questions[currentQIndex];
            if (!q) return;

            const label = document.getElementById('avatar-speaking-label');
            if (label) label.style.display = 'block';
            els.replayBtn.disabled = true;

            updateAiState('speaking');
            SpeechRec.stop();

            const done = () => {
                if (label) label.style.display = 'none';
                els.replayBtn.disabled = false;
                updateAiState('listening');
                beginListening(currentQIndex);
            };

            if (typeof AvatarController !== 'undefined' && AvatarController.mode) {
                AvatarController.playQuestion(q.text).then(done);
            } else {
                SpeechSyn.speak(q.text, done);
            }
        });
    }

    els.micBtn.addEventListener('click', () => {
        if (isMuted) {
            isMuted = false;
            els.micBtn.classList.remove('muted');
            els.micBtn.textContent = '🎤';
            beginListening(currentQIndex);
            App.showToast('Microphone on', 'success');
        } else {
            isMuted = true;
            SpeechRec.stop();
            els.micBtn.classList.add('muted');
            els.micBtn.classList.remove('active');
            els.micBtn.textContent = '🔇';
            App.showToast('Microphone muted', 'info');
        }
    });

})();

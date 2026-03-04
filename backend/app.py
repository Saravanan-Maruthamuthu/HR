import os
import sys
import uuid
import tempfile
import asyncio
import edge_tts
from gtts import gTTS
from flask import Flask, jsonify, request, send_from_directory, send_file
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()

# Add parent directory to path
sys.path.insert(0, os.path.dirname(__file__))

from question_bank import get_questions, UNIVERSAL_QUESTIONS
from gemini_analyzer import analyze_with_gemini, generate_questions_from_jd

app = Flask(__name__, static_folder=os.path.join(os.path.dirname(__file__), "..", "frontend"))
CORS(app)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

# ─── API Routes ───────────────────────────────────────────────────────────────

@app.route("/api/questions", methods=["GET"])
def api_questions():
    """Return universal questions + optional static role questions."""
    count = int(request.args.get("count", 5))
    count = max(1, min(count, 15))
    questions = get_questions("general", "intermediate", count)
    return jsonify({"questions": questions, "count": len(questions)})


@app.route("/api/questions/generate", methods=["POST"])
def api_generate_questions():
    """
    Generate interview questions from a Job Description.
    Always returns exactly 10 questions:
      - First 5: universal questions (strategy / behavioural)
      - Next  5: dynamically generated from the JD using Gemini
    """
    data = request.get_json()
    if not data:
        return jsonify({"error": "No JSON body"}), 400

    job_description = data.get("job_description", "").strip()
    if not job_description:
        return jsonify({"error": "job_description is required"}), 400

    # Always 5 universal first
    questions = list(UNIVERSAL_QUESTIONS)  # exactly 5 items

    # Always 5 JD-specific questions
    dynamic = generate_questions_from_jd(job_description, 5, GEMINI_API_KEY)
    questions.extend(dynamic)

    return jsonify({"questions": questions, "count": len(questions)})


@app.route("/api/analyze", methods=["POST"])
def api_analyze():
    """Analyze a single Q&A pair using Gemini (or heuristic fallback)."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "No JSON body"}), 400

    question = data.get("question", "")
    transcript = data.get("transcript", "")
    keywords = data.get("keywords", [])

    if not transcript.strip():
        return jsonify({
            "communication": 0, "confidence": 0, "fluency": 0,
            "clarity": 0, "relevance": 0, "feedback": "No answer was detected.",
            "source": "empty"
        })

    result = analyze_with_gemini(question, transcript, keywords, GEMINI_API_KEY, {})
    return jsonify(result)


@app.route("/api/analyze/batch", methods=["POST"])
def api_analyze_batch():
    """Analyze multiple Q&A pairs at once and return aggregated scores."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "No JSON body"}), 400

    qa_pairs = data.get("qa_pairs", [])
    weights = {}

    results = []
    totals = {"communication": 0, "confidence": 0, "fluency": 0, "clarity": 0, "relevance": 0}
    answered_count = 0

    for pair in qa_pairs:
        question = pair.get("question", "")
        transcript = pair.get("transcript", "")
        keywords = pair.get("keywords", [])

        if not transcript.strip():
            # Skip — don't count unanswered questions toward averages
            results.append({"communication": 0, "confidence": 0, "fluency": 0,
                            "clarity": 0, "relevance": 0, "feedback": "", "source": "skipped"})
            continue

        score = analyze_with_gemini(question, transcript, keywords, GEMINI_API_KEY, weights)
        results.append(score)
        answered_count += 1
        for dim in totals:
            totals[dim] += score.get(dim, 0)

    n = max(answered_count, 1)
    averages = {dim: round(totals[dim] / n) for dim in totals}
    overall = round(sum(averages.values()) / 5)

    return jsonify({
        "per_question": results,
        "averages": averages,
        "overall": overall,
    })

@app.route("/api/tts", methods=["POST"])
def api_tts():
    """Generate TTS audio and return it as an MP3 file."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "No JSON body"}), 400

    text = data.get("text", "").strip()
    provider = data.get("provider", "azure")

    if not text:
        return jsonify({"error": "text is required"}), 400

    filename = f"temp_tts_{uuid.uuid4().hex}.mp3"
    filepath = os.path.join(tempfile.gettempdir(), filename)

    try:
        if provider == "google":
            tts = gTTS(text=text, lang='en')
            tts.save(filepath)
        else:
            # Azure / Edge TTS — run async coroutine in sync context
            voice = "en-US-AriaNeural"
            communicate = edge_tts.Communicate(text, voice)
            asyncio.run(communicate.save(filepath))

        return send_file(filepath, mimetype="audio/mpeg", as_attachment=False)
    except Exception as e:
        return jsonify({"error": str(e)}), 500




@app.route("/api/status", methods=["GET"])
def api_status():
    """Health check endpoint."""
    has_gemini = bool(GEMINI_API_KEY and GEMINI_API_KEY != "your_gemini_api_key_here")
    return jsonify({
        "status": "online",
        "gemini_enabled": has_gemini,
        "analysis_mode": "gemini" if has_gemini else "heuristic",
    })


# ─── Favicon ──────────────────────────────────────────────────────────────────

@app.route("/favicon.ico")
def favicon():
    """Return an inline SVG favicon so the browser doesn't 404."""
    from flask import Response
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'
        '<text y=".9em" font-size="90">🎯</text>'
        '</svg>'
    )
    return Response(svg, mimetype="image/svg+xml",
                    headers={"Cache-Control": "public, max-age=86400"})

# ─── Serve Frontend ───────────────────────────────────────────────────────────

@app.route("/")
def serve_index():
    return send_from_directory(app.static_folder, "index.html")

@app.route("/<path:filename>")
def serve_static(filename):
    return send_from_directory(app.static_folder, filename)

# ─── Main ─────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    print(f"\n{'='*55}")
    print(f"  AI Interview Platform - Backend Server")
    print(f"{'='*55}")
    print(f"  URL:      http://localhost:{port}")
    print(f"  Gemini:   {'Enabled' if GEMINI_API_KEY and GEMINI_API_KEY != 'your_gemini_api_key_here' else 'Not configured (using heuristics)'}")

    print(f"{'='*55}\n")
    app.run(debug=True, port=port, host="0.0.0.0")

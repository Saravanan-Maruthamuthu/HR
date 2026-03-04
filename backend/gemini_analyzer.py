import json
import os
import re
import math


def _heuristic_analyze(question: str, transcript: str, keywords: list) -> dict:
    """Local fallback heuristic scoring when Gemini API is unavailable."""
    text = transcript.strip()
    if not text:
        return {"communication": 20, "confidence": 20, "fluency": 20, "clarity": 20, "relevance": 20}

    words = text.split()
    word_count = len(words)
    sentences = [s.strip() for s in re.split(r'[.!?]+', text) if s.strip()]
    sentence_count = max(len(sentences), 1)

    # Fillers
    fillers = ["um", "uh", "like", "you know", "basically", "literally", "actually", "sort of"]
    filler_hits = sum(text.lower().count(f) for f in fillers)
    filler_ratio = filler_hits / max(word_count, 1)

    # WPM (assume ~120 second answer as baseline)
    assumed_duration = max(word_count / 2.0, 5)  # rough 2 words/sec
    wpm = (word_count / assumed_duration) * 60

    # Transition / discourse markers
    transitions = ["firstly", "secondly", "furthermore", "however", "therefore", "in addition",
                   "for example", "for instance", "moreover", "consequently", "as a result",
                   "in conclusion", "to summarize", "additionally", "on the other hand"]
    transition_count = sum(1 for t in transitions if t in text.lower())

    # Vocabulary richness
    unique_words = len(set(w.lower() for w in words))
    type_token_ratio = unique_words / max(word_count, 1)

    # Strong vocabulary
    strong_words = ["implement", "architecture", "framework", "optimize", "strategy", "analyze",
                    "significant", "effectively", "efficient", "robust", "scalable", "comprehensive",
                    "demonstrate", "leverage", "integrate", "collaborate", "prioritize"]
    strong_count = sum(1 for w in strong_words if w in text.lower())

    # Keyword relevance
    kw_hits = sum(1 for kw in keywords if kw.lower() in text.lower())
    relevance_score = min(100, int((kw_hits / max(len(keywords), 1)) * 100 * 1.5))

    # --- Scoring ---

    # Communication: sentence structure, transitions, length
    comm_base = min(100, word_count * 0.8)
    comm_bonus = transition_count * 10
    comm = min(100, int(comm_base + comm_bonus + strong_count * 3))

    # Confidence: WPM in good range, low fillers, strong vocab
    wpm_score = 100 - abs(wpm - 130) * 0.8
    confidence = min(100, max(0, int(wpm_score - filler_ratio * 200 + strong_count * 5)))

    # Fluency: WPM closer to 120-150 = better
    fluency_wpm = 100 - abs(wpm - 135) * 0.9
    fluency = min(100, max(0, int(fluency_wpm - filler_ratio * 150)))

    # Clarity: type-token ratio + strong words
    clarity = min(100, int(type_token_ratio * 70 + strong_count * 4 + sentence_count * 2))

    return {
        "communication": max(25, min(100, comm)),
        "confidence": max(25, min(100, confidence)),
        "fluency": max(25, min(100, fluency)),
        "clarity": max(25, min(100, clarity)),
        "relevance": max(10, min(100, relevance_score)),
    }


def analyze_with_gemini(question: str, transcript: str, keywords: list, api_key: str, weights: dict = None) -> dict:
    """Analyze candidate transcript using Google Gemini API."""

    heuristic = _heuristic_analyze(question, transcript, keywords)

    if not api_key or api_key == "your_gemini_api_key_here":
        # No API key — return heuristic scores
        return {**heuristic, "source": "heuristic", "feedback": _generate_local_feedback(transcript, heuristic)}

    try:
        import google.generativeai as genai

        genai.configure(api_key=api_key)
        model = genai.GenerativeModel("gemini-1.5-flash")

        prompt = f"""You are an expert HR interviewer and communication coach analyzing a job interview response.

INTERVIEW QUESTION:
"{question}"

CANDIDATE'S SPOKEN ANSWER (transcribed from speech):
"{transcript}"

Please analyze this response and return a JSON object with EXACTLY these fields:
{{
  "communication": <integer 0-100>,
  "confidence": <integer 0-100>,
  "fluency": <integer 0-100>,
  "clarity": <integer 0-100>,
  "relevance": <integer 0-100>,
  "feedback": "<2-3 sentence constructive feedback on the answer>"
}}

Scoring criteria:
- **communication** (0-100): Overall effectiveness of communication — structure, coherence, use of examples, professional language
- **confidence** (0-100): Speaking confidence — assertive tone, minimal filler words (um/uh/like), appropriate vocabulary, steady pace
- **fluency** (0-100): Smoothness of speaking — natural flow, minimal repetitions, appropriate speaking speed (120-150 WPM ideal)
- **clarity** (0-100): Clarity of expression — precise word choice, clear sentences, logical organization, lexical diversity
- **relevance** (0-100): How well the answer addresses the question — use of relevant concepts, specificity, completeness

Return ONLY the JSON object. No markdown, no explanation, just the raw JSON."""

        response = model.generate_content(prompt)
        raw = response.text.strip()
        
        # Clean markdown code block if present
        raw = re.sub(r'^```(?:json)?\s*', '', raw)
        raw = re.sub(r'\s*```$', '', raw)

        # Extract JSON from response
        try:
            json_match = re.search(r'\{[^{}]+\}', raw, re.DOTALL)
            if json_match:
                scores = json.loads(json_match.group())
            else:
                scores = json.loads(raw)
        except json.JSONDecodeError as decode_err:
            print(f"[Gemini JSON Parse Error] {decode_err} - Raw Output:\n{raw}")
            raise Exception("Failed to parse Gemini output as JSON")

        result = {
            dim: min(100, max(0, int(scores.get(dim, heuristic[dim]))))
            for dim in ["communication", "confidence", "fluency", "clarity", "relevance"]
        }
        result["feedback"] = scores.get("feedback", "Good effort on this answer.")
        result["source"] = "gemini"
        return result

    except Exception as e:
        print(f"[Gemini Error] {e} — falling back to heuristic")
        return {**heuristic, "source": "heuristic", "feedback": _generate_local_feedback(transcript, heuristic)}


def _generate_local_feedback(transcript: str, scores: dict) -> str:
    """Generate simple textual feedback based on heuristic scores."""
    avg = sum(scores.values()) / len(scores)
    words = transcript.split()
    word_count = len(words)

    parts = []
    if word_count < 30:
        parts.append("Try to provide more detailed answers with concrete examples.")
    elif word_count > 200:
        parts.append("Good level of detail in your response.")
    else:
        parts.append("Your answer covered the topic adequately.")

    if scores["confidence"] < 50:
        parts.append("Work on reducing filler words and maintaining a steady pace to sound more confident.")
    elif scores["confidence"] >= 75:
        parts.append("You spoke with good confidence and assertiveness.")

    if scores["relevance"] < 50:
        parts.append("Try to focus more directly on the question and use relevant terminology.")
    elif scores["relevance"] >= 70:
        parts.append("Your answer was well-targeted to the question asked.")

    return " ".join(parts)


def generate_questions_from_jd(job_description: str, count: int, api_key: str) -> list:
    """
    Generate 'count' interview questions from a job description.
    Uses Gemini if API key is available, otherwise extracts keywords from JD
    and returns relevant fallback questions.
    """
    if api_key and api_key != "your_gemini_api_key_here":
        try:
            import google.generativeai as genai
            genai.configure(api_key=api_key)
            model = genai.GenerativeModel("gemini-1.5-flash")

            prompt = f"""You are an expert HR interviewer. Based on the following job description, generate exactly {count} specific, insightful interview questions that directly test the skills and experience described.

JOB DESCRIPTION:
{job_description}

Requirements:
- Each question must be directly relevant to the skills, responsibilities, or requirements in the JD
- Questions should vary in type: technical/skill-based, behavioral (STAR), situational, and problem-solving
- Make questions specific, not generic
- Return ONLY a JSON array with exactly {count} objects, each with: "id", "text", "keywords"

Example format:
[
  {{
    "id": "jd_1",
    "text": "Your specific question here",
    "keywords": ["relevant", "keywords", "from", "jd"]
  }}
]

Return ONLY the JSON array. No markdown, no explanation."""

            response = model.generate_content(prompt)
            raw = response.text.strip()

            # Strip markdown code blocks if present
            raw = re.sub(r'^```(?:json)?\s*', '', raw)
            raw = re.sub(r'\s*```$', '', raw)

            questions = json.loads(raw)
            # Ensure all fields exist
            result = []
            for i, q in enumerate(questions[:count]):
                result.append({
                    "id": q.get("id", f"jd_{i+1}"),
                    "text": q.get("text", q) if isinstance(q, str) else q.get("text", ""),
                    "keywords": q.get("keywords", []),
                })
            return result

        except Exception as e:
            print(f"[Gemini JD Generation Error] {e} — using keyword fallback")

    # Fallback: extract JD keywords and return keyword-focused questions
    return _jd_fallback_questions(job_description, count)


def _jd_fallback_questions(job_description: str, count: int) -> list:
    """Heuristic fallback: extract skills from JD and create questions around them."""
    import random

    # Extract likely skill/tool keywords from JD (capitalized or quoted terms)
    text = job_description
    # Find capitalized multi-word phrases or technical terms
    words = re.findall(r'\b[A-Z][a-zA-Z+#\.]{2,}\b', text)
    # Also find common lowercase technical terms
    tech_terms = re.findall(
        r'\b(python|java|react|node|sql|aws|docker|kubernetes|api|machine learning|deep learning|'
        r'angular|typescript|flask|django|postgresql|mongodb|redis|kafka|microservices|ci\/cd|'
        r'agile|scrum|product roadmap|data analysis|tableau|power bi|excel|leadership|management)\b',
        text.lower()
    )
    skills = list(set([w for w in words if len(w) > 3] + [t.title() for t in tech_terms]))[:8]
    if not skills:
        skills = ["relevant skills", "technical knowledge", "problem solving"]

    templates = [
        ("Can you describe your hands-on experience with {skill} and give an example of a project where you used it?", "{skill}"),
        ("Walk me through how you would approach a complex problem involving {skill} in a production environment.", "{skill}"),
        ("How have you used {skill} to solve a real business problem? What was the outcome?", "{skill}"),
        ("What challenges have you faced working with {skill} and how did you overcome them?", "{skill}"),
        ("How do you stay current with best practices in {skill}?", "{skill}"),
        ("Describe a situation where your skills in {skill} directly contributed to team success.", "{skill}"),
    ]

    fallback = []
    random.shuffle(skills)
    for i in range(min(count, len(skills))):
        skill = skills[i % len(skills)]
        template, kw_template = random.choice(templates)
        fallback.append({
            "id": f"jd_fallback_{i+1}",
            "text": template.format(skill=skill),
            "keywords": [skill.lower(), "experience", "project", "example", "team", "result"],
        })

    # Pad with generic behavioral questions if needed
    generic = [
        {"id": "jd_gen_1", "text": "Describe a time you had to learn a new technology quickly to meet a project deadline. How did you approach it?", "keywords": ["learn", "technology", "deadline", "adapt", "fast"]},
        {"id": "jd_gen_2", "text": "Tell me about the most technically challenging project you have worked on related to this role.", "keywords": ["technical", "challenge", "project", "role", "complex"]},
        {"id": "jd_gen_3", "text": "How do you ensure the quality and reliability of your work in a fast-paced environment?", "keywords": ["quality", "testing", "reliability", "fast-paced", "process"]},
    ]
    while len(fallback) < count:
        fallback.append(generic[len(fallback) % len(generic)])

    return fallback[:count]




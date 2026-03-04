import random

# ── 5 Universal Questions (asked first in every interview) ──────────────────
UNIVERSAL_QUESTIONS = [
    {
        "id": "univ_1",
        "text": "Tell me about yourself — your background, experience, and what brings you to this role.",
        "keywords": ["background", "experience", "skills", "career", "education", "passion", "role", "goal"]
    },
    {
        "id": "univ_2",
        "text": "Can you walk me through a project you have worked on that you are most proud of?",
        "keywords": ["project", "built", "developed", "challenge", "team", "result", "impact", "technology", "problem", "solution"]
    },
    {
        "id": "univ_3",
        "text": "What are your greatest strengths and weaknesses? Be specific with examples.",
        "keywords": ["strength", "weakness", "example", "improve", "learn", "skill", "communication", "leadership", "time management", "overcome"]
    },
    {
        "id": "univ_4",
        "text": "Why should we hire you? What makes you the best candidate for this position?",
        "keywords": ["unique", "value", "skill", "experience", "contribute", "differentiate", "passion", "fit", "strength", "deliver"]
    },
    {
        "id": "univ_5",
        "text": "Where do you see yourself in five years, and how does this role align with your career goals?",
        "keywords": ["goal", "growth", "leadership", "skill", "vision", "long term", "career", "develop", "align", "contribute"]
    },
]

# ── Role-Specific Question Pool ──────────────────────────────────────────────
QUESTIONS = {
    "general": {
        "beginner": [
            {"id": "gen_b1", "text": "How do you stay organized when you have multiple tasks to complete?", "keywords": ["organization", "priority", "task", "time management"]},
            {"id": "gen_b2", "text": "Describe a time you had to work with a difficult teammate. How did you handle it?", "keywords": ["teamwork", "conflict", "communication", "resolution"]},
        ],
        "intermediate": [
            {"id": "gen_i1", "text": "What is your approach to learning a new technology or tool?", "keywords": ["learning", "adaptability", "growth", "process"]},
            {"id": "gen_i2", "text": "How do you handle feedback that you disagree with?", "keywords": ["feedback", "professionalism", "communication", "receptive"]},
        ],
        "expert": [
            {"id": "gen_e1", "text": "How do you mentor junior team members or influence technical decisions?", "keywords": ["mentorship", "leadership", "influence", "technical strategy"]},
            {"id": "gen_e2", "text": "Describe a time you had to make a high-stakes decision with incomplete information.", "keywords": ["decision making", "risk", "strategy", "analysis"]},
        ]
    }
}



def get_questions(role: str, difficulty: str, count: int) -> list:
    """
    Always return the 5 universal questions first (Tell me about yourself,
    Project, Strengths/Weaknesses, Why hire you, 5-year plan), then append
    dynamic role-specific questions to reach the requested count.
    """
    role_key = role.lower().replace(" ", "_")
    if role_key not in QUESTIONS:
        role_key = "general"

    diff_key = difficulty.lower()
    if diff_key not in ["beginner", "intermediate", "expert"]:
        diff_key = "intermediate"

    # Start with all 5 universal questions (always in this order)
    result = list(UNIVERSAL_QUESTIONS)

    # How many additional dynamic questions are needed?
    extra_needed = max(0, count - len(result))

    if extra_needed > 0:
        pool = QUESTIONS[role_key][diff_key].copy()

        # Supplement with general questions if role pool is small
        if len(pool) < extra_needed:
            general_pool = QUESTIONS["general"][diff_key].copy()
            random.shuffle(general_pool)
            pool.extend(general_pool)

        random.shuffle(pool)
        result.extend(pool[:extra_needed])

    return result

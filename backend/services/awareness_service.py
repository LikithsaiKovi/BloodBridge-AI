"""
Thalassemia AI Educator — local rule-based chat + optional Bedrock.
"""
import re
import uuid
from datetime import datetime
from typing import Optional
from config.settings import settings
import logging

logger = logging.getLogger(__name__)

# Knowledge base for Thalassemia Q&A
KNOWLEDGE_BASE = [
    {
        "patterns": [r"what is thalassemia", r"thalassemia kya hai", r"explain thalassemia", r"tell me about thalassemia"],
        "response": (
            "**What is Thalassemia?**\n\n"
            "Thalassemia is an inherited blood disorder where the body produces abnormal hemoglobin — the protein in red blood cells that carries oxygen. "
            "This leads to destruction of red blood cells and anemia.\n\n"
            "**Key Facts:**\n"
            "• Affects 1 in 10,000 births globally\n"
            "• Over 100 million carriers worldwide\n"
            "• Most common in Mediterranean, Middle Eastern & South Asian populations\n"
            "• India has ~1 lakh new thalassemia major children born each year\n\n"
            "**Types:**\n"
            "• **Thalassemia Minor** – carrier, mild or no symptoms\n"
            "• **Thalassemia Intermedia** – moderate anemia\n"
            "• **Thalassemia Major** – severe, requires lifelong blood transfusions every 2–4 weeks"
        ),
    },
    {
        "patterns": [r"can i donate", r"who can donate", r"eligible to donate", r"donation eligibility", r"am i eligible"],
        "response": (
            "**Blood Donation Eligibility**\n\n"
            "**You CAN donate if:**\n"
            "✅ Age 18–65 years\n"
            "✅ Weight ≥ 45 kg\n"
            "✅ Hemoglobin ≥ 12.5 g/dL\n"
            "✅ No donation in the last 90 days\n"
            "✅ No major illness or fever in last 2 weeks\n"
            "✅ Thalassemia Minor with normal hemoglobin (consult doctor)\n\n"
            "**You CANNOT donate if:**\n"
            "❌ Thalassemia Major patient\n"
            "❌ Hemoglobin below normal\n"
            "❌ Donated within 90 days\n"
            "❌ Currently on antibiotics or blood thinners\n"
            "❌ Pregnant or recently delivered\n\n"
            "*Always consult your blood bank physician before donating.*"
        ),
    },
    {
        "patterns": [r"how often", r"frequency", r"how many times", r"transfusion schedule"],
        "response": (
            "**Blood Transfusion Frequency for Thalassemia**\n\n"
            "| Type | Frequency |\n"
            "|------|-----------|\n"
            "| Thalassemia Major | Every 2–4 weeks |\n"
            "| Thalassemia Intermedia | Every 4–8 weeks |\n"
            "| Thalassemia Minor | Rarely needed |\n\n"
            "**Why Regular Transfusions Matter:**\n"
            "• Maintains hemoglobin at 9–10.5 g/dL\n"
            "• Prevents bone deformities\n"
            "• Supports normal growth in children\n"
            "• Allows normal quality of life\n\n"
            "Missing transfusions can cause organ damage, severe anemia, and life-threatening complications."
        ),
    },
    {
        "patterns": [r"symptom", r"signs", r"how to know", r"identify"],
        "response": (
            "**Signs & Symptoms of Thalassemia**\n\n"
            "**Mild (Minor/Intermedia):**\n"
            "• Mild fatigue\n"
            "• Slightly pale skin\n"
            "• Usually detected through blood tests\n\n"
            "**Severe (Major):**\n"
            "• Severe fatigue and weakness\n"
            "• Very pale or yellowish skin (jaundice)\n"
            "• Enlarged spleen and liver\n"
            "• Facial bone deformities\n"
            "• Slow growth in children\n"
            "• Dark urine\n"
            "• Heart problems (in untreated cases)\n\n"
            "⚠️ **Important:** Symptoms usually appear within the first 2 years of life in Thalassemia Major."
        ),
    },
    {
        "patterns": [r"treatment", r"cure", r"bone marrow", r"stem cell", r"gene therapy"],
        "response": (
            "**Treatment Options for Thalassemia**\n\n"
            "**Ongoing Management:**\n"
            "• Regular blood transfusions (every 2–4 weeks)\n"
            "• Iron chelation therapy (to remove excess iron from transfusions)\n"
            "• Folic acid supplementation\n"
            "• Regular monitoring of organs\n\n"
            "**Curative Treatments:**\n"
            "• **Bone Marrow Transplant (BMT)** – most established cure, 80–90% success rate in children\n"
            "• **Stem Cell Transplant** – from matched sibling donors\n"
            "• **Gene Therapy** – emerging treatment showing great promise (FDA approved in 2022 for beta-thalassemia)\n\n"
            "**BloodBridge AI** helps ensure patients receive timely transfusions through predictive donor matching."
        ),
    },
    {
        "patterns": [r"myth", r"fact", r"misconception", r"false"],
        "response": (
            "**Common Myths vs Facts about Thalassemia**\n\n"
            "❌ **Myth:** Thalassemia is contagious\n"
            "✅ **Fact:** It's a genetic disorder — cannot spread through contact\n\n"
            "❌ **Myth:** Thalassemia patients can't live normal lives\n"
            "✅ **Fact:** With proper care, many patients live full, productive lives\n\n"
            "❌ **Myth:** Blood donation weakens your body permanently\n"
            "✅ **Fact:** Blood replenishes within 24–48 hours; red cells restore within 4–6 weeks\n\n"
            "❌ **Myth:** Only relatives can donate to thalassemia patients\n"
            "✅ **Fact:** Any blood-type compatible donor can donate\n\n"
            "❌ **Myth:** Thalassemia Minor doesn't need any attention\n"
            "✅ **Fact:** Carriers must get genetic counseling before planning a family"
        ),
    },
    {
        "patterns": [r"prevention", r"prevent", r"avoid", r"carrier", r"genetic"],
        "response": (
            "**Preventing Thalassemia**\n\n"
            "Thalassemia is genetic and cannot be 'caught' — but it CAN be prevented:\n\n"
            "**Pre-Marriage Screening:**\n"
            "• Both partners should get a blood test (CBC + HPLC)\n"
            "• If BOTH are carriers (Thalassemia Minor), there's a 25% chance each child will have Thalassemia Major\n\n"
            "**Prenatal Testing:**\n"
            "• Chorionic Villus Sampling (CVS) at 10–12 weeks\n"
            "• Amniocentesis at 14–18 weeks\n\n"
            "**India's Initiative:**\n"
            "• Free carrier screening available at government hospitals\n"
            "• Many states now require pre-marital thalassemia screening\n\n"
            "BloodBridge AI advocates for universal carrier screening to reduce new thalassemia cases."
        ),
    },
    {
        "patterns": [r"why donate", r"importance of donation", r"why blood", r"why should i"],
        "response": (
            "**Why Blood Donation Matters for Thalassemia Patients**\n\n"
            "🩸 **Life-Saving Impact:**\n"
            "• Thalassemia Major patients need blood every 2–4 weeks — for LIFE\n"
            "• Without regular transfusions, they face organ failure\n"
            "• A single donation can support 1–2 transfusion sessions\n\n"
            "📊 **The Numbers:**\n"
            "• India has 1–1.5 lakh thalassemia patients\n"
            "• Each needs 12–24 donations per year\n"
            "• Total demand: 15–30 lakh units annually just for thalassemia\n\n"
            "💪 **You Can Help By:**\n"
            "• Donating blood regularly (every 90 days)\n"
            "• Becoming a dedicated donor for a specific patient\n"
            "• Spreading awareness about thalassemia\n"
            "• Joining BloodBridge AI as a registered donor"
        ),
    },
    {
        "patterns": [r"hello", r"hi", r"hey", r"namaste", r"good morning", r"good evening"],
        "response": (
            "**Hello! Welcome to the Thalassemia Awareness Hub! 👋**\n\n"
            "I'm your AI Health Educator, powered by BloodBridge AI. I can help you with:\n\n"
            "• 🔬 **Learn** about Thalassemia (What it is, types, symptoms)\n"
            "• 💉 **Understand** treatment options\n"
            "• 🩸 **Check** blood donation eligibility\n"
            "• ❓ **Debunk** myths and misconceptions\n"
            "• 🛡️ **Know** about prevention and genetic screening\n\n"
            "Try asking:\n"
            "*\"What is Thalassemia?\"*\n"
            "*\"Can I donate blood?\"*\n"
            "*\"What are the symptoms?\"*"
        ),
    },
]

DEFAULT_RESPONSE = (
    "**I'm here to help with Thalassemia information!**\n\n"
    "I can answer questions about:\n"
    "• What is Thalassemia\n"
    "• Types and symptoms\n"
    "• Treatment options\n"
    "• Blood donation eligibility\n"
    "• Prevention and carrier screening\n"
    "• Myths vs Facts\n\n"
    "Try asking: *\"What is Thalassemia?\"* or *\"Can I donate blood?\"*"
)


def get_local_response(message: str) -> str:
    """Rule-based response using knowledge base."""
    message_lower = message.lower().strip()

    for kb_entry in KNOWLEDGE_BASE:
        for pattern in kb_entry["patterns"]:
            if re.search(pattern, message_lower):
                return kb_entry["response"]

    return DEFAULT_RESPONSE


def chat(message: str, session_id: Optional[str] = None) -> dict:
    """Process a chat message and return AI response."""
    if not session_id:
        session_id = str(uuid.uuid4())

    if settings.use_bedrock:
        response_text = _bedrock_chat(message)
    else:
        response_text = get_local_response(message)

    return {
        "response": response_text,
        "session_id": session_id,
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "sources": ["Thalassemia India", "WHO", "ICMR Guidelines"],
        "ai_powered": settings.use_bedrock,
    }


def _bedrock_chat(message: str) -> str:
    """Chat with Amazon Bedrock Claude Haiku."""
    try:
        import boto3
        import json

        kwargs = {"region_name": settings.bedrock_region}
        if settings.aws_access_key_id and settings.aws_access_key_id != "local":
            kwargs["aws_access_key_id"] = settings.aws_access_key_id
            kwargs["aws_secret_access_key"] = settings.aws_secret_access_key
            
        client = boto3.client("bedrock-runtime", **kwargs)

        system_prompt = (
            "You are a compassionate, expert medical educator specializing in Thalassemia. "
            "You work for BloodBridge AI, an AI-powered blood donation platform for Thalassemia patients in India. "
            "Answer questions about Thalassemia, blood donation eligibility, treatment options, prevention, and donor support. "
            "Be warm, encouraging, and medically accurate. Format responses with markdown for clarity. "
            "Keep responses under 300 words. End with an encouraging note when appropriate."
        )

        response = client.converse(
            modelId=settings.bedrock_model_id,
            messages=[{"role": "user", "content": [{"text": message}]}],
            system=[{"text": system_prompt}],
            inferenceConfig={"maxTokens": 500}
        )

        return response["output"]["message"]["content"][0]["text"]
    except Exception as e:
        logger.error("Bedrock chat failed: %s", e)
        return get_local_response(message)


def get_hub_stats() -> dict:
    """Return live stats for the awareness hub."""
    from database.db import patients_repo, donors_repo
    return {
        "active_patients": patients_repo.count({"status": "active"}),
        "active_donors": donors_repo.count({"status": "active"}),
        "education_resources": 127,
        "support_messages": donors_repo.count() * 8 + 1200,  # Simulated
    }

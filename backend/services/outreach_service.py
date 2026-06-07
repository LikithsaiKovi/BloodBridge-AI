"""
AI Outreach Service: Generate multilingual donor messages.
Local: Rule-based templates. AWS: Amazon Bedrock Claude Haiku.
"""
from datetime import datetime
from typing import Optional
from config.settings import settings
import logging

logger = logging.getLogger(__name__)

# ─── Message Templates ────────────────────────────────────────────────────────

MESSAGES = {
    "English": {
        "initial": {
            "title": "Blood Donation Request",
            "body": (
                "Dear {donor_name},\n\n"
                "We are reaching out from BloodBridge AI on behalf of a Thalassemia patient who urgently needs "
                "{blood_group} blood by {needed_by}.\n\n"
                "Your last donation saved lives. Would you be able to donate once more? "
                "Your help can make all the difference.\n\n"
                "Please reply YES to confirm or call us at +91-800-BRIDGE.\n\n"
                "With gratitude,\nBloodBridge AI Team 🩸"
            ),
        },
        "reminder": {
            "title": "Gentle Reminder: Blood Needed",
            "body": (
                "Hi {donor_name},\n\n"
                "This is a gentle reminder about our blood donation request for a patient "
                "needing {blood_group} blood by {needed_by}.\n\n"
                "Your response can save a life today. Please confirm your availability.\n\n"
                "BloodBridge AI 🩸"
            ),
        },
        "thank_you": {
            "title": "Thank You, Blood Hero!",
            "body": (
                "Dear {donor_name},\n\n"
                "THANK YOU! 🎉 Your donation has been confirmed and will help a Thalassemia patient "
                "receive their life-saving transfusion on time.\n\n"
                "You are a true Blood Hero. Your streak: {streak} donations! "
                "Check your badge on BloodBridge AI.\n\n"
                "With deepest gratitude,\nBloodBridge AI Team 🩸"
            ),
        },
        "follow_up": {
            "title": "We Understand — Stay Connected",
            "body": (
                "Hi {donor_name},\n\n"
                "We understand if you're unable to donate right now. That's completely okay! "
                "When you're ready for your next donation, we'll be here.\n\n"
                "Stay healthy and thank you for being part of the BloodBridge community.\n\n"
                "BloodBridge AI 🩸"
            ),
        },
    },
    "Hindi": {
        "initial": {
            "title": "रक्तदान अनुरोध",
            "body": (
                "प्रिय {donor_name},\n\n"
                "BloodBridge AI से आपसे संपर्क कर रहे हैं। एक थैलेसीमिया रोगी को {needed_by} तक "
                "{blood_group} रक्त की तत्काल आवश्यकता है।\n\n"
                "आपका पिछला दान जीवन बचा चुका है। क्या आप एक बार और दान कर सकते हैं?\n\n"
                "पुष्टि के लिए 'हाँ' उत्तर दें या +91-800-BRIDGE पर कॉल करें।\n\n"
                "आभार के साथ,\nBloodBridge AI टीम 🩸"
            ),
        },
        "reminder": {
            "title": "याद दिलाना: रक्त की आवश्यकता",
            "body": (
                "नमस्ते {donor_name},\n\n"
                "यह {needed_by} तक {blood_group} रक्त की हमारी अनुरोध के बारे में एक याद दिलाने वाला संदेश है।\n\n"
                "आपकी प्रतिक्रिया एक जीवन बचा सकती है। कृपया अपनी उपलब्धता की पुष्टि करें।\n\n"
                "BloodBridge AI 🩸"
            ),
        },
        "thank_you": {
            "title": "धन्यवाद, ब्लड हीरो!",
            "body": (
                "प्रिय {donor_name},\n\n"
                "धन्यवाद! 🎉 आपके दान की पुष्टि हो गई है। एक थैलेसीमिया रोगी को समय पर रक्त मिलेगा।\n\n"
                "आप एक सच्चे ब्लड हीरो हैं। आपका दान स्ट्रीक: {streak}!\n\n"
                "BloodBridge AI टीम 🩸"
            ),
        },
        "follow_up": {
            "title": "हम समझते हैं — जुड़े रहें",
            "body": (
                "नमस्ते {donor_name},\n\n"
                "हम समझते हैं कि आप अभी दान नहीं कर सकते। यह बिल्कुल ठीक है!\n\n"
                "जब आप अगले दान के लिए तैयार हों, हम यहाँ हैं। स्वस्थ रहें!\n\n"
                "BloodBridge AI 🩸"
            ),
        },
    },
    "Telugu": {
        "initial": {
            "title": "రక్తదాన అభ్యర్థన",
            "body": (
                "ప్రియమైన {donor_name},\n\n"
                "BloodBridge AI నుండి మీతో సంప్రదిస్తున్నాం. ఒక థాలసేమియా రోగికి {needed_by} నాటికి "
                "{blood_group} రక్తం అత్యవసరంగా అవసరం.\n\n"
                "మీ గత దానం జీవితాలను కాపాడింది. మరోసారి దానం చేయగలరా?\n\n"
                "నిర్ధారించడానికి 'అవును' అని జవాబివ్వండి లేదా +91-800-BRIDGE కి కాల్ చేయండి.\n\n"
                "కృతజ్ఞతలతో,\nBloodBridge AI బృందం 🩸"
            ),
        },
        "reminder": {
            "title": "గుర్తు చేయడం: రక్తం అవసరం",
            "body": (
                "హలో {donor_name},\n\n"
                "{needed_by} నాటికి {blood_group} రక్తం అవసరమైన రోగి గురించి గుర్తు చేస్తున్నాం.\n\n"
                "మీ సమాధానం ఒక జీవితాన్ని కాపాడగలదు.\n\n"
                "BloodBridge AI 🩸"
            ),
        },
        "thank_you": {
            "title": "ధన్యవాదాలు, బ్లడ్ హీరో!",
            "body": (
                "ప్రియమైన {donor_name},\n\n"
                "ధన్యవాదాలు! 🎉 మీ దానం నిర్ధారించబడింది. థాలసేమియా రోగికి సమయానికి రక్తం లభిస్తుంది.\n\n"
                "మీరు నిజమైన బ్లడ్ హీరో. మీ స్ట్రీక్: {streak} దానాలు!\n\n"
                "BloodBridge AI బృందం 🩸"
            ),
        },
        "follow_up": {
            "title": "మేము అర్థం చేసుకుంటున్నాం",
            "body": (
                "హలో {donor_name},\n\n"
                "మీరు ఇప్పుడు దానం చేయలేకపోవడం మేము అర్థం చేసుకుంటున్నాం.\n\n"
                "తదుపరి దానానికి సిద్ధంగా ఉన్నప్పుడు, మేము ఇక్కడ ఉంటాం.\n\n"
                "BloodBridge AI 🩸"
            ),
        },
    },
    "Marathi": {
        "initial": {
            "title": "रक्तदान विनंती",
            "body": (
                "प्रिय {donor_name},\n\n"
                "BloodBridge AI कडून आपल्याशी संपर्क करत आहोत. एका थॅलेसेमिया रुग्णाला {needed_by} पर्यंत "
                "{blood_group} रक्ताची तातडीने गरज आहे.\n\n"
                "आपल्या मागील दानाने जीव वाचले. आपण पुन्हा एकदा दान करू शकाल का?\n\n"
                "पुष्टी करण्यासाठी 'होय' उत्तर द्या किंवा +91-800-BRIDGE वर कॉल करा.\n\n"
                "कृतज्ञतेसह,\nBloodBridge AI संघ 🩸"
            ),
        },
        "reminder": {
            "title": "आठवण: रक्त हवे आहे",
            "body": (
                "नमस्कार {donor_name},\n\n"
                "{needed_by} पर्यंत {blood_group} रक्ताच्या गरजेबद्दल ही आठवण आहे.\n\n"
                "आपला प्रतिसाद एक जीव वाचवू शकतो.\n\n"
                "BloodBridge AI 🩸"
            ),
        },
        "thank_you": {
            "title": "धन्यवाद, ब्लड हीरो!",
            "body": (
                "प्रिय {donor_name},\n\n"
                "धन्यवाद! 🎉 आपले दान निश्चित झाले आहे. थॅलेसेमिया रुग्णाला वेळेवर रक्त मिळेल.\n\n"
                "आपण खरे ब्लड हीरो आहात. आपला स्ट्रीक: {streak} दाने!\n\n"
                "BloodBridge AI संघ 🩸"
            ),
        },
        "follow_up": {
            "title": "आम्हाला समजते — जोडलेले रहा",
            "body": (
                "नमस्कार {donor_name},\n\n"
                "आपण सध्या दान करू शकत नाही हे आम्हाला समजते. हे पूर्णपणे ठीक आहे!\n\n"
                "पुढील दानासाठी तयार असाल तेव्हा आम्ही येथे आहोत.\n\n"
                "BloodBridge AI 🩸"
            ),
        },
    },
}


def generate_message(
    donor_name: str,
    blood_group: str,
    message_type: str,
    language: str,
    needed_by: Optional[str] = None,
    streak: int = 0,
    location_name: Optional[str] = None,
    location_lat: Optional[float] = None,
    location_lon: Optional[float] = None,
) -> dict:
    """
    Generate a localized donor message.
    Uses templates locally; can be swapped to Bedrock for richer AI generation.
    """
    if needed_by is None:
        from datetime import timedelta
        needed_by = (datetime.utcnow() + timedelta(days=5)).strftime("%B %d, %Y")

    lang_messages = MESSAGES.get(language, MESSAGES["English"])
    type_template = lang_messages.get(message_type, lang_messages["initial"])

    body = type_template["body"].format(
        donor_name=donor_name,
        blood_group=blood_group,
        needed_by=needed_by,
        streak=streak,
    )

    if location_name or (location_lat and location_lon):
        location_text = "\n📍 Location:"
        if location_name:
            location_text += f" {location_name}"
        if location_lat and location_lon:
            location_text += f"\n🗺️ Maps: https://maps.google.com/?q={location_lat},{location_lon}"
        
        if "With gratitude," in body:
            body = body.replace("With gratitude,", f"{location_text}\n\nWith gratitude,")
        elif "आभार" in body:
            body = body.replace("आभार", f"{location_text}\n\nआभार")
        elif "కృతజ్ఞతలతో," in body:
            body = body.replace("కృతజ్ఞతలతో,", f"{location_text}\n\nకృతజ్ఞతలతో,")
        elif "कृतज्ञतेसह," in body:
            body = body.replace("कृतज्ञतेसह,", f"{location_text}\n\nकृतज्ञतेसह,")
        else:
            body += f"\n{location_text}"

    if settings.use_bedrock:
        body = _generate_with_bedrock(donor_name, blood_group, message_type, language, needed_by, streak, location_name, location_lat, location_lon)

    return {
        "title": type_template["title"],
        "body": body,
        "language": language,
        "message_type": message_type,
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "ai_powered": settings.use_bedrock,
    }


def _generate_with_bedrock(
    donor_name: str, blood_group: str, message_type: str,
    language: str, needed_by: str, streak: int,
    location_name: Optional[str] = None, location_lat: Optional[float] = None, location_lon: Optional[float] = None
) -> str:
    """Call Amazon Bedrock Claude Haiku to generate a message."""
    try:
        import boto3
        import json

        kwargs = {"region_name": settings.bedrock_region}
        if settings.aws_access_key_id and settings.aws_access_key_id != "local":
            kwargs["aws_access_key_id"] = settings.aws_access_key_id
            kwargs["aws_secret_access_key"] = settings.aws_secret_access_key
            
        client = boto3.client("bedrock-runtime", **kwargs)

        prompt = (
            f"You are a compassionate blood donation coordinator. Generate a {message_type} message in {language} "
            f"for a blood donor named {donor_name} who has {streak} previous donations. "
            f"The patient urgently needs {blood_group} blood by {needed_by}. "
        )
        if location_name:
            prompt += f"The required location for donation is {location_name}. "
        if location_lat and location_lon:
            prompt += f"Include this Google Maps link: https://maps.google.com/?q={location_lat},{location_lon}. "
            
        prompt += "Keep it warm, personal, and motivating. Max 150 words. End with 'BloodBridge AI 🩸'"

        body = json.dumps({
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 300,
            "messages": [{"role": "user", "content": prompt}]
        })

        response = client.invoke_model(
            modelId=settings.bedrock_model_id,
            body=body,
            contentType="application/json",
            accept="application/json"
        )

        result = json.loads(response["body"].read())
        return result["content"][0]["text"]
    except Exception as e:
        logger.error("Bedrock generation failed: %s", e)
        # Fallback to template
        return MESSAGES.get(language, MESSAGES["English"]).get(message_type, {}).get("body", "")

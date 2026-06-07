from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Dict, Optional
import logging
from config.settings import settings
import json
from services.automation_service import run_outreach_automation

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/chatbot", tags=["chatbot"])

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage]

@router.post("")
def ai_scheduler_chat(req: ChatRequest):
    """
    AI Chatbot endpoint for Coordinators to schedule automations and query data.
    Uses AWS Bedrock Claude 3 with Tool Use.
    """
    if not settings.use_bedrock:
        # Fallback local dummy logic if Bedrock is disabled
        user_msg = req.messages[-1].content.lower()
        if "run" in user_msg or "schedule" in user_msg or "automate" in user_msg:
            res = run_outreach_automation()
            return {"response": f"I've successfully run the outreach automation! Sent {res['messages_sent']} messages to donors for {res['patients_processed']} critical patients."}
        return {"response": "I am the AI Scheduling Assistant. You can ask me to 'run outreach automation' or 'schedule donor notifications'."}

    try:
        import boto3
        kwargs = {"region_name": settings.bedrock_region}
        if settings.aws_access_key_id and settings.aws_access_key_id != "local":
            kwargs["aws_access_key_id"] = settings.aws_access_key_id
            kwargs["aws_secret_access_key"] = settings.aws_secret_access_key
        client = boto3.client("bedrock-runtime", **kwargs)
        
        converse_messages = []
        for m in req.messages:
            role = m.role if m.role in ["user", "assistant"] else "user"
            
            # 1. Skip leading non-user messages
            if not converse_messages and role != "user":
                continue
                
            # 2. Merge consecutive messages of the same role
            if converse_messages and converse_messages[-1]["role"] == role:
                converse_messages[-1]["content"][0]["text"] += "\n" + m.content
                continue
                
            converse_messages.append({
                "role": role,
                "content": [{"text": m.content}]
            })
            
        if not converse_messages:
            converse_messages.append({"role": "user", "content": [{"text": "Hello"}]})
            
        system_prompt = (
            "You are an AI Scheduling Assistant for BloodBridge AI Coordinators. "
            "You help run automated scripts, send donor notifications, and schedule tasks. "
            "If the user asks to run automation, schedule messages, or notify donors for upcoming transfusions, "
            "you MUST call the `run_outreach_automation` tool. "
            "Keep your responses concise, professional, and helpful."
        )
        
        converse_tools = [
            {
                "toolSpec": {
                    "name": "run_outreach_automation",
                    "description": "Trigger the backend automation job that finds critical patients, runs AI matching, and sends WhatsApp messages to top donors automatically.",
                    "inputSchema": {
                        "json": {
                            "type": "object",
                            "properties": {}
                        }
                    }
                }
            }
        ]

        try:
            response = client.converse(
                modelId=settings.bedrock_model_id,
                messages=converse_messages,
                system=[{"text": system_prompt}],
                inferenceConfig={"maxTokens": 512, "temperature": 0.2},
                toolConfig={"tools": converse_tools}
            )
            
            output_message = response['output']['message']
            
            # Handle Tool Call
            for content in output_message['content']:
                if 'toolUse' in content:
                    tool_use = content['toolUse']
                    if tool_use['name'] == 'run_outreach_automation':
                        logger.info("AI invoked run_outreach_automation tool")
                        res = run_outreach_automation()
                        return {"response": f"✅ Automation complete! Sent {res['messages_sent']} WhatsApp alerts for {res['patients_processed']} critical patients."}
            
            # Return regular text
            return {"response": output_message['content'][0]['text']}
            
        except Exception as e:
            logger.warning(f"Bedrock API failed or does not support tools. Falling back to manual logic. Error: {e}")
            user_msg = req.messages[-1].content.lower()
            if "run" in user_msg or "schedule" in user_msg or "automate" in user_msg or "outreach" in user_msg:
                res = run_outreach_automation()
                return {"response": f"✅ Outreach automation triggered successfully! Sent {res['messages_sent']} messages for {res['patients_processed']} critical patients."}
            return {"response": "I am the AI Scheduling Assistant. (Bedrock models are currently restricted on your AWS account, running in local fallback mode). You can say 'run outreach automation' and I will trigger it manually for you."}
        
    except Exception as e:
        logger.error("Chatbot Error: %s", e)
        return {"response": f"AWS Error: {str(e)}"}

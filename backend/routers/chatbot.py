from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Dict, Optional
import logging
from config.settings import settings
import json
import httpx
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
    Supports AWS Bedrock and xAI Grok.
    """
    
    # 1. Grok API Support
    if settings.grok_api_key:
        try:
            messages = [{"role": "system", "content": "You are an AI Scheduling Assistant for BloodBridge AI Coordinators. You help run automated scripts, send donor notifications, and schedule tasks. If the user asks to run automation, schedule messages, or notify donors for upcoming transfusions, you MUST call the `run_outreach_automation` tool. Keep your responses concise, professional, and helpful."}]
            for m in req.messages:
                messages.append({"role": m.role if m.role in ["user", "assistant"] else "user", "content": m.content})
                
            tools = [{
                "type": "function",
                "function": {
                    "name": "run_outreach_automation",
                    "description": "Trigger the backend automation job that finds critical patients, runs AI matching, and sends WhatsApp messages to top donors automatically."
                }
            }]
            
            with httpx.Client() as client:
                response = client.post(
                    "https://api.x.ai/v1/chat/completions",
                    headers={"Authorization": f"Bearer {settings.grok_api_key}"},
                    json={
                        "model": "grok-beta",
                        "messages": messages,
                        "tools": tools,
                        "temperature": 0.2
                    },
                    timeout=30.0
                )
            
            res_data = response.json()
            if response.status_code != 200:
                logger.error(f"Grok API Error: {res_data}")
                raise Exception(f"Grok Error: {response.status_code}")
                
            message = res_data["choices"][0]["message"]
            
            # Check for tool calls
            if message.get("tool_calls"):
                for tool_call in message["tool_calls"]:
                    if tool_call["function"]["name"] == "run_outreach_automation":
                        logger.info("Grok AI invoked run_outreach_automation tool")
                        res = run_outreach_automation()
                        return {"response": f"✅ Automation complete! Sent {res['messages_sent']} WhatsApp alerts for {res['patients_processed']} critical patients."}
            
            return {"response": message.get("content", "I processed that for you.")}
            
        except Exception as e:
            logger.error(f"Grok Chatbot Error: {e}")
            user_msg = req.messages[-1].content.lower()
            if "run" in user_msg or "schedule" in user_msg or "automate" in user_msg or "outreach" in user_msg:
                res = run_outreach_automation()
                return {"response": f"✅ Outreach automation triggered successfully! Sent {res['messages_sent']} messages for {res['patients_processed']} critical patients."}
            return {"response": f"Grok API Error: {str(e)}"}

    # 2. Bedrock API Support
    if not settings.use_bedrock:
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
            if not converse_messages and role != "user":
                continue
            if converse_messages and converse_messages[-1]["role"] == role:
                converse_messages[-1]["content"][0]["text"] += "\n" + m.content
                continue
            converse_messages.append({"role": role, "content": [{"text": m.content}]})
            
        if not converse_messages:
            converse_messages.append({"role": "user", "content": [{"text": "Hello"}]})
            
        system_prompt = "You are an AI Scheduling Assistant for BloodBridge AI Coordinators. You help run automated scripts, send donor notifications, and schedule tasks. If the user asks to run automation, schedule messages, or notify donors for upcoming transfusions, you MUST call the `run_outreach_automation` tool. Keep your responses concise, professional, and helpful."
        
        converse_tools = [{
            "toolSpec": {
                "name": "run_outreach_automation",
                "description": "Trigger the backend automation job that finds critical patients, runs AI matching, and sends WhatsApp messages to top donors automatically.",
                "inputSchema": {"json": {"type": "object", "properties": {}}}
            }
        }]

        try:
            response = client.converse(
                modelId=settings.bedrock_model_id,
                messages=converse_messages,
                system=[{"text": system_prompt}],
                inferenceConfig={"maxTokens": 512, "temperature": 0.2},
                toolConfig={"tools": converse_tools}
            )
            
            output_message = response['output']['message']
            for content in output_message['content']:
                if 'toolUse' in content:
                    if content['toolUse']['name'] == 'run_outreach_automation':
                        res = run_outreach_automation()
                        return {"response": f"✅ Automation complete! Sent {res['messages_sent']} WhatsApp alerts for {res['patients_processed']} critical patients."}
            return {"response": output_message['content'][0]['text']}
            
        except Exception as e:
            user_msg = req.messages[-1].content.lower()
            if "run" in user_msg or "schedule" in user_msg or "automate" in user_msg or "outreach" in user_msg:
                res = run_outreach_automation()
                return {"response": f"✅ Outreach automation triggered successfully! Sent {res['messages_sent']} messages for {res['patients_processed']} critical patients."}
            return {"response": "I am the AI Scheduling Assistant. (Bedrock models are currently restricted on your AWS account). You can say 'run outreach automation' and I will trigger it manually for you."}
        
    except Exception as e:
        return {"response": f"AWS Error: {str(e)}"}

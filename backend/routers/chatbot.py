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
        kwargs = {"region_name": settings.aws_region}
        if settings.aws_access_key_id and settings.aws_access_key_id != "local":
            kwargs["aws_access_key_id"] = settings.aws_access_key_id
            kwargs["aws_secret_access_key"] = settings.aws_secret_access_key
        client = boto3.client("bedrock-runtime", **kwargs)
        
        # Format history for Claude 3 Messages API
        formatted_messages = []
        for m in req.messages:
            formatted_messages.append({"role": m.role if m.role in ["user", "assistant"] else "user", "content": m.content})
            
        system_prompt = (
            "You are an AI Scheduling Assistant for BloodBridge AI Coordinators. "
            "You help run automated scripts, send donor notifications, and schedule tasks. "
            "If the user asks to run automation, schedule messages, or notify donors for upcoming transfusions, "
            "you MUST call the `run_outreach_automation` tool. "
            "Keep your responses concise, professional, and helpful."
        )
        
        tools = [
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
        
        body = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 512,
            "system": system_prompt,
            "messages": formatted_messages,
            "tools": tools,
            "temperature": 0.2
        }

        response = client.invoke_model(
            modelId=settings.bedrock_model_id,
            body=json.dumps(body),
            contentType="application/json",
            accept="application/json"
        )
        
        result = json.loads(response["body"].read())
        
        # Handle Tool Call
        if result["stop_reason"] == "tool_use":
            for content_block in result["content"]:
                if content_block["type"] == "tool_use":
                    tool_name = content_block["name"]
                    if tool_name == "run_outreach_automation":
                        logger.info("AI invoked run_outreach_automation tool")
                        res = run_outreach_automation()
                        
                        # Return final summary directly since we don't strictly need a second loop for simple tasks
                        summary = f"Automation completed successfully. Processed {res['patients_processed']} critical patients and sent {res['messages_sent']} WhatsApp notifications to matched donors."
                        return {"response": summary}
                        
        # Standard response
        text = "".join([c["text"] for c in result["content"] if c["type"] == "text"])
        return {"response": text}
        
    except Exception as e:
        logger.error("Chatbot Error: %s", e)
        return {"response": "I encountered an error connecting to the AI brain. But I can tell you that the automation service is available. (Local Fallback)"}

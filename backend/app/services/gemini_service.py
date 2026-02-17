import google.generativeai as genai
from app.config import settings
import json

from app.prompts import INTENT_DETECTION_PROMPT, RESPONSE_GENERATION_PROMPT, TOOL_SYSTEM_PROMPT

class GeminiService:
    def __init__(self):
        genai.configure(api_key=settings.GOOGLE_API_KEY)
        
        # Define tools
        self.tools = [
            {
                "function_declarations": [
                    {
                        "name": "get_weather",
                        "description": "Get the current weather for a specific city.",
                        "parameters": {
                            "type": "OBJECT",
                            "properties": {
                                "city": {"type": "STRING", "description": "The city name, e.g. Mumbai, London"}
                            },
                            "required": ["city"]
                        }
                    },
                    {
                        "name": "get_news",
                        "description": "Get the latest news headlines for a specific topic.",
                        "parameters": {
                            "type": "OBJECT",
                            "properties": {
                                "topic": {"type": "STRING", "description": "The news topic, e.g. Technology, Sports"}
                            },
                            "required": ["topic"]
                        }
                    },
                    {
                        "name": "search_web",
                        "description": "Search the internet for information on a given query.",
                        "parameters": {
                            "type": "OBJECT",
                            "properties": {
                                "query": {"type": "STRING", "description": "The search query"}
                            },
                            "required": ["query"]
                        }
                    }
                ]
            }
        ]
        
        self.model = genai.GenerativeModel('gemini-2.5-flash-lite', tools=self.tools)

    @staticmethod
    def _extract_text_from_chunk(chunk) -> str:
        """
        Safely extract text from streamed Gemini chunks.
        Avoids using chunk.text directly, which can raise when no valid text part exists.
        """
        candidates = getattr(chunk, "candidates", None) or []
        for candidate in candidates:
            content = getattr(candidate, "content", None)
            parts = getattr(content, "parts", None) or []
            text_parts = []
            for part in parts:
                text_value = getattr(part, "text", None)
                if text_value:
                    text_parts.append(text_value)
            if text_parts:
                return "".join(text_parts)
        return ""

    async def determine_intent(self, user_text: str):
        # Deprecated: Kept for backward compatibility if needed, but we prefer tool use now.
        prompt = INTENT_DETECTION_PROMPT.format(user_text=user_text)
        response = self.model.generate_content(
            prompt,
            generation_config=genai.GenerationConfig(
                response_mime_type="application/json",
                temperature=0.1,
                max_output_tokens=50,
            )
        )
        try:
            return json.loads(response.text)
        except:
            return {"intent": "general", "parameters": {}}

    async def generate_response(self, user_text: str, context_data: str = "") -> str:
        prompt = RESPONSE_GENERATION_PROMPT.format(user_text=user_text, context_data=context_data)
        response = await self.model.generate_content_async(
            prompt,
             generation_config=genai.GenerationConfig(
                temperature=0.7, 
                max_output_tokens=100,
            )
        )
        return response.text

    async def generate_response_with_tools(self, user_text: str):
        """
        Generates a response stream. 
        Yields strings for text parts.
        Yields a dict {"tool_call": ...} if the model wants to call a tool.
        """
        # We need a chat session to handle multi-turn if tool is called
        chat = self.model.start_chat(enable_automatic_function_calling=False) # Manual handling
        
        # We use a simplified prompt for tool use mode
        # Strict Tool Routing Prompt
        # Strict Tool Routing Prompt
        prompt = TOOL_SYSTEM_PROMPT.format(user_text=user_text)
        
        response = await chat.send_message_async(
            prompt,
            stream=True,
            generation_config=genai.GenerationConfig(
                temperature=0.2,
                max_output_tokens=55,
            )
        )
        
        async for chunk in response:
            # Check for function call
            # Note: In stream, function call usually comes in the first chunk(s) and has no text.
            
            # 1. Check if it's a function call
            if chunk.candidates and chunk.candidates[0].content.parts:
                part = chunk.candidates[0].content.parts[0]
                if part.function_call:
                    fc = part.function_call
                    yield {
                        "type": "tool_call",
                        "name": fc.name,
                        "args": dict(fc.args)
                    }
                    return # Stop yielding, caller must handle tool and recall

            # 2. Check for text
            text = self._extract_text_from_chunk(chunk)
            if text:
                yield text

    async def generate_response_from_tool_output(self, user_text: str, tool_name: str, tool_output: str):
         # This is a one-shot generation after tool execution
         # We instruct the model to answer based on the tool output
         prompt = f"""User said: "{user_text}"
Tool '{tool_name}' returned: {tool_output}
Please provide a concise answer based on this information."""
         
         response = await self.model.generate_content_async(
            prompt,
            stream=True,
            generation_config=genai.GenerationConfig(
                temperature=0.4,
                max_output_tokens=70,
            )
         )
         async for chunk in response:
             text = self._extract_text_from_chunk(chunk)
             if text:
                 yield text

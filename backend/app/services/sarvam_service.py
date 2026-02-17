import asyncio
import base64
import json
import logging
import time
from typing import AsyncGenerator, Literal, Optional

import websockets
from app.config import settings

logger = logging.getLogger(__name__)

OutputMode = Literal["transcribe", "translate", "verbatim", "translit", "codemix"]

class SarvamService:
    """
    Service for Sarvam AI integration using raw WebSockets based on AsyncAPI spec.
    """

    def __init__(self):
        self.api_key = settings.SARVAM_API_KEY
        self.base_url = "wss://api.sarvam.ai"

    async def speech_to_text_streaming(
        self,
        audio_generator: AsyncGenerator[bytes, None],
        language_code: str = "hi-IN",
        model: str = "saaras:v3",
        output_mode: OutputMode = "codemix"
    ) -> AsyncGenerator[dict, None]:
        """
        STT Streaming using /speech-to-text/ws
        """
        # Construct URL with query parameters
        url = (
            f"{self.base_url}/speech-to-text/ws?"
            f"model={model}&"
            f"language-code={language_code}&"
            f"mode={output_mode}&"
            f"sample_rate=16000&"
            f"input_audio_codec=pcm_s16le&"  # Explicitly state input is raw PCM 16-bit
            f"vad_signals=true"
        )
        
        headers = {"Api-Subscription-Key": self.api_key}

        try:
            async with websockets.connect(url, extra_headers=headers) as ws:
                logger.info(f"Connected to Sarvam STT (Raw WS): {url}")

                async def send_audio():
                    try:
                        chunk_count = 0
                        async for audio_chunk in audio_generator:
                            if audio_chunk:
                                # Spec implies payload structure: { audio: { data: ..., ... } }
                                audio_b64 = base64.b64encode(audio_chunk).decode("utf-8")
                                payload = {
                                    "audio": {
                                        "data": audio_b64,
                                        "sample_rate": "16000",
                                        "encoding": "audio/wav" 
                                    }
                                }
                                await ws.send(json.dumps(payload))
                                chunk_count += 1
                        
                        # Flush signal
                        await ws.send(json.dumps({"type": "flush"}))
                        logger.info(f"Sent {chunk_count} chunks + flush to STT")
                        
                    except Exception as e:
                        logger.error(f"Error sending audio to STT: {e}", exc_info=True)

                # Send task
                send_task = asyncio.create_task(send_audio())

                # Receive loop with timeout logic
                try:
                    saw_end_speech = False
                    received_any_transcript = False
                    last_transcript_at = 0.0
                    while True:
                        # After flush, keep a short but reliable finalization window.
                        if send_task.done():
                            if saw_end_speech and not received_any_transcript:
                                # END_SPEECH seen but no transcript yet: allow final decode to arrive.
                                timeout = 2.0
                            elif saw_end_speech and received_any_transcript:
                                # Final transcript often trails END_SPEECH a bit; keep a brief grace window.
                                timeout = 0.8
                            else:
                                timeout = 1.0
                        else:
                            timeout = None
                        
                        try:
                            message = await asyncio.wait_for(ws.recv(), timeout=timeout)
                        except asyncio.TimeoutError:
                            if send_task.done():
                                if saw_end_speech:
                                    logger.info("STT finalization window closed after END_SPEECH.")
                                else:
                                    logger.info("STT listening window closed (timeout).")
                                break
                            # If sending is not done but receive timed out - unlikely unless network issues
                            continue 

                        data = json.loads(message)
                        msg_type = data.get("type")
                        # logger.debug(f"STT Message: {data}")

                        if msg_type == "data":
                            # Transcription data
                            payload = data.get("data", {})
                            transcript = payload.get("transcript", "")
                            
                            if transcript:
                                logger.info(f"STT Transcript received: '{transcript}'")
                                received_any_transcript = True
                                last_transcript_at = time.monotonic()
                                yield {
                                    "type": "partial", 
                                    "text": transcript,
                                    "is_final": False
                                }
                        
                        elif msg_type == "error":
                            logger.error(f"STT Error: {data}")
                            yield {"type": "error", "error": str(data)}
                            break 
                        
                        elif msg_type == "events":
                            payload = data.get("data", {})
                            signal = payload.get("signal_type")
                            if signal == "END_SPEECH":
                                saw_end_speech = True
                                logger.info("STT: User stopped speaking (END_SPEECH) - waiting for final transcript.")
                                continue

                except Exception as e:
                    logger.error(f"Error receiving from STT: {e}")

                finally:
                    # Clean up send task if receiving failed/exited early
                    if not send_task.done():
                        send_task.cancel()
                    try:
                        await send_task
                    except asyncio.CancelledError:
                        pass
                    except Exception as e:
                        logger.error(f"Send task cleanup error: {e}")

        except Exception as e:
            logger.error(f"STT Connection Connection failed: {e}")
            yield {"type": "error", "error": str(e)}

    async def text_to_speech_streaming(
        self,
        text_generator: AsyncGenerator[str, None],
        language_code: str = "hi-IN",
        speaker: str = "meera",
        pace: float = 1.0,
        model: str = "bulbul:v3-beta" 
    ) -> AsyncGenerator[bytes, None]:
        """
        TTS Streaming using /text-to-speech/ws
        """
        url = f"{self.base_url}/text-to-speech/ws?model={model}&send_completion_event=true"
        headers = {"Api-Subscription-Key": self.api_key}

        try:
            async with websockets.connect(url, extra_headers=headers) as ws:
                logger.info(f"Connected to Sarvam TTS (Raw WS): {url}")

                # 1. Send Configuration
                config_payload = {
                    "type": "config",
                    "data": {
                        "model": model,
                        "target_language_code": language_code,
                        "speaker": speaker,
                        "pace": pace,
                        "speech_sample_rate": "24000",
                        "output_audio_codec": "linear16", # REQUEST RAW PCM (linear16)
                        "enable_preprocessing": True
                    }
                }
                await ws.send(json.dumps(config_payload))
                logger.info(f"Sent TTS Config: {config_payload}")

                # 2. Send Text Task
                async def send_text_loop():
                    try:
                        async for text_chunk in text_generator:
                            if text_chunk:
                                msg = {
                                    "type": "text",
                                    "data": {"text": text_chunk}
                                }
                                await ws.send(json.dumps(msg))
                        
                        # Flush
                        await ws.send(json.dumps({"type": "flush"}))
                        logger.info("Sent flush to TTS")
                    except Exception as e:
                        logger.error(f"Error sending text to TTS: {e}")

                send_task = asyncio.create_task(send_text_loop())

                # 3. Receive Audio
                try:
                    async for message in ws:
                        data = json.loads(message)
                        msg_type = data.get("type")

                        if msg_type == "audio":
                            audio_b64 = data.get("data", {}).get("audio")
                            if audio_b64:
                                chunk = base64.b64decode(audio_b64)
                                yield chunk
                        
                        elif msg_type == "error":
                            logger.error(f"TTS Error: {data}")
                            break # Assume error is terminal

                        elif msg_type == "event":
                            event_data = data.get("data", {})
                            if event_data.get("event_type") == "final":
                                logger.info("TTS received final event, breaking loop")
                                break
                        
                except Exception as e:
                    logger.error(f"Error receiving from TTS: {e}")
                
                finally:
                    if not send_task.done():
                        send_task.cancel()
                    try:
                        await send_task
                    except asyncio.CancelledError:
                        pass
                    except Exception as e:
                        logger.error(f"TTS Send task cleanup error: {e}")

        except Exception as e:
            logger.error(f"TTS Connection failed: {e}")

    # Convenience wrapper
    async def text_to_speech_simple(
        self,
        text: str,
        language_code: str = "hi-IN",
        speaker: str = "meera",
        pace: float = 1.0
    ) -> AsyncGenerator[bytes, None]:
        
        async def text_gen():
            yield text
        
        async for chunk in self.text_to_speech_streaming(
            text_gen(), language_code, speaker, pace
        ):
            yield chunk

    def detect_language(self, text: str) -> str:
        # Same heuristic
        try:
            has_hindi = any('\u0900' <= char <= '\u097F' for char in text)
            return "hi-IN" if has_hindi else "en-IN"
        except:
            return "hi-IN"

sarvam_service = SarvamService()

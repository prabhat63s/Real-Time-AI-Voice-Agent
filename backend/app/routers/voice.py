"""
Voice Router — 3-step sequential pipeline:
  1. Receive full audio (buffer) → STT (Sarvam saaras:v3)
  2. LLM processing (Gemini 2.5 Flash Lite + Tools)
  3. TTS generation (Sarvam bulbul:v3-beta) → stream audio back
"""

import base64
import json
import logging
import traceback
from typing import AsyncGenerator, Awaitable, Callable

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from fastapi.responses import Response

from app.services.sarvam_service import sarvam_service
from app.services.gemini_service import GeminiService
from app.services.weather_service import WeatherService
from app.services.news_service import NewsService
from app.services.web_search_service import WebSearchService

logger = logging.getLogger(__name__)

router = APIRouter()

# ── Service singletons ────────────────────────────────────────────────
gemini = GeminiService()
weather = WeatherService()
news = NewsService()
web_search = WebSearchService()

INTRO_TEXT = "Namaste, I am Echo. How can I help you?"

# Cache for intro audio
_INTRO_AUDIO_CACHE: bytes = b""


@router.on_event("startup")
async def precompute_intro():
    """Pre-generate the intro audio to make the /intro endpoint instant."""
    global _INTRO_AUDIO_CACHE
    logger.info("Pre-computing intro audio...")
    try:
        pcm_chunks: list[bytes] = []
        async for chunk in sarvam_service.text_to_speech_simple(
            text=INTRO_TEXT,
            language_code="hi-IN",
            speaker="priya",
            pace=1.0,
        ):
            if chunk:
                pcm_chunks.append(chunk)

        if pcm_chunks:
            pcm_data = b"".join(pcm_chunks)
            # Create WAV
            _INTRO_AUDIO_CACHE = _build_wav(pcm_data, sample_rate=24000)
            logger.info(f"Intro audio cached ({len(_INTRO_AUDIO_CACHE)} bytes)")
        else:
            logger.warning("Intro audio generation returned no data")
    except Exception as e:
        logger.error(f"Failed to pre-compute intro audio: {e}")


# ══════════════════════════════════════════════════════════════════════
#  Helper: execute a tool call returned by Gemini
# ══════════════════════════════════════════════════════════════════════
async def _execute_tool(name: str, args: dict) -> str:
    """Run the tool and return a string result."""
    try:
        if name == "get_weather":
            return await weather.get_weather(args.get("city", "Delhi"))
        elif name == "get_news":
            return await news.get_news(args.get("topic", "latest news"))
        elif name == "search_web":
            return await web_search.search_web(args.get("query", ""))
        else:
            return f"Unknown tool: {name}"
    except Exception as e:
        logger.error(f"Tool {name} failed: {e}", exc_info=True)
        return f"Tool error: {e}"


# ══════════════════════════════════════════════════════════════════════
#  WebSocket endpoint  —  /api/voice/ws/voice
# ══════════════════════════════════════════════════════════════════════
@router.websocket("/ws/voice")
async def voice_ws(ws: WebSocket):
    await ws.accept()
    await ws.send_json({"type": "status", "message": "connected"})
    logger.info("WebSocket client connected")

    # Shared audio buffer filled by the receive loop
    audio_buffer: bytearray = bytearray()
    recording = False

    try:
        while True:
            # We use receive_text because frontend sends JSON (base64 inside)
            # Use receive_json for convenience but receive_text gives control 
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue
                
            msg_type = msg.get("type")

            # ── 1. audio_start ────────────────────────────────────
            if msg_type == "audio_start":
                audio_buffer.clear()
                recording = True
                logger.info("Recording started")

            # ── 2. audio_chunk ────────────────────────────────────
            elif msg_type == "audio_chunk" and recording:
                chunk_b64 = msg.get("data", "")
                if chunk_b64:
                    try:
                        # Append raw PCM bytes
                        audio_buffer.extend(base64.b64decode(chunk_b64))
                    except Exception:
                        pass 

            # ── 3. audio_end  →  run the 3-step pipeline ─────────
            elif msg_type == "audio_end":
                if not recording:
                    logger.info("Ignoring stray audio_end while not recording")
                    continue

                recording = False
                audio_bytes = bytes(audio_buffer)
                audio_buffer.clear()

                logger.info(f"Recording ended – {len(audio_bytes)} bytes collected")

                if len(audio_bytes) < 3200:  # < 0.1s at 16kHz
                    await ws.send_json({"type": "no_speech", "message": "No speech detected (too short)"})
                    continue

                # ---------- STEP 1: STT --------------------------------
                import time
                stt_start = time.time()
                logger.info("🎤 [STEP 1] Listening/Processing Speech...")
                try:
                    async def _on_stt_partial(text: str):
                        await ws.send_json({"type": "transcript_partial", "text": text})

                    transcript = await _stt(
                        audio_bytes,
                        on_partial=_on_stt_partial,
                    )
                except Exception as e:
                    logger.error(f"STT error: {e}", exc_info=True)
                    # Don't crash connection, just report error
                    await ws.send_json({"type": "error", "message": "I didn't catch that."})
                    continue
                
                logger.info(f"STT completed in {time.time() - stt_start:.2f}s. Transcript: {transcript}")

                if not transcript or not transcript.strip():
                    await ws.send_json({"type": "no_speech", "message": "No speech detected"})
                    continue

                await ws.send_json({"type": "transcript_final", "text": transcript})

                # ---------- STEP 2: LLM --------------------------------
                await ws.send_json({"type": "thinking"})
                llm_start = time.time()
                logger.info("🧠 [STEP 2] Thinking...")

                try:
                    reply_text = await _llm(transcript)
                except Exception as e:
                    logger.error(f"LLM error: {e}", exc_info=True)
                    await ws.send_json({"type": "error", "message": "I'm having trouble thinking right now."})
                    continue

                logger.info(f"LLM completed in {time.time() - llm_start:.2f}s. Reply: {reply_text}")

                # ---------- STEP 3: TTS ─ stream audio chunks back -----
                tts_start = time.time()
                logger.info("🔊 [STEP 3] Speaking...")
                try:
                    lang = sarvam_service.detect_language(reply_text)
                    chunk_count = 0
                    
                    # Stream audio chunks back to valid WebSocket
                    async for audio_chunk in sarvam_service.text_to_speech_simple(
                        text=reply_text,
                        language_code=lang,
                        speaker="priya",  # Valid speaker for bulbul:v3-beta
                        pace=1.0,
                    ):
                        if audio_chunk:
                            audio_b64 = base64.b64encode(audio_chunk).decode()
                            await ws.send_json({"type": "audio_chunk", "data": audio_b64})
                            chunk_count += 1

                    await ws.send_json({"type": "audio_end", "message": reply_text})
                    logger.info(f"TTS complete – sent {chunk_count} audio chunks. Time: {time.time() - tts_start:.2f}s")
                    
                except Exception as e:
                    logger.error(f"TTS error: {e}", exc_info=True)
                    await ws.send_json({"type": "error", "message": "TTS failed"})

    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")
    except Exception as e:
        logger.error(f"WebSocket error: {e}\n{traceback.format_exc()}")


# ══════════════════════════════════════════════════════════════════════
#  STEP 1  —  Speech-to-Text (Sarvam saaras:v3 via raw WS)
# ══════════════════════════════════════════════════════════════════════
async def _stt(
    pcm_bytes: bytes,
    on_partial: Callable[[str], Awaitable[None]] | None = None,
) -> str:
    """
    Send accumulated PCM-16 kHz audio to Sarvam STT streaming and return
    the final transcript.
    """
    final_text_parts: list[str] = []

    async def audio_gen() -> AsyncGenerator[bytes, None]:
        # Feed audio in ~0.5 s chunks to let STT start decoding earlier.
        chunk_size = 16000
        for i in range(0, len(pcm_bytes), chunk_size):
            yield pcm_bytes[i:i + chunk_size]

    try:
        async for result in sarvam_service.speech_to_text_streaming(
            audio_generator=audio_gen(),
            model="saaras:v3",
            output_mode="codemix",
        ):
            if result.get("type") == "error":
                logger.error(f"STT stream error: {result.get('error')}")
                continue
            
            text = result.get("text", "")
            if text:
                # Update current transcript segment
                if not final_text_parts:
                    final_text_parts.append(text)
                else:
                    final_text_parts[-1] = text

                if on_partial is not None:
                    await on_partial(text)
                    
    except Exception as e:
        logger.error(f"STT execution failed: {e}")
        raise

    return " ".join(final_text_parts).strip()


# ══════════════════════════════════════════════════════════════════════
#  STEP 2  —  LLM (Gemini 2.5 Flash Lite with tool calling)
# ══════════════════════════════════════════════════════════════════════
async def _llm(user_text: str) -> str:
    """
    Run Gemini with tools. If a tool call is returned, execute the tool
    and ask Gemini again for a final spoken answer.
    """
    collected: list[str] = []
    tool_call = None

    async for item in gemini.generate_response_with_tools(user_text):
        if isinstance(item, dict) and item.get("type") == "tool_call":
            tool_call = item
            break
        elif isinstance(item, str):
            collected.append(item)

    # No tool needed → return direct answer
    if tool_call is None:
        return "".join(collected).strip()

    # Tool was requested → execute and generate final answer
    tool_name = tool_call["name"]
    tool_args = tool_call.get("args", {})
    logger.info(f"Tool call: {tool_name}({tool_args})")

    tool_output = await _execute_tool(tool_name, tool_args)
    logger.info(f"Tool result: {tool_output[:200]}")

    # Let Gemini summarize the tool output into a spoken reply
    parts: list[str] = []
    async for chunk in gemini.generate_response_from_tool_output(
        user_text, tool_name, tool_output
    ):
        if isinstance(chunk, str):
            parts.append(chunk)

    return "".join(parts).strip()


# ══════════════════════════════════════════════════════════════════════
#  REST  —  /api/voice/intro   (welcome message TTS)
# ══════════════════════════════════════════════════════════════════════
@router.get("/intro")
async def intro():
    """Return cached intro audio if available, else generate it."""
    global _INTRO_AUDIO_CACHE
    import time
    start_time = time.time()
    
    if _INTRO_AUDIO_CACHE:
        logger.info(f"Intro cache HIT. Returning {len(_INTRO_AUDIO_CACHE)} bytes. Time: {time.time() - start_time:.4f}s")
        return Response(content=_INTRO_AUDIO_CACHE, media_type="audio/wav")

    # Fallback to generation (should be rare if startup succeeds)
    logger.info("Intro cache MISS, generating...")
    pcm_chunks: list[bytes] = []

    try:
        async for chunk in sarvam_service.text_to_speech_simple(
            text=INTRO_TEXT,
            language_code="hi-IN",
            speaker="priya",
            pace=1.0,
        ):
            if chunk:
                pcm_chunks.append(chunk)
    except Exception as e:
        logger.error(f"Failed to generate intro on-demand: {e}")
        return Response(status_code=500, content="Failed to generate intro audio")

    if not pcm_chunks:
        return Response(status_code=500, content="Empty audio generated")

    pcm_data = b"".join(pcm_chunks)
    wav = _build_wav(pcm_data, sample_rate=24000, bits=16, channels=1)
    
    # Update cache
    _INTRO_AUDIO_CACHE = wav
    logger.info(f"Intro cached on-demand. Time: {time.time() - start_time:.4f}s")
    
    return Response(content=wav, media_type="audio/wav")


def _build_wav(pcm: bytes, sample_rate: int = 24000, bits: int = 16, channels: int = 1) -> bytes:
    """Wrap raw PCM bytes in a WAV container."""
    import struct
    data_size = len(pcm)
    byte_rate = sample_rate * channels * bits // 8
    block_align = channels * bits // 8
    header = struct.pack(
        "<4sI4s4sIHHIIHH4sI",
        b"RIFF",
        36 + data_size,
        b"WAVE",
        b"fmt ",
        16,               # chunk size
        1,                # PCM format
        channels,
        sample_rate,
        byte_rate,
        block_align,
        bits,
        b"data",
        data_size,
    )
    return header + pcm

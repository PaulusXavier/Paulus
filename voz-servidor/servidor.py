"""Servidor de voz do Paulus: clona a voz do Paulo Xavier com o XTTS-v2 (modelo aberto da Coqui).

Uso:  VOZ_TOKEN=segredo VOZ_AMOSTRA=amostra/paulo.wav python servidor.py
O Worker do Paulus chama POST /sintetizar {"texto": "..."} com "Authorization: Bearer <VOZ_TOKEN>" e recebe um WAV.
A amostra de voz fica só neste computador. Nunca a coloque no GitHub.
"""
import hashlib
import hmac
import io
import os
import re
import threading
from collections import OrderedDict

os.environ.setdefault("COQUI_TOS_AGREED", "1")  # o XTTS-v2 pede aceite da licença (uso não comercial, CPML) na 1ª execução

import numpy as np
import torch
import uvicorn
from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from scipy.io import wavfile
from TTS.api import TTS

TOKEN = os.environ.get("VOZ_TOKEN", "")
AMOSTRA = os.environ.get("VOZ_AMOSTRA", "amostra/paulo.wav")
MAX_CHARS = 1500
CACHE_MAX = 40
PORTA = int(os.environ.get("PORT", "8020"))

if not TOKEN:
    raise SystemExit("Defina VOZ_TOKEN (uma senha longa). Sem ela qualquer pessoa usaria o seu servidor.")
if not os.path.isfile(AMOSTRA):
    raise SystemExit(f"Não achei a amostra de voz em {AMOSTRA}. Veja o README (gravação de 1 a 3 minutos).")

dispositivo = "cuda" if torch.cuda.is_available() else "cpu"
print(f"Carregando o XTTS-v2 em {dispositivo}...")
tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(dispositivo)
trava = threading.Lock()                 # uma síntese por vez (a GPU/CPU é uma só)
cache: "OrderedDict[str, bytes]" = OrderedDict()
app = FastAPI(title="Voz do Paulus")


class Pedido(BaseModel):
    texto: str


def limpar(t: str) -> str:
    t = re.sub(r"[*_`#>|]", " ", t)
    t = re.sub(r"https?://\S+", " ", t)           # endereço lido letra por letra atrapalha
    return re.sub(r"\s+", " ", t).strip()[:MAX_CHARS]


@app.get("/saude")
def saude():
    return {"ok": True, "dispositivo": dispositivo}


@app.post("/sintetizar")
def sintetizar(p: Pedido, authorization: str = Header(default="")):
    esperado = "Bearer " + TOKEN
    if not hmac.compare_digest(authorization.encode(), esperado.encode()):
        raise HTTPException(401, "Não autorizado.")
    texto = limpar(p.texto)
    if not texto:
        raise HTTPException(400, "Sem texto.")
    chave = hashlib.sha256(texto.encode()).hexdigest()
    if chave in cache:
        cache.move_to_end(chave)
        return Response(cache[chave], media_type="audio/wav")
    with trava:
        amostras = tts.tts(text=texto, speaker_wav=AMOSTRA, language="pt", split_sentences=True)
    sinal = (np.clip(np.asarray(amostras, dtype=np.float32), -1, 1) * 32767).astype(np.int16)
    buf = io.BytesIO()
    wavfile.write(buf, 24000, sinal)               # o XTTS-v2 gera em 24 kHz
    audio = buf.getvalue()
    cache[chave] = audio
    while len(cache) > CACHE_MAX:
        cache.popitem(last=False)
    return Response(audio, media_type="audio/wav")


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=PORTA)   # só local; quem expõe é o túnel (veja o README)

# Voz própria do Paulus (modelo aberto, XTTS-v2)

O Paulus passa a falar com a **sua voz**. O Worker (Cloudflare) não roda o modelo: ele repassa o texto a este servidor, que fica no seu computador (ou num servidor seu) e devolve o áudio. Sem este servidor, o Paulus continua falando com a voz do navegador.

```
console (Ouvir / modo voz) → Worker /voz → túnel HTTPS → servidor.py (XTTS-v2) → áudio
```

## 1. Gravar a amostra

- 1 a 3 minutos, **um arquivo WAV** (mono, 22 kHz ou mais), só a sua voz, sem música, eco nem ventilador.
- Fale como o Paulus deve falar: natural, no ritmo de atendimento, frases completas em português. Leia um texto qualquer em voz normal.
- Salve em `voz-servidor/amostra/paulo.wav`. A pasta `amostra/` está no `.gitignore`: **a gravação não vai para o GitHub**. Sua voz é dado pessoal (LGPD).

## 2. Instalar e rodar

Precisa de Python 3.10 a 3.11. Com placa NVIDIA (CUDA) a resposta sai em poucos segundos; só com processador sai em 20 a 60 s por resposta longa.

```bash
cd voz-servidor
python -m venv .venv && source .venv/bin/activate    # Windows: .venv\Scripts\activate
pip install -r requirements.txt
export VOZ_TOKEN="uma-senha-longa-e-aleatoria"       # Windows: set VOZ_TOKEN=...
python servidor.py
```

Na primeira vez o modelo (cerca de 2 GB) é baixado e pede o aceite da licença. Teste:

```bash
curl -s -X POST http://127.0.0.1:8020/sintetizar -H "Authorization: Bearer $VOZ_TOKEN" -H "Content-Type: application/json" -d '{"texto":"Olá, eu sou o Paulus."}' -o teste.wav
```

## 3. Deixar o Worker alcançar o servidor

O servidor escuta só em `127.0.0.1`. Para o Worker chegar nele, use um túnel da Cloudflare (gratuito):

```bash
cloudflared tunnel --url http://127.0.0.1:8020
```

Ele mostra um endereço `https://alguma-coisa.trycloudflare.com`. (Para um endereço fixo, crie um túnel nomeado no painel Zero Trust.)

## 4. Ligar no Worker

Na pasta do Paulus:

```bash
npx wrangler secret put VOZ_TOKEN      # a mesma senha do passo 2
npx wrangler secret put VOZ_URL        # https://alguma-coisa.trycloudflare.com  (sem barra no fim)
npx wrangler deploy
```

Pronto: o botão "Ouvir" e o modo voz do console passam a usar a sua voz. Se o servidor estiver desligado, o console cai sozinho na voz do navegador (e não insiste por 5 minutos).

## Cuidados

- **Licença:** o XTTS-v2 usa a Coqui Public Model License, que vale para **uso não comercial**. Para uso institucional pago, confira a licença ou use outro modelo.
- **Aviso de voz sintética:** o áudio é uma voz gerada por IA a partir da sua. Deixe claro para a equipe que é o Paulus (IA) falando, não você ao vivo.
- **Só texto de resposta:** o Worker manda ao servidor apenas o texto que o Paulus já respondeu (que passa pelo filtro de dados pessoais). Não guarde os áudios.
- Computador desligado = servidor de voz fora do ar = voz do navegador.

# Rotas salvas do Mapa e rotas (Firebase)

O "Mapa e rotas" do console guarda as rotas salvas no Firestore do projeto **paulusia-de285**, em `users/{uid}/rotas/{id}`,
usando o **mesmo login do console** (ID token do Firebase Authentication, enviado como Bearer na API REST; sem biblioteca).
Vai só: nome, meio de transporte, partida fixa, paradas (até 30), destino e horários. Nunca a posição do aparelho, nome de pessoa, NIS ou CPF.

Sem internet, a gravação fica numa fila local e sobe quando a conexão volta. A lista é reconferida a cada 20 s (é assim que a
rota enviada em um aparelho aparece nos outros).

## Regras do Firestore (Console do Firebase → Firestore → Regras)
Acrescente (e teste no Playground antes de publicar):

```
match /users/{userId}/rotas/{rotaId} {
  allow read, delete: if request.auth != null && request.auth.uid == userId;
  allow create, update: if request.auth != null
    && request.auth.uid == userId
    && rotaId.size() <= 40
    && request.resource.data.keys().hasOnly(['nome', 'modo', 'origem', 'paradas', 'destino', 'saida', 'limite', 'visita', 'criadoEm', 'atualizadoEm'])
    && request.resource.data.keys().hasAll(['nome', 'modo', 'paradas', 'destino', 'atualizadoEm'])
    && request.resource.data.nome is string
    && request.resource.data.nome.size() > 0 && request.resource.data.nome.size() <= 60
    && request.resource.data.modo in ['carro', 'pe', 'bike']
    && request.resource.data.paradas is list
    && request.resource.data.paradas.size() <= 30
    && request.resource.data.destino is map
    && request.resource.data.atualizadoEm is number;
}
```
Sem essa regra o mapa avisa "o Firebase recusou o acesso às rotas".

## CSP do console
O `index.html` libera só o necessário: `style-src 'self'` (mapa-rotas.css), `connect-src` para Nominatim, OSRM e Overpass,
e `img-src` para os blocos do OpenStreetMap e do satélite (ArcGIS).

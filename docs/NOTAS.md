# Anotações e lista de compras (Firebase)

> **Uso individual, sem fins comerciais.** O Paulus é um projeto pessoal de Paulo Xavier e **só ele o usa**. Não é um serviço oferecido ao público nem vendido; o repositório é público apenas por conveniência de publicação. Veja [USO-INDIVIDUAL.md](../USO-INDIVIDUAL.md).

O Paulus guarda anotações pessoais (ex.: itens do supermercado) no **Firestore do mesmo projeto Firebase do login**.
O navegador fala direto com o Firebase usando o seu login; **nada passa pelo Worker nem pela IA**. Só funciona com o login pelo Firebase.
Não é lugar para dado de família: use só para listas e lembretes pessoais.

## 1. Publique esta regra (obrigatório)
Firebase Console → Firestore Database → Regras. **Acrescente** este bloco dentro de `match /databases/{database}/documents { ... }`, sem apagar as regras dos outros apps:

```
match /paulus_notas/{uid}/itens/{id} {
  allow read, write: if request.auth != null && request.auth.uid == uid;
}
```
Cada pessoa lê e grava só a própria lista. Sem a regra, o Paulus avisa que o Firebase recusou o acesso.

## 2. Como usar (por texto ou por voz)
- Botão de lista no cabeçalho: abre o painel (marcar, apagar, adicionar, **Ditar itens**).
- "adicionar leite, pão e ovos na lista" · "preciso comprar sabão em pó" · "comprar café"
- "o que falta comprar?" · "ver minha lista"
- "comprei o leite" · "marcar arroz como comprado"
- "apagar leite da lista" · "apagar as concluídas" · "limpar a lista" (pede confirmação)
No modo voz, a resposta também é falada.

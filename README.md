# Simulados SEFAZ-AL

App pessoal (PWA) para resolver simulados no formato CEBRASPE (Certo/Errado), com escala de certeza 1–3, anotações, revisão e desempenho por matéria e assunto do edital.

- **Sem questões no repositório.** O banco é importado pelo próprio app e fica no Firestore, protegido por login.
- Modos: prova cronometrada, livre com gabarito no final, livre com comentário a cada item.
- Funciona offline (service worker + cache do Firestore) e sincroniza entre aparelhos.

Arquivos: `index.html` (layout e estilos), `app.js` (telas), `store.js` (Firebase ou armazenamento local), `edital.js` (matérias, assuntos e cortes do edital), `config.js` (configuração do Firebase), `firestore.rules` (regras de segurança).

# sistema_contrato

Sistema de gestão de contratos e propostas de venda de imóveis para imobiliária.
Painel web (não instalável), com login por corretor e login central (admin).

## Status atual (v0.1 - esqueleto inicial)

- [x] Schema do banco (Postgres) - contratos, vendedores, compradores, testemunhas, corretores
- [x] Autenticação por corretor (JWT)
- [x] Criar contrato (rascunho) + adicionar vendedor(es)
- [x] Gerar link público para o comprador preencher
- [x] Rota pública de preenchimento (com validação de campos obrigatórios)
- [x] Listagem com filtros: nome, data, financiamento, status, corretor (admin)
- [ ] Geração do PDF final no formato do contrato (aguardando confirmação do layout)
- [ ] Modelo e rotas da proposta (documento separado do contrato - em aberto)
- [ ] Frontend do painel (admin + corretor)
- [ ] Formulário público de preenchimento (frontend)

## Rodando localmente

\`\`\`bash
cp .env.example .env
# preencher DATABASE_URL e JWT_SECRET

npm install
psql $DATABASE_URL -f src/db/schema.sql

npm run dev
\`\`\`

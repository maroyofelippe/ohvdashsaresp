# OHVDashSaresp

Sistema web da **E. E. Prof. Orlando Horácio Vita** para cadastrar avaliações SARESP/simulados, lançar as respostas dos alunos e analisar os resultados. Substitui a prova de conceito `SARESP_OHV_Dashboard.html` (v3.1).

**Stack:** Node.js 20 · Express 4 · EJS + express-ejs-layouts · Sequelize 6 + PostgreSQL 18 (14+ compatível) · Docker Compose · JWT (access 15 min + refresh rotativo 7 dias) · Chart.js 4 (servido localmente) · Jest + Supertest.

---

## 1. Instalação com Docker (padrão)

Pré-requisito: **Docker Desktop** instalado e aberto (no Windows, com WSL 2). Não é preciso ter Node.js nem PostgreSQL na máquina.

```bash
# 1) Variáveis de ambiente (dentro da pasta ohvdashsaresp)
copy .env.example .env        # Linux/macOS: cp .env.example .env
#   gere 3 segredos e cole em JWT_SECRET, REFRESH_SECRET e CSRF_SECRET
#   (ex.: no Docker:  docker run --rm node:20-bookworm-slim node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")

# 2) Subir tudo: PostgreSQL 18 + aplicação + Adminer
docker compose up -d --build

# 3) Acompanhar a inicialização (migrations e seeders rodam sozinhos na primeira subida)
docker compose logs -f app
```

| Serviço | Endereço |
|---|---|
| Aplicação | http://localhost:3000 |
| Adminer (administração do banco) | http://localhost:8080 — sistema **PostgreSQL**, servidor `db`, usuário `ohv`, senha `ohv_dev_pass`, banco `OHVDashSaresp` |
| PostgreSQL (para pgAdmin/DBeaver) | `127.0.0.1:5433` — porta 5433 para não conflitar com um PostgreSQL local na 5432 |

Como funciona:

- **`db`** — `postgres:18`, UTF-8, fuso `America/Sao_Paulo`, dados persistidos no volume `pg_data`. O `scripts/pg-init.sql` cria também o banco de testes `OHVDashSaresp_test` na primeira inicialização.
- **`app`** — imagem do `Dockerfile` (Node 20). O `scripts/docker-entrypoint.sh` espera o PostgreSQL ficar saudável, aplica as **migrations** e os **seeders pendentes** e inicia o servidor. A pasta `seed-data/` é montada no contêiner: deixe nela o `backup_saresp_OHV_2026-11-06.json` para o seeder carregar gabaritos e habilidades.
- **`adminer`** — interface web para consultar o banco.

**O banco do Docker é independente do banco da hospedagem.** Dentro dos contêineres, `DB_HOST`, `DB_NAME`, `DB_USER` e `DB_PASSWORD` do `.env` são substituídos pelos valores do Docker; assim o mesmo `.env` pode continuar apontando para a hospedagem quando a aplicação roda fora do Docker. Para trocar as credenciais/portas do Docker, defina no `.env` (todas opcionais):

```
DOCKER_DB_NAME=OHVDashSaresp      DOCKER_DB_USER=ohv          DOCKER_DB_PASSWORD=ohv_dev_pass
DOCKER_DB_PORT=5433
DOCKER_APP_PORT=3000              DOCKER_ADMINER_PORT=8080    DOCKER_APP_URL=http://localhost:3000
```

> Se mudar `DOCKER_DB_USER`, o banco de testes continua sendo criado com esse usuário como dono (o `pg-init.sql` usa o usuário do contêiner). Credenciais do PostgreSQL só valem na **primeira** criação do volume — para recriar: `npm run docker:reset`.

### Comandos do dia a dia

| Comando | O que faz |
|---|---|
| `npm run docker:up` | `docker compose up -d --build` — sobe/atualiza tudo |
| `npm run docker:logs` | Logs da aplicação |
| `npm run docker:down` | Para os contêineres (os dados ficam no volume) |
| `npm run docker:test` | Roda os 64 testes dentro do contêiner, no banco `OHVDashSaresp_test` |
| `npm run docker:seed` | Reaplica seeders pendentes |
| `npm run docker:sh` | Abre um terminal no contêiner da aplicação |
| `npm run docker:reset` | **Apaga o volume do banco** e sobe do zero (migrations + seeders) |

(Os atalhos `npm run docker:*` exigem Node no computador; sem Node, use os comandos `docker compose …` equivalentes que aparecem no `package.json`.)

### Problemas comuns (Docker)

| Situação | Solução |
|---|---|
| `port is already allocated` | Outra aplicação usa a porta. Troque `DOCKER_APP_PORT`, `DOCKER_DB_PORT` ou `DOCKER_ADMINER_PORT` no `.env`. |
| `app` reinicia com erro de variável | Falta segredo no `.env` (`JWT_SECRET`, `REFRESH_SECRET`, `CSRF_SECRET` ≥ 32 caracteres). Veja `docker compose logs app`. |
| `Access denied for user 'ohv'` após trocar senha | O PostgreSQL guardou a senha antiga no volume — `npm run docker:reset` (apaga os dados do Docker). |
| Mudei o código e não refletiu | `npm run docker:up` (reconstrói a imagem). |
| Volume antigo do MySQL | O volume `mysql_data` de versões anteriores não é usado; para levar os dados, veja "Migrar do MySQL para o PostgreSQL". |

---

## 2. Alternativas sem Docker

### PostgreSQL instalado na máquina ou na hospedagem

Requer Node.js 20+ e PostgreSQL 14 ou superior (alvo: 18). Com o `.env` apontando para o servidor (`DB_PORT=5432`):

```bash
npm install
npm run setup        # cria usuário + bancos (pede a conta admin do PostgreSQL), migrations e seeders
npm run db:check     # diagnóstico: versão, codificação, fuso, extensão unaccent, migrations
npm run dev          # http://localhost:3000
```

O `npm run setup` executa `npm run db:setup` (usuário + bancos + extensão `unaccent`), `npm run db:migrate` e `npm run db:seed`. Em hospedagem onde o banco já é criado pelo painel, basta `npm run db:migrate && npm run db:seed` (o usuário precisa poder executar `CREATE EXTENSION unaccent`, o que o dono do banco pode fazer no PostgreSQL 13+).

| Mensagem | Causa / solução |
|---|---|
| `ECONNREFUSED` | Serviço PostgreSQL parado, host ou porta errados (`DB_HOST`/`DB_PORT`). |
| `password authentication failed` (28P01) | Usuário/senha incorretos — `npm run db:setup` redefine a senha do usuário da aplicação. |
| `database "..." does not exist` (3D000) | O banco não existe — `npm run db:setup`. |
| `permission denied to create extension "unaccent"` | O usuário não é dono do banco: peça ao provedor para habilitar a extensão `unaccent` e rode `npm run db:migrate` de novo. |
| Horários com 3 h de diferença | O sistema grava em `-03:00` (America/Sao_Paulo) pela conexão; não é preciso alterar o fuso do servidor. |

### Migrar do MySQL para o PostgreSQL

O esquema é recriado pelas migrations (nunca converta o dump SQL do MySQL à mão). Para levar os **dados** de um banco MySQL já em uso:

```bash
# 1) No PostgreSQL de destino: só as migrations, SEM seeders (o destino precisa estar vazio)
npm run db:migrate
# 2) Informe a origem (MySQL) no ambiente ou no .env; o destino usa as DB_* de sempre
#    MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE
node scripts/migrar-mysql-para-postgres.js              # simulação: confere tabelas e contagens
node scripts/migrar-mysql-para-postgres.js --executar   # copia tudo numa única transação
```

A cópia respeita as chaves estrangeiras, acerta as sequências (próximos ids) e só confirma se as contagens de todas as tabelas conferirem; em qualquer erro, nada é gravado. Diferenças em relação ao MySQL: não há tipos sem sinal (`UNSIGNED`), a busca por nome/e-mail ignora maiúsculas e acentos via extensão `unaccent`, e comparações exatas de texto (e-mail, sigla, RA) passam a diferenciar maiúsculas de minúsculas — o sistema já grava e-mails em minúsculas.

### Scripts npm (fora do Docker)

| Comando | O que faz |
|---|---|
| `npm run setup` | Prepara o PostgreSQL (usuário + bancos) e aplica migrations e seeders |
| `npm run db:setup` / `db:check` | Só cria bancos e usuário / diagnostica a conexão |
| `npm run dev` / `npm start` | Sobe o servidor |
| `npm run db:migrate` / `db:migrate:undo` | Aplica / desfaz migrations (nunca usamos `sync({ alter })`) |
| `npm run db:seed` | Seeders: admin nativo, estrutura escolar, cabeçalho, avaliação de exemplo, usuários de demonstração (só em dev) |
| `npm run db:reset` | Desfaz tudo, migra e semeia de novo |
| `npm test` | Testes unitários e de integração (usa o banco `DB_NAME_TEST`) |
| `npm run lint` / `npm run format` | ESLint / Prettier |
| `npm run modelos` | Regera as planilhas-modelo vazias em `templates/` |

---

## 2. Perfis de teste

| Perfil | E-mail | Senha | Observação |
|---|---|---|---|
| Admin nativo | valor de `ADMIN_EMAIL` | valor de `ADMIN_PASSWORD` | Troca de senha obrigatória no 1º login; não pode ser excluído nem rebaixado |
| Coordenador (dev) | `coordenacao.demo@professor.educacao.sp.gov.br` | `Demo2026` | Somente leitura |
| Professor (dev) | `ana.demo@professor.educacao.sp.gov.br` | `Demo2026` | Lança no 2º ANO A; vê o 2º ANO B e C |
| Professor (dev) | `bruno.demo@professor.educacao.sp.gov.br` | `Demo2026` | Lança no 2º ANO B |

Os usuários de demonstração só são criados quando `NODE_ENV=development`.

Em desenvolvimento, sem `SMTP_HOST`, os e-mails (confirmação, recuperação de senha, aprovação) aparecem no **console** do servidor com o link.

---

## 3. Primeiros passos

1. Entre como admin e defina a nova senha.
2. **Administração › Importar backup da PoC** → envie `backup_saresp_OHV_2026-11-06.json`. São migrados avaliação, gabarito (escalas MT20/MT21, aspectos e situações do LP17, LP09a/LP09b), alunos e respostas, com relatório. Os KPIs e o ranking ficam idênticos aos do dashboard HTML (há teste automatizado que confere isso).
3. **Alunos › Importar planilha** para as demais turmas (colunas `Nº`, `Nome`, `RA`).
4. Professores se cadastram em `/cadastro` (somente `@professor.educacao.sp.gov.br`), confirmam o e-mail e o admin aprova em **Administração › Aprovações** (contador no menu).
5. **Lançar respostas:** Avaliação → Turma → Disciplina. Digite a letra marcada; o cursor avança sozinho e o salvamento é automático.

> O seeder da avaliação de exemplo lê gabaritos, habilidades e descritores de `seed-data/backup_saresp_OHV_2026-11-06.json`, mas **não** semeia alunos e respostas (dados de crianças) — use a importação do legado para isso. Os arquivos `seed-data/*.json` estão no `.gitignore`.

---

## 4. Regras principais

**Permissões** — fonte única em `src/config/permissions.js`, sempre checadas no servidor (middleware `authorize` + escopo em `escopo.service.js` e nos `scopes` dos models):

- **Admin:** tudo.
- **Coordenador:** lê painel, respostas e gabaritos de todas as turmas; qualquer escrita retorna 403.
- **Professor:** lança e importa respostas **só nas turmas vinculadas**; vê painel e respostas de **todas as turmas da mesma série**/ano letivo; cria avaliações para as séries em que leciona; usa avaliações de outros professores da mesma série. Edita só as avaliações que criou: depois que há respostas lançadas, mudanças estruturais ficam bloqueadas, mas correção de gabarito/peso/anulação é permitida com confirmação, recálculo automático e registro na auditoria.

**Correção** (`src/services/correcao.service.js`, 100% coberto por testes): `pontos = f × peso`.
Objetiva: 1 se igual ao gabarito (`-` branco e `X` rasura valem 0; anulada conta acerto para todos, configurável em `ANULADA_CONTA_ACERTO`). Escalar: pontos do nível ÷ maior pontuação. Produção de texto: situação que zera → 0; senão Σ aspectos ÷ Σ máximos (LP17 = 17). Itens desdobrados são questões com peso próprio; a questão-mãe não entra na grade nem no cálculo. Nota = Σ pontos ÷ Σ pesos. **Ausente ≠ em branco:** ausentes ficam fora das médias.

**Sessão:** access token JWT HS256 (cookie `ohv_at`, 15 min) com `sub`, `role` e `tv`; refresh opaco (cookie `ohv_rt`, `path=/auth/refresh`), guardado com hash, rotacionado a cada uso e com detecção de reuso (revoga a família). Páginas renovam via `GET /auth/refresh?next=…`; chamadas `fetch` recebem 401 `token_expirado` e o cliente renova com `POST /auth/refresh` automaticamente. Troca de senha/desativação incrementa `token_version`.

**Segurança:** helmet com CSP sem `unsafe-inline` para scripts, CSRF double-submit (`csrf-csrf`) em toda escrita, rate limit no login (5 / 15 min por IP+e-mail) e bloqueio após 10 falhas, bcrypt custo 12, uploads só em memória (5 MB, extensão + MIME), proteção contra CSV/fórmula injection nas exportações, auditoria de lançamentos, correções e exportações.

---

## 5. Estrutura

```
src/
  app.js · server.js
  config/        env (validação zod), sequelize-cli, database, permissions (matriz)
  models/        um arquivo por model + index.js (associações)
  migrations/    4 migrations versionadas      seeders/   5 seeders
  middlewares/   authenticate, authorize, csrf, validate, upload, errorHandler
  routes/        web/ (páginas EJS)  ·  api/ (JSON: estrutura, alunos, avaliacoes, lancamentos, painel, admin)
  controllers/   finos: validam, chamam serviço, respondem
  services/      auth, usuarios, escopo, estrutura, alunos, avaliacoes, lancamentos, correcao,
                 estatisticas, insights, importacao, exportacao, legado, auditoria, email, cache, configuracoes
  validators/    schemas zod
  views/         layouts (main, auth, print) · partials · pages
public/          css (tokens, app, print) · js (ES modules por tela) · vendor (Chart.js) · img
seed-data/       estrutura canônica do simulado + backup da PoC (não versionado)
templates/       planilhas-modelo vazias
tests/           unit/ · integration/ · helpers/ (inclui o porte da lógica da PoC para conferência)
```

### API (JSON, sob `/api`, autenticada)

`GET /lancamentos/opcoes` · `GET /lancamentos/grade?avaliacao&turma&disciplina` · `PATCH /lancamentos` (autosave em lote) · `POST /lancamentos/importar/previa|confirmar` · `GET /lancamentos/modelo|exportar`
`GET /painel/opcoes|alunos|dados` · `GET /painel/:visao` (kpis, questoes, ranking, habilidades, comparativo, mapa, texto, escalares, insights) · `GET /painel/exportar?visao&formato=xlsx|csv`
`GET|POST /avaliacoes` · `GET|PUT|DELETE /avaliacoes/:id` · `PUT /avaliacoes/:id/estrutura` · `PATCH /avaliacoes/:id/status` · `POST /avaliacoes/:id/duplicar` · `GET /avaliacoes/:id/gabarito` · `POST /avaliacoes/:id/gabarito/importar`
`/alunos`, `/estrutura/{anos,series,turmas}`, `/admin/{usuarios,configuracoes,auditoria,legado}`.
Erros padronizados: `{ "erro": "...", "detalhes": { ... } }`.

---

## 6. Testes

```bash
npm test
```

64 testes: correção (todos os tipos, desdobradas, situação que zera, anulada, recálculo), insights, domínio de e-mail, parsers de importação, fluxo cadastro → confirmação → aprovação → login → refresh → logout (com detecção de reuso), escopos (professor 403 em turma alheia, vê a mesma série, não vê outra série; coordenador 403 em escrita; admin tudo), importação de respostas no layout da PoC e **equivalência dos KPIs/ranking com a PoC** usando o backup real (quando presente em `seed-data/`).

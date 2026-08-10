# 🚔 Escrivania Criminal — 4° DP de Taubaté

Sistema web de gestão de inquéritos policiais desenvolvido para o escrivão do **4° Distrito Policial de Taubaté - SP**.

## 🌐 Acesso

- **Sistema:** https://escrivania-criminal-2.onrender.com
- **Repositório:** https://github.com/fabiofem/escrivania-criminal

## 🛠 Stack Tecnológica

| Camada | Tecnologia |
|--------|-----------|
| Backend | Node.js + Express |
| Banco de Dados | PostgreSQL (Render) |
| Frontend | HTML + CSS + JavaScript puro |
| Hospedagem | Render.com (plano gratuito) |
| Autenticação Google | OAuth2 (googleapis) |

## 📁 Estrutura do Projeto

```
escrivania-criminal/
├── server.js          # Backend principal (API REST)
├── package.json       # Dependências Node.js
├── public/
│   ├── index.html     # Frontend completo (SPA)
│   └── logo.png       # Logo Polícia Civil SP
└── README.md
```

## 🗄 Banco de Dados

### Tabelas

#### `inqueritos`
Tabela principal com os procedimentos policiais.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | SERIAL PK | ID interno |
| ano | TEXT | Ano do procedimento |
| cnj | TEXT UNIQUE | Número CNJ (chave única) |
| inquerito | TEXT | Número do inquérito (IPE) |
| bo | TEXT | Número do boletim de ocorrência |
| natureza | TEXT | Natureza criminal |
| autor | TEXT | Nome do autor |
| vitima | TEXT | Nome da vítima |
| relatado | TEXT | Sim/Não — relatado ao MP |
| cota_mp | TEXT | Sim/Não — cota do MP |
| prazo | TEXT | Prazo do procedimento |
| arquivamento | TEXT | Sim/Não |
| anp | TEXT | Sim/Não — arquivamento sem punição |
| denuncia | TEXT | Sim/Não — denúncia oferecida |
| tipo_inquerito | TEXT | Portaria / Auto de Prisão Em Flagrante / Requisição MP |
| tipo_procedimento | TEXT | Inquérito Policial / Termo Circunstanciado / Ato Infracional |
| objetos_apreendidos | TEXT | Objetos apreendidos |
| pendencias | TEXT | Pendências do procedimento |
| atualizado | TEXT | Data da última atualização |

#### `oitivas`
Intimações e oitivas agendadas.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | SERIAL PK | ID interno |
| cnj | TEXT | CNJ do inquérito vinculado |
| inquerito | TEXT | Número do inquérito |
| pessoa_nome | TEXT | Nome do intimado |
| tipo_envolvimento | TEXT | Qualidade (Vítima, Autor, etc.) |
| telefone | TEXT | Telefone para contato |
| data_oitiva | DATE | Data da intimação |
| hora | TEXT | Hora da intimação |
| local_oitiva | TEXT | Local |
| status | TEXT | Agendada / Realizada / Cancelada / Remarcada |
| calendar_event_id | TEXT | ID do evento no Google Calendar |
| observacoes | TEXT | Observações |

#### `envolvidos`
Pessoas envolvidas em cada inquérito.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | SERIAL PK | ID interno |
| inquerito_id | INTEGER FK | Referência ao inquérito |
| nome | TEXT | Nome completo |
| tipo_envolvimento | TEXT | Vítima / Autor / Investigado / etc. |
| rg | TEXT | RG |
| cpf | TEXT | CPF |
| data_nascimento | DATE | Data de nascimento |
| telefone | TEXT | Telefone |
| endereco | TEXT | Endereço |
| observacoes | TEXT | Observações |

#### `cotas`
Histórico de cotas do MP por inquérito.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | SERIAL PK | ID interno |
| inquerito_id | INTEGER FK | Referência ao inquérito |
| data_recebimento | DATE | Data de recebimento da cota |
| descricao | TEXT | O que o MP solicitou |
| acoes | TEXT | Ações realizadas |
| status | TEXT | Pendente / Em andamento / Cumprida / Parcialmente cumprida |

#### `config`
Configurações do sistema (tokens Google Calendar).

| Campo | Tipo | Descrição |
|-------|------|-----------|
| chave | TEXT PK | Nome da configuração |
| valor | TEXT | Valor |

## 🔌 API REST

### Inquéritos
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | /api/inqueritos | Listar todos (com busca opcional ?search=) |
| POST | /api/inqueritos | Criar novo |
| PUT | /api/inqueritos/:id | Atualizar |
| DELETE | /api/inqueritos/:id | Remover |
| POST | /api/importar | Importar planilha Excel |
| GET | /api/stats | Estatísticas gerais |

### Oitivas / Intimações
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | /api/oitivas | Listar (com filtro ?cnj=) |
| POST | /api/oitivas | Criar nova |
| PUT | /api/oitivas/:id | Atualizar |
| DELETE | /api/oitivas/:id | Remover |
| POST | /api/oitivas/:id/calendar-event | Salvar eventId do Calendar |

### Envolvidos
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | /api/envolvidos/todos | Todos os envolvidos |
| GET | /api/envolvidos/:inqId | Envolvidos de um inquérito |
| POST | /api/envolvidos | Criar |
| PUT | /api/envolvidos/:id | Atualizar |
| DELETE | /api/envolvidos/:id | Remover |

### Cotas do MP
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | /api/cotas/:inqId | Cotas de um inquérito |
| POST | /api/cotas | Criar |
| PUT | /api/cotas/:id | Atualizar |
| DELETE | /api/cotas/:id | Remover |

### Google Calendar
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | /auth/google | Iniciar autenticação OAuth2 |
| GET | /auth/callback | Callback OAuth2 |
| GET | /api/google/status | Status da conexão |
| GET | /api/google/eventos | Buscar eventos do calendário |
| POST | /api/google/evento | Criar evento |
| DELETE | /api/google/evento/:id | Remover evento |
| POST | /api/google/desconectar | Desconectar |

### Utilitários
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | /api/logs | Últimas 100 entradas de log |
| GET | /api/migrar-agora | Migração de emergência do banco |
| GET | /api/debug/oitivas | Debug das oitivas |
| POST | /api/reset | Apagar base (senha necessária) |

## ✨ Funcionalidades

### Inquéritos Policiais
- ✅ Cadastro manual de procedimentos
- ✅ Importação via planilha Excel (.xlsx)
- ✅ Exportação Excel com 7 abas (Todos, Em Andamento, Relatados, Cotas MP, ANP, Arquivados, Com Denúncia)
- ✅ Exportação PDF
- ✅ Busca por CNJ, BO, autor, vítima, envolvido, natureza, ano, prazo
- ✅ Ordenação clicável em todas as colunas
- ✅ Filtros por ano, natureza criminal, tipo de inquérito
- ✅ Linhas em cinza para procedimentos encerrados (Arquivado/ANP/Denúncia)

### Abas de Filtro (com contagem)
- ✅ **Todos** — total de procedimentos
- ✅ **Em Andamento** — IP/Flagrante, sem cota, sem relatado, sem arquivamento, sem ANP, sem denúncia
- ✅ **Relatados** — relatados ao MP
- ✅ **Cotas MP** — com cota, IP/Flagrante, sem arquivamento/ANP/denúncia
- ✅ **ANP** — arquivamento sem punição
- ✅ **Arquivados** — arquivados
- ✅ **Com Denúncia** — denúncia oferecida
- ✅ **Atos Infracionais** — tipo procedimento = Ato Infracional
- ✅ **Termos Circunstanciados** — tipo procedimento = Termo Circunstanciado

### Envolvidos
- ✅ Painel lateral por inquérito
- ✅ Cadastro com RG, CPF, nascimento, telefone, endereço
- ✅ Botão WhatsApp direto no card
- ✅ Busca por nome de envolvidos na busca geral

### Cotas do MP
- ✅ Histórico de cotas por inquérito
- ✅ Campos: data de recebimento, descrição, ações realizadas, status
- ✅ Status: Pendente / Em andamento / Cumprida / Parcialmente cumprida
- ✅ Painel lateral com histórico completo

### Intimações (Oitivas)
- ✅ Agendamento com busca de CNJ por digitação
- ✅ Mini-calendário integrado com Google Calendar (Gmail)
- ✅ Visualização de eventos reais da agenda
- ✅ Criação automática de evento no Google Calendar
- ✅ Remoção automática do evento ao excluir intimação
- ✅ Notificação por WhatsApp (link wa.me com mensagem oficial)
- ✅ Notificação por Email (abre Outlook Web)
- ✅ Mensagem de intimação oficial com dados do Dr. Delegado Horácio

### Google Calendar
- ✅ Autenticação OAuth2
- ✅ Tokens persistidos no banco (reconecta automaticamente)
- ✅ Visualização semanal com eventos reais
- ✅ Navegação por semanas e meses
- ✅ Detecção de conflitos de horário

## 📋 Importação Excel

### Colunas reconhecidas
| Coluna na Planilha | Campo no Sistema |
|--------------------|-----------------|
| Ano | ano |
| Nº CNJ | cnj (chave única) |
| Nº Inquérito | inquerito |
| BO | bo |
| Natureza Criminal | natureza |
| Autor | autor |
| Vítima | vitima |
| Relatado (Sim/Não) | relatado |
| COTA - MP solicitou diligências | cota_mp |
| Prazo | prazo |
| Arquivamento | arquivamento |
| ANP | anp |
| Denúncia | denuncia |
| Objetos Apreendidos | objetos_apreendidos |
| Pendências | pendencias |
| Tipo Inquérito | tipo_inquerito |
| Tipo Procedimento | tipo_procedimento |

> **CNJ já existente** → atualiza os dados  
> **CNJ novo** → cria novo registro

## 🔑 Variáveis de Ambiente (Render)

```env
DATABASE_URL=postgresql://...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
APP_URL=https://escrivania-criminal-2.onrender.com
NODE_ENV=production
```

## 🚀 Deploy

- **Plataforma:** Render.com
- **Deploy automático:** a cada commit no branch `main`
- **Deploy manual:** https://api.render.com/deploy/srv-d997ne4s728c73cs1p7g?key=H7DYi9-o_Hk

## 👤 Informações do Sistema

- **Escrivão:** Fabio
- **Delegado:** Dr. Horácio Martins de O. Campos
- **Delegacia:** 4° DP de Taubaté
- **Endereço:** Avenida JK 260, ao lado da Delegacia de Plantão
- **Email institucional:** fabio.moreira2@policiacivil.sp.gov.br

## 📝 Histórico de Versões

| Versão | Descrição |
|--------|-----------|
| v1.0 | Sistema base com importação Excel |
| v2.0 | Google Calendar + oitivas |
| v2.5 | Logo Polícia Civil + controle de versão |
| v2.8 | Mini-calendário integrado Gmail |
| v2.9 | WhatsApp + Email + tokens persistentes |
| v3.0 | Tipo Inquérito + Tipo Procedimento |
| v3.1 | Filtros + ordenação clicável |
| v3.2 | Abas com contagem + Excel multi-abas |
| v3.3 | Cards superiores + Painel Cotas do MP |

---
*Desenvolvido com Claude (Anthropic) — Julho/Agosto 2026*

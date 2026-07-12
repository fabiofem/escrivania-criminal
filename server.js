require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');
const multer = require('multer');
const XLSX = require('xlsx');
const { google } = require('googleapis');

// ── Google OAuth2 ───────────────────────────────────────
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.APP_URL}/auth/callback`
);

// Armazena tokens em memória (para uso single-user)
let googleTokens = null;

function getCalendarClient() {
  if (!googleTokens) return null;
  oauth2Client.setCredentials(googleTokens);
  return google.calendar({ version: 'v3', auth: oauth2Client });
}

const app = express();
const PORT = process.env.PORT || 3000;

// ── Banco de dados ──────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// ── Middleware ──────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  lastModified: false,
  setHeaders: (res, path) => {
    if (path.endsWith('index.html')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

// Log todas as requisições
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const dur = Date.now() - start;
    const status = res.statusCode;
    const icon = status >= 500 ? '❌' : status >= 400 ? '⚠️' : '✅';
    console.log(`${icon} ${req.method} ${req.path} → ${status} (${dur}ms)`);
  });
  next();
});

// Rota de health check e logs recentes
const recentLogs = [];
const origLog = console.log.bind(console);
const origErr = console.error.bind(console);
console.log = (...args) => { 
  const msg = args.join(' ');
  recentLogs.push({ t: new Date().toISOString(), level: 'info', msg });
  if (recentLogs.length > 200) recentLogs.shift();
  origLog(...args);
};
console.error = (...args) => {
  const msg = args.join(' ');
  recentLogs.push({ t: new Date().toISOString(), level: 'error', msg });
  if (recentLogs.length > 200) recentLogs.shift();
  origErr(...args);
};

app.get('/api/logs', (req, res) => {
  res.json(recentLogs.slice(-100).reverse());
});

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, uptime: process.uptime().toFixed(0) + 's', db: 'conectado' });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ── Inicializar tabelas ─────────────────────────────────
async function initDB() {
  // Tabela de inquéritos
  await pool.query(`
    CREATE TABLE IF NOT EXISTS inqueritos (
      id SERIAL PRIMARY KEY,
      ano TEXT,
      cnj TEXT UNIQUE,
      inquerito TEXT,
      bo TEXT,
      natureza TEXT,
      autor TEXT,
      vitima TEXT,
      relatado TEXT DEFAULT 'Não',
      cota_mp TEXT DEFAULT 'Não',
      prazo TEXT,
      arquivamento TEXT DEFAULT 'Não',
      anp TEXT DEFAULT 'Não',
      denuncia TEXT DEFAULT 'Não',
      objetos_apreendidos TEXT,
      pendencias TEXT,
      atualizado TEXT,
      criado_em TIMESTAMP DEFAULT NOW(),
      atualizado_em TIMESTAMP DEFAULT NOW()
    );
  `);

  // Tabela de envolvidos por inquérito
  await pool.query(`
    CREATE TABLE IF NOT EXISTS envolvidos (
      id SERIAL PRIMARY KEY,
      inquerito_id INTEGER REFERENCES inqueritos(id) ON DELETE CASCADE,
      nome TEXT NOT NULL,
      tipo_envolvimento TEXT DEFAULT 'Vítima',
      rg TEXT,
      cpf TEXT,
      data_nascimento DATE,
      telefone TEXT,
      endereco TEXT,
      observacoes TEXT,
      criado_em TIMESTAMP DEFAULT NOW()
    );
  `);


      id SERIAL PRIMARY KEY,
      nome TEXT NOT NULL,
      rg TEXT,
      cpf TEXT,
      data_nascimento DATE,
      observacoes TEXT,
      criado_em TIMESTAMP DEFAULT NOW(),
      atualizado_em TIMESTAMP DEFAULT NOW()
    );
  `);

  // Tabela de telefones da pessoa (múltiplos)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pessoa_telefones (
      id SERIAL PRIMARY KEY,
      pessoa_id INTEGER REFERENCES pessoas(id) ON DELETE CASCADE,
      telefone TEXT NOT NULL,
      tipo TEXT DEFAULT 'Celular'
    );
  `);

  // Tabela de endereços da pessoa (múltiplos)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pessoa_enderecos (
      id SERIAL PRIMARY KEY,
      pessoa_id INTEGER REFERENCES pessoas(id) ON DELETE CASCADE,
      cep TEXT,
      rua TEXT,
      numero TEXT,
      complemento TEXT,
      bairro TEXT,
      cidade TEXT,
      tipo TEXT DEFAULT 'Residencial'
    );
  `);

  // Tabela de oitivas (vincula pessoa ao inquérito)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS oitivas (
      id SERIAL PRIMARY KEY,
      cnj TEXT,
      inquerito TEXT,
      pessoa_id INTEGER REFERENCES pessoas(id) ON DELETE SET NULL,
      pessoa_nome TEXT,
      tipo_envolvimento TEXT DEFAULT 'Vítima',
      data_oitiva DATE,
      hora TEXT,
      local_oitiva TEXT,
      status TEXT DEFAULT 'Agendada',
      observacoes TEXT,
      criado_em TIMESTAMP DEFAULT NOW()
    );
  `);

  // Migrações para tabelas existentes
  await pool.query(`
    ALTER TABLE inqueritos
      ALTER COLUMN natureza TYPE TEXT,
      ALTER COLUMN autor TYPE TEXT,
      ALTER COLUMN vitima TYPE TEXT,
      ALTER COLUMN prazo TYPE TEXT,
      ALTER COLUMN bo TYPE TEXT,
      ALTER COLUMN inquerito TYPE TEXT,
      ALTER COLUMN cnj TYPE TEXT,
      ALTER COLUMN ano TYPE TEXT,
      ALTER COLUMN relatado TYPE TEXT,
      ALTER COLUMN cota_mp TYPE TEXT,
      ALTER COLUMN arquivamento TYPE TEXT,
      ALTER COLUMN anp TYPE TEXT,
      ALTER COLUMN denuncia TYPE TEXT,
      ALTER COLUMN atualizado TYPE TEXT;
  `).catch(() => {});

  // Migrações oitivas — adiciona colunas novas se não existirem
  await pool.query(`ALTER TABLE oitivas ADD COLUMN IF NOT EXISTS pessoa_id INTEGER REFERENCES pessoas(id) ON DELETE SET NULL`).catch(() => {});
  await pool.query(`ALTER TABLE oitivas ADD COLUMN IF NOT EXISTS pessoa_nome TEXT`).catch(() => {});
  await pool.query(`ALTER TABLE oitivas ADD COLUMN IF NOT EXISTS tipo_envolvimento TEXT DEFAULT 'Vítima'`).catch(() => {});
  // Renomeia qualidade -> tipo_envolvimento se existir
  await pool.query(`ALTER TABLE oitivas RENAME COLUMN qualidade TO tipo_envolvimento`).catch(() => {});
  await pool.query(`ALTER TABLE oitivas RENAME COLUMN pessoa TO pessoa_nome`).catch(() => {});
  // Remove telefone da oitiva (agora fica em pessoa_telefones)
  await pool.query(`ALTER TABLE oitivas DROP COLUMN IF EXISTS telefone`).catch(() => {});

  console.log('✅ Banco de dados inicializado');
}

// Helper: converte valor para string segura
function str(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

// Helper: pega valor de múltiplos nomes de coluna possíveis
function col(row, ...keys) {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') {
      return String(row[k]).trim();
    }
  }
  return '';
}

// ════════════════════════════════════════════════════════
// ROTAS — INQUÉRITOS
// ════════════════════════════════════════════════════════

app.get('/api/inqueritos', async (req, res) => {
  try {
    const { search } = req.query;
    let query = 'SELECT * FROM inqueritos';
    let params = [];
    if (search) {
      query += ` WHERE cnj ILIKE $1 OR inquerito ILIKE $1 OR autor ILIKE $1 OR vitima ILIKE $1 OR natureza ILIKE $1 OR bo ILIKE $1`;
      params = [`%${search}%`];
    }
    query += ' ORDER BY atualizado_em DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/inqueritos', async (req, res) => {
  try {
    const d = req.body;
    const hoje = new Date().toLocaleDateString('pt-BR');
    const result = await pool.query(`
      INSERT INTO inqueritos (ano,cnj,inquerito,bo,natureza,autor,vitima,relatado,cota_mp,prazo,arquivamento,anp,denuncia,objetos_apreendidos,pendencias,atualizado)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      ON CONFLICT (cnj) DO UPDATE SET
        ano=$1, inquerito=$3, bo=$4, natureza=$5, autor=$6, vitima=$7,
        relatado=$8, cota_mp=$9, prazo=$10, arquivamento=$11, anp=$12,
        denuncia=$13, objetos_apreendidos=$14, pendencias=$15,
        atualizado=$16, atualizado_em=NOW()
      RETURNING *`,
      [str(d.ano), str(d.cnj), str(d.inquerito), str(d.bo), str(d.natureza),
       str(d.autor), str(d.vitima), str(d.relatado), str(d.cotaMP), str(d.prazo),
       str(d.arquivamento), str(d.anp), str(d.denuncia),
       str(d.objetosApreendidos), str(d.pendencias), `Sim - ${hoje}`]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/inqueritos/:id', async (req, res) => {
  try {
    const d = req.body;
    const hoje = new Date().toLocaleDateString('pt-BR');
    const result = await pool.query(`
      UPDATE inqueritos SET
        ano=$1,cnj=$2,inquerito=$3,bo=$4,natureza=$5,autor=$6,vitima=$7,
        relatado=$8,cota_mp=$9,prazo=$10,arquivamento=$11,anp=$12,
        denuncia=$13,objetos_apreendidos=$14,pendencias=$15,
        atualizado=$16,atualizado_em=NOW()
      WHERE id=$17 RETURNING *`,
      [str(d.ano), str(d.cnj), str(d.inquerito), str(d.bo), str(d.natureza),
       str(d.autor), str(d.vitima), str(d.relatado), str(d.cotaMP), str(d.prazo),
       str(d.arquivamento), str(d.anp), str(d.denuncia),
       str(d.objetosApreendidos), str(d.pendencias), `Sim - ${hoje}`, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/inqueritos/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM inqueritos WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════
// ROTAS — ENVOLVIDOS
// ════════════════════════════════════════════════════════

app.get('/api/envolvidos/:inqId', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM envolvidos WHERE inquerito_id=$1 ORDER BY tipo_envolvimento, nome', [req.params.inqId]);
    res.json(r.rows);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/envolvidos', async (req, res) => {
  try {
    const d = req.body;
    const r = await pool.query(`
      INSERT INTO envolvidos (inquerito_id, nome, tipo_envolvimento, rg, cpf, data_nascimento, telefone, endereco, observacoes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [d.inquerito_id, str(d.nome), str(d.tipo_envolvimento)||'Vítima', str(d.rg), str(d.cpf),
       d.data_nascimento||null, str(d.telefone), str(d.endereco), str(d.observacoes)]
    );
    res.json(r.rows[0]);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/envolvidos/:id', async (req, res) => {
  try {
    const d = req.body;
    const r = await pool.query(`
      UPDATE envolvidos SET nome=$1, tipo_envolvimento=$2, rg=$3, cpf=$4,
        data_nascimento=$5, telefone=$6, endereco=$7, observacoes=$8
      WHERE id=$9 RETURNING *`,
      [str(d.nome), str(d.tipo_envolvimento), str(d.rg), str(d.cpf),
       d.data_nascimento||null, str(d.telefone), str(d.endereco), str(d.observacoes), req.params.id]
    );
    res.json(r.rows[0]);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/envolvidos/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM envolvidos WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════════
// ROTAS — PESSOAS
// ════════════════════════════════════════════════════════

const TIPOS_ENVOLVIMENTO = ['Vítima','Autor','Indiciado','Investigado','Declarante','Parte','Menor de Idade','Adolescente Infra','Tutor Responsável','Representante'];

// Listar pessoas (com telefones e endereços)
app.get('/api/pessoas', async (req, res) => {
  try {
    const { search } = req.query;
    let q = 'SELECT * FROM pessoas';
    let params = [];
    if (search) {
      q += ' WHERE nome ILIKE $1 OR cpf ILIKE $1 OR rg ILIKE $1';
      params = [`%${search}%`];
    }
    q += ' ORDER BY nome ASC';
    const pessoas = await pool.query(q, params);

    // Para cada pessoa, busca telefones e endereços
    const result = await Promise.all(pessoas.rows.map(async p => {
      const [tels, ends] = await Promise.all([
        pool.query('SELECT * FROM pessoa_telefones WHERE pessoa_id=$1 ORDER BY id', [p.id]),
        pool.query('SELECT * FROM pessoa_enderecos WHERE pessoa_id=$1 ORDER BY id', [p.id]),
      ]);
      return { ...p, telefones: tels.rows, enderecos: ends.rows };
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Buscar pessoa por ID
app.get('/api/pessoas/:id', async (req, res) => {
  try {
    const p = await pool.query('SELECT * FROM pessoas WHERE id=$1', [req.params.id]);
    if (!p.rows.length) return res.status(404).json({ error: 'Pessoa não encontrada' });
    const [tels, ends] = await Promise.all([
      pool.query('SELECT * FROM pessoa_telefones WHERE pessoa_id=$1 ORDER BY id', [req.params.id]),
      pool.query('SELECT * FROM pessoa_enderecos WHERE pessoa_id=$1 ORDER BY id', [req.params.id]),
    ]);
    res.json({ ...p.rows[0], telefones: tels.rows, enderecos: ends.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Criar pessoa
app.post('/api/pessoas', async (req, res) => {
  try {
    const d = req.body;
    const p = await pool.query(`
      INSERT INTO pessoas (nome, rg, cpf, data_nascimento, observacoes)
      VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [str(d.nome), str(d.rg), str(d.cpf), d.data_nascimento||null, str(d.observacoes)]
    );
    const pessoa = p.rows[0];

    // Insere telefones
    if (d.telefones && d.telefones.length) {
      for (const t of d.telefones) {
        if (t.telefone) await pool.query(
          'INSERT INTO pessoa_telefones (pessoa_id, telefone, tipo) VALUES ($1,$2,$3)',
          [pessoa.id, str(t.telefone), str(t.tipo)||'Celular']
        );
      }
    }

    // Insere endereços
    if (d.enderecos && d.enderecos.length) {
      for (const e of d.enderecos) {
        if (e.rua || e.cep) await pool.query(
          'INSERT INTO pessoa_enderecos (pessoa_id, cep, rua, numero, complemento, bairro, cidade, tipo) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
          [pessoa.id, str(e.cep), str(e.rua), str(e.numero), str(e.complemento), str(e.bairro), str(e.cidade), str(e.tipo)||'Residencial']
        );
      }
    }

    const full = await pool.query('SELECT * FROM pessoas WHERE id=$1', [pessoa.id]);
    const [tels, ends] = await Promise.all([
      pool.query('SELECT * FROM pessoa_telefones WHERE pessoa_id=$1', [pessoa.id]),
      pool.query('SELECT * FROM pessoa_enderecos WHERE pessoa_id=$1', [pessoa.id]),
    ]);
    res.json({ ...full.rows[0], telefones: tels.rows, enderecos: ends.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Atualizar pessoa
app.put('/api/pessoas/:id', async (req, res) => {
  try {
    const d = req.body;
    const id = req.params.id;
    await pool.query(`
      UPDATE pessoas SET nome=$1, rg=$2, cpf=$3, data_nascimento=$4, observacoes=$5, atualizado_em=NOW()
      WHERE id=$6`,
      [str(d.nome), str(d.rg), str(d.cpf), d.data_nascimento||null, str(d.observacoes), id]
    );

    // Recria telefones
    await pool.query('DELETE FROM pessoa_telefones WHERE pessoa_id=$1', [id]);
    if (d.telefones && d.telefones.length) {
      for (const t of d.telefones) {
        if (t.telefone) await pool.query(
          'INSERT INTO pessoa_telefones (pessoa_id, telefone, tipo) VALUES ($1,$2,$3)',
          [id, str(t.telefone), str(t.tipo)||'Celular']
        );
      }
    }

    // Recria endereços
    await pool.query('DELETE FROM pessoa_enderecos WHERE pessoa_id=$1', [id]);
    if (d.enderecos && d.enderecos.length) {
      for (const e of d.enderecos) {
        if (e.rua || e.cep) await pool.query(
          'INSERT INTO pessoa_enderecos (pessoa_id, cep, rua, numero, complemento, bairro, cidade, tipo) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
          [id, str(e.cep), str(e.rua), str(e.numero), str(e.complemento), str(e.bairro), str(e.cidade), str(e.tipo)||'Residencial']
        );
      }
    }

    const full = await pool.query('SELECT * FROM pessoas WHERE id=$1', [id]);
    const [tels, ends] = await Promise.all([
      pool.query('SELECT * FROM pessoa_telefones WHERE pessoa_id=$1', [id]),
      pool.query('SELECT * FROM pessoa_enderecos WHERE pessoa_id=$1', [id]),
    ]);
    res.json({ ...full.rows[0], telefones: tels.rows, enderecos: ends.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Remover pessoa
app.delete('/api/pessoas/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM pessoas WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Listar tipos de envolvimento
app.get('/api/tipos-envolvimento', (req, res) => {
  res.json(TIPOS_ENVOLVIMENTO);
});

// ════════════════════════════════════════════════════════
// ROTAS — OITIVAS (atualizado)
// ════════════════════════════════════════════════════════

app.get('/api/oitivas', async (req, res) => {
  try {
    const { cnj } = req.query;
    let query = `
      SELECT o.*, p.rg, p.cpf, p.data_nascimento,
        COALESCE(
          (SELECT string_agg(t.telefone, ', ') FROM pessoa_telefones t WHERE t.pessoa_id = o.pessoa_id),
          ''
        ) as telefones_pessoa
      FROM oitivas o
      LEFT JOIN pessoas p ON p.id = o.pessoa_id
    `;
    let params = [];
    if (cnj) { query += ' WHERE o.cnj=$1'; params = [cnj]; }
    query += ' ORDER BY o.data_oitiva ASC NULLS LAST, o.hora ASC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/oitivas', async (req, res) => {
  try {
    const d = req.body;
    const result = await pool.query(`
      INSERT INTO oitivas (cnj, inquerito, pessoa_id, pessoa_nome, tipo_envolvimento, data_oitiva, hora, local_oitiva, status, observacoes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [str(d.cnj), str(d.inquerito), d.pessoa_id||null, str(d.pessoa_nome||d.pessoa),
       str(d.tipo_envolvimento||d.qualidade||'Vítima'),
       d.data||null, str(d.hora), str(d.local), str(d.status), str(d.obs)]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/oitivas/:id', async (req, res) => {
  try {
    const d = req.body;
    const result = await pool.query(`
      UPDATE oitivas SET cnj=$1, inquerito=$2, pessoa_id=$3, pessoa_nome=$4,
        tipo_envolvimento=$5, data_oitiva=$6, hora=$7, local_oitiva=$8, status=$9, observacoes=$10
      WHERE id=$11 RETURNING *`,
      [str(d.cnj), str(d.inquerito), d.pessoa_id||null, str(d.pessoa_nome||d.pessoa),
       str(d.tipo_envolvimento||d.qualidade||'Vítima'),
       d.data||null, str(d.hora), str(d.local), str(d.status), str(d.obs), req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/oitivas/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM oitivas WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════
// IMPORTAÇÃO DE EXCEL
// ════════════════════════════════════════════════════════

app.post('/api/importar', upload.single('arquivo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado.' });

    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    const hoje = new Date().toLocaleDateString('pt-BR');
    let importados = 0, atualizados = 0, erros = 0;

    for (const r of rows) {
      try {
        const cnj = col(r, 'Nº CNJ', 'CNJ', 'cnj', 'NºCNJ');
        if (!cnj || cnj === 'Nº CNJ') continue; // pula linhas sem CNJ ou cabeçalho duplicado

        const existe = await pool.query('SELECT id FROM inqueritos WHERE cnj=$1', [cnj]);

        const valores = [
          col(r, 'Ano', 'ano'),
          cnj,
          col(r, 'Nº Inquérito', 'Nº Inquerito', 'Inquerito', 'inquerito'),
          col(r, 'BO', 'bo'),
          col(r, 'Natureza Criminal', 'Natureza', 'natureza'),
          col(r, 'Autor', 'autor'),
          col(r, 'Vítima', 'Vitima', 'vitima'),
          col(r, 'Relatado (Sim/Não)', 'Relatado (Sim/Nao)', 'Relatado', 'relatado') || 'Não',
          col(r, 'COTA - MP solicitou diligências (Sim/Não)', 'COTA - MP solicitou diligencias (Sim/Nao)', 'COTA - MP', 'CotaMP', 'cota_mp') || 'Não',
          col(r, 'Prazo', 'prazo'),
          col(r, 'Arquivamento', 'arquivamento') || 'Não',
          col(r, 'ANP', 'anp') || 'Não',
          col(r, 'Denúncia', 'Denuncia', 'denuncia') || 'Não',
          col(r, 'Objetos Apreendidos', 'Objetos', 'objetos_apreendidos'),
          col(r, 'Pendências', 'Pendencias', 'pendencias'),
          `Sim - ${hoje}`
        ];

        if (existe.rows.length > 0) {
          await pool.query(`
            UPDATE inqueritos SET
              ano=$1, cnj=$2, inquerito=$3, bo=$4, natureza=$5, autor=$6, vitima=$7,
              relatado=$8, cota_mp=$9, prazo=$10, arquivamento=$11, anp=$12,
              denuncia=$13, objetos_apreendidos=$14, pendencias=$15,
              atualizado=$16, atualizado_em=NOW()
            WHERE cnj=$2`, valores);
          atualizados++;
        } else {
          await pool.query(`
            INSERT INTO inqueritos
              (ano,cnj,inquerito,bo,natureza,autor,vitima,relatado,cota_mp,prazo,arquivamento,anp,denuncia,objetos_apreendidos,pendencias,atualizado)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`, valores);
          importados++;
        }
      } catch (rowErr) {
        console.error('Erro na linha:', rowErr.message);
        erros++;
      }
    }

    res.json({ ok: true, importados, atualizados, erros, total: importados + atualizados });
  } catch (err) {
    console.error('Erro importação:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Stats ─────────────────────────────────────────────────
app.get('/api/stats', async (req, res) => {
  try {
    const [total, relat, cota, denu, oagend] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM inqueritos'),
      pool.query("SELECT COUNT(*) FROM inqueritos WHERE LOWER(relatado) LIKE '%sim%'"),
      pool.query("SELECT COUNT(*) FROM inqueritos WHERE LOWER(cota_mp) LIKE '%sim%'"),
      pool.query("SELECT COUNT(*) FROM inqueritos WHERE LOWER(denuncia) LIKE '%sim%'"),
      pool.query("SELECT COUNT(*) FROM oitivas WHERE status='Agendada'"),
    ]);
    res.json({
      total: +total.rows[0].count,
      relatados: +relat.rows[0].count,
      comCota: +cota.rows[0].count,
      comDenuncia: +denu.rows[0].count,
      oitivasAgendadas: +oagend.rows[0].count,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Reset banco de dados ──────────────────────────────────
app.post('/api/reset', async (req, res) => {
  try {
    const { senha } = req.body;
    if (senha !== '240815') {
      return res.status(401).json({ error: 'Senha incorreta.' });
    }
    await pool.query('DELETE FROM oitivas');
    await pool.query('DELETE FROM inqueritos');
    await pool.query('ALTER SEQUENCE inqueritos_id_seq RESTART WITH 1');
    await pool.query('ALTER SEQUENCE oitivas_id_seq RESTART WITH 1');
    console.log('⚠️ Banco de dados resetado');
    res.json({ ok: true, mensagem: 'Base de dados apagada com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Google Auth ───────────────────────────────────────────

// Inicia o fluxo OAuth — redireciona para o Google
app.get('/auth/google', (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/calendar.events'],
  });
  res.redirect(url);
});

// Callback do Google após autorização
app.get('/auth/callback', async (req, res) => {
  try {
    const { code } = req.query;
    const { tokens } = await oauth2Client.getToken(code);
    googleTokens = tokens;
    console.log('✅ Google Calendar autorizado com sucesso!');
    res.send(`
      <html><body style="font-family:Arial;text-align:center;padding:3rem">
        <h2 style="color:#185FA5">✅ Google Calendar conectado!</h2>
        <p>Pode fechar esta aba e voltar ao sistema.</p>
        <script>setTimeout(()=>window.close(),2000)</script>
      </body></html>
    `);
  } catch (err) {
    console.error('Erro no callback OAuth:', err.message);
    res.send(`<html><body style="font-family:Arial;text-align:center;padding:3rem">
      <h2 style="color:#c0392b">❌ Erro ao conectar</h2>
      <p>${err.message}</p>
    </body></html>`);
  }
});

// Verifica se está conectado ao Google
app.get('/api/google/status', (req, res) => {
  res.json({ conectado: !!googleTokens });
});

// Desconectar Google
app.post('/api/google/desconectar', (req, res) => {
  googleTokens = null;
  res.json({ ok: true });
});

// Criar evento no Google Calendar
app.post('/api/google/evento', async (req, res) => {
  try {
    const calendar = getCalendarClient();
    if (!calendar) {
      return res.status(401).json({ error: 'Google Calendar não autorizado. Conecte primeiro.' });
    }

    const d = req.body;
    if (!d.data) return res.status(400).json({ error: 'Data da oitiva é obrigatória.' });

    const [hh, mm] = (d.hora || '09:00').split(':');
    const ehh = String(parseInt(hh) + 1).padStart(2, '0');

    const evento = {
      summary: `Oitiva: ${d.pessoa} (${d.qualidade}) — ${d.inquerito}`,
      location: d.local || 'Delegacia Central',
      description: [
        `CNJ: ${d.cnj}`,
        `Inquérito: ${d.inquerito}`,
        `Qualidade: ${d.qualidade}`,
        d.telefone ? `Telefone: ${d.telefone}` : '',
        d.obs ? `Obs: ${d.obs}` : '',
      ].filter(Boolean).join('\n'),
      start: {
        dateTime: `${d.data}T${hh}:${mm}:00`,
        timeZone: 'America/Sao_Paulo',
      },
      end: {
        dateTime: `${d.data}T${ehh}:${mm}:00`,
        timeZone: 'America/Sao_Paulo',
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 }, // 1 dia antes
          { method: 'popup', minutes: 60 },       // 1 hora antes
        ],
      },
    };

    const result = await calendar.events.insert({
      calendarId: 'primary',
      resource: evento,
    });

    console.log(`📅 Evento criado no Calendar: ${result.data.htmlLink}`);
    res.json({ ok: true, link: result.data.htmlLink, eventId: result.data.id });

  } catch (err) {
    console.error('Erro ao criar evento:', err.message);
    if (err.code === 401) {
      googleTokens = null;
      return res.status(401).json({ error: 'Token expirado. Reconecte o Google Calendar.' });
    }
    res.status(500).json({ error: err.message });
  }
});

// ── SPA fallback ──────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start ─────────────────────────────────────────────────
initDB().then(() => {
  app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Servidor rodando na porta ${PORT}`));
}).catch(err => {
  console.error('Erro ao inicializar banco:', err);
  process.exit(1);
});

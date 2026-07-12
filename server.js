require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');
const multer = require('multer');
const XLSX = require('xlsx');

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
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ── Inicializar tabelas ─────────────────────────────────
async function initDB() {
  // Cria tabelas se não existirem (todos campos TEXT para evitar limite de tamanho)
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

    CREATE TABLE IF NOT EXISTS oitivas (
      id SERIAL PRIMARY KEY,
      cnj TEXT,
      inquerito TEXT,
      pessoa TEXT,
      qualidade TEXT,
      data_oitiva DATE,
      hora TEXT,
      local_oitiva TEXT,
      status TEXT DEFAULT 'Agendada',
      observacoes TEXT,
      criado_em TIMESTAMP DEFAULT NOW()
    );
  `);

  // Migração: garante que colunas antigas com VARCHAR virem TEXT
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
  `).catch(() => {}); // ignora erro se já forem TEXT

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
// ROTAS — OITIVAS
// ════════════════════════════════════════════════════════

app.get('/api/oitivas', async (req, res) => {
  try {
    const { cnj } = req.query;
    let query = 'SELECT * FROM oitivas';
    let params = [];
    if (cnj) { query += ' WHERE cnj=$1'; params = [cnj]; }
    query += ' ORDER BY data_oitiva ASC NULLS LAST, hora ASC';
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
      INSERT INTO oitivas (cnj,inquerito,pessoa,qualidade,data_oitiva,hora,local_oitiva,status,observacoes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [str(d.cnj), str(d.inquerito), str(d.pessoa), str(d.qualidade),
       d.data || null, str(d.hora), str(d.local), str(d.status), str(d.obs)]
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
      UPDATE oitivas SET cnj=$1,inquerito=$2,pessoa=$3,qualidade=$4,
        data_oitiva=$5,hora=$6,local_oitiva=$7,status=$8,observacoes=$9
      WHERE id=$10 RETURNING *`,
      [str(d.cnj), str(d.inquerito), str(d.pessoa), str(d.qualidade),
       d.data || null, str(d.hora), str(d.local), str(d.status), str(d.obs), req.params.id]
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
    const [total, relat, pend, denu, oagend] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM inqueritos'),
      pool.query("SELECT COUNT(*) FROM inqueritos WHERE LOWER(relatado) LIKE '%sim%'"),
      pool.query("SELECT COUNT(*) FROM inqueritos WHERE pendencias IS NOT NULL AND pendencias != ''"),
      pool.query("SELECT COUNT(*) FROM inqueritos WHERE LOWER(denuncia) LIKE '%sim%'"),
      pool.query("SELECT COUNT(*) FROM oitivas WHERE status='Agendada'"),
    ]);
    res.json({
      total: +total.rows[0].count,
      relatados: +relat.rows[0].count,
      pendentes: +pend.rows[0].count,
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

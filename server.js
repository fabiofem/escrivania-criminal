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

const upload = multer({ storage: multer.memoryStorage() });

// ── Inicializar tabelas ─────────────────────────────────
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS inqueritos (
      id SERIAL PRIMARY KEY,
      ano VARCHAR(10),
      cnj VARCHAR(50) UNIQUE,
      inquerito VARCHAR(50),
      bo VARCHAR(50),
      natureza VARCHAR(200),
      autor VARCHAR(200),
      vitima VARCHAR(200),
      relatado VARCHAR(10) DEFAULT 'Não',
      cota_mp VARCHAR(10) DEFAULT 'Não',
      prazo VARCHAR(100),
      arquivamento VARCHAR(10) DEFAULT 'Não',
      anp VARCHAR(10) DEFAULT 'Não',
      denuncia VARCHAR(10) DEFAULT 'Não',
      objetos_apreendidos TEXT,
      pendencias TEXT,
      atualizado VARCHAR(100),
      criado_em TIMESTAMP DEFAULT NOW(),
      atualizado_em TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS oitivas (
      id SERIAL PRIMARY KEY,
      cnj VARCHAR(50),
      inquerito VARCHAR(50),
      pessoa VARCHAR(200),
      qualidade VARCHAR(50),
      data_oitiva DATE,
      hora VARCHAR(10),
      local_oitiva VARCHAR(200),
      status VARCHAR(50) DEFAULT 'Agendada',
      observacoes TEXT,
      criado_em TIMESTAMP DEFAULT NOW()
    );
  `);
  console.log('✅ Banco de dados inicializado');
}

// ════════════════════════════════════════════════════════
// ROTAS — INQUÉRITOS
// ════════════════════════════════════════════════════════

// Listar todos
app.get('/api/inqueritos', async (req, res) => {
  try {
    const { search } = req.query;
    let query = 'SELECT * FROM inqueritos';
    let params = [];
    if (search) {
      query += ` WHERE cnj ILIKE $1 OR inquerito ILIKE $1 OR autor ILIKE $1 OR vitima ILIKE $1 OR natureza ILIKE $1`;
      params = [`%${search}%`];
    }
    query += ' ORDER BY atualizado_em DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Criar novo
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
      [d.ano,d.cnj,d.inquerito,d.bo,d.natureza,d.autor,d.vitima,
       d.relatado,d.cotaMP,d.prazo,d.arquivamento,d.anp,d.denuncia,
       d.objetosApreendidos,d.pendencias,`Sim - ${hoje}`]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Atualizar
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
      [d.ano,d.cnj,d.inquerito,d.bo,d.natureza,d.autor,d.vitima,
       d.relatado,d.cotaMP,d.prazo,d.arquivamento,d.anp,d.denuncia,
       d.objetosApreendidos,d.pendencias,`Sim - ${hoje}`,req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Remover
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
    query += ' ORDER BY data_oitiva ASC, hora ASC';
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
      [d.cnj,d.inquerito,d.pessoa,d.qualidade,d.data||null,d.hora,d.local,d.status,d.obs]
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
      [d.cnj,d.inquerito,d.pessoa,d.qualidade,d.data||null,d.hora,d.local,d.status,d.obs,req.params.id]
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
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws);
    const hoje = new Date().toLocaleDateString('pt-BR');
    let importados = 0, atualizados = 0;

    for (const r of rows) {
      const cnj = String(r['Nº CNJ'] || r['CNJ'] || r['cnj'] || '').trim();
      if (!cnj) continue;

      const existe = await pool.query('SELECT id FROM inqueritos WHERE cnj=$1', [cnj]);

      const valores = [
        String(r['Ano'] || r['ano'] || ''),
        cnj,
        String(r['Nº Inquérito'] || r['Inquerito'] || ''),
        String(r['BO'] || ''),
        String(r['Natureza Criminal'] || r['Natureza'] || ''),
        String(r['Autor'] || ''),
        String(r['Vítima'] || r['Vitima'] || ''),
        String(r['Relatado'] || 'Não'),
        String(r['COTA - MP'] || r['CotaMP'] || 'Não'),
        String(r['Prazo'] || ''),
        String(r['Arquivamento'] || 'Não'),
        String(r['ANP'] || 'Não'),
        String(r['Denuncia'] || r['Denúncia'] || 'Não'),
        String(r['Objetos Apreendidos'] || ''),
        String(r['Pendências'] || r['Pendencias'] || ''),
        `Sim - ${hoje}`
      ];

      if (existe.rows.length > 0) {
        await pool.query(`
          UPDATE inqueritos SET ano=$1,cnj=$2,inquerito=$3,bo=$4,natureza=$5,autor=$6,vitima=$7,
            relatado=$8,cota_mp=$9,prazo=$10,arquivamento=$11,anp=$12,denuncia=$13,
            objetos_apreendidos=$14,pendencias=$15,atualizado=$16,atualizado_em=NOW()
          WHERE cnj=$2`, valores);
        atualizados++;
      } else {
        await pool.query(`
          INSERT INTO inqueritos (ano,cnj,inquerito,bo,natureza,autor,vitima,relatado,cota_mp,prazo,arquivamento,anp,denuncia,objetos_apreendidos,pendencias,atualizado)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`, valores);
        importados++;
      }
    }

    res.json({ ok: true, importados, atualizados, total: importados + atualizados });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Stats ────────────────────────────────────────────────
app.get('/api/stats', async (req, res) => {
  try {
    const [total, relat, pend, denu, oagend] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM inqueritos'),
      pool.query("SELECT COUNT(*) FROM inqueritos WHERE relatado='Sim'"),
      pool.query("SELECT COUNT(*) FROM inqueritos WHERE pendencias IS NOT NULL AND pendencias != ''"),
      pool.query("SELECT COUNT(*) FROM inqueritos WHERE denuncia='Sim'"),
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

// ── SPA fallback ─────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start ────────────────────────────────────────────────
initDB().then(() => {
  app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Servidor rodando na porta ${PORT}`));
}).catch(err => {
  console.error('Erro ao inicializar banco:', err);
  process.exit(1);
});

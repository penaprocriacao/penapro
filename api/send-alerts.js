import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // Verify cron secret (Vercel sends this header for cron jobs)
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const RESEND_KEY = process.env.RESEND_API_KEY;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!RESEND_KEY || !SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'Missing environment variables' });
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

  // Buscar todos os clientes ativos
  const { data: clients, error } = await sb.from('clients').select('*, user_id').eq('arquivado', false);
  if (error) return res.status(500).json({ error: error.message });

  // Buscar todos os usuários
  const { data: { users }, error: usersError } = await sb.auth.admin.listUsers();
  if (usersError) return res.status(500).json({ error: usersError.message });

  const alertas = [];

  for (const c of clients) {
    if (!c.dt_inicio_cumprimento || !c.pena_definitiva) continue;

    // Calcular pena efetiva
    const rem = Math.floor((c.dias_trabalhados || 0) / 3) + Math.floor((c.horas_estudo || 0) / 12) + Math.min((c.livros_lidos || 0) * 4, 48);
    const pe = Math.max(1, c.pena_definitiva - (c.detracao_dias || 0) / 30 - rem / 30);
    const p = c.condicao === 'primario', h = c.hediondo, v = c.violencia, o = c.org_criminosa, re = c.condicao === 'reincidente_especifico';

    let fr;
    if (o) fr = 3 / 4;
    else if (h) fr = p ? 2 / 5 : (re ? 3 / 5 : 1 / 2);
    else if (v) fr = p ? 1 / 4 : 3 / 10;
    else fr = p ? 4 / 25 : 1 / 5;

    const dt = new Date(c.dt_inicio_cumprimento);
    const progDate = new Date(dt);
    progDate.setMonth(progDate.getMonth() + Math.round(pe * fr));

    const hoje = new Date();
    const diasProg = Math.round((progDate - hoje) / 86400000);

    // Alertar 30, 15, 10 e 5 dias antes
    if ([30, 15, 10, 5].includes(diasProg)) {
      alertas.push({
        user_id: c.user_id,
        cliente: c.nome_reu,
        evento: 'Progressão de regime',
        dias: diasProg,
        data: progDate.toLocaleDateString('pt-BR'),
        processo: c.num_processo || '—'
      });
    }
  }

  // Agrupar alertas por usuário
  const porUsuario = {};
  for (const a of alertas) {
    if (!porUsuario[a.user_id]) porUsuario[a.user_id] = [];
    porUsuario[a.user_id].push(a);
  }

  let enviados = 0;
  for (const [userId, alerts] of Object.entries(porUsuario)) {
    const user = users.find(u => u.id === userId);
    if (!user) continue;

    const nome = user.user_metadata?.nome || 'Advogado(a)';
    const linhas = alerts.map(a =>
      `• ${a.cliente} — ${a.evento} em ${a.dias} dias (${a.data}) — Processo: ${a.processo}`
    ).join('\n');

    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${RESEND_KEY}`
        },
        body: JSON.stringify({
          from: 'PenaPro <contato@penapro.com.br>',
          to: user.email,
          subject: `PenaPro — ${alerts.length} alerta(s) de prazo`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
              <div style="background:#1B2A4A;padding:20px;text-align:center">
                <h1 style="color:#c9a84c;margin:0;font-size:24px">PenaPro</h1>
                <p style="color:#8899aa;margin:4px 0 0;font-size:12px">Alertas de Prazo</p>
              </div>
              <div style="padding:24px;background:#f8f9fa">
                <p style="color:#333">Olá ${nome},</p>
                <p style="color:#333">Você tem <b>${alerts.length} evento(s)</b> se aproximando:</p>
                ${alerts.map(a => `
                  <div style="background:#fff;border-left:4px solid #c9a84c;padding:14px 18px;margin:12px 0;border-radius:0 8px 8px 0">
                    <div style="font-weight:700;color:#1B2A4A">${a.cliente}</div>
                    <div style="color:#666;font-size:14px">${a.evento} em <b style="color:#e8a838">${a.dias} dias</b> (${a.data})</div>
                    <div style="color:#999;font-size:12px">Processo: ${a.processo}</div>
                  </div>
                `).join('')}
                <p style="color:#333;margin-top:20px">Acesse o painel para mais detalhes e gerar a petição:</p>
                <a href="https://penapro.com.br/painel.html" style="display:inline-block;padding:12px 24px;background:#c9a84c;color:#1B2A4A;text-decoration:none;border-radius:8px;font-weight:700">Abrir PenaPro</a>
              </div>
              <div style="padding:16px;text-align:center;font-size:11px;color:#999">
                PenaPro — Cálculos Penais Inteligentes<br>
                <a href="https://penapro.com.br" style="color:#c9a84c">penapro.com.br</a>
              </div>
            </div>`
        })
      });
      enviados++;
    } catch (err) {
      console.error('Erro ao enviar email para', user.email, err);
    }
  }

  return res.status(200).json({ alertas: alertas.length, enviados });
}

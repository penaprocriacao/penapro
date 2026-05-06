export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const CLAUDE_KEY = process.env.CLAUDE_API_KEY;
  if (!CLAUDE_KEY) return res.status(500).json({ error: 'API key não configurada' });

  const { cliente, tipo } = req.body;
  if (!cliente || !tipo) return res.status(400).json({ error: 'Dados insuficientes' });

  const c = cliente;
  let prompt = '';

  if (tipo === 'tecnico') {
    prompt = `Você é um assistente jurídico especializado em direito penal brasileiro. Gere um RELATÓRIO TÉCNICO detalhado para o seguinte caso:

Réu: ${c.nome_reu}
Processo: ${c.num_processo || 'Não informado'}
Crime: ${c.crime || 'Não informado'} (${c.artigo || ''})
Pena definitiva: ${c.pena_definitiva} meses
Regime inicial: ${c.regime}
Condição: ${c.condicao === 'primario' ? 'Primário' : c.condicao === 'reincidente' ? 'Reincidente' : 'Reincidente específico'}
Hediondo: ${c.hediondo ? 'Sim' : 'Não'}
Violência/grave ameaça: ${c.violencia ? 'Sim' : 'Não'}
Detração: ${c.detracao_dias || 0} dias
Dias trabalhados: ${c.dias_trabalhados || 0}
Horas de estudo: ${c.horas_estudo || 0}
Livros lidos: ${c.livros_lidos || 0}
Data início cumprimento: ${c.dt_inicio_cumprimento || 'Não informado'}

Estruture o relatório com:
1. DADOS DO CASO (resumo dos dados acima)
2. CÁLCULO DA PENA EFETIVA (detração + remição detalhadas com fundamentação legal)
3. PROGRESSÃO DE REGIME (frações aplicáveis conforme Art. 112 LEP com datas calculadas)
4. LIVRAMENTO CONDICIONAL (fração e data, Art. 83 CP)
5. BENEFÍCIOS POSSÍVEIS (verificar substituição Art. 44, sursis Art. 77)
6. OBSERVAÇÕES E RECOMENDAÇÕES

Use linguagem técnica jurídica. Cite artigos de lei. Seja preciso nos cálculos.`;
  }

  if (tipo === 'cliente') {
    prompt = `Você é um advogado criminalista brasileiro escrevendo um informativo para seu CLIENTE (o réu ou sua família). Use linguagem SIMPLES, sem jargão jurídico. Explique como se estivesse conversando pessoalmente.

Dados do caso:
Réu: ${c.nome_reu}
Crime: ${c.crime || 'Não informado'}
Pena: ${c.pena_definitiva} meses
Regime: ${c.regime}
Primário: ${c.condicao === 'primario' ? 'Sim' : 'Não'}
Detração: ${c.detracao_dias || 0} dias
Trabalho: ${c.dias_trabalhados || 0} dias
Estudo: ${c.horas_estudo || 0} horas
Livros: ${c.livros_lidos || 0}
Início: ${c.dt_inicio_cumprimento || 'Não informado'}

Estruture assim:
1. O QUE ACONTECEU (explique a condenação em termos simples)
2. QUANTO TEMPO FALTA (pena efetiva considerando descontos)
3. DATAS IMPORTANTES (quando pode pedir progressão, livramento)
4. COMO REDUZIR A PENA (trabalho, estudo, leitura — explique de forma clara)
5. PRÓXIMOS PASSOS (o que o advogado vai fazer)

Seja empático. Transmita esperança quando possível. Não minta.`;
  }

  if (tipo === 'peticao') {
    prompt = `Você é um advogado criminalista brasileiro. Gere uma MINUTA DE PETIÇÃO DE PROGRESSÃO DE REGIME para o seguinte caso:

Réu: ${c.nome_reu}
Processo: ${c.num_processo || '____'}
Vara: ${c.vara || '____'}
Crime: ${c.crime || 'Não informado'} (${c.artigo || ''})
Pena definitiva: ${c.pena_definitiva} meses
Regime atual: ${c.regime}
Condição: ${c.condicao === 'primario' ? 'Primário' : 'Reincidente'}
Hediondo: ${c.hediondo ? 'Sim' : 'Não'}
Detração: ${c.detracao_dias || 0} dias
Dias trabalhados: ${c.dias_trabalhados || 0}
Horas de estudo: ${c.horas_estudo || 0}
Livros lidos: ${c.livros_lidos || 0}
Início cumprimento: ${c.dt_inicio_cumprimento || 'Não informado'}

Estruture como petição formal:
- Endereçamento (Juízo da Execução)
- Qualificação do requerente
- DOS FATOS
- DO DIREITO (fundamentação legal: Art. 112 LEP, frações aplicáveis)
- DO REQUISITO OBJETIVO (tempo cumprido com cálculos detalhados)
- DO REQUISITO SUBJETIVO (bom comportamento, trabalho, estudo)
- DOS PEDIDOS
- Encerramento

Use formatação jurídica padrão brasileira. Fundamente com artigos de lei.`;
  }

  if (!prompt) return res.status(400).json({ error: 'Tipo de relatório inválido' });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();
    if (data.error) return res.status(500).json({ error: data.error.message });

    const text = data.content?.[0]?.text || 'Erro ao gerar relatório.';
    return res.status(200).json({ text });
  } catch (err) {
    return res.status(500).json({ error: 'Erro na comunicação com a IA: ' + err.message });
  }
}

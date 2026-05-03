-- ============================================
-- PENAPRO — Schema Supabase
-- Execute este SQL no SQL Editor do Supabase
-- ============================================

-- Tabela de clientes
CREATE TABLE clients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  nome_reu TEXT NOT NULL,
  cpf TEXT,
  num_processo TEXT,
  vara TEXT,
  crime TEXT,
  artigo TEXT,
  pena_definitiva INTEGER DEFAULT 0,
  regime TEXT DEFAULT 'Fechado',
  condicao TEXT DEFAULT 'primario',
  dt_transito DATE,
  dt_inicio_cumprimento DATE,
  detracao_dias INTEGER DEFAULT 0,
  dias_trabalhados INTEGER DEFAULT 0,
  horas_estudo INTEGER DEFAULT 0,
  livros_lidos INTEGER DEFAULT 0,
  hediondo BOOLEAN DEFAULT FALSE,
  violencia BOOLEAN DEFAULT FALSE,
  org_criminosa BOOLEAN DEFAULT FALSE,
  observacoes TEXT,
  arquivado BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX idx_clients_user_id ON clients(user_id);
CREATE INDEX idx_clients_arquivado ON clients(user_id, arquivado);

-- Row Level Security — cada usuário só vê seus próprios clientes
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuário vê seus clientes"
  ON clients FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Usuário insere seus clientes"
  ON clients FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuário edita seus clientes"
  ON clients FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Usuário exclui seus clientes"
  ON clients FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

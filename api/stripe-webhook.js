import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const STRIPE_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!STRIPE_SECRET || !SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'Missing environment variables' });
  }

  // Verify Stripe signature
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_SECRET);
  } catch (err) {
    return res.status(400).json({ error: 'Webhook signature verification failed' });
  }

  if (event.type === 'checkout.session.completed' || event.type === 'invoice.paid') {
    const session = event.data.object;
    const email = session.customer_email || session.customer_details?.email;
    const amount = session.amount_total || session.amount_paid;

    if (!email) return res.status(200).json({ received: true, note: 'No email found' });

    // Determinar plano pelo valor (em centavos)
    let plano = 'individual';
    if (amount >= 9990) plano = 'pro';
    else if (amount >= 4990) plano = 'escritorio';
    else if (amount >= 1990) plano = 'individual';

    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

    // Buscar usuário pelo email
    const { data: { users } } = await sb.auth.admin.listUsers();
    const user = users.find(u => u.email === email);

    if (!user) return res.status(200).json({ received: true, note: 'User not found' });

    // Atualizar ou criar user_settings
    const { data: existing } = await sb.from('user_settings').select('id').eq('user_id', user.id).single();

    const now = new Date().toISOString();
    if (existing) {
      await sb.from('user_settings').update({
        plano,
        plano_ativado_em: now,
        trial_liberado: false
      }).eq('id', existing.id);
    } else {
      await sb.from('user_settings').insert({
        user_id: user.id,
        plano,
        plano_ativado_em: now,
        trial_liberado: false
      });
    }

    return res.status(200).json({ received: true, plano, email });
  }

  return res.status(200).json({ received: true });
}

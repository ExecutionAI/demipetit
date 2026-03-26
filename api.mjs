import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import OpenAI, { toFile } from 'openai';
import { Resend } from 'resend';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { FLAVOR_INGREDIENTS, FILLING_EXTRAS, SMB_BASE, SIZE_MULTIPLIERS } from './data/ingredients.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ── Static files ──────────────────────────────────────────────────────────────
app.use(express.static(__dirname));

// ── Clients ──────────────────────────────────────────────────────────────────

const supabase = (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { db: { schema: 'petitdemi' } })
  : null;
if (supabase) console.log('Supabase connected (petitdemi schema)');
else          console.warn('Supabase not configured — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

// ── Auth middleware ───────────────────────────────────────────────────────────

function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ── Status pipeline ───────────────────────────────────────────────────────────

const VALID_TRANSITIONS = {
  quote_received: ['confirmed', 'cancelled'],
  confirmed:      ['in_production', 'cancelled'],
  in_production:  ['ready', 'cancelled'],
  ready:          ['delivered'],
  delivered:      [],
  cancelled:      ['quote_received'],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseJSON(raw) {
  const cleaned = (raw || '')
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();
  return JSON.parse(cleaned);
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── PUBLIC: Submit quote ──────────────────────────────────────────────────────

app.post('/api/quotes', async (req, res) => {
  const {
    full_name, email, phone,
    product_type, cake_size, flavor, filling,
    quantity, decoration_type, decoration_notes,
    occasion, delivery_date, notes,
  } = req.body;

  if (!full_name || !email || !product_type || !delivery_date) {
    return res.status(400).json({ error: 'Missing required fields: full_name, email, product_type, delivery_date' });
  }

  // Calculate base price
  const { CAKE_SIZES, OTHER_PRODUCTS } = await import('./data/menu.js');
  let base_price = 0;
  let extras_price = 0;
  if (product_type === 'cake' && cake_size) {
    const sizeData = CAKE_SIZES.find(s => s.id === cake_size);
    base_price = sizeData?.price || 0;
  } else {
    const prod = OTHER_PRODUCTS.find(p => p.type === product_type);
    base_price = prod?.price || 0;
  }
  const { FILLINGS } = await import('./data/menu.js');
  const fillingData = FILLINGS.find(f => f.id === filling);
  if (fillingData?.surcharge) extras_price = fillingData.surcharge;

  const total_price = base_price + extras_price;

  // GPT-4o order summary
  let ai_summary = null;
  if (openai) {
    try {
      const prompt = `You are a friendly assistant for Petit Demi, a custom bakery in Amsterdam.
A customer just submitted a cake order. Write a warm, concise 2-sentence summary of their order for the baker to read at a glance.
Then list any missing or unclear details as "flags".
Respond ONLY with valid JSON in this exact format:
{ "summary": "...", "flags": ["..."] }

Order details:
- Product: ${product_type}${cake_size ? ` (${cake_size})` : ''}
- Flavor: ${flavor || 'not specified'}
- Filling: ${filling || 'not specified'}
- Decoration: ${decoration_type || 'basic'}${decoration_notes ? ` — ${decoration_notes}` : ''}
- Occasion: ${occasion || 'not specified'}
- Delivery date: ${delivery_date}
- Quantity: ${quantity || 1}
- Customer notes: ${notes || 'none'}`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        max_tokens: 300,
      });
      const parsed = parseJSON(response.choices[0]?.message?.content);
      ai_summary = parsed.summary;
    } catch (err) {
      console.error('OpenAI error:', err.message);
    }
  }

  if (!supabase) {
    return res.json({ success: true, message: 'Quote received (DB not configured)', ai_summary });
  }

  // Upsert client
  const { data: client, error: clientErr } = await supabase
    .from('clients')
    .upsert({ email, full_name, phone }, { onConflict: 'email' })
    .select()
    .single();

  if (clientErr) {
    console.error('Client upsert error:', clientErr);
    return res.status(500).json({ error: 'Failed to save client' });
  }

  // Create order
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .insert({
      client_id: client.id,
      product_type,
      cake_size: cake_size || null,
      flavor: flavor || null,
      filling: filling || null,
      quantity: quantity || 1,
      decoration_type: decoration_type || 'basic',
      decoration_notes: decoration_notes || null,
      occasion: occasion || null,
      delivery_date,
      base_price,
      extras_price,
      total_price,
      ai_summary,
      raw_quote: req.body,
      internal_notes: notes || null,
    })
    .select()
    .single();

  if (orderErr) {
    console.error('Order insert error:', orderErr);
    return res.status(500).json({ error: 'Failed to save order' });
  }

  // Send emails
  if (resend) {
    const FROM = process.env.FROM_EMAIL || 'noreply@petitdemi.com';
    const DEMI  = process.env.DEMI_EMAIL  || 'info@petitdemi.com';

    // Notify Demi
    resend.emails.send({
      from: FROM,
      to: DEMI,
      subject: `New order from ${full_name} — ${product_type} for ${delivery_date}`,
      html: `<h2>New Quote Received</h2>
<p><strong>Customer:</strong> ${esc(full_name)} (${esc(email)}${phone ? `, ${esc(phone)}` : ''})</p>
<p><strong>Product:</strong> ${esc(product_type)}${cake_size ? ` — ${esc(cake_size)}` : ''}</p>
<p><strong>Flavor:</strong> ${esc(flavor || 'Not specified')}</p>
<p><strong>Filling:</strong> ${esc(filling || 'Not specified')}</p>
<p><strong>Delivery date:</strong> ${esc(delivery_date)}</p>
<p><strong>Occasion:</strong> ${esc(occasion || '—')}</p>
<p><strong>Notes:</strong> ${esc(notes || '—')}</p>
${ai_summary ? `<hr><p><em>AI Summary: ${esc(ai_summary)}</em></p>` : ''}
<p><a href="${process.env.ADMIN_URL || 'http://localhost:3000/admin'}" style="background:#C5956C;color:white;padding:10px 20px;text-decoration:none;border-radius:6px;">Open Admin Dashboard</a></p>`,
    }).catch(e => console.error('Email to Demi failed:', e.message));

    // Confirm to customer
    resend.emails.send({
      from: FROM,
      to: email,
      subject: `Your order request is in — Petit Demi`,
      html: `<h2>Thanks for reaching out, ${esc(full_name.split(' ')[0])}! 🎂</h2>
<p>I've received your order request and will get back to you within 24–48 hours to confirm availability and details.</p>
${ai_summary ? `<p><strong>Your order summary:</strong> ${esc(ai_summary)}</p>` : ''}
<p><strong>Estimated total:</strong> €${total_price.toFixed(2)}</p>
<p>In the meantime, feel free to reach me on WhatsApp: <a href="https://wa.me/31601089333">0601089333</a></p>
<p>Warm regards,<br>Demi — Petit Demi 🌸</p>`,
    }).catch(e => console.error('Email to customer failed:', e.message));
  }

  res.json({ success: true, orderId: order.id, ai_summary, total_price });
});

// ── PUBLIC: Quote preview (AI summary for step 3 preview) ────────────────────

app.post('/api/quotes/preview', async (req, res) => {
  const { product_type, cake_size, flavor, filling, decoration_type, occasion, delivery_date, quantity } = req.body;
  if (!openai) return res.json({ summary: 'Your order looks great — ready to send!' });

  try {
    const prompt = `You are a warm, friendly assistant for Petit Demi, a custom bakery in Amsterdam.
A customer is about to submit a cake order. Write ONE friendly sentence summarising their order — like you're reading it back to them warmly.
Respond ONLY with valid JSON: { "summary": "..." }

Order: ${product_type}${cake_size ? ' ('+cake_size+')' : ''}${flavor ? ', '+flavor+' flavour' : ''}${filling ? ', '+filling : ''}${decoration_type === 'custom' ? ', custom decoration' : ''}${occasion ? ' for '+occasion : ''}${delivery_date ? ', due '+delivery_date : ''}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 120,
    });
    const parsed = parseJSON(response.choices[0]?.message?.content);
    res.json({ summary: parsed.summary });
  } catch (err) {
    console.error('Preview error:', err.message);
    res.json({ summary: 'Your order is ready to send — Demi will confirm everything shortly!' });
  }
});

// ── ADMIN: Stats ──────────────────────────────────────────────────────────────

app.get('/api/admin/stats', requireAdmin, async (req, res) => {
  if (!supabase) return res.json({ total: 0, quote_received: 0, confirmed: 0, in_production: 0, ready: 0, this_week: 0 });

  try {
    const today = new Date().toISOString().split('T')[0];
    const weekEnd = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

    const [total, qr, conf, prod, ready, thisWeek, urgent] = await Promise.all([
      supabase.from('orders').select('id', { count: 'exact', head: true }),
      supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'quote_received'),
      supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'confirmed'),
      supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'in_production'),
      supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'ready'),
      supabase.from('orders').select('id', { count: 'exact', head: true }).gte('delivery_date', today).lte('delivery_date', weekEnd).not('status', 'in', '("delivered","cancelled")'),
      supabase.from('orders').select('id', { count: 'exact', head: true }).gte('delivery_date', today).lte('delivery_date', new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0]).not('status', 'in', '("delivered","cancelled")'),
    ]);

    res.json({
      total:          total.count    || 0,
      quote_received: qr.count       || 0,
      confirmed:      conf.count     || 0,
      in_production:  prod.count     || 0,
      ready:          ready.count    || 0,
      this_week:      thisWeek.count || 0,
      urgent:         urgent.count   || 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── ADMIN: Orders list ────────────────────────────────────────────────────────

app.get('/api/admin/orders', requireAdmin, async (req, res) => {
  if (!supabase) return res.json([]);

  try {
    const { status, q } = req.query;
    let query = supabase
      .from('orders')
      .select('*, client:clients(full_name, email, phone)')
      .order('delivery_date', { ascending: true });

    if (status && status !== 'all') query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;

    let rows = data;
    if (q) {
      const lq = q.toLowerCase();
      rows = rows.filter(r =>
        r.client?.full_name?.toLowerCase().includes(lq) ||
        r.client?.email?.toLowerCase().includes(lq) ||
        r.flavor?.toLowerCase().includes(lq)
      );
    }

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── ADMIN: Single order ───────────────────────────────────────────────────────

app.get('/api/admin/orders/:id', requireAdmin, async (req, res) => {
  if (!supabase) return res.status(404).json({ error: 'Not found' });

  try {
    const { data, error } = await supabase
      .from('orders')
      .select('*, client:clients(full_name, email, phone)')
      .eq('id', req.params.id)
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── ADMIN: Update order ───────────────────────────────────────────────────────

app.patch('/api/admin/orders/:id', requireAdmin, async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'DB not configured' });

  const { status, base_price, extras_price, total_price, internal_notes, delivery_date } = req.body;

  // Validate status transition
  if (status) {
    const { data: current } = await supabase
      .from('orders')
      .select('status')
      .eq('id', req.params.id)
      .single();

    if (!current) return res.status(404).json({ error: 'Order not found' });

    const allowed = VALID_TRANSITIONS[current.status] || [];
    if (!allowed.includes(status)) {
      return res.status(400).json({
        error: `Invalid transition: ${current.status} → ${status}. Allowed: ${allowed.join(', ') || 'none'}`,
      });
    }
  }

  try {
    const updates = {};
    if (status !== undefined)         updates.status         = status;
    if (base_price !== undefined)     updates.base_price     = base_price;
    if (extras_price !== undefined)   updates.extras_price   = extras_price;
    if (total_price !== undefined)    updates.total_price    = total_price;
    if (internal_notes !== undefined) updates.internal_notes = internal_notes;
    if (delivery_date !== undefined)  updates.delivery_date  = delivery_date;

    const { data, error } = await supabase
      .from('orders')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── ADMIN: Delete order ───────────────────────────────────────────────────────

app.delete('/api/admin/orders/:id', requireAdmin, async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'DB not configured' });

  try {
    const { error } = await supabase.from('orders').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── ADMIN: Shopping list ──────────────────────────────────────────────────────

app.post('/api/admin/shopping-list', requireAdmin, async (req, res) => {
  const { order_ids } = req.body;
  if (!order_ids?.length) return res.status(400).json({ error: 'order_ids required' });

  if (!supabase) return res.status(503).json({ error: 'DB not configured' });

  try {
    const { data: orders, error } = await supabase
      .from('orders')
      .select('flavor, filling, cake_size, product_type, quantity')
      .in('id', order_ids);

    if (error) throw error;

    // Consolidate ingredients
    const totals = {}; // key: `${name}|${unit}` → { name, unit, group, amount }

    function addIngredient(item, multiplier = 1) {
      const key = `${item.name}|${item.unit}`;
      if (!totals[key]) totals[key] = { name: item.name, unit: item.unit, group: item.group, amount: 0 };
      totals[key].amount += item.amount * multiplier;
    }

    for (const order of orders) {
      const qty = order.quantity || 1;
      const sizeMult = (order.cake_size ? SIZE_MULTIPLIERS[order.cake_size] : 1) || 1;
      const totalMult = qty * sizeMult;

      // Cake sponge ingredients
      if (order.flavor && FLAVOR_INGREDIENTS[order.flavor]) {
        for (const ing of FLAVOR_INGREDIENTS[order.flavor]) {
          addIngredient(ing, totalMult);
        }
      }

      // SMB base (for cakes)
      if (order.product_type === 'cake') {
        for (const ing of SMB_BASE) {
          addIngredient(ing, totalMult);
        }
      }

      // Filling extras
      if (order.filling && FILLING_EXTRAS[order.filling]) {
        for (const ing of FILLING_EXTRAS[order.filling]) {
          addIngredient(ing, totalMult);
        }
      }
    }

    // Group by category
    const groups = { dry: [], dairy: [], eggs: [], extras: [] };
    for (const item of Object.values(totals)) {
      const grp = groups[item.group] || groups.extras;
      grp.push({ name: item.name, amount: Math.ceil(item.amount), unit: item.unit });
    }
    for (const grp of Object.values(groups)) grp.sort((a, b) => a.name.localeCompare(b.name));

    res.json({ groups, order_count: orders.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── ADMIN: Clients ────────────────────────────────────────────────────────────

app.get('/api/admin/clients', requireAdmin, async (req, res) => {
  if (!supabase) return res.json([]);

  try {
    const { data, error } = await supabase
      .from('clients')
      .select('*, orders(id)')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json(data.map(c => ({
      ...c,
      order_count: c.orders?.length || 0,
      orders: undefined,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── ADMIN: Create order directly ──────────────────────────────────────────────

app.post('/api/admin/orders', requireAdmin, async (req, res) => {
  const {
    full_name, email, phone,
    product_type, cake_size, flavor, filling,
    quantity, decoration_type, decoration_notes,
    occasion, delivery_date, notes,
    initial_status,
  } = req.body;

  if (!full_name || !email || !product_type || !delivery_date) {
    return res.status(400).json({ error: 'Missing required fields: full_name, email, product_type, delivery_date' });
  }

  const { CAKE_SIZES, OTHER_PRODUCTS, FILLINGS } = await import('./data/menu.js');
  let base_price = 0, extras_price = 0;
  if (product_type === 'cake' && cake_size) {
    base_price = CAKE_SIZES.find(s => s.id === cake_size)?.price || 0;
  } else {
    base_price = OTHER_PRODUCTS.find(p => p.type === product_type)?.price || 0;
  }
  const fillingData = FILLINGS.find(f => f.id === filling);
  if (fillingData?.surcharge) extras_price = fillingData.surcharge;
  const total_price = base_price + extras_price;

  let ai_summary = null;
  if (openai) {
    try {
      const r = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: `You are a friendly assistant for Petit Demi bakery. Write a warm 1-sentence order summary for the baker.
Respond ONLY with JSON: { "summary": "..." }
Order: ${product_type}${cake_size ? ' ('+cake_size+')' : ''}${flavor ? ', '+flavor : ''}${filling ? ', '+filling : ''}${occasion ? ', for '+occasion : ''}, due ${delivery_date}` }],
        response_format: { type: 'json_object' }, max_tokens: 120,
      });
      ai_summary = parseJSON(r.choices[0]?.message?.content)?.summary;
    } catch { /* non-fatal */ }
  }

  if (!supabase) return res.status(503).json({ error: 'Database not configured' });

  const { data: client, error: clientErr } = await supabase
    .from('clients')
    .upsert({ email, full_name, phone: phone || null }, { onConflict: 'email' })
    .select().single();
  if (clientErr) return res.status(500).json({ error: 'Failed to save client' });

  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .insert({
      client_id: client.id,
      product_type, cake_size: cake_size || null, flavor: flavor || null,
      filling: filling || null, quantity: quantity || 1,
      decoration_type: decoration_type || 'basic',
      decoration_notes: decoration_notes || null,
      occasion: occasion || null, delivery_date,
      base_price, extras_price, total_price, ai_summary,
      status: initial_status || 'confirmed',
      internal_notes: notes || null,
      raw_quote: req.body,
    })
    .select().single();
  if (orderErr) return res.status(500).json({ error: 'Failed to save order' });

  res.json({ success: true, orderId: order.id, ai_summary, total_price });
});

// ── ADMIN: Parse order from chat/conversation text ─────────────────────────────

app.post('/api/admin/orders/parse-chat', requireAdmin, async (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'text is required' });
  if (!openai) return res.status(503).json({ error: 'OpenAI not configured' });
  try {
    const extracted = await extractOrderFromText(text);
    res.json({ extracted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── ADMIN: Parse order from voice note (base64 audio → Whisper → extract) ─────

app.post('/api/admin/orders/parse-voice', requireAdmin, async (req, res) => {
  const { audio_base64, mime_type } = req.body;
  if (!audio_base64) return res.status(400).json({ error: 'audio_base64 is required' });
  if (!openai) return res.status(503).json({ error: 'OpenAI not configured' });
  try {
    const ext = mime_type?.includes('mp4') ? 'mp4' : mime_type?.includes('ogg') ? 'ogg' : mime_type?.includes('mp3') ? 'mp3' : 'webm';
    const buffer = Buffer.from(audio_base64, 'base64');
    const audioFile = await toFile(buffer, `recording.${ext}`, { type: mime_type || 'audio/webm' });
    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      language: 'en',
    });
    const transcript = transcription.text;
    const extracted = await extractOrderFromText(transcript);
    res.json({ transcript, extracted });
  } catch (err) {
    console.error('Voice parse error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Helper: extract order fields from free text ────────────────────────────────

async function extractOrderFromText(text) {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{
      role: 'system',
      content: `You are an order extractor for Petit Demi, a custom cake bakery in Amsterdam.
Extract order details from the text below (WhatsApp/email conversation or voice transcription).

Valid product types: cake, cupcakes, cheesecake, brownie, tart, cookies
Cake sizes: 7_single (7" single layer, 6-8 people, €35), 7_double (7" double, 8-10 people, €45), 7_triple (7" triple, 12+ people, €65), 9_single (9" single, 10-12 people, €40)
Cake flavors: Carrot, Chocolate, Red Velvet, Lemon Blueberry, Cookies & Cream, Lemon Raspberry, Vanilla, Hummingbird, Vanilla Confetti, Coconut Vanilla, Lemon Pistachio
Filling IDs: smb_vanilla, smb_choc, smb_white, cream_cheese, choc_cc, curd_lemon, curd_passion, jam_rasp, jam_blueberry, jam_strawb, fresh_fruit
Occasions: Birthday, Anniversary, Baby Shower, Wedding, Corporate, Just Because, Other
Delivery date: convert any relative date to YYYY-MM-DD. Today is ${new Date().toISOString().split('T')[0]}.

Return ONLY valid JSON (null for unknown fields):
{
  "full_name": string|null, "email": string|null, "phone": string|null,
  "product_type": string|null, "cake_size": string|null, "flavor": string|null,
  "filling": string|null, "quantity": number|null,
  "decoration_type": "basic"|"custom"|null, "decoration_notes": string|null,
  "occasion": string|null, "delivery_date": "YYYY-MM-DD"|null, "notes": string|null
}`,
    }, { role: 'user', content: text }],
    response_format: { type: 'json_object' },
    max_tokens: 400,
  });
  return parseJSON(response.choices[0]?.message?.content) || {};
}

// ── Health ────────────────────────────────────────────────────────────────────

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'petitdemi-api' }));

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n  Petit Demi API`);
  console.log(`  http://localhost:${PORT}`);
  console.log(`  Health: http://localhost:${PORT}/health\n`);
});

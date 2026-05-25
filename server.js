require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const ADMIN_PASSWORD_HASH = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'admin123', 10);

app.post('/api/auth', async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Password required' });
  const valid = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
  if (!valid) return res.status(401).json({ error: 'Invalid password' });
  res.json({ success: true, token: Buffer.from(password + ':' + Date.now()).toString('base64') });
});

app.get('/api/pets', async (req, res) => {
  const { data, error } = await supabase
    .from('pets')
    .select('*')
    .order('name', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.get('/api/pets/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('pets')
    .select('*')
    .eq('id', req.params.id)
    .single();
  if (error) return res.status(404).json({ error: 'Pet not found' });
  res.json(data);
});

app.get('/api/pets/:id/history', async (req, res) => {
  const { data, error } = await supabase
    .from('price_history')
    .select('*')
    .eq('pet_id', req.params.id)
    .order('recorded_at', { ascending: true })
    .limit(50);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/pets', verifyAdmin, async (req, res) => {
  const { name, category, image_url, existence_rate, normal_value, gold_value, rainbow_value, pet_power, demand, has_gold, has_rainbow, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  const { data, error } = await supabase
    .from('pets')
    .insert([{ name, category, image_url, existence_rate, normal_value, gold_value, rainbow_value, pet_power, demand, has_gold, has_rainbow, notes }])
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  await supabase.from('price_history').insert([{
    pet_id: data.id,
    normal_value: data.normal_value,
    gold_value: data.gold_value,
    rainbow_value: data.rainbow_value
  }]);

  res.status(201).json(data);
});

app.put('/api/pets/:id', verifyAdmin, async (req, res) => {
  const { name, category, image_url, existence_rate, normal_value, gold_value, rainbow_value, pet_power, demand, has_gold, has_rainbow, notes } = req.body;

  const { data: existing } = await supabase.from('pets').select('*').eq('id', req.params.id).single();

  const { data, error } = await supabase
    .from('pets')
    .update({ name, category, image_url, existence_rate, normal_value, gold_value, rainbow_value, pet_power, demand, has_gold, has_rainbow, notes, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  if (existing && (existing.normal_value !== normal_value || existing.gold_value !== gold_value || existing.rainbow_value !== rainbow_value)) {
    await supabase.from('price_history').insert([{
      pet_id: data.id,
      normal_value: data.normal_value,
      gold_value: data.gold_value,
      rainbow_value: data.rainbow_value
    }]);
  }

  res.json(data);
});

app.delete('/api/pets/:id', verifyAdmin, async (req, res) => {
  const { error } = await supabase.from('pets').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

app.post('/api/upload', verifyAdmin, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const ext = req.file.originalname.split('.').pop().toLowerCase();
  const allowed = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
  if (!allowed.includes(ext)) return res.status(400).json({ error: 'Invalid file type' });

  const filename = `pets/${Date.now()}-${Math.random().toString(36).substring(2)}.${ext}`;

  const { data, error } = await supabase.storage
    .from('pet-images')
    .upload(filename, req.file.buffer, {
      contentType: req.file.mimetype,
      upsert: false
    });

  if (error) return res.status(500).json({ error: error.message });

  const { data: urlData } = supabase.storage.from('pet-images').getPublicUrl(filename);
  res.json({ url: urlData.publicUrl });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`RHR Value List running on port ${PORT}`));

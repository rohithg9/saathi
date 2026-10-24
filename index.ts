// Edge function (optional): lets Claude phrase Saathi's replies and map staff questions to report tools.
// Safety stays in the app's deterministic layer: emergencies are detected before this is called,
// tiers come from the rules engine, and every reply is re-checked by `checkOutput` on the device.
// Deploy: supabase functions deploy saathi-ai   (secret: ANTHROPIC_API_KEY)
// Data protection: send only the question and approved FAQ text; never names, phone numbers or IDs.

const SYSTEM = `You are Saathi, a warm, firm care companion for older patients in India.
Answer ONLY from the approved care-team answers and medicine facts provided. If they do not cover the question, reply exactly: FORWARD.
Never tell the patient to start, stop, change, double or skip any medicine. Never diagnose. Keep replies under 60 words, simple words, in the patient's language.`;

Deno.serve(async (req) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type' };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const { question, lang, context } = await req.json();
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: Deno.env.get('SAATHI_MODEL') || 'claude-sonnet-5-5', max_tokens: 300, system: SYSTEM,
      messages: [{ role: 'user', content: `Language: ${lang}\nApproved answers and facts:\n${context}\n\nQuestion: ${question}` }] }),
  });
  const j = await res.json();
  const text = j?.content?.[0]?.text?.trim() || 'FORWARD';
  return new Response(JSON.stringify({ text, forward: text === 'FORWARD' }), { headers: { ...cors, 'Content-Type': 'application/json' } });
});

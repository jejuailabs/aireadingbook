// Fail closed until authentication, scoped cost approval and a provider are integrated.
// No caller-supplied role or local demo setting is trusted here.
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
  }
  return res.status(503).json({
    error:'PRODUCTION_DISABLED',
    message:'Server authentication, explicit billing approval and provider integration are required. No job was created.'
  });
}

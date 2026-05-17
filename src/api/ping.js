// api/ping.js — endpoint de diagnóstico sin dependencias
module.exports = function handler(req, res) {
  res.setHeader('Content-Type', 'application/json')
  res.status(200).json({
    ok: true,
    method: req.method,
    timestamp: new Date().toISOString(),
    env: {
      hasFirebaseProject: !!process.env.FIREBASE_PROJECT_ID,
      hasFirebaseEmail:   !!process.env.FIREBASE_CLIENT_EMAIL,
      hasFirebaseKey:     !!process.env.FIREBASE_PRIVATE_KEY,
    }
  })
}

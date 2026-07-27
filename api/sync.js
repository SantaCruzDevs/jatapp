// In-memory sessions store (stays warm during active polling)
const sessions = new Map();

export default function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    // Parse query parameter for room identification
    const { syncId } = req.query;
    
    if (!syncId) {
        return res.status(400).json({ error: "Missing syncId parameter" });
    }
    
    if (req.method === 'GET') {
        const session = sessions.get(syncId) || { state: null, updatedAt: 0 };
        return res.status(200).json(session);
    }
    
    if (req.method === 'POST' || req.method === 'PUT') {
        const { state, updatedAt } = req.body;
        const session = {
            state,
            updatedAt: updatedAt || Date.now()
        };
        sessions.set(syncId, session);
        return res.status(200).json({ success: true, syncId, updatedAt: session.updatedAt });
    }
    
    return res.status(405).end();
}

// Cloudflare Worker for Time Tracker with D1 Database and Real-time Sync
// Deploy this to your Cloudflare account and bind a D1 database named "TIMETRACK_DB"
// Run schema.sql on your D1 database first

export default {
  async fetch(request, env, ctx) {
    // Enable CORS
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Device-ID',
    };

    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;
    const deviceId = request.headers.get('X-Device-ID') || 'unknown-device';

    try {
      // POST /api/user-code - Generate new user sync code
      if (path === '/api/user-code' && request.method === 'POST') {
        return await generateUserCode(env, corsHeaders);
      }
      
      // GET /api/sessions/:userCode - Get all sessions for a user
      if (path.startsWith('/api/sessions/') && request.method === 'GET') {
        const userCode = path.split('/')[3];
        const since = url.searchParams.get('since'); // Unix timestamp for incremental sync
        return await getSessions(env, corsHeaders, userCode, since);
      }
      
      // POST /api/sessions/:userCode - Create new session
      if (path.startsWith('/api/sessions/') && request.method === 'POST') {
        const userCode = path.split('/')[3];
        const data = await request.json();
        return await createSession(env, corsHeaders, userCode, deviceId, data);
      }
      
      // PUT /api/sessions/:userCode/:sessionId - Update session
      if (path.startsWith('/api/sessions/') && request.method === 'PUT') {
        const pathParts = path.split('/');
        const userCode = pathParts[3];
        const sessionId = pathParts[4];
        const data = await request.json();
        return await updateSession(env, corsHeaders, userCode, sessionId, deviceId, data);
      }
      
      // DELETE /api/sessions/:userCode/:sessionId - Delete session
      if (path.startsWith('/api/sessions/') && request.method === 'DELETE') {
        const pathParts = path.split('/');
        const userCode = pathParts[3];
        const sessionId = pathParts[4];
        return await deleteSession(env, corsHeaders, userCode, sessionId, deviceId);
      }
      
      // POST /api/sync/:userCode - Process pending operations for device
      if (path.startsWith('/api/sync/') && request.method === 'POST') {
        const userCode = path.split('/')[3];
        const operations = await request.json();
        return await processPendingOperations(env, corsHeaders, userCode, deviceId, operations);
      }
      
      return new Response('Not found', { 
        status: 404,
        headers: corsHeaders 
      });
      
    } catch (error) {
      console.error('Worker error:', error);
      return new Response('Internal error', { 
        status: 500,
        headers: corsHeaders 
      });
    }
  },
};

// ===== DATABASE FUNCTIONS =====

// Generate unique user code
async function generateUserCode(env, corsHeaders) {
  let attempts = 0;
  const maxAttempts = 100;
  
  while (attempts < maxAttempts) {
    const code = generateSimplePassphrase();
    
    // Check if code already exists
    const existing = await env.TIMETRACK_DB.prepare(
      'SELECT code FROM user_codes WHERE code = ?'
    ).bind(code).first();
    
    if (!existing) {
      // Create new user code
      const now = Date.now();
      await env.TIMETRACK_DB.prepare(`
        INSERT INTO user_codes (code, created_at, last_accessed)
        VALUES (?, ?, ?)
      `).bind(code, now, now).run();
      
      return new Response(JSON.stringify({ code }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    attempts++;
  }
  
  return new Response('Unable to generate unique code', { 
    status: 503, 
    headers: corsHeaders 
  });
}

// Get all sessions for a user (with optional incremental sync)
async function getSessions(env, corsHeaders, userCode, since) {
  // Update last accessed time
  await env.TIMETRACK_DB.prepare(
    'UPDATE user_codes SET last_accessed = ? WHERE code = ?'
  ).bind(Date.now(), userCode).run();
  
  let query = `
    SELECT id, device_id, start_time, end_time, created_at, updated_at
    FROM sessions 
    WHERE user_code = ? AND deleted_at IS NULL
  `;
  const params = [userCode];
  
  // Incremental sync - only return sessions modified after 'since' timestamp
  if (since) {
    query += ' AND updated_at > ?';
    params.push(parseInt(since));
  }
  
  query += ' ORDER BY start_time ASC';
  
  const result = await env.TIMETRACK_DB.prepare(query).bind(...params).all();
  
  return new Response(JSON.stringify({ 
    sessions: result.results || [],
    timestamp: Date.now() // Current server time for next incremental sync
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

// Create new session (start work session)
async function createSession(env, corsHeaders, userCode, deviceId, data) {
  const now = Date.now();
  const sessionId = generateUUID();
  
  try {
    // End any active sessions for this user (prevent multiple active sessions)
    await env.TIMETRACK_DB.prepare(`
      UPDATE sessions 
      SET end_time = ?, updated_at = ? 
      WHERE user_code = ? AND end_time IS NULL AND deleted_at IS NULL
    `).bind(now, now, userCode).run();
    
    // Create new session
    await env.TIMETRACK_DB.prepare(`
      INSERT INTO sessions (id, device_id, user_code, start_time, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(sessionId, deviceId, userCode, data.startTime || now, now, now).run();
    
    return new Response(JSON.stringify({ 
      sessionId,
      timestamp: now 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Create session error:', error);
    return new Response('Failed to create session', { 
      status: 500, 
      headers: corsHeaders 
    });
  }
}

// Update existing session (end session or modify times)
async function updateSession(env, corsHeaders, userCode, sessionId, deviceId, data) {
  const now = Date.now();
  
  try {
    const updates = [];
    const params = [];
    
    if (data.endTime !== undefined) {
      updates.push('end_time = ?');
      params.push(data.endTime);
    }
    
    if (data.startTime !== undefined) {
      updates.push('start_time = ?');
      params.push(data.startTime);
    }
    
    updates.push('updated_at = ?');
    params.push(now);
    
    // Add WHERE conditions
    params.push(sessionId, userCode);
    
    const result = await env.TIMETRACK_DB.prepare(`
      UPDATE sessions 
      SET ${updates.join(', ')}
      WHERE id = ? AND user_code = ? AND deleted_at IS NULL
    `).bind(...params).run();
    
    if (result.changes === 0) {
      return new Response('Session not found', { 
        status: 404, 
        headers: corsHeaders 
      });
    }
    
    return new Response(JSON.stringify({ 
      updated: true,
      timestamp: now 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Update session error:', error);
    return new Response('Failed to update session', { 
      status: 500, 
      headers: corsHeaders 
    });
  }
}

// Soft delete session
async function deleteSession(env, corsHeaders, userCode, sessionId, deviceId) {
  const now = Date.now();
  
  const result = await env.TIMETRACK_DB.prepare(`
    UPDATE sessions 
    SET deleted_at = ?, updated_at = ?
    WHERE id = ? AND user_code = ? AND deleted_at IS NULL
  `).bind(now, now, sessionId, userCode).run();
  
  if (result.changes === 0) {
    return new Response('Session not found', { 
      status: 404, 
      headers: corsHeaders 
    });
  }
  
  return new Response(JSON.stringify({ 
    deleted: true,
    timestamp: now 
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

// Process pending operations from offline devices
async function processPendingOperations(env, corsHeaders, userCode, deviceId, operations) {
  const results = [];
  
  for (const operation of operations) {
    try {
      let result;
      
      switch (operation.type) {
        case 'start_session':
          result = await createSession(env, corsHeaders, userCode, deviceId, operation.data);
          break;
          
        case 'end_session':
          result = await updateSession(env, corsHeaders, userCode, operation.sessionId, deviceId, {
            endTime: operation.data.endTime
          });
          break;
          
        case 'update_session':
          result = await updateSession(env, corsHeaders, userCode, operation.sessionId, deviceId, operation.data);
          break;
          
        case 'delete_session':
          result = await deleteSession(env, corsHeaders, userCode, operation.sessionId, deviceId);
          break;
          
        default:
          results.push({ 
            operationId: operation.id, 
            success: false, 
            error: 'Unknown operation type' 
          });
          continue;
      }
      
      const resultData = await result.json();
      results.push({ 
        operationId: operation.id, 
        success: result.status === 200,
        data: resultData 
      });
      
    } catch (error) {
      console.error('Operation processing error:', error);
      results.push({ 
        operationId: operation.id, 
        success: false, 
        error: error.message 
      });
    }
  }
  
  return new Response(JSON.stringify({ 
    results,
    timestamp: Date.now() 
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

// ===== UTILITY FUNCTIONS =====

// Generate UUID v4
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Generate simple, memorable passphrases
function generateSimplePassphrase() {
  const adjectives = [
    'red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'brown',
    'big', 'small', 'tiny', 'huge', 'fast', 'slow', 'quick', 'swift',
    'hot', 'cold', 'warm', 'cool', 'new', 'old', 'happy', 'calm',
    'bright', 'dark', 'soft', 'loud', 'quiet', 'super', 'nice', 'kind'
  ];
  
  const nouns = [
    'cat', 'dog', 'bird', 'fish', 'mouse', 'rabbit', 'turtle', 'horse',
    'tree', 'flower', 'sun', 'moon', 'star', 'cloud', 'rock', 'river',
    'car', 'bike', 'boat', 'book', 'desk', 'phone', 'clock', 'key',
    'apple', 'pizza', 'cake', 'coffee', 'robot', 'button', 'app'
  ];
  
  const numbers = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
  
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = numbers[Math.floor(Math.random() * numbers.length)];
  
  return `${adj}-${noun}-${num}`;
}
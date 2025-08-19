// Session utilities for converting between logs and sessions
// This helps maintain compatibility during the transition

export const convertLogsToSessions = (logs) => {
  const sessions = [];
  let currentSession = null;
  
  // Sort logs by timestamp to ensure proper pairing
  const sortedLogs = [...logs].sort((a, b) => a.timestamp - b.timestamp);
  
  for (const log of sortedLogs) {
    if (log.type === 'Check In') {
      // End any existing session first (safety measure)
      if (currentSession && !currentSession.endTime) {
        currentSession.endTime = log.timestamp;
        currentSession.duration = calculateDuration(currentSession.startTime, currentSession.endTime);
        sessions.push({ ...currentSession });
      }
      
      // Start new session
      currentSession = {
        id: generateSessionId(log.timestamp),
        deviceId: 'local-device', // For migrated data
        startTime: log.timestamp,
        endTime: null,
        duration: null,
        createdAt: log.timestamp,
        updatedAt: log.timestamp
      };
    }
    
    else if (log.type === 'Check Out' && currentSession) {
      // End current session
      currentSession.endTime = log.timestamp;
      currentSession.duration = calculateDuration(currentSession.startTime, currentSession.endTime);
      currentSession.updatedAt = log.timestamp;
      sessions.push({ ...currentSession });
      currentSession = null;
    }
  }
  
  // Handle incomplete session (still checked in)
  if (currentSession) {
    sessions.push({ ...currentSession });
  }
  
  return sessions;
};

export const convertSessionsToLogs = (sessions) => {
  const logs = [];
  
  for (const session of sessions) {
    // Add check-in log
    logs.push({
      type: 'Check In',
      date: formatDateFromTimestamp(session.startTime),
      time: formatTimeFromTimestamp(session.startTime),
      timestamp: session.startTime
    });
    
    // Add check-out log if session is complete
    if (session.endTime) {
      logs.push({
        type: 'Check Out',
        date: formatDateFromTimestamp(session.endTime),
        time: formatTimeFromTimestamp(session.endTime),
        timestamp: session.endTime,
        duration: session.duration || calculateDurationString(session.startTime, session.endTime)
      });
    }
  }
  
  // Sort by timestamp
  return logs.sort((a, b) => a.timestamp - b.timestamp);
};

export const findActiveSession = (sessions) => {
  return sessions.find(session => !session.endTime);
};

export const calculateDuration = (startTime, endTime) => {
  if (!endTime) return null;
  
  const diff = Math.floor((endTime - startTime) / 1000 / 60); // minutes
  const hours = Math.floor(diff / 60);
  const minutes = diff % 60;
  return `${hours}h ${minutes}m`;
};

export const calculateDurationString = (startTime, endTime) => {
  return calculateDuration(startTime, endTime);
};

export const formatDateFromTimestamp = (timestamp) => {
  const date = new Date(timestamp);
  return date.toISOString().split('T')[0]; // YYYY-MM-DD
};

export const formatTimeFromTimestamp = (timestamp) => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-GB', { 
    hour: '2-digit', 
    minute: '2-digit',
    second: '2-digit',
    hour12: false 
  });
};

export const formatElapsedTime = (milliseconds) => {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

export const generateSessionId = (timestamp) => {
  return `session_${timestamp}_${Math.random().toString(36).substr(2, 9)}`;
};

// Migration helper - checks if we need to convert old log data to sessions
export const migrateLogsToSessions = () => {
  const oldLogs = localStorage.getItem('timeTrackerLogs');
  const existingSessions = localStorage.getItem('timeTrackerSessions');
  
  // Only migrate if we have old logs but no sessions
  if (oldLogs && !existingSessions) {
    console.log('🔄 Migrating legacy log data to session format...');
    
    try {
      const logs = JSON.parse(oldLogs);
      const sessions = convertLogsToSessions(logs);
      
      // Save sessions
      localStorage.setItem('timeTrackerSessions', JSON.stringify(sessions));
      
      // Keep old logs for backup during transition
      localStorage.setItem('timeTrackerLogs_backup', oldLogs);
      
      console.log(`✅ Migrated ${logs.length} logs to ${sessions.length} sessions`);
      
      return sessions;
    } catch (error) {
      console.error('❌ Failed to migrate logs to sessions:', error);
      return [];
    }
  }
  
  return null; // No migration needed
};
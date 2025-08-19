// Real-time Sync Engine for Time Tracker
// Handles online/offline synchronization with D1 database

class SyncEngine {
  constructor(apiUrl = 'https://timetrack-api.nitenet.workers.dev') {
    this.apiUrl = apiUrl;
    this.deviceId = this.getOrCreateDeviceId();
    this.userCode = null;
    this.isOnline = navigator.onLine;
    this.lastSyncTimestamp = null;
    this.syncInterval = null;
    this.pendingOperations = [];
    this.eventListeners = new Map();
    
    // Bind methods to preserve context
    this.handleOnline = this.handleOnline.bind(this);
    this.handleOffline = this.handleOffline.bind(this);
    this.syncPendingOperations = this.syncPendingOperations.bind(this);
    
    // Listen for online/offline events
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
    
    this.loadPendingOperations();
  }

  // ===== DEVICE & USER MANAGEMENT =====
  
  getOrCreateDeviceId() {
    let deviceId = localStorage.getItem('timeTrackerDeviceId');
    if (!deviceId) {
      deviceId = this.generateUUID();
      localStorage.setItem('timeTrackerDeviceId', deviceId);
    }
    return deviceId;
  }
  
  setUserCode(userCode) {
    this.userCode = userCode;
    localStorage.setItem('timeTrackerUserCode', userCode);
    this.loadLastSyncTimestamp();
  }
  
  getUserCode() {
    if (!this.userCode) {
      this.userCode = localStorage.getItem('timeTrackerUserCode');
    }
    return this.userCode;
  }

  // ===== EVENT HANDLING =====
  
  addEventListener(event, callback) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(callback);
  }
  
  removeEventListener(event, callback) {
    if (this.eventListeners.has(event)) {
      const listeners = this.eventListeners.get(event);
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }
  
  emit(event, data) {
    if (this.eventListeners.has(event)) {
      this.eventListeners.get(event).forEach(callback => callback(data));
    }
  }

  // ===== NETWORK STATE MANAGEMENT =====
  
  handleOnline() {
    console.log('🌐 Connection restored - syncing pending operations');
    this.isOnline = true;
    this.emit('online');
    
    // Sync pending operations when coming back online
    if (this.userCode && this.pendingOperations.length > 0) {
      this.syncPendingOperations();
    }
    
    // Resume auto-sync
    this.startAutoSync();
  }
  
  handleOffline() {
    console.log('📱 Connection lost - entering offline mode');
    this.isOnline = false;
    this.emit('offline');
    this.stopAutoSync();
  }

  // ===== OFFLINE OPERATIONS QUEUE =====
  
  loadPendingOperations() {
    const stored = localStorage.getItem('timeTrackerPendingOperations');
    this.pendingOperations = stored ? JSON.parse(stored) : [];
  }
  
  savePendingOperations() {
    localStorage.setItem('timeTrackerPendingOperations', JSON.stringify(this.pendingOperations));
  }
  
  addPendingOperation(type, sessionId, data) {
    const operation = {
      id: this.generateUUID(),
      type,
      sessionId,
      data,
      timestamp: Date.now(),
      retries: 0
    };
    
    this.pendingOperations.push(operation);
    this.savePendingOperations();
    
    console.log(`📝 Queued ${type} operation:`, operation);
    
    // Try to sync immediately if online
    if (this.isOnline && this.userCode) {
      this.syncPendingOperations();
    }
    
    return operation.id;
  }
  
  async syncPendingOperations() {
    if (!this.userCode || this.pendingOperations.length === 0) {
      return;
    }
    
    console.log(`🔄 Syncing ${this.pendingOperations.length} pending operations...`);
    this.emit('syncStart');
    
    try {
      const response = await fetch(`${this.apiUrl}/api/sync/${this.userCode}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Device-ID': this.deviceId
        },
        body: JSON.stringify(this.pendingOperations)
      });
      
      if (!response.ok) {
        throw new Error(`Sync failed: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      // Remove successfully processed operations
      const successfulIds = result.results
        .filter(r => r.success)
        .map(r => r.operationId);
      
      this.pendingOperations = this.pendingOperations.filter(
        op => !successfulIds.includes(op.id)
      );
      
      // Increment retry count for failed operations
      const failedIds = result.results
        .filter(r => !r.success)
        .map(r => r.operationId);
      
      this.pendingOperations.forEach(op => {
        if (failedIds.includes(op.id)) {
          op.retries = (op.retries || 0) + 1;
        }
      });
      
      // Remove operations that have failed too many times
      this.pendingOperations = this.pendingOperations.filter(
        op => (op.retries || 0) < 5
      );
      
      this.savePendingOperations();
      this.lastSyncTimestamp = result.timestamp;
      this.saveLastSyncTimestamp();
      
      console.log(`✅ Sync complete - ${successfulIds.length} succeeded, ${failedIds.length} failed`);
      this.emit('syncSuccess', result);
      
    } catch (error) {
      console.error('❌ Sync failed:', error);
      this.emit('syncError', error);
    }
  }

  // ===== SESSION OPERATIONS =====
  
  async startSession(startTime = Date.now()) {
    const sessionId = this.generateUUID();
    
    if (this.isOnline && this.userCode) {
      try {
        const response = await fetch(`${this.apiUrl}/api/sessions/${this.userCode}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Device-ID': this.deviceId
          },
          body: JSON.stringify({ startTime })
        });
        
        if (response.ok) {
          const result = await response.json();
          this.emit('sessionStarted', { sessionId: result.sessionId, startTime });
          return result.sessionId;
        }
      } catch (error) {
        console.log('Failed to start session online, queuing for offline sync');
      }
    }
    
    // Queue for offline sync
    this.addPendingOperation('start_session', sessionId, { startTime });
    this.emit('sessionStarted', { sessionId, startTime });
    return sessionId;
  }
  
  async endSession(sessionId, endTime = Date.now()) {
    if (this.isOnline && this.userCode) {
      try {
        const response = await fetch(`${this.apiUrl}/api/sessions/${this.userCode}/${sessionId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'X-Device-ID': this.deviceId
          },
          body: JSON.stringify({ endTime })
        });
        
        if (response.ok) {
          this.emit('sessionEnded', { sessionId, endTime });
          return;
        }
      } catch (error) {
        console.log('Failed to end session online, queuing for offline sync');
      }
    }
    
    // Queue for offline sync
    this.addPendingOperation('end_session', sessionId, { endTime });
    this.emit('sessionEnded', { sessionId, endTime });
  }
  
  async updateSession(sessionId, data) {
    if (this.isOnline && this.userCode) {
      try {
        const response = await fetch(`${this.apiUrl}/api/sessions/${this.userCode}/${sessionId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'X-Device-ID': this.deviceId
          },
          body: JSON.stringify(data)
        });
        
        if (response.ok) {
          this.emit('sessionUpdated', { sessionId, ...data });
          return;
        }
      } catch (error) {
        console.log('Failed to update session online, queuing for offline sync');
      }
    }
    
    // Queue for offline sync
    this.addPendingOperation('update_session', sessionId, data);
    this.emit('sessionUpdated', { sessionId, ...data });
  }
  
  async deleteSession(sessionId) {
    if (this.isOnline && this.userCode) {
      try {
        const response = await fetch(`${this.apiUrl}/api/sessions/${this.userCode}/${sessionId}`, {
          method: 'DELETE',
          headers: {
            'X-Device-ID': this.deviceId
          }
        });
        
        if (response.ok) {
          this.emit('sessionDeleted', { sessionId });
          return;
        }
      } catch (error) {
        console.log('Failed to delete session online, queuing for offline sync');
      }
    }
    
    // Queue for offline sync
    this.addPendingOperation('delete_session', sessionId, {});
    this.emit('sessionDeleted', { sessionId });
  }

  // ===== SYNC & DATA FETCHING =====
  
  async fetchSessions(forceRefresh = false) {
    if (!this.isOnline || !this.userCode) {
      return [];
    }
    
    try {
      let url = `${this.apiUrl}/api/sessions/${this.userCode}`;
      
      // Incremental sync - only fetch sessions modified since last sync
      if (!forceRefresh && this.lastSyncTimestamp) {
        url += `?since=${this.lastSyncTimestamp}`;
      }
      
      const response = await fetch(url, {
        headers: {
          'X-Device-ID': this.deviceId
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch sessions: ${response.statusText}`);
      }
      
      const result = await response.json();
      this.lastSyncTimestamp = result.timestamp;
      this.saveLastSyncTimestamp();
      
      console.log(`📥 Fetched ${result.sessions.length} sessions`);
      this.emit('sessionsReceived', result.sessions);
      
      return result.sessions;
      
    } catch (error) {
      console.error('❌ Failed to fetch sessions:', error);
      this.emit('syncError', error);
      return [];
    }
  }
  
  async generateUserCode() {
    try {
      const response = await fetch(`${this.apiUrl}/api/user-code`, {
        method: 'POST',
        headers: {
          'X-Device-ID': this.deviceId
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to generate user code: ${response.statusText}`);
      }
      
      const result = await response.json();
      this.setUserCode(result.code);
      
      console.log(`🔑 Generated user code: ${result.code}`);
      this.emit('userCodeGenerated', result.code);
      
      return result.code;
      
    } catch (error) {
      console.error('❌ Failed to generate user code:', error);
      throw error;
    }
  }

  // ===== AUTO-SYNC =====
  
  startAutoSync(intervalMs = 30000) { // Default: sync every 30 seconds
    this.stopAutoSync();
    
    if (!this.userCode) {
      return;
    }
    
    console.log(`🔄 Starting auto-sync (${intervalMs}ms interval)`);
    
    this.syncInterval = setInterval(async () => {
      if (this.isOnline && this.userCode) {
        // Sync pending operations first
        if (this.pendingOperations.length > 0) {
          await this.syncPendingOperations();
        }
        
        // Fetch new sessions from server
        await this.fetchSessions();
      }
    }, intervalMs);
  }
  
  stopAutoSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      console.log('⏹️ Auto-sync stopped');
    }
  }

  // ===== PERSISTENCE =====
  
  loadLastSyncTimestamp() {
    if (this.userCode) {
      const stored = localStorage.getItem(`timeTrackerLastSync_${this.userCode}`);
      this.lastSyncTimestamp = stored ? parseInt(stored) : null;
    }
  }
  
  saveLastSyncTimestamp() {
    if (this.userCode && this.lastSyncTimestamp) {
      localStorage.setItem(`timeTrackerLastSync_${this.userCode}`, this.lastSyncTimestamp.toString());
    }
  }

  // ===== UTILITIES =====
  
  generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
  
  // ===== CLEANUP =====
  
  destroy() {
    this.stopAutoSync();
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
    this.eventListeners.clear();
  }
}

export default SyncEngine;
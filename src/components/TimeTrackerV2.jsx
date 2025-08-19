import React, { useState, useEffect, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Clock, Download, Trash2, Moon, Sun, X, Wifi, WifiOff } from 'lucide-react';
import { cn } from '../lib/utils';
import {
  Dialog,
  DialogTrigger,
} from './ui/dialog';
import ExportDialog from './ExportDialog';
import CreditCardBadge from './CreditCardBadge';
import SyncEngine from '../lib/syncEngine';
import { 
  convertSessionsToLogs, 
  findActiveSession, 
  formatElapsedTime,
  formatTimeFromTimestamp,
  formatDateFromTimestamp,
  migrateLogsToSessions
} from '../lib/sessionUtils';

const TimeTrackerV2 = () => {
  const [currentTime, setCurrentTime] = useState('');
  const [currentDate, setCurrentDate] = useState('');
  const [sessions, setSessions] = useState([]);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [elapsedTime, setElapsedTime] = useState('00:00:00');
  const [focusedSessionId, setFocusedSessionId] = useState(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isAutoSync, setIsAutoSync] = useState(false);
  const [syncStatus, setSyncStatus] = useState('idle'); // 'idle', 'syncing', 'error'
  const [editingSessionId, setEditingSessionId] = useState(null);
  const [editedStartTime, setEditedStartTime] = useState('');
  const [editedEndTime, setEditedEndTime] = useState('');
  const [editedStartDate, setEditedStartDate] = useState('');
  const [editedEndDate, setEditedEndDate] = useState('');
  
  const syncEngine = useRef(null);

  // Initialize sync engine and migrate data
  useEffect(() => {
    // Try to migrate old log data first
    const migratedSessions = migrateLogsToSessions();
    if (migratedSessions) {
      setSessions(migratedSessions);
    } else {
      // Load existing sessions
      const savedSessions = localStorage.getItem('timeTrackerSessions');
      if (savedSessions) {
        setSessions(JSON.parse(savedSessions));
      }
    }

    // Initialize sync engine
    syncEngine.current = new SyncEngine();
    
    // Set up event listeners
    syncEngine.current.addEventListener('online', () => {
      setIsOnline(true);
      setSyncStatus('idle');
    });
    
    syncEngine.current.addEventListener('offline', () => {
      setIsOnline(false);
    });
    
    syncEngine.current.addEventListener('syncStart', () => {
      setSyncStatus('syncing');
    });
    
    syncEngine.current.addEventListener('syncSuccess', () => {
      setSyncStatus('idle');
    });
    
    syncEngine.current.addEventListener('syncError', () => {
      setSyncStatus('error');
      // Reset to idle after a delay to retry
      setTimeout(() => setSyncStatus('idle'), 5000);
    });
    
    syncEngine.current.addEventListener('sessionsReceived', (newSessions) => {
      // Merge with local sessions
      setSessions(prevSessions => {
        const merged = [...prevSessions];
        
        newSessions.forEach(newSession => {
          const existingIndex = merged.findIndex(s => s.id === newSession.id);
          if (existingIndex >= 0) {
            // Update existing session if newer
            if (newSession.updatedAt > merged[existingIndex].updatedAt) {
              merged[existingIndex] = newSession;
            }
          } else {
            // Add new session
            merged.push(newSession);
          }
        });
        
        return merged.sort((a, b) => a.startTime - b.startTime);
      });
    });
    
    // Load theme and auto-sync preferences
    const savedTheme = localStorage.getItem('timeTrackerTheme');
    if (savedTheme) {
      setIsDarkMode(JSON.parse(savedTheme));
    }
    
    const savedAutoSync = localStorage.getItem('timeTrackerAutoSync');
    if (savedAutoSync) {
      const autoSyncEnabled = JSON.parse(savedAutoSync);
      setIsAutoSync(autoSyncEnabled);
      if (autoSyncEnabled) {
        enableAutoSync();
      }
    }
    
    // Load user code if available
    const userCode = syncEngine.current.getUserCode();
    if (userCode && autoSyncEnabled) {
      enableAutoSync();
    }

    return () => {
      if (syncEngine.current) {
        syncEngine.current.destroy();
      }
    };
  }, []);

  // Save sessions to localStorage
  useEffect(() => {
    localStorage.setItem('timeTrackerSessions', JSON.stringify(sessions));
  }, [sessions]);

  // Theme handling
  useEffect(() => {
    localStorage.setItem('timeTrackerTheme', JSON.stringify(isDarkMode));
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    
    const themeColorMeta = document.querySelector('meta[name="theme-color"]:not([media])');
    if (themeColorMeta) {
      themeColorMeta.content = isDarkMode ? '#1f2937' : '#ffffff';
    }
  }, [isDarkMode]);

  // Clear focus when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest('.session-entry')) {
        setFocusedSessionId(null);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // Get current session state
  const activeSession = findActiveSession(sessions);
  const isCheckedIn = !!activeSession;
  const checkInTime = activeSession ? new Date(activeSession.startTime) : null;

  // Update elapsed time timer
  useEffect(() => {
    let interval;
    
    if (isCheckedIn && checkInTime) {
      const updateElapsed = () => {
        const currentTime = Date.now();
        const timeDiff = currentTime - checkInTime.getTime();
        setElapsedTime(formatElapsedTime(timeDiff));
      };
      
      updateElapsed(); // Update immediately
      interval = setInterval(updateElapsed, 1000); // Then every second
    } else {
      setElapsedTime('00:00:00');
    }
    
    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [isCheckedIn, checkInTime]);

  // Update current time display
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('en-GB', { 
        hour: '2-digit', 
        minute: '2-digit',
        second: '2-digit',
        hour12: false 
      }));
      setCurrentDate(now.toLocaleDateString(undefined, { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      }));
    }, 1000);
    
    return () => clearInterval(timer);
  }, []);

  // Session operations
  const handleCheckIn = async () => {
    const startTime = Date.now();
    const sessionId = await syncEngine.current.startSession(startTime);
    
    // Optimistically add to local state
    const newSession = {
      id: sessionId,
      deviceId: syncEngine.current.deviceId,
      startTime,
      endTime: null,
      createdAt: startTime,
      updatedAt: startTime
    };
    
    setSessions(prev => [...prev, newSession]);
  };

  const handleCheckOut = async () => {
    if (!activeSession) {
      console.error('No active session found');
      return;
    }

    const endTime = Date.now();
    await syncEngine.current.endSession(activeSession.id, endTime);
    
    // Optimistically update local state
    setSessions(prev => prev.map(session => 
      session.id === activeSession.id 
        ? { ...session, endTime, updatedAt: endTime }
        : session
    ));
  };

  const handleDeleteSession = async (session) => {
    if (!window.confirm('Are you sure you want to delete this session?')) {
      return;
    }
    
    await syncEngine.current.deleteSession(session.id);
    
    // Optimistically remove from local state
    setSessions(prev => prev.filter(s => s.id !== session.id));
  };

  const enableAutoSync = () => {
    const userCode = syncEngine.current.getUserCode();
    if (userCode && syncEngine.current) {
      syncEngine.current.startAutoSync();
      setIsAutoSync(true);
      localStorage.setItem('timeTrackerAutoSync', JSON.stringify(true));
    }
  };

  const disableAutoSync = () => {
    if (syncEngine.current) {
      syncEngine.current.stopAutoSync();
    }
    setIsAutoSync(false);
    localStorage.setItem('timeTrackerAutoSync', JSON.stringify(false));
  };

  const handleAutoSyncChange = (enabled) => {
    if (enabled) {
      enableAutoSync();
    } else {
      disableAutoSync();
    }
  };

  const toggleTheme = () => {
    setIsDarkMode(!isDarkMode);
  };

  const clearAllSessions = () => {
    if (window.confirm('Are you sure you want to clear all sessions? This cannot be undone.')) {
      setSessions([]);
      localStorage.removeItem('timeTrackerSessions');
    }
  };

  // Convert sessions to logs for backward compatibility with ExportDialog
  const logsForExport = convertSessionsToLogs(sessions);

  // Helper function for session display
  const getSessionDisplayData = (session) => {
    const startTime = formatTimeFromTimestamp(session.startTime);
    const startDate = formatDateFromTimestamp(session.startTime);
    
    if (session.endTime) {
      const endTime = formatTimeFromTimestamp(session.endTime);
      const endDate = formatDateFromTimestamp(session.endTime);
      const duration = Math.floor((session.endTime - session.startTime) / 1000 / 60);
      const hours = Math.floor(duration / 60);
      const minutes = duration % 60;
      const durationString = `${hours}h ${minutes}m`;
      
      return {
        type: 'Completed Session',
        startTime,
        startDate,
        endTime,
        endDate,
        duration: durationString,
        isActive: false
      };
    } else {
      return {
        type: 'Active Session',
        startTime,
        startDate,
        endTime: null,
        endDate: null,
        duration: null,
        isActive: true
      };
    }
  };

  return (
    <div className={cn(
      "min-h-screen w-full p-2 pb-16 transition-colors duration-200 relative",
      isDarkMode ? "bg-gray-900" : "bg-white"
    )}>
      <Card className={cn(
        "w-full shadow-lg",
        isDarkMode ? "bg-gray-800 border-gray-700" : "bg-white"
      )}>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className={cn(
                "w-5 h-5",
                isDarkMode ? "text-blue-400" : "text-blue-500"
              )} />
              <span className={cn(
                "text-base translate-y-[1px]",
                isDarkMode ? "text-gray-100" : "text-gray-900"
              )}>Time Tracker</span>
            </div>
            <div className="flex gap-2 items-center">
              {/* Online/Offline status */}
              <div className={cn(
                "flex items-center gap-1 text-xs px-2 py-1 rounded-full",
                isOnline 
                  ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                  : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
              )}>
                {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                {isAutoSync && syncStatus === 'syncing' && (
                  <span className="ml-1">Syncing...</span>
                )}
              </div>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAllSessions}
                className={cn(
                  "p-2 bg-transparent focus:outline-none focus:ring-0",
                  isDarkMode 
                    ? "text-gray-300 hover:text-red-400 hover:bg-gray-700 border-transparent" 
                    : "text-gray-600 hover:text-red-600 hover:bg-gray-100 border-transparent"
                )}
                title="Clear all sessions"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleTheme}
                className={cn(
                  "p-2 bg-transparent focus:outline-none focus:ring-0",
                  isDarkMode 
                    ? "text-gray-300 hover:text-gray-100 hover:bg-gray-700 border-transparent" 
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-100 border-transparent"
                )}
              >
                {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </Button>
              
              <Dialog>
                <DialogTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="sm"
                    className={cn(
                      "flex items-center gap-1 text-xs focus:outline-none focus:ring-0",
                      isDarkMode 
                        ? "border-gray-600 text-gray-300 hover:text-gray-100 hover:bg-gray-700 bg-transparent" 
                        : "text-gray-600 hover:text-gray-900 hover:bg-gray-100 bg-transparent"
                    )}
                  >
                    <Download className="w-3 h-3" />
                    Export
                  </Button>
                </DialogTrigger>
                <ExportDialog 
                  logs={logsForExport}
                  onImportLogs={(importedLogs) => {
                    // Convert imported logs back to sessions and merge
                    console.log('Import functionality needs to be updated for sessions');
                  }}
                  onAutoSyncChange={handleAutoSyncChange}
                  syncEngine={syncEngine.current}
                />
              </Dialog>
            </div>
          </CardTitle>
        </CardHeader>
        
        <CardContent>
          <div className={cn(
            "text-center py-8 border-y",
            isDarkMode ? "border-gray-700" : ""
          )}>
            <div className={cn(
              "text-sm mb-1",
              isDarkMode ? "text-gray-400" : "text-gray-500"
            )}>{currentDate}</div>
            <div className={cn(
              "text-4xl font-bold mb-6 font-mono",
              isDarkMode ? "text-gray-100" : "text-gray-900"
            )}>{elapsedTime}</div>
            <Button 
              className={cn(
                "w-48 h-12 transition-all duration-200 text-lg focus:outline-none focus:ring-0",
                isCheckedIn 
                  ? cn(
                      "bg-red-500 hover:bg-red-600",
                      isDarkMode ? "shadow-lg shadow-red-900/50" : "shadow-lg shadow-red-200"
                    )
                  : cn(
                      "bg-green-500 hover:bg-green-600",
                      isDarkMode ? "shadow-lg shadow-green-900/50" : "shadow-lg shadow-green-200"
                    )
              )}
              onClick={isCheckedIn ? handleCheckOut : handleCheckIn}
            >
              {isCheckedIn ? 'Check Out' : 'Check In'}
            </Button>
          </div>
          
          <div className="mt-4 overflow-x-hidden">
            <h3 className={cn(
              "text-sm font-medium mb-3",
              isDarkMode ? "text-gray-300" : "text-gray-500"
            )}>Recent Sessions</h3>
            <div className="max-h-64 overflow-y-auto px-1 pr-3 py-2 relative">
              {sessions.slice().reverse().map((session) => {
                const displayData = getSessionDisplayData(session);
                
                return (
                  <div 
                    key={session.id} 
                    className={cn(
                      "group relative session-entry",
                      "p-2 rounded-lg text-sm mb-2 cursor-pointer",
                      displayData.isActive
                        ? isDarkMode ? 'bg-green-900/20 border border-green-800/50' : 'bg-green-50 border border-green-200'
                        : isDarkMode ? 'bg-gray-800/50' : 'bg-gray-50'
                    )}
                    onClick={() => setFocusedSessionId(session.id)}
                    onMouseEnter={() => setFocusedSessionId(session.id)}
                    onMouseLeave={() => setFocusedSessionId(null)}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <span className={cn(
                          "font-medium",
                          displayData.isActive 
                            ? isDarkMode ? 'text-green-400' : 'text-green-600'
                            : isDarkMode ? 'text-gray-300' : 'text-gray-700'
                        )}>
                          {displayData.type}
                        </span>
                        <div className={cn(
                          "text-xs mt-1",
                          isDarkMode ? "text-gray-400" : "text-gray-500"
                        )}>
                          Started: {displayData.startDate} at {displayData.startTime}
                          {displayData.endTime && (
                            <div>Ended: {displayData.endDate} at {displayData.endTime}</div>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        {displayData.duration && (
                          <div className={cn(
                            "font-mono font-medium",
                            isDarkMode ? "text-gray-100" : "text-gray-900"
                          )}>{displayData.duration}</div>
                        )}
                        {displayData.isActive && (
                          <div className={cn(
                            "text-xs",
                            isDarkMode ? "text-green-400" : "text-green-600"
                          )}>Active</div>
                        )}
                      </div>
                    </div>

                    {/* Delete button */}
                    {focusedSessionId === session.id && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteSession(session)}
                        className={cn(
                          "absolute -top-1.5 -right-1.5 h-5 w-5 p-0 rounded-full",
                          "flex items-center justify-center text-base leading-none",
                          "border shadow-sm focus:outline-none focus:ring-0",
                          isDarkMode
                            ? "text-red-400 hover:text-red-300 border-gray-600 bg-gray-800 hover:bg-gray-700" 
                            : "text-red-600 hover:text-red-700 border-gray-200 bg-white hover:bg-gray-50"
                        )}
                      >
                        ×
                      </Button>
                    )}
                  </div>
                );
              })}
              
              {sessions.length === 0 && (
                <div className={cn(
                  "text-center text-sm py-8",
                  isDarkMode ? "text-gray-400" : "text-gray-500"
                )}>
                  No sessions yet. Click "Check In" to start tracking time.
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
      <CreditCardBadge />
    </div>
  );
};

export default TimeTrackerV2;
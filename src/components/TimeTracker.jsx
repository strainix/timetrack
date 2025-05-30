import React, { useState, useEffect, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Clock, Download, Trash2, Moon, Sun, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import { cn } from '../lib/utils';
import {
  Dialog,
  DialogTrigger,
} from './ui/dialog';
import ExportDialog from './ExportDialog';
import CreditCardBadge from './CreditCardBadge';

const WORKER_API_URL = 'https://timetrack-api.nitenet.workers.dev';
const STORAGE_KEY = 'timeTrackerShareCode';
const AUTO_SYNC_KEY = 'timeTrackerAutoSync';

const TimeTracker = () => {
  const [currentTime, setCurrentTime] = useState('');
  const [currentDate, setCurrentDate] = useState('');
  const [logs, setLogs] = useState([]);
  const [deletedLogs, setDeletedLogs] = useState([]); // Track deleted log IDs
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [editingLogId, setEditingLogId] = useState(null);
  const [editedTime, setEditedTime] = useState('');
  const [editedDate, setEditedDate] = useState('');
  const [editedType, setEditedType] = useState('');
  const [elapsedTime, setElapsedTime] = useState('00:00:00');
  const [focusedLogId, setFocusedLogId] = useState(null);
  const [autoSync, setAutoSync] = useState(false);
  const [lastSyncTimestamp, setLastSyncTimestamp] = useState(null);
  const syncTimeoutRef = useRef(null);
  const lastEditTimestampRef = useRef(null);

  // Derive check-in state from logs
  const getCheckInState = () => {
    if (logs.length === 0) return { isCheckedIn: false, checkInTime: null };
    
    const lastLog = logs[logs.length - 1];
    if (lastLog.type === 'Check In') {
      return { isCheckedIn: true, checkInTime: new Date(lastLog.timestamp) };
    }
    return { isCheckedIn: false, checkInTime: null };
  };

  const { isCheckedIn, checkInTime } = getCheckInState();

  // Helper function for consistent time formatting
  const formatTime = (date) => {
    return date.toLocaleTimeString('en-GB', { 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit',
      hour12: false 
    });
  };

  const formatElapsedTime = (milliseconds) => {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  // Format date for input field (YYYY-MM-DD)
  const formatDateForInput = (timestamp) => {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  useEffect(() => {
    // Load saved logs
    const savedLogs = localStorage.getItem('timeTrackerLogs');
    if (savedLogs) {
      const parsedLogs = JSON.parse(savedLogs);
      // Migrate old logs without IDs
      const migratedLogs = parsedLogs.map(log => {
        if (!log.id) {
          return {
            ...log,
            id: generateId()
          };
        }
        return log;
      });
      setLogs(migratedLogs);
    }
    
    // Load deleted logs
    const savedDeletedLogs = localStorage.getItem('timeTrackerDeletedLogs');
    if (savedDeletedLogs) {
      setDeletedLogs(JSON.parse(savedDeletedLogs));
    }
  
    // Load theme preference
    const savedTheme = localStorage.getItem('timeTrackerTheme');
    if (savedTheme) {
      setIsDarkMode(JSON.parse(savedTheme));
    }
    
    // Load auto-sync preference
    const savedAutoSync = localStorage.getItem(AUTO_SYNC_KEY);
    if (savedAutoSync) {
      setAutoSync(JSON.parse(savedAutoSync));
    }
  }, []);

  // Auto-sync functionality
  const syncData = async () => {
    const shareCode = localStorage.getItem(STORAGE_KEY);
    if (!shareCode || !autoSync) return;

    try {
      // Update sync status in the ExportDialog
      if (window.updateSyncStatus) {
        window.updateSyncStatus('syncing');
      }

      // First, fetch the latest data from the server
      const fetchResponse = await fetch(`${WORKER_API_URL}/api/timesheet/${shareCode}`);
      
      if (fetchResponse.ok) {
        const serverData = await fetchResponse.json();
        const serverLogs = serverData.logs || [];
        
        // Create a map of logs with their last edit timestamp
        const logsWithEditTime = logs.map(log => ({
          ...log,
          lastEditTimestamp: log.lastEditTimestamp || log.timestamp
        }));
        
        // Merge logs: prefer server version unless local has been edited more recently
        const mergedLogs = [...logsWithEditTime];
        
        serverLogs.forEach(serverLog => {
          // Skip if this log has been deleted locally
          if (deletedLogs.some(deleted => deleted.id === serverLog.id)) {
            return;
          }
          
          const localLogIndex = mergedLogs.findIndex(l => l.id === serverLog.id);
          
          if (localLogIndex === -1) {
            // Log doesn't exist locally, add it
            mergedLogs.push(serverLog);
          } else {
            const localLog = mergedLogs[localLogIndex];
            const serverEditTime = serverLog.lastEditTimestamp || serverLog.timestamp;
            const localEditTime = localLog.lastEditTimestamp || localLog.timestamp;
            
            // Only update if server version is newer or if this is the initial sync
            if (!lastEditTimestampRef.current || serverEditTime > localEditTime) {
              mergedLogs[localLogIndex] = serverLog;
            }
          }
        });
        
        // Sort and update logs
        mergedLogs.sort((a, b) => a.timestamp - b.timestamp);
        
        // Only update if there are actual changes
        const logsChanged = JSON.stringify(mergedLogs) !== JSON.stringify(logs);
        if (logsChanged) {
          setLogs(mergedLogs);
        }
      }

      // Then sync our current data to the server
      const syncResponse = await fetch(`${WORKER_API_URL}/api/timesheet/${shareCode}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          logs,
          deletedLogs: deletedLogs.map(d => d.id) // Send list of deleted IDs
        }),
      });
      
      if (syncResponse.ok) {
        setLastSyncTimestamp(Date.now());
        if (window.updateSyncStatus) {
          window.updateSyncStatus('idle');
        }
      } else {
        throw new Error('Sync failed');
      }
    } catch (error) {
      console.error('Auto-sync error:', error);
      if (window.updateSyncStatus) {
        window.updateSyncStatus('error');
      }
      // Retry after 30 seconds on error
      syncTimeoutRef.current = setTimeout(syncData, 30000);
    }
  };

  // Trigger sync when logs change (with debounce)
  useEffect(() => {
    if (!autoSync) return;

    // Clear existing timeout
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }

    // Set edit timestamp when logs change
    lastEditTimestampRef.current = Date.now();

    // Debounce sync to avoid too many requests
    syncTimeoutRef.current = setTimeout(() => {
      syncData();
    }, 2000); // 2 second debounce

    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, [logs, deletedLogs, autoSync]);

  // Initial sync when auto-sync is enabled
  useEffect(() => {
    if (autoSync) {
      syncData();
      // Set up periodic sync every 30 seconds
      const intervalId = setInterval(syncData, 30000);
      return () => clearInterval(intervalId);
    }
  }, [autoSync]);

  const handleAutoSyncChange = (enabled) => {
    setAutoSync(enabled);
    if (enabled) {
      // Sync immediately when enabled
      syncData();
    }
  };

  useEffect(() => {
    // Save logs with edit timestamps
    const logsToSave = logs.map(log => ({
      ...log,
      lastEditTimestamp: log.lastEditTimestamp || log.timestamp
    }));
    localStorage.setItem('timeTrackerLogs', JSON.stringify(logsToSave));
  }, [logs]);

  // Save theme preference
  useEffect(() => {
    localStorage.setItem('timeTrackerTheme', JSON.stringify(isDarkMode));
    // Update document class for dark mode
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    
    // THIS IS THE NEW PART - Updates the theme-color meta tag
    const themeColorMeta = document.querySelector('meta[name="theme-color"]:not([media])');
    if (themeColorMeta) {
      themeColorMeta.content = isDarkMode ? '#1f2937' : '#ffffff';
    }
  }, [isDarkMode]);

  // Clear focus when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      // Check if click is outside of any log entry
      if (!e.target.closest('.log-entry')) {
        setFocusedLogId(null);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // Update timer based on check-in state
  useEffect(() => {
    let interval;
    
    if (isCheckedIn && checkInTime) {
      // Update immediately
      const initialDiff = Date.now() - checkInTime.getTime();
      setElapsedTime(formatElapsedTime(initialDiff));
      
      // Then update every second
      interval = setInterval(() => {
        const currentTime = new Date();
        const timeDiff = currentTime - checkInTime;
        setElapsedTime(formatElapsedTime(timeDiff));
      }, 1000);
    } else {
      setElapsedTime('00:00:00');
    }
    
    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [isCheckedIn, checkInTime]);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(formatTime(now));
      setCurrentDate(now.toLocaleDateString(undefined, { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const generateId = () => {
    // Generate a unique ID using timestamp + random string
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  };

  const handleCheckIn = () => {
    const now = new Date();
    setLogs(prev => [...prev, {
      id: generateId(),
      type: 'Check In',
      date: now.toLocaleDateString(),
      time: formatTime(now),
      timestamp: now.getTime(),
      lastEditTimestamp: now.getTime()
    }]);
  };

  const handleCheckOut = () => {
    if (!isCheckedIn || !checkInTime) {
      console.error('No active check-in found');
      return;
    }

    const now = new Date();
    const duration = calculateDuration(checkInTime.getTime(), now.getTime());
  
    setLogs(prev => [...prev, {
      id: generateId(),
      type: 'Check Out',
      date: now.toLocaleDateString(),
      time: formatTime(now),
      timestamp: now.getTime(),
      duration,
      lastEditTimestamp: now.getTime()
    }]);
  };

  const handleRemoveLog = (logToRemove) => {
    // Ask for confirmation
    if (!window.confirm('Are you sure you want to remove this entry? This may unpair check-in/check-out entries.')) {
      return;
    }
  
    // Add to deleted logs list
    setDeletedLogs(prev => {
      const newDeleted = [...prev, {
        id: logToRemove.id,
        deletedAt: Date.now()
      }];
      // Save to localStorage
      localStorage.setItem('timeTrackerDeletedLogs', JSON.stringify(newDeleted));
      return newDeleted;
    });
  
    // Update logs state
    setLogs(prevLogs => {
      const newLogs = prevLogs.filter(log => log.id !== logToRemove.id);
      
      // Recalculate durations for all check-outs
      const recalculatedLogs = newLogs.map((log, index) => {
        if (log.type === 'Check Out') {
          // Find the most recent check-in before this check-out
          const previousCheckIn = [...newLogs].slice(0, index)
            .reverse()
            .find(l => l.type === 'Check In');
          
          if (previousCheckIn) {
            const duration = calculateDuration(previousCheckIn.timestamp, log.timestamp);
            return { ...log, duration };
          } else {
            // No matching check-in, remove duration
            const { duration, ...logWithoutDuration } = log;
            return logWithoutDuration;
          }
        }
        return log;
      });
      
      return recalculatedLogs;
    });
  };

  const calculateDuration = (start, end) => {
    const diff = Math.floor((end - start) / 1000 / 60);
    const hours = Math.floor(diff / 60);
    const minutes = diff % 60;
    return `${hours}h ${minutes}m`;
  };

  const handleStartEdit = (log) => {
    setEditingLogId(log.id);
    setEditedTime(log.time); // Keep the full HH:MM:SS format
    setEditedDate(formatDateForInput(log.timestamp));
    setEditedType(log.type);
  };

  const handleTimeChange = (e) => {
    setEditedTime(e.target.value);
  };

  const handleDateChange = (e) => {
    setEditedDate(e.target.value);
  };

  const handleTypeChange = (e) => {
    setEditedType(e.target.value);
  };

  const handleSaveEdit = (logToEdit) => {
    // Validate time format (HH:mm:ss)
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/;
    if (!timeRegex.test(editedTime)) {
      alert('Please enter a valid time in 24-hour format (HH:mm:ss)');
      return;
    }
    
    // Validate date
    if (!editedDate) {
      alert('Please enter a valid date');
      return;
    }
  
    // Create the new date for the edited time
    const [year, month, day] = editedDate.split('-').map(Number);
    const [hours, minutes, seconds] = editedTime.split(':').map(Number);
    const newDate = new Date(year, month - 1, day, hours, minutes, seconds);
    const newTimestamp = newDate.getTime();
    const editTimestamp = Date.now();
  
    // Update logs
    const updatedLogs = logs.map(log => {
      if (log.id === logToEdit.id) {
        return {
          ...log,
          type: editedType || log.type,
          date: newDate.toLocaleDateString(),
          time: editedTime,
          timestamp: newTimestamp,
          lastEditTimestamp: editTimestamp
        };
      }
      return log;
    });
  
    // Sort logs by timestamp
    const sortedLogs = updatedLogs.sort((a, b) => a.timestamp - b.timestamp);
  
    // Update all logs with corrected durations
    const logsWithDurations = sortedLogs.map((log, index) => {
      if (log.type === 'Check Out') {
        const previousCheckIn = [...sortedLogs].slice(0, index)
          .reverse()
          .find(l => l.type === 'Check In');
  
        if (previousCheckIn) {
          const duration = calculateDuration(previousCheckIn.timestamp, log.timestamp);
          return { ...log, duration };
        } else {
          // Remove duration if no matching check-in
          const { duration, ...logWithoutDuration } = log;
          return logWithoutDuration;
        }
      } else {
        // Remove duration from check-ins if they have one
        const { duration, ...logWithoutDuration } = log;
        return logWithoutDuration;
      }
    });
  
    setLogs(logsWithDurations);
    setEditingLogId(null);
    setEditedTime('');
    setEditedDate('');
    setEditedType('');
  };

  const handleCancelEdit = () => {
    setEditingLogId(null);
    setEditedTime('');
    setEditedDate('');
    setEditedType('');
  };

  const toggleTheme = () => {
    setIsDarkMode(!isDarkMode);
  };

  const clearLogs = () => {
    if (window.confirm('Are you sure you want to clear all logs? This cannot be undone.')) {
      // Add all current logs to deleted list
      const allDeleted = logs.map(log => ({
        id: log.id,
        deletedAt: Date.now()
      }));
      
      setDeletedLogs(prev => {
        const newDeleted = [...prev, ...allDeleted];
        localStorage.setItem('timeTrackerDeletedLogs', JSON.stringify(newDeleted));
        return newDeleted;
      });
      
      setLogs([]);
      localStorage.removeItem('timeTrackerLogs');
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
              <Button
                variant="ghost"
                size="sm"
                onClick={clearLogs}
                className={cn(
                  "p-2 bg-transparent focus:outline-none focus:ring-0",
                  isDarkMode 
                    ? "text-gray-300 hover:text-red-400 hover:bg-gray-700 border-transparent" 
                    : "text-gray-600 hover:text-red-600 hover:bg-gray-100 border-transparent"
                )}
                title="Clear all logs"
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
                {isDarkMode ? (
                  <Sun className="w-4 h-4" />
                ) : (
                  <Moon className="w-4 h-4" />
                )}
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
                  logs={logs} 
                  onImportLogs={(importedLogs) => {
                    // Merge imported logs with existing logs
                    const mergedLogs = [...logs];
                    
                    importedLogs.forEach(importedLog => {
                      // Check if this log already exists (by id first, then by timestamp as fallback)
                      const exists = mergedLogs.some(log => 
                        (importedLog.id && log.id === importedLog.id) || 
                        (!importedLog.id && log.timestamp === importedLog.timestamp)
                      );
                      if (!exists) {
                        // Add ID if missing
                        const logWithId = importedLog.id ? importedLog : { ...importedLog, id: generateId() };
                        mergedLogs.push(logWithId);
                      }
                    });
                    
                    // Sort by timestamp
                    mergedLogs.sort((a, b) => a.timestamp - b.timestamp);
                    
                    // Recalculate durations
                    const logsWithDurations = mergedLogs.map((log, index) => {
                      if (log.type === 'Check Out') {
                        const previousCheckIn = [...mergedLogs].slice(0, index)
                          .reverse()
                          .find(l => l.type === 'Check In');
                        
                        if (previousCheckIn) {
                          const duration = calculateDuration(previousCheckIn.timestamp, log.timestamp);
                          return { ...log, duration };
                        } else {
                          const { duration, ...logWithoutDuration } = log;
                          return logWithoutDuration;
                        }
                      }
                      return log;
                    });
                    
                    // Update state
                    setLogs(logsWithDurations);
                  }}
                  onAutoSyncChange={handleAutoSyncChange}
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
            )}>{isCheckedIn ? elapsedTime : '00:00:00'}</div>
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
            )}>Recent Activity</h3>
            <div className="max-h-64 overflow-y-auto px-1 pr-3 py-2 relative">
              {logs.slice().reverse().map((log, index) => (
                <div 
                  key={log.id || `${log.timestamp}-${index}`} 
                  className={cn(
                    "group relative log-entry",
                    "p-2 rounded-lg text-sm mb-2 cursor-pointer",
                    isDarkMode
                      ? log.type === 'Check In' ? 'bg-green-900/20' : 'bg-red-900/20'
                      : log.type === 'Check In' ? 'bg-green-50' : 'bg-red-50'
                  )}
                  onClick={() => setFocusedLogId(log.id)}
                  onMouseEnter={() => setFocusedLogId(log.id)}
                  onMouseLeave={() => setFocusedLogId(null)}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      {editingLogId === log.id ? (
                        <select
                          value={editedType || log.type}
                          onChange={handleTypeChange}
                          className={cn(
                            "font-medium px-2 py-1 rounded border transition-colors",
                            editedType === 'Check In'
                              ? isDarkMode 
                                ? "bg-green-900/30 border-green-800 text-green-400" 
                                : "bg-green-50 border-green-200 text-green-600"
                              : isDarkMode 
                                ? "bg-red-900/30 border-red-800 text-red-400" 
                                : "bg-red-50 border-red-200 text-red-600"
                          )}
                        >
                          <option value="Check In">Check In</option>
                          <option value="Check Out">Check Out</option>
                        </select>
                      ) : (
                        <span className={cn(
                          "font-medium",
                          log.type === 'Check In' 
                            ? isDarkMode ? 'text-green-400' : 'text-green-600'
                            : isDarkMode ? 'text-red-400' : 'text-red-600'
                        )}>
                          {log.type}
                        </span>
                      )}
                      {editingLogId === log.timestamp ? (
                        <div className="mt-1">
                          <input
                            type="date"
                            value={editedDate}
                            onChange={handleDateChange}
                            className={cn(
                              "w-32 px-2 py-1 text-sm rounded border transition-colors",
                              isDarkMode 
                                ? "bg-gray-700 border-gray-600 text-gray-100 focus:border-gray-500" 
                                : "bg-white border-gray-300 text-gray-900 focus:border-gray-400",
                              "focus:outline-none focus:ring-0"
                            )}
                          />
                        </div>
                      ) : (
                        <div className={cn(
                          "text-xs",
                          isDarkMode ? "text-gray-400" : "text-gray-500"
                        )}>{log.date}</div>
                      )}
                    </div>
                    <div className="text-right">
                      {editingLogId === log.id ? (
                        <div className="space-y-2">
                          <input
                            type="time"
                            value={editedTime.substring(0, 5)}
                            onChange={(e) => {
                              // Convert HH:MM to HH:MM:00
                              const timeValue = e.target.value;
                              if (timeValue) {
                                setEditedTime(`${timeValue}:00`);
                              }
                            }}
                            step="60"
                            className={cn(
                              "w-28 px-2 py-1 font-mono text-sm rounded border transition-colors",
                              isDarkMode 
                                ? "bg-gray-700 border-gray-600 text-gray-100 focus:border-gray-500" 
                                : "bg-white border-gray-300 text-gray-900 focus:border-gray-400",
                              "[&::-webkit-calendar-picker-indicator]:filter",
                              "[&::-webkit-calendar-picker-indicator]:opacity-50",
                              isDarkMode && "[&::-webkit-calendar-picker-indicator]:invert",
                              "focus:outline-none focus:ring-0"
                            )}
                          />
                          <div className="flex gap-1 justify-end">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleSaveEdit(log)}
                              className={cn(
                                "h-7 px-3 text-xs font-medium transition-all",
                                isDarkMode
                                  ? "bg-green-900/30 text-green-400 hover:bg-green-900/50 border border-green-800"
                                  : "bg-green-50 text-green-700 hover:bg-green-100 border border-green-200"
                              )}
                            >
                              Save
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={handleCancelEdit}
                              className={cn(
                                "h-7 px-3 text-xs font-medium transition-all",
                                isDarkMode
                                  ? "bg-gray-700 text-gray-300 hover:bg-gray-600 border border-gray-600"
                                  : "bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-300"
                              )}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="relative">
                          <div className={cn(
                            "font-mono",
                            isDarkMode ? "text-gray-100" : "text-gray-900"
                          )}>{log.time}</div>
                          {focusedLogId === log.id && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleStartEdit(log)}
                              className={cn(
                                "absolute -top-1 -left-14 h-6 px-2 text-xs bg-transparent hover:bg-opacity-80 focus:outline-none focus:ring-0",
                                isDarkMode
                                  ? "text-blue-400 hover:text-blue-300 hover:bg-gray-700" 
                                  : "text-blue-600 hover:text-blue-700 hover:bg-gray-100/60"
                              )}
                            >
                              Edit
                            </Button>
                          )}
                        </div>
                      )}
                      {log.duration && !editingLogId && (
                        <div className={cn(
                          "text-xs",
                          isDarkMode ? "text-gray-400" : "text-gray-500"
                        )}>{log.duration}</div>
                      )}
                    </div>
                  </div>

                  {/* Remove button - now visible for all entries */}
                  {focusedLogId === log.id && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveLog(log)}
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
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
      <CreditCardBadge />
    </div>
  );
};

export default TimeTracker;
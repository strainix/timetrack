import React, { useState, useEffect } from 'react';
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

const TimeTracker = () => {
  const [currentTime, setCurrentTime] = useState('');
  const [currentDate, setCurrentDate] = useState('');
  const [logs, setLogs] = useState([]);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [editingLogId, setEditingLogId] = useState(null);
  const [editedTime, setEditedTime] = useState('');
  const [editedDate, setEditedDate] = useState('');
  const [editedType, setEditedType] = useState('');
  const [elapsedTime, setElapsedTime] = useState('00:00:00');
  const [focusedLogId, setFocusedLogId] = useState(null);

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
      setLogs(JSON.parse(savedLogs));
    }
  
    // Load theme preference
    const savedTheme = localStorage.getItem('timeTrackerTheme');
    if (savedTheme) {
      setIsDarkMode(JSON.parse(savedTheme));
    }
  }, []);

  useEffect(() => {
    // Save logs
    localStorage.setItem('timeTrackerLogs', JSON.stringify(logs));
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

  const handleCheckIn = () => {
    const now = new Date();
    setLogs(prev => [...prev, {
      type: 'Check In',
      date: now.toLocaleDateString(),
      time: formatTime(now),
      timestamp: now.getTime()
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
      type: 'Check Out',
      date: now.toLocaleDateString(),
      time: formatTime(now),
      timestamp: now.getTime(),
      duration
    }]);
  };

  const handleRemoveLog = (logToRemove) => {
    // Ask for confirmation
    if (!window.confirm('Are you sure you want to remove this entry? This may unpair check-in/check-out entries.')) {
      return;
    }
  
    // Update logs state
    setLogs(prevLogs => {
      const newLogs = prevLogs.filter(log => log.timestamp !== logToRemove.timestamp);
      
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
    setEditingLogId(log.timestamp);
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
  
    // Update logs
    const updatedLogs = logs.map(log => {
      if (log.timestamp === logToEdit.timestamp) {
        return {
          ...log,
          type: editedType || log.type,
          date: newDate.toLocaleDateString(),
          time: editedTime,
          timestamp: newTimestamp
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
                      // Check if this log already exists (by timestamp)
                      const exists = mergedLogs.some(log => log.timestamp === importedLog.timestamp);
                      if (!exists) {
                        mergedLogs.push(importedLog);
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
                  key={log.timestamp} 
                  className={cn(
                    "group relative log-entry",
                    "p-2 rounded-lg text-sm mb-2 cursor-pointer",
                    isDarkMode
                      ? log.type === 'Check In' ? 'bg-green-900/20' : 'bg-red-900/20'
                      : log.type === 'Check In' ? 'bg-green-50' : 'bg-red-50'
                  )}
                  onClick={() => setFocusedLogId(log.timestamp)}
                  onMouseEnter={() => setFocusedLogId(log.timestamp)}
                  onMouseLeave={() => setFocusedLogId(null)}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      {editingLogId === log.timestamp ? (
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
                      {editingLogId === log.timestamp ? (
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
                          {focusedLogId === log.timestamp && (
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
                  {focusedLogId === log.timestamp && (
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
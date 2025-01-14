import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Clock, Download, Trash2, Moon, Sun } from 'lucide-react';
import * as XLSX from 'xlsx';
import { cn } from '../lib/utils';

const TimeTracker = () => {
  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [currentTime, setCurrentTime] = useState('');
  const [currentDate, setCurrentDate] = useState('');
  const [checkInTime, setCheckInTime] = useState(null);
  const [logs, setLogs] = useState([]);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [editingLogId, setEditingLogId] = useState(null);
  const [editedTime, setEditedTime] = useState('');
  const [elapsedTime, setElapsedTime] = useState('00:00:00');
  const [timerInterval, setTimerInterval] = useState(null);

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

  useEffect(() => {
    // Load saved logs
    const savedLogs = localStorage.getItem('timeTrackerLogs');
    if (savedLogs) {
      setLogs(JSON.parse(savedLogs));
    }
    
    // Load check-in state
    const savedCheckInState = localStorage.getItem('timeTrackerCheckIn');
    if (savedCheckInState) {
      const { isCheckedIn: savedIsCheckedIn, checkInTime: savedCheckInTime } = JSON.parse(savedCheckInState);
      setIsCheckedIn(savedIsCheckedIn);
      
      // If there was an active check-in, restore the timer
      if (savedIsCheckedIn && savedCheckInTime) {
        const checkInDate = new Date(savedCheckInTime);
        setCheckInTime(checkInDate);
        
        // Start the timer with the saved check-in time
        const interval = setInterval(() => {
          const currentTime = new Date();
          const timeDiff = currentTime - checkInDate;
          setElapsedTime(formatElapsedTime(timeDiff));
        }, 1000);
        setTimerInterval(interval);
        
        // Calculate and set initial elapsed time
        const initialTimeDiff = new Date() - checkInDate;
        setElapsedTime(formatElapsedTime(initialTimeDiff));
      }
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
    // Save check-in state
    localStorage.setItem('timeTrackerCheckIn', JSON.stringify({
      isCheckedIn,
      checkInTime: checkInTime ? checkInTime.toISOString() : null
    }));
  }, [logs, isCheckedIn, checkInTime]);

  // Save theme preference
  useEffect(() => {
    localStorage.setItem('timeTrackerTheme', JSON.stringify(isDarkMode));
    // Update document class for dark mode
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  useEffect(() => {
    return () => {
      if (timerInterval) {
        clearInterval(timerInterval);
      }
    };
  }, [timerInterval]);

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
    setCheckInTime(now);
    setIsCheckedIn(true);
    setLogs(prev => [...prev, {
      type: 'Check In',
      date: now.toLocaleDateString(),
      time: formatTime(now),
      timestamp: now.getTime()
    }]);
    
    // Store check-in state in localStorage
    localStorage.setItem('timeTrackerCheckIn', JSON.stringify({
      isCheckedIn: true,
      checkInTime: now.toISOString()
    }));
    
    // Start the timer
    const interval = setInterval(() => {
      const currentTime = new Date();
      const timeDiff = currentTime - now;
      setElapsedTime(formatElapsedTime(timeDiff));
    }, 1000);
    setTimerInterval(interval);
  };

  const handleCheckOut = () => {
    const now = new Date();
    setIsCheckedIn(false);
    setLogs(prev => [...prev, {
      type: 'Check Out',
      date: now.toLocaleDateString(),
      time: formatTime(now),
      timestamp: now.getTime(),
      duration: checkInTime ? calculateDuration(checkInTime, now) : 'N/A'
    }]);
    setCheckInTime(null);
    
    // Clear the timer
    if (timerInterval) {
      clearInterval(timerInterval);
      setTimerInterval(null);
    }
    setElapsedTime('00:00:00');
    
    // Clear the check-in state from localStorage
    localStorage.setItem('timeTrackerCheckIn', JSON.stringify({
      isCheckedIn: false,
      checkInTime: null
    }));
  };

  const calculateDuration = (start, end) => {
    const diff = Math.floor((end - start) / 1000 / 60);
    const hours = Math.floor(diff / 60);
    const minutes = diff % 60;
    return `${hours}h ${minutes}m`;
  };

  const handleStartEdit = (log) => {
    setEditingLogId(log.timestamp);
    setEditedTime(log.time);
  };

  const handleTimeChange = (e) => {
    setEditedTime(e.target.value);
  };

  const handleSaveEdit = (logToEdit) => {
    // Validate time format (HH:mm:ss)
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/;
    if (!timeRegex.test(editedTime)) {
      alert('Please enter a valid time in 24-hour format (HH:mm:ss)');
      return;
    }

    const updatedLogs = logs.map(log => {
      if (log.timestamp === logToEdit.timestamp) {
        // Create a new Date object from the original date and new time
        const [hours, minutes, seconds] = editedTime.split(':').map(Number);
        const newDate = new Date(log.timestamp);
        newDate.setHours(hours, minutes, seconds);

        // Update the log entry
        return {
          ...log,
          time: editedTime,
          timestamp: newDate.getTime()
        };
      }
      return log;
    });

    // Sort logs by timestamp to maintain chronological order
    const sortedLogs = updatedLogs.sort((a, b) => a.timestamp - b.timestamp);

    // Recalculate durations for all check-out entries
    const logsWithUpdatedDurations = sortedLogs.map((log, index) => {
      if (log.type === 'Check Out' && index > 0) {
        // Find the last check-in before this check-out
        for (let i = index - 1; i >= 0; i--) {
          if (sortedLogs[i].type === 'Check In') {
            return {
              ...log,
              duration: calculateDuration(
                sortedLogs[i].timestamp,
                log.timestamp
              )
            };
          }
        }
      }
      return log;
    });

    setLogs(logsWithUpdatedDurations);
    setEditingLogId(null);
    setEditedTime('');
  };

  const handleCancelEdit = () => {
    setEditingLogId(null);
    setEditedTime('');
  };

  const toggleTheme = () => {
    setIsDarkMode(!isDarkMode);
  };

  const exportToExcel = () => {
    // First, group logs by date
    const groupedByDate = logs.reduce((acc, log) => {
      if (!acc[log.date]) {
        acc[log.date] = [];
      }
      acc[log.date].push(log);
      return acc;
    }, {});

    // Process each day's logs to create pairs of check-ins and check-outs
    const processedData = Object.entries(groupedByDate).map(([date, dayLogs]) => {
      // Sort logs by timestamp to ensure correct order
      const sortedLogs = dayLogs.sort((a, b) => a.timestamp - b.timestamp);
      
      const pairs = [];
      let currentPair = {};
      
      sortedLogs.forEach((log) => {
        if (log.type === 'Check In') {
          // Start new pair
          currentPair = { date, checkIn: log.time };
          pairs.push(currentPair);
        } else if (log.type === 'Check Out') {
          // Find the last incomplete pair and complete it
          const lastIncompletePair = [...pairs].reverse().find(pair => !pair.checkOut);
          if (lastIncompletePair) {
            lastIncompletePair.checkOut = log.time;
            lastIncompletePair.duration = log.duration;
          }
        }
      });
      
      return pairs;
    }).flat();

    // Find the maximum number of pairs in a day to determine column count
    const maxPairsPerDay = Object.values(groupedByDate).reduce((max, dayLogs) => {
      const pairsCount = dayLogs.filter(log => log.type === 'Check In').length;
      return Math.max(max, pairsCount);
    }, 0);

    // Create headers based on the maximum number of pairs
    const headers = ['Date'];
    for (let i = 1; i <= maxPairsPerDay; i++) {
      headers.push(`Check In ${i}`, `Check Out ${i}`);
    }
    headers.push('Total Duration');

    // Create the worksheet data
    const worksheetData = [headers];
    
    // Group processed data by date for the final format
    const finalData = processedData.reduce((acc, pair) => {
      if (!acc[pair.date]) {
        acc[pair.date] = { date: pair.date, pairs: [] };
      }
      acc[pair.date].pairs.push(pair);
      return acc;
    }, {});

    // Helper function to calculate total duration in minutes
    const calculateTotalDuration = (pairs) => {
      const totalMinutes = pairs.reduce((total, pair) => {
        if (pair.duration) {
          const [hours, minutes] = pair.duration.split('h ').map(part => 
            parseInt(part.replace('m', '').trim())
          );
          return total + (hours * 60 + minutes);
        }
        return total;
      }, 0);

      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      return `${hours}h ${minutes}m`;
    };

    // Create rows with all columns
    Object.values(finalData).forEach(({ date, pairs }) => {
      const row = [date];
      for (let i = 0; i < maxPairsPerDay; i++) {
        const pair = pairs[i] || {};
        row.push(pair.checkIn || '', pair.checkOut || '');
      }
      // Add total duration at the end
      row.push(calculateTotalDuration(pairs));
      worksheetData.push(row);
    });

    const ws = XLSX.utils.aoa_to_sheet(worksheetData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Time Logs');
    const fileName = `time_logs_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };


  const clearLogs = () => {
    if (window.confirm('Are you sure you want to clear all logs? This cannot be undone.')) {
      setLogs([]);
      setIsCheckedIn(false);
      setCheckInTime(null);
      localStorage.removeItem('timeTrackerLogs');
      localStorage.removeItem('timeTrackerCheckIn');
    }
  };

  return (
    <div className={cn(
      "min-h-screen w-full p-2 transition-colors duration-200",
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
                onClick={toggleTheme}
                className={cn(
                  "p-2 bg-transparent",
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
              <Button 
                variant="outline" 
                size="sm"
                onClick={exportToExcel}
                className={cn(
                  "flex items-center gap-1 text-xs",
                  isDarkMode 
                    ? "border-gray-600 text-gray-300 hover:text-gray-100 hover:bg-gray-700 bg-transparent" 
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-100 bg-transparent"
                )}
              >
                <Download className="w-3 h-3" />
                Export
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={clearLogs}
                className={cn(
                  "flex items-center gap-1 text-xs",
                  isDarkMode 
                    ? "border-gray-600 text-red-400 hover:text-red-300 hover:bg-gray-700 bg-transparent" 
                    : "text-red-500 hover:text-red-600 hover:bg-gray-100 bg-transparent"
                )}
              >
                <Trash2 className="w-3 h-3" />
                Clear
              </Button>
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
                "w-48 h-12 transition-all duration-200 text-lg",
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
          
          <div className="mt-4">
            <h3 className={cn(
              "text-sm font-medium mb-3",
              isDarkMode ? "text-gray-300" : "text-gray-500"
            )}>Recent Activity</h3>
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {logs.slice().reverse().map((log, index) => (
                <div 
                  key={index} 
                  className={cn(
                    "group",
                    "p-2 rounded-lg text-sm",
                    isDarkMode
                      ? log.type === 'Check In' ? 'bg-green-900/20' : 'bg-red-900/20'
                      : log.type === 'Check In' ? 'bg-green-50' : 'bg-red-50'
                  )}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <span className={cn(
                        "font-medium",
                        log.type === 'Check In' 
                          ? isDarkMode ? 'text-green-400' : 'text-green-600'
                          : isDarkMode ? 'text-red-400' : 'text-red-600'
                      )}>
                        {log.type}
                      </span>
                      <div className={cn(
                        "text-xs",
                        isDarkMode ? "text-gray-400" : "text-gray-500"
                      )}>{log.date}</div>
                    </div>
                    <div className="text-right">
                      {editingLogId === log.timestamp ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={editedTime}
                            onChange={handleTimeChange}
                            className={cn(
                              "w-24 px-1 py-0.5 font-mono text-sm rounded border",
                              isDarkMode 
                                ? "bg-gray-700 border-gray-600 text-gray-100" 
                                : "bg-white border-gray-300 text-gray-900"
                            )}
                            placeholder="HH:mm:ss"
                          />
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleSaveEdit(log)}
                              className={cn(
                                "h-6 px-2 text-xs bg-transparent hover:bg-opacity-80",
                                isDarkMode
                                  ? "text-green-400 hover:text-green-300 hover:bg-gray-700"
                                  : "text-green-600 hover:text-green-700 hover:bg-gray-100/60"
                              )}
                            >
                              Save
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={handleCancelEdit}
                              className={cn(
                                "h-6 px-2 text-xs bg-transparent hover:bg-opacity-80",
                                isDarkMode
                                  ? "text-gray-400 hover:text-gray-300 hover:bg-gray-700"
                                  : "text-gray-600 hover:text-gray-700 hover:bg-gray-100/60"
                              )}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleStartEdit(log)}
                            className={cn(
                              "h-6 px-2 text-xs opacity-0 group-hover:opacity-100 transition-opacity bg-transparent hover:bg-opacity-80",
                              isDarkMode
                                ? "text-blue-400 hover:text-blue-300 hover:bg-gray-700" 
                                : "text-blue-600 hover:text-blue-700 hover:bg-gray-100/60"
                            )}
                          >
                            Edit
                          </Button>
                          <div className={cn(
                            "font-mono",
                            isDarkMode ? "text-gray-100" : "text-gray-900"
                          )}>{log.time}</div>
                        </div>
                      )}
                      {log.duration && (
                        <div className={cn(
                          "text-xs",
                          isDarkMode ? "text-gray-400" : "text-gray-500"
                        )}>{log.duration}</div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default TimeTracker;
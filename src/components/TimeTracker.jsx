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

  // Helper function for consistent time formatting
  const formatTime = (date) => {
    return date.toLocaleTimeString('en-GB', { 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit',
      hour12: false 
    });
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
      setCheckInTime(savedCheckInTime ? new Date(savedCheckInTime) : null);
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
  };

  const calculateDuration = (start, end) => {
    const diff = Math.floor((end - start) / 1000 / 60);
    const hours = Math.floor(diff / 60);
    const minutes = diff % 60;
    return `${hours}h ${minutes}m`;
  };

  const toggleTheme = () => {
    setIsDarkMode(!isDarkMode);
  };

  // Rest of the exportToExcel and clearLogs functions remain the same
  const exportToExcel = () => {
    // ... (previous exportToExcel code remains unchanged)
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
                "text-lg",
                isDarkMode ? "text-gray-100" : "text-gray-900"
              )}>Time Tracker</span>
            </div>
            <div className="flex gap-2 items-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleTheme}
                className={cn(
                  "p-2",
                  isDarkMode ? "text-gray-100 hover:text-white hover:bg-gray-700" : "text-gray-600 hover:text-gray-900"
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
                  isDarkMode ? "border-gray-600 text-gray-100" : ""
                )}
              >
                <Download className="w-3 h-3" />
                Export
              </Button>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={clearLogs}
                className="flex items-center gap-1 text-xs text-red-500 hover:text-red-600"
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
            )}>{currentTime}</div>
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
                      <div className={cn(
                        "font-mono",
                        isDarkMode ? "text-gray-100" : "text-gray-900"
                      )}>{log.time}</div>
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
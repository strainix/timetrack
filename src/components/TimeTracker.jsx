import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Clock, Download, Trash2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { cn } from '../lib/utils';

const TimeTracker = () => {
  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [currentTime, setCurrentTime] = useState('');
  const [currentDate, setCurrentDate] = useState('');
  const [checkInTime, setCheckInTime] = useState(null);
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    const savedLogs = localStorage.getItem('timeTrackerLogs');
    if (savedLogs) {
      setLogs(JSON.parse(savedLogs));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('timeTrackerLogs', JSON.stringify(logs));
  }, [logs]);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString());
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
      time: now.toLocaleTimeString(),
      timestamp: now.getTime()
    }]);
  };

  const handleCheckOut = () => {
    const now = new Date();
    setIsCheckedIn(false);
    setLogs(prev => [...prev, {
      type: 'Check Out',
      date: now.toLocaleDateString(),
      time: now.toLocaleTimeString(),
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

  const exportToExcel = () => {
    const groupedLogs = logs.reduce((acc, log) => {
      if (!acc[log.date]) {
        acc[log.date] = {
          date: log.date,
          checkIn: '',
          checkOut: '',
          duration: ''
        };
      }
      
      if (log.type === 'Check In') {
        acc[log.date].checkIn = log.time;
      } else {
        acc[log.date].checkOut = log.time;
        acc[log.date].duration = log.duration;
      }
      
      return acc;
    }, {});

    const worksheetData = [
      ['Date', 'Check In', 'Check Out', 'Duration'],
      ...Object.values(groupedLogs).map(row => [
        row.date,
        row.checkIn,
        row.checkOut,
        row.duration
      ])
    ];

    const ws = XLSX.utils.aoa_to_sheet(worksheetData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Time Logs');
    const fileName = `time_logs_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  const clearLogs = () => {
    if (window.confirm('Are you sure you want to clear all logs? This cannot be undone.')) {
      setLogs([]);
      localStorage.removeItem('timeTrackerLogs');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 px-2 py-4 sm:px-4">
      <Card className="w-full shadow-lg">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-500" />
              <span className="text-lg text-gray-900">Time Tracker</span>
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={exportToExcel}
                className="flex items-center gap-1 text-xs"
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
          <div className="text-center py-8 border-y">
            <div className="text-sm text-gray-500 mb-1">{currentDate}</div>
            <div className="text-4xl font-bold mb-6 font-mono text-gray-900">{currentTime}</div>
            <Button 
              className={cn(
                "w-48 h-12 transition-all duration-200 text-lg",
                isCheckedIn 
                  ? "bg-red-500 hover:bg-red-600 shadow-red-200" 
                  : "bg-green-500 hover:bg-green-600 shadow-green-200",
                "shadow-lg"
              )}
              onClick={isCheckedIn ? handleCheckOut : handleCheckIn}
            >
              {isCheckedIn ? 'Check Out' : 'Check In'}
            </Button>
          </div>
          
          <div className="mt-4">
            <h3 className="text-sm font-medium text-gray-500 mb-3">Recent Activity</h3>
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {logs.slice().reverse().map((log, index) => (
                <div 
                  key={index} 
                  className={cn(
                    "p-2 rounded-lg text-sm",
                    log.type === 'Check In' ? 'bg-green-50' : 'bg-red-50'
                  )}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <span className={cn(
                        "font-medium",
                        log.type === 'Check In' ? 'text-green-600' : 'text-red-600'
                      )}>
                        {log.type}
                      </span>
                      <div className="text-gray-500 text-xs">{log.date}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono">{log.time}</div>
                      {log.duration && (
                        <div className="text-xs text-gray-500">{log.duration}</div>
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
import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Clock, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { cn } from '../lib/utils';

const TimeTracker = () => {
  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [currentTime, setCurrentTime] = useState('');
  const [checkInTime, setCheckInTime] = useState(null);
  const [logs, setLogs] = useState([]);

  // Load logs from localStorage on component mount
  useEffect(() => {
    const savedLogs = localStorage.getItem('timeTrackerLogs');
    if (savedLogs) {
      setLogs(JSON.parse(savedLogs));
    }
  }, []);

  // Save logs to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('timeTrackerLogs', JSON.stringify(logs));
  }, [logs]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString());
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
    const diff = Math.floor((end - start) / 1000 / 60); // minutes
    const hours = Math.floor(diff / 60);
    const minutes = diff % 60;
    return `${hours}h ${minutes}m`;
  };

  const exportToExcel = () => {
    // Group logs by date
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

    // Convert to array format for Excel
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

    // Generate file name with current date
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
    <div className="p-4">
      <Card className="max-w-md mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-6 h-6" />
              Time Tracker
            </div>
            <Button 
              variant="outline" 
              size="sm"
              onClick={exportToExcel}
              className="flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Export
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center mb-6">
            <div className="text-2xl font-bold mb-2">{currentTime}</div>
            <Button 
              className={cn(
                "w-full",
                isCheckedIn ? "bg-red-500 hover:bg-red-600" : "bg-green-500 hover:bg-green-600"
              )}
              onClick={isCheckedIn ? handleCheckOut : handleCheckIn}
            >
              {isCheckedIn ? 'Check Out' : 'Check In'}
            </Button>
          </div>
          
          <div className="mt-6">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-semibold">Recent Logs</h3>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={clearLogs}
                className="text-red-500 hover:text-red-600"
              >
                Clear All
              </Button>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {logs.slice().reverse().map((log, index) => (
                <div key={index} className="text-sm border-b pb-2">
                  <div className="font-medium">{log.date}</div>
                  <div>
                    {log.type}: {log.time}
                    {log.duration && <span className="ml-2 text-gray-600">({log.duration})</span>}
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
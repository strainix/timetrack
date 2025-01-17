import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Download, Share2, Upload, RefreshCw } from 'lucide-react';
import * as XLSX from 'xlsx';

const JSONBIN_API_KEY = '$2a$10$nN4n9NgHVvxs2YOy7CsNN.c25VKe.27fHXH9od6O3XUwN9pwUFRoW'; // Replace with your API key
const JSONBIN_API_URL = 'https://api.jsonbin.io/v3/b';
const STORAGE_KEY = 'timeTrackerShareCode';

const ExportDialog = ({ logs, onClose }) => {
  const [shareCode, setShareCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasSavedCode, setHasSavedCode] = useState(false);

  useEffect(() => {
    // Load saved share code from localStorage
    const savedCode = localStorage.getItem(STORAGE_KEY);
    if (savedCode) {
      setShareCode(savedCode);
      setHasSavedCode(true);
    }
  }, []);

  const generateExcelFile = (logsData) => {
    // Existing Excel generation logic
    const groupedByDate = logsData.reduce((acc, log) => {
      if (!acc[log.date]) {
        acc[log.date] = [];
      }
      acc[log.date].push(log);
      return acc;
    }, {});

    // Process each day's logs to create pairs
    const processedData = Object.entries(groupedByDate).map(([date, dayLogs]) => {
      const sortedLogs = dayLogs.sort((a, b) => a.timestamp - b.timestamp);
      const pairs = [];
      let currentPair = {};
      
      sortedLogs.forEach((log) => {
        if (log.type === 'Check In') {
          currentPair = { date, checkIn: log.time };
          pairs.push(currentPair);
        } else if (log.type === 'Check Out') {
          const lastIncompletePair = [...pairs].reverse().find(pair => !pair.checkOut);
          if (lastIncompletePair) {
            lastIncompletePair.checkOut = log.time;
            lastIncompletePair.duration = log.duration;
          }
        }
      });
      return pairs;
    }).flat();

    const maxPairsPerDay = Math.max(...Object.values(groupedByDate)
      .map(dayLogs => dayLogs.filter(log => log.type === 'Check In').length));

    const headers = ['Date'];
    for (let i = 1; i <= maxPairsPerDay; i++) {
      headers.push(`Check In ${i}`, `Check Out ${i}`);
    }
    headers.push('Total Duration');

    const worksheetData = [headers];
    
    const finalData = processedData.reduce((acc, pair) => {
      if (!acc[pair.date]) {
        acc[pair.date] = { date: pair.date, pairs: [] };
      }
      acc[pair.date].pairs.push(pair);
      return acc;
    }, {});

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

    Object.values(finalData).forEach(({ date, pairs }) => {
      const row = [date];
      for (let i = 0; i < maxPairsPerDay; i++) {
        const pair = pairs[i] || {};
        row.push(pair.checkIn || '', pair.checkOut || '');
      }
      row.push(calculateTotalDuration(pairs));
      worksheetData.push(row);
    });

    const ws = XLSX.utils.aoa_to_sheet(worksheetData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Time Logs');
    const fileName = `time_logs_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  const handleDownload = () => {
    generateExcelFile(logs);
  };

  const generateOrSyncCode = async () => {
    setIsLoading(true);
    setError('');
    try {
      // If we already have a code, update the existing bin
      if (hasSavedCode) {
        const response = await fetch(`${JSONBIN_API_URL}/${shareCode}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'X-Master-Key': JSONBIN_API_KEY,
          },
          body: JSON.stringify({ logs }),
        });
        
        if (!response.ok) throw new Error('Failed to sync data');
      } else {
        // Create new bin
        const response = await fetch(JSONBIN_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Master-Key': JSONBIN_API_KEY,
            'X-Bin-Private': false,
          },
          body: JSON.stringify({ logs }),
        });
        
        if (!response.ok) throw new Error('Failed to generate share code');
        
        const data = await response.json();
        const binId = data.metadata.id;
        setShareCode(binId);
        setHasSavedCode(true);
        localStorage.setItem(STORAGE_KEY, binId);
      }
    } catch (err) {
      setError(hasSavedCode ? 'Failed to sync data. Please try again.' : 'Failed to generate share code. Please try again.');
      console.error('Error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSharedData = async () => {
    if (!shareCode) {
      setError('Please enter a share code');
      return;
    }

    setIsLoading(true);
    setError('');
    try {
      const response = await fetch(`${JSONBIN_API_URL}/${shareCode}/latest`, {
        headers: {
          'X-Master-Key': JSONBIN_API_KEY,
        },
      });
      
      if (!response.ok) throw new Error('Failed to fetch shared data');
      
      const data = await response.json();
      generateExcelFile(data.record.logs);
      
      // Save the code if it's not already saved
      if (!hasSavedCode) {
        setHasSavedCode(true);
        localStorage.setItem(STORAGE_KEY, shareCode);
      }
    } catch (err) {
      setError('Failed to fetch shared data. Please check the code and try again.');
      console.error('Error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <DialogContent className="sm:max-w-md w-[95%] sm:w-full max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg border dark:border-gray-700 relative">
  <button
    onClick={onClose}
    className="absolute right-4 top-4 font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
  >
    ×
  </button>
      <DialogHeader>
        <DialogTitle className="text-gray-900 dark:text-gray-100">Export Time Tracking Data</DialogTitle>
      </DialogHeader>
      <div className="flex flex-col gap-6">
        <Button
          onClick={handleDownload}
          className="flex items-center gap-2 w-full bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700"
          variant="outline"
        >
          <Download className="w-4 h-4" />
          Download Excel File
        </Button>
        
        <div className="space-y-2">
          <div className="flex gap-2">
            <Input
              placeholder="Share code"
              value={shareCode}
              onChange={(e) => setShareCode(e.target.value)}
              className="flex-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700"
            />
            <Button
              onClick={generateOrSyncCode}
              variant="outline"
              className="flex items-center gap-2"
              disabled={isLoading}
            >
              {hasSavedCode ? (
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              ) : (
                <Share2 className="w-4 h-4" />
              )}
              {hasSavedCode ? 'Sync' : 'Generate'}
            </Button>
          </div>
          <Button
            onClick={fetchSharedData}
            variant="outline"
            className="w-full flex items-center gap-2"
            disabled={isLoading || !shareCode}
          >
            <Upload className="w-4 h-4" />
            Fetch & Download
          </Button>
        </div>
        
        {error && (
          <p className="text-sm text-red-500">{error}</p>
        )}
      </div>
    </DialogContent>
  );
};

export default ExportDialog;
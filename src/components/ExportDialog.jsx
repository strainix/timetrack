import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Download, Share2, Upload } from 'lucide-react';
import * as XLSX from 'xlsx';

const JSONBIN_API_KEY = '$2a$10$nN4n9NgHVvxs2YOy7CsNN.c25VKe.27fHXH9od6O3XUwN9pwUFRoW'; // Replace with your API key
const JSONBIN_API_URL = 'https://api.jsonbin.io/v3/b';

const ExportDialog = ({ logs, onClose }) => {
  const [shareCode, setShareCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

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

  const generateShareCode = async () => {
    setIsLoading(true);
    setError('');
    try {
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
    } catch (err) {
      setError('Failed to generate share code. Please try again.');
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
    } catch (err) {
      setError('Failed to fetch shared data. Please check the code and try again.');
      console.error('Error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Export Time Tracking Data</DialogTitle>
      </DialogHeader>
      <div className="flex flex-col gap-6">
        <Button
          onClick={handleDownload}
          className="flex items-center gap-2"
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
              className="flex-1"
            />
            <Button
              onClick={generateShareCode}
              variant="outline"
              className="flex items-center gap-2"
              disabled={isLoading}
            >
              <Share2 className="w-4 h-4" />
              Generate
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
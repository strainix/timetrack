import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { ArrowDownToLine, Share2, Download, Upload, ArrowRight, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import * as XLSX from 'xlsx';

const WORKER_API_URL = 'https://timetrack-api.nitenet.workers.dev'; // Replace with your worker URL
const STORAGE_KEY = 'timeTrackerShareCode';
const IMPORT_CODE_KEY = 'timeTrackerImportCode';
const AUTO_SYNC_KEY = 'timeTrackerAutoSync';

const ExportDialog = ({ logs, onClose, onImportLogs, onAutoSyncChange }) => {
  const [shareCode, setShareCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasSavedCode, setHasSavedCode] = useState(false);
  const [activeTab, setActiveTab] = useState('local'); // 'local', 'share', 'import'
  const [importCode, setImportCode] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [autoSync, setAutoSync] = useState(false);
  const [syncStatus, setSyncStatus] = useState('idle'); // 'idle', 'syncing', 'error'

  useEffect(() => {
    // Load saved share code from localStorage
    const savedCode = localStorage.getItem(STORAGE_KEY);
    if (savedCode) {
      setShareCode(savedCode);
      setHasSavedCode(true);
      setActiveTab('share'); // Switch to share tab if user has a code
    }
    
    // Load saved import code
    const savedImportCode = localStorage.getItem(IMPORT_CODE_KEY);
    if (savedImportCode) {
      setImportCode(savedImportCode);
    }
    
    // Load auto-sync preference
    const savedAutoSync = localStorage.getItem(AUTO_SYNC_KEY);
    if (savedAutoSync) {
      const autoSyncEnabled = JSON.parse(savedAutoSync);
      setAutoSync(autoSyncEnabled);
      if (onAutoSyncChange) {
        onAutoSyncChange(autoSyncEnabled);
      }
    }
  }, []);

  const handleToggleAutoSync = () => {
    const newAutoSyncState = !autoSync;
    setAutoSync(newAutoSyncState);
    localStorage.setItem(AUTO_SYNC_KEY, JSON.stringify(newAutoSyncState));
    
    if (onAutoSyncChange) {
      onAutoSyncChange(newAutoSyncState);
    }
    
    if (newAutoSyncState) {
      setSuccessMessage('Auto-sync enabled! Your data will sync in real-time.');
    } else {
      setSuccessMessage('Auto-sync disabled.');
    }
    
    // Clear message after 3 seconds
    setTimeout(() => setSuccessMessage(''), 3000);
  };

  // Update sync status when passed from parent
  useEffect(() => {
    if (onAutoSyncChange) {
      // Get sync status from parent if available
      const updateSyncStatus = (status) => setSyncStatus(status);
      window.updateSyncStatus = updateSyncStatus;
      return () => {
        delete window.updateSyncStatus;
      };
    }
  }, []);

const generateExcelFile = (logsData) => {
    // Helper function to normalize any date format to ISO (YYYY-MM-DD)
    const normalizeDateToISO = (dateStr) => {
      if (!dateStr) return '';
      
      // Already ISO format
      if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
        return dateStr;
      }
      
      // US format (M/D/YYYY or MM/DD/YYYY)
      if (dateStr.includes('/') && !dateStr.includes('.')) {
        const parts = dateStr.split('/');
        if (parts.length === 3) {
          const [month, day, year] = parts;
          return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }
      }
      
      // European format with dots (DD.MM.YYYY)
      if (dateStr.includes('.')) {
        const parts = dateStr.split('.');
        if (parts.length === 3) {
          const [day, month, year] = parts;
          return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }
      }
      
      return dateStr;
    };

    // Helper function to format date from various formats to DD/MM/YYYY
    const formatDateForExcel = (dateStr) => {
      if (!dateStr) return '';
      
      // Normalize to ISO first
      const isoDate = normalizeDateToISO(dateStr);
      
      // Then format to DD/MM/YYYY
      if (isoDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const [year, month, day] = isoDate.split('-');
        return `${day}/${month}/${year}`;
      }
      
      // Fallback
      return dateStr;
    };

    // Normalize dates for grouping
    const normalizedLogs = logsData.map(log => ({
      ...log,
      normalizedDate: normalizeDateToISO(log.date)
    }));

    // Group by normalized date
    const groupedByDate = normalizedLogs.reduce((acc, log) => {
      if (!acc[log.normalizedDate]) {
        acc[log.normalizedDate] = [];
      }
      acc[log.normalizedDate].push(log);
      return acc;
    }, {});

    // Process each day's logs to create pairs
    const processedData = Object.entries(groupedByDate).map(([normalizedDate, dayLogs]) => {
      const sortedLogs = dayLogs.sort((a, b) => a.timestamp - b.timestamp);
      const pairs = [];
      let currentPair = {};
      
      sortedLogs.forEach((log) => {
        if (log.type === 'Check In') {
          // Use the original date for display, but format it consistently
          currentPair = { date: formatDateForExcel(log.date), checkIn: log.time };
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

  const generateNewCode = async () => {
    setIsLoading(true);
    setError('');
    setSuccessMessage('');
    try {
      const response = await fetch(`${WORKER_API_URL}/api/timesheet`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ logs }),
      });
      
      if (!response.ok) throw new Error('Failed to generate share code');
      
      const data = await response.json();
      setShareCode(data.passphrase);
      setHasSavedCode(true);
      localStorage.setItem(STORAGE_KEY, data.passphrase);
      setSuccessMessage(`Share code generated: ${data.passphrase}`);
    } catch (err) {
      setError('Failed to generate share code. Please try again.');
      console.error('Error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const syncExistingCode = async () => {
    setIsLoading(true);
    setError('');
    setSuccessMessage('');
    try {
      const response = await fetch(`${WORKER_API_URL}/api/timesheet/${shareCode}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ logs }),
      });
      
      if (!response.ok) throw new Error('Failed to sync data');
      setSuccessMessage('Data synced successfully!');
    } catch (err) {
      setError('Failed to sync data. Please try again.');
      console.error('Error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSharedData = async () => {
    if (!importCode.trim()) {
      setError('Please enter a share code');
      return;
    }

    setIsLoading(true);
    setError('');
    setSuccessMessage('');
    try {
      const response = await fetch(`${WORKER_API_URL}/api/timesheet/${importCode.trim()}`);
      
      if (!response.ok) throw new Error('Failed to fetch shared data');
      
      const data = await response.json();
      
      // Import the logs into the local time tracker
      if (onImportLogs && data.logs) {
        onImportLogs(data.logs);
      }
      
      // Save this code as the new active code
      setShareCode(importCode.trim());
      setHasSavedCode(true);
      localStorage.setItem(STORAGE_KEY, importCode.trim());
      
      // Save the import code in the textbox
      localStorage.setItem(IMPORT_CODE_KEY, importCode.trim());
      
      setSuccessMessage('Data imported successfully! Switch to "Local Export" to download.');
    } catch (err) {
      setError('Failed to fetch shared data. Please check the code and try again.');
      console.error('Error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSwitchCode = () => {
    if (window.confirm('Switch to a different sync code? Your current code will be replaced.')) {
      setActiveTab('import');
      setImportCode('');
      setError('');
      setSuccessMessage('');
    }
  };

  return (
    <DialogContent className="sm:max-w-md w-[95%] sm:w-full max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg border dark:border-gray-700">
      <DialogHeader>
        <DialogTitle className="text-gray-900 dark:text-gray-100">Export Time Tracking Data</DialogTitle>
      </DialogHeader>
      
      <div className="flex flex-col gap-4">
        {/* Tab buttons */}
        <div className="flex gap-2 p-1 bg-gray-100 dark:bg-gray-700 rounded-lg">
          <Button
            onClick={() => setActiveTab('local')}
            variant="ghost"
            className={`flex-1 h-9 px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-0 ${
              activeTab === 'local'
                ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm hover:bg-white dark:hover:bg-gray-600'
                : 'bg-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600/50'
            }`}
          >
            Local Export
          </Button>
          <Button
            onClick={() => setActiveTab('share')}
            variant="ghost"
            className={`flex-1 h-9 px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-0 ${
              activeTab === 'share'
                ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm hover:bg-white dark:hover:bg-gray-600'
                : 'bg-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600/50'
            }`}
          >
            Sync
          </Button>
          <Button
            onClick={() => setActiveTab('import')}
            variant="ghost"
            className={`flex-1 h-9 px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-0 ${
              activeTab === 'import'
                ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm hover:bg-white dark:hover:bg-gray-600'
                : 'bg-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600/50'
            }`}
          >
            Import
          </Button>
        </div>

        {/* Tab content */}
        <div className="space-y-4">
          {activeTab === 'local' && (
            <>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Download your time tracking data as an Excel file.
              </p>
              <Button
                onClick={handleDownload}
                className="flex items-center gap-2 w-full bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700"
                variant="outline"
              >
                <ArrowDownToLine className="w-4 h-4" />
                Download Excel File
              </Button>
            </>
          )}

          {activeTab === 'share' && (
            <>
              {hasSavedCode ? (
                <>
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                        Your sync code:
                      </p>
                      <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg text-center">
                        <code className="text-lg font-mono font-semibold text-blue-600 dark:text-blue-400">
                          {shareCode}
                        </code>
                      </div>
                    </div>
                    
                    <p className="text-xs text-gray-500 dark:text-gray-500">
                      Use this code on your other devices to sync your time tracking data.
                    </p>

                    <div className="flex gap-2">
                      <Button
                        onClick={syncExistingCode}
                        variant="outline"
                        className="flex-1 flex items-center gap-2"
                        disabled={isLoading}
                      >
                        <Upload className="w-4 h-4" />
                        {isLoading ? 'Syncing...' : 'Sync Data'}
                      </Button>
                      
                      <Button
                        onClick={handleToggleAutoSync}
                        variant={autoSync ? "default" : "outline"}
                        className={`flex-1 flex items-center gap-2 ${
                          autoSync ? 'bg-blue-600 hover:bg-blue-700 text-white' : ''
                        }`}
                      >
                        {autoSync ? (
                          <>
                            <Wifi className="w-4 h-4" />
                            Auto-Sync On
                          </>
                        ) : (
                          <>
                            <WifiOff className="w-4 h-4" />
                            Auto-Sync Off
                          </>
                        )}
                      </Button>
                    </div>
                    
                    {autoSync && (
                      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                        <RefreshCw className={`w-3 h-3 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`} />
                        <span>
                          {syncStatus === 'syncing' ? 'Syncing...' : 
                           syncStatus === 'error' ? 'Sync error - will retry' : 
                           'Real-time sync active'}
                        </span>
                      </div>
                    )}
                    
                    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                        Need a new sync code?
                      </p>
                      <Button
                        onClick={generateNewCode}
                        variant="outline"
                        className="flex items-center gap-2 w-full"
                        disabled={isLoading}
                      >
                        <Share2 className="w-4 h-4" />
                        Generate New Sync Code
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Generate a sync code to access your data on other devices.
                  </p>
                  <Button
                    onClick={generateNewCode}
                    className="flex items-center gap-2 w-full"
                    disabled={isLoading}
                  >
                    <Share2 className="w-4 h-4" />
                    Generate Sync Code
                  </Button>
                </>
              )}
            </>
          )}

          {activeTab === 'import' && (
            <>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Enter your sync code from another device to access your data here.
              </p>
              <div className="space-y-3">
                <Input
                  placeholder="Enter sync code (e.g. blue-cat-7)"
                  value={importCode}
                  onChange={(e) => {
                    setImportCode(e.target.value);
                    // Save to localStorage as user types
                    localStorage.setItem(IMPORT_CODE_KEY, e.target.value);
                  }}
                  onKeyPress={(e) => e.key === 'Enter' && fetchSharedData()}
                  className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700"
                />
                <Button
                  onClick={fetchSharedData}
                  variant="outline"
                  className="w-full flex items-center gap-2"
                  disabled={isLoading || !importCode.trim()}
                >
                  <Download className="w-4 h-4" />
                  {isLoading ? 'Fetching...' : 'Import Data'}
                </Button>
              </div>
            </>
          )}
        </div>

        {/* Messages */}
        {error && (
          <p className="text-sm text-red-500 text-center">{error}</p>
        )}
        {successMessage && (
          <p className="text-sm text-green-600 dark:text-green-400 text-center">{successMessage}</p>
        )}
      </div>
    </DialogContent>
  );
};

export default ExportDialog;
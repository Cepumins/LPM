// fileUtils.js
const fs = require('fs'); // For stream functions like createReadStream
const fsp = require('fs').promises; // For promise-based file operations
const path = require('path');
const csv = require('csv-parser');
const { faL } = require('@fortawesome/free-solid-svg-icons');

// Global cache to store files in memory
const fileCache = {};

const fileBackupTime = 5000;
const fileTimeoutTime = 15000; // 10 seconds expiry

// Helper function to calculate the size of an object in bytes, handling circular references
const getObjectSizeInBytes = (obj) => {
  const cache = new Set(); // To keep track of objects we've seen and avoid circular references
  const str = JSON.stringify(obj, (key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (cache.has(value)) {
        return; // Circular reference found, discard key
      }
      cache.add(value);
    }
    return value; // Return the value if no circular reference
  });
  return Buffer.byteLength(str, 'utf8');
};

// Helper function to convert bytes to human-readable format
const formatBytes = (bytes) => {
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  if (bytes === 0) return '0 Byte';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
};

// Helper function to parse CSV or JSON
async function parseFile(filePath) {
  const fileName = path.basename(filePath);
  if (fileName.endsWith('.json')) {
    // JSON parsing
    const data = await fsp.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } else if (fileName.endsWith('.csv')) {
    // CSV parsing
    return new Promise((resolve, reject) => {
      const data = [];
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row) => data.push(row))
        .on('end', () => {
          if (false) {
            console.log(`Parsed CSV data from ${filePath}:`, data); // Add log for parsed CSV data
          };
          resolve(data);
        })
        .on('error', reject);
    });
  }
  throw new Error(`Unsupported file type: ${fileName}`);
};

// Helper function to serialize data for writing
function serializeFile(fileName, data) {
  if (!data || (!Array.isArray(data) && typeof data !== 'object')) {
    console.error(`Error: Invalid data provided to serialize for ${fileName}. Data:`, data); // Add log if data is invalid
    throw new Error(`Cannot serialize file: ${fileName}, data is invalid.`);
  }
  
  if (fileName.endsWith('.json')) {
    console.log(`Serializing JSON file: ${fileName}`); // Add log for JSON serialization
    return JSON.stringify(data, null, 2); // Pretty print JSON
  } else if (fileName.endsWith('.csv')) {
    console.log(`Serializing CSV file: ${fileName}`); // Add log for CSV serialization

    // Wrap the object in an array if it's not already an array
    const arrayData = Array.isArray(data) ? data : [data];

    // Check if the first element of data is a valid object to avoid errors in serialization
    const header = Object.keys(arrayData[0] || {}).join(',');
    const rows = arrayData.map(row => Object.values(row).join(','));
    const csvContent = [header, ...rows].join('\n');
    if (false) {
      console.log(`Serialized CSV content for ${fileName}:`, csvContent); // Log the final serialized CSV content
    };
    return csvContent;
  }
  throw new Error(`Unsupported file type: ${fileName}`);
};

// Helper function to handle backup logic
const setBackupTimer = (fileName, filePath) => {
  if (fileCache[fileName]?.backupTimer) clearInterval(fileCache[fileName].backupTimer);

  fileCache[fileName].backupTimer = setInterval(async () => {
    if (fileCache[fileName]?.modified) {
      try {
        // Ensure the data exists before attempting to serialize it
        if (fileCache[fileName]?.data) {
          console.log(`Backing up ${filePath} with data:`, fileCache[fileName].data); // Add log before backing up
          await fsp.writeFile(filePath, serializeFile(fileName, fileCache[fileName].data));
          console.log(`Backed up ${filePath}/${fileName} to disk.`);
          fileCache[fileName].modified = false; // Reset modification flag after backup
        } else {
          console.error(`Error: No data found to back up for ${filePath}/${fileName}`);
        }
      } catch (error) {
        console.error(`Error backing up ${filePath}/${fileName}:`, error);
      }
    } else {
      console.log(`No modifications made for ${filePath}`);
    }
  }, fileBackupTime);
};

// Helper function to handle expiry logic
const setExpiry = (fileName, filePath) => {
  if (fileCache[fileName]?.expiryTimer) clearTimeout(fileCache[fileName].expiryTimer);

  fileCache[fileName].expiryTimer = setTimeout(async () => {
    try {
      if (fileCache[fileName]) {
        console.log(`Expiring ${filePath}/${fileName}. Saving data before expiry:`, fileCache[fileName].data); // Add log before expiry
        await fsp.writeFile(filePath, serializeFile(fileName, fileCache[fileName].data));
        console.log(`Expired and saved ${fileName} to disk.`);
        clearInterval(fileCache[fileName].backupTimer); // Clear backup timer
        delete fileCache[fileName]; // Remove from memory
      }
    } catch (error) {
      console.error(`Error saving expired ${fileName}:`, error);
    }
  }, fileTimeoutTime);
};

// Helper function to save data to disk
const saveToDisk = async (filePath, saveType) => {
  try {
    if (fileCache[filePath]?.data) {
      if (false) {
        console.log(`${saveType === 'expiry' ? 'Expiring' : 'Backing up'} ${filePath} with data:`, fileCache[filePath].data);
      };
      await fsp.writeFile(filePath, serializeFile(filePath, fileCache[filePath].data));
      console.log(`${saveType === 'expiry' ? 'Expired and saved' : 'Backed up'} ${filePath} to disk.`);
      
      if (saveType === 'expiry') {
        delete fileCache[filePath]; // Remove from memory on expiry
      } else {
        // Reset modification flag after backup
        fileCache[filePath].modified = false;
        // Update the lastSaved time
        fileCache[filePath].lastSaved = Date.now();
      }
    }
  } catch (error) {
    console.error(`Error during ${saveType} for ${filePath}:`, error);
  }
};

// Function to manage both backup and expiry timers
const setTimer = (filePath) => {
  //const fileName = path.basename(filePath);
  
  // Get the file's expiry time
  const expiryTime = fileCache[filePath].lastAccessed + fileTimeoutTime;

  // Calculate the time left for expiry
  const timeUntilExpiry = expiryTime - Date.now();

  const backupCount = Math.floor(timeUntilExpiry / fileBackupTime);

  //let lastBackupTime;
  while (i <= backupCount, i=1) {
    backupTime = Date.now + fileBackupTime;
    if (backupTime > fileCache[filePath].lastBackup) {
      fileCache[filePath].lastBackup = backupTime;
      if (expiryTime > 999 + backupTime) {
        setTimeout(() => saveToDisk(filePath, 'backup'), backupTime);
      }
    }
  }

  setTimeout(() => saveToDisk(filePath, 'expiry'), expiryTime);
  //but we need to overwrite the expiry timeout if the function gets again for the filePath, so that we dont accidentaly offload file thats being used
};

// Universal function to manage file access, caching, and backup
async function accessFile(directory, fileName, modifyCallback = null) {
  const filePath = path.join(directory, fileName);

  // Check if file is already in memory
  if (fileCache[filePath]) {
    fileCache[filePath].lastAccessed = Date.now(); // Update last access time
    //console.log(`Accessing ${filePath} from memory.`);
    console.log(`Accessing ${filePath} from memory.`);
    if (false) {
      console.log(fileCache[filePath].data);
    };

  } else {
    // Check if the file exists on disk
    try {
      await fsp.access(filePath); // Will throw an error if file does not exist
    } catch (error) {
      throw new Error(`File not found: ${filePath}`);
    }
    
    // File is not in memory, load from disk
    //console.log(`Loading ${filePath} from disk.`);
    const data = await parseFile(filePath);
    //console.log(data);
    console.log(`Loaded ${filePath} data from disk:`);
    if (false) {
      console.log(data);
    };

    // Cache the loaded file
    fileCache[filePath] = {
      data,
      modified: false, // Initialize modified as false
      lastAccessed: Date.now(),
      //expiryTimer: null,
      lastSaved: null,
      //lastBackup: null,
      
      backupScheduled: false, // Initialize flag to prevent multiple backups
    };
  }

  // If a modifyCallback is provided, modify data
  if (modifyCallback) {
    console.log(`Modifying ${filePath} with provided callback.`);
    fileCache[filePath].data = modifyCallback(fileCache[filePath].data);
    fileCache[filePath].modified = true; // Mark as modified
    // Log the data after modification (if applicable)
    if (false) {
      console.log(`Data after modification for ${filePath}:`, fileCache[filePath].data);
    };

    // Check if enough time has passed since the last save to write immediately
    if (!fileCache[filePath].lastSaved || (Date.now() - fileCache[filePath].lastSaved > fileBackupTime + 100)) {
      saveToDisk(filePath, 'backup');
    } else if (!fileCache[filePath].backupScheduled) {
      // If not enough time has passed and no backup is scheduled, schedule a delayed save
      fileCache[filePath].backupScheduled = true; // Mark backup as scheduled
      setTimeout(() => {
        saveToDisk(filePath, 'backup');
        fileCache[filePath].backupScheduled = false; // Reset the backupScheduled flag after saving
      }, fileBackupTime);
    }
  }

  // List files in memory and their sizes
  //const logMemory = false;
  if (false) {
    console.log('Files currently in memory:');
    let totalCacheSizeInBytes = 0;

    Object.keys(fileCache).forEach((key) => {
      const fileSize = getObjectSizeInBytes(fileCache[key]);
      totalCacheSizeInBytes += fileSize;
      console.log(` - ${key}: ${formatBytes(fileSize)}`);
    });

    // Log the total size of all files in cache
    console.log(`Total fileCache size: ${formatBytes(totalCacheSizeInBytes)}`);
  }

  //setExpiry(fileName, filePath);
  //setBackupTimer(fileName, filePath);
  // Set a single timer to handle both backup and expiry
  //setTimer(filePath);

  // Clear the previous expiry timer if it exists
  if (fileCache[filePath].expiryTimer) clearTimeout(fileCache[filePath].expiryTimer);
  // Calculate time until expiry
  const timeUntilExpiry = fileCache[filePath].lastAccessed + fileTimeoutTime - Date.now();
  //console.log(`Setting expiry timer for ${filePath}, will expire in ${timeUntilExpiry}ms`);
  // Schedule the expiry timer to offload the file after fileTimeoutTime
  fileCache[filePath].expiryTimer = setTimeout(() => {
    saveToDisk(filePath, 'expiry'); // Expire and offload the file
  }, timeUntilExpiry);

  return fileCache[filePath].data;
};

module.exports = {
    accessFile,
    fileCache
};
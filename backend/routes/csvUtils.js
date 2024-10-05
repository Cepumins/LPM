// csvUtils.js
const fs = require('fs');
const csv = require('csv-parser');
const { parse } = require('json2csv');
const path = require('path');

// Utility function to read CSV file
const readCSV = async (filePath) => {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', (error) => reject(error));
  });
};

// Utility function to write to CSV file
const writeCSV = async (filePath, data) => {
  if (!data || data.length === 0) {
    fs.writeFileSync(filePath, '');
    return;
  }
  const fields = Object.keys(data[0]);
  const csvData = parse(data, { fields });
  fs.writeFileSync(filePath, csvData);
  console.log(`Data written to ${filePath}`);
};

// Load CSV data into memory
const loadCSV = async (filePath) => {
  const data = [];
  const readStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: readStream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    data.push(line);
  }
  return data;
};

module.exports = {
  readCSV,
  writeCSV,
  loadCSV
};

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { parse } = require('json2csv');
const bcrypt = require('bcrypt');

const readCSV = (filePath) => {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', (error) => reject(error));
  });
};

const writeCSV = (filePath, data) => {
  const fields = Object.keys(data[0]);
  const csvData = parse(data, { fields });
  fs.writeFileSync(filePath, csvData);
};

const hashPasswords = async () => {
  const users = await readCSV(path.resolve(__dirname, './security.csv'));

  for (let user of users) {
    user.password = await bcrypt.hash(user.password, 10);
  }

  writeCSV(path.resolve(__dirname, './security.csv'), users);
  console.log('Passwords hashed and updated in security.csv');
};

hashPasswords();

const mongoose = require('mongoose');

// Define a simple Schema for your data
const DataSchema = new mongoose.Schema({
  admin: Object,
  students: Array,
  teachers: Array,
  attendance: Array,
  routines: Array,
  examRoutines: Array,
  results: Array,
  fees: Array,
  classes: Array,
  classSections: Object
});

const Database = mongoose.model('Database', DataSchema);

async function readDB() {
  let db = await Database.findOne();
  if (!db) {
    // Return a default structure if the database is empty
    return { admin: { username: 'admin', password: 'password' }, students: [], teachers: [], attendance: [], routines: [], examRoutines: [], results: [], fees: [], classes: ['Six'], classSections: { Six: ['A'] } };
  }
  return db;
}

async function writeDB(newData) {
  await Database.updateOne({}, newData, { upsert: true });
}

module.exports = { readDB, writeDB };
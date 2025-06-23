const { MongoClient } = require("mongodb");
const { mongoUri } = require("../config");

let db;
async function connect() {
  const client = new MongoClient(mongoUri);
  await client.connect();
  db = client.db();
  console.log("📦 MongoDB connected");
}
function collection(name) {
  return db.collection(name);
}

module.exports = { connect, collection };
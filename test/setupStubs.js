import mongoose from 'mongoose';
import fs from 'fs';

process.env.BOT_TOKEN ||= '123456:TEST_TOKEN_FOR_TESTS';
process.env.MONGO_URI ||= 'mongodb://localhost:27017/delta-test';
process.env.OWNER_ID ||= '1';

// In-memory mock databases
export const mockMongoStore = [];
export const mockJsonDb = { userbots: {} };

// Setup mongoose connection readyState and metadata
mongoose.connection.readyState = 0;
mongoose.connection.name = 'MockDB';

mongoose.connect = async function(uri, options) {
  mongoose.connection.readyState = 1;
  mongoose.connection.name = 'MockDB';
  return mongoose;
};

mongoose.disconnect = async function() {
  mongoose.connection.readyState = 0;
};

// Stub Mongoose Model methods used in db.js
mongoose.Model.find = async function(query) {
  return mockMongoStore;
};

mongoose.Model.findById = async function(id) {
  if (id === 'system') {
    return { _id: 'system', vars: {}, toObject: function() { return this; } };
  }
  return null;
};

mongoose.Model.findOne = async function(query) {
  if (query && (query._id === 'system' || query.chat_id || query.telegram_id)) {
    return { _id: 'system', vars: {}, toObject: function() { return this; } };
  }
  return null;
};

mongoose.Model.findOneAndUpdate = async function(query, update, options) {
  let bot = mockMongoStore.find(b => b.telegram_id === query.telegram_id);
  const data = update.$set || update;
  if (!bot && options?.upsert) {
    bot = { telegram_id: query.telegram_id, ...data };
    mockMongoStore.push(bot);
  } else if (bot) {
    Object.assign(bot, data);
  }
  return bot;
};

mongoose.Model.updateOne = async function(query, update) {
  let bot = mockMongoStore.find(b => b.telegram_id === query.telegram_id);
  if (bot) {
    if (update.$push) {
      for (const [k, v] of Object.entries(update.$push)) {
        if (!bot[k]) bot[k] = [];
        if (Array.isArray(bot[k])) {
          bot[k].push(v);
        }
      }
    }
    if (update.$pull) {
      for (const [k, v] of Object.entries(update.$pull)) {
        if (Array.isArray(bot[k])) {
          bot[k] = bot[k].filter(item => item !== v);
        }
      }
    }
    if (update.$addToSet) {
      for (const [k, v] of Object.entries(update.$addToSet)) {
        if (!bot[k]) bot[k] = [];
        if (Array.isArray(bot[k]) && !bot[k].includes(v)) {
          bot[k].push(v);
        }
      }
    }
    // Simple field updates
    for (const [k, v] of Object.entries(update)) {
      if (!k.startsWith('$')) {
        bot[k] = v;
      }
    }
  }
  return { nModified: 1 };
};

mongoose.Model.deleteOne = async function(query) {
  const idx = mockMongoStore.findIndex(b => b.telegram_id === query.telegram_id);
  if (idx > -1) {
    mockMongoStore.splice(idx, 1);
  }
  return { deletedCount: 1 };
};

// Stub fs module calls to target database.json
const originalExistsSync = fs.existsSync;
fs.existsSync = function(filePath) {
  if (typeof filePath === 'string' && filePath.endsWith('database.json')) {
    return true;
  }
  return originalExistsSync.apply(fs, arguments);
};

const originalReadFileSync = fs.readFileSync;
fs.readFileSync = function(filePath, options) {
  if (typeof filePath === 'string' && filePath.endsWith('database.json')) {
    return JSON.stringify(mockJsonDb);
  }
  return originalReadFileSync.apply(fs, arguments);
};

const originalWriteFileSync = fs.writeFileSync;
fs.writeFileSync = function(filePath, data, options) {
  if (typeof filePath === 'string' && filePath.endsWith('database.json')) {
    try {
      const parsed = JSON.parse(data);
      Object.assign(mockJsonDb, parsed);
    } catch (e) {
      // Handle non-JSON or partial write
    }
    return true;
  }
  return originalWriteFileSync.apply(fs, arguments);
};

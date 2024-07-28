const fs = require('fs');
const path = require('path');

const activeSessionsFilePath = path.resolve(__dirname, '../activeSessions.json');

// Load active sessions from file
const loadActiveSessions = () => {
  if (fs.existsSync(activeSessionsFilePath)) {
    return JSON.parse(fs.readFileSync(activeSessionsFilePath, 'utf-8'));
  }
  return [];
};

// Save active sessions to file
const saveActiveSessions = (sessions) => {
  fs.writeFileSync(activeSessionsFilePath, JSON.stringify(sessions, null, 2));
};

// Add a session
const addSession = (userId) => {
  const sessions = loadActiveSessions();
  if (!sessions.includes(userId)) {
    sessions.push(userId);
    saveActiveSessions(sessions);
  }
};

// Remove a session
const removeSession = (userId) => {
  const sessions = loadActiveSessions();
  const index = sessions.indexOf(userId);
  if (index !== -1) {
    sessions.splice(index, 1);
    saveActiveSessions(sessions);
  }
};

// Clear all sessions
const clearSessions = () => {
  saveActiveSessions([]);
};

module.exports = {
  loadActiveSessions,
  addSession,
  removeSession,
  clearSessions,
};

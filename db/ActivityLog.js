const mongoose = require('./db.js')

const activityLogSchema = mongoose.Schema({
  type: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  downloadedAt: {
    type: Date,
    required: true,
  },
})

const ActivityLog = mongoose.model('ActivityLog', activityLogSchema)

module.exports = ActivityLog
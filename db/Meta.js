const mongoose = require('./db.js')

const metaSchema = mongoose.Schema({
	title: {
    type: String,
    required: true
  },
  content: {
    type: String,
    required: true
  }
})

const Meta = mongoose.model('Meta', metaSchema)

module.exports = Meta
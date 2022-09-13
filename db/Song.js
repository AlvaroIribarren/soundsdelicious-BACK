const mongoose = require('./db.js')

const songSchema = mongoose.Schema({
  num_id: {
    type: Number,
    required: true,
    unique: true
  },
  sort_rank: {
    type: Number,
    unique: true,
  },
	title: {
    type: String,
    required: true,
    unique: true
  },
	artist: {
    type: String,
  },
  genre: {
    type: [String],
    required: true
  },
  // collec: {
  //   type: [String]
  // },
  // // tempo: {
  // //   type: Number,
  // //   required: true
  // // },
  // energy: {
  //   type: String,
  // },
  primary_keywords: {
    type: [String],
    required: true
  },
  // secondary_keywords: {
  //   type: [String],
  //   required: true
  // },
  instruments: {
    type: [String],
    required: true
  },
  // has_stems: {
  //   type: Boolean,
  //   required: true,
  //   default: false
  // },
  searchable_keywords: {
    type: [String],
    required: true
  },
  // length: {
  //   type: Number
  // },
})

const Song = mongoose.model('Song', songSchema)

module.exports = Song
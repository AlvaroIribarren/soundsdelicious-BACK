var express = require('express');
var router = express.Router();

const fs = require('fs')
const shell = require('shelljs');

const mongoose = require('../db/db.js')
const Song =  require('../db/Song.js')
const Meta =  require('../db/Meta.js')

const path = require('path')

/**
 * Generate peaks for a particular song
 *
 * @param {string} s The full name of the song
 * @param {boolean} [allowOverwrite=true] Whether to allow overwriting. If
 * set to false, will not create a new peak if one already exists.
 */
const generatePeak = async (s, allowOverwrite = true) => {
  const path = `./public/songs/${s}/${s}.wav`
  const destDir = `./public/songs-peaks/${s}/`
  const destName = `${destDir}${s}`
  try {
    if (!allowOverwrite && fs.existsSync(`${destName}.json`)) {
      // do not proceed if json file already exists
      return false
    }
    shell.exec(`mkdir "${destDir}"`) // create dest folder
    shell.exec(`audiowaveform -i "${path}" -o "${destName}.dat" --pixels-per-second 20 --bits 8`)
    shell.exec(`sleep 1`)
    shell.exec(`audiowaveform -i "${destName}.dat" -o "${destName}.json"`)
    shell.exec(`sleep 1`)
    shell.exec(`python ./deps/scale-json.py "${destName}.json"`)
    shell.exec(`sleep 3`)
    return true
  } catch (e) {
    console.log(e)
    return false
  }
}

/**
 * Generate peaks for all songs
 *
 * @param {boolean} [allowOverwrite=true] Whether to allow overwriting. If
 * set to false, will not create a new peak if one already exists for a
 * particular song.
 */
const generatePeaks = async (allowOverwrite = true) => {
  const songs = await Song.find({})
  songs.forEach(s =>
    generatePeak(s.title, allowOverwrite)
  )
}

router.post('/generate', async (req, res) => {
  try {
    await generatePeaks()
    res.send(200)
  } catch (e) {
    res.send(400)
  }
})

router.post('/generate/new', async (req, res) => {
  try {
    await generatePeaks(false)
    res.send(200)
  } catch (e) {
    res.send(400)
  }
})

module.exports = router;

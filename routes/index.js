var express = require('express');
var router = express.Router();

const mongoose = require('../db/db.js')
const ActivityLog =  require('../db/ActivityLog.js')
const Song =  require('../db/Song.js')
const Meta =  require('../db/Meta.js')

const sgMail = require('@sendgrid/mail')
const marked = require('marked')
const parse = require('csv-parse')
const energyEq = require('../special/energy-eq.js')
var fs = require('fs');

const archiver = require('archiver')
const path = require('path');

sgMail.setApiKey('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')

/**
 * Get list of all collections used in the song
 */
// router.post('/collections', (req, res) => {
//   const collections = []

//   Song.distinct('collec')
//   .then(collecs => collecs.filter(c => !!c && c !== ' ')) // remove empty spaces
//   .then(collecs => collecs.map(collec => collections.push(...collec.split(', ')))) // split some values by comma
//   .then(_ => {
//     let collecs = [...new Set(collections)]
//     res.json(collecs)
//   })
// })

/**
 * Get all metadata (about and FAQ)
 */
router.post('/meta', (req, res) => {
  Meta.find({
    title: { $in: ['faq']}
  })
  .then(fields => fields.map(field => {
    field.content = marked(field.content)
    return field
  }))
  .then(fields => {
    const meta = {}
    fields.forEach(field => {
      meta[field.title] = field.content
    })
    return meta
  })
  .then(meta => res.json(meta))
  .catch(err => {
    console.log(err)
    return res.sendStatus(400)
  })
})

router.get('/peaks/:songTitle', async (req, res) => {
  const songTitle = req.params.songTitle;

  console.log('Searching:', songTitle)
  const peaksFolder = `./public/songs-peaks`;
  const dat = `${peaksFolder}/${songTitle}/${songTitle}.dat`
  const json = `${peaksFolder}/${songTitle}/${songTitle}.json`

  fs.readFile(json, 'utf8', function(err, data){
    console.log(data);
    res.send(JSON.parse(data))
  });
})

const _getMetaFromTitle = title => {
  // This is literally a page of comma separated values,
  return Meta.findOne({
    title
  })
    .then(data => data ? data : { content: '' })
}

/**
 * Get all term equivalences involved
 */
const getTermEquivalences = term => {
  return _getMetaFromTitle('terms')
    // get and parse it
    .then(data => data.content.replace(/\r/g, ''))
    .then(content => content.split(/\n/).map(row => row.split(', ')))
    // apply funny logic when you get 2d array
    .then(terms => {
      let termEqs = term.split(/\s/).map(termWord =>
        terms.find(row => row.includes(termWord)) || [termWord]
      )
      const f = (a, b) => [].concat(...a.map(d => b.map(e => `${d} ${e}`)))
      const cartesian = (a, b, ...c) => (b ? cartesian(f(a, b), ...c) : a)
      const allEqs = cartesian(...termEqs)
      console.log(allEqs)
      return allEqs
    })
}

/**
 * Filter all keys from admin blacklist
 */
const filterAdminBlacklist = async term => {
  const blacklistedWords = await _getMetaFromTitle('blacklist')
    .then(data => data.content.replace(/\r\n/g, ''))
    .then(content => content.split(', '))
  return term.replace(new RegExp('\b' + blacklistedWords.join('\b|\b') + '\b', 'gi'), '')
}

/**
 * Curried helper for `anyContainsTerms`, checks word presence
 * with lowercase
 *
 * @param {String} hay String to which to check in
 */
const isPresentIn = hay =>
  /**
   * @param {String} term Split and check for all occurences in
   * `hay`
   */
  term =>
    term
      .split(/[ ,]+/) // Split w space and comma
      .filter(Boolean) // Remove any empty terms
      // Confirm that it is contained in the hay
      .every(word => hay.toLowerCase().includes(word.toLowerCase()))

/**
 * Checks if ANY ONE element of the `haystack` contains ALL terms
 * from `terms`
 *
 * @param {[String]} haystack: Array of Strings
 * that are each checked for containing all words from `terms`,
 * with an OR combination between them (union)
 * @param {[String]} terms Array of possibly multi-word (space/comma
 * separated) terms that need to be searched for in the `haystack`
 *
 * @returns {Boolean} Whether any one of `haystack` contains ALL `terms`
 * words or not
 */
const anyContainsTerms = (haystack, terms) =>
  haystack.some(hay => terms.some(isPresentIn(hay)))

/**
 * Gets all songs from db that result from search term `term`
 * @param {*} term Search term for songs query
 * @param {*} cb Callback to which songs array is returned
 */
const getSongsFromTerm = (term, cb) => {
  // If term doesn't exist, give all results
  if (!term) {
    Song.find().sort({ 'num_id': -1 })
      .exec((err, songs) => {
        // filter songs
        const filteredSongs = songs.sort((a, b) => {
          return a.sort_rank - b.sort_rank
        })
        return cb(filteredSongs)
      })
    return false
  }

  // Check if input is sanitary
  const re = /^[A-Z0-9a-z_ ]+$/g
  if (!re.test(term)) return cb('[]')

  // Skip everything else if it's an energy equivalence
  const isEnergyTerm = energyEq.find(energy => {
    if (energy.includes(term)) {
      Song.find({
        energy
      }).sort({ 'num_id': -1 })
        .then(songs => {
          return cb(songs)
        })
      return true
    }
  })

  // skipping happens here
  if (isEnergyTerm) return false

  // get equivalences and search for all of them
  getTermEquivalences(term)
    .then(terms => {
      console.log(terms)
      // Search all songs in database
      return Promise.all([Song.find().sort({ 'num_id': -1 }), terms])
    })
    .then(([allSongs, terms]) => {
      console.log("Length");
      console.log(allSongs.length);
      let songs = [].concat.apply([], allSongs)
      // Remove duplicates
      songs = songs.filter((song, i, songs) =>
        i === songs.findIndex(s => s.title === song.title)
      )
      // Do the actual searching/filtering here!
      songs = songs.filter(s => {
        // Singular array of all search keywords that matter
        const searchKeywords = [...s.primary_keywords, ...s.instruments, ...s.searchable_keywords]

        return anyContainsTerms([
          s.title,
          s.genre.join(" "),
          searchKeywords.join(" ")], terms)
      })

      return songs
    })
    .then(songs => cb(songs))
    .catch(err => {
      console.log(err)
    })
}

/**
 * Song search function, returns db copy of songs
 */
router.post('/search', async (req, res) => {
  let { term, type } = req.body
  // remove 'blacklisted' words and punctuation
  term = await filterAdminBlacklist(term)
  term = term
    .replace(/music/g, '')
    .replace(/,/g, '')
    .replace(/\s+/, ' ')
    .trim()

  console.log('Searching:', term)
  getSongsFromTerm(term, songs => {
    res.send(songs)
  })
})


router.post('/dl', (req, res) => {
  const arch = archiver('zip', {
    zlib: { level: 0 },
  })

  arch.on('error', function(err) {
    res.status(500).send({ error: err.message })
  })

  let { songs, format } = req.body
  if (format !== 'mp3' && format !== 'wav') {
    format = 'mp3'
  }
  let toZip = []
  console.log(songs, format, format === 'wav')

  // Add every song's information
  songs.forEach(s => {
    const title = s.title
    const p = `${title}/${title}`
    toZip.push({
      path: `${p}.${format}`,
      name: `${p}.${format}`
    })
  })

  // Add correct path to all
  toZip = toZip.map(s => {
    const spath = s.path
    const name = s.name
    const fpath = path.join(__dirname, '..', 'public', 'songs', spath)
    return {
      path: fpath,
      name
    }
  })

  toZip.forEach(s => {
    arch.file(s.path, { name: s.name })
  })
  arch.finalize()

  // send zip
  res.attachment('playlist_media.zip')
  arch.pipe(res)
})

/**
 * Admin panel to CRUD on database
 */
router.get('/admin', function(req, res) {
  res.render('login')
})

router.post('/admin', function(req, res) {
  const { password } = req.body
  if (!password) return

  if (password === 'deliciousjC9G72ccfp') {
    req.session.authenticated = true
    res.redirect('/dashboard')
  }
})

// Helper to check if user is logged in
const isAuthorized = (req, res, next) => {
  if (
    (req.session && req.session.authenticated) ||
    req.connection.remoteAddress === '::1'
  )
    return next()

  return res.redirect('/admin')
}

/**
 * Set up display of all songs columns
 */
router.get('/dashboard', isAuthorized, function(req, res) {
  Song.find().sort({ '_id': 1 })
  .then(songs => {
    return Meta.find({})
    .then(fields => {
      const meta = {}

      fields.forEach(field => {
        meta[field.title] = field.content
      })
      return meta
    })
    .then(meta => {
      return ActivityLog.find({})
      .then(activityLog => {
        return [songs, meta, activityLog]
      })
    })
  })
  .then(([songs, meta, activityLog]) => {
    res.render('dashboard', { songs, meta, activityLog })
  })
  .catch(err => {
    return res.send(err)
  })
})

/**
 * Handle song upload/edits/deletion
 */
const parseSong = (songData, idx) => {
  if (!songData || !songData.length) return {}

  console.log("Song data");
  console.log(songData);
  const split = str => str.split(',').map(piece => piece.trim())

  const song = {
    num_id: parseInt(songData[0], 10),
    sort_rank: songData[1] ? parseInt(songData[1], 10) : 1000,
    title: songData[2],
    artist: songData[3],
    genre: split(songData[4]),
    // collec: split(songData[5]) || '',
    // tempo: parseInt(songData[6], 10),
    // energy: songData[7],
    primary_keywords: split(songData[5]),
    // secondary_keywords: [''], // legacy
    instruments: split(songData[6]),
    // has_stems: songData[11] == 'yes',
    searchable_keywords: split(songData[7]),
    // length: parseInt(songData[13], 10),
  }

  return song
}

/**
 * Upload CSV and parse to songs
 */
router.post('/upload', isAuthorized, function(req, res) {
  if (!req.files)
    return res.status(400).send('No files were uploaded')

  let file = req.files.csv
  parse(file.data.toString(), (err, songsData) => {
    const parsedSongs = songsData.slice(1).map(parseSong)
    console.log(parsedSongs);
    // Delete existing songs and add this data
    Song.deleteMany({}, (err) => {
      if (err) return res.status(400).send(err)
      Song.create(parsedSongs, (err, songs) => {
        if (err) {
          console.error(parsedSongs, err)
          return res.status(400).send(err)
        }
        res.redirect('/dashboard')
      })
    })
  })
})

/**
 * Helper function for creating metas
 */
const createOrUpdateMeta = (title, content, res) =>
  Meta.findOne({
    title
  })
  .then(field => {
    if (!field) {
      return Meta.create({
        title,
        content
      })
    }

    return Meta.update({ title }, { $set: { content } })
  })
  .then(_ => res.redirect('/dashboard'))
  .catch(err => {
    console.log(err)
    return res.sendStatus(400)
  })

// updater
const metaUpdater = (title, req, res) => {
  const { content } = req.body
  return createOrUpdateMeta(title, content, res)
}

// Get Term Equivalences
router.get('/terms', function(req, res) {
  return _getMetaFromTitle('terms')
    // get and parse it
    .then(data => data.content.replace(/\r/g, ''))
    .then(content => content.split(/\n/).map(row => row.split(', ')))
    .then(termEquivalences => res.json({ termEquivalences }))
})

// Terms
router.post('/update/terms', isAuthorized, function(req, res) {
  metaUpdater('terms', req, res)
})

// About
router.post('/update/about', isAuthorized, function(req, res) {
  metaUpdater('about', req, res)
})

// FAQ
router.post('/update/faq', isAuthorized, function (req, res) {
  metaUpdater('faq', req, res)
})

// Blacklist
router.post('/update/blacklist', isAuthorized, function (req, res) {
  metaUpdater('blacklist', req, res)
})

// Update song
router.put('/song/:id', isAuthorized, function(req, res) {
  const { id } = req.params
  const { values } = req.body

  // Update song
  Song.update({ _id: id }, parseSong(values), (err) => {
    if (err) return res.status(400).send(JSON.stringify(err))
    res.sendStatus(200)
  })
})

// Delete song
router.delete('/song/:id', isAuthorized, function(req, res) {
  const { id } = req.params

  Song.remove({ _id: id }, (err) => {
    if (err) return res.status(400).send(err)
    res.sendStatus(200)
  })
})

/**
 * Send contact message
 */
router.post('/contact', async function(req, res) {
  const { email, subject, body } = req.body
  // super basic security
  if (!email || !subject || !body ||
    body.length > 2000 || subject.length > 200 || email.length > 200 ||
    email.indexOf('@') === -1) return res.sendStatus(400)

  try {
    await sgMail.send({
      from: 'bot@soundsdelicious.tv',
      to: 'ron@soundsdelicious.tv',
      replyTo: email,
      subject: subject + ' | Sounds Delicious Music Library Contact Form',
      text: body
    })
  }
  catch (e) {
    console.error(e.response.body)
  }
  res.sendStatus(200)
})

module.exports = router;

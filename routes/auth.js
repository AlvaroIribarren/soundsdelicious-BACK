var express = require('express');
var router = express.Router();

const c = require('../controllers/handler')
const passport = require('passport')
const LocalStrategy = require('passport-local').Strategy
const passportJWT = require('passport-jwt')
const JWTStrategy = passportJWT.Strategy
const ExtractJWT = passportJWT.ExtractJwt
const jwt = require('jsonwebtoken')
const jwtSecret = `sdafn;jlsfgah;lagsd'dfjdasfgih;fwuohewhou;efdfa'PDOF'D` // @TODO L change to secure
const passportOpts = { session: false }

const User =  require('../db/User.js')
const ActivityLog =  require('../db/ActivityLog.js');
const { db } = require('../db/User.js');

/** Get details of currently logged in user */
const getCurrentUser = async (id) => {
  const user = (await User.findById(id))
  delete user.password
  return user
}

/**
 * Register a new user on the platform
 */
const register = async ({ email, password }) => {
  const existingUser = await User.findOne({ email })
  if (existingUser) {
    console.log(existingUser, email)
    throw new Error('Email already exists')
  }
  const newUser = await User.create({
    email,
  })
  newUser.setPassword(password)
  await newUser.save()
  return true
}

/**
 * Track any downloads on site
 */
const trackDownload = async (email, title) => {
  if (!email || !title) return false
  await ActivityLog.create({
    type: 'download',
    email,
    title,
    downloadedAt: new Date(),
  })
  return true
}

/** Auth middleware for login, register */
const authorizeMiddleware = (passport) => {
  /** Passport strategy for all auth */
  passport.use(
    new LocalStrategy(
      {
        usernameField: 'email',
        passwordField: 'password',
        passReqToCallback: true,
      },
      async (req, email, password, done) => {
        try {
          const type = req.url.includes('login') ? 'login' : req.body.type || 'login'

          if (type === 'register') {
            try {
              if (!email || !password) throw new Error
              await register({ email, password })
            } catch (e) {
              console.error(e)
              return done(null, false, { message: 'User already exists' })
            }
          }

          // find and login to the user
          const user = await User.findOne({ email })

          if (!user || !user.validatePassword(password)) {
            return done(null, false, { message: 'Invalid email or password' })
          }

          return done(null, user.toJSON())
        } catch (e) {
          console.error(e)
          return done(e)
        }
      }
    )
  )

  /** Verify token middleware */
  passport.use(
    new JWTStrategy(
      {
        secretOrKey: jwtSecret,
        jwtFromRequest: ExtractJWT.fromAuthHeaderAsBearerToken(),
      },
      async (payload, next) => {
        return next(null, {
          _id: payload._id,
          email: payload.email
        })
      }
    )
  )

  return (req, res, next) => {
    passport.authenticate('local', { session: false }, async (err, user, info) => {
      if (err || !user) {
        console.error(err)
        return res.status(400).json({ message: !!info ? info.message : 'An error occured' })
      }

      req.login(user, { session: false }, async (e) => {
        if (e) {
          console.error(e)
          return res.send(e)
        }
        // only sign the _id
        const token = jwt.sign({
          _id: user._id.toHexString(),
          email: user.email
        }, jwtSecret)
        // but send entire data
        return res.json({ access_token: token })
      })
    })(req, res, next)
  }
}

//
// Routing
//

router.post('/login', authorizeMiddleware(passport))

router.post('/register', authorizeMiddleware(passport))

// Return the currently logged in user
router.get('/user', passport.authenticate('jwt', passportOpts), c(getCurrentUser, (req) => [req.user._id]))

// Download
router.post('/dl/trc', passport.authenticate('jwt', passportOpts), c(trackDownload, (req) => [req.user.email, req.body.title])),


module.exports = router;

const mongoose = require('./db.js')
const crypto = require('crypto')

const userSchema = mongoose.Schema({
  email: {
    type: String,
    required: true,
  },
  hash: String,
  salt: String,
})

userSchema.methods.setPassword = function (password) {
  this.salt = crypto.randomBytes(16).toString('hex')
  this.hash = crypto
    .pbkdf2Sync(password, this.salt, 10000, 512, 'sha512')
    .toString('hex')
}

userSchema.methods.validatePassword = function (password) {
  const hash = crypto
    .pbkdf2Sync(password, this.salt, 10000, 512, 'sha512')
    .toString('hex')
  return this.hash === hash
}

const User = mongoose.model('User', userSchema)

module.exports = User
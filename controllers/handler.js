/**
 * Generic Controller Handler
 *
 * @param {string} tplName The name of Jade template to render
 * @param {function} func Function with promise from controller
 * @param {function} params A function that (optionally) takes (req, res, next) and
 * maps our desired controller parameters
 * @param {boolean} [isApi=false] if is an API request, i.e., don't render
 * any HTML (explicit)
 */
module.exports = (func, params, tplName, isApi = false) => async (
  req,
  res,
  next
) => {
  const boundParams = params ? params(req, res, next) : []

  try {
    const result =
      typeof func === 'function' ? await func(...boundParams) : false
    const data = result || { message: 'OK' }
    if (data.troll || (typeof func === 'string' && func === 'troll-primary')) {
      return res.render('troll-primary')
    }
    if (isApi || !tplName) {
      return res.json(data)
    }
    return res.render(tplName, data)
  } catch (e) {
    console.log(e)
    return res.status(400).send({ message: e.toString() })
  }
}

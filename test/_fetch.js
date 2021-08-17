const fetch = require('node-fetch')
const baseURL = `http://127.0.0.1:${process.env.MICROSERVICE_PORT}`

const config = {
  languageFallback: () => {
    return 'en';
  },
}

require('../').startServer(config)

module.exports = (path, options) => {
  const body = options && options.body
  if (Object.prototype.toString.call(body) === '[object Object]') {
    options.body = JSON.stringify(body)
    options.headers = Object.assign({}, options.headers, {
      'Content-Type': 'application/json'
    })
  }
  return fetch(baseURL + path, options)
}

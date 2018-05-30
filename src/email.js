const AWS = require('aws-sdk')
const juice = require('juice')
const pug = require('pug')
const ejs = require('ejs')
const path = require('path')
const fs = require('fs')
const winston = require('winston')

const createTransport = require('./transport')

module.exports = env => {
  const defaultLanguage = env('DEFAULT_LANGUAGE', 'en')
  const defaultEmailFrom = env('DEFAULT_FROM')
  const templatesDir = env('TEMPLATES_DIR')
  const transporter = createTransport(env)
  const service = {}

  const fullPath = relativePath => path.join(templatesDir, relativePath)

  const fileExists = fullPath => new Promise((resolve, reject) => {
    if (!fullPath.startsWith(templatesDir + path.sep)) return reject(new Error('Invalid template path'))
    fs.access(fullPath, fs.constants.R_OK, err => resolve(!err))
  })

  const renderEjs = (filename, data) => new Promise((resolve, reject) => {
    ejs.renderFile(filename, data, {}, (err, str) => {
      err ? reject(err) : resolve(str)
    })
  })

  const renderPug = (filename, data) => new Promise((resolve, reject) => {
    resolve(pug.renderFile(filename, data))
  })

  const processIfExists = async ({ filename, formatter }, data, func) => {
    const fullPathFile = fullPath(filename);
    const originalPathExists = await fileExists(fullPathFile);
    const alternativeFullPathFile = fullPath(formatter(env('missingLanguageFallback')()));
    const alternativePathExists = await fileExists(alternativeFullPathFile);
    return originalPathExists ?
      func(fullPathFile, data) :
        env('missingLanguageFallback') && alternativePathExists ?
          func(alternativeFullPathFile, data) :
          void 0;
  }

  const formatFullPath = env('formatFunction') ? env('formatFunction') :
    (template, target, format, type, lang) => format ?
      `${lang}/${template}-${target}-${format}.${type}` :
      `${lang}/${template}-${target}.${type}`

  service.processTemplate = (template, templateOptions, lang = defaultLanguage) => {
    const formatPathEjsBody = formatFullPath.bind(null, template, 'body', 'html', 'ejs')
    const formatPathPugBody = formatFullPath.bind(null, template, 'body', 'html', 'pug')
    const formatPathEjsText = formatFullPath.bind(null, template, 'body', 'text', 'ejs')
    const formatPathEjsSubject = formatFullPath.bind(null, template, 'subject', null, 'ejs')
    const pathEjsHtmlBody = formatPathEjsBody(lang)
    const pathPugHtmlBody = formatPathPugBody(lang)
    const pathEjsTextBody = formatPathEjsText(lang)
    const pathEjsSubject = formatPathEjsSubject(lang)

    return Promise.all([
      processIfExists({ filename: pathEjsHtmlBody, formatter: formatPathEjsBody }, templateOptions, renderEjs),
      processIfExists({ filename: pathPugHtmlBody, formatter: formatPathPugBody }, templateOptions, renderPug),
      processIfExists({ filename: pathEjsTextBody, formatter: formatPathEjsText }, templateOptions, renderEjs),
      processIfExists({ filename: pathEjsSubject, formatter: formatPathEjsSubject }, templateOptions, renderEjs)
    ])
    .then(([ejsHtmlBody, pugHtmlBody, ejsTextBody, ejsSubject]) => {
      return {
        subject: (ejsSubject || '').trim(),
        html: juice(ejsHtmlBody || pugHtmlBody || ''),
        text: ejsTextBody
      }
    })
  }

  /*
  // Available mailOptions
  const mailOptions = {
    from: 'Fred Foo ✔ <foo@blurdybloop.com>', // sender address
    to: 'bar@blurdybloop.com, baz@blurdybloop.com', // list of receivers
    subject: 'Hello ✔', // Subject line
    text: 'Hello world ✔', // plaintext body
    html: '<b>Hello world ✔</b>' // html body
  };
  */
  service.sendMail = (mailOptions) => {
    mailOptions.from = mailOptions.from || defaultEmailFrom
    return new Promise((resolve, reject) => {
      transporter.sendMail(mailOptions, (err, info) => {
        if (err) {
          reject(err)
          return winston.error(err)
        }
        resolve(info)
      })
    })
  }

  service.sendTemplatedEmail = (mailOptions, template, templateOptions, lang) => {
    return service.processTemplate(template, templateOptions, lang)
      .then(opts => {
        const options = Object.assign({}, mailOptions, opts)
        return service.sendMail(options)
      })
  }

  return service
}

const mustache = require('mustache')
const punctuation = require('./dictionaries/punctuation')
const synonyms = require('./dictionaries/synonyms')
const excludes = require('./dictionaries/excluded')
const schema = require('./config')

const CONFIG_NAME = 'potential-duplicates.yml'
// How many points remove per missing word (see `compare()`):
const ERROR_ADJ = 0.15

/**
 * This is the main entrypoint to your Probot app
 * @param {import('probot').Application} robot
 */
module.exports = robot => {
  // Your code here
  robot.log('Yay, the app was loaded!')

  robot.on([
    'issues.opened',
    'issues.edited'
  ], async context => {
    const { title, number } = context.payload.issue
    const { error, value } = schema.validate(context.config(CONFIG_NAME))

    if (error) {
      robot.log.fatal(error, 'Invalid config')
    }

    const issueComment = context.issue({ body: 'Thanks for opening this issue: ' + title + ' #' + number })
    return context.github.issues.createComment(issueComment)
  })

  // For more information on building apps:
  // https://probot.github.io/docs/

  // To get your app running against GitHub, see:
  // https://probot.github.io/docs/development/
}

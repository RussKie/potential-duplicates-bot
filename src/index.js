/**
 * Credits for the work go to Bartosz Łaniewski @Bartozzz
 * https://github.com/Bartozzz/potential-duplicates-bot
 */

const mustache = require('mustache')
const punctuation = require('./dictionaries/punctuation')
const synonyms = require('./dictionaries/synonyms')
const excludes = require('./dictionaries/excluded')
const schema = require('./config')

const CONFIG_NAME = 'potential-duplicates.yml'
// How many points remove per missing word (see `compare()`):
const ERROR_ADJ = 0.15

/**
 * Removes punctuation and common words from a given phrase. Additionally, finds
 * and remplaces predefined synonyms for even faster and more accurate results.
 *
 * @param   {string}  phrase
 * @return  {string}
 */
function prepare (phrase) {
  phrase = phrase.toLowerCase()

  for (const punct of punctuation) {
    phrase = phrase.replace(new RegExp(`\\${punct}`, 'g'), ' ')
  }

  for (const word in synonyms) {
    phrase = phrase.replace(new RegExp(synonyms[word].join('|'), 'gi'), word)
  }

  for (const exclude of excludes) {
    phrase = phrase.replace(new RegExp(`\\b${exclude}\\s\\b`, 'g'), '')
  }

  return phrase
}

/**
 * The Damerau–Levenshtein distance between two words is the minimum number of
 * operations (consisting of insertions, deletions or substitutions of a single
 * character, or transposition of two adjacent characters) required to change
 * one word into the other.
 *
 * @see     https://en.wikipedia.org/wiki/Levenshtein_distance
 * @see     https://en.wikipedia.org/wiki/Damerau%E2%80%93Levenshtein_distance
 * @see     https://rosettacode.org/wiki/Levenshtein_distance#JavaScript
 *
 * @param   {string}  a
 * @param   {string}  b
 * @return  {number}
 */
function distance (a, b) {
  const [al, bl] = [a.length, b.length]
  const matrix = []

  if (a === b) return 0
  if (!al) return bl
  if (!bl) return al

  for (let i = 0; i <= al; i++) {
    matrix[i] = []
    matrix[i][0] = i
  }

  for (let j = 0; j <= bl; j++) {
    matrix[0][j] = j
  }

  for (let i = 1; i <= al; i++) {
    for (let j = 1; j <= bl; j++) {
      let cost = a[i - 1] === b[j - 1] ? 0 : 1

      matrix[i][j] = Math.min(
        matrix[i - 1][j + 0] + 1, // deletion
        matrix[i + 0][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost // substitution
      )

      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        matrix[i][j] = Math.min(
          matrix[i + 0][j + 0],
          matrix[i - 2][j - 2] + cost // transposition
        )
      }
    }
  }

  return matrix[al][bl]
}

/**
 * Compares two strings and returns how similar they are. The result is a float
 * in interval [0.0; 1.0].
 *
 * @param   {string}    i
 * @param   {string}    j
 * @return  {float}
 */
function similarity (i, j) {
  const length = Math.max(i.length, j.length)
  return length === 0 ? 1.0 : (length - distance(i, j)) / length
}

/**
 * Compares two phrases and returns how similar they are. The results is a float
 * in interval [0.0; 1.0]. The algorithm works as follows:
 *
 * 1. Preparation:
 *    Common words, punctuation symbols and synonyms are removed. Sentences are
 *    then split into separate words for further analysis. We always operate on
 *    the list which contains less words.
 * 2. Calculations:
 *    For each word in the first phrase, we try to find a analogue in the second
 *    one. This is done using the Damerau–Levenshtein distance algorithm. Words
 *    with the biggest probability of being an analogue are added to the list.
 * 3. Error adjustment:
 *    We calculate the difference between words amount in each phrase. For each
 *    word, we remove a certain probability from the final score. This step is
 *    necessary in situations where the first sentence contains only few word
 *    and direct analogues in the second one. Without error adjustment, this
 *    would give us a result of 1.0. For example:
 *      A: "Testing module foo"
 *      B: "Testing if there's not memory leak in module bar"
 *
 * @todo    include phrase-length difference in the observational error
 *
 * @param   {string}  phraseA
 * @param   {string}  phraseB
 * @return  {float}
 */
function compare (phraseA, phraseB) {
  let wordsA = prepare(phraseA).split(' ')
  let wordsB = prepare(phraseB).split(' ')
  let total = 0

  if (wordsA.length > wordsB.length) {
    [wordsA, wordsB] = [wordsB, wordsA]
  }

  for (const wordA of wordsA) {
    const temp = []
    for (const wordB of wordsB) {
      temp.push(similarity(wordA, wordB))
    }

    total += Math.max.apply(null, temp)
  }

  // Direct score:
  total /= wordsA.length
  // Error adjustment:
  total -= (wordsB.length - wordsA.length) * ERROR_ADJ

  return total
}

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
    if (context.payload.issue.state === 'closed') {
      robot.log('The issue is closed, ignore')
      return
    }

    const { title, number } = context.payload.issue
    const { error, value } = schema.validate(context.config(CONFIG_NAME))

    if (error) {
      robot.log.fatal(error, 'Invalid config')
      return
    }

    try {
      if (title.startsWith('[NBug] ConEmuCD was not loaded')) {
        await notifyFixed('v3.3')
      }

      const startDate = new Date('01 March 2019 00:00 UTC').toISOString()
      const duplicates = []

      await context.github.paginate(
        context.github.issues.listForRepo(context.repo({
          state: 'all',
          per_page: 100,
          since: startDate
        })),
        async page => {
          for (const issue of page.data.filter(i => i.number !== number && i.title.startsWith('[NBug]'))) {
            console.time('compare')
            const accuracy = compare(issue.title, title)
            console.timeEnd('compare')

            // robot.log(`${accuracy}%: #${issue.number} ${issue.title}`)

            if (accuracy >= value.threshold) {
              duplicates.push({
                number: issue.number,
                title: issue.title,
                comments: issue.comments,
                accuracy: parseInt(accuracy * 100),
                shield: buildShield(issue.number, issue.title, issue.comments, parseInt(accuracy * 100))
              })
            }
          }
        })

      if (duplicates.length) {
        console.log(mustache.render(value.referenceComment, {
          issues: duplicates.sort((a, b) => a.number - b.number)
        }))
        await markAsDuplicate(duplicates)
      }
    } catch (error) {
      robot.log.fatal(error, 'Something went wrong!')
    }

    async function notifyFixed (appVersion) {
      const createComment = context.github.issues.createComment(context.issue({
        body: mustache.render(value.fixedInVersionComment, {
          appVersion: appVersion
        })
      }))

      try {
        await Promise.all([createComment])
      } catch (error) {
        robot.log.fatal(error, 'Could not advise issues fixed in version: ' + appVersion)
      }
    }

    /**
     * Marks an issue as duplicate with a corresponding label and adds a comment
     * referencing the duplicated issues.
     *
     * @param   {Array<Object>}   relatedIssues
     * @return  {Promise}
     */
    async function markAsDuplicate (relatedIssues) {
      const addLabel = context.github.issues.addLabels(context.issue({
        labels: [value.issueLabel]
      }))

      const createComment = context.github.issues.createComment(context.issue({
        body: mustache.render(value.referenceComment, {
          issues: relatedIssues
        })
      }))

      try {
        await Promise.all([addLabel, createComment])
      } catch (error) {
        robot.log.fatal(error, 'Could not mark as duplicate!')
      }
    }

    function buildShieldUri (number, title, comments, accuracy) {
      const color = comments < 2 ? 'lightgrey' : comments < 5 ? 'green' : comments < 10 ? 'orange' : 'red'
      const userData = encodeURIComponent(`#${number} ${title.replace('-', '--').replace(' ', '_')}-similarity ${accuracy}% / comments ${comments}`)
      return `https://img.shields.io/badge/${userData}-${color}.svg`
    }

    function buildShield (number, title, comments, accuracy) {
      const url = buildShieldUri(number, title, comments, accuracy)
      return `[![#${number}](${url})](${number})`
    }
  })

  // For more information on building apps:
  // https://probot.github.io/docs/

  // To get your app running against GitHub, see:
  // https://probot.github.io/docs/development/
}

module.exports.distance = distance
module.exports.compare = compare
module.exports.prepare = prepare
module.exports.similarity = similarity

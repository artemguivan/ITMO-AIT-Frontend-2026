const jsonServer = require('json-server')
const auth = require('json-server-auth')
const { execFile } = require('child_process')
const { promisify } = require('util')
const routes = require('./routes.json')

const app = jsonServer.create()
const router = jsonServer.router('db.json')
const middlewares = jsonServer.defaults()
const rules = auth.rewriter(routes)
const PORT = 3000
const LLM_ARENA_URL = 'https://llmarena.ru'
const LLM_ARENA_FN_INDEX = 56
const DEFAULT_CATEGORY = 'site_visitors/medium_prompts'
const DEFAULT_FILTERS = ['Style Control']
const execFileAsync = promisify(execFile)

app.db = router.db
app.use(middlewares)

function stripHtml(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeArenaRows(dataframe) {
  const rows = dataframe && dataframe.value && Array.isArray(dataframe.value.data)
    ? dataframe.value.data
    : []

  return rows.map(function (row, index) {
    return {
      id: index + 1,
      rank: Number(row[0]) || row[0],
      name: stripHtml(row[1]),
      arenaElo: Number(row[2]) || 0,
      confidenceInterval: row[3],
      votes: Number(row[4]) || 0,
      organization: row[5],
      license: row[6],
      knowledgeCutoff: row[7],
      source: LLM_ARENA_URL
    }
  })
}

async function fetchArenaModels() {
  const sessionHash = 'agentics_' + Date.now()
  const payload = {
    data: [DEFAULT_CATEGORY, DEFAULT_FILTERS],
    event_data: null,
    fn_index: LLM_ARENA_FN_INDEX,
    trigger_id: 157,
    session_hash: sessionHash
  }

  const joinResult = await execFileAsync('curl', [
    '-s',
    '-X',
    'POST',
    LLM_ARENA_URL + '/queue/join',
    '-H',
    'Content-Type: application/json',
    '-d',
    JSON.stringify(payload)
  ])
  const joinData = JSON.parse(joinResult.stdout)

  if (!joinData.event_id) {
    throw new Error('llmarena queue join failed')
  }

  const streamResult = await execFileAsync('curl', [
    '-sN',
    LLM_ARENA_URL + '/queue/data?session_hash=' + sessionHash
  ], { maxBuffer: 20 * 1024 * 1024 })
  const streamText = streamResult.stdout
  const events = streamText
    .split('\n\n')
    .filter(function (chunk) { return chunk.startsWith('data: ') })
    .map(function (chunk) { return JSON.parse(chunk.replace(/^data: /, '')) })

  const completedEvent = events.find(function (event) {
    return event.msg === 'process_completed'
  })

  if (!completedEvent || !completedEvent.output || completedEvent.success === false) {
    throw new Error('llmarena returned no leaderboard')
  }

  return normalizeArenaRows(completedEvent.output.data[0])
}

function requireBearerToken(req, res, next) {
  if (!req.headers.authorization) {
    res.status(401).json('Missing authorization header')
    return
  }

  next()
}

app.get('/arenaModels', requireBearerToken, async function (req, res) {
  try {
    const models = await fetchArenaModels()
    res.json(models)
  } catch (error) {
    res.status(502).json({
      error: 'Не удалось загрузить данные llmarena.ru',
      details: error.message
    })
  }
})

app.use(rules)
app.use(auth)
app.use(router)

app.listen(PORT, function () {
  console.log('JSON Server Auth is running on http://localhost:' + PORT) 
  console.log('LLM Arena proxy: http://localhost:' + PORT + '/arenaModels')
})

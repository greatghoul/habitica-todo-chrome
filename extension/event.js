const DONE_PREFIX = /^done:\s*/
const APP_URL = 'https://habitica.com/'
const API_BASE = 'https://habitica.com/api/v3'
const AUTH_URL = 'https://habitica.com/favicon.ico'
const AUTH_CFG = {
  code: 'localStorage.getItem("habit-mobile-settings")',
  runAt: 'document_end'
}

let authoring = false

function notify (title, message) {
  chrome.notifications.create({
    title, message, type: 'basic', iconUrl: 'icon-48.png'
  })
}

function saveTodos (todos) {
  window.localStorage['TODOS'] = JSON.stringify(todos)
}

function loadTodos () {
  return JSON.parse(window.localStorage['TODOS'] || '[]')
}

function authorize () {
  chrome.omnibox.setDefaultSuggestion({ description: 'Authorizing habitica.com, please wait a few seconds ...' })

  return new Promise((resolve, reject) => {
    chrome.tabs.create({ url: AUTH_URL, active: false }, (tab) => {
      chrome.tabs.executeScript(tab.id, AUTH_CFG, function (results) {
        try {
          const auth = JSON.parse(results[0]).auth
          window.localStorage['API_ID'] = auth.apiId
          window.localStorage['API_KEY'] = auth.apiToken
          chrome.tabs.remove(tab.id)
          resolve()
        } catch (e) {
          console.log('Failed to authorize', e)
          reject(e)
          chrome.tabs.update(tab.id, { url: APP_URL, active: true })
        }
      })
    })
  })
}

function requestApi (endpoint, init) {
  const headers = new window.Headers()
  headers.append('ACCEPT', 'application/json')
  headers.append('Content-Type', 'application/json;charset=UTF-8')
  headers.append('x-client', 'Habitica Omnibox Todos')
  headers.append('x-api-user', window.localStorage['API_ID'])
  headers.append('x-api-key', window.localStorage['API_KEY'])

  return window.fetch(
    API_BASE + endpoint,
    Object.assign({ headers, mode: 'cors' }, init || {})
  ).then(resp => resp.json())
}

function buildDescription (description, keyword) {
  let highlight = _.escape(keyword)
  let markedHighlight = `<match><url>${highlight}</url></match>`
  return _.chain(description).escape().replace(highlight, markedHighlight).value()
}

function filteredTodos (text) {
  return _.chain(loadTodos()).map(todo => {
    if (todo.text.toLowerCase().indexOf(text.toLowerCase()) !== -1) {
      return {
        content: `done: ${todo.text}`,
        description: `<match>done:</match> ${buildDescription(todo.text, text)}`
      }
    } else {
      return null
    }
  }).compact().value()
}

function fetchTodos () {
  return requestApi('/tasks/user?type=todos').then(result => saveTodos(result.data))
}

function fetchSuggestions (text, suggest) {
  chrome.omnibox.setDefaultSuggestion({ description: '<url>Hint:</url> Submit anything to create a new todo.' })

  if (loadTodos().length) {
    suggest(filteredTodos(text))
  } else {
    fetchTodos().then(() => suggest(filteredTodos(text))).catch(() => suggest([]))
  }
}

function createTodo (text) {
  console.log(`Creating new todo: %c${text}`, 'color: blue')

  const payload = JSON.stringify({ text, type: 'todo' })
  return requestApi('/tasks/user', { method: 'POST', body: payload })
           .then(result => result.data)
}

function completeTodo (todo) {
  console.log(`Completing todo %c${todo.text}`, 'color: blue')
  console.log(todo)

  return requestApi(`/tasks/${todo.id}/score/up`, { method: 'POST' })
           .then(() => notify('TODO COMPLETED', todo.text))
           .then(() => fetchTodos())
}

function findTodo (text) {
  return _.find(loadTodos(), todo => _.trim(todo.text) === text)
}

// Fetch live todos on start
function inputStartedHandler () {
  if ('API_KEY' in window.localStorage) {
    fetchTodos()
  }
}

function inputChangedHandler (text, suggest) {
  if ('API_KEY' in window.localStorage) {
    fetchSuggestions(text, suggest)
  } else if (!authoring) {
    authoring = true
    authorize().then(() => fetchSuggestions(text, suggest))
  }
}

function inputEnteredHandler (content, x) {
  let text = _.trim(content)

  if (DONE_PREFIX.test(text)) {
    // If the input if prefixed by `done:`, find or create the todo by
    // input text, and then mark it as done.
    text = text.replace(DONE_PREFIX, '')
    const todo = findTodo(text)
    if (todo) {
      completeTodo(todo)
    } else {
      createTodo(text).then(todo => completeTodo(todo))
    }
  } else {
    createTodo(text)
      .then(() => notify('TODO CREATED', text))
      .then(() => fetchTodos())
  }
}

function installedHandler () {
  notify('WELCOME', 'Type `ht` in address bar then hit <tab> to play with Habitica Omnibox')
}

chrome.omnibox.onInputStarted.addListener(inputStartedHandler)
chrome.omnibox.onInputChanged.addListener(inputChangedHandler)
chrome.omnibox.onInputEntered.addListener(inputEnteredHandler)
chrome.runtime.onInstalled.addListener(installedHandler)

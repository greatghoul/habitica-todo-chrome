const APP_URL = 'https://habitica.com/'
const API_BASE = 'https://habitica.com/api/v3'
const AUTH_URL = 'https://habitica.com/favicon.ico'
const AUTH_CFG = {
  code: 'localStorage.getItem("habit-mobile-settings")',
  runAt: 'document_end'
}

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
          console.log(e)
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

function filterTodos (text) {
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

function fetchTodos (text, suggest) {
  chrome.omnibox.setDefaultSuggestion({ description: '<url>Hint:</url> Submit anything to create a new todo.' })

  if (loadTodos().length) {
    suggest(filterTodos(text))
  } else {
    requestApi('/tasks/user?type=todos')
      .then(result => saveTodos(result.data))
      .then(() => suggest(filterTodos(text)))
      .catch(() => suggest([]))
  }
}

function createTodo (text) {
  const payload = JSON.stringify({ text, type: 'todo' })
  requestApi('/tasks/user', { method: 'POST', body: payload })
    .then(result => result.success && notify('TODO CREATED', text))
}

function inputChangedHandler (text, suggest) {
  if ('API_KEY' in window.localStorage) {
    fetchTodos(text, suggest)
  } else {
    authorize().then(() => fetchTodos(text, suggest))
  }
}

function inputEnteredHandler (content) {
  createTodo(content)
}

chrome.omnibox.onInputChanged.addListener(inputChangedHandler)
chrome.omnibox.onInputEntered.addListener(inputEnteredHandler)

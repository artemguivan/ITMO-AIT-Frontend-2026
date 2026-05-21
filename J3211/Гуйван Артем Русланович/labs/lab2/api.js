const API_URL = 'http://localhost:3000'
const TOKEN_KEY = 'agentics_token'
const USER_KEY = 'agentics_user'

function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

function saveSession(accessToken, user) {
  localStorage.setItem(TOKEN_KEY, accessToken)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

function clearSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

function authHeaders() {
  const token = getToken()
  return token ? { Authorization: 'Bearer ' + token } : {}
}

async function request(path, options) {
  const response = await fetch(API_URL + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...(options && options.headers ? options.headers : {})
    }
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(message.replace(/^"|"$/g, '') || 'Ошибка API')
  }

  return response.json()
}

function requireAuth() {
  if (!getToken()) {
    location.href = 'main.html'
  }
}

function logout() {
  clearSession()
  location.href = 'main.html'
}

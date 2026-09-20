import { createServer } from 'node:http'
import express from 'express'
import { WebSocketServer } from 'ws'

const app = express()
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})
app.use(express.json())
const server = createServer(app)
const wss = new WebSocketServer({ server })
const rooms = new Map()

app.get('/health', (_req, res) => res.json({ ok: true, rooms: rooms.size }))
app.post('/api/rooms', (req, res) => {
  const requestedRoomId = String(req.body?.roomId || '').trim().toUpperCase()
  const roomId = requestedRoomId || createRoomId()
  if (!/^[A-Z0-9-]{4,24}$/.test(roomId)) return res.status(400).json({ error: 'Room ID must be 4-24 letters, numbers, or hyphens.' })
  if (rooms.has(roomId)) return res.status(409).json({ error: 'That room ID is already in use.' })
  const room = getRoom(roomId)
  room.name = String(req.body?.name || 'Sunday evening watch').trim().slice(0, 80) || 'Sunday evening watch'
  res.status(201).json({ roomId, roomName: room.name })
})

function getRoom(roomId) {
  if (!rooms.has(roomId)) rooms.set(roomId, { name: 'Sunday evening watch', videoId: 'dQw4w9WgXcQ', title: 'The art of slow living in a fast world', playing: false, position: 42, users: new Map(), messages: [], requests: new Map() })
  return rooms.get(roomId)
}

function createRoomId() {
  let roomId
  do roomId = `${Math.random().toString(36).slice(2, 8).toUpperCase()}-${Math.floor(10 + Math.random() * 90)}`
  while (rooms.has(roomId))
  return roomId
}

function send(ws, payload) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(payload)) }
function publicState(room, selfId) { return { type: 'sync_state', selfId, roomName: room.name, videoId: room.videoId, title: room.title, playing: room.playing, position: room.position, messages: room.messages, participants: [...room.users.values()].map(({ ws, ...user }) => user), requests: [...room.requests.values()] } }
function broadcast(room, type = 'sync_state') { room.users.forEach((user) => send(user.ws, { ...publicState(room, user.id), type })) }
function canControl(user) { return user?.role === 'Host' || user?.role === 'Moderator' }
function removeUser(room, userId) { const user = room.users.get(userId); if (!user) return; room.users.delete(userId); room.requests.forEach((request, id) => { if (request.userId === userId) room.requests.delete(id) }) }

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    let event
    try { event = JSON.parse(raw.toString()) } catch { return send(ws, { type: 'error', message: 'Invalid event.' }) }
    const roomId = String(event.roomId || '').trim().toUpperCase()
    if (event.type === 'join_room') {
      const room = rooms.get(roomId)
      if (!room) return send(ws, { type: 'error', code: 'room_not_found', message: 'That room does not exist. Check the room ID or create a new room.' })
      const id = String(event.userId || Math.random().toString(36).slice(2, 9))
      const existingUser = room.users.get(id)
      const user = existingUser || { id, name: event.username || 'Guest', role: room.users.size === 0 ? 'Host' : 'Participant', color: '#89a4d8', online: true, ws }
      user.name = event.username || user.name
      user.online = true
      user.ws = ws
      room.users.set(id, user); ws.userId = id; ws.roomId = roomId; send(ws, publicState(room, id)); broadcast(room, 'user_joined'); return
    }
    const room = rooms.get(roomId)
    const user = room?.users.get(ws.userId)
    if (!user) return send(ws, { type: 'error', message: 'Join a room first.' })
    const controlEvents = ['play', 'pause', 'seek', 'change_video']
    if (controlEvents.includes(event.type) && !canControl(user)) return send(ws, { type: 'error', message: 'Only hosts and moderators can control playback.' })
    if (event.type === 'play') { room.playing = true; room.position = Number(event.position) || room.position }
    if (event.type === 'pause') { room.playing = false; room.position = Number(event.position) || room.position }
    if (event.type === 'seek') room.position = Math.max(0, Number(event.position) || 0)
    if (event.type === 'change_video') { room.videoId = String(event.videoId); room.title = String(event.title || 'A new shared video'); room.position = 0; room.playing = false }
    if (event.type === 'rename_room' && user.role === 'Host') room.name = String(event.name || '').trim().slice(0, 80) || room.name
    if (event.type === 'assign_role' && user.role === 'Host') { const target = room.users.get(event.userId); if (target && ['Participant', 'Moderator'].includes(event.role)) target.role = event.role }
    if (event.type === 'remove_participant' && user.role === 'Host') { const target = room.users.get(event.userId); if (target) { send(target.ws, { type: 'participant_removed' }); target.ws.close(); removeUser(room, event.userId) } }
    if (event.type === 'transfer_host' && user.role === 'Host') { const target = room.users.get(event.userId); if (target) { user.role = 'Moderator'; target.role = 'Host' } }
    if (event.type === 'request_control' && user.role === 'Participant') { const request = { id: Math.random().toString(36).slice(2, 9), userId: user.id, username: user.name, action: event.action, payload: event.payload || {} }; room.requests.set(request.id, request) }
    if (event.type === 'approve_request' && canControl(user)) { const request = room.requests.get(event.requestId); if (request) { room.requests.delete(request.id); if (event.approved) { if (request.action === 'play') room.playing = true; if (request.action === 'pause') room.playing = false; if (request.action === 'seek') room.position = Math.max(0, Number(request.payload.position) || 0); if (request.action === 'change_video') { room.videoId = String(request.payload.videoId); room.title = String(request.payload.title || 'A new shared video'); room.position = 0 } } } }
    if (event.type === 'chat_message' && String(event.message || '').trim()) {
      room.messages.push({ id: Math.random().toString(36).slice(2, 9), name: user.name, message: String(event.message).trim(), time: 'Now', color: user.color })
      broadcast(room, 'chat_message')
      return
    }
    if (event.type === 'leave_room') {
      const anotherOnlineUser = [...room.users.values()].some((roomUser) => roomUser.id !== user.id && roomUser.online)
      if (user.role === 'Host' && anotherOnlineUser) return send(ws, { type: 'error', code: 'host_transfer_required', message: 'Transfer Host to another participant before leaving.' })
      removeUser(room, user.id); broadcast(room, 'user_left'); return ws.close()
    }
    broadcast(room)
  })
  ws.on('close', () => {
    const room = rooms.get(ws.roomId)
    const user = room?.users.get(ws.userId)
    if (!room || !user || user.ws !== ws) return
    user.ws = null
    user.online = false
    broadcast(room, 'user_left')
    setTimeout(() => {
      if (room.users.get(user.id)?.ws === null) {
        removeUser(room, user.id)
        if (room.users.size) broadcast(room, 'user_left')
        else rooms.delete(ws.roomId)
      }
    }, 30000)
  })
})

const port = Number(process.env.PORT || 8080)
server.listen(port, () => console.log(`Watch party WebSocket server listening on port ${port}`))

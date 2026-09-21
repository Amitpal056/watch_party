import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Copy, Crown, Link2, LogOut, MessageCircle, MoreHorizontal, Play, Send, Settings2, Shield, SkipBack, SkipForward, Sparkles, UserMinus, Users, Volume2, X } from 'lucide-react'

const demoParticipants = [
  { id: 'you', name: 'You', role: 'Host', color: '#e78961', online: true },
  { id: 'maya', name: 'Maya Chen', role: 'Moderator', color: '#89a4d8', online: true },
  { id: 'jon', name: 'Jon Bell', role: 'Participant', color: '#c6a05d', online: true },
  { id: 'ravi', name: 'Ravi Shah', role: 'Participant', color: '#8cbb9a', online: false },
]

const initialRoom = {
  roomName: 'Sunday evening watch',
  videoId: 'dQw4w9WgXcQ',
  title: 'The art of slow living in a fast world',
  playing: false,
  position: 226,
  participants: demoParticipants,
  messages: [
    { id: '1', name: 'Maya Chen', message: 'This intro is beautiful.', time: '9:41 PM', color: '#89a4d8' },
    { id: '2', name: 'You', message: 'Right? The whole film feels so calm.', time: '9:42 PM', color: '#e78961' },
  ],
}

const clientId = sessionStorage.getItem('gather-client-id') || crypto.randomUUID()
sessionStorage.setItem('gather-client-id', clientId)
const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080'
const websocketUrl = apiUrl.replace(/^http/, 'ws')

function App() {
  const [room, setRoom] = useState(initialRoom)
  const [roomCode, setRoomCode] = useState(() => localStorage.getItem('gather-room-code') || '')
  const [roomName, setRoomName] = useState(() => localStorage.getItem('gather-room-name') || '')
  const [joined, setJoined] = useState(() => Boolean(localStorage.getItem('gather-room-code')))
  const [creatingRoom, setCreatingRoom] = useState(false)
  const [username, setUsername] = useState(() => sessionStorage.getItem('gather-username') || 'You')
  const [selfId, setSelfId] = useState('you')
  const [duration, setDuration] = useState(539)
  const [pendingRequests, setPendingRequests] = useState([])
  const [roomError, setRoomError] = useState('')
  const [urlInput, setUrlInput] = useState('https://youtu.be/dQw4w9WgXcQ')
  const [message, setMessage] = useState('')
  const [copied, setCopied] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [socket, setSocket] = useState(null)
  const playerRef = useRef(null)
  const playerApiRef = useRef(null)
  const playerReadyRef = useRef(false)
  const roomStateRef = useRef(room)
  roomStateRef.current = room

  const currentUser = room.participants.find((person) => person.id === selfId)
  const canControl = useMemo(() => currentUser?.role === 'Host' || currentUser?.role === 'Moderator', [currentUser])
  const activeCount = room.participants.filter((person) => person.online).length

  useEffect(() => {
    if (!joined) return undefined
    if (!window.YT) {
      const script = document.createElement('script')
      script.id = 'youtube-iframe-api'
      script.src = 'https://www.youtube.com/iframe_api'
      document.body.appendChild(script)
    }
    const createPlayer = () => {
      if (!playerRef.current || playerApiRef.current) return
      playerApiRef.current = new window.YT.Player(playerRef.current, {
        videoId: room.videoId,
        playerVars: { rel: 0, playsinline: 1 },
        events: {
          onReady: (event) => {
            playerReadyRef.current = true
            setDuration(event.target.getDuration() || 539)
            event.target.getIframe().setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture')
            const latestRoom = roomStateRef.current
            if (event.target.getVideoData()?.video_id !== latestRoom.videoId) event.target.loadVideoById(latestRoom.videoId, latestRoom.position)
            window.setTimeout(() => {
              if (roomStateRef.current.playing) {
                if (!canControl) event.target.mute()
                event.target.playVideo()
              }
              else event.target.pauseVideo()
            }, 1200)
          },
          onStateChange: (event) => {
            const currentDuration = event.target.getDuration()
            if (currentDuration > 0) setDuration(currentDuration)
            if (roomStateRef.current.playing && [window.YT.PlayerState.CUED, window.YT.PlayerState.BUFFERING, window.YT.PlayerState.PAUSED].includes(event.data)) {
              window.setTimeout(() => {
                if (!canControl) event.target.mute()
                event.target.playVideo()
              }, 250)
            }
          },
        },
      })
    }
    if (window.YT?.Player) createPlayer()
    else window.onYouTubeIframeAPIReady = createPlayer
    return () => { window.onYouTubeIframeAPIReady = null }
  }, [joined])

  useEffect(() => {
    if (!playerReadyRef.current || !playerApiRef.current) return
    const player = playerApiRef.current
    const videoChanged = player.getVideoData()?.video_id !== room.videoId
    if (videoChanged) player.loadVideoById(room.videoId, room.position)
    else player.seekTo(room.position, true)
    const applyPlayback = () => {
      if (roomStateRef.current.playing) {
        if (!canControl) player.mute()
        player.playVideo()
      }
      else player.pauseVideo()
    }
    if (videoChanged) {
      const timers = [700, 1400, 2200].map((delay) => window.setTimeout(applyPlayback, delay))
      const durationTimers = [500, 1200, 2200].map((delay) => window.setTimeout(() => {
        const currentDuration = player.getDuration()
        if (currentDuration > 0) setDuration(currentDuration)
      }, delay))
      return () => {
        timers.forEach((timer) => window.clearTimeout(timer))
        durationTimers.forEach((timer) => window.clearTimeout(timer))
      }
    }
    applyPlayback()
  }, [room.videoId, room.playing, room.position])

  useEffect(() => {
    if (!joined) return undefined
    const connection = new WebSocket(websocketUrl)
    connection.onopen = () => connection.send(JSON.stringify({ type: 'join_room', roomId: roomCode, username, userId: clientId }))
    connection.onmessage = (event) => {
      const payload = JSON.parse(event.data)
      if (payload.type === 'error') {
        setRoomError(payload.message)
        if (payload.code === 'room_not_found' || payload.code === 'participant_removed') {
          localStorage.removeItem('gather-room-code')
          localStorage.removeItem('gather-room-name')
          setJoined(false)
        }
        return
      }
      if (payload.type === 'participant_removed') {
        localStorage.removeItem('gather-room-code')
        localStorage.removeItem('gather-room-name')
        setRoomError('You were removed from this room by the Host.')
        setJoined(false)
        return
      }
      if (payload.selfId) setSelfId(payload.selfId)
      if (payload.requests) setPendingRequests(payload.requests)
      if (payload.type === 'sync_state' || payload.type === 'user_joined' || payload.type === 'user_left' || payload.type === 'chat_message') setRoom((current) => ({ ...current, ...payload }))
    }
    connection.onerror = () => setSocket(null)
    setSocket(connection)
    return () => connection.close()
  }, [roomCode, joined, username])

  const emit = (type, payload = {}) => {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type, roomId: roomCode, ...payload }))
  }

  const togglePlayback = () => {
    if (!canControl) return emit('request_control', { action: room.playing ? 'pause' : 'play', payload: { position: room.position } })
    const playing = !room.playing
    setRoom((current) => ({ ...current, playing }))
    emit(playing ? 'play' : 'pause', { position: room.position })
  }

  const seek = (position) => {
    if (!canControl) return emit('request_control', { action: 'seek', payload: { position } })
    setRoom((current) => ({ ...current, position }))
    emit('seek', { position })
  }

  const changeVideo = () => {
    const match = urlInput.match(/(?:v=|youtu\.be\/|embed\/)([\w-]{6,})/)
    const videoId = match?.[1]
    if (!videoId) return
    if (!canControl) return emit('request_control', { action: 'change_video', payload: { videoId, title: 'A new shared video' } })
    setRoom((current) => ({ ...current, videoId, title: 'A new shared video' }))
    emit('change_video', { videoId, title: 'A new shared video' })
  }

  const sendMessage = () => {
    if (!message.trim()) return
    const next = { id: crypto.randomUUID(), name: 'You', message: message.trim(), time: 'Now', color: '#e78961' }
    setRoom((current) => ({ ...current, messages: [...current.messages, next] }))
    emit('chat_message', { message: next.message })
    setMessage('')
  }

  const copyInvite = async () => {
    await navigator.clipboard?.writeText(`${window.location.origin}/room/${roomCode}`)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  const updateRole = (id, role) => {
    setRoom((current) => ({ ...current, participants: current.participants.map((person) => person.id === id ? { ...person, role } : person) }))
    emit('assign_role', { userId: id, role })
  }

  const removeParticipant = (id) => {
    setRoom((current) => ({ ...current, participants: current.participants.filter((person) => person.id !== id) }))
    emit('remove_participant', { userId: id })
  }

  const transferHost = (id) => {
    setRoom((current) => ({ ...current, participants: current.participants.map((person) => person.id === selfId ? { ...person, role: 'Moderator' } : person.id === id ? { ...person, role: 'Host' } : person) }))
    emit('transfer_host', { userId: id })
  }

  const approveRequest = (requestId, approved) => emit('approve_request', { requestId, approved })

  const createRoom = async () => {
    try {
      setRoomError('')
      const response = await fetch(`${apiUrl}/api/rooms`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roomId: roomCode, name: roomName }) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || `Room service unavailable (${response.status})`)
      setRoomCode(data.roomId)
      setRoomName(data.roomName)
      localStorage.setItem('gather-room-code', data.roomId)
      localStorage.setItem('gather-room-name', data.roomName)
      setJoined(true)
    } catch (error) {
      setRoomError(error instanceof Error ? error.message : 'Unable to create room.')
    }
  }

  const leaveRoom = () => {
    const anotherOnlineParticipant = room.participants.some((person) => person.id !== selfId && person.online)
    if (currentUser?.role === 'Host' && anotherOnlineParticipant) {
      setRoomError('Transfer Host to another participant before leaving.')
      return
    }
    emit('leave_room')
    localStorage.removeItem('gather-room-code')
    setJoined(false)
    setRoomCode('')
    setRoomName('')
    localStorage.removeItem('gather-room-name')
    setPendingRequests([])
  }

  const renameRoom = () => {
    if (!roomName.trim() || currentUser?.role !== 'Host') return
    setRoom((current) => ({ ...current, roomName: roomName.trim() }))
    localStorage.setItem('gather-room-name', roomName.trim())
    emit('rename_room', { name: roomName.trim() })
  }

  const joinRoom = () => {
    if (!roomCode.trim()) return setRoomError('Enter a room ID or create a new room.')
    localStorage.setItem('gather-room-code', roomCode)
    localStorage.setItem('gather-room-name', '')
    sessionStorage.setItem('gather-username', username.trim() || 'Guest')
    setJoined(true)
  }

  if (!joined) return <Landing roomCode={roomCode} setRoomCode={setRoomCode} roomName={roomName} setRoomName={setRoomName} username={username} setUsername={setUsername} creatingRoom={creatingRoom} setCreatingRoom={setCreatingRoom} setRoomError={setRoomError} onJoin={joinRoom} onCreate={createRoom} error={roomError} />

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark"><Sparkles size={16} /></span><span>gather</span></div>
        <div className="room-context"><span className="live-dot" /> <span>{room.roomName}</span><strong>{roomCode}</strong><button className="icon-button tiny" onClick={copyInvite} title="Copy invite link">{copied ? <Check size={15} /> : <Copy size={15} />}</button></div>
        <div className="top-actions"><button className="secondary-button" onClick={copyInvite}><Link2 size={15} /> Invite</button><button className="secondary-button leave-button" onClick={leaveRoom}><LogOut size={15} /> Leave room</button><button className="icon-button" onClick={() => setShowSettings(!showSettings)} title="Room settings"><Settings2 size={17} /></button><div className="avatar you-avatar">{(username || 'Y').charAt(0).toUpperCase()}</div></div>
      </header>
      {roomError && <div className="room-toast">{roomError}<button className="icon-button tiny" onClick={() => setRoomError('')}><X size={14} /></button></div>}

      <main className="workspace">
        <section className="content-column">
          <div className="eyebrow"><span className="status-pill"><span className="live-dot" /> Live room</span><span className="muted">Started by You · 9:28 PM</span></div>
          <div className="video-frame">
            <div ref={playerRef} id="youtube-player" title="Shared YouTube video" />
            <div className="video-overlay"><span className="sync-badge"><span className="sync-pulse" /> Synced for everyone</span></div>
          </div>
          <div className="video-meta"><div><h1>{room.title}</h1><p>Shared from YouTube · 8 min watch</p></div><button className="icon-button" title="More video options"><MoreHorizontal size={19} /></button></div>
          <div className={`player-controls ${!canControl ? 'locked' : ''}`}>
            <button className="play-button" onClick={togglePlayback} title={canControl ? 'Play or pause' : 'Only hosts and moderators can control playback'}>{room.playing ? <span className="pause-icon">Ⅱ</span> : <Play fill="currentColor" size={18} />}</button>
            <div className="timeline-wrap"><input aria-label="Video position" type="range" min="0" max={duration} value={room.position} onChange={(event) => seek(Number(event.target.value))} /><div className="time-labels"><span>{formatTime(room.position)}</span><span>{formatTime(duration)}</span></div></div>
            <button className="control-icon" title="Volume"><Volume2 size={17} /></button><button className="control-icon" title="Skip forward"><SkipForward size={17} /></button>
          </div>
          {!canControl && <p className="permission-note"><Shield size={14} /> You are watching as a Participant. Ask a moderator to change the video or playback.</p>}
          <div className="next-video-panel"><div><span className="section-kicker">Up next</span><h2>What should we watch next?</h2><p>Drop a YouTube link and the room can vote on it.</p></div><div className="url-input"><Link2 size={16} /><input value={urlInput} onChange={(event) => setUrlInput(event.target.value)} placeholder="Paste a YouTube link" disabled={!canControl} /><button onClick={changeVideo} disabled={!canControl}>Set video</button></div></div>
        </section>

        <aside className="sidebar">
          <div className="sidebar-heading"><div><span className="section-kicker">The room</span><h2>{activeCount} people watching</h2></div><button className="icon-button" onClick={copyInvite} title="Invite people"><Users size={18} /></button></div>
          <div className="participant-list">{room.participants.map((person) => <ParticipantRow key={person.id} person={person} isHost={person.id === selfId} canManage={currentUser?.role === 'Host'} onRoleChange={updateRole} onRemove={removeParticipant} onTransferHost={transferHost} />)}</div>
          {currentUser?.role !== 'Participant' && pendingRequests.length > 0 && <div className="request-panel"><div className="request-title"><Shield size={14} /><span>Requests to approve</span></div>{pendingRequests.map((request) => <div className="request-row" key={request.id}><span><strong>{request.username}</strong> wants to {request.action.replace('_', ' ')}</span><span className="request-actions"><button onClick={() => approveRequest(request.id, true)}><Check size={13} /></button><button onClick={() => approveRequest(request.id, false)}><X size={13} /></button></span></div>)}</div>}
          <div className="chat-section"><div className="chat-heading"><span className="section-kicker">Room chat</span><MessageCircle size={16} /></div><div className="messages">{room.messages.map((item) => <div className="message" key={item.id}><div className="message-avatar" style={{ background: item.color }}>{item.name.charAt(0)}</div><div><div className="message-info"><strong>{item.name}</strong><span>{item.time}</span></div><p>{item.message}</p></div></div>)}</div><div className="chat-compose"><input value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && sendMessage()} placeholder="Say something..." /><button onClick={sendMessage} title="Send message"><Send size={16} /></button></div></div>
        </aside>
      </main>
      {showSettings && <div className="settings-popover"><div className="popover-heading"><strong>Room settings</strong><button className="icon-button tiny" onClick={() => setShowSettings(false)}><X size={15} /></button></div><label>Room name<input value={roomName || room.roomName} onChange={(event) => setRoomName(event.target.value)} disabled={currentUser?.role !== 'Host'} /></label>{currentUser?.role === 'Host' && <button className="save-room-button" onClick={renameRoom}>Save room name</button>}<label className="toggle-row"><span>Anyone with the link can join</span><input type="checkbox" defaultChecked /></label></div>}
    </div>
  )
}

function ParticipantRow({ person, isHost, canManage, onRoleChange, onRemove, onTransferHost }) {
  return <div className="participant-row"><div className="participant-avatar" style={{ background: person.color }}>{person.name.charAt(0)}</div><div className="participant-details"><strong>{person.name}{isHost && <span className="you-label">you</span>}</strong><span className={`role ${person.role.toLowerCase()}`}>{person.role === 'Host' && <Crown size={11} />}{person.role === 'Moderator' && <Shield size={11} />}{person.role}</span></div><span className={`presence ${person.online ? 'online' : ''}`} title={person.online ? 'Online' : 'Away'} />{canManage && !isHost && <div className="participant-actions"><select value={person.role} onChange={(event) => onRoleChange(person.id, event.target.value)} aria-label={`Role for ${person.name}`}><option>Participant</option><option>Moderator</option></select><button className="icon-button tiny host-action" onClick={() => onTransferHost(person.id)} title={`Make ${person.name} host`}><Crown size={14} /></button><button className="icon-button tiny danger" onClick={() => onRemove(person.id)} title={`Remove ${person.name}`}><UserMinus size={14} /></button></div>}</div>
}

function Landing({ roomCode, setRoomCode, roomName, setRoomName, username, setUsername, creatingRoom, setCreatingRoom, setRoomError, onJoin, onCreate, error }) { return <div className="landing"><div className="landing-orbit orbit-one" /><div className="landing-orbit orbit-two" /><div className="landing-card"><div className="brand landing-brand"><span className="brand-mark"><Sparkles size={16} /></span><span>gather</span></div><span className="section-kicker">A quieter way to watch together</span><h1>Make room for a good film.</h1><p>Bring your people, press play, and let the evening unfold in sync.</p><div className="join-box"><label>Your name<input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="e.g. Maya" /></label><label>Room ID or invite link<input value={roomCode} onChange={(event) => setRoomCode(event.target.value.toUpperCase())} placeholder="e.g. SUNSET-42" /></label><button className="primary-button" onClick={onJoin}>Enter room <ChevronDown size={16} className="rotate-270" /></button></div>{creatingRoom && <div className="create-fields"><label>Room name<input value={roomName} onChange={(event) => setRoomName(event.target.value)} placeholder="e.g. Sunday film club" autoFocus /></label><label>Custom Room ID <span className="optional-label">optional</span><input value={roomCode} onChange={(event) => setRoomCode(event.target.value.toUpperCase())} placeholder="leave blank to generate" /></label><div className="create-actions"><button className="primary-button" onClick={onCreate}>Create room</button><button className="cancel-button" onClick={() => { setCreatingRoom(false); setRoomName(''); }}>Cancel</button></div></div>}{!creatingRoom && <button className="create-room-button" onClick={() => { setRoomError(''); setCreatingRoom(true); }}>Create a new room</button>}{error && <p className="room-error">{error}</p>}<div className="landing-foot"><span><span className="live-dot" /> No account needed</span><span><Shield size={14} /> Host-controlled</span></div></div></div> }

function formatTime(seconds) { const minutes = Math.floor(seconds / 60); const remaining = Math.floor(seconds % 60); return `${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}` }

export default App

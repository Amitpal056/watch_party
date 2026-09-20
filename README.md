# Gather Watch Party

A real-time YouTube watch party where people join a room, watch the same video, chat, and manage playback together.

## Live Demo

- Frontend: https://watchpartyamit.netlify.app/
- Backend health check: https://watch-party-backend-dk9f.onrender.com/health
- GitHub: https://github.com/Amitpal056/watch_party

The Render backend currently stores rooms in memory. Rooms and chat messages are cleared when the backend restarts or sleeps.

## Features

- Create rooms with a custom name and optional room ID
- Join existing rooms by room ID
- YouTube video embedding with synchronized video, play, pause, and seek state
- WebSocket communication between all room participants
- Host, Moderator, and Participant roles
- Host role assignment and participant removal
- Participant playback requests for Host or Moderator approval
- Host transfer before leaving an active room
- Synchronized room chat
- Room-name editing by the Host
- Refresh-safe client identity and room reconnect behavior
- Responsive React interface

## Technology Stack

- React and Vite
- JavaScript and JSX
- Node.js and Express
- `ws` WebSocket server
- YouTube IFrame Player API
- Netlify frontend deployment
- Render backend deployment

## Run Locally

### Requirements

- Node.js 18 or newer
- npm

### Install dependencies

```bash
npm install
```

### Start frontend and backend together

```bash
npm run dev
```

This starts:

- Vite frontend: http://localhost:5173
- Node/WebSocket backend: http://localhost:8080

### Run separately

Terminal 1:

```bash
npm run server
```

Terminal 2:

```bash
npm run dev -- --host localhost --port 5173
```

### Local environment variable

Create `.env.local` if you want to make the backend URL explicit:

```env
VITE_API_URL=http://localhost:8080
```

The frontend falls back to `http://localhost:8080` when this variable is not set.

## Deployment

### Backend on Render

Create a Render Web Service connected to this repository.

```text
Build command: npm install
Start command: npm run server
Health check path: /health
```

Render supplies the `PORT` environment variable automatically. The backend uses it and falls back to port `8080` locally.

### Frontend on Netlify

Create a Netlify site from the GitHub repository.

```text
Build command: npm run build
Publish directory: dist
```

Add this Netlify environment variable:

```text
VITE_API_URL=https://watch-party-backend-dk9f.onrender.com
```

After changing the variable, trigger a new deploy. Vite embeds `VITE_API_URL` during the build, so an old deployment will continue using its previous value.

The `netlify.toml` file configures the build and redirects client-side routes to `index.html`.

## Architecture Overview

The React client opens a WebSocket connection to the Node backend after joining a room. The backend keeps the authoritative room state: current video ID, playback status, playback position, participants, roles, pending requests, and chat messages.

```text
Browser A (Host)                 Render Node backend                 Browser B (Participant)
       |                                  |                                  |
       | -- join_room -----------------> |                                  |
       |                                  | <------------- join_room -------- |
       | -- play / seek / change_video -> |                                  |
       |                                  | -- sync_state -----------------> |
       | <----------- sync_state -------- |                                  |
       | -- chat_message ---------------> | -- chat_message ----------------> |
```

The server validates permissions before applying events:

- Host and Moderator can play, pause, seek, and change videos.
- Host can assign roles, transfer Host ownership, rename the room, and remove participants.
- Participants can request playback or video changes for approval.
- A Host cannot leave while another online participant is present; Host ownership must be transferred first.

The YouTube IFrame API controls each browser's local player. The server broadcasts the desired state, and each client loads the shared video and applies the shared position and play/pause state.

## Important WebSocket Events

| Event | Direction | Purpose |
| --- | --- | --- |
| `join_room` | Client to server | Join an existing room and receive the current state |
| `leave_room` | Client to server | Leave a room after permission checks |
| `play` / `pause` | Client to server | Update shared playback state |
| `seek` | Client to server | Update shared playback position |
| `change_video` | Client to server | Change the shared YouTube video |
| `assign_role` | Client to server | Host changes a participant role |
| `transfer_host` | Client to server | Transfer Host ownership |
| `request_control` | Client to server | Participant requests an action |
| `approve_request` | Client to server | Host or Moderator approves or rejects a request |
| `chat_message` | Client to server | Store and broadcast room chat |
| `sync_state` | Server to clients | Broadcast the authoritative room state |
| `user_joined` / `user_left` | Server to clients | Update room membership |

## Code Walkthrough

### Frontend: `src/App.jsx`

- Owns the room UI and local React state.
- Creates and maintains the WebSocket connection.
- Loads the YouTube IFrame API.
- Sends Host or Moderator actions to the backend.
- Renders role-based controls and approval requests.
- Persists the room code in `localStorage` and the tab identity in `sessionStorage`.

### Backend: `server.js`

- Creates the Express HTTP server and WebSocket server on the same port.
- Exposes `/health` and `POST /api/rooms`.
- Maintains room state and connected users in memory.
- Validates permissions before changing state.
- Broadcasts room snapshots after accepted events.
- Keeps a disconnected user available for a short reconnect window.

### Configuration: `netlify.toml`

- Runs `npm run build` on Netlify.
- Publishes the `dist` directory.
- Redirects frontend routes to `index.html` for SPA navigation.

## Demo Evidence

For a short assignment demo, show these flows:

1. Open the home page and create a named room.
2. Open the room link in a second browser window.
3. Show the second user joining as Participant.
4. Change the video or press play as Host and show the synchronized state.
5. Promote the second user to Host using the crown action.
6. Send a chat message from the Participant and show it in both windows.
7. Open Room settings and rename the room as Host.
8. Transfer Host before leaving the room.

Screenshots or a short screen recording can be added to this README later under a `docs/` directory.

## Build Check

```bash
npm run build
```

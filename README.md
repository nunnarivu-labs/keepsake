# Keepsake

Keepsake is a small, local conversation archive viewer. Load a JSON export to browse messages in a quiet, searchable interface. Filter by platform, person, or date, and scroll through long archives with virtualized message rendering.

## Features

- Automatically loads `public/chat.json` when the app starts, if the file exists.
- Open a JSON archive from anywhere on your device with **Open file**.
- Search message text, sender names, and platform names. Press **⌘K** on macOS or **Ctrl+K** on other platforms to focus search.
- Filter by platform, sender, and local calendar date. Use **Clear filters** to reset the filters and search.
- Shows message dates and times in your browser's local timezone.
- Runs in the browser; the app does not send archive contents to a server.

## Getting started

You'll need Node.js and npm installed.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite (usually `http://localhost:5173`). To load an archive automatically, put it at `public/chat.json` before starting or refreshing the app. You can also select a JSON file with the **Open file** button while the app is running.

## Chat file format

The file must contain a JSON array. Each message needs a numeric `timestamp` in **milliseconds since the Unix epoch**, a `sender` string, and a `message` string. The optional `platform` field can be `"WhatsApp"` or `"Instagram"`.

```json
[
  {
    "timestamp": 1735689600000,
    "sender": "Jordan",
    "platform": "WhatsApp",
    "message": "Happy New Year!"
  },
  {
    "timestamp": 1735690200000,
    "sender": "Sam",
    "message": "You too ✨"
  }
]
```

Messages are displayed in the order they appear in the array. The viewer does not sort them, so provide the messages in the order you want to browse. Messages whose sender is `"System"` are displayed as centered system events. Messages from `"Sushmita"` are styled on the right side of the conversation.

Invalid JSON or entries that do not match the required fields are rejected with an error message. When loading a file from disk, the app reads it in the browser. When using `public/chat.json`, the file is served by the local Vite development server as part of the app; keep private archives out of any public deployment unless you intend to publish them.

## Available commands

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite development server. |
| `npm run build` | Type-check the app and create a production build in `dist/`. |
| `npm run preview` | Serve the production build locally for a preview. Run `npm run build` first. |
| `npm run lint` | Run Oxlint on the project. |

## Tech stack

- React 19 and TypeScript
- Vite for development and production builds
- Oxlint for linting

## Project structure

```text
public/       Static files; put the default archive at public/chat.json
src/App.tsx   Conversation viewer, loading, search, filters, and virtualized list
src/App.css   Viewer layout and responsive styles
src/index.css Global styles and typography
```

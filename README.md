# Keepsake

Keepsake is a small, local conversation archive viewer. Load a JSON export to browse messages in a quiet, searchable interface. Filter by platform or person, jump to a date, and scroll through long archives with virtualized message rendering.

<img width="1382" height="817" alt="Screenshot 2026-11-09 at 22 07 38" src="https://github.com/user-attachments/assets/673e2790-e77c-4a07-8c7f-40a3674095bb" />
<br><br>
<img width="1380" height="813" alt="Screenshot 2026-11-09 at 22 10 12" src="https://github.com/user-attachments/assets/acb7895d-d252-4aa9-a50f-e52fd5f722fd" />

## Features

- Start with an empty archive and open a JSON file from anywhere on your device with **Open file**.
- Unload the current archive to clear the viewer and return to the empty state.
- Search message text, sender names, and platform names. Press **⌘K** on macOS or **Ctrl+K** on other platforms to focus search.
- Filter by platform and sender, or jump to the first message on a local calendar date. Use **Clear filters** to reset the filters and search.
- Virtualizes the filtered message list with TanStack Virtual, rendering only nearby rows and measuring messages as they appear. This keeps long archives responsive while supporting messages with different heights.
- Choose System, Light, or Dark themes. System mode follows your device preference and updates when it changes; Keepsake remembers your setting in this browser.
- Distinguishes WhatsApp, Instagram, Telegram, Signal, iMessage, and Discord messages with platform-specific bubble colors in both light and dark themes.
- Shows message dates and times in your browser's local timezone.
- Runs in the browser; the app does not send archive contents to a server.

<img width="1386" height="822" alt="Screenshot 2026-11-09 at 21 54 28" src="https://github.com/user-attachments/assets/901a3070-a11b-4a3b-bc0b-0f5dda11c88c" />
<br><br>
<img width="1382" height="820" alt="Screenshot 2026-11-09 at 21 55 27" src="https://github.com/user-attachments/assets/854ea184-c77e-4ad1-b3da-c50cd3824782" />

## Getting started

You'll need Node.js and npm installed.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite (usually `http://localhost:5173`), then choose a JSON file with **Open file**. Keepsake starts empty and reads the selected archive in your browser.

## Chat file format

Each file is a JSON array of messages with this TypeScript shape:

```ts
type ChatMessage = {
  timestamp: number // milliseconds since the Unix epoch
  sender: string
  message: string
  platform?: string
}

type ChatFile = ChatMessage[]
```

`timestamp`, `sender`, and `message` are required. `platform` is optional and can be any string. The labels `"WhatsApp"`, `"Instagram"`, `"Telegram"`, `"Signal"`, `"iMessage"`, and `"Discord"` (case-insensitive) receive distinct message bubble colors. Any other label or an empty value uses the default chat background. The included sample conversation contains messages from all six platforms.

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

Messages are displayed in the order they appear in the array. The viewer does not sort them, so provide the messages in the order you want to browse. Messages whose sender is `"System"` are displayed as centered system events. Other participants are aligned by first appearance: the first participant appears on the left, the second on the right, and additional participants alternate sides. Participant names and initials are read from the message data.

Invalid JSON or entries that do not match the required fields are rejected with an error message. The app reads selected files in the browser; archive contents are not sent to a server.

## Available commands

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite development server. |
| `npm run build` | Type-check the app and create a production build in `dist/`. |
| `npm run preview` | Serve the production build locally for a preview. Run `npm run build` first. |
| `npm run lint` | Run Oxlint on the project. |

## Tech stack

- React 19 and TypeScript
- TanStack Virtual for variable-height message list virtualization
- Tailwind CSS 4 for styling
- Vite for development and production builds
- Oxlint for linting

## Project structure

```text
public/       Static assets
src/App.tsx   Conversation viewer, loading, search, filters, theme, and virtualized list
src/index.css Tailwind theme tokens, typography, and message-list texture
```

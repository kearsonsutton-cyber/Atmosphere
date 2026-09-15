# Atmosphere

A Discord bot built with [discord.js](https://discord.js.org/).

## Setup

1. Install dependencies:

   ```powershell
   npm install
   ```

2. Configure your token:

   ```powershell
   Copy-Item .env.example .env
   ```

   Then open `.env` and set `DISCORD_TOKEN` to your bot token from the
   [Discord Developer Portal](https://discord.com/developers/applications).

3. Run the bot:

   ```powershell
   npm start
   ```

## Commands

| Command | Description        |
| ------- | ------------------ |
| `gm!emote <text>` | Deletes your message and reposts the text (with formatting) as the bot |
| `gm!undo` | Deletes the last message the bot posted on your behalf |
| `gm!edit` | Opens a modal to edit your last posted message; confirm to apply the new content |
| `gm!delete` | Shows a list of your posted messages; pick one to delete it |

## Notes

- `.env` is git-ignored so your token stays private. Only `.env.example` is committed.
- The **Message Content Intent** must be enabled in the Developer Portal for prefix commands to work.

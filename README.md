# Crazy_Batto · Discord Lounge

## Transfer status

This repository is a **clearly labeled reconstruction** from the original project outputs retained in the referenced conversation. The HTML, app logic and Discord data module were recovered from those outputs; the stylesheet's final section was reconstructed where the retained output ended mid-rule. This is not claimed as a byte-for-byte source export.

The original ROG mouse photo is **not stored in this repository**. The page references the existing Sites-hosted image at [the original asset](https://crazy-batto-discord-lounge.fine-trail-0499.chatgpt.site/assets/rog-anniversary-background.png). That URL may require access to the original private Site, so a public GitHub Pages deployment may not display the photo. The original file could not be exported from the previous environment here.

## Files

- `index.html`, `styles.css`, `app.mjs`, `discord-data.mjs`: Discord Lounge application source.
- `music-player.mjs`: browser based audio player with playlist, playback controls and drag-and-drop uploads.
- `ASSET_PROVENANCE.md`: image source and transfer limitation.
- No build step is required.

## Music player

The player accepts common audio files (including MP3) up to 80 MB each. Files and the playlist are saved in the visitor's browser with IndexedDB. A filename in the form `Artist - Title.mp3` fills in the artist and title automatically. Playback, seek, volume, shuffle, repeat and removing a title work in the browser.

This static version does not upload files to a shared online library. Each visitor sees only the files saved in their own browser. To let a friend upload songs that every visitor can hear, connect an online file store and configure its upload permissions. The original ROG mouse photo is not used as the music player's background.

## Behavior

The application uses Discord's public widget endpoint for the configured server, with visible loading and error states. It does not invent member data. It includes channel/member tabs, refresh, appearance settings stored in the browser, responsive layout and access to the original Discord widget.

Open `index.html` from a static web host. The browser must be able to reach Discord's public widget endpoint for live data.


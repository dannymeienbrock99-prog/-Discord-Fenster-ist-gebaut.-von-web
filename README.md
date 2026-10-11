# Crazy_Batto · Discord Lounge

This is a clearly labeled reconstruction from the project outputs retained in the referenced conversation. It is not a byte-for-byte export. The mouse background image is not used; the music player draws its artwork in CSS.

## Music player

The player accepts audio files up to 80 MB, supports playback, seeking, volume, shuffle, repeat and drag-and-drop. With no cloud settings, tracks are stored only in the current browser using IndexedDB.

To enable the shared, login-protected playlist:

1. Create a Supabase project and run [`supabase/music-schema.sql`](supabase/music-schema.sql) in its SQL Editor after replacing `you@example.com` and `friend@example.com` with the two lowercase account emails. Keep the real addresses in Supabase; do not commit them to this public repository.
2. In [`music-cloud-config.mjs`](music-cloud-config.mjs), set the project's URL and publishable key. The key is public browser configuration; never put a service-role or secret key in the website.
3. Open the website and create the two accounts. Confirm each account by email if confirmations are enabled. The database and private storage policies allow access only to those two listed emails. Users can remove only tracks they uploaded.

The SQL creates a private storage bucket, a track metadata table and row-level access policies. If you already use Supabase, review the script before running it; it creates namespaced `music_members`, `music_tracks` and `crazy-batto-music` resources.

## Files

- `index.html`, `styles.css`, `app.mjs`, `discord-data.mjs`: Discord Lounge and responsive player UI.
- `music-player.mjs`: local and shared playlist, authentication, uploads and playback.
- `music-cloud-config.mjs`: public project URL and publishable key configuration.
- `supabase/music-schema.sql`: database and private storage policies.
- `ASSET_PROVENANCE.md`: original image transfer note.

The project is static and has no build step. Deploy it to a static web host to use it. Updating this GitHub repository does not automatically publish the earlier Sites preview.


# Subtitle text integrity

## September 16 repair

The Clarity Act episode (`984539460c7d98686db24962`), local clip 2, began
with `flottement sur l` instead of `flottement sur l'IA`. The stored DailyVest
transcript already contained truncated words throughout 138.90-156.76 seconds.
The export bridge, UTF-8 ASS file and font were not stripping the apostrophe.

A targeted transcription of only those 17.86 seconds recovered the missing
text. That one source segment and its occurrence in `Transcript.rawText` were
corrected with strict old-value checks; timestamps and all other source text
were retained. The original source snapshot is stored in the `mood_audio`
volume at `/data/audio/clips-repair-20260916-clarity.json` (0600).
The regular read-only bridge then refreshed the Clips transcript cache.

Clip 2 is regenerated from its clean video and the corrected transcript,
retaining selection, durations, descriptions and user choices. Its prior media,
subtitle sidecars and metadata are backed up under the episode directory at
`subtitle-repair-20260916/`. The saved selection fingerprint is updated without
another editorial selection request. Other clip videos are not replaced.

## Alignment safeguard

Previously `anchor_words()` discarded words assigned a time slot of 15 ms or
less. This could delete a contraction such as `n'a` between contiguous acoustic
anchors. It now retains these words in the adjacent displayed cue, preserving
the original word order, spelling and punctuation. Comparison normalization is
only used for matching, never as displayed text. Alignment and style versions
are incremented to invalidate obsolete results on subsequent renders.

The account dashboard versions local preview URLs with the video's modification
time, so a refreshed page requests the corrected video rather than cached bytes.

## Verification

`tests/test_subtitles.py` checks apostrophes, French accents, zero-gap contractions,
edge words and UTF-8 ASS/SRT output. `tests/test_mobile_upload.py` also checks
preview URL invalidation after a corrected render. Before marking a repair done,
compare every aligned token to the source and inspect the actual exported frame.
This prevents alignment loss; it does not automatically correct ASR mistakes.

Deploy `subtitles.py` and `app.py` to `/opt/ft-clips` on Contabo and restart
`ft-clips.service` when no import/render is in progress. Prior code is backed up
at `/opt/ft-clips/backups/subtitles-20260916/`. Website GitHub deployment alone
does not deploy these service files to Contabo.

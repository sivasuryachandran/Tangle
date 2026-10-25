#!/usr/bin/env bash
# Mixes demo/music_lyria.mp3 (Lyria 3.5, generated from a prompt by demo/gen_music.py) under the narration:
# full level in the 5.6 s intro, then about half level, ducking under the voice. Keeps a copy without music in demo/out/.
set -euo pipefail; cd "$(dirname "$0")/.."
mkdir -p demo/out; cp demo/tangle_1min.mp4 demo/out/tangle_1min_nomusic.mp4
D=$(ffprobe -v error -show_entries format=duration -of csv=p=0 demo/out/tangle_1min_nomusic.mp4)
ffmpeg -y -v error -i demo/out/tangle_1min_nomusic.mp4 -i demo/music_lyria.mp3 -filter_complex \
"[0:a]asplit=2[v][sc];[1:a]atrim=0:$D,asetpts=N/SR/TB,aformat=sample_rates=48000:channel_layouts=stereo,volume='if(lt(t,5.6),1.0,if(lt(t,6.6),1.0-0.55*(t-5.6),0.45))':eval=frame,afade=t=in:d=0.8,afade=t=out:st=$(echo "$D-2.5"|bc):d=2.5[m];[m][sc]sidechaincompress=threshold=0.02:ratio=5:attack=60:release=700[md];[v][md]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.89[a]" \
-map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -ar 48000 -movflags +faststart demo/tangle_1min.mp4

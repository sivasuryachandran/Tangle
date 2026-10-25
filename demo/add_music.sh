#!/usr/bin/env bash
# Adds a soft synthesized ambient pad (generated here with ffmpeg sine tones, no third-party music) under the narration.
# Music plays at about half level and ducks under the voice. Input: demo/tangle_1min.mp4 (from assemble.py). Keeps a copy without music.
set -euo pipefail; cd "$(dirname "$0")/.."
D=$(ffprobe -v error -show_entries format=duration -of csv=p=0 demo/tangle_1min.mp4)
ffmpeg -y -v error -f lavfi -i "sine=f=110:d=$D" -f lavfi -i "sine=f=164.81:d=$D" -f lavfi -i "sine=f=220:d=$D" -f lavfi -i "sine=f=261.63:d=$D" -f lavfi -i "sine=f=329.63:d=$D" -f lavfi -i "sine=f=493.88:d=$D" \
 -filter_complex "[0]volume=0.9[a];[1]volume=0.6,tremolo=f=0.13:d=0.5[b];[2]volume=0.5,tremolo=f=0.21:d=0.4[c];[3]volume=0.35,tremolo=f=0.17:d=0.6[d];[4]volume=0.25,tremolo=f=0.11:d=0.7[e];[5]volume=0.12,tremolo=f=0.29:d=0.8[f];[a][b][c][d][e][f]amix=inputs=6:normalize=0,lowpass=f=1800,aecho=0.8:0.85:120|260:0.35|0.25,chorus=0.6:0.9:55:0.4:0.25:2,afade=t=in:d=2.5,afade=t=out:st=$(echo "$D-3"|bc):d=3,loudnorm=I=-28:TP=-6,aformat=sample_rates=48000:channel_layouts=stereo" demo/out/music.wav
cp demo/tangle_1min.mp4 demo/out/tangle_1min_nomusic.mp4
ffmpeg -y -v error -i demo/out/tangle_1min_nomusic.mp4 -i demo/out/music.wav -filter_complex \
 "[0:a]asplit=2[v][sc];[1:a]volume=1.6[m];[m][sc]sidechaincompress=threshold=0.03:ratio=6:attack=40:release=600[md];[v][md]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.89[a]" \
 -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 160k -ar 48000 -movflags +faststart demo/tangle_1min.mp4
